# Java Core Coding Standard

Read this when the backend service uses Java without Spring Boot as the application framework.

## Project shape

- Preserve the existing runtime style: plain Java service, servlet/JAX-RS, worker, CLI, scheduler, or custom framework.
- Keep application entrypoints small and move use-case logic into services/domain classes.
- Use explicit constructors and interfaces where the project uses dependency inversion; avoid hidden static registries unless already established.

## Contracts and IO

- Keep DTOs/messages/schema classes separate from persistence entities where the project does.
- Validate inputs at the boundary, then pass typed values into services.
- Route all external IO through adapters so tests can isolate domain/application logic.

## Runtime concerns

- Respect thread pools, shutdown hooks, retries, backoff, and idempotency policies already present.
- Keep logging, metrics, and config in the existing project mechanism.
- For workers/consumers, preserve offset/ack semantics and poison-message handling.

## Tests and checks

- Unit-test domain/application classes.
- Add integration tests around adapters, queues, DB, or HTTP surfaces changed by the task.
- Run build, unit tests, and static analysis if configured.

## Red flags

- Introducing Spring-style annotations or dependency patterns into a non-Spring service.
- Static global state that makes tests order-dependent.
- Catching and logging exceptions without surfacing failure to the caller/runtime.
