# TypeScript with Express Coding Standard

Read this when the backend service uses TypeScript with Express.

## Project shape

- Keep Express thin: routes/middleware parse transport concerns; services own use cases; repositories/adapters own persistence and external calls.
- Preserve the existing module style, whether feature folders, route modules, or layered `routes/controllers/services/repositories`.
- Prefer explicit TypeScript types for request params, body, query, response DTOs, and service return values.

## Requests and errors

- Validate at the route boundary with the project's existing schema library. Never trust `req.body`, `req.query`, or `req.params` directly.
- Wrap async handlers through the existing async-error pattern; do not mix uncaught promises with ad-hoc `try/catch` everywhere.
- Map errors through the project error middleware and SRS/FR error envelope.

## Runtime concerns

- Keep middleware order deliberate: correlation ID, logging, security headers, body limits, auth, authorization, validation, route.
- Use centralized config for ports, timeouts, downstream URLs, feature flags, and secrets.
- Pass request context explicitly into services when logs/traces/audit require it.

## Tests and checks

- Use route tests with the project's HTTP test tool when changing status codes, headers, auth, validation, or error mapping.
- Unit-test services without Express request/response objects.
- For direct-DB E2E fixtures, register a test-only reset route only when the project test-endpoint flag is enabled.
  The handler should await an aggregate reset service that flushes caches and resets worker/poller state, return
  non-2xx on any failure, and have a route test proving it is absent when the flag is disabled. Add an integration
  test that warms a cached route, directly mutates backing data, calls reset, and verifies a fresh subsequent read;
  asserting only the reset route's 2xx response does not prove invalidation.
- Run typecheck, lint, unit tests, and targeted integration tests.

## Red flags

- Business logic inside route callbacks.
- Unvalidated casts such as `req.body as SomeDto`.
- Missing `return` after sending a response in branching handlers.
