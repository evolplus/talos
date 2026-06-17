#!/usr/bin/env node
// .claude/hooks/post-bash-security-audit.cjs
// Post-tool-run security audit. Closes the gap where a Bash command (e.g. an
// `npm install` pulling a package with a malicious postinstall, or a script
// piped from the network) mutates the environment AFTER all PreToolUse guards
// have already passed. PreToolUse guards gate intent; this hook audits outcome.
//
// Dual-mode (one file, two wirings in settings.json):
//
//   PreToolUse  (Bash, `--snapshot` flag): records a hash baseline of the
//     sensitive-path watchlist below. NEVER blocks, never emits findings —
//     it exists only so the PostToolUse pass can attribute changes to the
//     specific Bash command that just ran. Exit 0 always.
//
//   PostToolUse (Bash, no flag): the audit.
//     1. Sensitive-path tampering — compares the watchlist against the
//        pre-run snapshot. Any changed / new / deleted file under a
//        persistence vector (.git/hooks, .claude/**, CLAUDE.md, shell rc
//        files, ~/.ssh/authorized_keys) is a finding.
//     2. Dependency-install audit — when the command looks like a package
//        install (npm/yarn/pnpm/bun/pip/poetry/uv), diffs lockfiles vs git
//        HEAD, extracts newly-added packages, and flags:
//          - preinstall / install / postinstall scripts in new npm packages
//          - dependencies resolved from URLs or git instead of the registry
//          - typosquat candidates (edit-distance 1 from a popular package)
//     3. Command-string red flags (report-only, post-hoc): curl|wget piped
//        to a shell, base64-decode piped to a shell, chmod +x on hidden
//        paths, crontab edits.
//
// Response model (per operator decision 2026-06-11): detection only.
//   - Findings are appended as a single `State: open` entry to
//     docs/open-issues.md (CLAUDE.md §6 format). The kit's existing
//     open-issues triage gate then blocks all new dispatches until a human
//     triages — no new gate machinery.
//   - Findings are also injected back to the agent via PostToolUse
//     additionalContext so the agent sees the warning immediately.
//   - The hook never blocks the (already-completed) tool call. Exit 0.
//
// Dedupe: a finding fingerprint list in the state dir prevents the same
// finding from filing duplicate issues on every subsequent Bash run.
//
// State lives at .claude/hooks/.state/ (gitignored).
//
// Escape hatch: CLAUDE_SKIP_SECURITY_AUDIT=1 disables both modes.
// Fail-open: any internal error allows the flow and writes a stderr warning.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Persistence vectors watched for tampering. Project-relative entries are
// resolved against the project root; entries starting with ~ against $HOME.
// Directories are walked recursively (capped at MAX_WATCH_FILES files).
const WATCHLIST_PROJECT = [
  '.git/hooks',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks',
  '.claude/agents',
  '.claude/rules',
  'CLAUDE.md',
];
const WATCHLIST_HOME = [
  '~/.bashrc',
  '~/.zshrc',
  '~/.profile',
  '~/.bash_profile',
  '~/.zprofile',
  '~/.config/fish/config.fish',
  '~/.ssh/authorized_keys',
];
const MAX_WATCH_FILES = 800;

// Commands that trigger the dependency-install audit.
const INSTALL_PATTERNS = [
  /\bnpm\s+(?:i|install|add|ci|update|up)\b/,
  /\byarn\s+(?:add|install|up|upgrade)\b/,
  /\bpnpm\s+(?:i|install|add|update|up)\b/,
  /\bbun\s+(?:i|install|add|update)\b/,
  /\bpip3?\s+install\b/,
  /\bpython3?\s+-m\s+pip\s+install\b/,
  /\bpoetry\s+(?:add|install|update)\b/,
  /\buv\s+(?:pip\s+install|add|sync)\b/,
  /\bcomposer\s+(?:require|install|update)\b/,
  /\bgem\s+install\b/,
  /\bcargo\s+(?:add|install)\b/,
  /\bgo\s+(?:get|install)\b/,
];

const LOCKFILE_NAMES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'requirements.txt', 'poetry.lock', 'uv.lock', 'Pipfile.lock',
  'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'go.sum',
];

// Popular npm packages used for the edit-distance-1 typosquat heuristic.
const POPULAR_NPM = [
  'react', 'react-dom', 'lodash', 'express', 'axios', 'chalk', 'commander',
  'moment', 'webpack', 'typescript', 'eslint', 'prettier', 'jest', 'vitest',
  'mocha', 'dotenv', 'uuid', 'classnames', 'redux', 'next', 'vue', 'vite',
  'rollup', 'babel', 'postcss', 'tailwindcss', 'styled-components', 'zod',
  'prisma', 'sequelize', 'mongoose', 'pg', 'mysql2', 'ioredis', 'redis',
  'socket.io', 'ws', 'node-fetch', 'got', 'undici', 'fastify', 'koa', 'nest',
  'jsonwebtoken', 'bcrypt', 'passport', 'cors', 'helmet', 'morgan', 'multer',
  'rxjs', 'ramda', 'dayjs', 'date-fns', 'yargs', 'inquirer', 'glob', 'rimraf',
  'fs-extra', 'cross-env', 'nodemon', 'ts-node', 'tsx', 'esbuild',
];

// Red-flag patterns in the command string itself (report-only, post-hoc).
const COMMAND_RED_FLAGS = [
  { re: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/, label: 'network download piped directly into a shell (curl|sh pattern)' },
  { re: /base64\s+(?:-d|--decode)[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/, label: 'base64-decoded payload piped into a shell' },
  { re: /\bchmod\s+(?:\+x|0?7[0-7][0-7])\s+(?:["']?\/?(?:tmp|var\/tmp|dev\/shm)\/|["']?\.[^./\s])/, label: 'chmod +x on a hidden or temp-dir path' },
  { re: /\bcrontab\b\s*(?:-e|-r|\s+\S+|<)/, label: 'crontab modification' },
  { re: /\b(?:nc|ncat|netcat)\b[^;|&]*\s-e\s/, label: 'netcat with -e (reverse-shell pattern)' },
  { re: />\s*~?\/?\.(bashrc|zshrc|profile|bash_profile|zprofile)\b/, label: 'redirect into a shell rc file' },
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function stateDir(root) {
  return path.join(root, '.claude', 'hooks', '.state');
}

function readEvent() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sha256(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function isExecutable(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function walk(dir, out, cap) {
  if (out.length >= cap) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= cap) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.state') continue;
      walk(full, out, cap);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function expandWatchlist(root) {
  const files = [];
  const home = os.homedir();
  const targets = [
    ...WATCHLIST_PROJECT.map((p) => path.join(root, p)),
    ...WATCHLIST_HOME.map((p) => p.replace(/^~/, home)),
  ];
  for (const t of targets) {
    let st;
    try { st = fs.statSync(t); } catch { continue; }
    if (st.isDirectory()) walk(t, files, MAX_WATCH_FILES);
    else if (st.isFile()) files.push(t);
    if (files.length >= MAX_WATCH_FILES) break;
  }
  return files;
}

function takeSnapshot(root) {
  const snap = { ts: new Date().toISOString(), files: {} };
  for (const f of expandWatchlist(root)) {
    const h = sha256(f);
    if (h) snap.files[f] = h;
  }
  return snap;
}

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function git(root, args) {
  try {
    return execSync(`git -C "${root}" ${args}`, {
      encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

// Damerau-style: true when b is reachable from a by ONE insert, delete,
// substitute, OR adjacent transposition (lodahs→lodash). Identical = false.
function editDistanceLeq1(a, b) {
  if (a === b) return false; // identical = not a squat
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    // substitution or adjacent transposition
    let diffs = [];
    for (let k = 0; k < la; k++) if (a[k] !== b[k]) diffs.push(k);
    if (diffs.length === 1) return true;
    if (diffs.length === 2) {
      const [x, y] = diffs;
      return y === x + 1 && a[x] === b[y] && a[y] === b[x];
    }
    return false;
  }
  // insert/delete: align the longer against the shorter
  const long = la > lb ? a : b, short = la > lb ? b : a;
  let i = 0, j = 0, skipped = false;
  while (i < long.length && j < short.length) {
    if (long[i] === short[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; i++;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Audit checks
// ---------------------------------------------------------------------------

function checkSensitivePaths(root, prevSnap) {
  const findings = [];
  const current = takeSnapshot(root);
  if (prevSnap && prevSnap.files) {
    const before = prevSnap.files;
    const after = current.files;
    for (const [f, h] of Object.entries(after)) {
      if (!(f in before)) {
        const sev = f.includes(`${path.sep}.git${path.sep}hooks`) || isExecutable(f) ? 'high' : 'medium';
        findings.push({ sev, msg: `New file appeared in a persistence-vector path during this command: ${f}${isExecutable(f) ? ' (executable)' : ''}` });
      } else if (before[f] !== h) {
        findings.push({ sev: 'high', msg: `Sensitive file MODIFIED during this command: ${f}` });
      }
    }
    for (const f of Object.keys(before)) {
      if (!(f in current.files)) {
        findings.push({ sev: 'medium', msg: `Sensitive file deleted during this command: ${f}` });
      }
    }
  }
  return { findings, current };
}

function changedLockfiles(root) {
  const out = new Set();
  const diff = git(root, 'diff --name-only HEAD');
  const untracked = git(root, 'ls-files --others --exclude-standard');
  for (const line of (diff + '\n' + untracked).split('\n')) {
    const base = path.basename(line.trim());
    if (LOCKFILE_NAMES.includes(base)) out.add(line.trim());
  }
  return [...out];
}

function newPackagesFromLockDiff(root, lockfile) {
  // Added lines only. Works for tracked lockfiles; for untracked (first
  // install) we skip per-package extraction and rely on script/URL scans.
  const diff = git(root, `diff HEAD -- "${lockfile}"`);
  const pkgs = new Set();
  const urls = [];
  const base = path.basename(lockfile);
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (base === 'package-lock.json') {
      const m = line.match(/^\+\s*"node_modules\/((?:@[^/"]+\/)?[^/"]+)"\s*:/);
      if (m) pkgs.add(m[1]);
      const r = line.match(/^\+\s*"resolved"\s*:\s*"([^"]+)"/);
      if (r && !/^https:\/\/registry\.npmjs\.org\//.test(r[1])) urls.push(r[1]);
    } else if (base === 'yarn.lock') {
      const m = line.match(/^\+((?:@[^/@\s]+\/)?[^@\s"]+)@/);
      if (m) pkgs.add(m[1].replace(/^"/, ''));
      const r = line.match(/^\+\s*resolved\s+"([^"]+)"/);
      if (r && !/^https:\/\/registry\.(?:yarnpkg\.com|npmjs\.org)\//.test(r[1])) urls.push(r[1]);
    } else if (base === 'pnpm-lock.yaml') {
      const m = line.match(/^\+\s*\/?((?:@[^/@\s]+\/)?[^@/\s:]+)@[\d^~]/);
      if (m) pkgs.add(m[1]);
      const r = line.match(/^\+\s*(?:tarball|repo)\s*:\s*(\S+)/);
      if (r) urls.push(r[1]);
    } else if (base === 'requirements.txt') {
      const m = line.match(/^\+\s*([A-Za-z0-9._-]+)\s*[=<>~!]/);
      if (m) pkgs.add(m[1].toLowerCase());
      if (/^\+.*(?:git\+|https?:\/\/)/.test(line)) urls.push(line.slice(1).trim());
    } else {
      // Generic: still catch git/URL-resolved additions in any lock format.
      const r = line.match(/^\+.*?(git\+\S+|https?:\/\/\S+\.(?:tar\.gz|tgz|whl|zip)\S*)/);
      if (r) urls.push(r[1].replace(/[",]+$/, ''));
    }
  }
  return { pkgs: [...pkgs], urls };
}

function checkInstallScripts(root, lockfile, pkgs) {
  const findings = [];
  const moduleRoot = path.join(root, path.dirname(lockfile), 'node_modules');
  for (const name of pkgs.slice(0, 200)) {
    const pj = loadJson(path.join(moduleRoot, name, 'package.json'));
    if (!pj || !pj.scripts) continue;
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      if (pj.scripts[hook]) {
        const script = String(pj.scripts[hook]);
        const nasty = /(?:curl|wget|nc\b|base64|\beval\b|\/dev\/tcp|powershell|\.ssh|crontab)/i.test(script);
        findings.push({
          sev: nasty ? 'high' : 'medium',
          msg: `New dependency "${name}" declares a ${hook} script${nasty ? ' with suspicious content' : ''}: \`${script.slice(0, 160)}\``,
        });
      }
    }
  }
  return findings;
}

function checkTyposquats(pkgs) {
  const findings = [];
  for (const name of pkgs) {
    const bare = name.replace(/^@[^/]+\//, '');
    for (const pop of POPULAR_NPM) {
      if (editDistanceLeq1(bare, pop)) {
        findings.push({ sev: 'high', msg: `New dependency "${name}" is one edit away from popular package "${pop}" — possible typosquat. Verify intent before use.` });
        break;
      }
    }
  }
  return findings;
}

function checkCommandRedFlags(command) {
  const findings = [];
  for (const { re, label } of COMMAND_RED_FLAGS) {
    if (re.test(command)) findings.push({ sev: 'high', msg: `Command matched red-flag pattern: ${label}` });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Open-issue filing (CLAUDE.md §6 format) + dedupe
// ---------------------------------------------------------------------------

function fingerprintOne(finding) {
  return crypto.createHash('sha256').update(finding.msg).digest('hex').slice(0, 16);
}

function fileOpenIssue(root, command, findings, fp) {
  const issuesPath = path.join(root, 'docs', 'open-issues.md');
  const maxSev = findings.some((f) => f.sev === 'high') ? 'high' : 'medium';
  const id = `ISSUE-SEC-${fp.slice(0, 8)}`;
  const now = new Date().toISOString();
  const lines = findings.map((f) => `  - [${f.sev}] ${f.msg}`).join('\n');
  const entry = `
### ${id} — Post-tool security audit findings
- Date: ${now}
- Raised by: post-bash-security-audit (hook)
- Related task: N/A
- Track: cross-cutting
- Severity: ${maxSev}
- Description: Audit of the Bash command \`${command.replace(/`/g, "'").slice(0, 200)}\` surfaced ${findings.length} finding(s):
${lines}
- Suggested mitigation: Review each finding. For dependency findings: inspect the package on the registry, pin a known-good version, or remove it and reinstall with --ignore-scripts. For sensitive-path findings: diff the file against git history and restore if unauthorized. Treat HIGH severity as potential compromise until ruled out.
- State: open
- Decision log:
`;
  try {
    if (!fs.existsSync(issuesPath)) {
      fs.mkdirSync(path.dirname(issuesPath), { recursive: true });
      fs.writeFileSync(issuesPath, '# Open Issues\n');
    }
    fs.appendFileSync(issuesPath, entry);
    return id;
  } catch (e) {
    process.stderr.write(`[post-bash-security-audit] could not write open-issues.md: ${e.message}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (process.env.CLAUDE_SKIP_SECURITY_AUDIT === '1') return 0;

  const event = readEvent();
  const root = projectRoot();
  const snapPath = path.join(stateDir(root), 'sensitive-baseline.json');
  const seenPath = path.join(stateDir(root), 'audit-seen.json');

  // ---- Snapshot mode (PreToolUse) ----
  if (process.argv.includes('--snapshot')) {
    try {
      saveJson(snapPath, takeSnapshot(root));
    } catch (e) {
      process.stderr.write(`[post-bash-security-audit] snapshot failed (non-blocking): ${e.message}\n`);
    }
    return 0;
  }

  // ---- Audit mode (PostToolUse) ----
  const command = (event && event.tool_input && event.tool_input.command) || '';
  const findings = [];

  // 1. Sensitive-path tampering vs. pre-run snapshot.
  const prevSnap = loadJson(snapPath);
  const { findings: tamper, current } = checkSensitivePaths(root, prevSnap);
  findings.push(...tamper);
  try { saveJson(snapPath, current); } catch { /* fail-open */ }

  // 2. Dependency-install audit.
  if (INSTALL_PATTERNS.some((re) => re.test(command))) {
    for (const lf of changedLockfiles(root)) {
      const { pkgs, urls } = newPackagesFromLockDiff(root, lf);
      for (const u of urls.slice(0, 20)) {
        findings.push({ sev: 'medium', msg: `Dependency in ${lf} resolved outside the default registry: ${u.slice(0, 160)}` });
      }
      if (/package-lock\.json|yarn\.lock|pnpm-lock\.yaml/.test(lf)) {
        findings.push(...checkInstallScripts(root, lf, pkgs));
        findings.push(...checkTyposquats(pkgs));
      }
    }
  }

  // 3. Command-string red flags.
  findings.push(...checkCommandRedFlags(command));

  if (findings.length === 0) return 0;

  // Per-finding dedupe: only findings never filed before go into a new issue.
  const seen = loadJson(seenPath) || { fingerprints: [] };
  const fresh = findings.filter((f) => !seen.fingerprints.includes(fingerprintOne(f)));
  let issueId = null;
  if (fresh.length > 0) {
    const fp = fingerprintOne({ msg: fresh.map((f) => f.msg).sort().join('\n') });
    issueId = fileOpenIssue(root, command, fresh, fp);
    seen.fingerprints = [...seen.fingerprints, ...fresh.map(fingerprintOne)].slice(-300);
    try { saveJson(seenPath, seen); } catch { /* fail-open */ }
  }

  const summary = findings.map((f) => `- [${f.sev.toUpperCase()}] ${f.msg}`).join('\n');
  const context =
    `SECURITY AUDIT (post-tool): the Bash command that just ran triggered ${findings.length} finding(s):\n` +
    `${summary}\n` +
    (issueId
      ? `Filed as ${issueId} in docs/open-issues.md with State: open — per CLAUDE.md §6 this BLOCKS all new dispatches until triaged. Surface this to the operator now.`
      : `A matching issue was already filed earlier (duplicate suppressed). Ensure it is triaged before proceeding.`);

  // PostToolUse JSON output: warn the agent without blocking the (done) call.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
  process.stderr.write(`[post-bash-security-audit] ${findings.length} finding(s)${issueId ? `, filed ${issueId}` : ' (duplicate, not re-filed)'}\n`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  // Fail-open: never let the audit itself break the flow.
  process.stderr.write(`[post-bash-security-audit] internal error (fail-open): ${e && e.message}\n`);
  process.exit(0);
}
