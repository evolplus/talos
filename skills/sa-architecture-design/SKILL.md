---
name: sa-architecture-design
description: SA design-mode procedure for producing docs/architecture.md, ADRs, and docs/instrumentation-contract.md from a signed-off SRS. Use when Solution Architect is dispatched in `design` mode after SRS sign-off to create or revise greenfield architecture, choose dependencies through the approval gate, define C4 C1-C3, API/data/async/cross-cutting sections, and establish format-boundary and gate-field contracts.
agents: [sa]
sdlc_phase: architecture
owner: Platform Eng
status: active
---

# SA Architecture Design

## Use

Use this skill when SA is dispatched in `design` mode. Do not use for brownfield extraction or external-integration adequacy; those have separate skills.

## Inputs

- `docs/SRS.md` at `Status: Signed-off`
- `docs/user-stories/`, `docs/frs/`, `docs/external-integrations/`
- Existing `docs/architecture.md` and `docs/decisions/` when revising
- SRS headers `Designated Dependency Approver`, `Frontend-Framework`, `Backend-Track`, `Backend-Framework`
- `solution-defaults`, `third-party-dependency-evaluation`, `adr-author`, `c4-author`, `data-lifecycle-contracts`, `format-boundary-contracts`

## Outputs

1. `docs/architecture.md` using `agents/_templates/_artifacts/architecture-template.md`.
2. ADRs under `docs/decisions/` for every non-trivial choice.
3. `docs/instrumentation-contract.md` for any SRS with a UI surface.
4. `docs/open-issues.md` entries for architectural gaps that cannot be resolved from the SRS.
5. Worktree `plan-update.json` with `track: "sa"`.

## Procedure

1. Verify SRS is signed off. Halt if not.
2. Read the SRS, every linked US/FR, external integration files, and prior ADRs.
3. Build C4 levels:
   - C1 Context: system boundary, actors, external systems.
   - C2 Containers: runnable/deployable units, datastores, queues, clients.
   - C3 Components: required for non-trivial containers; each component row carries `Linked FRs`.
   - Do not author C4 Code; Dev roles own code-level artifacts.
4. Fill architecture sections:
   - §3.5 Data Models when persistent state exists.
   - §3.6 API Inventory for REST/gRPC/GraphQL/WebSocket/events/queues, linking contract files.
   - §3.7 Dependency & Call Graph for cross-container calls, internal packages, and production dependencies.
   - §3.8 Async Workflows for event/queue flows.
   - Cross-cutting concerns, failure modes, NFR posture, open risks, and observability.
5. Apply data-contract skills:
   - Use `format-boundary-contracts` for fields crossing incompatible formats.
   - Use `data-lifecycle-contracts` for gate fields read by one component and written by another.
6. For UI-bearing SRSs, author `docs/instrumentation-contract.md` declaring stable test IDs/accessibility identifiers for FE Dev and QA.
7. For every non-trivial architectural choice, author an ADR.
8. For new third-party dependencies:
   - Check `solution-defaults` first.
   - Reuse prior ADR approvals when valid.
   - Otherwise evaluate 2-4 options with `third-party-dependency-evaluation`, halt with `NEEDS_CONTEXT`, and wait for the Designated Dependency Approver.
   - Do not include the dependency in accepted architecture until approval is recorded.
9. Run a self-containment check on produced artifacts.
10. Commit changes, then emit `plan-update.json`.

## Quality Bar

The architecture must let TL break down tasks and Devs implement without reverse-engineering intent. Every SRS requirement must have an architectural home, or a documented open issue.

## Hard Rules

- Never propose architecture before SRS sign-off.
- Never write source code, tests, API contracts, or plan files.
- Never weaken SRS Security & Compliance.
- Never approve dependencies yourself.
- Never skip `docs/instrumentation-contract.md` for UI-bearing SRSs.
- Never omit architecture §6 when format-boundary or gate-field conditions are present.
- Commit before signaling done.
