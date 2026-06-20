---
name: fe-framework-coding-standard
description: Standardized frontend implementation guidance for FE Dev using the SRS-declared Frontend-Framework. Use when coding, refactoring, or reviewing UI work in React Native, ReactJS, Flutter, Vue.js, Angular, or Next.js; FE Dev reads docs/SRS.md Frontend-Framework plus §3.4.2/§3.4.5 for multi-app projects, then selects the matching reference so file placement, state flow, styling, accessibility, instrumentation, and tests match the chosen stack.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# FE Framework Coding Standard

## When to use

You are FE Dev implementing or reviewing UI code after the stack is declared in the signed-off SRS. This skill standardizes how to write framework-specific code without turning every task into a framework migration.

## Inputs and outputs

- **Inputs:** task assignment, `docs/SRS.md` header `Frontend-Framework:`, SRS §3.4.2 UI Introspection Profile, SRS §3.4.5 Source Layout, SRS user story / FR / NFR IDs, design handoff, Design Element Manifest, visual spec assertions, instrumentation contract, architecture decisions, current frontend source tree, installed framework versions and libraries.
- **Outputs:** framework-native UI code that follows the project's existing architecture, names stable test selectors, implements every required Figma field/item/copy/action from the Design Element Manifest, handles loading / error / empty states, satisfies design tokens where available, and includes the appropriate unit / component / E2E updates.

## Framework selection

1. Read `docs/SRS.md` before inspecting package files. The header `Frontend-Framework:` is authoritative.
2. If the header is one supported value, select that framework reference.
3. If the header is `multiple`, select the framework from the row that owns the task:
   - use SRS §3.4.2 for a surface-driven task;
   - use SRS §3.4.5 for a path/app-driven task;
   - if the task maps to more than one framework or no row matches, halt with `NEEDS_CONTEXT` and cite the candidate SRS rows.
4. If the header is `N/A`, do not perform FE framework implementation; report that no frontend framework applies.
5. If the header is missing, `TBD`, unsupported, or inconsistent with §3.4.2 / §3.4.5, halt and return the work to BA:
   - greenfield/authored SRS: BA Phase 1.X step 10c must ask the user to choose;
   - brownfield/extracted SRS: BA Mode E must detect from source evidence and write the SRS field.
6. After selecting the reference, inspect package files/source only as a consistency check. If code evidence contradicts the SRS-selected framework, halt and raise an open issue; do not silently switch references.

Read the matching reference before editing:

| Framework | Reference |
|---|---|
| React Native | [`references/react-native.md`](./references/react-native.md) |
| ReactJS | [`references/reactjs.md`](./references/reactjs.md) |
| Flutter | [`references/flutter.md`](./references/flutter.md) |
| Vue.js | [`references/vuejs.md`](./references/vuejs.md) |
| Angular | [`references/angular.md`](./references/angular.md) |
| Next.js | [`references/nextjs.md`](./references/nextjs.md) |

## Universal implementation procedure

1. Inspect nearby code before writing. Follow the project's existing folder structure, naming, state library, API client, design token system, formatter, lint rules, and test runner.
2. Map every changed screen/component to the task's SRS IDs, design handoff, Design Element Manifest, and visual spec. If the design is missing a required state, implement the required product behavior and record the design gap in the handoff or open-issues flow.
3. Build the screen/component from the manifest, not from memory of the screenshot:
   - render every required form field, label, placeholder, helper/error target, required marker, and disabled/read-only variant;
   - render every fixed button/link/nav/tab/chip/menu option and preserve Figma order;
   - render every table/list/card field, column, slot, badge, status, and counter specified by the row/card template;
   - render modal/toast/empty/loading/error/success copy and actions exactly when static;
   - treat decorative exclusions as non-implementation unless they affect layout or accessibility.
4. Keep boundaries explicit:
   - screen/page/container owns route params, data loading, permissions, and orchestration;
   - presentational components own layout and interaction events;
   - services/hooks/composables/providers own reusable data access;
   - shared components must stay feature-agnostic.
5. Implement all user-observable states: initial, loading, success, empty, validation error, recoverable error, permission denied where applicable, disabled, and optimistic rollback if optimistic UI is used.
6. Add or update stable selectors from `docs/instrumentation-contract.md` and the Design Element Manifest. Do not invent selector strings when the contract is absent; file the required contract gap and use the project convention only after it is declared.
7. Preserve accessibility: semantic roles / labels, focus order, keyboard interaction for web, screen-reader labels for mobile, minimum touch targets, color contrast, and reduced-motion behavior when animations are present.
8. Keep data flow predictable. Prefer derived state over duplicated state. Avoid effects/listeners/subscriptions that can run repeatedly without cleanup.
9. Test at the right layer: unit tests for logic, component/widget tests for manifest row presence, and E2E tests for critical user flows. Update existing snapshots only when the visual change is intentional and reviewable.
10. Run the project's format, lint, typecheck/analyze, and relevant tests. If a command cannot run locally, document the blocker and the narrower checks you did run.

## Hard rules

- Do not introduce a new FE framework, router, state library, UI kit, CSS system, or test runner unless an ADR or architecture task explicitly approves it.
- Do not choose a framework from package files when `docs/SRS.md` declares a different `Frontend-Framework:`. Treat that as SRS/code drift and halt.
- Do not start FE implementation while `Frontend-Framework:` is missing, `TBD`, unsupported, or `multiple` without a matching §3.4.2 / §3.4.5 row.
- Do not rewrite established project structure to match a reference file. The reference guides decisions inside the existing architecture.
- Do not ship UI code without loading, error, empty, and accessibility states for the changed surface.
- Do not ship UI code that omits a Design Element Manifest row. If the implementation intentionally cannot render a row, raise an open issue and keep the task in-progress.
- Do not hardcode API URLs, secrets, tenant IDs, locale text that belongs in i18n, or selector IDs outside the instrumentation contract.
- Do not bypass type errors, lints, or analyzer failures with suppressions unless the suppression is tightly scoped and justified in code.

## References

- [`references/react-native.md`](./references/react-native.md) - React Native and Expo implementation standard.
- [`references/reactjs.md`](./references/reactjs.md) - ReactJS SPA/component implementation standard.
- [`references/flutter.md`](./references/flutter.md) - Flutter widget, state, theme, and test standard.
- [`references/vuejs.md`](./references/vuejs.md) - Vue SFC, Composition API, routing, and store standard.
- [`references/angular.md`](./references/angular.md) - Angular component, service, forms, RxJS, and module/standalone standard.
- [`references/nextjs.md`](./references/nextjs.md) - Next.js routing, rendering, data, and client/server boundary standard.
- [`../design-system-author/SKILL.md`](../design-system-author/SKILL.md) - design token and component source of truth.
- [`../ui-test-execution/SKILL.md`](../ui-test-execution/SKILL.md) - UI test selector, fixture, and reporting discipline.
