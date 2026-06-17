# ReactJS Coding Standard

Read this when the task surface is a client-rendered React app that is not owned by Next.js.

## Project shape

- Follow the existing app shell, router, state library, and build tool. A Vite, CRA, custom webpack, or microfrontend app should keep its current conventions.
- Keep route/page components responsible for URL params, data orchestration, permissions, and layout composition.
- Keep reusable components small, typed, and feature-agnostic. Push feature-specific rules into feature containers or hooks.
- Use TypeScript where present. Avoid `any`; prefer narrow component props, discriminated unions for UI state, and typed API responses.

## Components and hooks

- Make components pure by default. Derive display state from props and store data instead of copying it into local state.
- Use effects only for synchronization with external systems: network, subscriptions, timers, browser APIs, or imperative widgets. Clean them up.
- Keep custom hooks focused on one concern: data fetch, form behavior, viewport, permissions, or feature orchestration.
- Avoid prop drilling across multiple levels; use existing context/store patterns when state is truly shared.

## Routing and data

- Use the configured router and its loading/error conventions. Do not introduce a parallel route layer.
- Keep URL state in the URL for filters, tabs, search terms, and pagination when it is user-shareable.
- Use the existing API client and error normalization. Do not call `fetch` / `axios` directly from random components if the project has a service layer.
- Treat server data as cache-owned when the project uses a server-state library; avoid duplicating it into local state.

## Styling and design system

- Use existing tokens, CSS modules, Tailwind config, CSS-in-JS theme, or component library. Do not mix a new styling strategy into a local feature.
- Keep responsive behavior explicit at the component boundary. Test narrow, medium, and wide viewports for changed surfaces.
- Implement all interactive states: hover, focus-visible, active, disabled, loading, selected, and error.
- Use semantic HTML before ARIA. Add ARIA only when native semantics are insufficient.

## Accessibility and instrumentation

- Prefer buttons, anchors, inputs, labels, headings, lists, tables, and dialogs with native semantics.
- Maintain keyboard navigation and visible focus states for every interactive change.
- Add `data-testid` only from the instrumentation contract. Prefer role/name selectors in tests when stable and accessible.
- Keep text externalized through the existing i18n/copy system when the project has one.

## Tests and checks

- Update unit tests for logic and React Testing Library tests for behavior. Assert user-visible output, not implementation details.
- Update Playwright/Cypress specs when the changed surface is part of a critical flow.
- Run format, lint, typecheck, and relevant test commands. Include bundle or build checks when changing routing, lazy loading, or shared dependencies.

## Red flags

- Effects used to calculate derived state that could be computed during render.
- CSS selectors or DOM traversal tied to current markup instead of component contracts.
- Component libraries, state libraries, or routing libraries introduced for a single task.
