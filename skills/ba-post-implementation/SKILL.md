---
name: ba-post-implementation
description: "BA Phase 5 — post-implementation completeness verification (UI tasks). Load when dispatched with mode: post-implementation after FE Dev proposes to_status: ready-for-deploy for a UI-bearing task. Cross-references the design-confirmed handoff + task DoD against the FE Dev git diff (and deployed bundle when present) and emits docs/uiux/post-implementation-reports/<task-id>.md with a qualified/unqualified verdict."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Phase 5 — Post-Implementation Completeness Verification

## When to use

You are the BA, dispatched in `post-implementation` mode after FE Dev proposed `ready-for-deploy` for a UI-bearing task. Independently verify the implementation matches the design-confirmed handoff and the task DoD (you are a fresh reviewer, never a rubber-stamp), and emit the verdict report. Mirrors Phase 3 but operates on the implementation diff.

### Phase 5 — Post-Implementation Completeness Verification (UI tasks)

This phase runs **after FE Dev proposes `to_status: ready-for-deploy`** for any UI-bearing task (`track: fe` / `be+fe`, or `Design sub-status:` set in master plan, or `Linked Surface:` non-null). The Orchestrator dispatches BA in `post-implementation` mode (subagent_type: `ba` + dispatch parameter `mode: post-implementation`) BEFORE committing the master-plan transition.

This phase mirrors Phase 3 (design completeness against the handoff) but operates against the implementation diff. Phase 3 asks "is the design complete?"; Phase 5 asks "is the implementation complete?" Without Phase 5, the kit gates design existence rigorously but trusts implementation to self-attest — the 2026-06-04 FR-022 batch-UI silent-drop incident is what that asymmetry costs.

#### Trigger

- FE Dev has emitted `plan-update.json` proposing `to_status: ready-for-deploy` for a UI-bearing task.
- The `ui-task-readiness-guard.cjs` hook has already accepted the write (the artifact set — `docs/uiux/refs/<task-id>.md`, `docs/uiux/visual-specs/<task-id>.md`, `docs/test-cases/by-task/<task-id>/` — is present on disk). If the hook refused, the Orchestrator routes the gap to QA-Author / FE Dev re-dispatch first; this phase does NOT run while the artifact set is incomplete.
- The Orchestrator dispatches you with: `task_id`, the FE Dev worktree path (`.worktrees/fe-dev-<task-id>/`), and a copy of the FE Dev `plan-update.json` (notes + DoD-scope justifications).

#### Procedure

1. **Read the design-confirmed handoff and FE refs.** Open `docs/uiux/handoffs/<task-id>.md`, `docs/uiux/refs/<task-id>.md`, and `docs/uiux/visual-specs/<task-id>.md`. Build the implementation expectation list: every screen, every component, every state, every interaction, every confirm-dialog / toast / modal the handoff names, and every row in `## Design Element Manifest` / `## Design Element Assertions`.

2. **Read the task DoD.** Open `docs/plan/<phase>/tasks/<task-id>.md`. Build the scope expectation list from each numbered Scope / sub-bullet — explicit code-path mentions, surface mentions, testID family mentions.

3. **Compute the implementation diff.** Run `git diff main..HEAD` against the FE Dev worktree. Parse the diff into: changed files, added/removed code locations, testIDs introduced, components touched.

4. **Cross-reference each expectation against the diff.**
   - For each handoff-named component: locate a matching diff hunk (file path AND component name). Missing match = gap.
   - For each Design Element Manifest row: locate a matching implementation trace row in `docs/uiux/refs/<task-id>.md`, then verify the named code location exists in the diff or pre-existing code cited by FE Dev. Missing trace, missing code location, or `planned` / `not implemented` status = gap.
   - For each static Figma label/option/copy/action in the manifest: grep the diff or cited source for the exact text OR for the i18n key mapped to that exact text. Missing exact copy/key = gap.
   - For each form field / table column / list item field / card field / menu option / tab / chip in the manifest: verify the diff or cited source contains a matching field/column/slot/option and selector/accessibility hook when one is required.
   - For each DoD-scope code-path mention: locate a matching diff hunk. Missing match = gap (unless FE Dev's `plan-update.json` notes carries an explicit justification per the FE Dev Self-Verification Bar rule).
   - For each testID family declared in `docs/instrumentation-contract.md` for the surface: grep the diff for at least one occurrence. Zero occurrences for a family = gap.

5. **Cross-reference each expectation against the deployed bundle when available.** If a deploy report exists for the task at `docs/deploy-reports/<task-id>.md` referencing a built artifact, grep the artifact for expected testIDs, static copy/i18n keys, and manifest-required fields/items where practical. (Diff-side check covers source; bundle-side check covers any tree-shaking / build-time elision that drops elements from production.)

6. **Compose the verdict.**
   - **`qualified`** — every handoff-named element, every Design Element Manifest row, every Design Element Assertion, and every DoD scope is represented in the diff/source (or explicitly justified where allowed). Every contract-declared testID family appears in the diff or bundle.
   - **`unqualified`** — one or more gaps. Enumerate each gap by: handoff frame reference, DoD scope reference, missing testID family, OR contract section. Recommend the remediation shape (re-dispatch FE Dev with gap list, OR re-dispatch QA-Author by-task if missing testIDs are coverage gaps).

#### Output

Produce `docs/uiux/post-implementation-reports/<task-id>.md`:

- Summary verdict: `qualified` or `unqualified`
- Per-expectation verdict with specifics for any gaps
- For `unqualified`: list every gap with handoff frame reference / Manifest ID / DoD scope reference / file-path expected vs file-path observed
- Recommended next step: `re-dispatch-fe-dev` (with gap list) or `re-dispatch-qa-author-by-task` (when missing coverage)
- For `qualified`: explicitly note "implementation matches design-confirmed handoff" so the next reader can audit the verdict

`plan-update.json` does NOT transition the master-plan task status. Phase 5's job is to produce the report; the Orchestrator reads the verdict and decides:
- `qualified` → accept FE Dev's original `→ ready-for-deploy` transition, proceed to DevOps.
- `unqualified` → revert FE Dev's transition to `in-progress`; dispatch the recommended remediation; FE Dev / QA-Author re-runs; Phase 5 re-runs after the next FE Dev `ready-for-deploy` proposal. Loop until `qualified`.

#### Hard Rules for Phase 5

- **Never produce `qualified` against an absent handoff.** If `docs/uiux/handoffs/<task-id>.md` is missing, halt with `NEEDS_CONTEXT` and request the Orchestrator dispatch UI/UX Designer first. The kit's design lifecycle should have already produced the handoff before FE Dev started; absence here means a prior gate failed.
- **Never produce `qualified` against an absent visual spec or by-task TC pack.** The `ui-task-readiness-guard.cjs` hook should have blocked the upstream `plan-update.json`; if you're being dispatched in Phase 5 against missing artifacts, halt with `NEEDS_CONTEXT` and request the kit's `ui-task-readiness-guard.cjs` enforcement be re-applied.
- **Never produce `qualified` when `docs/uiux/refs/<task-id>.md` lacks `## Design Element Manifest` or `## Implementation Trace Matrix`.** That means FE Dev did not freeze an implementation-level design contract.
- **Never collapse manifest rows into component-level acceptance.** A rendered `UserProfileCard` does not prove that `DEM-004 Phone number`, `DEM-005 Department`, and `DEM-006 Manager` are present. Verify each row.
- **Never invent justifications for missing diff coverage.** When a Scope has zero matching diff hunks AND FE Dev's `plan-update.json` notes does NOT carry an explicit justification: the verdict is `unqualified`. Do not pattern-match "probably this was covered under another Scope" — that's exactly the discipline failure Phase 5 exists to catch.
- **You are a fresh reviewer, not the FE Dev's editor.** You read the diff and the handoff independently and form your own verdict. If FE Dev's self-verification said "all 4 Scopes covered" and your diff scan finds Scope A absent, your verdict overrides FE Dev's claim. The kit's discipline depends on Phase 5 being an independent check — not a rubber-stamp of FE Dev's self-attestation.
