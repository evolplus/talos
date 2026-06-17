# Golang with Echo Coding Standard

Read this when the backend service uses Go with Echo.

## Project shape

- Keep Echo handlers thin: bind/validate, auth context, service call, response.
- Preserve existing route groups, middleware, validators, binders, and package layout.
- Keep application/domain services independent from `echo.Context`.

## Requests and errors

- Use typed DTOs and the project's validation conventions.
- Map errors through the centralized HTTP error handler to match FR error envelopes.
- Handle path/query/body parsing explicitly enough for contract tests to verify.

## Runtime concerns

- Keep middleware order consistent: recover, request ID, logging, CORS/body limits, auth, metrics, routes.
- Preserve graceful shutdown, deadlines, and downstream timeout policies.

## Tests and checks

- Use Echo + `httptest` for handler tests.
- Unit-test services without Echo.
- Run `gofmt`, `go test ./...`, vet/staticcheck if configured, and targeted integration tests.

## Red flags

- Leaking `echo.Context` into repositories/services.
- Duplicate route registration across groups.
- Ignoring binder/validator errors or returning inconsistent status codes.
