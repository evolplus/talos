#!/usr/bin/env node
// hooks/lib/dispatch-promotion-state.cjs
//
// Shared classifier for the kit's PROMOTION invariant
// (rules/worktree-isolation.md §5 rule 5, rules/orchestrator-operating-rules.md
//  §9 Step 7 finalization transaction, rules/crash-recovery.md §14.2).
//
// WHY THIS IS NOT A MERGE CHECK
// This kit deliberately does NOT integrate agent work by git. Code roles run in
// a DETACHED worktree (`git worktree add --detach`), commit there only to make
// the tree clean before signaling, and their local history is discarded with
// the worktree — `local-worktree-git-guard.cjs` blocks push/merge/cherry-pick
// /rebase of `.worktrees/` and `agent/*` history on purpose. Integration is
// **path-scoped ingestion**: the Orchestrator copies approved file paths from
// the worktree into main and commits them together with the plan transition.
//
// That makes the failure mode sharper than an unmerged branch, not softer. A
// detached worktree has no ref: once `git worktree remove --force` runs, its
// commits are unreachable with no branch name to recover from. An unmerged
// branch at least leaves a named reflog entry. So "was this dispatch's content
// actually promoted before teardown?" has to be answerable mechanically, and
// this lib is where that answer lives.
//
// Promotion is proven by three independent facts, all required:
//   1. the journal's finalization marker says `finalized` with a full SHA;
//   2. that SHA is an ancestor of current HEAD (the commit really landed);
//   3. every path in the dispatch's promotion manifest exists on HEAD and its
//      content matches the worktree copy (nothing was silently dropped).
//
// Fact 3 is the one that catches a PARTIAL promotion — the failure the kit has
// already been bitten by once (the FR-022 batch-UI silent drop, where a role
// shipped 3 of 4 DoD scopes and claimed all 4). Facts 1 and 2 only prove that
// *a* commit happened, not that it contained everything.
//
// Every function is fail-soft: on any git/fs error it returns null or an empty
// result so callers fail open. A guard that crashes must not block work.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// <role>-<task-id>  e.g. be-dev-T-042
const DISPATCH_DIR_RE = /^([a-z0-9][a-z0-9-]*?)-([A-Za-z]+-\d+)$/;

// Roles the kit dispatches into a physical detached worktree. Their artifacts
// are the ones that need promotion; logical roles write main directly.
const PHYSICAL_ROLES = new Set(['be-dev', 'fe-dev', 'devops', 'qa-exec']);

function projectDir() {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd: cwd || projectDir(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function gitOk(args, cwd) {
  try {
    execFileSync('git', args, { cwd: cwd || projectDir(), stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isRepo(cwd) {
  return git(['rev-parse', '--git-dir'], cwd) !== null;
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function existsSafe(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// Accepts `.worktrees/<role>-<task-id>[/...]` or a bare `<role>-<task-id>`.
function parseDispatchRef(spec) {
  if (typeof spec !== 'string' || !spec.trim()) return null;
  const s = spec.trim().replace(/^['"]|['"]$/g, '');
  const wt = /(?:^|\/)\.worktrees\/([^/]+)/.exec(s);
  const candidate = wt ? wt[1] : s;
  const m = DISPATCH_DIR_RE.exec(candidate);
  return m ? { role: m[1], taskId: m[2] } : null;
}

function dispatchPaths(role, taskId, root) {
  const base = root || projectDir();
  const worktree = path.join(base, '.worktrees', `${role}-${taskId}`);
  return {
    root: base,
    worktreePath: worktree,
    journalPath: path.join(base, '.claude', 'dispatch-journal', `${role}-${taskId}.json`),
    planUpdatePath: path.join(worktree, 'plan-update.json'),
  };
}

// The promotion manifest: the paths this dispatch produced that MUST be on main
// before its worktree is destroyed. Source of truth is plan-update.json's
// `artifacts` array (rules/worktree-isolation.md §5 rule 3).
function promotionManifest(paths) {
  const pu = readJsonSafe(paths.planUpdatePath);
  if (!pu || !Array.isArray(pu.artifacts)) return null;
  return pu.artifacts.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim());
}

// Which manifest paths are not yet promoted, and why. `missing` = absent from
// HEAD entirely; `differing` = present but its content differs from the
// worktree copy (a partial or stale promotion).
function unpromotedPaths(paths, manifest) {
  if (!manifest || manifest.length === 0) return { missing: [], differing: [], checked: 0 };
  const missing = [];
  const differing = [];
  for (const rel of manifest) {
    // Reject traversal / absolute specs rather than resolving them.
    if (rel.startsWith('/') || rel.split('/').includes('..')) continue;
    const onHead = git(['show', `HEAD:${rel}`], paths.root);
    if (onHead === null) {
      missing.push(rel);
      continue;
    }
    const wtFile = path.join(paths.worktreePath, rel);
    if (!existsSafe(wtFile)) continue; // nothing to compare against
    let wtContent = null;
    try { wtContent = fs.readFileSync(wtFile, 'utf8').trim(); } catch { wtContent = null; }
    if (wtContent !== null && wtContent !== onHead) differing.push(rel);
  }
  return { missing, differing, checked: manifest.length };
}

// Lifecycle classification.
//
//   promoted           — finalization marker finalized, its SHA is an ancestor
//                        of HEAD, and no manifest path is missing/differing.
//                        Teardown is safe.
//   in-flight          — journal entry, no plan-update.json. The sub-agent is
//                        still working; teardown here is the crash-recovery
//                        §14.4 discard of untrusted partial work. Allowed.
//   ready-to-finalize  — plan-update.json present, finalization not yet proven.
//                        The dispatch is DONE but its content is not on main.
//                        Teardown destroys it irrecoverably. Blocked.
//   partially-promoted — finalization claims finalized, but manifest paths are
//                        missing from or differ on HEAD. The dangerous one:
//                        every bookkeeping signal says success. Blocked.
//   unverifiable       — completed dispatch with no `artifacts` manifest, so
//                        fact 3 cannot be evaluated. Treated as blocking:
//                        absence of an enforcement artifact is a closure
//                        blocker, not a vacuous pass.
//   orphaned           — worktree gone, journal entry left behind unfinalized.
//                        Residue; surfaced, never auto-deleted.
//   unknown            — not a repo / no such dispatch. Callers fail open.
function classifyDispatch(role, taskId, root) {
  const paths = dispatchPaths(role, taskId, root);
  if (!isRepo(paths.root)) {
    return { state: 'unknown', role, taskId, paths };
  }

  const journal = readJsonSafe(paths.journalPath);
  const journalExists = existsSafe(paths.journalPath);
  const worktreeExists = existsSafe(paths.worktreePath);
  const planUpdateExists = existsSafe(paths.planUpdatePath);

  const fin = (journal && journal.finalization) || {};
  const mainCommit = typeof fin.main_commit === 'string' ? fin.main_commit : null;
  const claimsFinalized = fin.state === 'finalized' && !!mainCommit;
  const commitInHead = mainCommit
    ? gitOk(['merge-base', '--is-ancestor', mainCommit, 'HEAD'], paths.root)
    : false;

  const base = {
    role, taskId, paths, journalExists, worktreeExists, planUpdateExists,
    claimsFinalized, mainCommit, commitInHead,
  };

  if (!worktreeExists && !planUpdateExists) {
    if (journalExists && !(claimsFinalized && commitInHead)) {
      return { ...base, state: 'orphaned' };
    }
    return { ...base, state: 'unknown' };
  }

  if (!planUpdateExists) {
    return { ...base, state: journalExists ? 'in-flight' : 'unknown' };
  }

  const manifest = promotionManifest(paths);
  if (manifest === null) {
    // No manifest to check. If the role isn't one that produces promotable
    // worktree artifacts, there is nothing to verify.
    if (!PHYSICAL_ROLES.has(role) && claimsFinalized && commitInHead) {
      return { ...base, state: 'promoted', manifest: [], unpromoted: null };
    }
    return { ...base, state: 'unverifiable', manifest: null, unpromoted: null };
  }

  const unpromoted = unpromotedPaths(paths, manifest);
  const anyUnpromoted = unpromoted.missing.length > 0 || unpromoted.differing.length > 0;

  if (!claimsFinalized || !commitInHead) {
    return { ...base, state: 'ready-to-finalize', manifest, unpromoted };
  }
  if (anyUnpromoted) {
    return { ...base, state: 'partially-promoted', manifest, unpromoted };
  }
  return { ...base, state: 'promoted', manifest, unpromoted };
}

const BLOCKING_STATES = new Set([
  'ready-to-finalize',
  'partially-promoted',
  'unverifiable',
]);

function isBlocking(state) {
  return BLOCKING_STATES.has(state);
}

function listDispatches(root) {
  const base = root || projectDir();
  const out = [];
  const seen = new Set();
  for (const dir of [path.join(base, '.worktrees'), path.join(base, '.claude', 'dispatch-journal')]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      const stem = n.replace(/\.json$/, '');
      const m = DISPATCH_DIR_RE.exec(stem);
      if (!m || seen.has(stem)) continue;
      seen.add(stem);
      out.push({ role: m[1], taskId: m[2] });
    }
  }
  return out;
}

// Every dispatch whose content is not provably on main, classified.
function auditDispatches(root) {
  const base = root || projectDir();
  if (!isRepo(base)) return [];
  return listDispatches(base)
    .map(d => classifyDispatch(d.role, d.taskId, base))
    .filter(c => isBlocking(c.state) || c.state === 'orphaned');
}

module.exports = {
  BLOCKING_STATES,
  DISPATCH_DIR_RE,
  PHYSICAL_ROLES,
  auditDispatches,
  classifyDispatch,
  dispatchPaths,
  git,
  isBlocking,
  isRepo,
  listDispatches,
  parseDispatchRef,
  projectDir,
  promotionManifest,
  unpromotedPaths,
};
