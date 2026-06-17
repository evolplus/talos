# Golang with Kratos Coding Standard

Read this when the backend service uses Go with Kratos.

## Project shape

- Follow Kratos layering: transport, service/usecase, biz/domain, data, conf, server.
- Preserve generated/protobuf boundaries and do not hand-edit generated code.
- Keep dependency injection/wire setup consistent with the current service.

## Contracts and transports

- Treat proto/API definitions as the source for transport contracts when the project uses them.
- Keep HTTP/gRPC transport mapping thin and move behavior into usecase/biz layers.
- Preserve error reason codes, metadata, and status mappings declared by the project.

## Data and runtime

- Keep transactions, repository interfaces, external clients, and config in the established data layer.
- Respect service discovery, registry, tracing, metrics, logging, graceful shutdown, and middleware conventions.
- Preserve idempotency and retry behavior for service-to-service calls and consumers.

## Tests and checks

- Unit-test biz/usecase layers with mocked repos/clients.
- Add transport/contract tests when proto/API behavior changes.
- Run `gofmt`, generated-code checks, `go test ./...`, and integration tests as configured.

## Red flags

- Editing generated files instead of source proto/API definitions.
- Putting business logic in transport handlers.
- Introducing a second DI/config pattern beside the Kratos project pattern.
