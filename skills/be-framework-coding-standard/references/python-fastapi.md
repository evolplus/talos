# Python with FastAPI Coding Standard

Read this when the backend service uses Python with FastAPI.

## Project shape

- Keep path operations thin: request parsing, dependency wiring, status/response mapping.
- Put use-case logic in services and persistence/external calls in repositories/adapters.
- Preserve the project's async/sync boundary. Do not call blocking IO from async endpoints unless the project already wraps it safely.

## Schemas and dependencies

- Use existing Pydantic model conventions for request/response DTOs. Keep response models explicit.
- Use FastAPI dependencies for auth context, sessions, tenant scope, and DB unit-of-work when the project does.
- Centralize settings through the existing config mechanism.

## Errors and observability

- Map validation and domain errors to the declared FR error envelope. Do not leak framework default details when the contract declares a different shape.
- Keep structured logging, correlation IDs, metrics, and tracing consistent with existing middleware.

## Tests and checks

- Use TestClient or async HTTP tests according to project convention.
- Unit-test services without FastAPI objects.
- Run formatting, lint/type checks when configured, unit tests, and targeted integration tests.

## Red flags

- Returning raw ORM models from endpoints.
- Mixing sync DB sessions into async handlers without the established pattern.
- Broad `except Exception` that hides domain failures and observability.
