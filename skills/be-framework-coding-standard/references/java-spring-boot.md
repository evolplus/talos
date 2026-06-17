# Java with Spring Boot Coding Standard

Read this when the backend service uses Java with Spring Boot.

## Project shape

- Follow existing package layering: controller, application/service, domain, repository, config, integration/adapters.
- Use constructor injection. Avoid field injection and static service lookups.
- Keep annotations in the layer they belong to; do not push web annotations into domain objects unless the project already does.

## APIs and persistence

- Controllers map HTTP concerns and delegate to services. Services own transactions and business use cases.
- Use DTOs for API boundaries; do not expose JPA entities directly.
- Keep transaction boundaries explicit with existing `@Transactional` conventions.

## Errors and runtime

- Route exceptions through existing `@ControllerAdvice` / error handlers so responses match the FR error envelope.
- Preserve validation annotations, security annotations, profiles, config properties, and actuator/health patterns.

## Tests and checks

- Unit-test services with mocked repositories/adapters.
- Use slice tests (`@WebMvcTest`, repository tests) or integration tests according to project convention.
- Run build, unit tests, relevant integration tests, and static analysis if configured.

## Red flags

- Business logic in controllers.
- Lazy-loading entities during response serialization.
- Adding global beans/configuration for a feature-local need.
