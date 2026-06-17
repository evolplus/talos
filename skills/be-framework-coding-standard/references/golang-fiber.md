# Golang with Fiber Coding Standard

Read this when the backend service uses Go with Fiber.

## Project shape

- Keep Fiber handlers thin and framework-specific. Services/domain code must not depend on `*fiber.Ctx`.
- Preserve existing route groups, middleware, config, and lifecycle hooks.
- Be deliberate about Fiber's fasthttp differences from `net/http` when adding libraries.

## Requests and errors

- Parse and validate params/body/query using existing project helpers.
- Map errors through project-level error handlers so responses match FR contracts.
- Avoid retaining references to request data beyond the request lifetime unless copied safely.

## Runtime concerns

- Keep timeouts, body limits, CORS, auth, metrics, and recovery middleware consistent.
- Respect graceful shutdown and context/cancellation patterns used by the project.

## Tests and checks

- Use Fiber app tests for handler behavior.
- Unit-test services without Fiber.
- Run `gofmt`, `go test ./...`, vet/staticcheck if configured, and targeted integration tests.

## Red flags

- Passing `*fiber.Ctx` into application/domain layers.
- Assuming all `net/http` middleware/libraries are compatible with Fiber.
- Returning framework-default errors that violate the project envelope.
