#!/usr/bin/env node
// .claude/hooks/plan-consistency-validator.cjs
// PreToolUse hook: validates consistency between master-plan.md, phase.md files,
// and task T-NNN.md files when the Orchestrator writes to docs/plan/.
//
// Bug 3 fix: the project discrepancy showed master-plan.md claiming all phases
// "done" while phase.md files still showed "in-progress" with tasks at
// "ready-for-deploy". No hook caught the mismatch.
//
// Triggers for main-repo writes to the plan files below. Activation is
// path-based; CLAUDE_ORCHESTRATOR is intentionally not required. Writes inside
// .worktrees/ are skipped here and refused by master-plan-write-guard.cjs.
// Validates:
//   1. master-plan.md ↔ phase.md:  phase Status and task counts must agree
//   2. phase.md ↔ T-NNN.md:        task Status in phase table must match task file
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow (consistent or not a plan file)
//   - exit 2: block (inconsistency found)
//
// Fail-open on internal errors — the prose rule is the authoritative control.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField, headerPrelude } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const MASTER_PLAN_RE = /(^|\/)docs\/plan\/master-plan\.md$/i;
const PHASE_RE = /(^|\/)docs\/plan\/phase-\d+-[^/]+\/phase\.md$/i;

// Parse EVERY table row in a section (from its heading to the next heading).
// Returns array of objects keyed by the header names (lowercased, trimmed).
// `rows.fragments` = how many separate table blocks the section held.
//
// The old parser stopped at the first non-table line, so a `## Tasks` table
// interrupted by a blank line + a note paragraph silently counted only the
// first fragment (4Run phase-54 parsed 9 of 16 tasks and read green for days,
// ISSUE-236). A later fragment either repeats a header row (header + `|---|`)
// or continues bare rows under the last header; both are counted.
function parseMarkdownTable(content, sectionHeading) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');
  const headingRe = sectionHeading ? new RegExp(`^##+\\s+${sectionHeading}`, 'i') : null;
  const isSep = cells => cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
  const cellsOf = line => line.split('|').map(c => c.trim()).filter(c => c !== '');
  let inSection = !sectionHeading;
  let headers = null;
  let inTable = false;
  let fragments = 0;
  let firstShape = null;
  let foreign = false;
  const rows = [];

  for (let k = 0; k < lines.length; k++) {
    const t = lines[k].trim();
    if (!inSection) {
      if (headingRe.test(t)) inSection = true;
      continue;
    }
    if (/^#{1,6}\s/.test(t)) {
      if (sectionHeading) break;          // section ended
      if (headers) break;                  // no-heading mode: first table only
      continue;
    }
    if (!t.startsWith('|')) { inTable = false; continue; }
    // A bare continuation row after a FOREIGN table belongs to that table.
    const cells = cellsOf(t);
    if (isSep(cells)) continue;
    const next = (lines[k + 1] || '').trim();
    if (next.startsWith('|') && isSep(cellsOf(next))) {   // a header row
      const shape = cells.map(c => c.toLowerCase()).join('|');
      if (!headers) {
        headers = cells;
        firstShape = shape;
      }
      // Only a table with the SAME columns is another fragment of this table.
      // A differently-shaped table in the section (a coverage or dependency
      // table keyed by task id) is not task rows and must not be counted.
      foreign = shape !== firstShape;
      if (!foreign && !inTable) fragments++;
      inTable = true;
      continue;
    }
    if (!headers || foreign) continue;
    if (!inTable) { fragments++; inTable = true; }
    const row = {};
    headers.forEach((h, i) => { row[h.toLowerCase()] = cells[i] || ''; });
    rows.push(row);
  }
  rows.fragments = fragments;
  return rows;
}

// Remove Markdown presentation wrappers from schema values before comparing
// them. Mature plans commonly contain `**done**`, `__T-001__`, or backticked
// values even though the logical value is the unformatted text.
function normalizeMarkdownScalar(value) {
  let normalized = String(value || '').trim();
  let previous;
  do {
    previous = normalized;
    normalized = normalized
      .replace(/^\*\*([\s\S]*)\*\*$/, '$1')
      .replace(/^__([\s\S]*)__$/, '$1')
      .replace(/^\*([\s\S]*)\*$/, '$1')
      .replace(/^_([\s\S]*)_$/, '$1')
      .replace(/^`([\s\S]*)`$/, '$1')
      .trim();
  } while (normalized !== previous);
  return normalized;
}

function normalizeStatus(value) {
  return normalizeMarkdownScalar(value).toLowerCase();
}

// Derive phase status from its task statuses.
function computePhaseStatus(taskStatuses) {
  if (taskStatuses.length === 0) return 'not-started';
  const normalizedStatuses = taskStatuses.map(normalizeStatus);
  const cleanTerminal = new Set(['done', 'done-deprecated', 'cancelled']);
  const caveatTerminal = new Set([...cleanTerminal, 'failed']);

  if (
    normalizedStatuses.some(status => status === 'failed') &&
    normalizedStatuses.every(status => caveatTerminal.has(status))
  ) {
    return 'done-with-caveat';
  }

  const nonTerminal = normalizedStatuses.filter(status => !cleanTerminal.has(status));
  if (nonTerminal.length === 0) return 'done';
  const active = nonTerminal.filter(status => status !== 'not-started');
  if (active.length === 0) return 'not-started';
  return 'in-progress';
}

// Count done tasks from a list of status strings.
function countDone(taskStatuses) {
  return taskStatuses
    .map(normalizeStatus)
    .filter(status => status === 'done' || status === 'done-deprecated')
    .length;
}

// Read a file's content, returning null on failure.
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Read the Status field from a T-NNN.md task file.
function readTaskStatus(taskFilePath) {
  const content = readFileSafe(taskFilePath);
  if (!content) return null;
  const stripped = stripFencedCodeBlocks(content);
  const head = headerPrelude(stripped, 4000);
  return parseHeaderField(head, 'Status');
}

const TASK_ID_RE = /^T-\d+[a-z]?$/i;

// ISSUE-282: both checks were driven from the `## Tasks` table and never listed
// `tasks/`, so a task file with no row (orphan) was invisible — uncounted,
// unchecked, unreported — and a row with no file (phantom) was skipped
// silently. 4Run phase-53 carried 18 rows for 23 files, phase-54 34 for 40, and
// both read green because the master-plan count agreed with the equally wrong
// table. The directory listing is authoritative; compare the id sets.
// null = no filesystem side to compare: no tasks/ dir, or one with no task
// files at all (a plan kept inline in phase.md). Drift needs both sides.
function taskIdsOnDisk(phaseFolder) {
  try {
    const ids = fs.readdirSync(path.join(ROOT, 'docs', 'plan', phaseFolder, 'tasks'))
      .filter(n => n.endsWith('.md'))
      .map(n => n.slice(0, -3))
      .filter(id => TASK_ID_RE.test(id));
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function tableTaskIds(tasks) {
  return tasks.map(r => normalizeMarkdownScalar(r['task'])).filter(id => TASK_ID_RE.test(id));
}

// Orphans / phantoms for one phase; empty arrays when the dir is unreadable.
function idSetDrift(phaseFolder, tasks) {
  const disk = taskIdsOnDisk(phaseFolder);
  if (disk === null) return { orphans: [], phantoms: [] };
  const norm = id => id.toUpperCase();
  const rowIds = new Set(tableTaskIds(tasks).map(norm));
  const diskIds = new Set(disk.map(norm));
  return {
    orphans: disk.filter(id => !rowIds.has(norm(id))).sort(),
    phantoms: tableTaskIds(tasks).filter(id => !diskIds.has(norm(id))).sort(),
  };
}

function driftMessages(phaseFolder, drift) {
  const out = [];
  if (drift.orphans.length) {
    out.push(
      `phase ${phaseFolder}: task file(s) with NO row in phase.md \`## Tasks\`: ` +
      `${drift.orphans.join(', ')} — they are uncounted and unchecked; add a row per file`
    );
  }
  if (drift.phantoms.length) {
    out.push(
      `phase ${phaseFolder}: \`## Tasks\` row(s) with NO task file: ${drift.phantoms.join(', ')} — ` +
      `the plan asserts work that has no artifact; create tasks/<id>.md first, or remove the row`
    );
  }
  return out;
}

// Compute the post-write content for both Write and Edit ops.
function computeFinalContent(toolName, toolInput) {
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    const filePath = toolInput.file_path;
    if (!filePath || !fs.existsSync(filePath)) return null;
    const current = readFileSafe(filePath);
    if (current === null) return null;
    const oldStr = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newStr = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    if (!oldStr) return current;
    if (toolInput.replace_all) {
      return current.split(oldStr).join(newStr);
    }
    const idx = current.indexOf(oldStr);
    if (idx === -1) return current;
    return current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
  }
  return null;
}

// Validate master-plan.md against all phase.md files.
//
// ISSUE-236: every phase row was validated on every write, so ONE stale digit
// in an unrelated phase (phase-53 `0/16` vs 17 rows) made master-plan.md
// unwritable — including the ingestion that had to add tasks to phase 54 — and
// the refusal named the unrelated phase. Now a row blocks only if THIS write
// adds or changes it; drift in a row the write leaves byte-identical is
// reported as a warning (pre-existing, not introduced here) and the write
// proceeds. A brand-new master-plan (no prior file) has every row validated.
function phaseRowKey(row) {
  return normalizeMarkdownScalar(row['folder']).replace(/\/+$/, '');
}

function validateMasterPlan(content, priorContent) {
  const errors = [];
  const warnings = [];
  const phases = parseMarkdownTable(content, 'Phases');
  if (phases.length === 0) return { errors, warnings }; // no phases to validate

  const prior = new Map();
  if (typeof priorContent === 'string') {
    for (const r of parseMarkdownTable(priorContent, 'Phases')) {
      prior.set(phaseRowKey(r), JSON.stringify(r));
    }
  }

  for (const row of phases) {
    const folder = phaseRowKey(row);
    const declaredStatus = normalizeStatus(row['status']);
    const declaredTasks = normalizeMarkdownScalar(row['tasks']);

    if (!folder) continue;
    const touched = !prior.has(folder) || prior.get(folder) !== JSON.stringify(row);
    const sink = touched ? errors : warnings;

    const phasePath = path.join(ROOT, 'docs', 'plan', folder, 'phase.md');
    const phaseContent = readFileSafe(phasePath);
    if (phaseContent === null) {
      // Can't read phase file — skip (may not exist yet)
      continue;
    }

    const tasks = parseMarkdownTable(phaseContent, 'Tasks');
    const taskStatuses = tasks.map(task => normalizeStatus(task['status']));
    const computedStatus = computePhaseStatus(taskStatuses);
    const actualDone = countDone(taskStatuses);
    const total = taskStatuses.length;

    // Compare status
    if (declaredStatus && computedStatus !== declaredStatus) {
      sink.push(
        `master-plan says phase ${folder} is "${declaredStatus}" but ` +
        `phase.md computes "${computedStatus}" (from ${actualDone}/${total} done tasks)`
      );
    }

    // Compare task counts — master-plan typically says "X/Y done"
    const countMatch = declaredTasks.match(/(\d+)\/(\d+)/);
    if (countMatch) {
      const declaredDone = parseInt(countMatch[1], 10);
      const declaredTotal = parseInt(countMatch[2], 10);
      if (declaredDone !== actualDone) {
        sink.push(
          `master-plan says ${declaredDone}/${declaredTotal} done for phase ${folder} ` +
          `but phase.md has ${actualDone}/${total} done`
        );
      }
      if (declaredTotal !== total) {
        sink.push(
          `master-plan says ${declaredTotal} total tasks for phase ${folder} ` +
          `but phase.md has ${total} tasks`
        );
      }
    }

    // The count above is only as good as the table it counts. A row this write
    // touches is where the author is asserting a count, so an under-counting
    // table must surface here too.
    sink.push(...driftMessages(folder, idSetDrift(folder, tasks)));
  }

  return { errors, warnings };
}

// Validate a phase.md against its T-NNN.md task files.
function validatePhase(phaseFilePath, content) {
  const errors = [];
  const warnings = [];
  const tasks = parseMarkdownTable(content, 'Tasks');
  const phaseFolderForIds = path.basename(path.dirname(phaseFilePath));
  // This write IS the phase's own table, so id-set drift is fixed here or never.
  errors.push(...driftMessages(phaseFolderForIds, idSetDrift(phaseFolderForIds, tasks)));
  if (tasks.fragments > 1) {
    warnings.push(
      `phase.md \`## Tasks\` holds ${tasks.fragments} separate table fragments (a blank line or ` +
      `note interrupts the table); all ${tasks.length} rows are counted — keep the table contiguous`
    );
  }

  for (const row of tasks) {
    const taskId = normalizeMarkdownScalar(row['task']);
    const declaredStatus = normalizeStatus(row['status']);

    if (!taskId || !TASK_ID_RE.test(taskId)) continue;

    // Resolve the task file path against ROOT. The event's file_path may be
    // relative; we extract the phase folder name and reconstruct from ROOT.
    const phaseDir = path.dirname(phaseFilePath);
    const phaseFolderName = path.basename(phaseDir);
    const taskFilePath = path.join(ROOT, 'docs', 'plan', phaseFolderName, 'tasks', `${taskId}.md`);
    const actualStatus = readTaskStatus(taskFilePath);

    if (actualStatus === null) {
      // Can't read task file — skip
      continue;
    }

    if (normalizeStatus(actualStatus) !== declaredStatus) {
      errors.push(
        `phase.md says ${taskId} is "${declaredStatus}" but ` +
        `${taskId}.md says "${normalizeStatus(actualStatus)}"`
      );
    }
  }

  return { errors, warnings };
}

// Detect sub-agent context — sub-agents operate inside `.worktrees/<role>-<task-id>/`.
// We only validate Orchestrator's writes (main repo); sub-agent writes to docs/plan/
// are already blocked by master-plan-write-guard.cjs.
const PLAN_WORKTREE_RE = /(^|\/)\.worktrees\/[^\/]+\//;

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`plan-consistency-validator: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const filePath = toolInput.file_path || '';

  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  // If the write target is inside a sub-agent worktree, this is not the
  // Orchestrator's commit — master-plan-write-guard.cjs will refuse it, and
  // consistency validation against a sub-agent's local copy is meaningless.
  if (PLAN_WORKTREE_RE.test(filePath)) process.exit(0);

  let errors = [];
  let warnings = [];

  if (MASTER_PLAN_RE.test(filePath)) {
    const content = computeFinalContent(toolName, toolInput);
    if (content === null) process.exit(0);
    const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    ({ errors, warnings } = validateMasterPlan(content, readFileSafe(abs)));
  } else if (PHASE_RE.test(filePath)) {
    const content = computeFinalContent(toolName, toolInput);
    if (content === null) process.exit(0);
    ({ errors, warnings } = validatePhase(filePath, content));
  } else {
    // Not a plan file we validate
    process.exit(0);
  }

  if (warnings.length) {
    process.stderr.write(
      `plan-consistency-validator: WARNING — pre-existing drift NOT introduced by this write ` +
      `(allowed; fix it in a follow-up plan write):\n`
    );
    for (const w of warnings) process.stderr.write(`  - ${w}\n`);
  }
  if (errors.length === 0) process.exit(0);

  process.stderr.write(
    `plan-consistency-validator: BLOCKED — ${filePath} would create inconsistency:\n`
  );
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.stderr.write(
    `\n  Per .claude/rules/master-plan-discipline.md §8: master-plan.md, phase.md, and ` +
    `T-NNN.md must reflect consistent state. Fix the source data before writing.\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`plan-consistency-validator: unexpected error: ${err && err.stack || err} — failing open\n`);
  process.exit(0);
});
