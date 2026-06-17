#!/usr/bin/env node
// .claude/hooks/orchestrator-write-guard.cjs
// PreToolUse hook: enforces the kit's logical role-ownership invariant for
// Write/Edit/MultiEdit/NotebookEdit tool calls.
//
// HISTORY (v0.3.2 — refactored to logical-ownership-first model).
//
// The kit's earlier design assumed sub-agents would run from
// .worktrees/<role>-<task-id>/ cwd, and this hook distinguished
// Orchestrator-vs-sub-agent by checking the cwd path segment. That assumption
// breaks against Claude Code's actual Task tool surface: Task accepts no
// `cwd` parameter, sub-agents inherit the harness cwd (project root), and
// Task's `isolation: worktree` option creates a Claude-internal worktree
// path that doesn't match the kit's `.worktrees/` convention. The result:
// every doc-writing sub-agent dispatch hit the wall on its first write,
// because the harness cwd was project-root and the path was not in the
// thin Orchestrator allow-list.
//
// The fix lifts the role-ownership map (formerly embedded here as
// error-message hints) into `.claude/hooks/lib/role-ownership.cjs` and
// makes it the PRIMARY gate signal:
//
//   - Path is a sub-agent-role-owned doc (BA's SRS, SA's architecture,
//     QA-Author's test cases, etc.) → ALLOW from any cwd.
//   - Path is a shared doc (docs/open-issues.md)                → ALLOW.
//   - Path is a project-root config (package.json, tsconfig.json, etc.)
//     owned by BE Dev / FE Dev / DevOps                          → ALLOW.
//   - Path is Orchestrator-only (docs/plan/, docs/iteration-plan/)
//     OR kit-internal (.claude/, CLAUDE.md, RELEASE-NOTES*.md)   → ALLOW
//     (Orchestrator-legitimate; cwd does not need to be a worktree).
//   - Path is a transient handoff inside .worktrees/             → ALLOW
//     (sub-agent emitting its plan-update.json or plan-proposal/).
//   - Path is upstream input (docs/requirements/)                → ALLOW
//     (PM-authored; the kit reads-only otherwise but doesn't refuse).
//   - Path is operator-only (.env, .env.local, etc.)             → BLOCK
//     (the operator edits these directly in a terminal — never via agent).
//   - Path is unknown                                            → BLOCK
//     (force the operator to classify per task-type-routing §11 and
//     either add the path to the ownership map OR use a different
//     dispatch route).
//
// Trade-off (documented in CLAUDE.md §10 + .claude/rules/worktree-isolation.md §5):
//   An Orchestrator manually editing docs/SRS.md from main cwd is now
//   allowed by this hook (because the path is BA-owned and any Write to
//   it is presumed a sub-agent dispatch result). The kit's prose Hard
//   Rule "Orchestrator does not perform sub-agent work" + the
//   dispatch-failure-fallback rule remain the gates for that case.
//   This is the same pattern docs/open-issues.md has always used (any
//   agent appends; no cwd-based gate).
//
// Escape hatch: CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1 permits a single
// dispatch with stderr warning. Use for genuine one-off operator-explicit
// writes to unrecognized paths.

'use strict';

const path = require('path');
const role = require(path.join(__dirname, 'lib', 'role-ownership.cjs'));

// Worktree-path detection — secondary signal, kept for sub-agents that DO
// explicitly write under .worktrees/<role>-<task-id>/ (typically BE Dev /
// FE Dev / QA-Exec when the Orchestrator pre-flights `git worktree add`).
const WORKTREE_RE = /(^|\/)\.worktrees\/[^\/]+\//;

function isInWorktree(p) {
  return typeof p === 'string' && WORKTREE_RE.test(p);
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

function decide(p) {
  // Returns { decision: 'allow' | 'block', reason, hint }
  if (typeof p !== 'string' || !p) return { decision: 'allow', reason: 'no path' };

  // Secondary signal — worktree-path passes immediately
  if (isInWorktree(p)) {
    return { decision: 'allow', reason: 'in .worktrees/ (sub-agent isolated write)' };
  }

  const owner = role.ownerOf(p);

  if (!owner) {
    // Unrecognized path — block with a "no role owns this" message
    return {
      decision: 'block',
      reason: 'unrecognized-path',
      hint: {
        role: '(unclassified)',
        mode: 'add a row to .claude/hooks/lib/role-ownership.cjs OR classify per .claude/rules/task-type-routing.md §11',
        kind: null,
      },
    };
  }

  switch (owner.kind) {
    case 'role-owned-doc':
    case 'shared-doc':
    case 'project-root-config':
    case 'transient':
    case 'upstream-input':
      return { decision: 'allow', reason: `${owner.kind} (owner: ${owner.role})` };

    case 'orchestrator-only':
    case 'kit-internal':
      return { decision: 'allow', reason: `${owner.kind} (Orchestrator-legitimate)` };

    case 'operator-only':
      // .env / secrets — refuse from any agent context
      return {
        decision: 'block',
        reason: 'operator-only',
        hint: owner,
      };

    case 'unknown-doc':
      // Path is under docs/ but doesn't match any specific role mapping
      return {
        decision: 'block',
        reason: 'unknown-doc',
        hint: owner,
      };

    default:
      // Defensive — new kinds added to the lib without a hook update
      return {
        decision: 'block',
        reason: `unhandled-kind:${owner.kind}`,
        hint: owner,
      };
  }
}

async function main() {
  if (process.env.CLAUDE_ALLOW_ORCHESTRATOR_WRITE === '1') {
    process.stderr.write(
      'orchestrator-write-guard: CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1 set — bypass active.\n' +
      '  This should be a rare operator-explicit edit. Document rationale in SRS §10 Changelog.\n' +
      '  For routine work: dispatch the appropriate sub-agent via Task tool.\n'
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
    process.stderr.write(`orchestrator-write-guard: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const candidates = extractPaths(toolName, toolInput);

  for (const p of candidates) {
    const verdict = decide(p);
    if (verdict.decision === 'allow') continue;

    // BLOCK
    const hint = verdict.hint || {};
    const reasonDetail = verdict.reason === 'operator-only'
      ? 'This path is reserved for the operator (.env / secrets / credentials).\n' +
        '  Agents never edit these — the operator manages them directly in their terminal.\n'
      : verdict.reason === 'unknown-doc'
        ? 'This is a docs/ path that no kit role owns. Either:\n' +
          '    (a) add a row to .claude/hooks/lib/role-ownership.cjs declaring the owning role; OR\n' +
          '    (b) move the file to a recognized role-owned path (per CLAUDE.md §1).\n'
        : 'This path is not in any kit role-ownership map AND is not Orchestrator-legitimate.\n' +
          '  Classify the request per .claude/rules/task-type-routing.md §11:\n' +
          '    Path A (SDLC)      — dispatch the owning sub-agent.\n' +
          '    Path B (non-SDLC)  — researcher / debugger / code-reviewer / oq-resolver / archaeologist.\n' +
          '    Path C (skill)     — direct skill invocation per .claude/skills/registry.md.\n' +
          '    Path D (inline)    — read-only Q&A only; no writes.\n';

    process.stderr.write(
      `orchestrator-write-guard: BLOCKED — ${toolName} on ${p}.\n` +
      `  Reason: ${verdict.reason}\n` +
      (hint.role ? `  Path owner: ${hint.role}${hint.mode ? ` (${hint.mode})` : ''}.\n` : '') +
      `\n` +
      `  ${reasonDetail}` +
      `\n` +
      `  Logical-ownership-first model (CLAUDE.md §10 + .claude/rules/worktree-isolation.md §5):\n` +
      `    - Role-owned docs (SRS, architecture, FRS, test cases, deploy reports, etc.) ALLOW\n` +
      `      from any cwd. The owning sub-agent's prose Hard Rules are the gate.\n` +
      `    - Orchestrator-only (docs/plan/, docs/open-issues.md, docs/iteration-plan/)\n` +
      `      ALLOW from Orchestrator context.\n` +
      `    - Source code (**/src/) requires physical .worktrees/<role>-<task-id>/ isolation\n` +
      `      (source-code-write-guard handles separately).\n\n` +
      `  Escape hatch (rare — one-off operator-explicit edit to an unrecognized path):\n` +
      `    export CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1  and document rationale in SRS §10 Changelog.\n`
    );
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`orchestrator-write-guard: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
