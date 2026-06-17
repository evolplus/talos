#!/usr/bin/env node
// .claude/hooks/orchestrator-bash-guard.cjs
// PreToolUse hook: blocks state-mutating Bash commands from Orchestrator
// context (cwd outside .worktrees/<role>-<task-id>/).
//
// Per CLAUDE.md §10 Hard Rule: "Orchestrator is a pure router — read state +
// dispatch sub-agents." State-mutating Bash (package installers, docker
// compose mutations, DB DML/DDL, HTTP mutations, FS destructive ops, git
// push, etc.) is sub-agent territory (BE Dev / FE Dev / DevOps / QA-Exec /
// debugger). Sub-agents run these from inside their worktree; this hook
// detects sub-agent context via `event.cwd` containing `.worktrees/<*>/`.
//
// Block-by-pattern approach (NOT block-by-default). Bash has a huge surface;
// a strict allow-list would block legitimate inspection commands. Instead we
// block known mutation patterns. The kit's prose rule (CLAUDE.md §10) is the
// authoritative control; this hook is best-effort defense-in-depth for the
// most common operator-tempting mutations.
//
// Gate semantics:
//   - event.cwd contains `.worktrees/<*>/`            → sub-agent context → ALLOW.
//   - Command matches no mutating pattern             → ALLOW.
//   - Command matches a mutating pattern              → BLOCK with stderr message.
//   - CLAUDE_ALLOW_ORCHESTRATOR_BASH=1 escape hatch   → ALLOW with warning.
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, cwd, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Note: the pattern list is deliberately conservative. Edge cases not covered:
// heredoc-piped writes (`cat <<EOF | sh`), Bash function definitions wrapping
// mutations, subshells with `$()`. The prose rule is the authoritative control.

'use strict';

const { isOperationWorktreeScoped } = require('./lib/worktree-scope.cjs');

// ─── Sub-agent context detection ───
// Worktree-scope detection (cwd-based AND command-based) lives in the shared
// lib so source-code-write-guard and this guard agree. A command counts as
// sub-agent context when its cwd is inside `.worktrees/<role>-<task-id>/` OR it
// explicitly scopes itself into one (`cd .worktrees/<role>-<task-id> && ...`,
// `git -C`, `--prefix`, `make -C`). See lib/worktree-scope.cjs.

// ─── Mutating-command patterns ───
// Each entry: { re: pattern, why: human-explanation }
// Patterns match on the full command string. Use `\b` word boundaries and
// be specific to avoid false positives on filenames or comments.

const MUTATING_PATTERNS = [
  // ─── Package installers (lockfile + node_modules / site-packages mutations) ───
  { re: /\b(npm|yarn|pnpm)\s+(install|i|add|remove|uninstall|update|upgrade)(\s|$)/, why: 'package installer (mutates lockfile + dependency tree)' },
  { re: /\bpip3?\s+(install|uninstall|--upgrade)(\s|$)/, why: 'pip mutation (mutates site-packages)' },
  { re: /\bpoetry\s+(add|remove|install|update)(\s|$)/, why: 'poetry dependency mutation' },
  { re: /\bcargo\s+(add|remove|install|update)(\s|$)/, why: 'cargo dependency mutation' },
  { re: /\bgo\s+(get|install|mod\s+(tidy|download|edit))(\s|$)/, why: 'go module mutation' },
  { re: /\b(brew|apt|apt-get|yum|dnf|pacman|apk)\s+(install|remove|update|upgrade|add)(\s|$)/, why: 'system package manager' },
  { re: /\bgem\s+(install|uninstall|update)(\s|$)/, why: 'rubygems mutation' },

  // ─── Docker / Compose mutations ───
  // Project-scoped already gated by docker-scope-guard; this layer adds the
  // Orchestrator-vs-DevOps distinction (DevOps does deploys, Orchestrator routes).
  { re: /\bdocker\s+compose\s+(up|down|build|run|restart|start|stop|kill|exec|create)(\s|$)/, why: 'docker compose mutation — DevOps territory (dispatch DevOps via local-deployment skill)' },
  { re: /\bdocker-compose\s+(up|down|build|run|restart|start|stop|kill|exec|create)(\s|$)/, why: 'docker-compose mutation — DevOps territory' },
  { re: /\bdocker\s+(run|start|stop|kill|rm|exec|create|cp)(\s|$)/, why: 'docker container mutation — DevOps territory' },
  { re: /\bdocker\s+(build|push|pull|tag|rmi|load|save|import|commit)(\s|$)/, why: 'docker image mutation' },
  { re: /\bdocker\s+(volume|network)\s+(create|rm|prune|connect|disconnect)(\s|$)/, why: 'docker volume/network mutation' },
  { re: /\bdocker\s+system\s+prune(\s|$)/, why: 'docker system prune (catastrophic — kit-forbidden per CLAUDE.md §10)' },
  { re: /\bkubectl\s+(apply|create|delete|patch|edit|rollout|scale|exec|drain|cordon|uncordon)(\s|$)/, why: 'kubectl mutation' },
  { re: /\bhelm\s+(install|upgrade|delete|uninstall|rollback)(\s|$)/, why: 'helm mutation' },

  // ─── DB mutations (DML / DDL) ───
  { re: /\bpsql\b[^|]*?-c\s+["'`][\s\S]*?\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY)\b/i, why: 'psql DML/DDL — dispatch BE Dev or use a migration sub-agent' },
  { re: /\bpsql\b[^|]*?-f\s+\S+/, why: 'psql script execution (-f) — assumed mutating; dispatch BE Dev' },
  { re: /\bmysql\b[^|]*?-e\s+["'`][\s\S]*?\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i, why: 'mysql DML/DDL' },
  { re: /\bsqlite3?\b[^|]*?\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i, why: 'sqlite DML/DDL' },
  { re: /\bmongo(sh)?\b[^|]*?\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop|createCollection)\b/, why: 'MongoDB mutation' },
  { re: /\bredis-cli\b[^|]*?\b(SET|DEL|FLUSHDB|FLUSHALL|RENAME|RPUSH|LPUSH|HSET|SADD|ZADD)\b/i, why: 'redis mutation' },

  // ─── HTTP mutations ───
  { re: /\bcurl\b[^|]*?(-X|--request)\s+(POST|PUT|DELETE|PATCH)\b/i, why: 'curl HTTP mutation' },
  { re: /\bcurl\b[^|]*?\s(-d|--data|--data-raw|--data-binary|--data-urlencode)(\s|$)/, why: 'curl with data flag (implies POST/PUT)' },
  { re: /\bwget\b[^|]*?--(post-data|post-file|method=(POST|PUT|DELETE|PATCH))/i, why: 'wget HTTP mutation' },
  { re: /\bhttp\s+(POST|PUT|DELETE|PATCH)\b/i, why: 'httpie HTTP mutation' },

  // ─── FS destructive ops ───
  { re: /\brm\s+-[a-zA-Z]*[rRfF]/, why: 'rm with destructive flags (-r / -f) — sub-agent territory' },
  { re: /\brm\s+(?!-)/, why: 'rm without protective flags — sub-agent territory' },
  { re: /\bmv\s+(?!.*\/tmp\/|.*\.\.\/tmp\/)\S+/, why: 'mv (file move outside /tmp) — sub-agent territory' },
  { re: /\bshred\b/, why: 'shred (destructive overwrite)' },

  // ─── In-place file edits via bash tools ───
  { re: /\bsed\s+(-[a-z]*i|--in-place)/, why: 'sed in-place edit — use Write/Edit file tools instead (they route through validators)' },
  { re: /\bperl\s+-[a-z]*i/, why: 'perl in-place edit' },
  { re: /\bawk\s+-[a-z]*i/, why: 'awk in-place edit (gawk)' },
  { re: /\bex\s+-c\s+["'`]:wq/, why: 'ex/vi in-place edit' },

  // ─── Shell redirects to project paths (catches `echo > src/foo.ts` pattern) ───
  // Matches `>` or `>>` followed by a path that looks like project content.
  { re: />>?\s*\.?\.?\/?[\w./-]*\/?src\/[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rs|c|cpp|cc|cs|rb|php|swift|m|mm|dart|scala|vue|svelte)\b/, why: 'shell redirect to source-code file — use file tools (which route through source-code-write-guard)' },
  { re: />>?\s*\.?\.?\/?[\w./-]*\/?e2e\/[\w./-]+\.(spec|test)\.(ts|tsx|js|jsx|py|go|java|kt|rs)\b/, why: 'shell redirect to e2e spec — use file tools' },
  { re: />>?\s*\.?\.?\/?[\w./-]*\/?docs\/(?!plan\/|open-issues\.md|iteration-plan\/)/, why: 'shell redirect to docs/ (role-owned) — use file tools (routes through orchestrator-write-guard)' },
  { re: />>?\s*\.?\.?\/?\.env(\.\w+)?\b/, why: 'shell redirect to .env (operator-manual-edit only)' },
  { re: />>?\s*\.?\.?\/?[\w./-]*\/?(package|tsconfig|Cargo|go|pom)\.(json|toml|mod|xml)\b/, why: 'shell redirect to project config file — dispatch BE/FE Dev' },
  { re: />>?\s*\.?\.?\/?(Dockerfile|docker-compose\.ya?ml)\b/, why: 'shell redirect to Dockerfile / compose — dispatch DevOps' },
  { re: /\btee\s+(-[a-z]*\s+)?(?!\/tmp\/|.*\.\.\/tmp\/)\S+/, why: 'tee to non-temp path (writes file) — use file tools' },

  // ─── Git mutations (Orchestrator legitimately runs commit/add/init/worktree;
  //     everything else is sub-agent or operator territory) ───
  { re: /\bgit\s+push\b/, why: 'git push — Orchestrator does not push (operator pushes manually, or CI does)' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard (destructive — discards working tree)' },
  { re: /\bgit\s+rebase\s+(-i|--interactive)\b/, why: 'git interactive rebase (history-rewriting)' },
  { re: /\bgit\s+checkout\s+(--|HEAD --|-- )\s*\S+/, why: 'git checkout -- <path> (discards working-tree changes)' },
  { re: /\bgit\s+restore\s+(?!--staged)/, why: 'git restore (working-tree mutation)' },
  { re: /\bgit\s+stash\s+(drop|clear|pop)/, why: 'git stash drop / clear / pop (destructive)' },
  { re: /\bgit\s+clean\s+-/, why: 'git clean (destructive — deletes untracked)' },
  { re: /\bgit\s+(remote\s+(set-url|add|remove)|config\s+(?!--get|--list)\S+\s+\S+)/, why: 'git remote / config mutation' },
  { re: /\bgit\s+filter-(branch|repo)\b/, why: 'git history rewriting' },

  // ─── Permission mutations ───
  { re: /\bchmod\s+/, why: 'chmod (permission mutation)' },
  { re: /\bchown\s+/, why: 'chown (ownership mutation)' },
  { re: /\bchgrp\s+/, why: 'chgrp (group mutation)' },

  // ─── Build commands (produce artifacts; sub-agent territory) ───
  { re: /\b(npm|yarn|pnpm)\s+run\s+build\b/, why: 'production build — dispatch BE/FE Dev' },
  { re: /\bcargo\s+build(\s+--release)?\b/, why: 'cargo build — dispatch BE Dev' },
  { re: /\bgo\s+build\b/, why: 'go build — dispatch BE Dev' },
  { re: /\bmvn\s+(package|install|deploy)\b/, why: 'maven build/deploy' },
  { re: /\bgradle\s+(build|assemble|publish)\b/, why: 'gradle build' },
  { re: /\bmake\b(?!\s+(help|list|-n))/, why: 'make (likely builds — dispatch BE Dev unless explicitly read-only via -n / dry-run)' },

  // ─── Misc state mutations ───
  { re: /\bsystemctl\s+(start|stop|restart|reload|enable|disable)\b/, why: 'systemctl service mutation' },
  { re: /\b(service|launchctl)\s+(start|stop|restart|reload|kickstart)\b/, why: 'service mutation' },
  { re: /\bcrontab\s+(-e|-r)\b/, why: 'crontab mutation' },
];

function findMutatingMatch(cmd) {
  for (const { re, why } of MUTATING_PATTERNS) {
    if (re.test(cmd)) return why;
  }
  return null;
}

async function main() {
  // Escape hatch — operator-explicit permission for one-off ops.
  if (process.env.CLAUDE_ALLOW_ORCHESTRATOR_BASH === '1') {
    process.stderr.write(
      'orchestrator-bash-guard: CLAUDE_ALLOW_ORCHESTRATOR_BASH=1 set — bypass active.\n' +
      '  Use sparingly for genuine operator-explicit ops. Document rationale in SRS §10 Changelog.\n' +
      '  For routine work: dispatch the appropriate sub-agent (BE Dev / FE Dev / DevOps / QA-Exec / debugger).\n'
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
    process.stderr.write(`orchestrator-bash-guard: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  // Only fire on Bash
  if (event.tool_name !== 'Bash') process.exit(0);

  const cwd = (typeof event.cwd === 'string' ? event.cwd : process.cwd()) || '';
  const cmd = (event.tool_input && event.tool_input.command) || '';
  if (!cmd.trim()) process.exit(0);

  // Sub-agent context = worktree-scoped operation. Either the cwd is inside a
  // `.worktrees/<role>-<task-id>/` directory, OR the command explicitly scopes
  // itself into one. Unscoped mutations/builds run against the shared root tree
  // and are blocked — that shared-tree contamination is the cross-agent-conflict
  // risk this guard prevents. See .claude/hooks/lib/worktree-scope.cjs.
  if (isOperationWorktreeScoped(cwd, cmd)) process.exit(0);

  const reason = findMutatingMatch(cmd);
  if (!reason) process.exit(0);

  // Truncate command for display
  const displayCmd = cmd.length > 200 ? cmd.slice(0, 200) + ' …' : cmd;

  process.stderr.write(
    `orchestrator-bash-guard: BLOCKED — Orchestrator Bash command matches a mutating pattern.\n` +
    `  Command: ${displayCmd}\n` +
    `  Why blocked: ${reason}\n` +
    `  cwd: ${cwd || '(not provided)'}\n\n` +
    `  If you ARE a sub-agent: scope the command to your worktree, e.g.\n` +
    `    cd .worktrees/<role>-<task-id> && <command>   (or git -C / --prefix / make -C).\n` +
    `  Worktree-scoped commands are recognized as sub-agent context and allowed.\n\n` +
    `  CLAUDE.md §10 Hard Rule: "Orchestrator is a pure router — read state + dispatch sub-agents."\n` +
    `  State-mutating Bash (installers, builds, deploys, DB writes, HTTP mutations, FS destructive)\n` +
    `  belongs to sub-agents running inside their worktree. The hook detects sub-agent context\n` +
    `  via event.cwd containing '.worktrees/<role>-<task-id>/'.\n\n` +
    `  Correct approach:\n` +
    `    1. Classify the request per .claude/rules/task-type-routing.md §11.\n` +
    `    2. Dispatch the relevant sub-agent (BE Dev / FE Dev / DevOps / QA-Exec / debugger).\n` +
    `    3. The sub-agent runs the command from its worktree cwd; this hook allows it.\n\n` +
    `  Escape hatch (rare — operator-explicit one-off): export CLAUDE_ALLOW_ORCHESTRATOR_BASH=1\n` +
    `  Document rationale in SRS §10 Changelog.\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`orchestrator-bash-guard: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
