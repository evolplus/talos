#!/usr/bin/env node
// hooks/unpromoted-dispatch-audit.cjs
//
// Multi-event hook: makes an unpromoted dispatch impossible to leave behind
// quietly. Companion to worktree-promotion-guard.cjs — that guard covers the
// destructive moment (a teardown command), this one covers the PASSIVE failure:
// nobody ran a teardown, the finalization transaction simply never completed,
// and the turn ended with the dispatch's content still only in the worktree.
//
// Events:
//   Stop              — BLOCK (exit 2). The Orchestrator may not end a turn
//                       while a completed dispatch is unpromoted.
//   SessionStart      — report to stdout (becomes session context).
//   UserPromptSubmit  — report to stdout (becomes turn context).
//
// The Stop gate exists for the autonomous loop (rules/autonomous-loop.md §15).
// An unattended run has no operator watching any single iteration, so an
// unfinished finalization in iteration 3 would surface — if ever — many
// iterations later, after the worktree was cleaned up. Worse, the plan file
// would read `ready-for-deploy` while main never received the code, so
// downstream iterations would dispatch work against artifacts that do not
// exist. That is the exact shape of this kit's FR-022 batch-UI silent drop.
//
// In-flight dispatches are never flagged: a journal entry with no
// plan-update.json means the sub-agent is still working, which is normal.
//
// Loop safety: Claude Code sets `stop_hook_active: true` on a Stop event that
// is itself a continuation of a prior Stop block. That one is allowed through
// so a wedged situation cannot trap the session — the audit still prints.
//
// Escape hatch: CLAUDE_SKIP_PROMOTION_AUDIT=1. Fail-open on every error.

'use strict';

const path = require('path');

let L;
try {
  L = require(path.join(__dirname, 'lib', 'kit-lineage.cjs'));
} catch {
  L = null;  // lineage detection unavailable -> enforce normally
}

let S;
try {
  S = require(path.join(__dirname, 'lib', 'dispatch-promotion-state.cjs'));
} catch (e) {
  process.stderr.write(
    `unpromoted-dispatch-audit: cannot load lib/dispatch-promotion-state.cjs (${e.message}) — failing open\n`
  );
  process.exit(0);
}

const LABEL = {
  'ready-to-finalize':
    'signaled done; finalization not proven — content is NOT on main',
  'partially-promoted':
    'finalization claims success but manifest paths are missing/differing on HEAD',
  'unverifiable':
    'signaled done with no `artifacts` manifest — promotion cannot be verified',
  'orphaned':
    'worktree gone, journal entry left unfinalized — residue to review, not to delete',
};

function render(entries) {
  const L = [];
  L.push(`[promotion-audit] ${entries.length} dispatch(es) not provably promoted to main:`);
  for (const e of entries) {
    L.push(`  - ${e.role}/${e.taskId}  [${e.state}]  ${LABEL[e.state] || ''}`);
    if (e.unpromoted) {
      for (const p of e.unpromoted.missing.slice(0, 6)) L.push(`      MISSING on HEAD:   ${p}`);
      for (const p of e.unpromoted.differing.slice(0, 6)) L.push(`      DIFFERS from HEAD: ${p}`);
    }
    if (e.state === 'unverifiable') {
      L.push(`      add "artifacts": ["<path>", …] to ${e.paths.planUpdatePath}`);
    }
  }
  L.push('');
  L.push('  Complete the §9 Step 7 finalization transaction for each: promote the manifest paths');
  L.push('  by path-scoped ingestion (never git merge — local-worktree-git-guard blocks it), apply');
  L.push('  the plan transition, make ONE finalization commit containing both, write');
  L.push('  finalization={"state":"finalized","main_commit":"<full SHA>"}, verify with');
  L.push('  `git merge-base --is-ancestor <main_commit> HEAD`, and only then remove the worktree.');
  L.push('  A detached worktree removed before promotion takes its commits with it — no ref, no recovery.');
  return L.join('\n');
}

async function main() {
  // Lineage exclusivity: this guard enforces the "ingestion" integration model.
  // If the project declares the other model, enforcing here would forbid the
  // step that project's own rules mandate, leaving a dispatch no legal way to
  // close. Unknown lineage => enforce normally.
  if (L && L.shouldStandDown('ingestion')) {
    process.stderr.write(L.standDownNotice('ingestion', 'unpromoted-dispatch-audit'));
    process.exit(0);
  }

  if (process.env.CLAUDE_SKIP_PROMOTION_AUDIT === '1') process.exit(0);

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  let event = {};
  if (raw.trim()) {
    try {
      event = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(
        `unpromoted-dispatch-audit: malformed event JSON (${e.message}) — failing open\n`
      );
      process.exit(0);
    }
  }

  const eventName = event.hook_event_name || event.hook_event || '';
  const entries = S.auditDispatches();
  if (entries.length === 0) process.exit(0);

  const body = render(entries);

  if (eventName === 'Stop') {
    // Orphans are residue for review, not something the current turn can fix;
    // they should not hold a turn hostage. Only live, blocking dispatches do.
    const blocking = entries.filter(e => S.isBlocking(e.state));
    if (blocking.length === 0) {
      process.stdout.write(body + '\n');
      process.exit(0);
    }
    if (event.stop_hook_active === true) {
      process.stderr.write(
        body +
          '\n\n[promotion-audit] stop_hook_active — not blocking again this turn, but the\n' +
          '  dispatch(es) above are still unpromoted and their content is still at risk.\n'
      );
      process.exit(0);
    }
    process.stderr.write(
      body +
        '\n\n  This turn is not finished: finalize the dispatch(es) above (or state explicitly why\n' +
        '  the work is throwaway) before yielding. Escape hatch: CLAUDE_SKIP_PROMOTION_AUDIT=1.\n'
    );
    process.exit(2);
  }

  process.stdout.write(body + '\n');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(
    `unpromoted-dispatch-audit: unexpected error: ${(err && err.stack) || err} — failing open\n`
  );
  process.exit(0);
});
