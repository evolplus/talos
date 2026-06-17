# .NET Core C# Coding Standard

Read this when the backend service uses .NET Core / ASP.NET Core with C#.

## Project shape

- Follow existing layering: controllers/minimal APIs, application services, domain, infrastructure, persistence, background services.
- Use dependency injection through the established service registration pattern.
- Keep DTOs/contracts separate from EF entities unless the project intentionally uses another pattern.

## APIs and services

- For controllers or minimal APIs, keep endpoint code thin and push use-case logic into services/handlers.
- Use model validation and project error mapping consistently. Responses must match the FR error envelope.
- Preserve middleware order for correlation IDs, exception handling, auth, routing, authorization, and endpoints.

## Persistence and runtime

- Keep EF Core DbContext lifetimes, transactions, migrations, and async usage aligned with project conventions.
- Use `IOptions`/configuration patterns for settings, secrets, URLs, timeouts, and feature flags.
- Background services must respect cancellation tokens and idempotency.

## Tests and checks

- Unit-test services/handlers without ASP.NET objects.
- Use WebApplicationFactory or project equivalent for endpoint behavior.
- Run build, format/analyzers if configured, unit tests, and targeted integration tests.

## Red flags

- Blocking on async with `.Result` or `.Wait()`.
- Capturing scoped services in singleton/background lifetimes.
- Returning EF entities directly from public APIs.
