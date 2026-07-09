#!/usr/bin/env node
// .claude/hooks/srs-design-flow-validator.cjs
// PreToolUse hook: refuses SRS sign-off-state writes for Design-Flow A when
// Figma extraction evidence or Figma-to-SRS mapping evidence is incomplete.
//
// Flow A means an upstream Figma file is part of the requirement source. The
// kit must not sign off the SRS until the UI/UX Designer has:
//   - extracted requirements and design-token evidence from every Figma file
//   - mapped every in-scope UI surface to pinned Figma node IDs
//   - resolved mapping gaps and fuzzy/orphan decisions that block sign-off
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, cwd, ... }
//   - exit 0: allow
//   - exit 2: block
//
// Fail-open on internal errors. The BA Phase 2 procedure remains authoritative;
// this hook catches the common "status flipped before evidence exists" failure.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField, headerPrelude } = require('./lib/parse-header.cjs');

const SRS_PATH_RE = /(^|\/)docs\/SRS\.md$/i;
const SIGNOFF_STATUSES = new Set(['ready-for-sign-off', 'source-validated', 'signed-off']);

function isSrsPath(p) {
  return typeof p === 'string' && SRS_PATH_RE.test(p);
}

function normalize(v) {
  return (v || '').toString().trim().toLowerCase();
}

function inferProjectRoot(filePath, cwd) {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  if (typeof filePath === 'string' && path.isAbsolute(filePath)) {
    const m = filePath.match(/^(.*)\/docs\/SRS\.md$/i);
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

function parseSrsHeader(content, label) {
  const stripped = headerPrelude(stripFencedCodeBlocks(content), 6000);
  return parseHeaderField(stripped, label);
}

function extractFigmaFileIds(content) {
  const ids = new Set();
  const re = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/gi;
  let m;
  while ((m = re.exec(content)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

function latestExtractionFor(root, figmaId) {
  const dir = path.join(root, 'docs', 'requirements', 'design-extracted');
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const matches = entries
    .filter(name => name.startsWith(figmaId + '-') && name.endsWith('.md'))
    .sort();
  if (matches.length === 0) return null;
  return path.join(dir, matches[matches.length - 1]);
}

function extractionHasSection6(content) {
  const stripped = stripFencedCodeBlocks(content);
  return /^##\s+Section\s+6\s+(?:-|—)\s+Design\s+(?:guideline\s+extraction|token\s+evidence)\b/im.test(stripped);
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function getSection(content, headingRe) {
  const lines = stripFencedCodeBlocks(content).split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i]) && headingRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return '';
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function hasActionableSectionContent(section) {
  if (!section) return false;
  const bodyLines = section.split(/\r?\n/).slice(1)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^\|?\s*-{3,}/.test(l))
    .filter(l => !/^\|?\s*(item|surface|frame|decision|req id|srs surface)\b/i.test(l));
  if (bodyLines.length === 0) return false;
  const body = bodyLines.join(' ').trim();
  if (/^(none|n\/a|na|no decisions|no pending decisions|no pending items|empty|resolved)$/i.test(body)) {
    return false;
  }
  return true;
}

function splitMarkdownRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function findDesignReferenceNodeGaps(content) {
  const section = getSection(content, /Design\s+References/i);
  if (!section) return ['SRS is missing a Design References section for Flow A.'];

  const tableLines = section.split(/\r?\n/).filter(l => /^\s*\|/.test(l));
  const headerIndex = tableLines.findIndex(l => /Figma\s+Node\s+ID/i.test(l));
  if (headerIndex === -1) {
    return ['Design References table is missing a Figma Node ID column.'];
  }
  const header = splitMarkdownRow(tableLines[headerIndex]);
  const nodeIdx = header.findIndex(h => /Figma\s+Node\s+ID/i.test(h));
  const reqIdx = header.findIndex(h => /Req\s*ID|SRS\s*Surface/i.test(h));
  const surfaceIdx = header.findIndex(h => /Surface|Screen|Frame/i.test(h));
  const gaps = [];

  for (let i = headerIndex + 1; i < tableLines.length; i++) {
    const line = tableLines[i];
    if (/^\s*\|\s*:?-{3,}:?\s*\|/.test(line)) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length <= nodeIdx) continue;
    const req = reqIdx >= 0 ? cells[reqIdx] : '';
    const surface = surfaceIdx >= 0 ? cells[surfaceIdx] : '';
    const rowLabel = [req, surface].filter(Boolean).join(' ');
    if (!rowLabel || /^(—|-|n\/a|na|none)$/i.test(rowLabel)) continue;
    const node = (cells[nodeIdx] || '').trim();
    if (!node || /^(—|-|n\/a|na|none|tbd|null)$/i.test(node) || /<[^>]+>/.test(node)) {
      gaps.push((rowLabel || 'Design References row') + ' has an empty Figma Node ID.');
    }
  }

  if (gaps.length === 0 && tableLines.length <= headerIndex + 2) {
    gaps.push('Design References table has no surface rows with pinned Figma Node IDs.');
  }
  return gaps;
}

function inspectMapping(root, version) {
  const rel = path.join('docs', 'uiux', 'figma-mappings', 'v' + version + '.md');
  const mappingPath = path.join(root, rel);
  const violations = [];
  if (!fs.existsSync(mappingPath)) {
    return { path: rel, violations: ['Missing Flow A mapping artifact: ' + rel + '.'] };
  }
  const content = readFileSafe(mappingPath);
  if (content === null) {
    return { path: rel, violations: ['Cannot read Flow A mapping artifact: ' + rel + '.'] };
  }
  const stripped = stripFencedCodeBlocks(content);
  const status = normalize(parseHeaderField(headerPrelude(stripped, 6000), 'Mapping-Status'));
  if (!status) {
    violations.push(rel + ' is missing Mapping-Status.');
  } else if (status === 'gaps') {
    violations.push(rel + ' has Mapping-Status: gaps.');
  } else if (status !== 'qualified' && status !== 'orphans-only') {
    violations.push(rel + ' has unsupported Mapping-Status: ' + status + '.');
  }

  if (/\bgap-surface\b/i.test(stripped)) {
    violations.push(rel + ' still contains gap-surface rows.');
  }
  const missingSurfaceSection = getSection(stripped, /SRS\s+surfaces\s+without\s+Figma\s+match/i);
  if (hasActionableSectionContent(missingSurfaceSection)) {
    violations.push(rel + ' lists SRS surfaces without Figma matches.');
  }
  const decisions = getSection(stripped, /Decisions\s+awaiting\s+human\s+confirmation/i);
  if (!decisions) {
    violations.push(rel + ' is missing the Decisions awaiting human confirmation section.');
  } else if (hasActionableSectionContent(decisions)) {
    violations.push(rel + ' still has fuzzy-match decisions awaiting human confirmation.');
  }
  if (status === 'orphans-only') {
    const orphans = getSection(stripped, /Figma\s+frames\s+without\s+SRS\s+match/i);
    if (/(pending|tbd|awaiting)/i.test(orphans)) {
      violations.push(rel + ' has orphan-frame disposition still pending/TBD/awaiting.');
    }
  }
  return { path: rel, violations };
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try { event = JSON.parse(raw); }
  catch (e) {
    process.stderr.write('srs-design-flow-validator: malformed event JSON: ' + e.message + ' - failing open\n');
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = toolInput.file_path || '';
  if (!isSrsPath(filePath)) process.exit(0);

  const root = inferProjectRoot(filePath, event.cwd || '');
  const finalContent = computeFinalContent(toolName, toolInput, root);
  if (finalContent === null) process.exit(0);

  const status = normalize(parseSrsHeader(finalContent, 'Status'));
  if (!SIGNOFF_STATUSES.has(status)) process.exit(0);

  const designFlow = normalize(parseSrsHeader(finalContent, 'Design-Flow'));
  if (designFlow !== 'a') process.exit(0);

  const violations = [];
  const version = parseSrsHeader(finalContent, 'Version');
  if (!version) violations.push('SRS header is missing Version, so docs/uiux/figma-mappings/v<version>.md cannot be resolved.');

  const figmaIds = extractFigmaFileIds(finalContent);
  if (figmaIds.length === 0) {
    violations.push('Design-Flow: A requires at least one Figma URL in docs/SRS.md.');
  }
  for (const figmaId of figmaIds) {
    const extraction = latestExtractionFor(root, figmaId);
    if (!extraction) {
      violations.push('Missing design extraction artifact for Figma file ' + figmaId + ' under docs/requirements/design-extracted/.');
      continue;
    }
    const content = readFileSafe(extraction);
    if (content === null || !extractionHasSection6(content)) {
      violations.push(path.relative(root, extraction) + ' is missing Section 6 design-token evidence.');
    }
  }

  if (version) {
    violations.push(...inspectMapping(root, version).violations);
  }
  violations.push(...findDesignReferenceNodeGaps(finalContent));

  if (violations.length === 0) process.exit(0);

  process.stderr.write(
    'srs-design-flow-validator: BLOCKED - Design-Flow A SRS cannot enter sign-off state without complete Figma evidence.\n' +
    '  SRS Status: ' + status + '\n' +
    '  Violations (' + violations.length + '):\n' +
    violations.slice(0, 20).map(v => '    - ' + v).join('\n') + '\n\n' +
    '  Required Flow A sequence:\n' +
    '    1. UI/UX Designer extract mode writes docs/requirements/design-extracted/<figma-file-id>-<date>.md with Section 6 token evidence.\n' +
    '    2. UI/UX Designer map mode writes docs/uiux/figma-mappings/v<version>.md and pins every in-scope SRS surface node ID.\n' +
    '    3. BA Phase 2 resolves mapping gaps, fuzzy matches, and orphan dispositions before sign-off.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('srs-design-flow-validator: unexpected error: ' + (err && err.stack || err) + ' - failing open\n');
  process.exit(0);
});
