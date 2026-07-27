---
name: ba-design-completeness
description: BA Phase 3 — post-sign-off design completeness verification. Load when the Orchestrator re-dispatches BA after the UI/UX Designer produces docs/uiux/handoffs/<task-id>.md (design sub-status design-ready-for-review). Verifies screen/state/component/platform/color coverage against the handoff (completeness, NOT design quality) and emits docs/uiux/completeness-reports/<task-id>.md.
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Phase 3 — Design Completeness Verification

## When to use

You are the BA, re-dispatched after the UI/UX Designer handed off `docs/uiux/handoffs/<task-id>.md`. Verify design completeness against the SRS (presence + consistency, not aesthetics) and emit the completeness report. This runs after SRS sign-off and before FE Dev may start.

### Phase 3 — Post-Sign-off: Design Completeness Verification

After SRS is `Signed-off`, you have a second responsibility: verifying designs as they become available. This phase
runs **after** SRS sign-off and **before** FE Dev can start.

You do not require designs to exist for sign-off. You verify them when the UI/UX Designer hands them off.

#### Trigger

You are re-dispatched when:

- UI/UX Designer has produced `docs/uiux/handoffs/<task-id>.md` (design sub-status `design-ready-for-review` in master
  plan), regardless of which mode produced it (`create`, `revise`, or `incorporate`), OR
- The Orchestrator detects that SRS has UI requirements but `## Design References` is missing or incomplete (in which
  case you flag this as an Open Question pre-sign-off, but do not block sign-off on it)

When verifying a handoff produced in `incorporate` mode, pay particular attention to the
`## Human Edit Reconciliation Notes` section if present. Each conflict noted there is a candidate Open Question; do
not silently mark the design `qualified` if the designer flagged unresolved tension between human edits and SRS
constraints.

#### Design Completeness Check

For every UI requirement in SRS, verify against the designer's `docs/uiux/handoffs/<task-id>.md`:

1. **Screen coverage** — every surface listed in SRS `## Design References` has a Figma node ID pinned.
2. **State coverage** — every state named in the User Story's Business Rules at `docs/user-stories/<US-ID>.md` (empty, loading, error, success, plus any
   explicit others) appears in the design handoff's component inventory for that screen.
3. **Component coverage** — every component named in the User Story's Main Flow / Business Rules at `docs/user-stories/<US-ID>.md` for a screen appears in
   that screen's component inventory.
4. **Design Element Manifest coverage** — `docs/uiux/handoffs/<task-id>.md` contains `## Design Element Manifest` and every SRS-named or Figma-visible implementation-bearing element appears in it: fields, labels, placeholders, validation messages, table/list/card fields, nav/tab/menu/chip options, buttons/actions, modal/toast/state copy, semantic icons/media slots, and static copy. Only non-rendered design-tool annotations, measurements, prototype wires, and hidden layers may be excluded. Missing manifest, missing rows, or component-only inventory = `unqualified`.
5. **Frame identity and reference render** — each handoff surface cites the exact pinned Node ID, scoped-page ancestry, Figma version, mapping surface signature, and a checksummed full-frame reference render at the declared viewport. Duplicate/same-named candidates, node/snapshot mismatch, missing render, or missing signature = `unqualified` with `wrong-frame-risk`.
6. **Visual composition coverage** — the handoff contains a non-empty `## Visual Composition Contract` for every surface/state/platform, including frame-relative viewport, root layout, direct-child z-order, key bounds/constraints, clipping/masks, and responsive behavior. A component inventory without composition geometry = `unqualified`.
7. **Asset coverage** — the handoff contains a non-empty `## Asset Export Manifest`. Every visible logo, brand mark, icon, photo, avatar, illustration, texture, image fill, video poster, or background image is present with Figma Node ID, render behavior, export format/scales, target path, semantics, and non-blocked status. `decorative` may set empty accessibility semantics but may not exclude rendering. Placeholder substitution or an inaccessible/unexportable required asset = `unqualified`.
8. **Color palette** — colors listed in `docs/uiux/handoffs/<task-id>.md` are consistent with SRS brand / design system
   requirements. Flag any color outside the declared palette.
9. **Platform coverage** — for each surface, every platform listed in SRS `Platform` column has a corresponding
   variant in the handoff.
10. **Staleness check (for `import`-source handoffs only)** — if the handoff's `Source: imported` flag is set AND `Design-may-be-stale: yes`, return `unqualified` with reason `design-may-be-stale`. The Figma was last modified >30 days before SRS `Last-Updated`; the design predates the current requirement and needs human re-verification. The designer's next dispatch (`revise` mode) confirms the imported design still matches the requirement, or surfaces what's drifted.
11. **Gap-list check (for `import`-source handoffs only)** — if the handoff carries a non-empty gap list from `import` mode, return `unqualified`. The gaps are concrete revision targets; the designer's next `revise` dispatch addresses them.

This is a **completeness check, not a design review**. You verify *presence and consistency*, not aesthetic quality,
interaction logic, or accessibility heuristics. Aesthetic quality is the human approver's job (next step in the flow,
not yours).

#### Output

Produce `docs/uiux/completeness-reports/<task-id>.md`:

- Summary verdict: `qualified` or `unqualified`
- Per-check verdict with specifics for any failures
- For `unqualified`: list every flagged item with SRS requirement ID and the specific gap
- Recommended next step: `dispatch-designer-revise` or `proceed-to-user-confirmation`

`plan-update.json` design sub-status transitions:

- `design-ready-for-review` → `design-revision-needed` (if unqualified)
- `design-ready-for-review` → `design-pending-user-confirmation` (if qualified)

#### Hard Rules for Phase 3

- Never sign off design quality — only completeness.
- A missing item is `unqualified`, not "minor". The designer iterates until completeness is met.
- A missing Design Element Manifest is `unqualified`; FE Dev cannot be expected to implement fields/items that no contract enumerates.
- Missing reference renders, visual composition rows, or asset export rows are `unqualified`; functional completeness is not visual completeness.
- A decorative-but-rendered layer is still required. Only non-rendered Figma annotations/measurements/hidden layers may be excluded from implementation.
- Never edit Figma. You read the handoff, not the file directly.
- If the SRS itself is the gap (the designer found ambiguity), reopen the relevant SRS requirement, raise an Open
  Question, and revert SRS Status to `Draft` if scope is affected.
