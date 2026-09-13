#!/usr/bin/env node
// .claude/hooks/environment-config-validator.cjs
// PreToolUse hook: refuses SRS sign-off-state writes when a project with
// FE/BE runtime scope lacks a machine-checkable environment configuration
// contract.
//
// The contract lives in SRS §3.4.6 Environment Configuration. It must declare
// local, staging/testing, and production tiers plus runtime config variables.
// For projects that ship both frontend and backend, the frontend must consume a
// non-secret API endpoint/base-URL variable instead of hardcoding a backend URL.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField, headerPrelude } = require('./lib/parse-header.cjs');

const SRS_PATH_RE = /(^|\/)docs\/SRS\.md$/i;
const SIGNOFF_STATUSES = new Set(['ready-for-sign-off', 'source-validated', 'signed-off']);

function normalize(v) {
  return (v || '').toString().trim().toLowerCase();
}

function isSrsPath(p) {
  return typeof p === 'string' && SRS_PATH_RE.test(p);
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

function header(content, label) {
  return parseHeaderField(headerPrelude(stripFencedCodeBlocks(content), 8000), label);
}

function isPresentRuntimeValue(v) {
  const n = normalize(v).replace(/[.,;:!?]+$/, '');
  return n && !['n/a', 'na', 'none', 'no', 'null', 'nil'].includes(n);
}

function hasFrontendScope(content) {
  const framework = header(content, 'Frontend-Framework');
  if (isPresentRuntimeValue(framework)) return true;
  const stripped = stripFencedCodeBlocks(content);
  return /^Frontend\s+root\s*:\s*(?!\s*(N\/A|none|no)\b).+/im.test(stripped) ||
    /^\|[^|\n]*frontend[^|\n]*\|/im.test(stripped);
}

function hasBackendScope(content) {
  const track = header(content, 'Backend-Track');
  const framework = header(content, 'Backend-Framework');
  if (isPresentRuntimeValue(track) || isPresentRuntimeValue(framework)) return true;
  const stripped = stripFencedCodeBlocks(content);
  return /^Backend\s+root\s*:\s*(?!\s*(N\/A|none|no)\b).+/im.test(stripped) ||
    /^\|[^|\n]*backend[^|\n]*\|/im.test(stripped);
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
    if (/^#{1,4}\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function splitMarkdownRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function parseMarkdownTables(section) {
  const lines = section.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) continue;
    if (i + 1 >= lines.length || !/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1])) continue;
    const headers = splitMarkdownRow(lines[i]);
    const rows = [];
    i += 2;
    for (; i < lines.length; i++) {
      if (!/^\s*\|/.test(lines[i])) { i--; break; }
      if (/^\s*\|\s*:?-{3,}:?\s*\|/.test(lines[i])) continue;
      const cells = splitMarkdownRow(lines[i]);
      rows.push({ cells, raw: lines[i] });
    }
    tables.push({ headers, rows });
  }
  return tables;
}

function idx(headers, re) {
  return headers.findIndex(h => re.test(h));
}

function cell(row, index) {
  return index >= 0 ? (row.cells[index] || '').trim() : '';
}

function isPlaceholder(v) {
  const n = normalize(v);
  return !n || /^(—|-|n\/a|na|none|null|nil|tbd|\.\.\.)$/.test(n) || /<[^>]+>/.test(v);
}

function envCoverage(v) {
  const n = normalize(v);
  const all = /\b(all|every|local\s*\/\s*staging\s*\/\s*production)\b/i.test(v);
  return {
    local: all || /\blocal\b/.test(n),
    stage: all || /\b(staging|stage|testing|test)\b/.test(n),
    prod: all || /\b(prod|production)\b/.test(n),
  };
}

function hasAllEnvCoverage(v) {
  const c = envCoverage(v);
  return c.local && c.stage && c.prod;
}

function parseVariableRows(section) {
  const rows = [];
  for (const table of parseMarkdownTables(section)) {
    const varIdx = idx(table.headers, /\b(env\s*var|variable|key|name)\b/i);
    const ownerIdx = idx(table.headers, /\b(owner|consumer|tier|component|app|service)\b/i);
    const envIdx = table.headers.findIndex(h =>
      /\b(required\s+envs?|required\s+environments?|environments?|tiers?)\b/i.test(h) ||
      /^envs?$/i.test(h.trim())
    );
    const purposeIdx = idx(table.headers, /\b(purpose|usage|description)\b/i);
    const secretIdx = idx(table.headers, /\b(secret|sensitive)\b/i);
    const sourceIdx = idx(table.headers, /\b(source|template|config)\b/i);
    if (varIdx === -1 || envIdx === -1 || purposeIdx === -1) continue;
    for (const row of table.rows) {
      const name = cell(row, varIdx);
      if (isPlaceholder(name)) continue;
      rows.push({
        name,
        owner: cell(row, ownerIdx),
        envs: cell(row, envIdx),
        purpose: cell(row, purposeIdx),
        secret: cell(row, secretIdx),
        source: cell(row, sourceIdx),
        raw: row.raw,
      });
    }
  }
  return rows;
}

function hasRequiredTiers(section) {
  const n = normalize(section);
  return /\blocal\b/.test(n) && /\b(prod|production)\b/.test(n) && /\b(staging|stage|testing|test)\b/.test(n);
}

function isFrontendBackendEndpoint(row) {
  const namePurpose = (row.name + ' ' + row.purpose).toLowerCase();
  const owner = normalize(row.owner);
  const secret = normalize(row.secret);
  const ownerIsFrontend = /\b(frontend|front-end|fe|client|web|mobile|app)\b/.test(owner);
  const endpointLike = (
    /(backend|api).*(url|uri|endpoint|base)/i.test(namePurpose) ||
    /(url|uri|endpoint|base).*(backend|api)/i.test(namePurpose)
  );
  const explicitlyNonSecret = /\b(no|false|non-secret|public)\b/.test(secret);
  return ownerIsFrontend && endpointLike && explicitlyNonSecret && hasAllEnvCoverage(row.envs);
}

function validateEnvironmentConfig(content) {
  const frontend = hasFrontendScope(content);
  const backend = hasBackendScope(content);
  if (!frontend && !backend) return [];

  const violations = [];
  const section = getSection(content, /Environment\s+Configuration/i);
  if (!section) {
    return ['Missing SRS §3.4.6 Environment Configuration for project with FE/BE runtime scope.'];
  }
  if (!hasRequiredTiers(section)) {
    violations.push('Environment Configuration must declare local, testing/staging, and production tiers.');
  }

  const variableRows = parseVariableRows(section);
  if (variableRows.length === 0) {
    violations.push('Environment Configuration must include a runtime config variable table with Env Var, Required environments, Purpose, and Secret? columns.');
  }
  for (const row of variableRows) {
    if (!hasAllEnvCoverage(row.envs)) {
      violations.push('Env var ' + row.name + ' must declare coverage for local, testing/staging, and production (or "all").');
    }
    if (isPlaceholder(row.purpose)) {
      violations.push('Env var ' + row.name + ' is missing a concrete purpose.');
    }
  }

  if (frontend && backend && !variableRows.some(isFrontendBackendEndpoint)) {
    violations.push('Frontend+backend projects must declare a non-secret frontend backend/API endpoint variable (for example BACKEND_API_ENDPOINT or NEXT_PUBLIC_API_BASE_URL) covering local, staging/testing, and production.');
  }

  return violations;
}

// Grandfather baseline: suppress env-config conditions that pre-existed and were
// implicitly accepted before this hook was installed (it post-dates the last SRS
// Signed-off), so an iteration that adds no NEW env-config surface is not blocked
// on the section's historical absence. Violations NOT matched still block
// (gate-the-delta) — including every granular §3.4.6 check. See ISSUE-110 + the
// config header. Fails open (returns []) when the config is absent or malformed.
function loadWaivers(root) {
  const p = path.join(root, '.claude', 'hooks', 'config', 'environment-config-baseline.json');
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return []; }
  let cfg;
  try { cfg = JSON.parse(raw); } catch { return []; }
  if (!cfg || !Array.isArray(cfg.waived)) return [];
  return cfg.waived
    .map(w => (w && typeof w.signature === 'string') ? w.signature : null)
    .filter(Boolean);
}

function normalizeViolation(s) {
  return (s || '').toString().replace(/v\d+(?:\.\d+)*\.md/gi, 'v<VER>.md').toLowerCase();
}

function partitionWaived(violations, waivers) {
  if (waivers.length === 0) return { blocking: violations, grandfathered: [] };
  const normSigs = waivers.map(normalizeViolation);
  const blocking = [];
  const grandfathered = [];
  for (const v of violations) {
    const nv = normalizeViolation(v);
    if (normSigs.some(sig => nv.includes(sig))) grandfathered.push(v);
    else blocking.push(v);
  }
  return { blocking, grandfathered };
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try { event = JSON.parse(raw); }
  catch (e) {
    process.stderr.write('environment-config-validator: malformed event JSON: ' + e.message + ' - failing open\n');
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

  const status = normalize(header(finalContent, 'Status'));
  if (!SIGNOFF_STATUSES.has(status)) process.exit(0);

  const allViolations = validateEnvironmentConfig(finalContent);

  // Suppress conditions grandfathered before this hook existed; only NEW
  // env-config debt introduced by this iteration remains blocking (gate-the-delta).
  const { blocking: violations, grandfathered } = partitionWaived(allViolations, loadWaivers(root));
  if (grandfathered.length > 0) {
    process.stderr.write(
      'environment-config-validator: ' + grandfathered.length +
      ' pre-existing condition(s) GRANDFATHERED (accepted before this hook was installed; see .claude/hooks/config/environment-config-baseline.json + ISSUE-110):\n' +
      grandfathered.slice(0, 20).map(v => '    ~ ' + v).join('\n') + '\n'
    );
  }

  if (violations.length === 0) process.exit(0);

  process.stderr.write(
    'environment-config-validator: BLOCKED - SRS cannot enter sign-off state without an environment configuration contract.\n' +
    '  SRS Status: ' + status + '\n' +
    '  Violations (' + violations.length + ', excludes ' + grandfathered.length + ' grandfathered):\n' +
    violations.map(v => '    - ' + v).join('\n') + '\n\n' +
    '  Required: SRS §3.4.6 Environment Configuration must declare local, testing/staging, production, and runtime config variables.\n' +
    '  For frontend+backend systems, FE must consume a non-secret backend/API endpoint env var instead of hardcoding URLs.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('environment-config-validator: unexpected error: ' + (err && err.stack || err) + ' - failing open\n');
  process.exit(0);
});
