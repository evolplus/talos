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

- `docs/archaeology-reports/<topic-slug>.inventory.md` — the Tier-1 manifest. **Read this first.** Enumerated ground truth with stable `INV-*` IDs; it tells you the size of the job before you start, and Stage 3.5 reconciles your output against it as a set difference.
- `docs/archaeology-reports/<topic-slug>.intent.md` — intent verdicts. `accidental` verdicts mark observed mechanisms that are residue rather than design; document them as deprecation candidates, not as architecture the team owns.
- `docs/archaeology-reports/<topic-slug>.md`
- Existing codebase/docs named by the report
- Optional `scope:` dispatch parameter: `architecture-only`, `security-compliance`, or a service/module name

## Outputs

- Provisional `docs/architecture.md`, every section carrying the provenance header block (`Snapshot-Commit`, `Extracted-From`, `Covers-Inventory`, `Source-Hash`) per `.claude/rules/brownfield-onboarding.md` § Provenance and drift
- Observed-decision ADRs only when code irrefutably encodes the decision
- Extracted API/message contract stubs under `docs/api-contracts/` when endpoints, RPC operations, or messages are observable. Use service-level OpenAPI for REST, AsyncAPI for brokered messaging, proto for gRPC, GraphQL SDL for GraphQL, and markdown only for legacy/prototype surfaces with an explicit gap note.
- `docs/open-issues.md` entries with category `extract-confirmation-pending`
- Worktree `plan-update.json`

## Procedure

0. Read the Tier-1 manifest and the intent report before anything else. **Every section you write carries `Covers-Inventory: <IDs>`.** An `INV-*` ID that ends up in no section is an extraction gap, and Stage 3.5 Check 2 is a set difference — it will find it. Where a surface genuinely does not belong in the architecture (a health check, build tooling, a dead route), disposition it explicitly (`internal` / `dead` / `out-of-scope` / `deprecated`) with evidence rather than leaving it uncovered; silence is indistinguishable from an oversight.
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
5. Tag every architecture section with `Source: extracted | Confidence: high|medium|low|inferred`. **The tag is a function of evidence class, not a judgement call** — Stage 3.5 Check 4 enforces this table and an inflated tag is blocking:

   | Tag | Requires |
   |---|---|
   | `high` | a Tier-1 `INV-*` ID, or a passing test that asserts the behavior |
   | `medium` | read from source but not mechanically confirmed |
   | `low` | non-kit documentation, comments, or naming convention only |
   | `inferred` | no source; MUST carry an `Intent-Trace:` from Stage 1b and a paired OQ |

   Self-assessed confidence is noise: `high` tags are exactly what Stage 4 reviewers skim past, so `high` has to mean something checkable. If a section you believe is right cannot cite an inventory ID or a test, the honest tag is `medium`.
6. File one open issue for every `Confidence: inferred` item.
7. Keep architecture self-contained. Do not put substantive body references back to archaeology reports or source paths.
8. Commit changes, then emit `plan-update.json`.

## Hard Rules

- Document what exists; do not recommend or redesign.
- Do not invent intent. An `inferred` item with no `Intent-Trace:` is a blocking Stage 3.5 finding that routes back to Stage 1b — never route an unprobed inference to a human.
- Every citation must resolve at the snapshot commit. `Extracted-From` paths, `Covers-Inventory` IDs, `x-source-evidence` values, and any `file:line` are checked mechanically at Stage 3.5 Check 1. A citation that does not resolve is treated as fabrication, not as a typo.
- Do not omit confidence tags.
- Do not propose new third-party dependencies.
- Do not write SRS or plan content.
- Do not collapse API/message contracts into prose-only architecture. If a route, RPC, or brokered message is observable, write a contract stub under `docs/api-contracts/` or halt with a named extraction gap.
- Do not treat a one-sided message observation as complete. A broker flow needs producer, payload, topic/queue, consumer handler, ack/commit, retry/DLQ, idempotency, and side effects when observable; unknown items become TODOs and open issues.
- Your output is gated by the Extraction Validator at Stage 3.5 before any human sees it. You do not self-certify the extraction.
- Commit before signaling ready-to-finalize.
