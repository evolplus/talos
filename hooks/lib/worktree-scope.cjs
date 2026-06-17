'use strict';

// hooks/lib/worktree-scope.cjs
// Single source of truth for "is this operation scoped to a sub-agent worktree?"
//
// Motivation (the gap this closes):
//   Claude Code's Task tool does not accept a per-dispatch `cwd`, so every
//   dispatched sub-agent inherits the harness cwd (project root) — see
//   `.claude/rules/worktree-isolation.md` §5. The kit compensates by having the
//   Orchestrator pass the absolute worktree path into the dispatch prompt and
//   relying on the agent to scope its work there. Two runtime gaps remained:
//
//     1. `orchestrator-bash-guard.cjs` recognized sub-agent context ONLY by
//        `event.cwd` containing `.worktrees/<role>-<task-id>/`. Under the §5
//        reality (cwd is always root), a dev agent that correctly scopes a
//        build with `cd .worktrees/<role>-<task-id> && npm run build` was
//        judged "Orchestrator context" and blocked — while an UNSCOPED
//        `npm run build` from root (the actual contamination of the shared
//        source tree) was blocked for the same reason, indistinguishably.
//
//     2. The kit had no runtime signal that a Bash mutation/build targeted the
//        shared root tree vs. an isolated worktree.
//
//   This lib provides command-aware worktree-scope detection so the guards can
//   tell "scoped to a worktree" (ALLOW — isolated, no shared-tree contamination)
//   from "operating on the shared root tree" (BLOCK — route through a sub-agent
//   that scopes to its worktree).
//
// What this lib CANNOT do (be honest about the limit):
//   It cannot bind a running agent to its OWN specific worktree, because the
//   PreToolUse event carries no role/task identity and Task-dispatch env vars
//   do not reliably propagate to the hook subprocess. So it cannot stop
//   fe-dev from writing into be-dev's worktree. It enforces "work is worktree-
//   scoped," not "work is in the agent's assigned worktree." Closing the latter
//   needs a harness `cwd` parameter on Task or a per-worktree owner lock threaded
//   into the event — neither exists today. The prose Hard Rule (worktree-
//   isolation §5 rule 1) remains the control for that case.
//
// API:
//   isWorktreeScopedCwd(cwd) -> boolean
//   commandScopesToWorktree(cmd) -> boolean
//   isOperationWorktreeScoped(cwd, cmd) -> boolean   // cwd OR command
//   wellFormedWorktreePath(p) -> boolean             // path writes INTO a worktree
//   WORKTREE_DIR_RE                                  // exported for reuse/tests

// A worktree directory segment: `.worktrees/<slug>/` where <slug> is the
// `<role>-<task-id>` name created by `git worktree add` (§9 Step 4.6).
// <slug> must be non-empty and must not itself contain a path separator.
const WORKTREE_DIR_RE = /(^|\/)\.worktrees\/([^\/\s"']+)(\/|$)/;

// --- cwd-based detection (the original signal) ---
function isWorktreeScopedCwd(cwd) {
  return typeof cwd === 'string' && WORKTREE_DIR_RE.test(cwd);
}

// --- command-embedded scoping ---
// A command "scopes itself to a worktree" when it redirects the operation into
// a `.worktrees/<slug>/` directory before doing work there. Recognized forms:
//   cd .worktrees/<slug> && ...            (and pushd)
//   git -C .worktrees/<slug> ...
//   npm/pnpm/yarn --prefix .worktrees/<slug> ...
//   make/cmake -C .worktrees/<slug> ...
// The worktree path may be relative or absolute (a leading prefix like
// /abs/repo/ is fine). We stop the path match at the first shell separator or
// quote so `cd .worktrees/x && rm -rf /` does not falsely "scope" the rm.
const CD_INTO_WORKTREE_RE =
  /(^|[;&|]|&&|\|\|)\s*(?:cd|pushd)\s+["']?[^"'&|;]*\.worktrees\/[^\/\s"';&|]+/;
const GIT_C_WORKTREE_RE =
  /\bgit\s+-C\s+["']?[^"'&|;]*\.worktrees\/[^\/\s"';&|]+/;
const PREFIX_WORKTREE_RE =
  /--prefix(?:=|\s+)["']?[^"'&|;]*\.worktrees\/[^\/\s"';&|]+/;
const MAKE_C_WORKTREE_RE =
  /\b(?:make|cmake)\s+(?:[^&|;]*\s)?-C\s+["']?[^"'&|;]*\.worktrees\/[^\/\s"';&|]+/;

function commandScopesToWorktree(cmd) {
  if (typeof cmd !== 'string' || !cmd) return false;
  return (
    CD_INTO_WORKTREE_RE.test(cmd) ||
    GIT_C_WORKTREE_RE.test(cmd) ||
    PREFIX_WORKTREE_RE.test(cmd) ||
    MAKE_C_WORKTREE_RE.test(cmd)
  );
}

function isOperationWorktreeScoped(cwd, cmd) {
  return isWorktreeScopedCwd(cwd) || commandScopesToWorktree(cmd);
}

// --- well-formed worktree WRITE-path detection ---
// True when the path writes INTO a worktree: contains `.worktrees/<slug>/<rest>`
// with a non-empty slug AND at least one path segment beneath the worktree dir.
// Resolves `..` segments first so a traversal escape
// (`.worktrees/be-dev-T-001/../../src/x.ts`) that lands outside any worktree is
// NOT treated as worktree-scoped.
function resolveDotDot(p) {
  const parts = String(p).split('/');
  const out = [];
  for (const seg of parts) {
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '') out.pop();
      else out.push(seg);
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

function wellFormedWorktreePath(p) {
  if (typeof p !== 'string' || !p) return false;
  const resolved = resolveDotDot(p);
  const m = resolved.match(WORKTREE_DIR_RE);
  if (!m) return false;
  const slug = m[2];
  if (slug === '.' || slug === '..') return false;
  const idx = resolved.indexOf('.worktrees/' + slug);
  const after = resolved.slice(idx + ('.worktrees/' + slug).length);
  return after.startsWith('/') && after.length > 1;
}

// --- worktree-relative path extraction ---
// Given a path that writes INTO a worktree, return the path *beneath* the
// `.worktrees/<slug>/` prefix (with `..` resolved). Returns null when the path
// is not a well-formed worktree write-path. Used by source-code-write-guard to
// check a sub-agent's source write against the project's declared source roots
// (the worktree prefix is irrelevant to layout — `frontend/`, `backend/` etc.
// are measured from the worktree root).
function worktreeRelativePath(p) {
  if (!wellFormedWorktreePath(p)) return null;
  const resolved = resolveDotDot(p);
  const m = resolved.match(WORKTREE_DIR_RE);
  const slug = m[2];
  const idx = resolved.indexOf('.worktrees/' + slug);
  const after = resolved.slice(idx + ('.worktrees/' + slug).length);
  // after starts with '/' (guaranteed by wellFormedWorktreePath)
  return after.replace(/^\/+/, '');
}

module.exports = {
  WORKTREE_DIR_RE,
  isWorktreeScopedCwd,
  commandScopesToWorktree,
  isOperationWorktreeScoped,
  wellFormedWorktreePath,
  worktreeRelativePath,
};
