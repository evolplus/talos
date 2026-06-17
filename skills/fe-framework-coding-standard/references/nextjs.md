# Next.js Coding Standard

Read this when the task surface is a Next.js app.

## Project shape

- Follow the existing router: App Router (`app/`) or Pages Router (`pages/`). Do not mix routing models for a feature unless the project already does.
- In App Router, prefer Server Components for data-fetching and non-interactive rendering. Add `"use client"` only at the smallest interactive boundary.
- Keep route segments, layouts, loading states, error boundaries, and metadata aligned with the existing tree.
- In Pages Router, follow the project's current data pattern: static generation, server-side props, client fetching, or API routes.

## Client/server boundary

- Do not pass secrets, privileged data, server-only modules, or database clients into client components.
- Keep client components focused on browser-only behavior: forms, local interaction state, effects, event handlers, and imperative browser APIs.
- Keep shared UI components server-compatible unless they truly need client interactivity.
- Use dynamic imports only for real bundle/performance reasons, not as a workaround for boundary confusion.

## Data and caching

- Use the existing API/client layer and Next.js data conventions. Respect project decisions around caching, revalidation, server actions, route handlers, and client caches.
- Make loading, empty, not-found, unauthorized, and error states explicit at route or component level.
- Use `notFound`, redirects, and error boundaries through project conventions, not ad-hoc thrown strings.
- Keep mutations protected by validation, authorization checks, CSRF/session strategy where applicable, and user-visible error handling.

## UI, styling, and assets

- Use the established styling system: CSS modules, Tailwind, styled components, vanilla-extract, design tokens, or component library.
- Use `next/image`, font loading, metadata, and link/navigation primitives where the project already does.
- Keep responsive layout and hydration-safe markup explicit. Avoid rendering browser-dependent values on the server without guards.
- Implement focus, keyboard, disabled, loading, optimistic, rollback, and validation states for changed interactions.

## Accessibility and instrumentation

- Use semantic HTML and accessible names. Client interactivity must remain keyboard reachable after hydration.
- Add `data-testid` only from the instrumentation contract. Prefer role/name selectors in Playwright when stable.
- Ensure server-rendered and hydrated markup do not diverge in user-visible ways.

## Tests and checks

- Update unit/component tests for shared UI and client components.
- Update route tests, server action/route handler tests, or integration tests when data behavior changes.
- Update Playwright specs for critical flows.
- Run format, lint, typecheck, build, and relevant tests. A Next.js build is important when changing routing, metadata, server/client boundaries, or dynamic imports.

## Red flags

- Blanket `"use client"` at page/layout level without a specific interaction need.
- Importing server-only modules into client components.
- Hydration warnings ignored as harmless.
- Cache/revalidation changes without visible product intent or architecture support.
