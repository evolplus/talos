#!/usr/bin/env node
// .claude/hooks/fe-dev-design-contract-guard.cjs
// PreToolUse hook: refuses FE Dev source writes when `docs/uiux/refs/<task-id>.md`
// is absent, its frontmatter does not declare `Status: Frozen`, or it lacks the
// Design Element Manifest / Implementation Trace Matrix sections.
//
// Motivation (per the 2026-06-04 FR-022 batch-UI silent-drop incident):
//   FE Dev's "Design Contract Hard Rule" — "Never start UI implementation while
//   docs/uiux/refs/<task-id>.md is Draft" — was prose-only with no enforcement.
//   For T-168, FE Dev wrote frontend code (Scopes B/C/D) without ever producing
//   the design contract file; nothing refused the writes; the task closed `done`
//   while the UI surface was silently incomplete.
//
// What this hook does:
//   - Detect sub-agent context via the `.worktrees/fe-dev-<task-id>/` path segment.
//   - On Write / Edit / MultiEdit / NotebookEdit to a frontend source path,
//     extract <task-id>, look for `docs/uiux/refs/<task-id>.md` at worktree
//     and project root, verify it exists, its header declares `Status: Frozen`,
//     and it contains `## Design Element Manifest` + `## Implementation Trace Matrix`.
//   - Refuse the write (exit 2) with a kit-aware message if any check fails.
//
// What this hook does NOT do:
//   - Block non-FE-Dev contexts (BE Dev, QA-Exec, Orchestrator). Those are
//     covered by source-code-write-guard.cjs and orchestrator-write-guard.cjs.
//   - Inspect Bash redirects (consistent with source-code-write-guard).
//   - Check anything outside frontend source paths.
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, cwd, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Per CLAUDE.md §10 Hard Rules + parallel-execution.md §4 design lifecycle Step 5
// + fe-dev.md § Design Contract.

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Frontend source extensions ───
const FE_SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
  '.css', '.scss', '.less',
  '.html',
  '.dart', '.swift', '.kt',
]);

const SRC_SEGMENT_RE = /(^|\/)src\//;
const E2E_SPEC_RE = /(^|\/)e2e\/.*\.(spec|test)\.(ts|tsx|js|jsx)$/;
const EXCLUDED_SEGMENTS = ['node_modules', 'dist', 'build', 'out', '.output', '.claude', 'docs', '.git'];

// fe-dev worktree detection: matches `<...>/.worktrees/fe-dev-<task-id>/<...>`
// <task-id> may contain letters, digits, dashes (e.g. T-168, T-FR021-DESIGN).
const FE_DEV_WORKTREE_RE = /\.worktrees\/fe-dev-([A-Za-z0-9][A-Za-z0-9_-]*?)(?:\/|$)/;

function hasFrontendExtension(p) {
  const lastDot = p.lastIndexOf('.');
  if (lastDot === -1) return false;
  return FE_SOURCE_EXTENSIONS.has(p.slice(lastDot).toLowerCase());
}

function isExcluded(p) {
  for (const seg of EXCLUDED_SEGMENTS) {
    if (p.includes('/' + seg + '/')) return true;
  }
  return false;
}

function isFrontendSourcePath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (isExcluded(p)) return false;
  if (!hasFrontendExtension(p)) return false;
  return SRC_SEGMENT_RE.test(p) || E2E_SPEC_RE.test(p);
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

function resolveContext(cwd, candidates) {
  const tryString = (s) => {
    if (typeof s !== 'string' || !s) return null;
    const m = s.match(FE_DEV_WORKTREE_RE);
    if (!m) return null;
    const taskId = m[1];
    const idx = s.indexOf('/.worktrees/');
    const projectRoot = idx >= 0 ? s.slice(0, idx) : null;
    // worktreeRoot ends right after `fe-dev-<task-id>`
    let worktreeRoot = null;
    if (projectRoot) {
      worktreeRoot = path.join(projectRoot, '.worktrees', 'fe-dev-' + taskId);
    }
    return { taskId, projectRoot, worktreeRoot };
  };
  let ctx = tryString(cwd);
  if (!ctx) {
    for (const p of candidates) {
      ctx = tryString(p);
      if (ctx) break;
    }
  }
  return ctx;
}

// ─── Frozen check ───
function readsFrozen(content) {
  if (typeof content !== 'string') return false;
  const lines = content.split(/\r?\n/);
  const head = [];
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    head.push(lines[i]);
    if (/^##\s+/.test(lines[i])) break;
  }
  const headerBlob = head.join('\n');
  return /^\s*-?\s*\**Status\**\s*:\s*Frozen\b/im.test(headerBlob);
}

function missingRequiredHeadings(content) {
  const required = ['Design Element Manifest', 'Implementation Trace Matrix'];
  const missing = [];
  if (typeof content !== 'string') return required;
  for (const heading of required) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^#{2,6}\\s+' + escaped + '\\s*$', 'im');
    if (!re.test(content)) missing.push(heading);
  }
  return missing;
}

function checkDesignContract(projectRoot, taskId, worktreeRoot) {
  const candidates = [];
  if (worktreeRoot) candidates.push(path.join(worktreeRoot, 'docs', 'uiux', 'refs', taskId + '.md'));
  if (projectRoot)  candidates.push(path.join(projectRoot,  'docs', 'uiux', 'refs', taskId + '.md'));
  candidates.push(path.join('docs', 'uiux', 'refs', taskId + '.md'));

  let foundPath = null;
  let frozen = false;
  let missingHeadings = [];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        foundPath = c;
        const content = fs.readFileSync(c, 'utf8');
        frozen = readsFrozen(content);
        missingHeadings = missingRequiredHeadings(content);
        if (frozen && missingHeadings.length === 0) break;
      }
    } catch { /* keep looking */ }
  }
  return { foundPath, frozen, missingHeadings, candidates };
}

async function main() {
  // Escape hatch — operator-explicit override for non-UI FE tasks
  // (e.g., pure typescript refactor of an internal lib that has no UI surface).
  // Document rationale per task in the task file's Notes section.
  if (process.env.CLAUDE_SKIP_DESIGN_CONTRACT_CHECK === '1') {
    process.stderr.write(
      'fe-dev-design-contract-guard: CLAUDE_SKIP_DESIGN_CONTRACT_CHECK=1 — bypass active.\n' +
      '  Use only for non-UI FE tasks (pure refactor / no design surface).\n' +
      '  Document rationale in the task file Notes section.\n'
    );
    process.exit(0);
  }

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try { event = JSON.parse(raw); }
  catch (e) {
    process.stderr.write('fe-dev-design-contract-guard: malformed event JSON: ' + e.message + '\n');
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const cwd = event.cwd || '';
  const candidates = extractPaths(toolName, toolInput);

  const ctx = resolveContext(cwd, candidates);
  if (!ctx) process.exit(0); // not an fe-dev worktree context — not our concern

  const feSourcePath = candidates.find(isFrontendSourcePath);
  if (!feSourcePath) process.exit(0); // fe-dev cwd but writing docs / config / non-FE — pass

  const { foundPath, frozen, missingHeadings, candidates: lookupPaths } = checkDesignContract(
    ctx.projectRoot, ctx.taskId, ctx.worktreeRoot
  );

  if (frozen && missingHeadings.length === 0) process.exit(0);

  let reason;
  if (!foundPath) {
    reason = 'Did not find docs/uiux/refs/' + ctx.taskId + '.md at any of:\n' +
      lookupPaths.map(c => '    ' + c).join('\n');
  } else if (!frozen) {
    reason = 'Found ' + foundPath + ' but its header does not declare `Status: Frozen`.';
  } else {
    reason = 'Found ' + foundPath + ' and it is Frozen, but it is missing required sections: ' +
      missingHeadings.map(h => '## ' + h).join(', ') + '.';
  }

  process.stderr.write(
    'fe-dev-design-contract-guard: BLOCKED — FE Dev ' + toolName + ' on ' + feSourcePath + '.\n' +
    '  Task: ' + ctx.taskId + '\n' +
    '  Reason: per-task design contract is not Frozen and content-complete.\n' +
    '  ' + reason + '\n\n' +
    '  Per .claude/agents/_templates/fe-dev.md § Design Contract Hard Rules:\n' +
    '    "Never start UI implementation while `docs/uiux/refs/<task-id>.md` is `Draft`."\n' +
    '    The Frozen refs file must also include Design Element Manifest + Implementation Trace Matrix.\n\n' +
    '  Per CLAUDE.md §10 Hard Rules:\n' +
    '    "Design-implementation symmetry — artifact absence is a closure-blocker,\n' +
    '     not a vacuous pass."\n\n' +
    '  Correct procedure (parallel-execution.md §4 Step 5 + fe-dev.md):\n' +
    '    1. Read docs/uiux/handoffs/' + ctx.taskId + '.md (Designer\'s confirmed handoff).\n' +
    '    2. Use the Figma MCP server (read-only) to pull pinned nodes / tokens / snapshots.\n' +
    '    3. Verify the Figma file version matches the user-confirmed version in master plan.\n' +
    '    4. Write docs/uiux/refs/' + ctx.taskId + '.md with extracted tokens + node IDs +\n' +
    '       snapshot references + Design Element Manifest + Implementation Trace Matrix;\n' +
    '       set `Status: Frozen` once all checks pass.\n' +
    '    5. THEN proceed to source-code implementation.\n\n' +
    '  Escape hatch (non-UI FE tasks only): export CLAUDE_SKIP_DESIGN_CONTRACT_CHECK=1\n' +
    '  Document the rationale in the task file\'s Notes section.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('fe-dev-design-contract-guard: unexpected error: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
