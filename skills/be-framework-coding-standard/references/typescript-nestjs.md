# TypeScript with NestJS Coding Standard

Read this when the backend service uses TypeScript with NestJS.

## Project shape

- Follow the existing module boundary. Controllers expose transport, providers own application/domain logic, repositories/adapters own IO.
- Use Nest dependency injection instead of manually constructing dependencies in controllers or providers.
- Keep DTOs, validation pipes, guards, interceptors, filters, and modules aligned with the current project conventions.

## Controllers and providers

- Controllers stay thin: route decorators, auth/role guards, pipes, response mapping.
- Providers must not depend on HTTP request objects unless explicitly request-scoped by design.
- Use transaction/unit-of-work patterns already present in the project; do not hide DB writes in unrelated providers.

## Errors and contracts

- Map exceptions through project filters so API responses match SRS/FR error envelopes.
- Keep OpenAPI decorators or generated schemas current when the project uses them.
- For microservice transports, preserve message pattern names, payload compatibility, and retry/idempotency behavior.

## Tests and checks

- Unit-test providers with mocked dependencies.
- Use Nest testing modules for guards/controllers/interceptors when transport behavior changes.
- Run lint, typecheck, unit tests, and targeted e2e/integration tests.

## Red flags

- Injecting concrete infrastructure classes where the module uses interfaces/tokens.
- Adding global pipes/filters/interceptors for a local feature need.
- Circular module imports solved with `forwardRef` without design justification.
