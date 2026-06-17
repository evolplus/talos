# Orchestrator Operating Rules

This file holds CLAUDE.md §9. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`. The Orchestrator depends on:
- `CLAUDE.md` §1 Source of Truth, §2 SRS Sign-off Protocol, §6 Open Issues, §10 Hard Rules
- `.claude/rules/sub-agent-registry.md` §3, §3a
- `.claude/rules/parallel-execution.md` §4
- `.claude/rules/worktree-isolation.md` §5
- `.claude/rules/change-synchronization.md` §7
- `.claude/rules/master-plan-discipline.md` §8

---

## 9. Orchestrator Operating Rules

On every invocation, the Orchestrator first classifies the user request per `.claude/rules/task-type-routing.md` §11:

- **Path A (SDLC)** — proceed through the numbered steps below.
- **Paths B1/B2/B3 (research / debug / cold review)** — dispatch the corresponding non-SDLC agent. The numbered SDLC steps below do not apply.
- **Path C (direct skill)** — invoke the matching skill from `.claude/skills/registry.md`. The numbered SDLC steps below do not apply.
- **Path D (inline)** — handle in the orchestrator turn. No dispatch, no document.

**Issue-language default rule (must apply at classification time).** When the user's request contains ANY issue indicator (error / broken / failing / doesn't work / returns errors / throws / hangs / crashes / slow / timeout / red tests / failed CI / deploy failing) AND the request does NOT explicitly ask for a feature add ("build", "implement", "add"), the Orchestrator MUST classify as **Path B2 (debugger)**. Common operator phrasings the kit treats as B2 are listed in `.claude/rules/task-type-routing.md` §11 under "Default routing rule for ambiguous issue language."

The Orchestrator MUST NOT handle debug-shaped requests inline (Path D) — issue language never qualifies for Path D regardless of how trivial the symptom looks. The original incident this rule prevents: user said "the API is broken", Orchestrator (default-mode reasoning) read the source code, attempted `npm install && npm run build` on the host, missed the deploy report entirely, never reproduced the actual symptom in the deployed Docker environment, proposed a "fix" against an environment that wasn't the one the bug lived in.

When the classified path is A, before doing anything else, the Orchestrator must, in order:

0. **Pre-flight git setup (runs once per project, every invocation).** Before classification or any other action, ensure the workspace is a git repository and committer identity is configured. The kit's commit discipline (`.claude/skills/git-commit/SKILL.md`) + the per-role "commit before signaling done" Hard Rule + the `task-completion-commit-check.cjs` hook all assume a working git context.

   - **Run `git rev-parse --is-inside-work-tree`.** If the exit code is non-zero (not a repo):
     - Run `git init --initial-branch=main`. (Older git versions: `git init` then `git symbolic-ref HEAD refs/heads/main`.)
     - Verify `.gitignore` exists at the project root — the kit ships one baseline; if absent, recreate from `.claude/skills/git-commit/references/gitignore-template.md`.
     - Log to the operator that initialization happened: `[orchestrator] Initialized git repository at <cwd> on branch main.`
   - **Run `git config --get user.name` and `git config --get user.email`.** If either is unset, halt with `NEEDS_CONTEXT`:
     ```
     Status: NEEDS_CONTEXT
     Reason: Git committer identity is not configured.
     Question: The kit dispatches sub-agents that MUST commit their work before signaling done. Git needs to know who's committing.
     Suggested resolution: Run `git config user.name "<your name>"` and `git config user.email "<your email>"` in the project root, then re-invoke.
     Recommended: Use a project-scoped identity (drop `--global`) so AI-generated commits don't pollute the operator's broader git history.
     ```
     Do NOT auto-configure identity from environment guesses; this is a deliberate human decision per the `git-commit` skill's identity-verification discipline.
   - Pre-flight runs every invocation; the actual `git init` runs only once (the check is idempotent). Subsequent invocations confirm the repo + identity in <50ms and proceed.

0.5. **Pre-flight cleanup of root-level plan-update stragglers.** After Step 0's git context check, scan the project root (cwd, non-recursive) for files matching `plan-update*.json`. These are leakage — per `.claude/rules/worktree-isolation.md` §5 and CLAUDE.md §10, every `plan-update.json` lives ONLY at `.worktrees/<role>-<task-id>/plan-update.json`. The `plan-update-location-guard.cjs` hook refuses new writes there, but existing files (from pre-hook sessions or escape-hatch overrides) need cleanup.

   - **Run** `ls -1 plan-update*.json 2>/dev/null` (or equivalent glob) in the project root. If empty: log nothing, proceed.
   - **If matches exist**: remove them (`rm plan-update*.json`). They are transient artifacts; once the Orchestrator turn is over, the sub-agent's real `plan-update.json` lives in `.worktrees/<role>-<task-id>/plan-update.json` and has already been (or will be) ingested.
   - **Log** to the session-start summary: `[orchestrator] Cleaned up N stragglers: plan-update.json, plan-update-T-005.json, …`
   - **Do not halt.** Cleanup is non-interactive. If the operator wanted to preserve a specific file, they should have moved it out of root before invocation.

   Edge cases:
   - If `git status` shows any of these files as tracked / modified (rare — the gitignore should prevent this; pre-hook history might leak some): warn loudly in the summary and skip deletion of those specific files. The operator can decide whether to `git rm` them.
   - Files matching `plan-update*.json` inside `.worktrees/` are NOT touched — they're canonical.
   - Files matching `plan-update*.json` inside `docs/`, `.claude/`, or other subdirs are also touched (per the hook's policy: only `.worktrees/` is the canonical location).

0.6. **Pre-flight reconciliation of interrupted dispatches (crash recovery).** After Step 0.5's straggler sweep, scan
   `.claude/dispatch-journal/*.json` and `.worktrees/*`. Per CLAUDE.md §14, a dispatch journal entry that survives into
   a new session is an interrupted dispatch (a clean dispatch deletes its own entry at Step 7). This gate is
   unconditional — an interrupted task left `in-progress` is invisible to Step 4 eligibility and silently stalls the
   project, so reconciliation runs before SRS classification and before any new dispatch.

   For each journal entry (and each orphan `.worktrees/<role>-<task-id>/` with no journal entry), reconcile per
   `.claude/rules/crash-recovery.md` §14.4:

   - **First check for a completed-but-uningested dispatch.** If the journaled worktree contains `plan-update.json`, the
     sub-agent finished but the session died before Step 7 ingestion. Do NOT roll back — ingest it via the normal Step 7
     path, then delete the journal entry. (CLAUDE.md §14.8 Hard Rule.)
   - **Otherwise reconcile (re-entrant):** (1) set the task `in-progress → interrupted` with an append-only
     status-history row; (2) `git worktree remove --force .worktrees/<role>-<task-id>/` + `git branch -D
     agent/<role>/<task-id>`; (3) for a logical-isolation role, `git restore --source=<baseline.head> --staged
     --worktree -- <baseline.owned_paths>` to discard partial doc writes on main (if the role committed to main
     mid-task, HALT with NEEDS_CONTEXT — never `git reset` shared history automatically); (4) transition the task
     `interrupted → not-started`; (5) `rm .claude/dispatch-journal/<role>-<task-id>.json`.
   - **Log** to the session-start summary:
     `[orchestrator] Reconciled interrupted dispatch <role>/<task-id>: worktree+branch discarded, docs rolled back to <sha>, task → not-started`.
   - **Restart is automatic.** The reset-to-`not-started` task is picked up by Step 4 eligibility on this same turn and
     re-dispatched from a clean baseline (CLAUDE.md §14.5). No special restart path.

   Orphan-worktree edge cases (no journal entry — pre-journal residue) and the "journal but no worktree" case are
   handled per `.claude/rules/crash-recovery.md` §14.4 edge-case list.

1. Read `docs/SRS.md`. Confirm `Status` AND `Purpose:` header.
   - **If `docs/SRS.md` is absent (or empty placeholder) AND `docs/requirements/` exists with at least one file AND `docs/user-stories/` is empty AND `docs/frs/` is empty AND `docs/archaeology-reports/` is empty** → this looks like a greenfield project with fragmented upstream requirements. Halt with `NEEDS_CONTEXT` asking the user to confirm BA Mode F dispatch:
     ```
     Status: NEEDS_CONTEXT
     Reason: Greenfield project shape — requirements fragments detected at docs/requirements/.
     Question: Found <N> file(s) in docs/requirements/ and no docs/SRS.md. This looks like a candidate for BA Mode F (synthesize a kit-shape SRS from requirements fragments). How do you want to proceed?
     Options:
       [a] Dispatch BA in Mode F — synthesize SRS from the docs/requirements/ files.
       [b] Treat as Mode A — concatenate fragments into a single docs/SRS.md first, then run Mode A.
       [c] Use Mode C — fragments live elsewhere (Confluence / Notion); abandon docs/requirements/ and ingest from the external source.
       [d] None of these — I will author docs/SRS.md by hand; ignore docs/requirements/.
     Recommended: a
     Confidence: medium
     Justification: Matches the kit's intent — let BA do the synthesis work rather than forcing PMs to consolidate fragments manually.
     ```
   - **If `Status: Ready-for-Sign-off`** → dispatch `srs-source-validator` (subagent_type `srs-source-validator`) — the **first sign-off gate** (source faithfulness). It reads `docs/SRS.md` + every file under `docs/requirements/` + every per-US / FR / external-integration file; produces `docs/srs-validation-reports/v<srs-version>.md`. `qualified` flips Status → `Source-Validated`; `unqualified` appends OQs + reverts Status → `In-Review` + triggers BA Mode D re-dispatch. **Not a Path A SDLC dispatch.**
   - **If `Status: Source-Validated`** → dispatch `srs-feasibility-validator` (subagent_type `srs-feasibility-validator`) — the **second sign-off gate** (technical feasibility). It reads the SRS + most-recent source-validation report + per-US/FR/external-integration files + (when present) `docs/architecture.md` + `docs/decisions/` + `solution-defaults` + `third-party-dependency-evaluation` skills; produces `docs/srs-feasibility-reports/v<srs-version>.md`. `qualified` flips Status → `Signed-off`; `unqualified` appends OQs + reverts Status → `In-Review` (NOT to `Source-Validated`; BA's resolution may invalidate the prior source pass so BOTH gates re-run). **Not a Path A SDLC dispatch.**
   - **If `Design-Flow: A` AND no design-extracted file exists** (i.e., `docs/requirements/design-extracted/<figma-file-id>-*.md` does not exist for any Figma URL in SRS §3.4.1 `Figma-File-URL:`) → dispatch UI/UX Designer in `extract` mode against the Figma URL BEFORE the next BA Phase 1.X synthesis. The Designer reads the Figma file via MCP (read-only) and produces `docs/requirements/design-extracted/<figma-file-id>-<ISO-date>.md`. After extract returns, dispatch BA. The extract is a source-corpus dispatch — runs once per Figma file (idempotent: if a same-date extract exists, the Designer halts immediately with NEEDS_CONTEXT). Use [`.claude/skills/figma-requirements-extraction/SKILL.md`](../skills/figma-requirements-extraction/SKILL.md) as the procedural reference.
   - If `Status` is `Draft` or `In-Review` AND none of the above applied, dispatch BA only.
   - If `Purpose: documentation`, refuse any Path A SDLC dispatch (documentation-purpose SRSs are reference artifacts; promoting them to governance requires explicit re-confirmation per brownfield-onboarding §12). Brownfield Stages 1–3 / iteration re-ingest / OQ resolution / inline / non-SDLC paths are still allowed. Both validator dispatches are skipped — documentation-purpose SRSs do not require validator sign-off; their Status stays at `In-Review`.
2. Read `docs/open-issues.md`. **If any entry is `open`, triage first. No other dispatch is allowed.**
3. Read `docs/plan/master-plan.md` first (project shape + running tasks). For the in-flight task you're about to dispatch, also read `docs/plan/phase-NN-name/phase.md` (phase context) and `docs/plan/phase-NN-name/tasks/T-NNN.md` (task detail). See `.claude/rules/master-plan-discipline.md` §8 for the hierarchy.
3.5. **Iteration plan consumption (when present).** Scan `docs/iteration-plan/` for any file where `Processed-by-orchestrator: false`. If found, dispatch the agents named in that plan's re-dispatch matrix BEFORE any other task discovery. Iteration plans always take priority — they encode the user-confirmed delta from a SRS version bump, and unprocessed plans block further task work (existing tasks may be in stale state until iteration completes).

   - Walk the iteration plan's re-dispatch matrix row by row; for each row, dispatch the named agent against the named scope.
   - Apply the "Affected tasks" table: transition each listed task to its New status (typically `cancelled`, `done-deprecated`, or re-opened `in-test`). Master-plan updates flow via `plan-update.json` from each dispatched agent.
   - After every row is dispatched and every affected task transitioned, flip `Processed-by-orchestrator: true` in the iteration plan file (this is one of the rare Orchestrator-only writes under `docs/`).
   - Resume from step 4 below. Subsequent invocations see the flag set and skip Step 3.5 unless a NEW iteration plan lands.

3.7. **Architecture validation gate (SA → architecture-validator → TL).** After iteration consumption and before task discovery, check the architecture gate (only relevant once SRS Status = `Signed-off`):

   - **If `docs/architecture.md` does not exist** → SA `design` mode hasn't run yet. No gate action; SA dispatch is handled by normal task discovery (Step 4) per `.claude/rules/parallel-execution.md` §4.
   - **If `docs/architecture.md` exists with `Status: Draft`** → the architecture has not been independently validated. Dispatch `architecture-validator` (subagent_type `architecture-validator`) against it; do NOT dispatch TL this turn. The validator writes `docs/architecture-validation-reports/v<arch-version>.md` and either flips Status → `Validated` (`qualified`) or leaves it `Draft` with a revision list (`unqualified`). On `unqualified`, re-dispatch SA `design` mode with the report's revision list; the validator re-runs on the next turn. (This mirrors Step 1's SRS validator dispatches — it is NOT a Path A SDLC task; it is a gate dispatch.)
   - **If `docs/architecture.md` exists with `Status: Validated` (or `Active`)** → the gate is open; TL and downstream task work proceed via Step 4.
   - **Availability:** `architecture-validator` runs post-sign-off, so its agent file is materialized during default-mode Agent Generator generation (Step 4.5). If `.claude/agents/architecture-validator.md` is absent at dispatch time, dispatch Agent Generator in default mode first (it copies the validator template verbatim — no Project Specialization).

4. Identify all tasks eligible to run **in parallel** per `.claude/rules/parallel-execution.md` §4 and the active **workload tier** per `.claude/rules/workload-tier.md` §13. The tier determines how aggressively to dispatch eligible parallel work:

   - **`aggressive` (default)**: dispatch ALL eligible-parallel sub-agents in this same Orchestrator turn — emit multiple `Task` tool calls in one message. Sub-agent batch dispatch where the role supports it (BE Dev handles 1–N related tasks sharing a service worktree; SA `design` mode produces architecture + ADRs + instrumentation-contract in one dispatch; etc.). Cross-phase pipelining: phase N+1's eligible tasks start when their specific phase-N deps complete (don't wait for phase N as a whole). Eager pre-flight reads: read every in-flight task file + every eligible-next task file per turn.
   - **`standard`**: parallelism per §4 documented patterns; up to 3 parallel dispatches per turn. One sub-agent per dispatch (no batch). Finish phase N's eligible tasks before phase N+1.
   - **`conservative`**: one sub-agent per Orchestrator turn. Operator checkpoint between dispatches.

   Determine the active tier per §13.3 priority: `CLAUDE_WORKLOAD_TIER` env var → SRS header `Workload-Tier:` field → kit default `aggressive`. Log the active tier in the session-start summary so operator sees it.

   For UI tasks, routing depends on `Design-Flow:` (set by BA Phase 1.X step 10) AND the design sub-status. Read the SRS header `Design-Flow:` field first; that decides the post-sign-off flow.

   **Pre-sign-off (any flow): Design-Flow detection signal from BA.**
   - BA Phase 1.X returns `plan-update.json` with `notes: "Design-Flow A. Dispatch UI/UX Designer in map mode against <url> before sign-off."` → dispatch UI/UX Designer in `map` mode AGAINST THE URL; the designer produces `docs/uiux/figma-mappings/v<srs-version>.md` and pins SRS §3.4.1 Node IDs. SRS Status stays `In-Review` until the mapping reaches `Mapping-Status: qualified` and BA Phase 2 step 3.5 passes. Then re-dispatch BA Mode D to flip Status to `Signed-off`.
   - BA returns `NEEDS_CONTEXT` asking the user to pick Design-Flow B vs C → surface the prompt to the user. Do NOT proceed with any sub-agent dispatch until the user answers. On answer, re-dispatch BA Mode D with `selected_design_flow: B | C`; BA sets the SRS header and continues to Phase 2.

   **Post-sign-off — Design-Flow A.** Designs already qualified pre-sign-off. The lifecycle short-circuits:
   - FE-eligible task with SRS Status `Signed-off`, `Design-Flow: A`, mapping `qualified`, Figma file version unchanged since sign-off → set the task's design sub-status DIRECTLY to `design-confirmed`. FE Dev becomes eligible immediately, no Designer dispatch needed.
   - Figma file version changed since sign-off (Approver edited Figma) → dispatch UI/UX Designer in `incorporate` mode to absorb edits + regenerate the affected task's handoff. Sub-status → `design-ready-for-review` → BA Phase 3 → confirmation → `design-confirmed`.

   **Post-sign-off — Design-Flow B or C.** Existing 5-step lifecycle from `.claude/rules/parallel-execution.md` §4:
   - SRS has UI requirements without pinned Figma nodes AND `Design-Flow: B` → dispatch UI/UX Designer in `create` mode.
   - SRS has UI requirements without pinned Figma nodes AND `Design-Flow: C` → dispatch UI/UX Designer in `create` mode (initial draft); expect human Figma edits and an `incorporate` follow-up before confirmation.
   - Sub-status `design-ready-for-review` → dispatch BA Phase 3 verification.
   - Sub-status `design-revision-needed` → dispatch UI/UX Designer in `revise` mode with BA's report.
   - Sub-status `design-pending-user-confirmation` → request user confirmation (Confirm / Reject / Edited); do not dispatch any agent until response.
   - Sub-status `design-human-edited` → dispatch UI/UX Designer in `incorporate` mode to absorb human edits and regenerate the handoff.
   - Sub-status `design-confirmed` → FE Dev becomes eligible alongside BE per normal parallel rules.

   **Hard rule.** Never dispatch UI/UX Designer in `create` mode when `Design-Flow: A` OR when `Design-Flow:` is unset/`TBD`. Creation requires explicit user choice (Flow B or C) recorded by BA in the SRS header.
4.5. **Sub-agent availability check (mandatory before any dispatch).** Before dispatching ANY sub-agent via Claude Code's `Task` tool, verify the role-specific agent file exists:

   - Map the role to its `subagent_type` value per `.claude/rules/sub-agent-registry.md` §3a (`ba`, `sa`, `tl`, `qa-author`, `be-dev`, `fe-dev`, `devops`, `qa-exec`, `ui-ux-designer`, `researcher`, `debugger`, `code-reviewer`, `oq-resolver`, `codebase-archaeologist`).
   - Check that `.claude/agents/<role>.md` exists in the project. (Path: `.claude/agents/ba.md` for BA, `.claude/agents/sa.md` for SA, etc. Non-SDLC agents live at `.claude/agents/_non-sdlc/<role>.md` — kit-shipped, so the check usually passes; same check, different path.)
   - **If the file is absent**, the project hasn't been initialized for kit dispatch. The Orchestrator dispatches the Agent Generator first — but the mode depends on whether the role can legitimately run pre-sign-off:

     **Pre-sign-off dispatches (Agent Generator `bootstrap` mode).** Three role-context combinations may need to run before SRS `Signed-off` exists; the Agent Generator's `bootstrap` mode generates skeleton-only agent files for them without requiring a Signed-off SRS:

     | Intended dispatch | Bootstrap dispatch input |
     |---|---|
     | BA (first ever — any ingestion mode; SRS doesn't exist or is `Draft`/`In-Review`) | `subagent_type: agent-generator`, prompt names `mode: bootstrap`, `target: ba` |
     | SA `extract` mode (brownfield onboarding Stage 2; runs before BA Mode E creates SRS in Stage 3) | `mode: bootstrap`, `target: sa`, `dispatch_intent: extract` |
     | SA `external-integration-adequacy` mode (runs while SRS is `In-Review`, between BA Phase 1.X step 9 placeholders and BA Phase 2 sign-off) | `mode: bootstrap`, `target: sa`, `dispatch_intent: external-integration-adequacy` |
     | UI/UX Designer `map` mode (runs while SRS is `In-Review`, between BA Phase 1.X step 10 Figma-URL detection and BA Phase 2 step 3.5 mapping-gate; Design-Flow A) | `mode: bootstrap`, `target: ui-ux-designer`, `dispatch_intent: map` |

     Bootstrap mode copies `_templates/<role>.md` verbatim to `.claude/agents/<role>.md` with header `Generated-From-SRS-Hash: bootstrap` + `Mode: bootstrap` + `Will-Be-Regenerated-On: SRS Status → Signed-off`. No SRS specialization is applied. See `.claude/agents/_meta/agent-generator.md` § Dispatch Modes → `bootstrap`.

     **Post-sign-off dispatches (Agent Generator `default` mode).** Any other role (TL, QA-Author, BE Dev, FE Dev, DevOps, QA-Exec, UI/UX Designer, plus SA in `design` mode and BA in re-ingest / iteration / Phase 3) requires SRS `Signed-off` before dispatch. If their file is absent at dispatch time, dispatch Agent Generator in `default` mode (no extra parameter). Default mode reads the signed-off SRS + architecture + instrumentation contract and regenerates EVERY SDLC role's agent file with full `## Project Specialization`. If SRS isn't Signed-off, the default-mode Agent Generator halts — which is correct, because the dispatch itself was illegal (CLAUDE.md §10 forbids non-BA work pre-sign-off).

     **Specialization timing — and the operator regen-confirmation gate.** Default-mode Agent Generator runs on the FIRST `SRS Status: Draft → Signed-off` transition (initial generation — full set of SDLC agent files materializes). On SUBSEQUENT sign-off transitions (typical pattern: BA Mode D adds a US / FR; SRS Status: Signed-off → Draft → Signed-off), the Orchestrator does NOT auto-regenerate. Instead, it halts with `NEEDS_CONTEXT` and surfaces a three-option prompt to the operator:

     ```
     Status: NEEDS_CONTEXT
     Reason: SRS hash changed; agent files reference the previous hash.
       Previous SRS hash: <sha256-prefix-of-prev-signoff>
       Current SRS hash:  <sha256-prefix-of-now>

     Changed sections (from SRS structural diff):
       <list of §s that changed since previous sign-off>

     How should agent files be refreshed?
       [a] Skip regeneration — proceed with existing agent files. The new USes/FRs are picked up via SRS reads during dispatch; agents that don't need specialization refresh continue as-is.
           RECOMMENDED for additive Mode D changes (US/FR row additions in §3.2/§3.3 indexes, §10 Changelog updates) where no domain / security / NRS / architecture content changed.

       [b] Targeted regenerate — refresh only the roles whose specialization reads the changed sections.
           Affected for this diff: <list of role names, computed from changed-sections → roles mapping below>
           Use when changes are scoped but non-trivial (e.g., §5 User Roles changed → BA / BE Dev / FE Dev / QA-Author affected).

       [c] Full regenerate — refresh all 9 SDLC agent files from the new SRS hash.
           Use when domain (§3.1), security (§4.1), NRS (§4), or architecture-impacting content has shifted substantively.
     Recommended: <a / b / c based on diff size>
     Justification: <one-line summary of the diff>
     ```

     **Operator picks; Orchestrator acts:**
     - `[a] Skip` → proceed to dispatch the work that prompted the SRS update. The agent files retain their stale `Generated-From-SRS-Hash`; session-init-summary surfaces "Agent files are X commits behind current SRS" at every session start until regen happens.
     - `[b] Targeted` → dispatch Agent Generator in `default` mode with `target_roles: <list>` (see `.claude/agents/_meta/agent-generator.md` § Targeted regenerate). Only the named roles' files are rewritten.
     - `[c] Full` → dispatch Agent Generator in `default` mode with no `target_roles` (regenerate all 9 SDLC roles, the existing behavior).

     **Section → role mapping (used for diff analysis):**
     - §3.1 Domain Specification → BA, SA, TL, BE Dev
     - §3.2 User Stories index → BA, TL, QA-Author
     - §3.3 FRS index → BA, SA, TL, BE Dev, FE Dev, QA-Author
     - §3.4 Technical Constraints (UI Introspection / API contract format) → BE Dev, FE Dev, QA-Author, QA-Exec
     - §3.5 External Integrations → SA, BE Dev
     - §4 NRS (latency / throughput / availability) → SA, BE Dev, FE Dev, QA-Exec
     - §4.1 Security & Compliance → all roles
     - §5 User Roles & Permissions → BA, BE Dev, FE Dev, QA-Author
     - §6 User Activity Logging → SA, BE Dev, QA-Author
     - §7 Definition of Done → all roles
     - Designated Design Approver header → UI/UX Designer, BA (Phase 3)
     - Designated Dependency Approver header → SA
     - Frontend-Framework header → FE Dev, QA-Author, QA-Exec, UI/UX Designer
     - Backend-Track / Backend-Framework headers → BE Dev, QA-Author, QA-Exec, DevOps

     **Diff-size heuristic for recommended default:**
     - SMALL (recommend `a` Skip): only §3.2 / §3.3 / §10 Changelog row additions; no header field changes; no body modifications to existing rows.
     - MEDIUM (recommend `b` Targeted): changes touch §3.4, §3.5, §5, §6, §7, or per-row modifications to existing US/FR content (vs. just additions).
     - LARGE (recommend `c` Full): §3.1 Domain modifications, §4.1 Security regime changes, or multi-section changes spanning >3 of the section categories above.

     The gate is operator-explicit by design. Workload-tier ≠ `conservative` doesn't bypass this — even in `aggressive` mode the kit asks, because regen waste compounds across iterations. Operator may opt to script-auto-pick via `CLAUDE_AGENT_REGEN_DEFAULT=skip|targeted|full` env var (one-off; document rationale).

     Resume the original flow after the Agent Generator returns successfully.

   - **NEVER fall back to `subagent_type: general-purpose`** as a workaround for a missing agent file — this is the CLAUDE.md §10 hard rule. General-purpose strips the kit's mode procedures, Hard Rules, no-invention invariant, conflict-detection discipline, and tool scope. The result is output that doesn't match the kit's discipline.
   - The only exception is one-off cross-cutting work that genuinely has no kit role. Permit general-purpose only when `CLAUDE_ALLOW_GENERAL_PURPOSE=1` is set in the environment, and document the rationale in SRS §10 Changelog.

4.6. **Per-dispatch physical worktree creation (code-writing roles only).** Doc-writing roles (BA, SA, TL, QA-Author, UI/UX Designer) write to logically-owned paths under `docs/` from the main cwd — the `orchestrator-write-guard.cjs` hook's role-ownership map allows them. **Code-writing roles (BE Dev, FE Dev, QA-Exec, DevOps) require physical worktree isolation** because their write target (under the project's declared source roots `frontend/**` / `backend/**` per SRS §3.4.5) is by-task, not by-role-owned-path, and the `source-code-write-guard.cjs` hook blocks source writes that are either outside any `.worktrees/<role>-<task-id>/` segment OR (inside a worktree) not under a declared source root.

   For each code-writing dispatch, BEFORE the Task tool call:

   - **Write the dispatch journal FIRST.** Before the worktree-add and before the status `→ in-progress` write, write
     `.claude/dispatch-journal/<role>-<task-id>.json` per `.claude/rules/crash-recovery.md` §14.2 (role, subagent_type,
     isolation, worktree, branch, `dispatched_at`, `status_before`, and `baseline` = current main HEAD + the role's
     owned `docs/` paths). This is the intent log that makes the dispatch recoverable if the session dies mid-work.
   - **Create the worktree on disk.** Run `git worktree add -b agent/<role>/<task-id> .worktrees/<role>-<task-id>/ <base-ref>` (typically `<base-ref>` is `HEAD` or the relevant phase branch). If the worktree already exists from a prior run (`git worktree list | grep <role>-<task-id>`), reuse it.
   - **Pass the absolute worktree path into the dispatch prompt.** The dispatch prompt MUST include a section like:
     ```
     Your physical worktree is at: <absolute-path>/.worktrees/<role>-<task-id>/
     Use this absolute path as the prefix for ALL source-code writes.
     FE Dev writes under `frontend/` (frontend/src/** or frontend/<app>/**);
     BE Dev writes under `backend/` (backend/src/** or backend/<service>/**)
     per SRS §3.4.5 Source Layout; tests under e2e/specs/**. The source-code-write-guard
     hook refuses source writes outside this worktree.
     For doc writes (docs/api-contracts/, docs/uiux/refs/, etc.) you may write
     directly to the project-relative path; the role-ownership map allows them.

     Your FIRST Bash action MUST be `cd <absolute-path>/.worktrees/<role>-<task-id>/`,
     and every build / install / test / mutation MUST run worktree-scoped — either
     from that cwd or via `cd .worktrees/<role>-<task-id> && …`, `git -C`, `--prefix`,
     or `make -C` pointed at your worktree. Because the Task tool gives every
     sub-agent the SAME inherited cwd (project root), an unscoped `npm run build`
     etc. runs against the shared root tree and collides with parallel agents; the
     `orchestrator-bash-guard` hook (command-aware via lib/worktree-scope.cjs) blocks
     unscoped source-tree mutations and allows worktree-scoped ones.
     ```

   - **Exit-criterion reminder for code-writing dispatches.** The dispatch is not
     done until all source writes and Bash mutations were worktree-scoped (the two
     guards enforce this at runtime; an agent that hits a block must re-scope to its
     worktree, never request the escape hatch as a first resort).
   - **Don't create worktrees for doc-writing roles.** A `git worktree add` for BA / SA / TL / QA-Author / UI/UX Designer dispatches is permitted (physical isolation never hurts) but not required. The default is to skip the worktree-add for these — they write doc paths directly under `docs/` from the main cwd. Skipping saves ~200ms per dispatch and keeps `.worktrees/` clean of inert directories.

   Cleanup happens at §9 Step 7 (sub-agent return): the Orchestrator runs `git worktree remove .worktrees/<role>-<task-id>/` after ingesting `plan-update.json` and merging role-owned artifacts.

5. For each eligible task, create an isolated worktree per `.claude/rules/worktree-isolation.md` §5 (for code-writing roles per Step 4.6) and dispatch the
   appropriate sub-agent.
6. Commit master plan updates from the main repo (the Orchestrator's cwd). The `master-plan-write-guard.cjs` hook detects sub-agent context by `.worktrees/<role>-<task-id>/` path segment and blocks only those; main-repo writes to `docs/plan/` are allowed by default. No env-var setup is required. Escape hatch `CLAUDE_ALLOW_PLAN_WRITE=1` exists for rare kit-dogfooding scenarios.
7. On sub-agent return: validate output against exit criteria, ingest `plan-update.json`, commit master plan update,
   merge role-owned artifacts (BE before FE when both return for the same feature), clean up worktree and **delete the dispatch journal entry** `.claude/dispatch-journal/<role>-<task-id>.json` as the FINAL cleanup
   action, after `plan-update.json` is ingested, the master-plan transition committed, role-owned artifacts merged, and
   the worktree removed. Deleting it last preserves §14's re-entrancy invariant (a crash before this point leaves the
   dispatch reconcilable).

7.5. **Post-Implementation Verification dispatch (UI tasks only).** Before committing a FE Dev `→ ready-for-deploy` transition to the master plan, check the task file. If the task is UI-bearing (`track: fe` / `be+fe`, OR `Design sub-status:` set, OR `Linked Surface:` non-null), dispatch BA in `post-implementation` mode (subagent_type: `ba`, dispatch parameter `mode: post-implementation`, with `task_id` + FE Dev worktree path). BA produces `docs/uiux/post-implementation-reports/<task-id>.md` with verdict `qualified` or `unqualified`. Verdict-handling matrix:

   - `qualified` — accept FE Dev's `→ ready-for-deploy` transition; commit; proceed to DevOps dispatch.
   - `unqualified` — REVERT the FE Dev transition (`ready-for-deploy → in-progress` in the task file's status history with `notes: "Reverted by Phase 5 verdict: <gap-summary>"`); dispatch the report's recommended remediation (typically FE Dev with the gap list, OR QA-Author by-task if missing testID coverage); loop returns to step 4. Phase 5 re-runs after the next `→ ready-for-deploy` proposal. Continue the loop until Phase 5 returns `qualified`.

   This step exists because the kit's design lifecycle was asymmetric — `parallel-execution.md` §4 gated DESIGN existence rigorously but trusted FE Dev's self-attestation that the IMPLEMENTATION matched the design-confirmed handoff. The 2026-06-04 FR-022 batch-UI silent drop showed the failure mode: FE Dev shipped 3 of 4 DoD scopes, claimed all 4 in `plan-update.json` notes, and no downstream gate caught the omission. Phase 5 is the structural fix — an independent BA dispatch that reads the handoff + diff and forms a verdict the FE Dev cannot self-approve.

   The runtime gate `ui-task-readiness-guard.cjs` fires BEFORE Phase 5 — if the artifact set (`docs/uiux/refs/<task-id>.md`, `docs/uiux/visual-specs/<task-id>.md`, `docs/test-cases/by-task/<task-id>/`) is incomplete, the `plan-update.json` write is refused at FE Dev's worktree and Phase 5 is never dispatched. Phase 5 dispatches only when the artifact set is on disk.

8. Re-evaluate from step 2. **This re-evaluation is the loop the `/sdlc-loop` command automates:** when the operator starts `/sdlc-loop`, the Orchestrator repeats Steps 2–7 autonomously — picking each next eligible batch without an operator prompt — until a halt condition fires (human gate, NEEDS_CONTEXT, `open` issue, operator-routed OQ, circuit breaker, plan complete, or token budget). See `.claude/rules/autonomous-loop.md` §15. Outside `/sdlc-loop`, a single invocation performs one pass of Steps 2–7 and yields back to the operator.

The Orchestrator does not implement, design, write tests, or deploy. It coordinates, guards artifact integrity, and is
the sole writer to anything under `docs/plan/`. **The Orchestrator NEVER writes source code directly** — code under `**/src/`, `e2e/**/*.spec.*`, and project-declared custom directories is BE Dev / FE Dev territory (Path A SDLC) or routes through the Path B2 trivial-fix exemption which still dispatches Dev (never Orchestrator-direct). When a user request implies code changes ("fix the bug in X", "add Y to file Z", "rename this function"), classify as Path A (most cases) or Path B2 (trivial single-line bug fix meeting the four exemption conditions); both paths produce a master-plan task and a Dev dispatch. The `source-code-write-guard.cjs` hook enforces at runtime; the prose discipline is the authoritative control. On `plan-update.json` ingestion, the Orchestrator updates 1–3 files: always the task file, sometimes the phase file, rarely the top master-plan.md (only when running-tasks set changes).
