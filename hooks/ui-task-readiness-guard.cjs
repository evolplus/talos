#!/usr/bin/env node
// .claude/hooks/ui-task-readiness-guard.cjs
// PreToolUse hook: refuses `plan-update.json` writes that propose
// `to_status: ready-for-deploy` for a UI-bearing task when the kit's mandatory
// closure artifacts are absent:
//   - docs/uiux/refs/<task-id>.md           (FE Dev's per-task design contract)
//   - docs/uiux/visual-specs/<task-id>.md   (QA-Author by-task's UI spec)
//   - docs/test-cases/by-task/<task-id>/    (QA-Author by-task's TC pack)
// The refs and visual-spec files must also contain the implementation-level
// design sections that prevent Figma field/item omission:
//   - refs:        ## Design Element Manifest + ## Implementation Trace Matrix
//   - visual spec: ## Design Element Assertions
//
// Motivation (per the 2026-06-04 FR-022 batch-UI silent-drop incident):
//   The kit defines a multi-gate chain between `design-confirmed` and Phase
//   closure. Each gate is documented as a Hard Rule or sub-agent exit-criterion,
//   but enforcement depends on the dispatch firing AND the agent finding the
//   artifact to check. When the Orchestrator's dispatch chain interleaves so
//   that an artifact-producing dispatch is skipped, the downstream gate that
//   would have checked against that artifact instead vacuously passes.
//
//   For T-168, NONE of {docs/uiux/refs/T-168.md, docs/uiux/visual-specs/T-168.md,
//   docs/test-cases/by-task/T-168/} existed at the moment FE Dev proposed
//   `ready-for-deploy`. The kit's safety net assumed-artifacts-exist; it lacked
//   a coherence gate that says "for every UI task, these N artifacts MUST exist
//   on disk BEFORE the task can transition `ready-for-deploy → in-test`."
//
// What "UI-bearing task" means here:
//   The hook reads the task file `docs/plan/<phase>/tasks/<task-id>.md` and
//   treats the task as UI-bearing if ANY of:
//     - Track is `fe` or `be+fe`
//     - `Design sub-status:` line is present (with any value)
//     - `Linked Surface:` is present with a non-sentinel value
//   A `Linked Surface:` / `Design sub-status:` value of `N/A`, `none`, `—`, etc.
//   — including a clarifying parenthetical like `N/A (schema-only)` — is NOT a
//   UI signal (the parenthetical is stripped before the sentinel check; ISSUE-024).
//   Conservative default: when the task file is unreadable, the hook ALLOWS
//   the write (we'd rather not block on parse errors); the operator can
//   investigate via session-init-summary.
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, cwd, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Per CLAUDE.md §10 Hard Rules + parallel-execution.md §4 design lifecycle.

'use strict';

const fs = require('fs');
const path = require('path');

function findProjectRoot(start) {
  // Walk up from `start` until we hit a `.git` dir or a `.claude` dir; that's
  // our project root. If we run off the top, give up.
  let cur = start;
  for (let i = 0; i < 20; i++) {
    if (!cur || cur === '/' || cur === '.') break;
    try {
      if (fs.existsSync(path.join(cur, '.claude')) || fs.existsSync(path.join(cur, '.git'))) {
        return cur;
      }
    } catch { /* ignore */ }
    cur = path.dirname(cur);
  }
  return null;
}

function projectRootFromWorktree(p) {
  // `<project-root>/.worktrees/<role>-<task-id>/...` — strip from .worktrees on.
  if (typeof p !== 'string') return null;
  const idx = p.indexOf('/.worktrees/');
  if (idx < 0) return null;
  return p.slice(0, idx);
}

function findTaskFile(projectRoot, taskId) {
  // The kit's three-level hierarchy: docs/plan/phase-NN-name/tasks/T-NNN.md
  // Scan for any phase directory that contains tasks/<task-id>.md.
  const planRoot = path.join(projectRoot, 'docs', 'plan');
  if (!fs.existsSync(planRoot)) return null;
  let phases = [];
  try { phases = fs.readdirSync(planRoot); } catch { return null; }
  for (const phase of phases) {
    const candidate = path.join(planRoot, phase, 'tasks', taskId + '.md');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readTaskMeta(taskFile) {
  let content = '';
  try { content = fs.readFileSync(taskFile, 'utf8'); } catch { return null; }
  // Read header block only (everything up to the first H2).
  const lines = content.split(/\r?\n/);
  const headLines = [];
  for (let i = 0; i < Math.min(lines.length, 120); i++) {
    if (/^##\s+/.test(lines[i])) break;
    headLines.push(lines[i]);
  }
  const head = headLines.join('\n');
  const track = (head.match(/^\s*-?\s*\**Track\**\s*:\s*([^\r\n]+)/im) || [])[1] || '';
  const designSubStatus = (head.match(/^\s*-?\s*\**Design[\s-]*sub[\s-]*status\**\s*:\s*([^\r\n]+)/im) || [])[1] || '';
  const linkedSurface = (head.match(/^\s*-?\s*\**Linked[\s-]*Surface\**\s*:\s*([^\r\n]+)/im) || [])[1] || '';
  return {
    track: track.trim().toLowerCase(),
    designSubStatus: designSubStatus.trim().toLowerCase(),
    linkedSurface: linkedSurface.trim(),
  };
}

// Sentinel values that mean "no UI surface" for the `Linked Surface:` and
// `Design sub-status:` header fields. Compared after normalizeSurface().
const NON_UI_SENTINELS = new Set(['', 'n/a', 'na', 'none', 'no', '—', '-', '–', 'tbd', 'null', 'nil']);

// Normalize a task-header value before the non-UI-sentinel check.
//
// TL task files routinely append a clarifying parenthetical to N/A, e.g.
//   `Linked Surface: N/A (schema-only)`
//   `Linked Surface: N/A (boot-time validator; no UI surface)`
//   `Linked Surface: N/A (server middleware behavior change)`
// A raw `=== 'n/a'` check fails on those, so the hook used to misclassify
// schema-only / boot-time / middleware infra tasks as UI-bearing (ISSUE-024).
// We strip everything from the first '(' onward, then trim + lowercase, so the
// parenthetical clarifier no longer defeats the sentinel match.
function normalizeSurface(v) {
  if (typeof v !== 'string') return '';
  return v.split('(')[0].trim().toLowerCase();
}

function isNonUISentinel(v) {
  return NON_UI_SENTINELS.has(normalizeSurface(v));
}

function isUITask(meta) {
  if (!meta) return false;
  // Strong signals — an explicit, non-sentinel Design sub-status or Linked
  // Surface means the task carries a UI surface. Parenthetical clarifiers on a
  // sentinel value (e.g. `N/A (schema-only)`) are NOT a UI signal.
  if (meta.designSubStatus && !isNonUISentinel(meta.designSubStatus)) return true;
  if (meta.linkedSurface && !isNonUISentinel(meta.linkedSurface)) return true;
  // Track-based fallback: fe / be+fe / fe+be / fe&be etc.
  const t = meta.track;
  if (/(^|[^a-z])fe([^a-z]|$)/i.test(t)) return true;
  return false;
}

function checkArtifacts(projectRoot, worktreeRoot, taskId) {
  // For each required artifact, check whether it exists at any of:
  //   - worktree/<artifact>
  //   - projectRoot/<artifact>
  const checks = [
    {
      label: 'FE design contract',
      relPaths: ['docs/uiux/refs/' + taskId + '.md'],
      kind: 'file',
      doc: 'FE Dev produces this per task. parallel-execution.md §4 Step 5.',
      requiredHeadings: ['Design Element Manifest', 'Implementation Trace Matrix'],
    },
    {
      label: 'QA-Author visual spec',
      relPaths: ['docs/uiux/visual-specs/' + taskId + '.md'],
      kind: 'file',
      doc: 'QA-Author by-task produces this. sub-agent-registry.md §3.4.',
      requiredHeadings: ['Design Element Assertions'],
    },
    {
      label: 'QA-Author by-task TC pack',
      relPaths: ['docs/test-cases/by-task/' + taskId + '/', 'docs/test-cases/by-task/' + taskId + '.md'],
      kind: 'dir-or-file',
      doc: 'QA-Author by-task produces at least one TC file per task. sub-agent-registry.md §3.4.',
    },
  ];

  const missing = [];
  const incomplete = [];
  const found = [];
  for (const c of checks) {
    let hit = null;
    for (const rel of c.relPaths) {
      const candidates = [];
      if (worktreeRoot) candidates.push(path.join(worktreeRoot, rel));
      if (projectRoot)  candidates.push(path.join(projectRoot,  rel));
      candidates.push(rel);
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) {
            const stat = fs.statSync(candidate);
            if (c.kind === 'file' && stat.isFile()) { hit = candidate; break; }
            if (c.kind === 'dir-or-file') {
              if (stat.isDirectory()) {
                // require at least one entry
                const entries = fs.readdirSync(candidate).filter(e => !e.startsWith('.'));
                if (entries.length > 0) { hit = candidate; break; }
              } else if (stat.isFile()) {
                hit = candidate; break;
              }
            }
          }
        } catch { /* keep looking */ }
      }
      if (hit) break;
    }
    if (hit) {
      const missingHeadings = [];
      if (c.requiredHeadings && c.requiredHeadings.length && c.kind === 'file') {
        let content = '';
        try { content = fs.readFileSync(hit, 'utf8'); } catch { content = ''; }
        for (const heading of c.requiredHeadings) {
          const re = new RegExp('^#{2,6}\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'im');
          if (!re.test(content)) missingHeadings.push(heading);
        }
      }
      if (missingHeadings.length) incomplete.push({ ...c, hit, missingHeadings });
      else found.push({ ...c, hit });
    } else missing.push(c);
  }
  return { missing, incomplete, found };
}

async function main() {
  if (process.env.CLAUDE_SKIP_UI_READINESS_CHECK === '1') {
    process.stderr.write(
      'ui-task-readiness-guard: CLAUDE_SKIP_UI_READINESS_CHECK=1 — bypass active.\n' +
      '  Use sparingly. Document rationale in the task file Notes section.\n'
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
    process.stderr.write('ui-task-readiness-guard: malformed event JSON: ' + e.message + '\n');
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};

  // Only fire on Write to a path whose basename is `plan-update.json`.
  if (toolName !== 'Write') process.exit(0);
  const filePath = toolInput.file_path || '';
  if (!filePath || path.basename(filePath) !== 'plan-update.json') process.exit(0);

  // Parse the proposed plan-update.json content. It MUST be in tool_input.content.
  let proposed;
  try { proposed = JSON.parse(toolInput.content || '{}'); }
  catch {
    // Malformed JSON — let plan-update-validator.cjs handle that.
    process.exit(0);
  }
  if (!proposed || typeof proposed !== 'object') process.exit(0);

  const toStatus = (proposed.to_status || '').toString().trim().toLowerCase();
  if (toStatus !== 'ready-for-deploy') process.exit(0);

  const taskId = (proposed.task_id || '').toString().trim();
  if (!taskId) process.exit(0); // plan-update-validator will catch this

  // Resolve project root.
  const cwd = event.cwd || '';
  let worktreeRoot = null;
  let projectRoot = null;
  if (cwd) {
    const idx = cwd.indexOf('/.worktrees/');
    if (idx >= 0) {
      projectRoot = cwd.slice(0, idx);
      // worktreeRoot = path through first segment after .worktrees/
      const after = cwd.slice(idx + '/.worktrees/'.length);
      const slash = after.indexOf('/');
      const worktreeName = slash >= 0 ? after.slice(0, slash) : after;
      worktreeRoot = path.join(projectRoot, '.worktrees', worktreeName);
    }
  }
  if (!projectRoot) projectRoot = projectRootFromWorktree(filePath);
  if (!projectRoot) projectRoot = findProjectRoot(path.dirname(filePath)) || findProjectRoot(cwd);
  if (!projectRoot) process.exit(0); // can't locate kit context — pass

  // Locate task file.
  const taskFile = findTaskFile(projectRoot, taskId);
  if (!taskFile) process.exit(0); // can't find task — pass (plan-consistency-validator handles)

  const meta = readTaskMeta(taskFile);
  if (!isUITask(meta)) process.exit(0);

  // UI task — verify the three artifacts.
  const { missing, incomplete } = checkArtifacts(projectRoot, worktreeRoot, taskId);
  if (missing.length === 0 && incomplete.length === 0) process.exit(0);

  const role = (proposed.agent || '').toString().trim();
  const role_disp = role || 'fe-dev';

  process.stderr.write(
    'ui-task-readiness-guard: BLOCKED — plan-update.json proposing ' +
    '`to_status: ready-for-deploy` for UI task ' + taskId + ' but mandatory closure artifacts are missing or incomplete.\n\n' +
    '  Missing artifacts (' + missing.length + '/3):\n' +
    missing.map(c =>
      '    - ' + c.label + '\n' +
      '        Expected: ' + c.relPaths.join(' OR ') + '\n' +
      '        Owner: ' + c.doc
    ).join('\n') + '\n\n' +
    '  Incomplete artifacts (' + incomplete.length + '):\n' +
    incomplete.map(c =>
      '    - ' + c.label + '\n' +
      '        Found: ' + c.hit + '\n' +
      '        Missing sections: ' + c.missingHeadings.map(h => '## ' + h).join(', ')
    ).join('\n') + '\n\n' +
    '  Per CLAUDE.md §10 Hard Rule "Design-implementation symmetry":\n' +
    '    For UI-bearing tasks, the absence of any of these artifacts is a\n' +
    '    closure-blocker, NOT a vacuous pass. The same applies to refs/visual\n' +
    '    specs that exist but lack Design Element Manifest / Assertions sections.\n' +
    '    The kit cannot satisfy discipline by skipping the field/item-level\n' +
    '    contract that FE Dev must implement.\n\n' +
    '  Background — 2026-06-04 FR-022 batch-UI incident:\n' +
    '    T-168 closed `done` with zero of these artifacts on disk. FE Dev shipped\n' +
    '    3 of 4 DoD scopes; the 4th (batch UI) was silently dropped. Phase 22\n' +
    '    closed because each gate vacuously passed against missing artifacts.\n\n' +
    '  Correct procedure (' + role_disp + '):\n' +
    '    1. Halt the `ready-for-deploy` proposal.\n' +
    '    2. Surface the missing-artifact set in the Orchestrator return.\n' +
    '    3. Orchestrator dispatches the owning agent(s) to produce the artifact(s):\n' +
    '         FE design contract → re-dispatch fe-dev (with Frozen step and manifest trace)\n' +
    '         Visual spec / by-task TC pack → dispatch qa-author in `by-task` mode\n' +
    '    4. Once the artifact set is complete, re-emit plan-update.json.\n\n' +
    '  Escape hatch (operator-explicit only): export CLAUDE_SKIP_UI_READINESS_CHECK=1\n' +
    '  Document the rationale in the task file Notes section.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('ui-task-readiness-guard: unexpected error: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
