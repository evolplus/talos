---
name: figma-design-handoff
description: UI/UX Designer post-sign-off design workflow for `create`, `import`, `revise`, and `incorporate` modes. Produces or refreshes Figma-backed handoff artifacts, SRS Design References Node IDs, and plan updates while respecting Design-Flow A/B/C, Foundation tokens/components, page scoping, canvas lint, and human-edited Figma reconciliation. FE Dev owns `docs/uiux/refs/<task-id>.md`.
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
4. Required checksummed full-frame reference renders under `docs/uiux/handoffs/<task-id>/references/` for every surface/state/platform.
5. Open issues for missing states, stale designs, unsupported variants, or SRS/design conflicts.
6. Worktree `plan-update.json` with `track: "uiux"`.

## Common Procedure

1. Run `ui-ux-page-scoping` and record the resolved page root.
2. Run or verify `design-system-author` Foundation before screen work. The Foundation source comes from SRS `Design-Guideline:`: preset slug, `from-figma`, or `none`. Screens must consume Foundation tokens/components rather than hardcoded one-off styling. For any Figma-backed dispatch, extract or refresh design-token evidence from the Figma link first, regardless of whether the file contains a named design guideline.
3. Read the relevant US/FR files. Build the required surface/state/platform matrix from SRS §3.4.1, user-story Main Flow, Business Rules, Post-conditions, and FR Error Handling.
4. Perform the mode-specific procedure below.
5. Run `figma-canvas-layout` lint on the scoped page and fix blocking layout issues when the mode permits Figma writes. Do not mark handoff ready when `create` / `revise` / `incorporate` leaves overlapping top-level screen frames.
6. Produce the handoff with enough detail for BA completeness, QA visual-spec authoring, and FE Dev implementation. This includes the required `## Reference Render`, `## Visual Composition Contract`, `## Asset Export Manifest`, and `## Design Element Manifest` described below.
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
2. Capture structure, Auto Layout, components, variants, states, tokens, exact copy, fields/items, Figma metadata, exact frame geometry, direct-child z-order, masks/clipping, and all visible raster/vector/image-fill assets.
3. Verify frame identity against the pre-sign-off mapping's Node ID, scoped-page ancestry, surface signature, and snapshot. A same-named frame is not interchangeable. Missing mapping evidence, duplicate candidates, or snapshot/node mismatch is a blocking `wrong-frame-risk` gap.
4. If a supplied URL covers an SRS row with an empty Node ID, write the Node ID back to that row.
5. Compare imported content to required SRS surfaces/states/platforms.
6. Build the reference render, visual composition contract, asset export manifest, and Design Element Manifest from the imported frames.
7. Write `Source: imported` handoff rows and a gap list.
8. Mark `Design-may-be-stale: yes` when Figma last-modified predates SRS `Last-Updated` by more than 30 days.

## Mode: revise

Use when BA returned a design completeness report with `unqualified`.

1. Read `docs/uiux/completeness-reports/<task-id>.md`.
2. Address every flagged item in the existing Figma file.
3. Preserve existing Node IDs when possible. If IDs change, update SRS §3.4.1 and call out the change in the handoff.
4. Regenerate the Design Element Manifest from the revised Figma frames.
5. Regenerate the handoff.
6. Leave unresolved items as open issues; do not mark design-ready while blocking gaps remain.

## Mode: incorporate

Use when a human approver/designer edited Figma directly after handoff.

1. Treat current Figma as authoritative.
2. Read the new version and compare it to the previous handoff.
3. Regenerate the Design Element Manifest from the new version.
4. Regenerate handoff without undoing human edits.
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

Decorative status affects accessibility semantics only; it does not permit visual omission. A visible decorative logo, texture, graphic, or background belongs in the Asset Export Manifest and Visual Composition Contract. Only non-rendered design annotations, measurements, prototype wires, and hidden layers may be excluded from implementation.

Use this table shape:

```markdown
## Design Element Manifest

| Manifest ID | Frame / State | Figma Node ID | Role | Visible text / value | Implementation requirement | Test/accessibility hook | Notes |
|---|---|---|---|---|---|---|---|
| DEM-001 | Checkout / Payment / Default | 125:44 | input.field | Label: "Card number"; Placeholder: "1234 1234 1234 1234" | Render card-number field with exact label, placeholder, required marker, and validation target | `checkout-card-number` | Static field |
| DEM-002 | Orders / List / Default | 128:9 | table.column | "Status" | Render Status column in each order row; dynamic value from API | `orders-col-status` | Data-bound |
| DEM-003 | Orders / List / Default | 128:10 | filter.option | "Archived" | Render filter option exactly once in status filter | `orders-filter-archived` | Static option |

### Non-rendered design-tool exclusions

| Frame / State | Figma Node ID | Reason |
|---|---|---|
| Orders / List / Default | 128:55 | Redline annotation; not part of rendered frame |
```

Rules:

- `Manifest ID` values are stable within the handoff (`DEM-001`, `DEM-002`, ...). Preserve IDs when revising unchanged elements.
- `Role` uses explicit categories such as `input.field`, `input.error`, `table.column`, `list.item-field`, `card.field`, `button.action`, `nav.item`, `tab.item`, `chip.option`, `modal.copy`, `toast.copy`, `state.empty-copy`, `image.slot`, `icon.semantic`, `text.static`.
- For dynamic data, record the required field/slot/column and mark the value as data-bound. Do not require FE Dev to hardcode sample row content unless the design labels it as static copy.
- For repeated lists/tables/cards, record the row/card template fields once and include visible sample rows only when sample content itself is a product requirement.
- Keep exact capitalization, punctuation, and ordering from Figma for static labels/options/copy.
- If the Figma design has fields/items that conflict with SRS, keep them in the manifest and add a gap/reconciliation note. Do not hide them by omission.

## Reference Render

Export a full-frame reference image for every surface/state/platform at the exact Figma frame dimensions. Store it under `docs/uiux/handoffs/<task-id>/references/<surface>-<state>-<platform>.png` and record the Figma Node ID, file version, dimensions, and SHA-256. The render is the human/visual comparison baseline; it never replaces node/property extraction.

## Visual Composition Contract

Record enough geometry to reproduce the selected frame rather than a generic arrangement of its components:

| Composition ID | Frame / State | Figma Node ID | Viewport | Root layout | Layer order (back → front) | Key bounds / constraints | Overflow / masks | Responsive rule |
|---|---|---|---|---|---|---|---|---|
| CMP-001 | Login / Default | 120:1 | 1440×900 | fixed split composition | background → scrim → form panel → logo | panel x=840 y=120 w=480 h=660; logo x=48 y=40 | frame clips; image masked | preserve 60/40 split ≥1024; mobile variant node 121:1 |

Rules:

- Use coordinates relative to the owning frame, not canvas coordinates.
- Capture direct-child bounds, Auto Layout direction/alignment/gap/padding, absolute-positioned children, constraints, min/max/fixed/hug/fill sizing, z-order, clipping, masks, opacity/blend, and image crop/focal behavior.
- For responsive designs, cite a distinct Figma variant or explicit constraints. Do not invent a mobile/desktop rearrangement from general best practice.
- A complete component list with missing composition data is an incomplete handoff.
- `Composition ID` values are stable within the handoff; preserve them across revisions when the composition is unchanged.

  **ID grammar (applies to `CMP-`, `AST-` and `DEM-` alike).** `<PREFIX>-<NNN>` or
  `<PREFIX>-<QUALIFIER>-<NNN>`, where qualifier segments are alphanumeric and up to four may be chained:
  `CMP-001`, `CMP-GW-001`, `AST-ICON-12`, `DEM-A1-B2-07`. Use a qualifier when IDs need to be unique or meaningful
  across flows or surfaces (e.g. `GW` for a grace-window flow). `<PREFIX>-NONE` asserts that the artifact genuinely
  has **no** regions of that kind — it is a statement about the design, never a way to satisfy a check.

  Downstream guards match this grammar via `hooks/lib/artifact-ids.cjs`. If a guard rejects IDs that follow it,
  the guard is wrong: raise an open issue against that lib rather than renaming IDs an Approver has confirmed.

## Asset Export Manifest

Inventory every visible asset-bearing layer, including decorative artwork:

| Asset ID | Frame / State | Figma Node ID | Class | Source | Rendered bounds | Fit/crop/mask/z | Export format/scales | Target code path | Semantics | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| AST-001 | Login / Default | 120:4 | background-image | image fill | 1440×900 | cover; focal 32% 50%; clipped; back | WebP 1x/2x | `frontend/.../assets/login-bg.webp` | decorative/empty alt | exportable |
| AST-002 | Login / Default | 120:18 | logo | vector instance | 156×40 | contain; front | SVG | `frontend/.../assets/logo.svg` | product logo | exportable |

Rules:

- Include logos, brand marks, semantic and decorative icons, photos, avatars, illustrations, textures, gradients that depend on image data, video posters, and background image fills.
- Record library/component provenance. If the source is inaccessible or export is unsupported, set `Status: blocked` and keep the handoff unready.
- Do not authorize placeholder substitution. Text initials, emoji, generic icon-library glyphs, CSS approximations, stock imagery, or invented gradients are not equivalent to a Figma asset.
- Generated primitive geometry may be implemented in code only when the manifest says `Source: generated shape` and lists the exact path/fill/stroke/effect properties.

## Handoff Content

`docs/uiux/handoffs/<task-id>.md` must include:

- Source: `created` or `imported`.
- Mode: `create` | `import` | `revise` | `incorporate`.
- Figma file URL, version, last-modified, page Node ID, and page name.
- Design-may-be-stale flag.
- Design guideline source: preset slug, `from-figma`, `none`, or `N/A`; cite extraction artifact path for every Figma-backed handoff, not only when `from-figma`.
- Design system source: token evidence from the Figma link, including which values are formal styles/variables, inferred repeated values, preset/default fallbacks, and deviations.
- Surface table: SRS requirement ID, surface name, platform, Figma node ID, source, design status.
- Component inventory per surface.
- Design Element Manifest with required fields/items/copy/actions and non-rendered design-tool exclusions.
- Reference Render with one checksummed full-frame image per required state/platform.
- Visual Composition Contract with frame-relative geometry, layout behavior, and z-order.
- Asset Export Manifest with every visible logo/graphic/image fill/background and an export/implementation target.
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
- Never hand off a UI task without non-empty `## Reference Render`, `## Visual Composition Contract`, and `## Asset Export Manifest` sections. Use an explicit `AST-NONE | none — verified no asset-bearing visible nodes` row when a frame truly has no visual assets.
- Never mark a handoff ready when frame identity is ambiguous or when a reference render does not correspond to the pinned Node ID and Figma version.
- Never classify a rendered background, logo, graphic, texture, or illustration as an implementation exclusion merely because it is decorative.
- Never hand off a Figma-backed UI task without token evidence from the Figma link. A missing Figma design guideline means "infer repeated values with confidence," not "skip token extraction."
- Never bypass Foundation tokens/components for screen work.
- Never hand off overlapping top-level screen frames in `create` / `revise` / `incorporate`; route to `NEEDS_CONTEXT` when the current mode cannot write the cleanup.
- Commit before signaling ready-to-finalize.

## References

- `.claude/skills/ui-ux-page-scoping/`
- `.claude/skills/design-system-author/`
- `.claude/skills/figma-canvas-layout/`
- `.claude/agents/_templates/_artifacts/srs-template.md`
