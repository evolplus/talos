# Parallel Execution

This file holds CLAUDE.md §4. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`. For role definitions, see
`.claude/rules/sub-agent-registry.md` §3.

---

## 4. Parallel Execution

**Tier-aware:** the patterns below are MINIMUMS — the Orchestrator may parallelize more aggressively per `.claude/rules/workload-tier.md` §13 when the workload tier is `aggressive` (kit default). At `aggressive`, the Orchestrator dispatches every eligible-parallel sub-agent in one Orchestrator turn (multiple `Task` calls in one message); enables cross-phase pipelining; and batches sub-agent dispatches where the role supports it. At `standard`, the patterns below are the operative default. At `conservative`, the Orchestrator dispatches one sub-agent per turn regardless of parallel-eligibility. The tier never relaxes safety boundaries (sign-off gates, design-confirmed, Stage 4 brownfield, worktree isolation, plan-state coherence).

The Orchestrator **must** run sub-agents in parallel whenever their inputs and outputs do not conflict. Sequential
execution is a fallback, not a default.

**Default parallel patterns:**

- Once SRS is `Signed-off`: SA (architecture) and QA-Author in `by-us` mode may start together. QA-Author runs in **two passes**:
  - **Pass 1 (parallel with SA):** all markdown TCs at `docs/test-cases/by-us/<US-NNN>/functional.md` + executable spec scaffolding + non-UI spec bodies (API tests, backend flows). UI spec bodies that need selectors not yet declared in the instrumentation contract carry literal `TODO: instrumentation-contract` markers and a paired open-issue.
  - **Pass 2 (conditionally dispatched, post-SA):** triggered only when SA's `docs/instrumentation-contract.md` lands AND Pass 1 left TODO markers. QA-Author fills selectors from the contract; validates every contract-declared testID appears in some spec; resolves the paired open-issues.
  - The Orchestrator detects the Pass 2 trigger by watching for `docs/instrumentation-contract.md` to be merged to main while at least one open-issue with category `selector-pending-contract` exists. Dispatches QA-Author in `by-us` mode with `pass: 2` and the list of affected TC IDs.
- Once master plan is published: tasks with no inter-dependencies run in parallel — one sub-agent per task. QA-Author in `by-task` mode runs per task once the task is dispatchable (after TL for non-UI tasks; after `design-confirmed` for UI tasks).
- **BE and FE for the same feature run in parallel** once the API contract is frozen (see contract-freeze rule below).
- QA-Author `by-task` test-case authoring runs in parallel with Developer implementation. (Block Dev *task closure* on test-case
  existence, not Dev *start*.)
- DevOps deployment of independent components runs in parallel.

**Must run sequentially:**

- BA → SA (architecture cannot precede signed-off requirements)
- SA → architecture-validator → TL (architecture must be `Validated` by the independent gate before task breakdown — see the Architecture Validation gate below)
- BE Dev (contract publication) → FE Dev (when FE depends on a new BE endpoint)
- Dev → DevOps → QA-execution for the same task

**Architecture Validation gate (SA → architecture-validator → TL):**

The architecture is the kit's last load-bearing artifact whose author (SA) historically self-attested its own exit criteria, with TL then consuming `docs/architecture.md` as truth. The Architecture Validator (`.claude/rules/sub-agent-registry.md` §3.11) closes that gap with the same author-≠-approver discipline the two SRS validators apply to the SRS.

- SA's `design` dispatch produces `docs/architecture.md` at `Status: Draft` (plus ADRs + instrumentation-contract).
- The Orchestrator dispatches `architecture-validator` (subagent_type `architecture-validator`) against the Draft architecture. It writes `docs/architecture-validation-reports/v<arch-version>.md` and a verdict.
  - `qualified` → the validator flips architecture `Status: Draft → Validated` and sets `Validated-by: architecture-validator`. TL becomes eligible.
  - `unqualified` → architecture stays `Draft`; the report carries a revision list (R-1..R-N). The Orchestrator re-dispatches SA `design` mode against it; the validator re-runs. Loop until `qualified`.
- **TL must not be dispatched while architecture `Status ≠ Validated`.** This is the design-side analogue of "no downstream work while SRS Status ≠ Signed-off."
- QA-Author `by-us` mode (which keys off the signed-off SRS, not the architecture) may still run in parallel with SA + the validator per the "Once SRS is `Signed-off`" rule above — only TL's task breakdown is gated on `Validated`.
- Brownfield extract exception: an `extract`-mode architecture paired with a `Purpose: documentation` SRS is validated for internal consistency only (no governance SRS to cover); see `.claude/agents/_templates/architecture-validator.md` Step 0.

**Design-Flow A / B / C (chosen at BA Phase 1.X):**

The kit branches design handling based on whether a Figma URL was provided in the requirements. BA Phase 1.X step 10 detects which flow applies and records it in SRS header `Design-Flow:`.

| Flow | Trigger | Where design qualifies | Post-sign-off Designer modes used |
|---|---|---|---|
| **A** | Figma URL present in requirements | PRE-sign-off (BA Phase 2 step 3.5) via UI/UX Designer `map` mode | `incorporate` only, if approver edits Figma later. NO `create`. |
| **B** | No Figma URL, user picks "agent designs fully" | POST-sign-off (existing 5-step lifecycle below) | `create` → BA Phase 3 → Approver confirmation. |
| **C** | No Figma URL, user picks "agent designs then human modifies" | POST-sign-off with hybrid loop | `create` → BA Phase 3 → Approver confirmation → `incorporate` after human edits. |

**Design-Flow A — pre-sign-off path.** When a Figma URL exists in the requirements, BA Phase 1.X step 10 dispatches UI/UX Designer in `map` mode BEFORE setting SRS Status: Signed-off. The designer scans the Figma file, matches frames to SRS surfaces (US-by-US, FR-by-FR), pins Node IDs in SRS §3.4.1, and writes `docs/uiux/figma-mappings/v<srs-version>.md` with `Mapping-Status: qualified | gaps | orphans-only`. BA Phase 2 step 3.5 reads the mapping artifact and refuses to flip SRS Status to `Signed-off` while `Mapping-Status: gaps`. By the time FE Dev later runs against Flow A tasks, designs are already qualified and pinned — the post-sign-off design lifecycle (below) short-circuits to a no-op for Flow A, EXCEPT when the Designated Design Approver edits Figma between sign-off and FE start (which triggers `incorporate` mode).

**Design-Flow B / C — post-sign-off path.** When no Figma URL exists and the SRS has any UI surface, BA Phase 1.X halts with NEEDS_CONTEXT asking the user to pick Flow B (agent designs fully) or Flow C (agent designs initial, human modifies). The SRS header records the choice. Both flows use the existing post-sign-off design lifecycle below. The difference is Flow C plans for human Figma edits as a normal step (`incorporate` mode runs after every Designer dispatch), while Flow B only runs `incorporate` if the Approver edits Figma during the confirmation step.

**Hard rule.** `create` mode NEVER runs by default. It only fires for Flow B or Flow C tasks where the user has explicitly recorded the choice. Design-Flow A's `map` mode replaces the old "designer dispatch happens after sign-off and figures out modes itself" pattern.

**Design lifecycle (FE start gate, applies to Flow B and Flow C):**

For any task with a UI surface and Design-Flow B or C, the design must complete this lifecycle before FE Dev may start. The lifecycle is
tracked as a **design sub-status** on the consuming task (the task remains `track: fe` or `track: be+fe`; the
sub-status records design progress without spawning a separate task).

For Design-Flow A tasks, this lifecycle is SKIPPED — designs already qualified at SRS sign-off. The task's design sub-status is set directly to `design-confirmed` at FE-eligible time, unless the approver has edited Figma since sign-off (in which case `incorporate` runs once to absorb the edits).

0. **Approver precondition** — Before any dispatch in this lifecycle, the Orchestrator reads `Designated Design Approver` from the SRS header (CLAUDE.md §2). If the value is `TBD`, halt and prompt the user to name the approver. The lifecycle does not proceed until the SRS field is populated. Mirrors the human-in-the-loop pattern at step 4, but earlier in the cycle — prevents wasted Designer work when no human will confirm the result.
1. **Designer dispatch — Mode Selection.** The Orchestrator picks the Designer mode based on SRS `Design-Flow:` header + `## Design References` state + dispatch input. Six possible modes (see `.claude/agents/_templates/ui-ux-designer.md` for routing and `.claude/skills/figma-design-handoff/` / `.claude/skills/figma-srs-mapping/` / `.claude/skills/figma-requirements-extraction/` for procedures):

   | Design-Flow | SRS state | Dispatch input | Mode |
   |---|---|---|---|
   | A (pre-BA) | PRD/source input references Figma before BA synthesis | Figma URL captured from source input | **`extract`** — read Figma and write `docs/requirements/design-extracted/<figma-file-id>-<date>.md` as source corpus. PRE-BA. |
   | A (pre-sign-off) | SRS Status: `In-Review`, Figma URL in requirements | URL passed by BA | **`map`** — scan Figma, match to SRS surfaces, write mapping artifact, pin Node IDs. PRE-sign-off. NEW in v0.3. |
   | A (post-sign-off) | SRS `Signed-off`, mapping `qualified` | n/a | None — design lifecycle skipped; sub-status goes direct to `design-confirmed`. |
   | A (Approver edited Figma post sign-off) | SRS `Signed-off`, mapping was `qualified` but Figma version changed | n/a | `incorporate` (absorb human edits, regenerate handoff). |
   | B | SRS `Signed-off`, no Figma Node IDs, header `Design-Flow: B` | n/a | `create` (greenfield — designer authors new screens). |
   | B | SRS `Signed-off`, partial Node IDs | n/a | `import` for pinned set + `create` for gaps (sequential). |
   | C | SRS `Signed-off`, header `Design-Flow: C`, no Node IDs | n/a | `create` (initial draft) → expect human edits → `incorporate` later. |
   | Any | BA Phase 3 returned `unqualified` on a prior handoff | n/a | `revise` (against the existing Figma — whether `create`d, `import`ed, or `map`ed). |
   | Any | Designated Design Approver edited Figma directly between handoff and confirmation | n/a | `incorporate` (read-only absorb of human edits). |

   `import` mode and `map` mode are **read-only against Figma** — they produce kit artifacts without modifying Figma. The difference: `import` runs POST-sign-off and produces a task-scoped handoff (`docs/uiux/handoffs/<task-id>.md`); `map` runs PRE-sign-off and produces an SRS-scoped mapping (`docs/uiux/figma-mappings/v<srs-version>.md`) used by BA Phase 2 step 3.5.

   `create` mode requires explicit Design-Flow B or C user choice (BA Phase 1.X step 10 records the choice). Never runs by default.

   Gaps surfaced during `import` or `map` (missing surfaces, missing states, hardcoded colors, stale design) route through BA Phase 3 (post-sign-off, Flow B/C) or BA Phase 2 step 3.5 (pre-sign-off, Flow A) to `revise` or `create` as appropriate.
2. **Designer handoff** — Designer produces `docs/uiux/handoffs/<task-id>.md`; design sub-status transitions to
   `design-ready-for-review`.
3. **BA completeness verification** — BA emits `docs/uiux/completeness-reports/<task-id>.md`. If `unqualified`,
   sub-status transitions to `design-revision-needed` and the loop returns to step 1 in `revise` mode. If `qualified`,
   sub-status transitions to `design-pending-user-confirmation`.
4. **User confirmation** — Orchestrator presents the Figma file URL and version ID to the **Designated Design Approver**
   (named in SRS header per CLAUDE.md §2) and requests one of three responses:
   - **Confirm** — sub-status transitions to `design-confirmed` and the Figma file version ID is recorded in master
     plan against the task.
   - **Reject** — sub-status returns to `design-revision-needed` with the approver's notes appended to
     `docs/uiux/completeness-reports/<task-id>.md`. Loop returns to step 1 in `revise` mode.
   - **Edited, please re-verify** — the approver (or a human designer) modified the Figma file directly between
     handoff and confirmation. Sub-status transitions to `design-human-edited` and the loop enters step 4a.

4a. **Incorporate human edits** — Orchestrator dispatches the UI/UX Designer in `incorporate` mode. The designer
    reads the current Figma file, captures the new file version ID, regenerates `docs/uiux/handoffs/<task-id>.md`
    against the new version, and notes in the handoff which changes were human-introduced versus what the prior
    handoff described. Sub-status returns to `design-ready-for-review` and the loop resumes at step 3 (BA
    re-verifies completeness against the updated handoff). The human's edits are treated as a co-authored
    contribution, not a reviewer correction.
5. **FE Dev** — May now start. FE Dev produces the per-task design contract (`docs/uiux/refs/<task-id>.md`) against the
   user-confirmed Figma file version. The contract includes `## Design Element Manifest` and `## Implementation Trace Matrix`, so every Figma field/item/copy/action is tracked to code and test evidence. The `fe-dev-design-contract-guard.cjs` hook refuses any FE-source-code write from an `fe-dev` worktree until `docs/uiux/refs/<task-id>.md` exists AND its header carries `Status: Frozen`. The prose rule (Design Contract Hard Rules in `.claude/agents/_templates/fe-dev.md`) was previously enforced only by self-discipline; the hook makes it a runtime gate.

6. **Post-Implementation Verification (PIV) — symmetry to Step 3.** When FE Dev's `plan-update.json` proposes `to_status: ready-for-deploy` for a UI-bearing task, the kit verifies that the implementation matches the design-confirmed handoff BEFORE the Orchestrator commits the master-plan transition. Two enforcement layers:

   - **Runtime gate (`ui-task-readiness-guard.cjs`).** Refuses the `plan-update.json` write when ANY of the following is absent or content-incomplete: `docs/uiux/refs/<task-id>.md` with `## Design Element Manifest` + `## Implementation Trace Matrix`, `docs/uiux/visual-specs/<task-id>.md` with `## Design Element Assertions`, `docs/test-cases/by-task/<task-id>/` (with ≥1 TC file). Triggered on `to_status: ready-for-deploy` for tasks where the task file shows `track: fe` / `be+fe`, or `Design sub-status:` set, or `Linked Surface:` non-null.

   - **Structural step (BA Phase 5 — Post-Implementation Completeness Verification).** When the runtime gate passes (the artifact set is on disk), the Orchestrator dispatches BA in `post-implementation` mode. BA reads `docs/uiux/handoffs/<task-id>.md` (the Designer's confirmed handoff), `docs/uiux/refs/<task-id>.md`, `docs/uiux/visual-specs/<task-id>.md`, and the FE Dev's diff in `.worktrees/fe-dev-<task-id>/` (Bash `git diff main..HEAD` from the worktree), and produces `docs/uiux/post-implementation-reports/<task-id>.md` with verdict:
     - `qualified` — every UI element / state / interaction the handoff names and every Design Element Manifest row is present in the implementation. Sub-status remains `design-confirmed`; the task may transition `→ ready-for-deploy`.
     - `unqualified` — one or more handoff-named elements / states / interactions / manifest rows are absent from the implementation. The report enumerates each gap by handoff-frame reference + Manifest ID + DoD-scope reference. The task reverts to `in-progress`; the Orchestrator re-dispatches FE Dev with the gap list. Loop returns to Step 5 (FE Dev re-implements + freezes design contract).

   BA Phase 5 is mandatory for every UI-bearing task; it cannot be skipped by any agent or operator. The PIV mirrors Step 3 (BA Phase 3 completeness check on the handoff itself) — Step 3 asks "is the design complete?", Step 6 asks "is the implementation complete?" Without Step 6, the kit gates design existence rigorously but trusts implementation to self-attest; the 2026-06-04 FR-022 batch-UI silent drop is what that asymmetry costs. With Step 6, every UI closure passes an independent verification dispatched by the Orchestrator.

The user confirmation step (Step 4) and the Post-Implementation Verification (Step 6 — BA-authored verdict) are the kit's two human-or-agent-as-fresh-reviewer gates in the design lifecycle. Step 4 cannot be skipped or auto-approved by any agent. Step 6 is BA-authored (BA acts as an independent reviewer; BA's procedure forbids vacuous-pass against absent artifacts — `ui-task-readiness-guard.cjs` already fires before Phase 5 dispatch).

**Conflict rule:** Two agents must not write to the same file in the same phase. If they would, the Orchestrator
serializes them or splits the artifact.
