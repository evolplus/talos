'use strict';

// hooks/lib/role-ownership.cjs
// Single source of truth for kit path-ownership.
//
// Motivation: Claude Code's Task tool surface does not support per-dispatch
// cwd. Sub-agents inherit the harness cwd (project root) and the kit's
// .worktrees/<role>-<task-id>/ isolation is not physically applied for
// doc-writing roles (BA / SA / TL / QA-Author / UI/UX Designer). The
// cwd-based "is this a sub-agent?" detection in the hook layer therefore
// misses on every doc-writing dispatch.
//
// The kit's actual contract was always LOGICAL role-ownership (BA owns
// docs/SRS.md; SA owns docs/architecture.md; etc.). This lib lifts the
// role-ownership map out of the individual hooks (where it lived only as
// error-message hints) and exposes it as the primary gate signal:
//
//   - Path is owned by a sub-agent role → ALLOW writes from any context
//     (logical ownership is the gate; physical isolation is now optional).
//   - Path is Orchestrator-only (docs/plan/, docs/open-issues.md,
//     docs/iteration-plan/) → ALLOW writes only from Orchestrator context.
//   - Path is source code → REQUIRE physical worktree isolation
//     (source-code-write-guard's existing discipline).
//   - Path is kit-internal (.claude/, CLAUDE.md, etc.) → ALLOW Orchestrator.
//   - Path is unrecognized → BLOCK; operator must classify per §11.
//
// Trade-off: an Orchestrator manually editing docs/SRS.md from main cwd
// would be allowed by this gate (because the path is BA-owned). The
// kit's Hard Rule "Orchestrator does not perform sub-agent work" + the
// dispatch-failure-fallback rule + operator discipline are the
// remaining gates for that case. This matches the pre-existing pattern
// for docs/open-issues.md (any agent appends; no cwd-based gate).
//
// API:
//   ownerOf(path) → { role, mode, kind } | null
//   isRoleOwnedDoc(path) → boolean      // including 'shared'
//   isOrchestratorOnly(path) → boolean
//   isSourceCode(path) → boolean
//   isKitInternal(path) → boolean
//   isTransient(path) → boolean
//   isUpstreamInput(path) → boolean

// ─── Path normalization ───
// Hooks receive absolute paths from the harness most of the time; we strip
// any project-root prefix by walking the path and matching the tail patterns.
function normalize(p) {
  if (typeof p !== 'string') return '';
  return p.replace(/^\.\//, '');
}

// ─── Ownership map ───
// Order matters — earlier entries match before later. Place more-specific
// patterns above more-general ones (e.g. docs/uiux/handoffs/ above docs/uiux/).
//
// `kind` semantics:
//   'role-owned-doc'    — single-role-owned doc; allow from any context
//   'shared-doc'        — multi-writer doc; allow from any context
//   'orchestrator-only' — Orchestrator-exclusive write; allow only from Orchestrator
//   'kit-internal'      — operator-edited (.claude/, CLAUDE.md); allow Orchestrator
//   'transient'         — worktree-local handoff (plan-update.json, plan-proposal/)
//   'source-code'       — code paths; require physical worktree isolation
//   'upstream-input'    — read-only; PM-authored
//   'project-root-config' — package.json, tsconfig.json, etc.; sub-agent owns
const OWNERSHIP_MAP = [
  // ─── Orchestrator-only (highest priority — these are not sub-agent paths) ───
  { re: /(^|\/)docs\/plan(\/|$)/,                         kind: 'orchestrator-only', role: 'Orchestrator', mode: 'master-plan-discipline §8 (sole writer)' },
  { re: /(^|\/)docs\/iteration-plan\//,                   kind: 'orchestrator-only', role: 'Orchestrator', mode: 'consumes iteration plans at §9 Step 3.5' },

  // ─── Shared doc (any-role append) ───
  { re: /(^|\/)docs\/open-issues\.md$/,                   kind: 'shared-doc',        role: 'any',          mode: 'CLAUDE.md §6 (append-only, all roles)' },

  // ─── Kit-internal (Orchestrator + Agent Generator) ───
  { re: /(^|\/)\.claude\//,                               kind: 'kit-internal',      role: 'Orchestrator + Agent Generator', mode: 'kit-dev / agent regen' },
  { re: /(^|\/)CLAUDE\.md$/,                              kind: 'kit-internal',      role: 'Orchestrator', mode: 'kit operating contract' },
  { re: /(^|\/)RELEASE-NOTES.*\.md$/,                     kind: 'kit-internal',      role: 'Orchestrator', mode: 'kit-level docs' },
  { re: /(^|\/)\.gitignore$/,                             kind: 'kit-internal',      role: 'Orchestrator', mode: 'kit git config' },
  { re: /(^|\/)\.gitattributes$/,                         kind: 'kit-internal',      role: 'Orchestrator', mode: 'kit git config' },

  // ─── Transient handoff artifacts (worktree-local only — never main repo) ───
  { re: /(^|\/)\.worktrees\/[^\/]+\/plan-update.*\.json$/, kind: 'transient',        role: 'sub-agent',    mode: 'worktree-local; Orchestrator ingests + cleans up' },
  { re: /(^|\/)\.worktrees\/[^\/]+\/plan-proposal\//,     kind: 'transient',         role: 'TL',           mode: 'TL plan-proposal tree; Orchestrator ingests at §9 Step 7' },

  // ─── BA-owned docs ───
  { re: /(^|\/)docs\/SRS\.md$/,                           kind: 'role-owned-doc',    role: 'BA',           mode: 'Ingestion Modes A–F per .claude/agents/_templates/ba.md' },
  { re: /(^|\/)docs\/user-stories\//,                     kind: 'role-owned-doc',    role: 'BA',           mode: 'Phase 1 ingestion / Mode D augment' },
  { re: /(^|\/)docs\/frs\//,                              kind: 'role-owned-doc',    role: 'BA',           mode: 'Phase 1 ingestion / Mode D augment' },
  { re: /(^|\/)docs\/srs-diffs\//,                        kind: 'role-owned-doc',    role: 'BA',           mode: 'Phase 1.Z iteration diff' },
  { re: /(^|\/)docs\/brownfield-confirmation\//,          kind: 'role-owned-doc',    role: 'BA',           mode: 'Mode E per-item confirmation checklist' },
  { re: /(^|\/)docs\/uiux\/completeness-reports\//,       kind: 'role-owned-doc',    role: 'BA',           mode: 'Phase 3 (post-Designer handoff)' },
  { re: /(^|\/)docs\/uiux\/post-implementation-reports\//,kind: 'role-owned-doc',    role: 'BA',           mode: 'Phase 5 (post-FE Dev ready-for-deploy)' },
  { re: /(^|\/)docs\/srs-validation-reports\//,             kind: 'role-owned-doc',    role: 'srs-source-validator', mode: 'first sign-off gate (source faithfulness); sole writer of Source-Validated transition' },
  { re: /(^|\/)docs\/srs-feasibility-reports\//,            kind: 'role-owned-doc',    role: 'srs-feasibility-validator', mode: 'second sign-off gate (technical feasibility); sole writer of Signed-off transition' },
  { re: /(^|\/)docs\/architecture-validation-reports\//,    kind: 'role-owned-doc',    role: 'architecture-validator', mode: 'independent design gate (post-SRS-sign-off, pre-TL); sole writer of architecture Validated transition' },

  // ─── BA + SA collaborative (placeholders by BA; detail by SA) ───
  { re: /(^|\/)docs\/external-integrations\//,            kind: 'role-owned-doc',    role: 'BA + SA',      mode: 'BA Phase 1.X placeholders → SA external-integration-adequacy fills' },

  // ─── SA-owned docs ───
  { re: /(^|\/)docs\/architecture\.md$/,                  kind: 'role-owned-doc',    role: 'SA',           mode: 'design or extract' },
  { re: /(^|\/)docs\/decisions\//,                        kind: 'role-owned-doc',    role: 'SA',           mode: 'design (with Dependency Approver confirmation for new deps)' },
  { re: /(^|\/)docs\/instrumentation-contract\.md$/,      kind: 'role-owned-doc',    role: 'SA',           mode: 'design (UI-bearing SRSs)' },

  // ─── UI/UX Designer ───
  { re: /(^|\/)docs\/uiux\/handoffs\//,                   kind: 'role-owned-doc',    role: 'UI/UX Designer', mode: 'create / import / revise / incorporate' },
  { re: /(^|\/)docs\/uiux\/figma-mappings\//,             kind: 'role-owned-doc',    role: 'UI/UX Designer', mode: 'map (pre-sign-off Design-Flow A)' },

  // ─── QA-Author ───
  { re: /(^|\/)docs\/test-cases\/by-us\//,                kind: 'role-owned-doc',    role: 'QA-Author',    mode: 'by-us mode (post-SRS-sign-off)' },
  { re: /(^|\/)docs\/test-cases\/by-task\//,              kind: 'role-owned-doc',    role: 'QA-Author',    mode: 'by-task mode (post-TL + design-confirmed)' },
  { re: /(^|\/)docs\/uiux\/visual-specs\//,               kind: 'role-owned-doc',    role: 'QA-Author',    mode: 'by-task (UI)' },

  // ─── BE Dev ───
  { re: /(^|\/)docs\/api-contracts\//,                    kind: 'role-owned-doc',    role: 'BE Dev',       mode: 'normal dispatch (sub-agent publishes contract)' },

  // ─── FE Dev ───
  { re: /(^|\/)docs\/uiux\/refs\//,                       kind: 'role-owned-doc',    role: 'FE Dev',       mode: 'normal dispatch (per-task design contract)' },

  // ─── DevOps ───
  { re: /(^|\/)docs\/deploy-reports\//,                   kind: 'role-owned-doc',    role: 'DevOps',       mode: 'normal dispatch (local-deployment skill)' },

  // ─── QA-Exec ───
  { re: /(^|\/)docs\/qa-reports\//,                       kind: 'role-owned-doc',    role: 'QA-Exec',      mode: 'normal dispatch' },

  // ─── Non-SDLC roles ───
  { re: /(^|\/)docs\/research-reports\//,                 kind: 'role-owned-doc',    role: 'Researcher',   mode: 'Path B1' },
  { re: /(^|\/)docs\/debug-reports\//,                    kind: 'role-owned-doc',    role: 'Debugger',     mode: 'Path B2 (read deploy report; reproduce in Docker)' },
  { re: /(^|\/)docs\/code-reviews\//,                     kind: 'role-owned-doc',    role: 'Code Reviewer', mode: 'Path B3 (lens-driven)' },
  { re: /(^|\/)docs\/oq-resolutions\//,                   kind: 'role-owned-doc',    role: 'OQ Resolver',  mode: 'Path B4 (re-entry via BA)' },
  { re: /(^|\/)docs\/archaeology-reports\//,              kind: 'role-owned-doc',    role: 'Codebase Archaeologist', mode: 'Path B5 (brownfield Stage 1)' },

  // ─── BA-captured conversational additions (verbatim audit log for srs-validator coverage check) ───
  { re: /(^|\/)docs\/requirements\/conversational-additions\//, kind: 'role-owned-doc', role: 'BA',           mode: 'Mode D step D0 (verbatim capture before synthesis)' },

  // ─── UI/UX Designer extract output (Design-Flow A; runs PRE-BA; source corpus for BA synthesis + source-validator) ───
  { re: /(^|\/)docs\/requirements\/design-extracted\//,        kind: 'role-owned-doc', role: 'UI/UX Designer', mode: 'extract mode (read Figma → produce design-extracted requirements file)' },

  // ─── Upstream input (PM-authored, BA ingests via Mode F) ───
  { re: /(^|\/)docs\/requirements\//,                     kind: 'upstream-input',    role: '(PM)',         mode: 'PM authors directly; BA ingests via Mode F (read-only otherwise)' },

  // ─── Fallback for any other docs/ — block; force the operator to classify ───
  { re: /(^|\/)docs\//,                                   kind: 'unknown-doc',       role: '(unclassified)', mode: 'add a row to .claude/hooks/lib/role-ownership.cjs OR classify per §11' },

  // ─── Project-root config files (sub-agent edits in worktree by convention) ───
  { re: /(^|\/)package\.json$/,                           kind: 'project-root-config', role: 'BE Dev or FE Dev', mode: 'normal dispatch' },
  { re: /(^|\/)(package-lock|pnpm-lock|yarn)\.(json|lock|yaml)$/, kind: 'project-root-config', role: 'BE Dev or FE Dev', mode: 'lockfile — produced by sub-agent build' },
  { re: /(^|\/)tsconfig.*\.json$/,                        kind: 'project-root-config', role: 'FE Dev or BE Dev', mode: 'normal dispatch' },
  { re: /(^|\/)Cargo\.toml$/,                             kind: 'project-root-config', role: 'BE Dev',       mode: 'normal dispatch' },
  { re: /(^|\/)go\.mod$/,                                 kind: 'project-root-config', role: 'BE Dev',       mode: 'normal dispatch' },
  { re: /(^|\/)pom\.xml$/,                                kind: 'project-root-config', role: 'BE Dev',       mode: 'normal dispatch' },
  { re: /(^|\/)(Dockerfile|docker-compose\.ya?ml|\.dockerignore)$/, kind: 'project-root-config', role: 'DevOps', mode: 'normal dispatch' },

  // ─── Environment / secrets — operator only ───
  { re: /(^|\/)\.env(\.[^/]+)?$/,                         kind: 'operator-only',     role: '(operator)',   mode: 'manual edit in terminal — never via agent' },
];

// ─── Public API ───

function ownerOf(p) {
  const norm = normalize(p);
  if (!norm) return null;
  for (const entry of OWNERSHIP_MAP) {
    if (entry.re.test(norm)) {
      return { role: entry.role, mode: entry.mode, kind: entry.kind };
    }
  }
  return null;
}

function isRoleOwnedDoc(p) {
  const o = ownerOf(p);
  return o !== null && (o.kind === 'role-owned-doc' || o.kind === 'shared-doc');
}

function isOrchestratorOnly(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'orchestrator-only';
}

function isKitInternal(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'kit-internal';
}

function isTransient(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'transient';
}

function isUpstreamInput(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'upstream-input';
}

function isProjectRootConfig(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'project-root-config';
}

function isOperatorOnly(p) {
  const o = ownerOf(p);
  return o !== null && o.kind === 'operator-only';
}

// Convenience: a single check the orchestrator-write-guard uses.
// "Is this path allowed for a sub-agent dispatch from any cwd?"
function isLegitimateSubAgentWrite(p) {
  return isRoleOwnedDoc(p) || isTransient(p) || isProjectRootConfig(p);
}

// "Is this path Orchestrator-legitimate to write directly?"
function isOrchestratorLegitimate(p) {
  return isOrchestratorOnly(p) || isKitInternal(p);
}

module.exports = {
  ownerOf,
  isRoleOwnedDoc,
  isOrchestratorOnly,
  isKitInternal,
  isTransient,
  isUpstreamInput,
  isProjectRootConfig,
  isOperatorOnly,
  isLegitimateSubAgentWrite,
  isOrchestratorLegitimate,
};
