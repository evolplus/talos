#!/usr/bin/env node
// .claude/hooks/plan-consistency-validator.cjs
// PreToolUse hook: validates consistency between master-plan.md, phase.md files,
// and task T-NNN.md files when the Orchestrator writes to docs/plan/.
//
// Bug 3 fix: the project discrepancy showed master-plan.md claiming all phases
// "done" while phase.md files still showed "in-progress" with tasks at
// "ready-for-deploy". No hook caught the mismatch.
//
// Triggers only when CLAUDE_ORCHESTRATOR=1 (the only writer to docs/plan/).
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
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const MASTER_PLAN_RE = /(^|\/)docs\/plan\/master-plan\.md$/i;
const PHASE_RE = /(^|\/)docs\/plan\/phase-\d+-[^/]+\/phase\.md$/i;

// Parse a markdown table (lines between |---| separators and the next blank/## line).
// Returns array of objects keyed by the header names (lowercased, trimmed).
function parseMarkdownTable(content, sectionHeading) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');
  let inSection = !sectionHeading; // if no heading filter, parse first table found
  let inTable = false;
  const rows = [];
  let headers = null;

  for (const line of lines) {
    if (sectionHeading && !inSection) {
      if (new RegExp(`^##+\\s+${sectionHeading}`, 'i').test(line.trim())) {
        inSection = true;
      }
      continue;
    }
    if (inSection && !line.trim().startsWith('|')) {
      if (inTable) break; // table ended
      continue;
    }
    if (inSection && line.trim().startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      if (!headers) {
        // Check if this is the separator row (---)
        if (cells.every(c => /^[-:]+$/.test(c))) continue;
        headers = cells;
        inTable = true;
        continue;
      }
      // Skip separator rows
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      const row = {};
      headers.forEach((h, i) => {
        row[h.toLowerCase()] = cells[i] || '';
      });
      rows.push(row);
    }
  }
  return rows;
}

// Derive phase status from its task statuses.
function computePhaseStatus(taskStatuses) {
  if (taskStatuses.length === 0) return 'not-started';
  const nonTerminal = taskStatuses.filter(
    s => s !== 'done' && s !== 'done-deprecated' && s !== 'cancelled'
  );
  if (nonTerminal.length === 0) return 'done';
  const active = nonTerminal.filter(
    s => s !== 'not-started'
  );
  if (active.length === 0) return 'not-started';
  return 'in-progress';
}

// Count done tasks from a list of status strings.
function countDone(taskStatuses) {
  return taskStatuses.filter(s => s === 'done' || s === 'done-deprecated').length;
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
  const head = stripped.slice(0, 4000);
  return parseHeaderField(head, 'Status');
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
function validateMasterPlan(content) {
  const errors = [];
  const phases = parseMarkdownTable(content, 'Phases');
  if (phases.length === 0) return errors; // no phases to validate

  for (const row of phases) {
    const folder = (row['folder'] || '').trim();
    const declaredStatus = (row['status'] || '').trim().toLowerCase();
    const declaredTasks = (row['tasks'] || '').trim();

    if (!folder) continue;

    const phasePath = path.join(ROOT, 'docs', 'plan', folder, 'phase.md');
    const phaseContent = readFileSafe(phasePath);
    if (phaseContent === null) {
      // Can't read phase file — skip (may not exist yet)
      continue;
    }

    const tasks = parseMarkdownTable(phaseContent, 'Tasks');
    const taskStatuses = tasks.map(t => (t['status'] || '').trim().toLowerCase());
    const computedStatus = computePhaseStatus(taskStatuses);
    const actualDone = countDone(taskStatuses);
    const total = taskStatuses.length;

    // Compare status
    if (declaredStatus && computedStatus !== declaredStatus) {
      errors.push(
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
        errors.push(
          `master-plan says ${declaredDone}/${declaredTotal} done for phase ${folder} ` +
          `but phase.md has ${actualDone}/${total} done`
        );
      }
      if (declaredTotal !== total) {
        errors.push(
          `master-plan says ${declaredTotal} total tasks for phase ${folder} ` +
          `but phase.md has ${total} tasks`
        );
      }
    }
  }

  return errors;
}

// Validate a phase.md against its T-NNN.md task files.
function validatePhase(phaseFilePath, content) {
  const errors = [];
  const tasks = parseMarkdownTable(content, 'Tasks');

  for (const row of tasks) {
    const taskId = (row['task'] || '').trim();
    const declaredStatus = (row['status'] || '').trim().toLowerCase();

    if (!taskId || !/^T-\d+$/i.test(taskId)) continue;

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

    if (actualStatus.toLowerCase() !== declaredStatus) {
      errors.push(
        `phase.md says ${taskId} is "${declaredStatus}" but ` +
        `${taskId}.md says "${actualStatus.toLowerCase()}"`
      );
    }
  }

  return errors;
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

  if (MASTER_PLAN_RE.test(filePath)) {
    const content = computeFinalContent(toolName, toolInput);
    if (content === null) process.exit(0);
    errors = validateMasterPlan(content);
  } else if (PHASE_RE.test(filePath)) {
    const content = computeFinalContent(toolName, toolInput);
    if (content === null) process.exit(0);
    errors = validatePhase(filePath, content);
  } else {
    // Not a plan file we validate
    process.exit(0);
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
