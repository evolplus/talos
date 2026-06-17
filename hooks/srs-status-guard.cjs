#!/usr/bin/env node
// .claude/hooks/srs-status-guard.cjs
// UserPromptSubmit hook: reads docs/SRS.md, injects a reminder into the prompt
// context when SRS Status is anything other than `Signed-off`.
//
// Hook protocol (UserPromptSubmit):
//   - stdin: event JSON (we don't need it)
//   - stdout: text appended to the user's prompt context
//   - exit 0: allow (text is added)
//   - exit 2: blocks the prompt (we never use this)
//
// Stays silent when SRS Status = Signed-off, so it doesn't pollute every prompt
// after the gate is open.
//
// File content is passed through strip-fences before regex matching so any
// fenced "format reference" example in the SRS doesn't shadow the real header.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SRS_PATH = path.join(ROOT, 'docs/SRS.md');

function readSrs() {
  if (!fs.existsSync(SRS_PATH)) return { exists: false };
  let content;
  try {
    content = stripFencedCodeBlocks(fs.readFileSync(SRS_PATH, 'utf8'));
  } catch (e) {
    return { exists: false, error: e.message };
  }
  // Status header lives near the top of the file. parseHeaderField tolerates
  // markdown bold (**Status:**) and other variants the kit templates use.
  const head = content.slice(0, 4000);
  return {
    exists: true,
    status: parseHeaderField(head, 'Status'),
    lastUpdated: parseHeaderField(head, 'Last-Updated'),
  };
}

async function main() {
  // Drain stdin so the parent doesn't hang; we don't need the event JSON.
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const srs = readSrs();

  if (!srs.exists) {
    process.stdout.write(
      `[srs-status-guard] docs/SRS.md not found.\n` +
      `Per CLAUDE.md §2 SRS Sign-off Protocol: only the BA may run for a new project — BA's first job is to ingest the SRS.\n`
    );
    process.exit(0);
  }

  if (srs.status === 'Signed-off') {
    // Gate is open — stay silent.
    process.exit(0);
  }

  process.stdout.write(
    `[srs-status-guard] SRS Status: ${srs.status || '(missing)'}` +
    (srs.lastUpdated ? `, Last-Updated: ${srs.lastUpdated}` : '') + `\n` +
    `Per CLAUDE.md §10 Hard Rules: "No downstream work while SRS Status ≠ Signed-off."\n` +
    `Only the BA sub-agent may run until BA sets Status = Signed-off (CLAUDE.md §2).\n`
  );
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`srs-status-guard: error: ${err && err.stack || err}\n`);
  process.exit(0);
});
