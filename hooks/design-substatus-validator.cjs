#!/usr/bin/env node
// .claude/hooks/design-substatus-validator.cjs
// PreToolUse hook: refuses task-file writes that set Design sub-status to
// design-confirmed unless the task-scoped UI/UX handoff and BA completeness
// report are present and content-complete.
//
// This closes the Flow A shortcut failure where a mapped Figma surface could be
// treated as implementation-ready before import mode produced the Design Element
// Manifest that FE Dev and QA need.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const IDS = require('./lib/artifact-ids.cjs');

const TASK_PATH_RE = /(^|\/)docs\/plan\/[^/]+\/tasks\/(T-[A-Za-z0-9_-]+)\.md$/i;

function normalize(v) {
  return (v || '').toString().trim().toLowerCase();
}

function isTaskPath(p) {
  return typeof p === 'string' && TASK_PATH_RE.test(p);
}

function taskIdFromPath(p) {
  const m = typeof p === 'string' ? p.match(TASK_PATH_RE) : null;
  return m ? m[2] : null;
}

function inferProjectRoot(filePath, cwd) {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  if (typeof filePath === 'string' && path.isAbsolute(filePath)) {
    const m = filePath.match(/^(.*)\/docs\/plan\/[^/]+\/tasks\/T-[A-Za-z0-9_-]+\.md$/i);
    if (m) return m[1];
  }
  if (typeof cwd === 'string' && cwd) {
    const idx = cwd.indexOf('/.worktrees/');
    if (idx >= 0) return cwd.slice(0, idx);
    return cwd;
  }
  return process.cwd();
}

function resolvePath(p, root) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(root, p);
}

function computeFinalContent(toolName, toolInput, root) {
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    const filePath = resolvePath(toolInput.file_path, root);
    if (!filePath || !fs.existsSync(filePath)) return null;
    let current;
    try { current = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
    const oldStr = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newStr = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    if (!oldStr) return current;
    if (toolInput.replace_all) return current.split(oldStr).join(newStr);
    const idx = current.indexOf(oldStr);
    if (idx === -1) return current;
    return current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
  }
  return null;
}

function taskHeader(content) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < Math.min(lines.length, 160); i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function parseDesignSubStatus(content) {
  const head = taskHeader(content);
  const m = head.match(/^[\s\-*]*\*{0,2}Design[\s-]*sub[\s-]*status\*{0,2}\s*:\s*\*{0,2}\s*([^\r\n]+)/im);
  if (!m) return '';
  return normalize(m[1].split(/\s+/)[0].replace(/[*_.,;:!?]+$/g, ''));
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function hasHeading(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^#{2,6}\\s+' + escaped + '\\s*$', 'im').test(stripFencedCodeBlocks(content));
}

function getSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = stripFencedCodeBlocks(content).split(/\r?\n/);
  const re = new RegExp('^#{2,6}\\s+' + escaped + '\\s*$', 'i');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function sectionHasDemRows(content, heading) {
  const section = getSection(content, heading);
  return IDS.idPattern('DEM').test(section);
}

function sectionHasPattern(content, heading, pattern) {
  return pattern.test(getSection(content, heading));
}

function hasDesignSystemSource(content) {
  const stripped = stripFencedCodeBlocks(content);
  return /design\s+system\s+source/i.test(stripped) &&
    /(token|color|typograph|spacing|radius|elevation|from-figma|figma-backed|extraction artifact)/i.test(stripped);
}

function hasQualifiedVerdict(content) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split(/\r?\n/);
  for (const line of lines) {
    if (!/\b(verdict|summary|status)\b/i.test(line)) continue;
    if (/\bunqualified\b/i.test(line)) continue;
    if (/\bqualified\b/i.test(line)) return true;
  }
  return false;
}

function checkHandoff(root, taskId) {
  const rel = path.join('docs', 'uiux', 'handoffs', taskId + '.md');
  const p = path.join(root, rel);
  const violations = [];
  if (!fs.existsSync(p)) return ['Missing UI/UX handoff: ' + rel + '.'];
  const content = readFileSafe(p);
  if (content === null) return ['Cannot read UI/UX handoff: ' + rel + '.'];
  if (!hasHeading(content, 'Design Element Manifest')) {
    violations.push(rel + ' is missing ## Design Element Manifest.');
  } else if (!sectionHasDemRows(content, 'Design Element Manifest')) {
    violations.push(rel + ' has ## Design Element Manifest but no DEM-* rows.');
  }
  if (!hasDesignSystemSource(content)) {
    violations.push(rel + ' is missing Design System Source / token-evidence detail.');
  }
  if (!hasHeading(content, 'Reference Render') ||
      !sectionHasPattern(content, 'Reference Render', /\b(Node ID|Figma Node ID)\b[\s\S]*\b(SHA-?256|checksum)\b/i)) {
    violations.push(rel + ' is missing non-empty ## Reference Render node/checksum evidence.');
  }
  if (!hasHeading(content, 'Visual Composition Contract') ||
      !sectionHasPattern(content, 'Visual Composition Contract', /\b(viewport|layer order|root layout|constraints?)\b/i)) {
    violations.push(rel + ' is missing non-empty ## Visual Composition Contract evidence.');
  }
  if (!hasHeading(content, 'Asset Export Manifest') ||
      !sectionHasPattern(content, 'Asset Export Manifest', IDS.idOrNonePattern('AST'))) {
    violations.push(rel + ' is missing ## Asset Export Manifest AST-* rows.');
  } else if (sectionHasPattern(content, 'Asset Export Manifest', IDS.rowPattern('AST', '\\bblocked\\b'))) {
    violations.push(rel + ' has blocked Asset Export Manifest rows.');
  }
  return violations;
}

function checkCompletenessReport(root, taskId) {
  const rel = path.join('docs', 'uiux', 'completeness-reports', taskId + '.md');
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return ['Missing BA design completeness report: ' + rel + '.'];
  const content = readFileSafe(p);
  if (content === null) return ['Cannot read BA design completeness report: ' + rel + '.'];
  if (!hasQualifiedVerdict(content)) return [rel + ' does not contain a qualified verdict.'];
  return [];
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try { event = JSON.parse(raw); }
  catch (e) {
    process.stderr.write('design-substatus-validator: malformed event JSON: ' + e.message + ' - failing open\n');
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = toolInput.file_path || '';
  if (!isTaskPath(filePath)) process.exit(0);

  const root = inferProjectRoot(filePath, event.cwd || '');
  const finalContent = computeFinalContent(toolName, toolInput, root);
  if (finalContent === null) process.exit(0);

  const designSubStatus = parseDesignSubStatus(finalContent);
  if (designSubStatus !== 'design-confirmed') process.exit(0);

  const taskId = taskIdFromPath(filePath);
  if (!taskId) process.exit(0);

  const violations = [
    ...checkHandoff(root, taskId),
    ...checkCompletenessReport(root, taskId),
  ];

  if (violations.length === 0) process.exit(0);

  process.stderr.write(
    'design-substatus-validator: BLOCKED - task ' + taskId + ' cannot be marked design-confirmed yet.\n' +
    '  Violations (' + violations.length + '):\n' +
    violations.map(v => '    - ' + v).join('\n') + '\n\n' +
    '  Required sequence:\n' +
    '    1. UI/UX Designer create/import/revise/incorporate writes docs/uiux/handoffs/' + taskId + '.md.\n' +
    '    2. The handoff includes non-empty Reference Render, Visual Composition Contract, Asset Export Manifest, Design Element Manifest, and token evidence.\n' +
    '    3. BA Phase 3 writes docs/uiux/completeness-reports/' + taskId + '.md with verdict: qualified.\n' +
    '    4. The Designated Design Approver confirms the design version, then design-confirmed may be recorded.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('design-substatus-validator: unexpected error: ' + (err && err.stack || err) + ' - failing open\n');
  process.exit(0);
});
