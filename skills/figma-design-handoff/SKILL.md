---
name: figma-design-handoff
description: UI/UX Designer post-sign-off design workflow for `create`, `import`, `revise`, and `incorporate` modes. Produces or refreshes Figma-backed handoff artifacts, refs, SRS Design References Node IDs, and plan updates while respecting Design-Flow A/B/C, Foundation tokens/components, page scoping, canvas lint, and human-edited Figma reconciliation.
agents: [ui-ux-designer]
sdlc_phase: design
owner: Platform Eng
status: active
---

# Figma Design Handoff

## Use

Use this skill when UI/UX Designer is dispatched after SRS sign-off in one of these modes:

- `create` - create missing Figma surfaces for Design-Flow B/C, or explicitly approved gap surfaces in Design-Flow A.
- `import` - read existing pinned Figma Node IDs and produce a kit handoff without modifying Figma.
- `revise` - update existing Figma work after BA design completeness returns `unqualified`.
- `incorporate` - absorb human edits made directly in Figma and regenerate the handoff.

Do not use this skill for pre-BA extraction or pre-sign-off mapping; those are handled by `figma-requirements-extraction` and `figma-srs-mapping`.

## Required Companion Skills

Load these skills when their condition applies:

- `ui-ux-page-scoping` - always, before touching Figma.
- `design-system-author` - always, before drawing or validating screens.
- `figma-canvas-layout` - always, before handoff.
- `figma-requirements-extraction` - only for `extract` mode.
- `figma-srs-mapping` - only for `map` mode.

## Inputs

- `docs/SRS.md` at `Status: Signed-off`, including:
  - `Design-Flow`
  - `Designated Design Approver`
  - `## Design References`
  - UI Introspection Profile
  - brand / design guideline headers
- `docs/user-stories/<US-ID>.md` and `docs/frs/<FR-ID>.md` for the surfaces in scope.
- Task ID and task file when the design is task-scoped.
- Existing `docs/uiux/handoffs/<task-id>.md` for `revise` / `incorporate`.
- `docs/uiux/completeness-reports/<task-id>.md` for `revise`.
- Figma MCP access; write access only for `create` and `revise`.

## Outputs

1. Figma updates for `create` / `revise` only.
2. Updated `docs/SRS.md` `## Design References` rows for Node IDs, Figma URL, page-scope fields, and design sub-status.
3. `docs/uiux/handoffs/<task-id>.md`.
4. `docs/uiux/refs/<task-id>.md` and reference snapshots when needed for QA.
5. Open issues for missing states, stale designs, unsupported variants, or SRS/design conflicts.
6. Worktree `plan-update.json` with `track: "uiux"`.

## Common Procedure

1. Run `ui-ux-page-scoping` and record the resolved page root.
2. Run or verify `design-system-author` Foundation before screen work. The Foundation source comes from SRS `Design-Guideline:`: preset slug, `from-figma`, or `none`. Screens must consume Foundation tokens/components rather than hardcoded one-off styling.
3. Read the relevant US/FR files. Build the required surface/state/platform matrix from SRS §3.4.1, user-story Main Flow, Business Rules, Post-conditions, and FR Error Handling.
4. Perform the mode-specific procedure below.
5. Run `figma-canvas-layout` lint on the scoped page and fix blocking layout issues when the mode permits Figma writes. Do not mark handoff ready when `create` / `revise` / `incorporate` leaves overlapping top-level screen frames.
6. Produce the handoff with enough detail for BA completeness, QA visual-spec authoring, and FE Dev implementation. This includes the required `## Design Element Manifest` described below.
7. Update only the SRS fields owned by UI/UX Designer: Design References Node IDs, Figma URL/page metadata, Visual-Critical, and design sub-status.
8. Commit changes and emit `plan-update.json`.

## Mode: create

Use only when SRS `Design-Flow` is `B` or `C`, or when Design-Flow A has an explicit human-approved missing-surface gap.

1. Create frames for each in-scope surface inside the scoped Figma page.
2. Include every required platform variant, state, error path, empty/loading/success state, and accessibility annotation the SRS names.
3. Use Foundation components and tokens. Create missing Foundation primitives before composing screens.
4. Build the Design Element Manifest from the authored frames before handoff.
5. Pin resulting Node IDs back to SRS §3.4.1.
6. Write handoff rows with `Source: created`.

## Mode: import

Use when SRS already pins Node IDs or the dispatch carries an existing Figma URL.

1. Read pinned frames in scoped-page read-only mode.
2. Capture structure, Auto Layout, components, variants, states, tokens, exact copy, fields/items, and Figma metadata.
3. If a supplied URL covers an SRS row with an empty Node ID, write the Node ID back to that row.
4. Compare imported content to required SRS surfaces/states/platforms.
5. Build the Design Element Manifest from the imported frames.
6. Write `Source: imported` handoff rows and a gap list.
7. Mark `Design-may-be-stale: yes` when Figma last-modified predates SRS `Last-Updated` by more than 30 days.

## Mode: revise

Use when BA returned a design completeness report with `unqualified`.

1. Read `docs/uiux/completeness-reports/<task-id>.md`.
2. Address every flagged item in the existing Figma file.
3. Preserve existing Node IDs when possible. If IDs change, update SRS §3.4.1 and call out the change in the handoff.
4. Regenerate the Design Element Manifest from the revised Figma frames.
5. Regenerate the handoff and refs.
6. Leave unresolved items as open issues; do not mark design-ready while blocking gaps remain.

## Mode: incorporate

Use when a human approver/designer edited Figma directly after handoff.

1. Treat current Figma as authoritative.
2. Read the new version and compare it to the previous handoff.
3. Regenerate the Design Element Manifest from the new version.
4. Regenerate handoff and refs without undoing human edits.
5. Add `## Human Edit Reconciliation Notes` for every changed node/property, including added/removed manifest entries.
6. If human edits conflict with SRS requirements, do not silently fix them. Raise open issues for BA and the human approver.

## Design Element Manifest

Every handoff MUST include `## Design Element Manifest`. This is the implementation-level inventory FE Dev must reproduce. It prevents a design from being reduced to "rough layout + tokens" while silently dropping fields, columns, chips, actions, or copy.

Build the manifest by walking every pinned frame's Figma node tree. Include every visible element that is user-observable or implementation-bearing:

- Form fields: label, placeholder, default value, helper text, validation/error text, required marker, disabled/read-only state.
- Data display fields: table columns, list-item fields, card metadata, profile/detail rows, key-value pairs, badges, status labels, counters.
- Navigational items: tabs, menu items, nav items, breadcrumbs, filter chips, segmented controls, pagination controls.
- Actions: buttons, links, icon buttons with semantic purpose, destructive/confirm/cancel actions.
- Feedback and state content: modal/dialog copy, toast/snackbar copy, empty/loading/error/success state headings/body/actions.
- Static copy: headings, descriptions, legal/help text, inline hints, labels, localized strings visible in the frame.
- Media/semantic icons: image/avatar/thumbnail slots, icon roles when they carry meaning.

Exclude purely decorative layers only when they are explicitly marked as decorative in the manifest. A visible Figma node that is omitted from both the manifest and decorative exclusions is a handoff defect.

Use this table shape:

```markdown
## Design Element Manifest

| Manifest ID | Frame / State | Figma Node ID | Role | Visible text / value | Implementation requirement | Test/accessibility hook | Notes |
|---|---|---|---|---|---|---|---|
| DEM-001 | Checkout / Payment / Default | 125:44 | input.field | Label: "Card number"; Placeholder: "1234 1234 1234 1234" | Render card-number field with exact label, placeholder, required marker, and validation target | `checkout-card-number` | Static field |
| DEM-002 | Orders / List / Default | 128:9 | table.column | "Status" | Render Status column in each order row; dynamic value from API | `orders-col-status` | Data-bound |
| DEM-003 | Orders / List / Default | 128:10 | filter.option | "Archived" | Render filter option exactly once in status filter | `orders-filter-archived` | Static option |

### Decorative / non-functional exclusions

| Frame / State | Figma Node ID | Reason |
|---|---|---|
| Orders / List / Default | 128:55 | Background texture only; no semantic meaning |
```

Rules:

- `Manifest ID` values are stable within the handoff (`DEM-001`, `DEM-002`, ...). Preserve IDs when revising unchanged elements.
- `Role` uses explicit categories such as `input.field`, `input.error`, `table.column`, `list.item-field`, `card.field`, `button.action`, `nav.item`, `tab.item`, `chip.option`, `modal.copy`, `toast.copy`, `state.empty-copy`, `image.slot`, `icon.semantic`, `text.static`.
- For dynamic data, record the required field/slot/column and mark the value as data-bound. Do not require FE Dev to hardcode sample row content unless the design labels it as static copy.
- For repeated lists/tables/cards, record the row/card template fields once and include visible sample rows only when sample content itself is a product requirement.
- Keep exact capitalization, punctuation, and ordering from Figma for static labels/options/copy.
- If the Figma design has fields/items that conflict with SRS, keep them in the manifest and add a gap/reconciliation note. Do not hide them by omission.

## Handoff Content

`docs/uiux/handoffs/<task-id>.md` must include:

- Source: `created` or `imported`.
- Mode: `create` | `import` | `revise` | `incorporate`.
- Figma file URL, version, last-modified, page Node ID, and page name.
- Design-may-be-stale flag.
- Design guideline source: preset slug, `from-figma`, `none`, or `N/A`; cite extraction artifact path when `from-figma`.
- Surface table: SRS requirement ID, surface name, platform, Figma node ID, source, design status.
- Component inventory per surface.
- Design Element Manifest with required fields/items/copy/actions and decorative exclusions.
- Required states and variants per component.
- Token usage: colors, typography, spacing, radius, elevation, motion.
- Accessibility notes and test IDs when present.
- Gap list and reconciliation notes.

## Hard Rules

- Only `create` and `revise` may write to Figma.
- `import` and `incorporate` are read-only against Figma.
- Never create screens unless Design-Flow allows it or a human explicitly approved a gap surface.
- Never write requirements or change SRS body content.
- Never hand off screens that skip required SRS states without a visible gap.
- Never hand off a UI task without `## Design Element Manifest`. Component inventory alone is insufficient.
- Never bypass Foundation tokens/components for screen work.
- Never hand off overlapping top-level screen frames in `create` / `revise` / `incorporate`; route to `NEEDS_CONTEXT` when the current mode cannot write the cleanup.
- Commit before signaling done.

## References

- `.claude/skills/ui-ux-page-scoping/`
- `.claude/skills/design-system-author/`
- `.claude/skills/figma-canvas-layout/`
- `.claude/agents/_templates/_artifacts/srs-template.md`
