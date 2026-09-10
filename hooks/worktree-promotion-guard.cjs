#!/usr/bin/env node
// hooks/worktree-promotion-guard.cjs
//
// PreToolUse (Bash) hook: refuses to destroy a dispatch worktree whose content
// is not provably on main.
//
// This kit integrates agent work by PATH-SCOPED INGESTION, not by git — code
// roles run in a detached worktree and `local-worktree-git-guard.cjs` blocks
// push/merge/cherry-pick of that history by design. The two guards are
// complements, not duplicates:
//
//   local-worktree-git-guard  — "you may not promote worktree history VIA GIT"
//   worktree-promotion-guard  — "you may not DESTROY the worktree until its
//                                content has actually been promoted"
//
// Without the second one, the first one's correct prohibition has no
// counterpart: the only sanctioned integration path (ingestion) is prose in
// §9 Step 7, while the teardown commands that end the dispatch are spelled out
// verbatim in rule 7 and explicitly permitted by the Bash guard. A step
// described in prose, paired with a step shipped as a command, is the step that
// gets skipped — and a detached worktree leaves no ref behind, so its commits
// are unreachable the moment it is removed. There is no branch name to recover
// from and no reflog entry to find.
//
// Blocks (when promotion is unproven and the dispatch has COMPLETED):
//   - git worktree remove [--force] .worktrees/<role>-<task-id>
//   - rm -rf .worktrees/<role>-<task-id>
//
// Deliberately allowed:
//   - proven promotion (finalization marker finalized + SHA in HEAD history +
//     every manifest path present and matching on HEAD)
//   - in-flight discard (journal entry, no plan-update.json) — crash-recovery
//     §14.4, where partial work IS throwaway because exit criteria never ran
//   - unparseable targets, non-repo, malformed events (fail open)
//
// Escape hatches:
//   CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1     operator-explicit destruction of
//                                         completed, unpromoted work
//   CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1 crash-recovery discard when the
//                                         journal entry is already gone
//
// Exit codes: 0 allow, 2 block.

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
    `worktree-promotion-guard: cannot load lib/dispatch-promotion-state.cjs (${e.message}) — failing open\n`
  );
  process.exit(0);
}

function collectTeardownTargets(cmd) {
  const targets = [];
  const push = (spec, kind) => {
    const parsed = S.parseDispatchRef(spec);
    if (parsed) targets.push({ ...parsed, kind, spec: spec.trim() });
  };

  // git worktree remove [flags] <path>
  const wtRe = /\bgit\s+(?:-C\s+\S+\s+)?worktree\s+remove\b([^&|;\n]*)/g;
  for (let m; (m = wtRe.exec(cmd)); ) {
    for (const tok of m[1].split(/\s+/)) {
      if (tok && !tok.startsWith('-')) push(tok, 'git worktree remove');
    }
  }

  // rm [flags] [--] <path...>  — only .worktrees targets are ours
  const rmRe = /\brm\s+((?:-{1,2}[A-Za-z-]*\s+)*)([^&|;\n]*)/g;
  for (let m; (m = rmRe.exec(cmd)); ) {
    for (const tok of m[2].split(/\s+/)) {
      if (tok && tok !== '--' && !tok.startsWith('-') && tok.includes('.worktrees/')) {
        push(tok, 'rm');
      }
    }
  }

  const seen = new Set();
  return targets.filter(t => {
    const k = `${t.kind}|${t.role}|${t.taskId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const WHY = {
  'ready-to-finalize':
    'the dispatch signaled done (plan-update.json present) but finalization is not proven — ' +
    'its content is NOT on main yet',
  'partially-promoted':
    'finalization claims success, but manifest paths are missing from or differ on HEAD — ' +
    'a PARTIAL promotion, where every bookkeeping signal reads green',
  'unverifiable':
    'the dispatch signaled done but plan-update.json carries no `artifacts` manifest, ' +
    'so promotion cannot be verified at all',
};

function blockMessage(findings) {
  const L = [];
  L.push(
    `worktree-promotion-guard: BLOCKED — teardown of ${findings.length} dispatch worktree(s) whose\n` +
    `  content is not provably promoted to main. These worktrees are DETACHED: removing one\n` +
    `  leaves no branch and no ref, so its commits become unreachable immediately. There is\n` +
    `  nothing to recover from afterwards.\n`
  );
  for (const f of findings) {
    L.push(`  ${f.role}/${f.taskId}  [${f.state}]`);
    L.push(`    triggered by: ${f.kind} ${f.spec}`);
    L.push(`    why: ${WHY[f.state] || f.state}`);
    if (f.mainCommit) {
      L.push(`    finalization.main_commit: ${f.mainCommit} (in HEAD history: ${f.commitInHead ? 'yes' : 'NO'})`);
    } else {
      L.push(`    finalization.main_commit: (unset)`);
    }
    if (f.unpromoted) {
      for (const p of f.unpromoted.missing.slice(0, 10)) L.push(`      MISSING on HEAD:   ${p}`);
      for (const p of f.unpromoted.differing.slice(0, 10)) L.push(`      DIFFERS from HEAD: ${p}`);
    }
    if (f.state === 'unverifiable') {
      L.push(`      add "artifacts": ["<path>", …] to ${f.paths.planUpdatePath}`);
    }
    L.push('');
  }
  L.push(
    `  Fix — run the §9 Step 7 finalization transaction, in order, BEFORE teardown:\n` +
    `    1. validate exit criteria\n` +
    `    2. promote every path in the artifacts manifest from the worktree into main\n` +
    `       (path-scoped ingestion — NOT git merge/cherry-pick, which local-worktree-git-guard\n` +
    `        blocks on purpose: worktree history is never an integration branch)\n` +
    `    3. apply the docs/plan/ transition from plan-update.json\n` +
    `    4. stage promoted artifacts + plan updates TOGETHER; make ONE finalization commit\n` +
    `    5. write finalization = {"state":"finalized","main_commit":"<full SHA>"} to the journal\n` +
    `    6. VERIFY, then tear down:\n` +
    `         git merge-base --is-ancestor <main_commit> HEAD    # must exit 0\n` +
    `         git show HEAD:<each manifest path>                  # must match the worktree copy\n` +
    `    7. remove the worktree, then delete the journal entry LAST\n\n` +
    `  Never commit a ready-for-deploy / in-test / done / failed transition before the matching\n` +
    `  artifacts are on main (rules/orchestrator-operating-rules.md §9 Step 7).\n\n` +
    `  If this work genuinely IS throwaway (interrupted dispatch, exit criteria never ran):\n` +
    `    CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1\n` +
    `    CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1   (operator override; destroys completed work —\n` +
    `                                         document rationale in SRS §10 Changelog)\n`
  );
  return L.join('\n');
}

async function main() {
  // Lineage exclusivity: this guard enforces the "ingestion" integration model.
  // If the project declares the other model, enforcing here would forbid the
  // step that project's own rules mandate, leaving a dispatch no legal way to
  // close. Unknown lineage => enforce normally.
  if (L && L.shouldStandDown('ingestion')) {
    process.stderr.write(L.standDownNotice('ingestion', 'worktree-promotion-guard'));
    process.exit(0);
  }

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`worktree-promotion-guard: malformed event JSON (${e.message}) — failing open\n`);
    process.exit(0);
  }

  if ((event.tool_name || '') !== 'Bash') process.exit(0);
  const cmd = (event.tool_input && event.tool_input.command) || '';
  if (typeof cmd !== 'string' || !cmd.trim()) process.exit(0);

  const targets = collectTeardownTargets(cmd);
  if (targets.length === 0) process.exit(0);

  if (process.env.CLAUDE_ALLOW_UNPROMOTED_CLEANUP === '1') {
    process.stderr.write(
      'worktree-promotion-guard: CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1 — bypass active. ' +
      'Unpromoted content in the removed worktree(s) is unrecoverable.\n'
    );
    process.exit(0);
  }

  const findings = [];
  for (const t of targets) {
    const c = S.classifyDispatch(t.role, t.taskId);
    if (c.state === 'promoted' || c.state === 'unknown' || c.state === 'orphaned') continue;
    if (c.state === 'in-flight' || process.env.CLAUDE_DISCARD_INTERRUPTED_DISPATCH === '1') {
      process.stderr.write(
        `worktree-promotion-guard: allowing discard of ${t.role}/${t.taskId} (${c.state}) ` +
        `— crash-recovery §14.4: exit criteria never ran, partial work is throwaway.\n`
      );
      continue;
    }
    findings.push({ ...c, kind: t.kind, spec: t.spec });
  }

  if (findings.length === 0) process.exit(0);

  process.stderr.write(blockMessage(findings));
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `worktree-promotion-guard: unexpected error: ${(err && err.stack) || err} — failing open\n`
  );
  process.exit(0);
});
