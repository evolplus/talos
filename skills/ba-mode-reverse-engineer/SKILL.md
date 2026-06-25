---
name: ba-mode-reverse-engineer
description: "BA Phase 1.E ingestion mode (reverse-engineer-from-code) — brownfield onboarding Stage 3. Load when Shape Detection selects Mode E: no SRS yet, but docs/archaeology-reports/ and an extracted docs/architecture.md exist. Derives a kit-shape SRS from code + archaeology + architecture, then halts for the mandatory Stage 4 human-confirmation gate."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode E — reverse-engineer-from-code (brownfield Stage 3)

## When to use

You are the BA and Shape Detection selected **Mode E**: the codebase exists, no SRS has been authored, and the Codebase Archaeologist (Stage 1) + SA extract (Stage 2) have produced `docs/archaeology-reports/` and a provisional `docs/architecture.md`. Derive a kit-shape SRS, then HALT for the Stage 4 human-confirmation gate (never auto-approve).

#### Phase 1.E — Mode `reverse-engineer-from-code` setup (brownfield onboarding Stage 3)

The codebase exists; no SRS has been authored yet (or only a placeholder exists). The Codebase Archaeologist (B5, Stage 1) produced one or more `docs/archaeology-reports/<topic-slug>.md` reports, and SA's `extract` mode (Stage 2) produced a provisional `docs/architecture.md` flagged `Source: extracted`. Your job is to derive a kit-shape SRS from these inputs — Stage 3 of the brownfield onboarding workflow per `.claude/rules/brownfield-onboarding.md` §12.

E1. **Read all inputs.**
   - Every `docs/archaeology-reports/<topic-slug>.md` (Stage 1 output).
   - `docs/architecture.md` from SA extract mode (Stage 2 output; `Source: extracted` per section).
   - Every `docs/api-contracts/*` file produced by SA extract mode with `Status: Extracted`.
   - Any pre-existing non-kit docs the archaeology report cataloged (READMEs, Confluence pages, prior ADRs).
   - User-supplied context from the dispatch input (named PM, named Eng Lead, business intent the team can articulate even if it's not in code).
   - Frontend framework evidence from the archaeology report (`## Frontend Framework Evidence` if present, Service / Module Inventory `Stack` column otherwise) and architecture container stack fields.
   - Backend track/framework evidence from the archaeology report (`## Backend Framework Evidence` if present, Service / Module Inventory `Stack` column otherwise), public API/event/worker evidence, and architecture container stack fields.
   - Route/dependency/message evidence from the archaeology report: `## Service Boundary & Entry Point Map`, `## Route / RPC / Job Trace Matrix`, `## Dependency & Call Graph (C3)`, `## Message Broker / Consumer Logic`, and `## API / Message Spec Candidates`.

E2. **Derive User Stories from observed surfaces.**
   - Each user-facing endpoint, UI route, externally consumed API/RPC operation, externally consumed message flow, or job trigger with a human/business outcome becomes a candidate US. Do not create one US per internal helper endpoint or internal-only consumer; group internal service choreography under the FRs that deliver the externally visible outcome.
   - For each: Description's `As a <Role>` + `I want to <Action>` come from the observed surface and its consumer (when identifiable). `So that <Value>` is **never extractable from code alone** — fill with `TODO: <inferred value statement; team must confirm>` and tag the entry `Source: extracted | Confidence: inferred`.
   - Pre-conditions: derive from observed auth / authz middleware + observed state preconditions in code.
   - Main Flow: derive from the route/RPC/job trace matrix and message broker/consumer logic (one numbered step per code-observable action: receive input -> validate -> call internal service -> persist -> emit/consume event -> return/ack).
   - Business Rules: derive from observed invariants in code + tests + DB constraints + idempotency/dedup/ordering rules in broker consumers. Confidence-tag each.
   - Post-conditions: derive from observed DB writes / event emissions / cache invalidations / broker acknowledgements / side effects.
   - Write each US to `docs/user-stories/<US-ID>.md` per the template, with `Source: extracted` and `Last-Confirmed: TBD` (set during Stage 4).
   - Add a row per US to SRS §3.2 index with the same Source / Last-Confirmed columns (see SRS template Source-flag schema).

E3. **Derive FRs from observed operations.**
   - Each endpoint, RPC operation, job trigger, message producer, or message consumer with a stable observable contract becomes an FR or part of an FR. Group tightly coupled producer/consumer chains into one FR when the chain implements a single business operation.
   - Input / Output schemas: lift first from `docs/api-contracts/*` extracted contracts, then from code's data classes / DTOs / JSON marshaling cited by archaeology. For async flows, include payload schema, key/partition/ordering, consumer group, ack/commit semantics, retry/backoff/DLQ, and idempotency/dedup rules.
   - Error Handling table: lift from observed error responses in handlers + tests and from retry/DLQ/failure paths in the message broker logic.
   - Sequence Diagram: derive from observed route/RPC/job trace and service dependency edges (handler -> service -> DB / internal service / external system / producer -> broker -> consumer -> side effect).
   - Write each FR to `docs/frs/<FR-ID>.md` with `Source: extracted` flag and `Confidence: <level>` per section.
   - Add a row per FR to SRS §3.3 index.
   - If a public API/message surface exists in archaeology but has no extracted contract file under `docs/api-contracts/`, add an OQ category `contract-extraction-missing`, keep the affected FR `Confidence: low`, and halt at the Stage 4 confirmation gate. Do not invent the missing schema.

E4. **Derive NRS from observed metrics + tests + NFR-shaped code.**
   - Performance targets: when deployed-env metrics are available, lift observed P95 / P99 latency, throughput, error rate. Mark `Source: extracted | Confidence: high`.
   - Performance targets when metrics are NOT available: mark `unknown — measure during pilot`. Never invent numbers.
   - Availability targets: same pattern. `unknown — declare during Stage 4 confirmation` when not encoded anywhere.
   - Observability: lift from observed log / metric / trace emissions.

E5. **Derive Security & Compliance from observed code.**
   - Authentication mechanism: lift from observed auth middleware.
   - Authorization: lift from observed RBAC / ABAC / per-route middleware.
   - PII handling: lift from observed sensitive-field handling, encryption-at-rest config, log scrubbing.
   - Regional / data residency: lift from observed deploy config + DB region constraints.
   - **Halt if any HIGH-severity security issues were filed by the archaeologist.** Do not produce a Signed-off-track SRS over a codebase with known credential leaks; team must address those first as an SDLC Path A task.

E5a. **Detect frontend framework from source evidence and write it into the SRS.**
   - Read the archaeology report's Frontend Framework Evidence table when present. If absent, derive from manifests and source layout cited by the archaeology report and architecture:
     - `next` dependency, `next.config.*`, or Next `app/` / `pages/` routing -> `Next.js`.
     - `react-native`, Expo config, Metro config, native `ios/` + `android/` app bridge -> `React Native`.
     - `react` + `react-dom` with Vite / CRA / custom web build and no Next.js app framework -> `ReactJS`.
     - `pubspec.yaml` with Flutter SDK and `lib/**/*.dart` widgets -> `Flutter`.
     - `vue`, `.vue` SFCs, Vite Vue config -> `Vue.js`.
     - `angular.json` or `@angular/*` packages -> `Angular`.
   - If one supported framework owns all frontend surfaces, set SRS header `Frontend-Framework: <canonical>` and use that canonical value in §3.4.2 `Framework / Renderer` rows and §3.4.5 frontend `Framework / Runtime` rows.
   - If separate frontend app boundaries use different supported frameworks, set `Frontend-Framework: multiple`, then map each surface/app in §3.4.2 and §3.4.5. Include evidence/confidence in Notes, e.g. `Source: extracted; Evidence: frontend/web/package.json next dependency; Confidence: high`.
   - If conflicting framework evidence appears inside one app boundary, do not guess. Add an OQ category `frontend-framework-conflict` citing exact evidence paths, keep `Frontend-Framework: TBD`, and halt at the Stage 4 confirmation gate.
   - If the detected frontend framework is unsupported by `fe-framework-coding-standard`, add OQ category `frontend-framework-unsupported`; the team must either extend the kit with a matching skill or choose a supported migration target before governance sign-off.
   - If no frontend source exists, set `Frontend-Framework: N/A`.

E5b. **Detect backend track/framework from source evidence and write it into the SRS.**
   - Read the archaeology report's Backend Framework Evidence table when present. If absent, derive from manifests, route/controller/worker entrypoints, public API/event evidence, Service / Module Inventory `Stack`, and architecture container stack fields.
   - Detect backend track per service boundary:
     - Web-facing HTTP API, BFF, API gateway, session-backed web API, or backend directly serving frontend clients -> `backend-web`.
     - Microservice, domain service, worker, scheduler, event consumer, gRPC/internal service, or service-mesh runtime component -> `backend-service`.
   - Detect backend framework per service boundary:
     - TypeScript + `express` dependency / Express route setup, with no Nest framework -> `TypeScript with Express`.
     - `@nestjs/*`, `nest-cli.json`, Nest modules/controllers/providers -> `TypeScript with NestJS`.
     - `fastapi`, `uvicorn`, `FastAPI()` app construction -> `Python with FastAPI`.
     - `spring-boot-starter`, `@SpringBootApplication` -> `Java with Spring Boot`.
     - `.csproj`, ASP.NET Core / `Microsoft.AspNetCore`, `Program.cs` minimal API or controllers -> `.NET Core C#`.
     - Go standard-library HTTP (`net/http`, `http.ServeMux`) with no Gin/Fiber/Echo/Kratos -> `Pure Golang`.
     - Java runtime/service code without Spring Boot framework -> `Java Core`.
     - `github.com/gin-gonic/gin` -> `Golang with Gin`.
     - `github.com/gofiber/fiber` -> `Golang with Fiber`.
     - `github.com/labstack/echo` -> `Golang with Echo`.
     - `github.com/go-kratos/kratos` -> `Golang with Kratos`.
   - If one supported backend track/framework owns all backend services, set SRS headers `Backend-Track: <canonical track>` and `Backend-Framework: <canonical framework>` and use those canonical values in §3.4.5 backend rows.
   - If separate backend service boundaries use different tracks or frameworks, set the differing header(s) to `multiple`, then map each backend service in §3.4.5. Include evidence/confidence in Notes, e.g. `Source: extracted; Evidence: backend/api/package.json @nestjs/core; Confidence: high`.
   - If conflicting track/framework evidence appears inside one backend boundary, do not guess. Add an OQ category `backend-framework-conflict` citing exact evidence paths, keep the affected header(s) as `TBD`, and halt at the Stage 4 confirmation gate.
   - If the detected backend framework is unsupported by `be-framework-coding-standard`, add OQ category `backend-framework-unsupported`; the team must either extend the kit with a matching skill reference or choose a supported migration target before governance sign-off.
   - If no backend source or server-side operation exists, set `Backend-Track: N/A` and `Backend-Framework: N/A`.

E6. **Populate SRS header.**
   - `Version: 1.0` (this is the first kit-tracked version; the underlying codebase may be at v20.x by its own counter — that's the codebase's version, not the SRS's).
   - `Status: Draft` (will transition to `In-Review` only after Stage 4 confirmation gate begins, and `Signed-off` only after gate completes).
   - `Source: extracted` (entire SRS; downstream agents see this and apply extract-mode rules).
   - `Last-Updated: <ISO-8601>`.
   - `Designated Design Approver: TBD`, `Designated Dependency Approver: TBD` (team must name).
   - `Frontend-Framework: <detected canonical value | multiple | N/A | TBD>` from E5a. Brownfield must not leave this implicit; FE Dev consumes this field for framework skill selection after sign-off.
   - `Backend-Track: <detected canonical value | multiple | N/A | TBD>` and `Backend-Framework: <detected canonical value | multiple | N/A | TBD>` from E5b. Brownfield must not leave these implicit; BE Dev consumes these fields for framework skill selection after sign-off.

E7. **Halt with NEEDS_CONTEXT for the Stage 4 confirmation gate.**

   Brownfield onboarding REQUIRES human confirmation before the extracted SRS becomes canonical. Phase 1.E does not auto-flip Status to `Signed-off`. Instead, halt and return:

   ```
   Status: NEEDS_CONTEXT
   Reason: Brownfield Stage 3 (SRS extraction) complete. Stage 4 decision required.
   Question: <N> User Stories and <M> FRs derived from codebase + archaeology + extracted architecture. What is the goal of this extraction?
   Options:
     [a] Batch-confirm (full kit governance) — team attests that the extracted set is "good enough" as a starting point. Every item transitions Source: extracted → confirmed in one pass. Sets Purpose: governance. Stages 5–6 follow. Fast; assumes the team trusts the extraction. RECOMMENDED for first-pass adoption when scope is small.
     [b] Per-item confirm (full kit governance) — team reviews each US / FR / NRS item individually with Confirm / Reject / Refine options. Sets Purpose: governance. Stages 5–6 follow. Slower; safer. RECOMMENDED for large brownfields or compliance-sensitive systems where wrong extraction is costly.
     [c] Defer (full kit governance, lazy confirmation) — keep the extracted SRS in Draft / Source: extracted state; team will manually confirm items over time as features touch them. Sets Purpose: governance. Future SDLC dispatches (Path A) treat unconfirmed items as inferred-only-not-binding. RECOMMENDED when team is bandwidth-constrained but wants the kit running for new features.
     [d] Documentation-only — no forward kit governance is intended. Artifacts stay at Source: extracted; Last-Confirmed: TBD. Sets Purpose: documentation. Stages 5–6 are SKIPPED entirely. Path A SDLC dispatches against this SRS are FORBIDDEN. RECOMMENDED for onboarding-docs, compliance audits, arch reviews, or API-consumer references where governance isn't the goal. See `.claude/rules/brownfield-onboarding.md` § Documentation-only sub-case for the full pattern.
   Recommended: a (for governance intent) or d (for documentation intent) — depends on why this onboarding was dispatched. Confirm with the user.
   Confidence: medium
   Justification: Most first-pass brownfield onboardings benefit from a single batch confirmation; documentation-only is a common second case worth surfacing explicitly so teams don't accidentally start a governance flow they don't want.
   ```

E8. **After user picks the option**, proceed:

   - `[a] batch-confirm (governance)`: flip every `Source: extracted` flag to `Source: confirmed` and set `Last-Confirmed: <date>` to today's date across all extracted artifacts. Set SRS header `Purpose: governance`. Continue to Phase 1.X common procedure; Stages 5–6 of brownfield onboarding follow.
   - `[b] per-item confirm (governance)`: produce a confirmation checklist at `docs/brownfield-confirmation/<topic-slug>.md` listing every extracted item with Confirm / Reject / Refine slots. Set SRS header `Purpose: governance`. Halt; await user-completed checklist. On re-dispatch with the completed checklist, apply each decision: Confirm → flip flag; Reject → mark `Status: Deprecated` and file cleanup-task open-issue per kit's iteration pattern; Refine → file OQ in SRS §8 for rewording. Continue to Phase 1.X.
   - `[c] defer (governance)`: continue to Phase 1.X with all flags staying `Source: extracted`. Set SRS header `Purpose: governance`. Downstream agents treat extracted-but-unconfirmed items as informational; QA-Author's by-us mode authors test cases only against confirmed items; SDLC dispatches that touch unconfirmed items first re-confirm them inline.
   - `[d] documentation-only`: set SRS header `Purpose: documentation` and `Status: In-Review` (note: Status DOES NOT flip to Signed-off — documentation-only SRSs are reference artifacts, not signed-off contracts). All flags stay `Source: extracted | Last-Confirmed: TBD`. **HALT after Phase 1.E.** Do NOT proceed to Phase 1.X common procedure or Phase 2 sign-off — those paths produce kit-governance side effects (header check expectations, OQ-gate enforcement, Last-Updated bumps that imply intent). Brownfield Stages 5–6 are SKIPPED. The output is reference documentation, period. Future Path A SDLC dispatches against this SRS will be refused by the Orchestrator until `Purpose:` flips to `governance` via an explicit re-promotion (`.claude/rules/brownfield-onboarding.md` § Documentation-only sub-case → Promoting from documentation to governance later).

E9. **Inline-don't-link (self-containment).** Walk the derived SRS body + per-US/per-FR files for body-content references back to `docs/archaeology-reports/<slug>.md` or the codebase (`see services/X/handler.go`, `refer to docs/archaeology-reports/...`). The archaeology report is preserved as an audit-trail artifact but is NOT consumed by downstream agents — they read kit artifacts only. Replace substantive back-references with inlined content from the archaeology + code observation; raise OQs for gaps. Self-containment per CLAUDE.md §10.

E10. Proceed to Phase 1.X common procedure (governance paths [a]/[b]/[c] only). The documentation-only path [d] halts at the end of E8.

**Scoped dispatch.** Mode E accepts a `scope:` dispatch parameter to narrow output:

- `scope: api-contracts` — produce only `docs/frs/<FR-ID>.md` files (no USes, no §3.2 index). Useful for API-consumer documentation use cases.
- `scope: user-stories` — produce only `docs/user-stories/<US-ID>.md` files + §3.2 index (no FRs). Useful when capabilities matter more than operations.
- `scope: security-compliance` — produce only SRS §4.1 + §6 + relevant cross-cutting (no per-US, no per-FR). Useful for compliance-audit documentation.
- `scope: <service-name>` — limit all output to the named service; ignore other parts of the monorepo. Useful when extraction is scoped to one slice.

Unscoped (the default) covers the entire archaeology report's surface. Scoped is recommended for documentation-only use cases where only a slice is needed; full SDLC governance always uses unscoped to keep the SRS complete.

**Hard rules specific to `reverse-engineer-from-code`:**

- **Stage 4 confirmation gate is NOT optional and CANNOT be auto-approved by any agent.** Like the design lifecycle's human confirmation step, this is a human-in-the-loop boundary. Skipping it means the kit silently encodes bad code as canonical requirements — worse than not adopting the kit at all.
- **`So that <Value>` is never extractable from code.** Mark every Description's value-clause with `TODO: <team-supplied value statement>` and tag the entry inferred. Do NOT fabricate value statements.
- **NRS numbers come from observation OR are explicitly `unknown — measure during pilot`.** Never invent thresholds.
- **HIGH-severity security issues from archaeology are blockers.** Phase 1.E halts before producing any SRS content over a codebase with known credential leaks / unaddressed CVEs / equivalent.
- **Frontend framework is extracted, not chosen by FE Dev.** Brownfield Mode E records the detected framework in the SRS header and per-surface/per-app rows. If code evidence conflicts, keep `Frontend-Framework: TBD` and surface the conflict at Stage 4; do not let FE Dev resolve it during implementation.
- **Backend track/framework are extracted, not chosen by BE Dev.** Brownfield Mode E records the detected backend track and framework in the SRS header and per-service rows. If code evidence conflicts, keep the affected backend header(s) as `TBD` and surface the conflict at Stage 4; do not let BE Dev resolve it during implementation.
- **API/message behavior is extracted from trace + contract evidence, not guessed.** Route/RPC/job trace rows, `docs/api-contracts/*`, and Message Broker / Consumer Logic are the source for FR schemas, sequence diagrams, retry/DLQ behavior, and side effects. Missing evidence is an OQ/extraction gap, never a place to improvise.
- **Extracted artifacts retain `Source: extracted` flag in their content forever**, even after Stage 4 confirmation flips to `Source: confirmed`. The history is preserved via `Source: confirmed (originally extracted YYYY-MM-DD)` so future readers can trace lineage.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
