#!/usr/bin/env node
// .claude/hooks/architecture-status-guard.cjs
// UserPromptSubmit hook: reads docs/architecture.md, injects a reminder into the
// prompt context when the architecture exists but has NOT been independently
// validated (Status: Draft). This is the design-side analogue of
// srs-status-guard.cjs — it surfaces the "TL is gated until architecture is
// Validated" rule (CLAUDE.md §10 + .claude/rules/parallel-execution.md §4
// Architecture Validation gate + sub-agent-registry §3.11).
//
// Stays silent when:
//   - docs/architecture.md does not exist (SA hasn't run; nothing to gate), OR
//   - Status is Validated / Active / Superseded (gate open or moot).
// So it only speaks when Status: Draft — the window where TL must NOT start and
// the architecture-validator should run.
//
// Hook protocol (UserPromptSubmit): stdout text is appended to prompt context;
// exit 0 always (this is advisory, never blocking). Fail-open on any error.
//
// architecture.md content is passed through strip-fences before regex matching
// so a fenced "format reference" example doesn't shadow the real header.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ARCH_PATH = path.join(ROOT, 'docs/architecture.md');
const OPEN_STATES = new Set(['Validated', 'Active', 'Superseded']);

function readArch() {
  if (!fs.existsSync(ARCH_PATH)) return { exists: false };
  let content;
  try {
    content = stripFencedCodeBlocks(fs.readFileSync(ARCH_PATH, 'utf8'));
  } catch (e) {
    return { exists: false, error: e.message };
  }
  const head = content.slice(0, 4000);
  return {
    exists: true,
    status: parseHeaderField(head, 'Status'),
    validatedBy: parseHeaderField(head, 'Validated-by'),
    lastUpdated: parseHeaderField(head, 'Last-Updated'),
  };
}

async function main() {
  // Drain stdin so the parent doesn't hang; we don't need the event JSON.
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const arch = readArch();

  // No architecture yet → nothing to gate.
  if (!arch.exists) process.exit(0);

  // Gate open or moot → stay silent.
  if (arch.status && OPEN_STATES.has(arch.status)) process.exit(0);

  // Status is Draft (or missing on an existing file) → remind.
  process.stdout.write(
    `[architecture-status-guard] docs/architecture.md Status: ${arch.status || '(missing)'}` +
    (arch.lastUpdated ? `, Last-Updated: ${arch.lastUpdated}` : '') + `\n` +
    `Per CLAUDE.md §10 + .claude/rules/parallel-execution.md §4 (Architecture Validation gate):\n` +
    `the architecture has not been independently validated. Dispatch architecture-validator\n` +
    `(subagent_type: architecture-validator) against the Draft architecture. Only it may flip\n` +
    `Status -> Validated. TL task breakdown MUST NOT start until Status: Validated.\n`
  );
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`architecture-status-guard: error: ${err && err.stack || err}\n`);
  process.exit(0);
});
