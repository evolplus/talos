#!/usr/bin/env node
// .claude/hooks/master-plan-write-guard.cjs
// PreToolUse hook: refuses sub-agent writes to anything under docs/plan/.
//
// Per CLAUDE.md §10 Hard Rules: "No sub-agent writes directly to anything under
// docs/plan/ — proposals only via plan-update.json." Only the Orchestrator
// commits transitions (orchestrator-operating-rules.md §9).
//
// Sub-agent vs Orchestrator detection (path-based, no env var required):
//   - Path contains `.worktrees/<role>-<task-id>/` segment → sub-agent context → BLOCK.
//   - Path is `docs/plan/...` outside any worktree → Orchestrator context → ALLOW.
//   - Path not under `docs/plan/` → not our concern → ALLOW.
//
// Block-by-detection. The previous design (gate on CLAUDE_ORCHESTRATOR=1)
// silently blocked even the Orchestrator's writes because nothing reliably
// set that env var. The worktree-path signal is the kit's physical invariant
// per worktree-isolation.md §5 — sub-agents always write inside `.worktrees/`,
// the Orchestrator always writes from main repo root.
//
// The protected tree:
//   docs/plan/master-plan.md              (top-level shape)
//   docs/plan/phase-NN-name/phase.md      (per-phase)
//   docs/plan/phase-NN-name/tasks/T-NNN.md (per-task)
//
// Escape hatch: CLAUDE_ALLOW_PLAN_WRITE=1 permits a sub-agent's direct write
// (e.g., kit dogfooding scenarios where the Orchestrator role is acting from
// inside a worktree). Use sparingly; document rationale in SRS §10 Changelog.
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Note: this hook does not parse Bash commands. A Bash redirect like
//   `echo ... > docs/plan/master-plan.md` would still get through. That's an
//   explicit trade-off — Bash command parsing is brittle and the prose rule is
//   the authoritative control. The hook catches the common-case file-tool path.

'use strict';

// Detect sub-agent context — sub-agents operate inside `.worktrees/<role>-<task-id>/`
// per worktree-isolation.md §5. Anything else is Orchestrator context.
const WORKTREE_RE = /(^|\/)\.worktrees\/[^\/]+\//;

function isInWorktree(p) {
  return typeof p === 'string' && WORKTREE_RE.test(p);
}

// Match any path that begins with `docs/plan/` (with optional leading slash and prefix).
// Covers:
//   docs/plan/master-plan.md
//   docs/plan/phase-01-foundation/phase.md
//   docs/plan/phase-01-foundation/tasks/T-001.md
//   /repo/docs/plan/master-plan.md  (absolute path)
const TARGET_RE = /(^|\/)docs\/plan\//;

function isPlanFile(p) {
  return typeof p === 'string' && TARGET_RE.test(p);
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
  // Escape hatch for legitimate sub-agent writes (kit dogfooding, etc.).
  if (process.env.CLAUDE_ALLOW_PLAN_WRITE === '1') {
    process.stderr.write(
      'master-plan-write-guard: CLAUDE_ALLOW_PLAN_WRITE=1 set — bypass active.\n' +
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
    process.stderr.write(`master-plan-write-guard: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const candidates = extractPaths(toolName, toolInput);

  for (const p of candidates) {
    if (!isPlanFile(p)) continue;
    // docs/plan/ write detected. Distinguish Orchestrator from sub-agent by path.
    if (!isInWorktree(p)) continue;  // Orchestrator (main repo) — allow
    // Sub-agent attempting to write docs/plan/ inside its worktree — BLOCK.
    process.stderr.write(
      `master-plan-write-guard: BLOCKED — sub-agent ${toolName} on ${p}.\n` +
      `  CLAUDE.md §10 Hard Rule: "No sub-agent writes directly to anything under docs/plan/ — proposals only via plan-update.json."\n` +
      `  Path is inside a sub-agent worktree (.worktrees/<role>-<task-id>/), so this is sub-agent context.\n` +
      `  Only the Orchestrator commits master-plan transitions (.claude/rules/orchestrator-operating-rules.md §9).\n\n` +
      `  Correct approach (worktree-isolation.md §5):\n` +
      `    Emit a plan-update.json proposal at the root of your worktree:\n` +
      `      { "task_id": "T-NNN", "from_status": "...", "to_status": "...", "agent": "<role>", ... }\n` +
      `    The Orchestrator ingests it on dispatch return and commits the actual docs/plan/ update.\n\n` +
      `  Protected tree: docs/plan/master-plan.md, docs/plan/phase-NN-name/phase.md, docs/plan/phase-NN-name/tasks/T-NNN.md.\n` +
      `  Escape hatch (rare — kit dogfooding only): export CLAUDE_ALLOW_PLAN_WRITE=1\n`
    );
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`master-plan-write-guard: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
