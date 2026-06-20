---
name: visual-spec-author
description: QA-Author procedure for generating docs/uiux/visual-specs/<task-id>.md from confirmed UI/UX handoff and Figma nodes. Use in QA-Author by-task mode for UI tasks before structural test cases, including Design Element Manifest assertions for every visible field/item/copy/action, introspection-aware property assertions, degraded mode, tolerances, coverage map, and staleness checks.
agents: [qa-author]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# Visual Spec Author

## Use

Use this skill in QA-Author `by-task` mode for UI tasks before authoring `structural.md`.

## Inputs

- `docs/uiux/handoffs/<task-id>.md`
- SRS §3.4.1 Design References and §3.4.2 UI Introspection Profile
- `docs/instrumentation-contract.md`
- Figma read access
- Linked US/FR files and task file

## Procedure

1. Confirm task design sub-status is `design-confirmed`.
2. Confirm handoff Figma version matches the task's confirmed version.
3. Read handoff surface/component inventory, `## Design Element Manifest`, decorative exclusions, and pinned Figma node IDs. If the handoff lacks the manifest for a UI task, halt with `NEEDS_CONTEXT` and request UI/UX Designer regenerate the handoff.
4. Fetch Figma nodes read-only:
   - component tree;
   - visible text nodes and semantic item order;
   - auto-layout properties;
   - fills/strokes/effects;
   - typography;
   - variants/states.
5. Reconcile the manifest against live Figma:
   - every manifest row must map to an existing Figma node or repeated template;
   - every visible user-observable Figma text/field/item/action must be in the manifest or in decorative exclusions;
   - exact static labels, options, placeholders, helper/error text, table/list/card field names, button text, tab/menu/chip labels, modal/toast copy, and state copy must match Figma.
6. Resolve concrete values to design tokens. Hardcoded values without token mapping become open issues, not silent spec entries.
7. Read instrumentation contract and attach expected test IDs/accessibility IDs to component entries and manifest rows.
8. Produce `docs/uiux/visual-specs/<task-id>.md` with:
   - status, source handoff hash, Figma file/version;
   - component/screen entries;
   - `## Design Element Assertions` copied from the manifest with expected role, text/value, order, required implementation, selector/accessibility hook, and verification method;
   - per-property assertions;
   - required states;
   - coverage map from US/FR/task to components and future TC IDs.
9. For `None` introspection surfaces, generate degraded spec with pixel/OCR/verifiable properties, but still include manifest assertions for static visible text and required field/item presence. List properties not verifiable.
10. Use tolerances unless overridden by project docs:
   - bounds/spacing ±2px;
   - token colors exact, hardcoded color ΔE < 2;
   - typography size exact;
   - corner radius ±1px.

## Design Element Assertions

The visual spec must convert each manifest row into an assertion FE Dev and QA-Exec can verify:

```markdown
## Design Element Assertions

| Manifest ID | Frame / State | Role | Expected visible text / value | Required implementation | Verification method | Selector / a11y hook | Status |
|---|---|---|---|---|---|---|---|
| DEM-001 | Checkout / Payment / Default | input.field | Label: "Card number"; Placeholder: "1234 1234 1234 1234" | Field present with exact label + placeholder | DOM/text query + selector | `checkout-card-number` | required |
| DEM-002 | Orders / List / Default | table.column | "Status" | Status column present in table header and row template | DOM/text query + row-shape check | `orders-col-status` | required |
```

Rules:

- Static copy is exact by default: capitalization, punctuation, and ordering match Figma unless SRS/i18n explicitly overrides it.
- Dynamic data rows assert shape, field presence, and label/column/header text; sample data values are not hardcoded unless the manifest marks them static.
- Repeated groups assert the template fields/items once plus any fixed options/actions.
- Decorative exclusions never become assertions.

## Hard Rules

- Do not mutate Figma.
- Do not accept stale handoffs.
- Do not accept a handoff that lacks `## Design Element Manifest` for a UI task.
- Do not invent tokens, selectors, or states.
- Do not collapse multiple Figma fields/items into a generic "component present" assertion. Every manifest row gets an assertion or an explicit gap.
- Do not treat degraded mode as failure by itself; report unverifiable properties clearly.
- Commit before signaling done as part of QA-Author dispatch.
