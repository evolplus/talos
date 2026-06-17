# Golang with Gin Coding Standard

Read this when the backend service uses Go with Gin.

## Project shape

- Keep Gin handlers thin: bind/validate, auth context extraction, service call, response mapping.
- Preserve existing route groups, middleware, versioning, and package layout.
- Pass request context into services and downstream calls.

## Requests and errors

- Use the project's binding/validation convention and typed DTO structs.
- Centralize error responses through existing middleware/helper functions; match the FR error envelope.
- Do not expose Gin context outside handler/transport code unless the project already made that boundary explicit.

## Runtime concerns

- Keep middleware order deliberate: recovery, correlation/logging, body limits, auth, authorization, metrics, routes.
- Preserve graceful shutdown, timeouts, and config loading.

## Tests and checks

- Use `httptest` with the Gin engine for route behavior.
- Unit-test services without Gin.
- Run `gofmt`, `go test ./...`, vet/staticcheck if configured, and targeted integration tests.

## Red flags

- Business logic in handlers.
- Storing request-specific data in package globals.
- Using `MustBind` behavior that emits framework-default errors inconsistent with the API contract.
