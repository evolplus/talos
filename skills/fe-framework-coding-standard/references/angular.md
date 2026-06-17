# Angular Coding Standard

Read this when the task surface is an Angular app.

## Project shape

- Follow the existing Angular style: standalone components or NgModules, project libraries, feature folders, route lazy loading, and shared module/component conventions.
- Keep components focused on presentation and UI orchestration. Put reusable business/data behavior in injectable services or state facades.
- Use strict TypeScript and Angular template type checking where configured. Avoid `any` and unsafe non-null assertions.
- Keep public component APIs clear through typed `@Input` / `@Output` or signal-based equivalents when the project already uses them.

## Components and change flow

- Follow the project's change detection strategy. Prefer predictable inputs, immutable updates, async pipes, and explicit event outputs.
- Keep subscriptions out of components when the template can use `async`. When manual subscriptions are necessary, tie cleanup to the project pattern.
- Use reactive forms for complex forms and validation unless the surrounding feature uses template-driven forms.
- Keep form validation split into field-level messages, form-level messages, and submit-level API errors.

## Services, routing, and data

- Use Angular DI and existing API services/interceptors. Do not call raw HTTP clients from random components if a service layer exists.
- Keep route params, guards, resolvers, and lazy-loading behavior aligned with existing routes.
- Use RxJS deliberately. Prefer named streams and typed operators; avoid nested subscriptions and hidden side effects in `tap`.
- Keep server errors normalized through shared interceptors or error utilities.

## Styling and design system

- Use the established component library, design tokens, Angular Material configuration, Tailwind setup, SCSS variables, or theme layer.
- Keep component styles encapsulated unless a global style is already the standard for that concern.
- Implement focus, disabled, loading, empty, validation, and error states with accessible markup.
- Avoid deeply coupled selectors that break when a child component changes internals.

## Accessibility and instrumentation

- Use semantic HTML, labels, form associations, ARIA only when needed, and visible focus states.
- Add `data-testid` only from the instrumentation contract or the project's configured selector attribute.
- Preserve keyboard interaction for menus, dialogs, tabs, dropdowns, and custom controls.

## Tests and checks

- Update component tests for inputs, outputs, rendering, validation, and service interactions.
- Update service/facade tests for data transformations and error paths.
- Update E2E specs for critical flows.
- Run format, lint, `ng test` or configured unit tests, typecheck/build, and affected library checks where applicable.

## Red flags

- Nested subscriptions in components.
- Business logic duplicated in template expressions.
- Bypassing Angular DI or interceptors for HTTP.
- Adding a shared module/service that is feature-specific in disguise.
