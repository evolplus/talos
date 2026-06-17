#!/usr/bin/env node
// .claude/hooks/open-issues-triage-gate.cjs
// UserPromptSubmit hook: reads docs/open-issues.md, parses entries, injects a
// reminder into the prompt context when any entry is in `State: open`.
//
// Per CLAUDE.md §6: docs/open-issues.md is a gate, not a log. Open entries
// block all new dispatches until triaged (resolved | deferred | promoted).
//
// Entry format expected (per §6):
//   ### ISSUE-<id> — <title>
//   - Date: ...
//   - State: open | resolved | deferred | promoted
//
// Hook stays silent when no open entries exist. Fenced-code blocks inside
// the file (e.g., example templates) are stripped before parsing so they
// don't trigger false-positive "open issue" matches.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const OI_PATH = path.join(ROOT, 'docs/open-issues.md');

function parseIssues(content) {
  // Split on each `### ISSUE-` header. First chunk before any header is preamble.
  const issues = [];
  const stripped = stripFencedCodeBlocks(content);
  const blocks = stripped.split(/\n(?=### ISSUE-)/);
  for (const block of blocks) {
    const idMatch = block.match(/^### ISSUE-(\S+)/m);
    const state = parseHeaderField(block, 'State');
    if (idMatch && state) {
      issues.push({
        id: idMatch[1],
        state: state.toLowerCase(),
      });
    }
  }
  return issues;
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  if (!fs.existsSync(OI_PATH)) {
    // No file yet — nothing to gate (typical for new project before BA runs).
    process.exit(0);
  }

  let content;
  try {
    content = fs.readFileSync(OI_PATH, 'utf8');
  } catch (e) {
    process.stderr.write(`open-issues-triage-gate: error reading file: ${e.message}\n`);
    process.exit(0);
  }

  const issues = parseIssues(content);
  const open = issues.filter(i => i.state === 'open');

  if (open.length === 0) {
    // Gate is clear.
    process.exit(0);
  }

  const ids = open.map(i => `ISSUE-${i.id}`).join(', ');
  process.stdout.write(
    `[open-issues-triage-gate] ${open.length} open issue(s) require triage before any new dispatch:\n` +
    `  ${ids}\n` +
    `Per CLAUDE.md §6: "An entry that is still 'open' (no decision) blocks all new dispatches. The Orchestrator must triage it first."\n` +
    `Each entry must transition to resolved | deferred | promoted before new work begins.\n`
  );
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`open-issues-triage-gate: error: ${err && err.stack || err}\n`);
  process.exit(0);
});
