# Vue.js Coding Standard

Read this when the task surface is a Vue.js app. If the project uses Nuxt, also respect the Nuxt project conventions; do not treat plain Vue guidance as permission to bypass Nuxt routing/data rules.

## Project shape

- Follow the existing single-file component layout, router, store, composables, and build tool.
- Prefer Composition API when the project uses it; keep Options API where the surrounding code is Options API.
- Keep pages/views responsible for route params, data orchestration, permissions, and layout composition.
- Keep components focused on rendering and emitted events. Shared components should be domain-neutral.

## Components and composables

- Use typed `props` and `emits` when TypeScript is present.
- Use computed values for derived state. Use watchers only for side effects or synchronization with external systems.
- Keep composables single-purpose and side-effect-aware. Return state, actions, and cleanup behavior clearly.
- Avoid mutating props. Emit events or update a store through established actions.

## State and data

- Use the existing store approach: Pinia, Vuex, local composables, or framework data loaders.
- Keep server data in the server-state/store layer when one exists. Do not copy API objects into component-local state unless editing a draft form.
- Normalize API errors into user-facing messages through the existing error utility.
- Keep route query state for shareable filters, sorting, search, and pagination when the project does that elsewhere.

## Templates and styling

- Keep templates readable. Move complex conditions into computed properties with clear names.
- Use scoped styles, CSS modules, Tailwind, or the project's established style system. Do not introduce a second styling strategy locally.
- Use design tokens and shared components before adding local colors, spacing, or typography.
- Implement focus, hover, active, disabled, loading, empty, and error states.

## Accessibility and instrumentation

- Use semantic HTML and native controls before custom ARIA.
- Preserve keyboard behavior and focus-visible states for interactive components.
- Add `data-testid` only from the instrumentation contract. Prefer role/name selectors in tests when stable.
- Keep labels connected to form controls and validation errors announced through the existing pattern.

## Tests and checks

- Update Vue Test Utils / Testing Library tests for component behavior and emitted events.
- Update E2E specs for critical route or flow changes.
- Run format, lint, typecheck if configured, unit/component tests, and build.

## Red flags

- Watchers used to mirror derived state.
- Direct store mutation when the project requires actions.
- Business rules hidden in template expressions.
- New global plugins or directives for one feature.
