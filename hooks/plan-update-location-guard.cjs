#!/usr/bin/env node
// .claude/hooks/plan-update-location-guard.cjs
// PreToolUse hook: refuses Write/Edit/MultiEdit/NotebookEdit on any file
// matching `plan-update*.json` when the path is OUTSIDE a sub-agent worktree.
//
// Per CLAUDE.md §10 + .claude/rules/worktree-isolation.md §5: `plan-update.json`
// is a transient handoff artifact that lives ONLY at
// `.worktrees/<role>-<task-id>/plan-update.json`. The Orchestrator reads it,
// ingests its content into `docs/plan/`, then cleans up the worktree. Any
// `plan-update*.json` at project root (or anywhere outside `.worktrees/`) is
// leakage — a bug we want to refuse early so root never accumulates stragglers.
//
// What this matches:
//   - `plan-update.json`               (canonical name)
//   - `plan-update-T-001.json`         (suffixed variant agents sometimes adopt)
//   - `plan-update-2026-05-31.json`    (any *.json starting with `plan-update`)
//
// Decision logic:
//   1. Path basename does NOT start with `plan-update` and end with `.json` -> allow.
//   2. Path is inside a `.worktrees/<*>/` segment -> allow (sub-agent context; canonical home).
//   3. CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1 escape hatch -> allow with stderr warning.
//   4. Else -> BLOCK with exit 2.
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr shown to agent)

'use strict';

const WORKTREE_RE = /(^|\/)\.worktrees\/[^\/]+\//;
const PLAN_UPDATE_RE = /(^|\/)plan-update[^\/]*\.json$/;

function isInWorktree(p) {
  return typeof p === 'string' && WORKTREE_RE.test(p);
}

function isPlanUpdatePath(p) {
  return typeof p === 'string' && PLAN_UPDATE_RE.test(p);
}

function extractPaths(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return [toolInput.file_path, toolInput.notebook_path].filter(Boolean);
    default:
      return [];
  }
}

async function main() {
  // Escape hatch -- rare operator-explicit override.
  if (process.env.CLAUDE_ALLOW_PLAN_UPDATE_ROOT === '1') {
    process.stderr.write(
      'plan-update-location-guard: CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1 set -- bypass active.\n' +
      '  Use sparingly. Document rationale in SRS §10 Changelog.\n'
    );
    process.exit(0);
  }

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`plan-update-location-guard: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const candidates = extractPaths(toolName, toolInput);

  for (const p of candidates) {
    if (!isPlanUpdatePath(p)) continue;          // not a plan-update file -- not our concern
    if (isInWorktree(p)) continue;                // sub-agent worktree -- canonical home, allow
    // BLOCK
    process.stderr.write(
      `plan-update-location-guard: BLOCKED -- ${toolName} on ${p}.\n` +
      `  CLAUDE.md §10 + worktree-isolation.md §5: \'plan-update.json\' lives ONLY at\n` +
      `    .worktrees/<role>-<task-id>/plan-update.json\n` +
      `  Writing it outside .worktrees/ leaves transient artifacts at project root,\n` +
      `  which the Orchestrator does not auto-ingest from. Sub-agents always operate\n` +
      `  inside their own worktree per the kit\'s isolation invariant.\n\n` +
      `  Correct approach:\n` +
      `    1. If you are a sub-agent: verify your cwd is .worktrees/<role>-<task-id>/. The\n` +
      `       file_path should be relative to that worktree (just \'plan-update.json\')\n` +
      `       OR an absolute path inside .worktrees/.\n` +
      `    2. If you are the Orchestrator: do NOT write plan-update.json yourself. Ingest\n` +
      `       what the sub-agent emitted, then clean up the worktree per §5 rule 7.\n\n` +
      `  Escape hatch (rare -- one-off operator ops): export CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1\n` +
      `  Document rationale in SRS §10 Changelog.\n`
    );
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`plan-update-location-guard: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
