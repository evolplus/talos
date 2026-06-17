---
name: visual-spec-author
description: QA-Author procedure for generating docs/uiux/visual-specs/<task-id>.md from confirmed UI/UX handoff and Figma nodes. Use in QA-Author by-task mode for UI tasks before structural test cases, including introspection-aware property assertions, degraded mode, tolerances, coverage map, and staleness checks.
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
3. Read handoff surface/component inventory and pinned Figma node IDs.
4. Fetch Figma nodes read-only:
   - component tree;
   - auto-layout properties;
   - fills/strokes/effects;
   - typography;
   - variants/states.
5. Resolve concrete values to design tokens. Hardcoded values without token mapping become open issues, not silent spec entries.
6. Read instrumentation contract and attach expected test IDs/accessibility IDs to component entries.
7. Produce `docs/uiux/visual-specs/<task-id>.md` with:
   - status, source handoff hash, Figma file/version;
   - component/screen entries;
   - per-property assertions;
   - required states;
   - coverage map from US/FR/task to components and future TC IDs.
8. For `None` introspection surfaces, generate degraded spec: pixel/OCR/verifiable properties only, and list properties not verifiable.
9. Use tolerances unless overridden by project docs:
   - bounds/spacing ±2px;
   - token colors exact, hardcoded color ΔE < 2;
   - typography size exact;
   - corner radius ±1px.

## Hard Rules

- Do not mutate Figma.
- Do not accept stale handoffs.
- Do not invent tokens, selectors, or states.
- Do not treat degraded mode as failure by itself; report unverifiable properties clearly.
- Commit before signaling done as part of QA-Author dispatch.
