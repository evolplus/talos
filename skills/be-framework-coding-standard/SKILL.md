---
name: be-framework-coding-standard
description: Standardized backend implementation guidance for BE Dev using the SRS-declared Backend-Track and Backend-Framework. Use when coding, refactoring, or reviewing backend web APIs, BFFs, microservices, workers, jobs, or service integrations in TypeScript with Express, TypeScript with NestJS, Python with FastAPI, Java with Spring Boot, .NET Core C#, Pure Golang, Java Core, Golang with Gin, Golang with Fiber, Golang with Echo, or Golang with Kratos; BE Dev reads docs/SRS.md Backend-Track and Backend-Framework plus §3.4.5 Source Layout, then selects the matching reference so routing, layering, contracts, validation, observability, errors, transactions, and tests match the chosen stack.
agents: [be-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# BE Framework Coding Standard

## When to use

You are BE Dev implementing or reviewing backend code after the backend track and stack are declared in the signed-off SRS. This skill standardizes backend implementation without turning a feature task into a framework migration.

## Inputs and outputs

- **Inputs:** task assignment, `docs/SRS.md` headers `Backend-Track:` and `Backend-Framework:`, SRS §3.4.4 API Contract Format, SRS §3.4.5 Source Layout, task US / FR / NFR IDs, architecture, data-contract constraints, external-integration specs, current backend source tree, manifests, and installed framework versions.
- **Outputs:** backend code under the declared backend source root, framework-native handlers/controllers/services/repositories/workers, API contracts when endpoints/messages change, validation/error/observability behavior aligned to SRS/architecture, and focused unit/integration/contract tests.

## Backend track selection

`Backend-Track:` declares the service role:

| Value | Meaning |
|---|---|
| `backend-web` | Web-facing backend: public/internal HTTP API, BFF, web gateway, session-backed web API, or API directly serving frontend clients. |
| `backend-service` | Microservice/runtime service: domain service, worker, consumer, scheduler, service-mesh API, gRPC service, event processor, or internal integration service. |
| `multiple` | More than one backend row exists; select per §3.4.5 Source Layout / architecture container. |
| `N/A` | No backend implementation applies. |

## Framework selection

1. Read `docs/SRS.md` before inspecting manifests. Headers `Backend-Track:` and `Backend-Framework:` are authoritative.
2. If `Backend-Framework:` is one supported value, select that framework reference.
3. If `Backend-Framework:` is `multiple`, select the framework from the §3.4.5 backend row that owns the task's service/container/path. If no row matches or several rows match, halt with `NEEDS_CONTEXT` and cite the candidate rows.
4. If `Backend-Track:` is `multiple`, select the track from the same §3.4.5 backend row. If one framework spans both tracks, the track still controls lifecycle expectations.
5. If either header is `N/A`, do not perform BE implementation; report that no backend applies.
6. If either header is missing, `TBD`, unsupported, or inconsistent with §3.4.5, halt and return the work to BA:
   - greenfield/authored SRS: BA Phase 1.X must ask the user to choose;
   - brownfield/extracted SRS: BA Mode E must detect from source evidence and write the SRS fields.
7. After selecting the reference, inspect manifests/source only as a consistency check. If code evidence contradicts the SRS-selected track/framework, halt and raise an open issue; do not silently switch references.

Read the matching reference before editing:

| Framework | Reference |
|---|---|
| TypeScript with Express | [`references/typescript-express.md`](./references/typescript-express.md) |
| TypeScript with NestJS | [`references/typescript-nestjs.md`](./references/typescript-nestjs.md) |
| Python with FastAPI | [`references/python-fastapi.md`](./references/python-fastapi.md) |
| Java with Spring Boot | [`references/java-spring-boot.md`](./references/java-spring-boot.md) |
| .NET Core C# | [`references/dotnet-core-csharp.md`](./references/dotnet-core-csharp.md) |
| Pure Golang | [`references/pure-golang.md`](./references/pure-golang.md) |
| Java Core | [`references/java-core.md`](./references/java-core.md) |
| Golang with Gin | [`references/golang-gin.md`](./references/golang-gin.md) |
| Golang with Fiber | [`references/golang-fiber.md`](./references/golang-fiber.md) |
| Golang with Echo | [`references/golang-echo.md`](./references/golang-echo.md) |
| Golang with Kratos | [`references/golang-kratos.md`](./references/golang-kratos.md) |

## Universal implementation procedure

1. Inspect nearby backend code before editing. Preserve established folders, naming, dependency injection, persistence abstraction, error envelope, logging, metrics, config, test style, formatter, and lint rules.
2. Map every changed endpoint, worker, job, or service operation to the task's SRS IDs and FR contract. If the FR/schema/error model is incomplete, halt and raise an OQ; do not invent a contract in code.
3. Keep boundaries explicit:
   - transport layer owns request/message parsing, auth context extraction, response/message shape, and status codes;
   - application/service layer owns use-case orchestration and transaction boundaries;
   - domain layer owns invariants and state transitions;
   - repository/infrastructure layer owns persistence, external clients, queues, and adapters.
4. Validate inputs at the boundary and map validation failures to the declared project error envelope. Never let framework-default validation errors leak if the API contract declares a different shape.
5. Preserve security controls: authentication, authorization, tenant isolation, CSRF/session policy for web backends, mTLS/service auth for service backends, PII masking, and secret handling.
6. Respect architecture §6 data contracts. Run named format conversions at boundaries and avoid writing gate fields unless the task owns the write condition.
7. Make failure behavior deliberate: classify deterministic vs transient errors, use retries only for transient failures, preserve idempotency keys, and route poison messages / DLQ paths as architecture declares.
8. Keep observability consistent: structured logs with correlation/request IDs, metrics for success/failure/latency, traces/spans where the project uses them, and no sensitive data in logs.
9. Update API contracts under `docs/api-contracts/` when endpoints/messages change, using SRS §3.4.4's declared format. Freeze only when stable.
10. Test at the right layer: unit tests for domain/application logic, framework handler/controller tests for transport mapping, integration tests for DB/queue/external adapter behavior, and contract tests for public API/message changes.
11. Run format, lint, typecheck/compile, unit tests, and relevant integration/contract tests. If a command cannot run locally, document the blocker and the narrower checks you did run.

## Track-specific rules

### backend-web

- Treat user-facing latency, session behavior, CORS/CSRF, auth redirects, request size limits, pagination, and API error ergonomics as first-class.
- Keep BFF logic thin. It may compose downstream services for frontend needs, but domain ownership stays with the owning service.
- Do not expose internal model fields just because the ORM/DTO contains them.

### backend-service

- Treat service ownership, idempotency, message compatibility, backpressure, retries, health checks, and deploy/runtime isolation as first-class.
- Keep APIs/events backward-compatible unless the SRS/architecture declares a versioned breaking change.
- Avoid shared-database writes across service boundaries unless architecture explicitly allows them.

## Hard rules

- Do not introduce a new backend framework, ORM, validation library, message framework, or test runner unless an ADR or architecture task explicitly approves it.
- Do not choose a framework from package files when `docs/SRS.md` declares a different `Backend-Framework:`. Treat that as SRS/code drift and halt.
- Do not start BE implementation while `Backend-Track:` or `Backend-Framework:` is missing, `TBD`, unsupported, or `multiple` without a matching §3.4.5 row.
- Do not rewrite established project structure to match a reference file. The reference guides decisions inside the existing architecture.
- Do not hardcode API URLs, secrets, credentials, tenant IDs, region rules, retry counts, or timeout values outside the project config mechanism.
- Do not swallow errors or map all failures to generic 500s when the FR error model declares specific cases.
- Do not bypass type errors, compiler errors, lints, analyzer failures, or tests with broad suppressions.

## References

- [`references/typescript-express.md`](./references/typescript-express.md)
- [`references/typescript-nestjs.md`](./references/typescript-nestjs.md)
- [`references/python-fastapi.md`](./references/python-fastapi.md)
- [`references/java-spring-boot.md`](./references/java-spring-boot.md)
- [`references/dotnet-core-csharp.md`](./references/dotnet-core-csharp.md)
- [`references/pure-golang.md`](./references/pure-golang.md)
- [`references/java-core.md`](./references/java-core.md)
- [`references/golang-gin.md`](./references/golang-gin.md)
- [`references/golang-fiber.md`](./references/golang-fiber.md)
- [`references/golang-echo.md`](./references/golang-echo.md)
- [`references/golang-kratos.md`](./references/golang-kratos.md)
- [`../api-contract-author/SKILL.md`](../api-contract-author/SKILL.md) - API contract authoring and freezing.
- [`../data-lifecycle-contracts/SKILL.md`](../data-lifecycle-contracts/SKILL.md) - gate-field write ownership.
- [`../format-boundary-contracts/SKILL.md`](../format-boundary-contracts/SKILL.md) - cross-system format conversion discipline.
