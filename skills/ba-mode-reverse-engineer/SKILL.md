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
   - `docs/archaeology-reports/<topic-slug>.inventory.md` (Stage 1a) — **read this first.** Enumerated ground truth: every route, channel, table, egress host and deployable with a stable `INV-*` ID. It tells you the size of the job before you start, and Stage 3.5 reconciles your output against it as a set difference.
   - `docs/archaeology-reports/<topic-slug>.intent.md` (Stage 1b) — the intent verdicts. `documented` supplies evidence-backed reasons; `accidental` marks deprecation candidates you must NOT enshrine as requirements; `not-found` is the real interview list.
   - Every `docs/archaeology-reports/<topic-slug>.md` (Stage 1 interpretive output).
   - `docs/architecture.md` from SA extract mode (Stage 2 output; `Source: extracted` per section).
   - Every `docs/api-contracts/*` file produced by SA extract mode with `Status: Extracted`.
   - Any pre-existing non-kit docs the archaeology report cataloged (READMEs, Confluence pages, prior ADRs).
   - User-supplied context from the dispatch input (named PM, named Eng Lead, business intent the team can articulate even if it's not in code).
   - Frontend framework evidence from the archaeology report (`## Frontend Framework Evidence` if present, Service / Module Inventory `Stack` column otherwise) and architecture container stack fields.
   - Backend track/framework evidence from the archaeology report (`## Backend Framework Evidence` if present, Service / Module Inventory `Stack` column otherwise), public API/event/worker evidence, and architecture container stack fields.
   - Route/dependency/message evidence from the archaeology report: `## Service Boundary & Entry Point Map`, `## Route / RPC / Job Trace Matrix`, `## Dependency & Call Graph (C3)`, `## Message Broker / Consumer Logic`, and `## API / Message Spec Candidates`.

E2. **Derive User Stories at CAPABILITY level — not one per surface.**

   Cluster the observed surfaces into capabilities first, then write one US per capability. Use the bounded-context grouping from the archaeology report (models grouped by functional domain) plus the surfaces that read and write each context's entities. A capability is what a user can accomplish; a surface is how the system currently lets them.

   Two reasons this is not one-US-per-surface. First, **a one-to-one mapping cements implementation shape into the requirements layer** — three endpoints that exist only because a form was split across three screens become three "requirements," and every future change then argues with the document. Second, it is the difference between a Stage 4 gate with 200 items and one with 25: capability-level claims are what Product can actually confirm, and confirming a capability implicitly confirms the surfaces beneath it.

   Record the mapping explicitly — each US carries `Covers-Inventory: <the INV-R / INV-E IDs it subsumes>` — so nothing is lost by the clustering and Stage 3.5 can still verify total coverage. Where a surface belongs to no capability (health checks, build tooling, dead routes), disposition it explicitly (`internal` / `dead` / `out-of-scope` / `deprecated`) with evidence; an uncovered ID is a blocking Stage 3.5 finding.

   - Each capability — grouping user-facing endpoints, UI routes, externally consumed API/RPC operations, externally consumed message flows, and job triggers that deliver one business outcome — becomes a candidate US. Internal helper endpoints and internal-only consumers never become USes; group internal service choreography under the FRs that deliver the externally visible outcome.
   - For each: Description's `As a <Role>` + `I want to <Action>` come from the observed surface and its consumer (when identifiable). `So that <Value>` is **never extractable from code alone** — fill with `TODO: <team-supplied value statement>` and tag the entry `Source: extracted | Confidence: inferred`. Where Stage 1b returned `documented`, attach the evidence verbatim with its reference in `Intent-Trace:` — but leave the `TODO` in place. A commit message is not a product owner; the evidence turns the question from "why does this exist" into "does this reason still hold," and only a human answers either.
   - Pre-conditions: derive from observed auth / authz middleware + observed state preconditions in code.
   - Main Flow: derive from the route/RPC/job trace matrix and message broker/consumer logic (one numbered step per code-observable action: receive input -> validate -> call internal service -> persist -> emit/consume event -> return/ack).
   - Business Rules: derive from observed invariants in code + tests + DB constraints + idempotency/dedup/ordering rules in broker consumers. Confidence-tag each.
   - Post-conditions: derive from observed DB writes / event emissions / cache invalidations / broker acknowledgements / side effects.
   - Write each US to `docs/user-stories/<US-ID>.md` per the template, with the provenance header block (`Source: extracted`, `Snapshot-Commit`, `Extracted-From`, `Covers-Inventory`, `Source-Hash`, `Last-Confirmed: TBD`) per `.claude/rules/brownfield-onboarding.md` § Provenance and drift.
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

E7. **Halt with NEEDS_CONTEXT for the purpose decision — Stage 3.5 runs before any human reviews content.**

   Brownfield onboarding REQUIRES human confirmation before the extracted SRS becomes canonical, and it requires independent validation before that confirmation is worth asking for. Phase 1.E never auto-flips Status to `Signed-off`.

   Two things happen after you halt, in this order: the **Extraction Validator** (Stage 3.5) reconciles what you wrote against the Tier-1 inventory, the contract stubs, and the code; and only on a `qualified` verdict does the **Stage 4 human gate** open, working the risk-ranked confirmation set the validator produced. Do not build a confirmation checklist yourself — you are the author, and the ranking has to come from somewhere independent of you.

   Halt and return:

   ```
   Status: NEEDS_CONTEXT
   Reason: Brownfield Stage 3 (SRS extraction) complete. Stage 4 decision required.
   Question: <N> capability-level User Stories and <M> FRs derived from the inventory (<R> routes, <E> channels, <T> tables) + archaeology + extracted architecture + contract stubs. What is the goal of this extraction, and which confirmation mode should Stage 4 use?
   Options:
     [a] Risk-ranked confirm (full kit governance) — DEFAULT. Stage 3.5 produces a ranked confirmation set with a stated budget; the team confirms Band 1 (uncertain AND consequential — auth / money / PII / retention / contested by runtime evidence) and Band 2 (inside the blast radius of planned work). Band 3 stays Source: extracted and confirms lazily on touch. Sets Purpose: governance. Stages 5–6 follow. RECOMMENDED for essentially every real-scale onboarding.
     [b] Batch-confirm (full kit governance) — team attests the whole extracted set is "good enough" in one pass. Sets Purpose: governance. Fast, and defensible only when scope is genuinely small; at any real scale this is a rubber stamp, and a rubber stamp over extracted artifacts is worse than no kit at all.
     [c] Per-item confirm (full kit governance) — every item reviewed individually with Confirm / Reject / Refine. Sets Purpose: governance. Rigorous; tractable only for compliance-regulated systems or a single narrow slice.
     [d] Defer (full kit governance, lazy confirmation) — nothing confirmed now; all items stay Source: extracted and future Path A dispatches treat them as inferred-only-not-binding. Sets Purpose: governance. Appropriate when the team is bandwidth-constrained but wants the kit running for new features — note it defers everything, including the items most likely to be wrong.
     [e] Documentation-only — no forward kit governance intended. Artifacts stay at Source: extracted; Last-Confirmed: TBD. Sets Purpose: documentation. Stages 5–6 are SKIPPED entirely. Path A SDLC dispatches against this SRS are FORBIDDEN. Stage 3.5 still runs in full — a reference document that omits a third of the surface is worse than none, because people will trust it. See `.claude/rules/brownfield-onboarding.md` § Documentation-only sub-case.
   Recommended: a (for governance intent) or e (for documentation intent) — depends on why this onboarding was dispatched. Confirm with the user.
   Confidence: medium
   Justification: The confirmation gate is the binding constraint on brownfield adoption — it consumes senior attention and does not scale with codebase size. Ranking bounds it without the quality collapse of a batch attestation; documentation-only is a common second case worth surfacing explicitly so teams don't accidentally start a governance flow they don't want.
   ```

E8. **After user picks the option**, proceed:

   In every governance option, set SRS header `Purpose: governance` and signal the Orchestrator to dispatch the **Extraction Validator** next. You do not proceed past Phase 1.X until Stage 3.5 returns `qualified`, and you never flip a `Source: extracted` flag yourself — Stage 4 owns that transition.

   - `[a] risk-ranked (governance)`: the default. Stage 3.5 writes `docs/brownfield-confirmation/<topic-slug>.md` with the ranked bands, the budget, and the Product / Engineering audience split. On re-dispatch with the completed set, apply each decision: Confirm → flip flag to `confirmed` with `Last-Confirmed: <date>`; Reject → mark `Status: Deprecated` and file a cleanup-task open-issue per the kit's iteration pattern; Refine → file an OQ in SRS §8. Band 3 items stay `Source: extracted` and are re-confirmed inline by the first dispatch that touches them.
   - `[b] batch-confirm (governance)`: after Stage 3.5 returns `qualified`, flip every `Source: extracted` flag to `Source: confirmed` with today's `Last-Confirmed:`. Continue to Phase 1.X; Stages 5–6 follow.
   - `[c] per-item confirm (governance)`: the team works the full Stage 3.5 confirmation set rather than only Bands 1–2, applying the same Confirm / Reject / Refine decisions. Halt; await the completed file.
   - `[d] defer (governance)`: continue to Phase 1.X with all flags staying `Source: extracted`. Downstream agents treat extracted-but-unconfirmed items as informational; QA-Author's by-us mode authors test cases only against confirmed items; SDLC dispatches that touch unconfirmed items first re-confirm them inline.
   - `[e] documentation-only`: set SRS header `Purpose: documentation` and `Status: In-Review` (note: Status DOES NOT flip to Signed-off — documentation-only SRSs are reference artifacts, not signed-off contracts). All flags stay `Source: extracted | Last-Confirmed: TBD`. **HALT after Phase 1.E.** Do NOT proceed to Phase 1.X common procedure or Phase 2 sign-off — those paths produce kit-governance side effects (header check expectations, OQ-gate enforcement, Last-Updated bumps that imply intent). Brownfield Stages 5–6 are SKIPPED. The output is reference documentation, period. Future Path A SDLC dispatches against this SRS will be refused by the Orchestrator until `Purpose:` flips to `governance` via an explicit re-promotion (`.claude/rules/brownfield-onboarding.md` § Documentation-only sub-case → Promoting from documentation to governance later).

E8a. **Do not enshrine accidents.** Where Stage 1b returned `accidental`, or Stage 1c observed zero traffic over a representative window, do NOT write the behavior up as a requirement. Record it as a deprecation candidate with its evidence so Stage 4 can Reject it, and carry the evidence into the confirmation set. Extraction that faithfully documents residue makes the residue harder to remove — the document starts defending it.

E9. **Inline-don't-link (self-containment).** Walk the derived SRS body + per-US/per-FR files for body-content references back to `docs/archaeology-reports/<slug>.md` or the codebase (`see services/X/handler.go`, `refer to docs/archaeology-reports/...`). The archaeology report is preserved as an audit-trail artifact but is NOT consumed by downstream agents — they read kit artifacts only. Replace substantive back-references with inlined content from the archaeology + code observation; raise OQs for gaps. Self-containment per CLAUDE.md §10.

E10. Proceed to Phase 1.X common procedure (governance paths [a]–[d] only), then signal the Orchestrator that Stage 3.5 extraction validation is the next dispatch. The documentation-only path [e] halts at the end of E8 — but Stage 3.5 still runs against its output before the artifacts are handed to anyone as reference documentation.

**Scoped dispatch.** Mode E accepts a `scope:` dispatch parameter to narrow output:

- `scope: api-contracts` — produce only `docs/frs/<FR-ID>.md` files (no USes, no §3.2 index). Useful for API-consumer documentation use cases.
- `scope: user-stories` — produce only `docs/user-stories/<US-ID>.md` files + §3.2 index (no FRs). Useful when capabilities matter more than operations.
- `scope: security-compliance` — produce only SRS §4.1 + §6 + relevant cross-cutting (no per-US, no per-FR). Useful for compliance-audit documentation.
- `scope: <service-name>` — limit all output to the named service; ignore other parts of the monorepo. Useful when extraction is scoped to one slice.

Unscoped (the default) covers the entire archaeology report's surface. Scoped is recommended for documentation-only use cases where only a slice is needed; full SDLC governance always uses unscoped to keep the SRS complete.

**Hard rules specific to `reverse-engineer-from-code`:**

- **Stage 3.5 extraction validation runs before any human sees your output, and you do not self-certify.** You are the author; the Extraction Validator is the approver. Every other load-bearing artifact in this kit has that separation, and brownfield is where it was missing.
- **Stage 4 confirmation gate is NOT optional and CANNOT be auto-approved by any agent.** Like the design lifecycle's human confirmation step, this is a human-in-the-loop boundary. Skipping it means the kit silently encodes bad code as canonical requirements — worse than not adopting the kit at all. A `qualified` Stage 3.5 verdict is not a substitute: it certifies fidelity to the code, not correctness of the code.
- **User Stories are capability-level; FRs carry the mechanism.** One US per surface encodes today's implementation shape as tomorrow's requirement, and inflates the human gate past the point where anyone finishes it.
- **Every `inferred` item carries an `Intent-Trace:` from Stage 1b.** An untraced inference is a blocking Stage 3.5 finding that routes back to Stage 1b, not forward to a person. Never send a human a question that `git log -S` already answered.
- **`So that <Value>` is never extractable from code.** Mark every Description's value-clause with `TODO: <team-supplied value statement>` and tag the entry inferred. Do NOT fabricate value statements.
- **NRS numbers come from observation OR are explicitly `unknown — measure during pilot`.** Never invent thresholds.
- **HIGH-severity security issues from archaeology are blockers.** Phase 1.E halts before producing any SRS content over a codebase with known credential leaks / unaddressed CVEs / equivalent.
- **Frontend framework is extracted, not chosen by FE Dev.** Brownfield Mode E records the detected framework in the SRS header and per-surface/per-app rows. If code evidence conflicts, keep `Frontend-Framework: TBD` and surface the conflict at Stage 4; do not let FE Dev resolve it during implementation.
- **Backend track/framework are extracted, not chosen by BE Dev.** Brownfield Mode E records the detected backend track and framework in the SRS header and per-service rows. If code evidence conflicts, keep the affected backend header(s) as `TBD` and surface the conflict at Stage 4; do not let BE Dev resolve it during implementation.
- **API/message behavior is extracted from trace + contract evidence, not guessed.** Route/RPC/job trace rows, `docs/api-contracts/*`, and Message Broker / Consumer Logic are the source for FR schemas, sequence diagrams, retry/DLQ behavior, and side effects. Missing evidence is an OQ/extraction gap, never a place to improvise.
- **Extracted artifacts retain `Source: extracted` flag in their content forever**, even after Stage 4 confirmation flips to `Source: confirmed`. The history is preserved via `Source: confirmed (originally extracted YYYY-MM-DD)` so future readers can trace lineage.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
