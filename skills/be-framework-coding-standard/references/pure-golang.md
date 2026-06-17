# Pure Golang Coding Standard

Read this when the backend service uses Go with the standard library rather than a web framework.

## Project shape

- Preserve existing package boundaries: `cmd`, `internal`, handlers, services/use cases, repositories/adapters, config.
- Keep `net/http` handlers thin and use explicit request decoding, validation, service calls, and response encoding.
- Pass `context.Context` through every call that can block, perform IO, or emit observability.

## APIs and services

- Use the project's router/mux pattern and middleware chain. Do not add a framework just for routing convenience.
- Use typed request/response structs and explicit JSON tags.
- Centralize error-to-status mapping so responses match the FR error envelope.

## Runtime concerns

- Respect cancellation, deadlines, timeouts, idempotency, and graceful shutdown.
- Keep config in the existing environment/config loader. Do not hardcode ports, URLs, or secrets.
- Use structured logs and metrics in the established shape.

## Tests and checks

- Use table-driven unit tests for services and domain logic.
- Use `httptest` for handler behavior.
- Run `gofmt`, `go test ./...`, vet/staticcheck if configured, and targeted integration tests.

## Red flags

- Ignoring returned errors.
- Dropping context propagation.
- Adding global mutable state for request-specific behavior.
