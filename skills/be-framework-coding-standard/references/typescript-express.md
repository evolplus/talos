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
- Run typecheck, lint, unit tests, and targeted integration tests.

## Red flags

- Business logic inside route callbacks.
- Unvalidated casts such as `req.body as SomeDto`.
- Missing `return` after sending a response in branching handlers.
