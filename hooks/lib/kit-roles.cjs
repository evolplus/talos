// kit-roles.cjs — the single list of role names the kit dispatches.
//
// Two consumers used to keep their own copy and drifted:
//   * dispatch-promotion-state.cjs parsed `<role>-<task-id>` worktree stems with
//     a regex that required the task id to be `LETTERS-DIGITS` at the END of the
//     stem. Real dispatch stems are richer (`devops-T-048-redeploy`,
//     `be-dev-t-026-admin-academy`, `qa-exec-T-049-T-051-T-052`,
//     `ba-account-deletion-login-prompt`); every one of those parsed to null, so
//     the promotion guard saw NO teardown target and allowed `git worktree
//     remove` of unpromoted work (ISSUE-200 — 87 of 254 real 4Run stems).
//   * plan-update-validator.cjs rejected `agent: architecture-validator`
//     although the kit ships and dispatches that agent (ISSUE-209).
//
// Keep this list in step with agents/*.md. Aliases are stem prefixes projects
// actually use for a kit role (4Run: `ui-ux-<id>` design worktrees, and
// track-named `be-issue-100` / `fe-issue-092` fix worktrees). `qa-` is NOT
// aliased: it is ambiguous between qa-author and qa-exec.

'use strict';

const KIT_ROLES = Object.freeze([
  'agent-generator', 'architecture-validator', 'ba', 'be-dev', 'code-reviewer',
  'codebase-archaeologist', 'debugger', 'devops', 'extraction-validator',
  'fe-dev', 'oq-resolver', 'qa-author', 'qa-exec', 'researcher', 'sa',
  'srs-feasibility-validator', 'srs-source-validator', 'tl', 'ui-ux-designer',
  'orchestrator',
]);

const ROLE_ALIASES = Object.freeze({ 'ui-ux': 'ui-ux-designer', be: 'be-dev', fe: 'fe-dev' });

// Longest first, so `ui-ux-designer-T-1` resolves to ui-ux-designer, not ui-ux.
const STEM_PREFIXES = Object.freeze(
  [...KIT_ROLES, ...Object.keys(ROLE_ALIASES)].sort((a, b) => b.length - a.length)
);

// Split a dispatch stem into { role, taskId } such that `${role}-${taskId}`
// === stem ALWAYS (callers rebuild worktree and journal paths from the pair).
// `hintRole` (e.g. the journal's `role` field) wins when the stem starts with it.
// Returns null only for a stem that cannot be a dispatch at all (no hyphen).
function splitDispatchStem(stem, hintRole) {
  if (typeof stem !== 'string') return null;
  const s = stem.trim();
  if (!s) return null;
  const tryPrefix = (p) =>
    p && s.length > p.length + 1 && s.startsWith(p + '-')
      ? { role: p, taskId: s.slice(p.length + 1) }
      : null;
  if (typeof hintRole === 'string') {
    const hit = tryPrefix(hintRole.trim());
    if (hit) return hit;
  }
  for (const p of STEM_PREFIXES) {
    const hit = tryPrefix(p);
    if (hit) return hit;
  }
  // Unknown role (project-defined agent). Prefer the historical shape
  // `<role>-<LETTERS>-<DIGITS>` so existing stems keep their old split; else
  // split at the first hyphen. Either way the stem is NOT dropped.
  const legacy = /^([a-z0-9][a-z0-9-]*?)-([A-Za-z]+-\d+)$/.exec(s);
  if (legacy) return { role: legacy[1], taskId: legacy[2] };
  const i = s.indexOf('-');
  if (i <= 0 || i === s.length - 1) return null;
  return { role: s.slice(0, i), taskId: s.slice(i + 1) };
}

function canonicalRole(role) {
  return ROLE_ALIASES[role] || role;
}

module.exports = { KIT_ROLES, ROLE_ALIASES, STEM_PREFIXES, splitDispatchStem, canonicalRole };
