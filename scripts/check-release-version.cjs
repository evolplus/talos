#!/usr/bin/env node
// scripts/check-release-version.cjs
//
// Fails when the plugin's shipped surface changed without a version bump, and
// when the three manifests that declare the release disagree.
//
// WHY THIS EXISTS
// "Any schema or behaviour change requires a version bump" has been a written
// rule in rules/hard-rules.md since 2026-09-10, and it was broken twice within
// three days — including by the change that introduced it:
//
//   - the merge-back/promotion gate shipped while plugin.json still said 0.6,
//     so the cached 0.6 was a DIFFERENT FILE under the same version and no
//     consumer could ever receive the fix;
//   - the ISSUE-179 artifact-ID grammar fix shipped on 0.7 the same way.
//
// A consumer resolves a plugin by version. An unchanged version means the cache
// never invalidates, so a correct fix sits in the repo and reaches nobody — and
// worse, source and cache silently diverge under one identity, which is how two
// copies of plan-update-validator.cjs came to enforce mutually exclusive
// schemas. Prose could not hold this rule; a check can.
//
// The shipped surface is what a consumer actually runs. Docs and tests are
// excluded: changing a test must not force a release.
//
//   node scripts/check-release-version.cjs           # verify (exit 1 on drift)
//   node scripts/check-release-version.cjs --update  # after bumping, re-record
//
// ORDER MATTERS: --update records a hash of the shipped surface as it is at that
// moment, so it must be the LAST step before committing a release. Any shipped
// edit made afterwards — including to rules/ — puts the fingerprint behind the
// tree again and the check will (correctly) fail.
//
// Consistency is also enforced: .claude-plugin/plugin.json,
// .claude-plugin/marketplace.json and .codex-plugin/plugin.json declare the
// same release and must carry the byte-identical version string. They had
// drifted to 0.7 / 0.7 / 0.5.0, and later to 0.7 / 0.7 / 0.7.0 — equal in
// meaning, unequal as strings, which defeats any exact-match tooling.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FINGERPRINT = path.join(ROOT, '.claude-plugin', 'release-fingerprint.json');

// Directories whose contents a consumer executes or reads at runtime.
const SHIPPED = ['hooks', 'rules', 'skills', 'settings', 'scripts', 'agents', 'commands'];
// Excluded from the fingerprint: changing these must not force a version bump.
const EXCLUDE_SEGMENTS = new Set(['tests', '.state', 'node_modules']);
const EXCLUDE_FILES = new Set(['release-fingerprint.json']);

const MANIFESTS = [
  ['.claude-plugin/plugin.json', d => d.version],
  ['.claude-plugin/marketplace.json', d => (d.plugins && d.plugins[0] || {}).version],
  ['.codex-plugin/plugin.json', d => d.version],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDE_SEGMENTS.has(e.name) || EXCLUDE_FILES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function fingerprint() {
  const files = [];
  for (const d of SHIPPED) walk(path.join(ROOT, d), files);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(path.relative(ROOT, f).split(path.sep).join('/'));
    h.update('\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return { hash: h.digest('hex'), count: files.length };
}

function versions() {
  const out = [];
  for (const [rel, pick] of MANIFESTS) {
    let v = null;
    try { v = pick(readJson(rel)); } catch { v = null; }
    out.push({ rel, version: v });
  }
  return out;
}

function main() {
  const update = process.argv.includes('--update');
  const vs = versions();
  const fp = fingerprint();
  const problems = [];

  // 1. manifests must agree, byte for byte
  const distinct = [...new Set(vs.map(v => JSON.stringify(v.version)))];
  if (distinct.length !== 1 || vs.some(v => !v.version)) {
    problems.push(
      'version identities disagree across the manifests that declare one release:\n' +
      vs.map(v => `      ${v.rel.padEnd(34)} ${v.version === null ? '(unreadable)' : JSON.stringify(v.version)}`).join('\n')
    );
  }
  const version = vs[0].version;

  // 2. semver-shaped
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    problems.push(
      `version ${JSON.stringify(version)} is not MAJOR.MINOR.PATCH. Two- and three-part strings ` +
      `have already coexisted here ("0.7" vs "0.7.0"); they compare unequal to exact-match tooling ` +
      `even when they mean the same release.`
    );
  }

  if (update) {
    if (problems.length > 0) {
      process.stderr.write('check-release-version: refusing to record a fingerprint while the manifests are inconsistent:\n');
      for (const p of problems) process.stderr.write(`    - ${p}\n`);
      process.exit(1);
    }
    fs.writeFileSync(
      FINGERPRINT,
      `${JSON.stringify({ version, shipped: fp.hash, files: fp.count }, null, 2)}\n`,
      'utf8'
    );
    process.stdout.write(
      `check-release-version: recorded ${version} over ${fp.count} shipped files (${fp.hash.slice(0, 12)}…)\n`
    );
    return;
  }

  // 3. shipped surface must not change without a bump
  let recorded = null;
  try { recorded = JSON.parse(fs.readFileSync(FINGERPRINT, 'utf8')); } catch { recorded = null; }

  if (!recorded) {
    problems.push(
      'no .claude-plugin/release-fingerprint.json — run `node scripts/check-release-version.cjs --update` ' +
      'to record the current release.'
    );
  } else if (recorded.shipped !== fp.hash && recorded.version === version) {
    problems.push(
      `the shipped surface changed but the version is still ${JSON.stringify(version)}.\n` +
      `      recorded ${recorded.shipped.slice(0, 12)}… over ${recorded.files} files\n` +
      `      current  ${fp.hash.slice(0, 12)}… over ${fp.count} files\n` +
      '      A consumer resolves this plugin BY VERSION. Shipping a behaviour change under an\n' +
      '      unchanged version means the cache never invalidates: the fix reaches nobody, and\n' +
      '      source and cache diverge under one identity. Bump all three manifests, then re-run\n' +
      '      with --update.'
    );
  }

  if (problems.length > 0) {
    process.stderr.write('check-release-version: FAILED\n');
    for (const p of problems) process.stderr.write(`    - ${p}\n`);
    process.stderr.write(
      '\n  See § "Two install modes, one registration set" and the version-bump Hard Rule in\n' +
      '  rules/hard-rules.md.\n'
    );
    process.exit(1);
  }

  process.stdout.write(
    `check-release-version: ${version} — manifests agree, shipped surface matches the recorded release\n`
  );
}

main();
