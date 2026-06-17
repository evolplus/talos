#!/usr/bin/env node
// .claude/hooks/task-completion-commit-check.cjs
// PreToolUse hook: enforces the kit's "commit before signaling done"
// invariant. When a sub-agent writes plan-update.json (the dispatch
// completion signal per worktree-isolation.md §5), verify the agent's
// worktree has no uncommitted changes — otherwise the dispatch is
// incomplete.
//
// Trigger:
//   - tool_name == 'Write' AND tool_input.file_path basename == 'plan-update.json'
//
// Action:
//   - exit 0: allow (worktree clean OR escape-hatch set OR not-a-repo)
//   - exit 2: block (uncommitted changes present)
//
// Escape hatch: CLAUDE_SKIP_COMMIT_CHECK=1 permits the write. Use for
// the rare cases where mid-dispatch commit is impossible (e.g., a
// dispatch that legitimately has zero changes — though git status
// returns clean in that case so the hook passes anyway).
//
// Fail-open: internal errors allow the write with a stderr warning.

'use strict';

const path = require('path');
const { execSync } = require('child_process');

function isPlanUpdate(filePath) {
  if (typeof filePath !== 'string') return false;
  return path.basename(filePath) === 'plan-update.json';
}

function getDirtyFiles(cwd) {
  // Returns array of "X  path" lines from git status --porcelain, or null
  // if the directory isn't a git repo / git is unavailable.
  try {
    const out = execSync('git status --porcelain', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

async function main() {
  // Escape hatch
  if (process.env.CLAUDE_SKIP_COMMIT_CHECK === '1') {
    process.stderr.write(
      'task-completion-commit-check: CLAUDE_SKIP_COMMIT_CHECK=1 set — bypass active.\n'
    );
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
    process.stderr.write(
      `task-completion-commit-check: malformed event JSON: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  if (toolName !== 'Write') process.exit(0);

  const toolInput = event.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!isPlanUpdate(filePath)) process.exit(0);

  // Determine cwd to inspect. The agent writes plan-update.json in its
  // own worktree; the parent dir of the proposed file is the right place
  // to ask `git status`. CWD also works as fallback.
  const inspectDir = path.dirname(path.resolve(filePath));
  const dirty = getDirtyFiles(inspectDir);

  // Not a git repo OR git unavailable → fail open (preflight Step 0 will
  // catch the missing-repo case on the orchestrator side).
  if (dirty === null) process.exit(0);

  // Filter: the plan-update.json itself isn't committed yet (it's being
  // written right now). Ignore it from the dirty list.
  const ignored = dirty.filter(line => {
    const file = line.slice(3).trim(); // status code is 2 chars + 1 space
    return path.basename(file) === 'plan-update.json';
  });
  const actualDirty = dirty.filter(line => !ignored.includes(line));

  if (actualDirty.length === 0) process.exit(0);

  // Block
  process.stderr.write(
    `task-completion-commit-check: BLOCKED — you have ${actualDirty.length} uncommitted change(s)\n` +
    `  in your worktree but you're about to write plan-update.json (the dispatch\n` +
    `  completion signal). Per the kit's per-role Hard Rule "Commit before signaling done"\n` +
    `  + .claude/skills/git-commit/SKILL.md discipline, you MUST commit your work\n` +
    `  BEFORE signaling done.\n\n` +
    `  Uncommitted changes:\n`
  );
  for (const line of actualDirty.slice(0, 30)) {
    process.stderr.write(`    ${line}\n`);
  }
  if (actualDirty.length > 30) {
    process.stderr.write(`    ... and ${actualDirty.length - 30} more.\n`);
  }
  process.stderr.write(
    `\n  Fix:\n` +
    `    git add <files>\n` +
    `    git commit -m "<type>(<scope>): <subject>  (T-NNN)"\n\n` +
    `  Conventional-commits format (see .claude/skills/git-commit/SKILL.md):\n` +
    `    - Type: feat | fix | docs | refactor | test | chore  (NO 'chore'/'docs' for .claude/* per CLAUDE.md guidance)\n` +
    `    - Scope: the area touched (e.g., 'ba', 'sa', 'hooks', 'skills')\n` +
    `    - Subject: ≤72 chars, imperative mood\n` +
    `    - Task traceability: 'Refs: T-NNN' trailer OR '(T-NNN)' in subject\n\n` +
    `  Escape hatch (use sparingly, document rationale):\n` +
    `    export CLAUDE_SKIP_COMMIT_CHECK=1\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `task-completion-commit-check: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
