#!/usr/bin/env node
// scripts/sync-settings-template.cjs
//
// Generates `settings/original-settings.json` from `hooks/hooks.json`.
//
// WHY THIS IS GENERATED AND NOT HAND-MAINTAINED
// The kit registers its hooks two different ways for two different install modes:
//
//   plugin mode  — `hooks/hooks.json`, paths via ${CLAUDE_PLUGIN_ROOT}
//   vendored mode — `settings/original-settings.json`, merged by scripts/sdlc-init.cjs
//                   into a project's .claude/settings.json, paths via $CLAUDE_PROJECT_DIR
//
// Both must register the SAME hook set. They were maintained by hand and drifted:
// by 2026-09-10 the vendored template was missing seven hooks the plugin manifest
// had (environment-config-validator, srs-design-flow-validator,
// design-substatus-validator, local-worktree-git-guard, worktree-promotion-guard,
// task-completion-commit-check, unpromoted-dispatch-audit) plus the entire Stop
// event, while still carrying a standalone dispatch-journal-gc entry that the
// plugin manifest correctly drops because session-init-summary.cjs requires it
// in-process.
//
// The consequence was not cosmetic. sdlc-init COPIES the whole hooks/ directory
// into a project but merges only this template's registrations, so a vendored
// project ended up with new hook FILES on disk and old REGISTRATIONS in
// settings.json — hooks physically present and never invoked. That is exactly
// the "documented as hook-enforced, enforced by nothing" symptom found in the
// branch-merge repo, and this template is where it came from.
//
// So: hooks/hooks.json is the single source of truth. Run this after changing it.
//   node scripts/sync-settings-template.cjs           # write
//   node scripts/sync-settings-template.cjs --check   # verify, exit 1 on drift (CI)

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'hooks', 'hooks.json');
const TEMPLATE = path.join(ROOT, 'settings', 'original-settings.json');

// Hooks the plugin manifest deliberately omits because another hook requires
// them in-process. Registering them standalone would double-run them.
const IN_PROCESS_ONLY = new Set(['dispatch-journal-gc.cjs']);

function pluginRootToProjectDir(args) {
  // ["${CLAUDE_PLUGIN_ROOT}/hooks/x.cjs", "--flag"] ->
  //   'node "$CLAUDE_PROJECT_DIR/.claude/hooks/x.cjs" --flag'
  const [scriptArg, ...rest] = args;
  const m = /\/hooks\/([A-Za-z0-9._-]+)$/.exec(scriptArg || '');
  if (!m) return null;
  const quoted = `"$CLAUDE_PROJECT_DIR/.claude/hooks/${m[1]}"`;
  return ['node', quoted, ...rest].join(' ');
}

function build() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const out = { hooks: {} };

  for (const [event, groups] of Object.entries(manifest.hooks || {})) {
    const outGroups = [];
    for (const group of groups) {
      const hooks = [];
      for (const hook of group.hooks || []) {
        const args = hook.args || [];
        const name = (/\/hooks\/([A-Za-z0-9._-]+)$/.exec(args[0] || '') || [])[1];
        if (name && IN_PROCESS_ONLY.has(name)) continue;
        const command = pluginRootToProjectDir(args);
        if (!command) continue;
        hooks.push({ type: 'command', command });
      }
      if (hooks.length === 0) continue;
      const g = {};
      if (group.matcher) g.matcher = group.matcher;
      g.hooks = hooks;
      outGroups.push(g);
    }
    if (outGroups.length > 0) out.hooks[event] = outGroups;
  }
  return out;
}

function hookNames(settingsLike, fromManifest) {
  const names = {};
  for (const [event, groups] of Object.entries(settingsLike.hooks || {})) {
    const set = new Set();
    for (const g of groups) {
      for (const h of g.hooks || []) {
        const src = fromManifest ? (h.args || []).join(' ') : (h.command || '');
        const m = /([A-Za-z0-9._-]+\.cjs)/.exec(src);
        if (m) set.add(m[1]);
      }
    }
    names[event] = [...set].sort();
  }
  return names;
}

function main() {
  const check = process.argv.includes('--check');
  const generated = build();
  const serialized = `${JSON.stringify(generated, null, 2)}\n`;

  if (!check) {
    fs.mkdirSync(path.dirname(TEMPLATE), { recursive: true });
    fs.writeFileSync(TEMPLATE, serialized, 'utf8');
    const n = Object.values(hookNames(generated, false)).reduce((a, v) => a + v.length, 0);
    process.stdout.write(
      `sync-settings-template: wrote ${path.relative(ROOT, TEMPLATE)} ` +
      `(${Object.keys(generated.hooks).length} events, ${n} registrations)\n`
    );
    return;
  }

  let current;
  try {
    current = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  } catch (e) {
    process.stderr.write(`sync-settings-template: cannot read template (${e.message})\n`);
    process.exit(1);
  }

  const want = hookNames(generated, false);
  const have = hookNames(current, false);
  const events = [...new Set([...Object.keys(want), ...Object.keys(have)])].sort();
  const problems = [];
  for (const ev of events) {
    const w = new Set(want[ev] || []);
    const h = new Set(have[ev] || []);
    for (const n of w) if (!h.has(n)) problems.push(`${ev}: template MISSING ${n}`);
    for (const n of h) if (!w.has(n)) problems.push(`${ev}: template has EXTRA ${n}`);
  }

  if (problems.length > 0) {
    process.stderr.write(
      'sync-settings-template: DRIFT between hooks/hooks.json (plugin mode) and\n' +
      '  settings/original-settings.json (vendored mode). A vendored project would get\n' +
      '  hook FILES copied in but the wrong REGISTRATIONS, so some hooks would sit on\n' +
      '  disk never invoked.\n\n'
    );
    for (const p of problems) process.stderr.write(`    - ${p}\n`);
    process.stderr.write('\n  Fix: node scripts/sync-settings-template.cjs\n');
    process.exit(1);
  }
  process.stdout.write('sync-settings-template: template matches the plugin manifest\n');
}

main();
