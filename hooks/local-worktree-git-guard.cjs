#!/usr/bin/env node
// .claude/hooks/local-worktree-git-guard.cjs
// PreToolUse hook: keeps SDLC agent worktrees local-only.
//
// Agent worktrees under .worktrees/<role>-<task-id>/ are scratch execution
// areas. Their Git history is not a deliverable branch: it must not be pushed,
// merged, cherry-picked, rebased, or pulled into main. The Orchestrator promotes
// validated files by path-scoped artifact ingestion, then commits the promoted
// result on the main worktree.

'use strict';

const WORKTREE_RE = /(^|[\s"'=:/])\.worktrees\/[^/\s"';&|]+(?:[\/\s"';&|]|$)/;
const LOCAL_BRANCH_RE = /\b(?:agent|local-agent)\/[A-Za-z0-9._/-]+/;

function normalize(v) {
  return (v || '').toString();
}

function isWorktreePath(s) {
  return WORKTREE_RE.test(normalize(s));
}

function hasGitVerb(cmd, verb) {
  const re = new RegExp(String.raw`\bgit\b[\s\S]*?\b${verb}\b`, 'i');
  return re.test(cmd);
}

function referencesLocalAgentBranch(cmd) {
  return LOCAL_BRANCH_RE.test(cmd);
}

function hasBranchBackedWorktreeAdd(cmd) {
  return /\bgit\b[\s\S]*?\bworktree\s+add\b[\s\S]*?(?:\s-[bB]\s+\S+|\s--branch(?:=|\s+)\S+)/i.test(cmd);
}

function classifyBlockedCommand(cmd, cwd) {
  const scopedToWorktree = isWorktreePath(cwd) || isWorktreePath(cmd);
  const localBranchRef = referencesLocalAgentBranch(cmd);

  if (hasBranchBackedWorktreeAdd(cmd) && (scopedToWorktree || localBranchRef)) {
    return 'agent worktrees must be created as detached local worktrees, not branch-backed branches';
  }

  if (scopedToWorktree && hasGitVerb(cmd, 'push')) {
    return 'git push from or against .worktrees is forbidden; agent worktrees are local-only scratch spaces';
  }

  if (scopedToWorktree && hasGitVerb(cmd, 'pull')) {
    return 'git pull in .worktrees is forbidden; recreate the local worktree from the current main/base ref instead';
  }

  if (scopedToWorktree && hasGitVerb(cmd, 'merge')) {
    return 'git merge in .worktrees is forbidden; worktree commits are not integration branches';
  }

  if (scopedToWorktree && hasGitVerb(cmd, 'rebase')) {
    return 'git rebase in .worktrees is forbidden; recreate the local worktree from the current main/base ref instead';
  }

  if (scopedToWorktree && hasGitVerb(cmd, 'cherry-pick')) {
    return 'git cherry-pick in .worktrees is forbidden; promote validated file content by path-scoped ingestion';
  }

  if (localBranchRef && hasGitVerb(cmd, 'push')) {
    return 'pushing agent/local-agent branches is forbidden; these branches must never reach the remote';
  }

  if (localBranchRef && hasGitVerb(cmd, 'merge')) {
    return 'merging agent/local-agent branches is forbidden; promote validated file content by path-scoped ingestion';
  }

  if (localBranchRef && hasGitVerb(cmd, 'cherry-pick')) {
    return 'cherry-picking agent/local-agent branch history is forbidden; promote validated file content by path-scoped ingestion';
  }

  return null;
}

async function main() {
  if (process.env.CLAUDE_ALLOW_LOCAL_WORKTREE_GIT === '1') {
    process.stderr.write(
      'local-worktree-git-guard: CLAUDE_ALLOW_LOCAL_WORKTREE_GIT=1 set - bypass active.\n' +
      '  Use only for an operator-explicit repair. Do not push or merge agent worktree history routinely.\n'
    );
    process.exit(0);
  }

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try { event = JSON.parse(raw); }
  catch (e) {
    process.stderr.write('local-worktree-git-guard: malformed event JSON: ' + e.message + ' - failing open\n');
    process.exit(0);
  }

  if (event.tool_name !== 'Bash') process.exit(0);

  const cmd = normalize(event.tool_input && event.tool_input.command);
  if (!cmd.trim() || !/\bgit\b/i.test(cmd)) process.exit(0);

  const cwd = normalize(event.cwd || process.cwd());
  const reason = classifyBlockedCommand(cmd, cwd);
  if (!reason) process.exit(0);

  const displayCmd = cmd.length > 220 ? cmd.slice(0, 220) + ' ...' : cmd;
  process.stderr.write(
    'local-worktree-git-guard: BLOCKED - local agent worktree Git history cannot be promoted or synced.\n' +
    '  Command: ' + displayCmd + '\n' +
    '  cwd: ' + (cwd || '(not provided)') + '\n' +
    '  Why blocked: ' + reason + '\n\n' +
    '  Correct flow:\n' +
    '    1. Create agent worktrees with git worktree add --detach .worktrees/<role>-<task-id>/ <base-ref>.\n' +
    '    2. Sub-agents may commit locally only to make their worktree clean before plan-update.json.\n' +
    '    3. The Orchestrator ingests validated files/pathspecs into main and commits the result there.\n' +
    '    4. Remove the worktree; do not push, merge, or cherry-pick its local Git history.\n'
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write('local-worktree-git-guard: unexpected error: ' + (err && err.stack || err) + ' - failing open\n');
  process.exit(0);
});
