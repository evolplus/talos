#!/usr/bin/env node
// SessionStart hook: remove only dispatch journals that are provably finalized.
//
// A finalization is provable when:
//   - the Orchestrator recorded finalization.state=finalized and main_commit;
//   - main_commit is an ancestor of the current HEAD; and
//   - the journaled worktree no longer exists.
//
// Everything else remains available to §14 crash-recovery reconciliation.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const JOURNAL_DIR = path.join(ROOT, '.claude', 'dispatch-journal');
const WORKTREES_DIR = path.join(ROOT, '.worktrees');

function commitIsInCurrentHistory(commit) {
  if (!/^[0-9a-f]{40,64}$/i.test(commit || '')) return false;
  try {
    execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', commit, 'HEAD'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function worktreeIsGone(worktree) {
  if (!worktree) return true;
  if (typeof worktree !== 'string') return false;

  const resolved = path.resolve(ROOT, worktree);
  const relative = path.relative(WORKTREES_DIR, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;

  try {
    return !fs.existsSync(resolved);
  } catch {
    return false;
  }
}

function collectFinalizedJournals() {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  let names;
  try {
    names = fs.readdirSync(JOURNAL_DIR).filter(name => name.endsWith('.json'));
  } catch {
    return [];
  }

  const removed = [];
  for (const name of names) {
    const journalPath = path.join(JOURNAL_DIR, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    } catch {
      continue;
    }

    const finalization = record && record.finalization;
    if (!finalization || finalization.state !== 'finalized') continue;
    if (!commitIsInCurrentHistory(finalization.main_commit)) continue;
    if (!worktreeIsGone(record.worktree)) continue;

    try {
      fs.unlinkSync(journalPath);
      removed.push(name);
    } catch {
      // Fail open. The summary hook will surface the surviving journal.
    }
  }

  return removed;
}

async function main() {
  for await (const _chunk of process.stdin) {
    // Drain the SessionStart event.
  }

  const removed = collectFinalizedJournals();
  if (removed.length > 0) {
    process.stdout.write(
      `[orchestrator] Garbage-collected ${removed.length} finalized dispatch journal entr${removed.length === 1 ? 'y' : 'ies'}: ${removed.join(', ')}\n`,
    );
  }
}

module.exports = { collectFinalizedJournals };

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`dispatch-journal-gc: error: ${error && error.stack || error}\n`);
    process.exit(0);
  });
}
