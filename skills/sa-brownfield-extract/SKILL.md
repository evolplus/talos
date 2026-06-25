---
name: sa-brownfield-extract
description: "SA extract-mode procedure for brownfield onboarding Stage 2. Use when Solution Architect is dispatched in `extract` mode before SRS exists to turn Codebase Archaeologist reports and existing code/docs into a provisional docs/architecture.md with Source: extracted and confidence tags, plus extracted API/message contract stubs, route/dependency/async workflow coverage, and confirmation-pending open issues."
agents: [sa]
sdlc_phase: architecture
owner: Platform Eng
status: active
---

# SA Brownfield Extract

## Use

Use this skill only for SA `extract` mode during brownfield onboarding Stage 2. The output documents what exists; it does not recommend changes.

## Inputs

- `docs/archaeology-reports/<topic-slug>.md`
- Existing codebase/docs named by the report
- Optional `scope:` dispatch parameter: `architecture-only`, `security-compliance`, or a service/module name

## Outputs

- Provisional `docs/architecture.md`
- Observed-decision ADRs only when code irrefutably encodes the decision
- Extracted API/message contract stubs under `docs/api-contracts/` when endpoints, RPC operations, or messages are observable. Use service-level OpenAPI for REST, AsyncAPI for brokered messaging, proto for gRPC, GraphQL SDL for GraphQL, and markdown only for legacy/prototype surfaces with an explicit gap note.
- `docs/open-issues.md` entries with category `extract-confirmation-pending`
- Worktree `plan-update.json`

## Procedure

1. Read all archaeology reports for the scope. If any required report is `INSUFFICIENT`, halt and request more archaeology or team-interview input.
   - Before extracting, verify the report contains `## Service Boundary & Entry Point Map`, `## Route / RPC / Job Trace Matrix`, `## Dependency & Call Graph (C3)`, `## Message Broker / Consumer Logic`, and `## API / Message Spec Candidates` for the in-scope services.
   - If the project has public/internal APIs or brokered messages but those sections are missing or shallow, halt with `NEEDS_CONTEXT` and request a Stage 1 archaeology re-dispatch with deep route/dependency/contract scope. Do not compensate by writing vague architecture.
2. Map observed services/modules to C4 C1-C3:
   - C1/C2 are usually high confidence from repo layout, deploy manifests, and public surfaces.
   - C3 is package/module inferred; mark confidence honestly.
   - Do not extract C4 Code.
3. Populate architecture sections from observed evidence:
   - data models from migrations/ORM/schema files;
   - API inventory from Public API Surface + Service Boundary & Entry Point Map + API / Message Spec Candidates;
   - per-operation route trace from Route / RPC / Job Trace Matrix;
   - dependency/call graph from imports, clients, service registries, Route Trace rows, Dependency & Call Graph edges, and manifests;
   - async workflows from Message Broker / Consumer Logic, producers, consumers, topics, state transitions, retry/DLQ configs, and idempotency/dedup evidence;
   - cross-cutting concerns from middleware/config;
   - NFR posture from metrics when available, otherwise `unknown -- measure during pilot`.
4. For each discovered API/message, create an extracted contract stub with `Status: Extracted`, `Source: extracted`, confidence, observed auth, schemas, and TODO markers for non-introspectable fields.
   - REST: create or update `docs/api-contracts/<service>.openapi.yaml` with `openapi: 3.1.0`, one operation per observed route, operationId, auth/security scheme, request/response schemas, observed status codes, standard error envelope, idempotency/rate-limit notes, and `x-source-evidence` file:line values.
   - gRPC: create or update `docs/api-contracts/<service>.proto` with observed service/method/message shapes and TODO markers for unknown field types.
   - GraphQL: create or update `docs/api-contracts/<service>.graphql` with observed query/mutation/subscription names, input/output types, auth notes, and TODO markers for unknown fields.
   - Async messaging: create or update `docs/api-contracts/<service-or-broker>.asyncapi.yaml` with `asyncapi: 2.6.0` or the project's declared version, channels, producer/consumer operation bindings, payload schemas, consumer groups, ack/commit behavior, retry/backoff/DLQ, idempotency/dedup, ordering/partition key, and side effects.
   - WebSocket/SSE: document as OpenAPI callbacks/webhooks when the project already uses OpenAPI that way; otherwise create a markdown extracted contract with connection/auth/message/event schemas and lifecycle states.
   - Never mark extracted contracts `Frozen`. FE Dev cannot consume them until BE Dev validates and freezes them during governed implementation or the human confirmation flow explicitly promotes them.
5. Tag every architecture section with `Source: extracted | Confidence: high|medium|low|inferred`.
6. File one open issue for every `Confidence: inferred` item.
7. Keep architecture self-contained. Do not put substantive body references back to archaeology reports or source paths.
8. Commit changes, then emit `plan-update.json`.

## Hard Rules

- Document what exists; do not recommend or redesign.
- Do not invent intent.
- Do not omit confidence tags.
- Do not propose new third-party dependencies.
- Do not write SRS or plan content.
- Do not collapse API/message contracts into prose-only architecture. If a route, RPC, or brokered message is observable, write a contract stub under `docs/api-contracts/` or halt with a named extraction gap.
- Do not treat a one-sided message observation as complete. A broker flow needs producer, payload, topic/queue, consumer handler, ack/commit, retry/DLQ, idempotency, and side effects when observable; unknown items become TODOs and open issues.
- Commit before signaling done.
