---
name: api-contract-author
description: How to publish, freeze, and version an API contract under docs/api-contracts/. Consult when the BE Dev needs to publish a contract before FE can start (CLAUDE.md §3.5 + §10).
agents: [be-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# API Contract Author

## When to use

You are the BE Dev. Your task introduces or modifies an endpoint that an FE task depends on. CLAUDE.md §10 hard rule: *no FE Dev start on a backend-dependent task until the API contract is `Frozen`*. This skill defines the contract format, the freeze discipline, and the versioning policy.

## Inputs and outputs

- **Inputs:** the SRS requirement(s) the endpoint serves, the architecture decisions that constrain it (auth, observability, error model)
- **Outputs:** a contract file under `docs/api-contracts/` with `Status: Frozen`, ready for FE to consume

## Format — read from SRS §3.4.4, never decide per task

The kit's format choice is project-wide, **declared in `docs/SRS.md` §3.4.4 API Contract Format**. As BE Dev, you do NOT pick the format per task — you read SRS §3.4.4 and use the declared format for the API style your endpoint serves. Mixing formats across endpoints in the same project (e.g., one `users.openapi.yaml` + one `orders.md`) is a contract-discipline violation; each API style has a single declared format.

Default formats per API style (from SRS §3.4.4):

| API style | Default format | Acceptable file extensions |
|---|---|---|
| REST (sync HTTP) | `openapi-3.1` | `.yaml`, `.yml`, `.json` (with `openapi-3.1` tag in `info.openapi` field) |
| gRPC | `proto3` | `.proto` |
| GraphQL | `graphql-sdl` | `.graphql`, `.gql` |
| Async messaging | `asyncapi-2.x` | `.yaml`, `.yml`, `.json` (with `asyncapi` field) |
| Legacy / prototype only | `markdown` | `.md` — requires ADR justification per SRS §3.4.4 |

If SRS §3.4.4 declares `openapi-3.1` for REST and you're tempted to write `endpoint.md` because "it's just a prototype," halt and either (a) update the SRS §3.4.4 declaration with an ADR justifying the markdown deviation OR (b) write the contract in the declared OpenAPI format. Don't silently drift.

**If SRS §3.4.4 is missing** but your task requires an API contract: halt and signal back to the Orchestrator. BA's Phase 1 should have captured the format declaration during ingestion; a missing §3.4.4 indicates an SRS gap that BA must close before BE Dev can proceed. Don't pick a format yourself.

## Naming and Status

```
docs/api-contracts/
├── users.openapi.yaml                   # service-level OpenAPI spec
├── orders.openapi.yaml
├── payments.proto                       # gRPC IDL
└── search-suggest.md                    # Markdown contract for one endpoint
```

Every contract file starts with a header (Markdown, or `info`/`description` / `x-contract-status` block for OpenAPI, AsyncAPI, GraphQL SDL, or Proto):

```
Status: Extracted | Draft | Frozen | Deprecated
Last-Updated: <ISO-8601>
Frozen-By: <agent or person>
Frozen-At: <ISO-8601>
```

`Frozen` is the only status FE Dev may consume from. `Draft` means the BE is still iterating. `Extracted` means SA brownfield extract created the contract from observed code; it is useful evidence but not a governed contract until BE Dev validates it and freezes a revision. `Deprecated` means there's a successor and consumers should migrate.

## Brownfield extracted contracts

When SA extract mode creates `Status: Extracted` contract stubs, BE Dev later treats them as inputs, not authority:

1. Read the extracted contract plus the source evidence it cites.
2. Validate every operation/channel/message against the implementation.
3. Resolve TODO schema gaps or file open issues where source evidence is insufficient.
4. Convert `Extracted` to `Draft`, revise as needed, then freeze through the normal procedure.
5. Never let FE Dev consume `Extracted` contracts directly.

## Required content per endpoint

Whatever format you choose, every endpoint must specify all of:

1. **Path and method** (and protocol if not REST)
2. **Auth requirement** — required scopes / roles, or "public" with explicit rationale
3. **Request shape** — fully typed: every field's type, required-or-optional, constraints (length, format, enum)
4. **Response shape** — same level of detail; per status code (200 / 201 / 400 / 401 / 403 / 404 / 409 / 422 / 500)
5. **Error model** — the error body shape (code, message, details). Standardize per service, not per endpoint.
6. **Idempotency** — for write methods (POST/PUT/PATCH/DELETE), whether the endpoint is idempotent and how clients signal it (Idempotency-Key header, deterministic resource ID, etc.)
7. **Rate limit** — per-user and global
8. **Pagination** — for list endpoints, the cursor / page model and the response envelope
9. **Examples** — at least one happy-path request + response, and one error response per non-200 status the endpoint can return

See [`references/example.md`](./references/example.md) for a worked Markdown contract.

## Procedure to publish

1. Draft the contract while you implement; don't wait until the implementation is "done."
2. Status starts at `Draft`. Iterate freely; FE is not consuming yet.
3. Validate the contract against your real implementation: every status code in the contract is one your code can return; every field shape matches what the code emits.
4. Run the contract through the agreed-upon lint / validator (Spectral for OpenAPI, buf for Proto, none for Markdown — but a peer reviewer reads it).
5. Set `Status: Frozen`, `Frozen-At`, `Frozen-By`. Notify the orchestrator (via your `plan-update.json`).
6. From this moment, treat the contract as immutable for this task. Any change goes through the freeze-break flow below.

## Versioning policy

- **Add-only changes** (new optional field, new endpoint, new optional query param) — bump minor version, no break.
- **Breaking changes** (removed field, changed type, renamed enum value, stricter validation) — bump major version, publish a new contract file alongside the old, mark old as `Deprecated` with a migration deadline.
- **Never** modify a `Frozen` contract in place to "fix" something. Freeze means freeze. If you must change it, follow the freeze-break flow.

## Freeze-break flow (CLAUDE.md §7)

When you discover after freezing that the contract must change:

1. Stop. Do not edit the frozen contract in place.
2. Raise a blocking issue in `docs/open-issues.md` per CLAUDE.md §6 with state `open`.
3. The Orchestrator halts dependent FE tasks (per CLAUDE.md §7).
4. You produce a new revision: bump the version, publish as a new file, mark the old `Deprecated`.
5. Re-freeze the new revision. Open issue moves to `resolved`. FE tasks resume against the new contract.

## Hard rules

- A contract without `Status: Frozen` is not a FE-consumable contract. `Extracted` and `Draft` are evidence/work-in-progress only.
- Once `Frozen`, no edits in place. Period.
- Every status code your endpoint can emit is in the contract. Codes that are in the code but not the contract are bugs (one of them is wrong).
- Errors return a standard error body shape across the service. Per-endpoint snowflake error shapes are a refactor target, not a contract feature.
- `Frozen` requires a real reviewer (peer BE or SA, not yourself).

## References

- [`references/example.md`](./references/example.md) — worked Markdown contract
- CLAUDE.md §3.5 — BE Dev role and contract publishing
- CLAUDE.md §10 — hard rules (FE blocked on Frozen contract)
- `.claude/rules/change-synchronization.md` §7 — freeze-break flow
- `.claude/rules/parallel-execution.md` §4 — BE/FE parallel start gated on contract freeze
