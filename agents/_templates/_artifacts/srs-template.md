<!--
SRS Template — canonical structure for `docs/SRS.md`

This file serves two purposes:

1. **Reference for human authors.** Copy this to `docs/SRS.md` at project start and fill in;
   sections marked `[TODO: ...]` are mandatory; `<EXAMPLE>` blocks are illustrative only.
2. **Validation baseline for BA's Phase 1.** BA compares incoming SRSs against this template's
   section structure as a first-step structural conformance check, before running the semantic
   ingestion checklist at `srs-ingestion-checklist.md`.

The required-fields list lives in `srs-ingestion-checklist.md` — that's the single source of
truth. This template renders the same requirements as a fillable document.

Replace this entire HTML comment block before signing off the SRS.
-->

# [Project Name]: [Feature Title]

**Version:** 1.0
**Domain:** [e.g., Game Publishing, Game Dev, Webshop, Account/Passport, …]
**Author:** [Name + role]
**Status:** Draft <!-- Draft | In-Review | Ready-for-Sign-off | Source-Validated | Signed-off. BA caps at Ready-for-Sign-off; srs-source-validator flips to Source-Validated; srs-feasibility-validator flips to Signed-off (two-gate model per CLAUDE.md §2 + §10). -->
**Last-Updated:** <ISO-8601>
**Signed-off-by:** <!-- srs-feasibility-validator (the second sign-off gate; sole writer of this field). BA cannot self-sign-off; srs-source-validator does not write this field (it transitions to Source-Validated only). Set automatically when feasibility verdict is qualified. -->
**Designated Design Approver:** TBD <!-- name | TBD; required for UI-bearing SRSs before any UI/UX Designer dispatch -->
**Design-Flow:** TBD <!-- A: Figma URL provided in requirements (map-mode qualifies pre-sign-off) | B: no Figma, agent designs fully post-sign-off | C: no Figma, agent designs + human modifies in Figma | N/A: no UI surface. Set by BA Phase 1.X step 10. -->
**Design-Guideline:** TBD <!-- preset slug from .claude/skills/design-system-author/references/presets/ (e.g., modern-saas-admin, ios-consumer) | none (Designer authors Foundation from SKILL.md defaults) | N/A (no UI surface). Set by BA Phase 1.X step 10 alongside Design-Flow. Foundation tokens consumed downstream by UI/UX Designer (Foundation page), FE Dev (docs/uiux/refs/<task-id>.md), QA-Author (docs/uiux/visual-specs/<task-id>.md). -->
**Frontend-Framework:** TBD <!-- React Native | ReactJS | Flutter | Vue.js | Angular | Next.js | multiple (see §3.4.2 and §3.4.5 per-surface/per-app rows) | N/A (no frontend). Greenfield/authored SRSs must declare the choice before sign-off; brownfield Mode E derives it from code evidence and records extracted confidence in §3.4.2 / §3.4.5. FE Dev uses this to select .claude/skills/fe-framework-coding-standard/references/<framework>.md. -->
**Backend-Track:** TBD <!-- backend-web | backend-service | multiple (see §3.4.5 per-service rows) | N/A (no backend). backend-web = HTTP/BFF/web-facing API; backend-service = microservice, worker, scheduler, event consumer, gRPC/internal domain service. Greenfield/authored SRSs must declare the backend role before sign-off; brownfield Mode E derives it from code evidence. BE Dev uses this with Backend-Framework to select .claude/skills/be-framework-coding-standard guidance. -->
**Backend-Framework:** TBD <!-- TypeScript with Express | TypeScript with NestJS | Python with FastAPI | Java with Spring Boot | .NET Core C# | Pure Golang | Java Core | Golang with Gin | Golang with Fiber | Golang with Echo | Golang with Kratos | multiple (see §3.4.5 per-service rows) | N/A (no backend). Greenfield/authored SRSs must declare the choice before sign-off; brownfield Mode E derives it from code evidence and records extracted confidence in §3.4.5. BE Dev treats source detection as drift check only. -->
**Designated Dependency Approver:** TBD <!-- name | TBD; required for any new third-party dependency choice -->
**Source:** inline <!-- inline | confluence://… | notion://… | jira-epic://… | sharepoint://… | extracted | requirements-folder ; where the upstream SRS content lives. `inline` = this file is the source of truth. Any external URL = BA materialized from there via Mode C ingestion. `extracted` = BA's Mode E reverse-engineered this SRS from code per brownfield-onboarding §12 Stage 3. `requirements-folder` = BA's Mode F synthesized this SRS from fragments in `docs/requirements/`; per-section `Synthesized-From:` annotations record provenance. -->
**Source-Last-Pulled:** <ISO-8601 or n/a> <!-- timestamp of last successful ingest from Source; n/a when Source = inline -->
**Source-Hash:** <hash or n/a> <!-- content hash of the external source at last pull; BA compares on re-ingest to detect drift. n/a when Source = inline. -->
**Purpose:** governance <!-- governance | documentation | hybrid . Default `governance` for greenfield + full brownfield onboarding. `documentation` for reference-only docs (brownfield Stages 1–3 only); blocks Path A SDLC dispatch. `hybrid` for documentation-purposed artifacts that may be promoted to governance later via explicit re-confirmation. See `.claude/rules/brownfield-onboarding.md` § Documentation-only sub-case. -->
**Workload-Tier:** aggressive <!-- aggressive | standard | conservative — see CLAUDE.md §13. Optional; defaults to `aggressive`. Override via `CLAUDE_WORKLOAD_TIER` env var per session, or this SRS header field per project. -->

---

## 1. [Executive Summary](#1-executive-summary)

[TODO: 3–5 sentences. What does this feature deliver, to whom, why now, and what's the visible-to-the-user difference once it ships?]

<!-- EXAMPLE
Spectator Live Match View lets non-playing users watch live PvP matches with under-1-second
state lag. Drives community engagement during scheduled tournaments — Q1 viewer-retention data
showed 40% drop-off due to >10s lag in the existing replay-style viewer. This feature replaces
that experience with a real-time pub/sub-driven stream. Visible difference: scheduled-tournament
matches gain a Spectate button on the lobby; tapping it loads the live view within 2 seconds.
EXAMPLE -->

---

## 2. [Business Requirements Document (BRD)](#2-business-requirements-document-brd)

[TODO: Business-level context — strategic intent, success metrics, scope boundaries, stakeholders, timeline. The "what business value and how we'll measure it."]

<!-- EXAMPLE

**Strategic intent.** Improve community engagement during hosted tournaments by enabling
real-time spectating. Tournaments are a top-3 driver of retention; viewer experience is
currently a known weak point.

**Success metrics (90 days post-launch):**
- Spectator session count per tournament ≥ 2× current replay viewers (baseline: Q1 figures)
- Spectator session median duration ≥ 8 minutes (baseline: <3 minutes for replay viewer)
- Tournament-window concurrent peak ≥ 50K spectators per match (capacity target)
- Match-state P95 latency < 1 second (technical target, drives the rest)

**In scope.** Web + iOS + Android spectator UI for scheduled-tournament matches; admin
toggles per match; opt-out for players; viewer count metrics.

**Out of scope (this SRS).** Spectator chat / reactions; ad insertion in spectator view;
spectator monetization; on-demand spectating outside scheduled tournaments.

**Stakeholders.**
- Product owner: <PM name>
- Engineering owner: <Eng lead name>
- Designated Design Approver: <name, see header>
- Designated Dependency Approver: <name, see header>
- Tournament Ops: stakeholder for admin toggles
- Legal: review for spectator-data residency (VN, CN, EU)

**Timeline.** MVP target: 6 weeks from SRS sign-off. Tournament-window pilot: 2 weeks
after MVP. GA across all scheduled tournaments: 4 weeks after pilot.

EXAMPLE -->

---

## 3. [Functional Requirements](#3-functional-requirements)

### 3.1. Domain Specification (DDD)

*This section prevents the agent from violating architectural boundaries.*

[TODO: Define the bounded context, aggregates, entities, value objects, and ubiquitous-language mapping for this feature. If this feature spans multiple bounded contexts, name them all and identify which is the **primary** context owning this SRS.]

* **Bounded Context:** `[Name of the service/domain]`
* **Aggregate Root:** `[The primary entity controlling this logic]`
* **Entities:**
  * `[Entity Name]`: [Unique identifier + description]
* **Value Objects:**
  * `[Object Name]`: [Attributes and immutability rules]
* **Ubiquitous Language Mapping** *(this replaces the kit's stand-alone Glossary section — domain terms live here, mapped to code/DB identifiers):*
  * `Business Term` → `Code/DB Variable Name`

<!-- EXAMPLE

* **Bounded Context:** `spectator`
* **Aggregate Root:** `MatchSpectatorSession` — uniquely identifies a viewer's connection to a live match
* **Entities:**
  * `MatchSpectatorSession`: `session_id` (UUIDv7); state machine (connecting → live → ended/disconnected)
  * `MatchPublicVisibility`: `match_id` + `tournament_id`; whether match is marked spectatable
* **Value Objects:**
  * `MatchStateSnapshot`: immutable record of match state at a timestamp; serialized for pub/sub
  * `ViewerCount`: monotonic integer + window timestamp; eventually-consistent across nodes
* **Ubiquitous Language Mapping:**
  * `Spectator` → `MatchSpectatorSession`
  * `Match` → `match_id` (FK to `matches` table)
  * `Tournament window` → `MatchPublicVisibility.window` (TSTZRANGE)
  * `Visible / Spectatable` → `MatchPublicVisibility.is_public` (bool, derived from window + admin toggle)
  * `Spectator count` → `ViewerCount.value` (integer; window-bucketed)

EXAMPLE -->

### 3.2. User Stories

*Per-US detail lives in [`docs/user-stories/<US-ID>.md`](../docs/user-stories/). This section is the **index** — one row per US. Each US file follows the schema in [`user-story-template.md`](./user-story-template.md). The split mirrors §3.3 FRS: SRS stays scannable as US count grows; agents load only the US file relevant to their task.*

*Per-row `Source` column convention (introduced for brownfield onboarding per `.claude/rules/brownfield-onboarding.md` §12):*

- `authored` — written upstream by PM/BA from intent (default for greenfield projects).
- `extracted` — derived from an existing codebase by BA Mode E. NOT yet human-confirmed; downstream agents treat as inferred-only.
- `confirmed` — was `extracted`, then confirmed by humans at brownfield Stage 4. Authoritative. Audit-trail format: `confirmed (originally extracted YYYY-MM-DD)`.
- `deprecated` — was `confirmed` or `authored`, then deprecated by a later iteration. Moves to §11 Deprecated User Stories; original row stays here struck-through for traceability.

[TODO: List each User Story with its ID, title, one-line Description, Role, priority, the FRs that operationalize it, and Status. Create a corresponding file at `docs/user-stories/<US-ID>.md` for each row.]

| ID | Title | Description (one-line) | Role | Priority | Linked FRs | Status | Source | Last-Confirmed |
|---|---|---|---|---|---|---|---|---|
| US-001 | … | As a … I want to … so that … | <role> | P0 (MVP) | FR-001, FR-002 | Draft | authored | n/a |
| US-002 | … | As a … I want to … so that … | <role> | P1 | FR-003 | Draft | authored | n/a |

<!-- EXAMPLE

| ID | Title | Description (one-line) | Role | Priority | Linked FRs | Status | Source | Last-Confirmed |
|---|---|---|---|---|---|---|---|---|
| US-001 | Spectator joins in-progress tournament match | As a spectator with an Account/Passport session, I want to join a live tournament match by tapping the Spectate button, so that I can watch real-time gameplay during the tournament window | viewer (auth) | P0 (MVP) | FR-001, FR-002 | Active | authored | n/a |
| US-002 | Tournament admin toggles match spectatability | As a Tournament Ops admin, I want to mark a match spectatable, so that controlled audiences can watch during the tournament window | tournament-admin | P0 (MVP) | FR-004 | Active | authored | n/a |
| US-003 | Spectator sees match-ended overlay | As a spectator, I want to see a clear match-ended state when the match concludes, so that I know to stop waiting for state updates | viewer | P1 | FR-003 | Draft | authored | n/a |

Each row's detail (Description, Pre-conditions, Main Flow, Business Rules, Post-conditions) lives in `docs/user-stories/US-NNN.md` per [`user-story-template.md`](./user-story-template.md).

EXAMPLE -->

### 3.3. Functional Requirement Specifications (FRS)

*Per-FR detail lives in [`docs/frs/<FR-ID>.md`](../docs/frs/). This section is the **index** — one row per FR. Each FR file follows the schema in [`frs-template.md`](./frs-template.md). The split keeps the SRS scannable as the FR count grows; agents load only the FR file relevant to their task.*

[TODO: List each FR with its ID, title, priority, and which User Story it implements. Create a corresponding file at `docs/frs/<FR-ID>.md` for each row.]

| ID | Title | Priority | User Story | Status | Source | Last-Confirmed |
|---|---|---|---|---|---|---|
| FR-001 | … | P0 (MVP) | US-001 | Draft | authored | n/a |
| FR-002 | … | P0 (MVP) | US-001 | Draft | authored | n/a |

<!-- EXAMPLE

| ID | Title | Priority | User Story | Status | Source | Last-Confirmed |
|---|---|---|---|---|---|---|
| FR-001 | Join in-progress match | P0 (MVP) | US-001 | Active | authored | n/a |
| FR-002 | Spectator session disconnect on heartbeat loss | P0 (MVP) | US-001 | Active | authored | n/a |
| FR-003 | Match-ended overlay | P1 | US-003 | Draft | authored | n/a |
| FR-004 | Tournament admin toggle match spectatability | P0 (MVP) | US-002 | Active | authored | n/a |

Each row's detail (Description, Preconditions, Main Flow, Business Rules, Schemas, Error Handling, Sequence Diagram) lives in `docs/frs/FR-NNN.md` per [`frs-template.md`](./frs-template.md).

EXAMPLE -->

### 3.4. Technical Constraints & Interface

*Providing the exact "shape" of the data.*

**Per-FR schemas and error-handling rows live in each FR's file at `docs/frs/<FR-ID>.md`** (see the FR template's Input Schema / Output Schema / Error Handling sections). This SRS section captures only project-wide patterns that apply across FRs.

[TODO: Add only project-wide patterns. If every FR has its own schemas and there's no cross-cutting envelope, this sub-section can be a single sentence referencing `docs/frs/`.]

**Project-wide error envelope** (when standardized across all FRs):

#### 3.4.1 Design References

*Required when the feature has a UI surface.* Lists every UI surface, platform(s), Figma reference, and whether visual fidelity is critical. `Figma File` and `Figma Node ID` cells **may be empty at sign-off** — the UI/UX Designer fills them in post-sign-off via the design lifecycle (or PRE-sign-off via `map` mode for Design-Flow A).

##### Figma source headers (required when any Figma URL is recorded)

A Figma FILE has multiple PAGES (tabs at the top of the file). Different pages hold different content — brainstorms, old designs, the project's design, the design-system Foundation, etc. The kit MUST scope every Figma read to ONE specific page per Figma file. Without page-scoping, the UI/UX Designer's `extract` and `map` modes would walk every page (mixing in irrelevant frames); FE Dev's design contract would record cross-page Node IDs; QA-Author's testIDs would drift across pages.

Two paired header fields below the SRS preamble (one row per Figma source if multiple files are involved):

```
Figma-File-URL:                <full URL with ?node-id= preserved>
Figma-Design-Page-Node-ID:     <Node ID of the PAGE containing the project's design — NOT a frame>
Figma-File-Version:            <version-id captured at extract / map time; immutable per SRS version>
```

Rules:
- `Figma-Design-Page-Node-ID` is the Node ID of the PAGE node (Figma top-level tab), NOT a frame or section. Frames live UNDER a page; the page is the root of the subtree the kit's Figma-reading operations enumerate.
- When the PM-supplied Figma URL contains `?node-id=<X>` and `X` is a PAGE node → BA captures `X` as `Figma-Design-Page-Node-ID`.
- When `X` is a FRAME or SECTION node (PM deep-linked to a specific frame) → the UI/UX Designer (in `extract` or `map` mode) walks UP the tree to find the containing page, records the resolution in the mapping/extract artifact, and updates `Figma-Design-Page-Node-ID` in this SRS field.
- When the PM URL has NO `?node-id=` → BA Phase 1.X step 10 halts with `NEEDS_CONTEXT` asking the operator to name the design page; the value lands here.
- Multiple Figma files (e.g., separate Marketing + Admin Figma files) → list paired URL + page-node-id rows, one pair per file.

[TODO: Required if any User Story has a UI surface. Omit the sub-section if not.]

<!-- EXAMPLE

Figma-File-URL:                https://figma.com/file/abc123/Project-Design?node-id=12%3A0
Figma-Design-Page-Node-ID:     12:0
Figma-File-Version:            2026-06-05-v3

| Req ID | Surface | Platform | Figma File | Figma Node ID (frame within design page) | Visual-Critical |
|---|---|---|---|---|---|
| US-001 | Spectator Live Match View | Web, iOS, Android | abc123 | 530:2 | yes |
| US-002 | Match-Ended Overlay | Web, iOS, Android | abc123 | 530:14 | no |

The `Figma Node ID` column above pins frames within page `12:0`. Every Node ID in this column MUST descend from `Figma-Design-Page-Node-ID`; cross-page references are a `figma-cross-page-reference` violation flagged by `figma-srs-mapping` skill.

EXAMPLE -->

#### 3.4.2 UI Introspection Profile

*Required when at least one surface has UI. Levels: `Full` | `Partial` | `None`. The `Framework / Renderer` value is also the per-surface framework source for FE Dev when the header `Frontend-Framework:` is `multiple`. Use canonical framework names when one of the kit-supported FE frameworks applies: `React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js`.*

[TODO: Required if Design References is present. Omit if not.]

<!-- EXAMPLE

| Surface | Framework / Renderer | Introspection Level | Notes |
|---|---|---|---|
| Spectator Live Match View (Web) | Next.js | Full | testIDs present per instrumentation contract |
| Spectator Live Match View (iOS) | React Native | Full | testIDs present per instrumentation contract |
| Spectator Live Match View (Android) | React Native | Full | testIDs present per instrumentation contract |

EXAMPLE -->

#### 3.4.3 Acceptance of Non-Introspectable Surfaces

*Required when the UI Introspection Profile contains `Partial` or `None` rows.*

[TODO: Required only if Partial/None appears in §3.4.2.]

<!-- EXAMPLE

| Surface | Reason | Accepted by | Date | Mitigation |
|---|---|---|---|---|
| Spectator Live Match View (iOS) | React Native native bridge limits full structural read for this surface | <Designated Design Approver> | <ISO-8601> | Tier 3 visual diff added for iOS surface; pixel-template registry maintained for non-introspectable elements |

EXAMPLE -->

#### 3.4.4 API Contract Format

*Required when the project exposes any API (HTTP REST / gRPC / GraphQL / async messaging contracts). Declares the format BE Dev MUST use when publishing contracts under `docs/api-contracts/`. Defaults are documented per API style; deviation from default requires an ADR reference in the Justification column. If the project has zero APIs, write `N/A — no API surface in this project`.*

[TODO: Required when project has APIs. One row per API style present in the project; omit rows for styles not in use.]

| API style | Declared format | Default? | Justification (required for non-default) |
|---|---|---|---|
| REST (sync HTTP) | `openapi-3.1` | yes | (default — no justification needed) |
| gRPC | `proto3` | yes | (default — no justification needed) |
| GraphQL | `graphql-sdl` | yes | (default — no justification needed) |
| Async messaging (Kafka / RabbitMQ / etc.) | `asyncapi-2.x` OR `markdown` | yes for asyncapi; deviation for markdown | (ADR ref required for markdown) |
| Internal-only documentation contract | `markdown` | NO — markdown is legacy/prototype only | (ADR ref required) |

<!-- EXAMPLE — REST + gRPC mixed project

| API style | Declared format | Default? | Justification (required for non-default) |
|---|---|---|---|
| REST (public BFF for web/mobile clients) | openapi-3.1 | yes | — |
| gRPC (internal service-to-service: spectator-service ↔ match-host) | proto3 | yes | — |
| Async events (Kafka: SpectatorSessionStarted / Ended) | asyncapi-2.x | yes | — |

EXAMPLE -->

**Why this section exists.** Before this declaration, every BE Dev task picked a contract format locally — leading to a project that mixed `users.openapi.yaml`, `orders.md`, and `payments.proto` with no consistency rationale. The api-contract-author skill reads this declaration; BE Dev's task specialization carries it forward; downstream tooling (codegen / contract testing / FE consumption) can rely on the declared format per API style. Markdown contracts are legacy/prototype-only — every other format has tooling that catches drift.

**Default rationale:** OpenAPI 3.1+ for REST is the industry standard with mature tooling (Spectral lint, openapi-typescript codegen, mock servers, Swagger UI). proto3 for gRPC and graphql-sdl for GraphQL are the canonical IDLs for those styles — no alternatives. asyncapi-2.x for async messaging gives the same tooling benefits OpenAPI gives REST. Markdown is human-readable but skips machine validation, drift catches, codegen, and FE schema-typing — acceptable only as legacy/prototype scaffolding with an explicit ADR documenting the trade-off.

---

#### 3.4.5 Source Layout

*Declares where shipping application source code lives. The kit fixes two top-level source roots: `frontend/` (all FE Dev source) and `backend/` (all BE Dev source). This section names the roots and, when a tier has more than one app/service, the one sub-directory per app/service beneath its root. Frontend rows name the framework so FE Dev can map a task path to the correct coding standard when `Frontend-Framework: multiple`. Backend rows name both backend track and backend framework so BE Dev can distinguish backend-web from backend-service work and select the correct coding standard when `Backend-Track:` or `Backend-Framework:` is `multiple`. Required for every project that ships any FE or BE code. The `source-code-write-guard.cjs` hook reads this declaration and refuses any source write whose worktree-relative path does not fall under a declared root. Test code (`e2e/`, `integration_test/`, `.maestro/`, platform UITest dirs) is QA-owned and lives outside these roots — it is not governed here.*

```
Frontend root: frontend/
Backend root: backend/
```

[TODO: Fill the sub-directory table. SINGLE app/service per tier -> source goes directly under the root (`frontend/src/**`, `backend/src/**`) and the table has one row with sub-directory `(root)`. MULTIPLE apps/services per tier -> one sub-directory per app/service (`frontend/<app-slug>/**`, `backend/<service-slug>/**`); slugs mirror the SA's `docs/architecture.md` C4 container names. If a tier has no source (e.g. backend-only project with no FE), write `N/A -- no frontend in this project` for that root and omit its rows.]

| Tier | Sub-directory | App / service (architecture.md container) | Framework / Runtime | Backend Track | SDLC Track |
|---|---|---|---|---|---|
| frontend | `frontend/` (root -- single app) | Web App | Next.js | N/A | fe |
| backend | `backend/` (root -- single service) | API Service | TypeScript with NestJS | backend-web | be |

<!-- EXAMPLE -- multi-app / multi-service project

Frontend root: frontend/
Backend root: backend/

| Tier | Sub-directory | App / service (architecture.md container) | Framework / Runtime | Backend Track | SDLC Track |
|---|---|---|---|---|---|
| frontend | `frontend/web/` | Web Storefront | Next.js | N/A | fe |
| frontend | `frontend/admin/` | Admin Console | ReactJS | N/A | fe |
| backend | `backend/api/` | Public BFF | TypeScript with NestJS | backend-web | be |
| backend | `backend/spectator-service/` | Spectator Service | Golang with Kratos | backend-service | be |
| backend | `backend/match-host/` | Match Host | Pure Golang | backend-service | be |

EXAMPLE -->

**Why this section exists.** Before this declaration the kit named no canonical source root -- agent templates said only "frontend code paths" / "backend code paths," so FE and BE source could land anywhere with a `/src/` segment (`web/src`, `server/src`, `app/`, etc.), making the tree's frontend/backend boundary implicit and unenforceable. Fixing `frontend/` and `backend/` as the two roots gives the hook a machine-checkable boundary, keeps multi-app/multi-service repos organized by tier, and makes "which tier owns this file" answerable from the path alone.

**Extra roots (monorepo shared code).** Source that is genuinely neither FE nor BE (shared libraries, codegen output consumed by both tiers) may declare an additional root row with tier `shared` (e.g. `packages/`). Operators can also pass extra roots at runtime via `CLAUDE_SOURCE_CODE_DIRS` (comma-separated top-level prefixes). Prefer a small, deliberate set -- the point of the gate is to keep the tree's structure legible.

---

### 3.5. External Integrations

*Index of every external system the product calls, receives from, or depends on at runtime — including in-org defaults (Account/Passport, Kafka, internal queues), managed cloud services (Redis, MySQL, S3, payment processors), and third-party APIs. One row per external system. Per-system interface detail lives in [`docs/external-integrations/<system-slug>.md`](../docs/external-integrations/) per [`external-integration-template.md`](./external-integration-template.md).*

*Coverage is **strict**: every external system gets a row, even those covered by `.claude/skills/solution-defaults/`. Solution-defaults is a pre-fill aid, not a substitute. SRS sign-off blocks until every row has `Adequacy: adequate` (CLAUDE.md §10 hard rule). BA creates placeholder rows during Phase 1 identification; SA fills per-system detail during the `external-integration-adequacy` dispatch and is the only agent permitted to flip Adequacy to `adequate`.*

[TODO: One row per external system. Required for every SRS; if the product genuinely touches no external systems, write a single row stating `none — self-contained product` with `Adequacy: adequate` to satisfy the gate.]

| System | Type | Linked US/FRs | Adequacy | File |
|---|---|---|---|---|
| [Account/Passport] | in-org | US-NNN, FR-NNN | inadequate | docs/external-integrations/passport.md |
| [Kafka] | in-org | FR-NNN | inadequate | docs/external-integrations/kafka.md |

<!-- EXAMPLE — Spectator feature

| System | Type | Linked US/FRs | Adequacy | File |
|---|---|---|---|---|
| Account/Passport | in-org | US-001, US-002, FR-001 | adequate | docs/external-integrations/passport.md |
| Kafka | in-org | FR-001, FR-002 (SpectatorSessionStarted, SpectatorSessionEnded events) | adequate | docs/external-integrations/kafka.md |
| Match Host | in-org | FR-001 (subscribe to match-state stream) | adequate | docs/external-integrations/match-host.md |
| Redis Cluster (managed) | managed-cloud | FR-001, FR-002 (pub/sub channel + session store) | adequate | docs/external-integrations/redis.md |

EXAMPLE -->

---

## 4. [Non-Functional Requirements (NRS)](#4-non-functional-requirements-nrs)

[TODO: Performance, scalability, availability, reliability, observability — anything that's a requirement but not a function. Include explicit numbers (P95, throughput, uptime); subjective adjectives like "fast" or "scalable" are not requirements.]

<!-- EXAMPLE

### Performance & Scale

- **Latency:** Match-state propagation P95 < 1000ms; P99 < 2000ms (measured: host server → spectator client receipt).
- **Throughput:** Sustain 50,000 concurrent spectators per match across all regions.
- **Burst tolerance:** Handle 10K join requests within a 30-second window (typical at scheduled-tournament start).

### Availability

- **Spectator API uptime:** 99.5% during tournament windows (measured per-window); 99.0% outside windows.
- **Failure mode:** When pub/sub is degraded, the spectator view falls back to polling at 5-second intervals; client UI shows a "degraded latency" indicator.

### Observability

- All FRS-listed endpoints emit `spectator.join.success` / `spectator.join.failure` metrics.
- `SpectatorSessionStarted` and `SpectatorSessionEnded` events are queryable in the analytics pipeline within 5 minutes.

EXAMPLE -->

### 4.1 Security & Compliance

*Required when the feature involves any of: authentication, authorization, payments, PII, account data, public endpoints, third-party integrations. See `.claude/skills/security-compliance-checklist/` for the full per-category checklist.*

[TODO: Add this sub-section only if at least one trigger category applies. Use the sub-sub-sections below; remove categories that do not apply.]

<!-- EXAMPLE — Spectator feature triggers: authentication, account data, public endpoints, third-party

#### 4.1.1 Authentication
- Mechanism: Account/Passport per `.claude/skills/solution-defaults/`.
- Anonymous viewing: forbidden in CN region; permitted elsewhere per OQ-001 resolution.
- Token rotation: standard Account/Passport policy.

#### 4.1.2 Authorization
- See §5 (User Roles & Permissions) for the role matrix.
- Admin toggle (mark match spectatable) restricted to `tournament-admin` role; audited per §6.

#### 4.1.3 Account Data
- Collected: viewer ID, join timestamp, match ID, region, client metadata.
- Retention: viewer-list 30 days post-match; aggregated counts indefinitely.
- Cross-account leak protection: viewer's join history private to themselves; aggregate counts public.

#### 4.1.4 Public Endpoints
- `GET /spectate/{match_id}` reachable per OQ-001 resolution.
- Rate limit: 100 req/min per IP; 1000 req/min per Account/Passport user.
- CORS: same-origin.

#### 4.1.5 Third-Party Integrations
- Real-time pub/sub: per ADR-0012 (Redis Cluster, approved by Viet Phan).
- No additional new third-party services in this SRS; see ADR-0012 for the dependency rationale.

#### 4.1.6 Threats Considered
- Credential stuffing on spectator endpoint: rate-limit + IP heuristics.
- Spectator scraping of in-progress state for unfair advantage in concurrent matches: 2-second broadcast delay for non-tournament matches.
- DDoS via public spectator endpoint: Cloudflare-tier protection in front of all public paths.

#### 4.1.7 Regional
- **Vietnam:** Viewer data stored in VN region per Vietnam Cybersecurity Law.
- **China:** Anonymous viewing forbidden per PIPL (real-name verification required); all CN spectators authenticated.
- **EU/UK:** GDPR lawful basis = consent at Account/Passport sign-up; no additional consent needed.

EXAMPLE -->

---

## 5. [User Roles & Permissions](#5-user-roles--permissions)

[TODO: Role matrix — which roles can perform which actions on which resources. Include the default role for new users.]

<!-- EXAMPLE

| Role | Permissions | Default |
|---|---|---|
| `viewer` (anonymous, where region permits) | Can view spectatable matches; cannot interact | yes — for unauthenticated users in non-CN regions |
| `viewer` (authenticated, via Account/Passport) | Can view spectatable matches; viewer count attributed to account | yes — for any authenticated user |
| `tournament-admin` | All viewer perms + toggle match spectatability + view spectator analytics | no — granted by Tournament Ops |
| `player` | Standard player role; can opt-out of being spectated | inherited from Account/Passport profile |

**Privilege escalation:** `tournament-admin` can only be granted by Tournament Ops via the admin console; audit-logged per §6.

**Cross-tenant isolation:** Spectator data partitioned per match; no cross-match visibility.

EXAMPLE -->

---

## 6. [User Activity Logging & Tracking Specification](#6-user-activity-logging--tracking-specification)

[TODO: What user actions are logged, where, with what retention, accessible to whom. Distinguish: (a) audit logs (compliance / security review), (b) operational logs (debugging), (c) product analytics (engagement metrics).]

<!-- EXAMPLE

### Audit Logs (compliance / security review)

| Action | Fields | Retention | Access |
|---|---|---|---|
| Spectator session start | `account_id`, `match_id`, `timestamp`, `region`, `client_meta` | 7 years (regulatory) | DPO, Tournament Ops Audit |
| Tournament-admin toggle match spectatability | `admin_account_id`, `match_id`, `previous_state`, `new_state`, `timestamp` | 7 years | DPO, Eng Lead |
| Spectator opt-out by player | `player_account_id`, `timestamp`, `scope` (per-match / global) | 7 years | DPO, Player |

### Operational Logs (debugging)

- Spectator service logs every join request with structured JSON; retained 30 days in Loki.
- Redis Cluster pub/sub errors logged with correlation ID linking to the spectator session.
- No PII in operational logs (account IDs only; never email / display name).

### Product Analytics (engagement)

- `spectator.join`, `spectator.duration`, `spectator.viewer_count` events emitted to the analytics pipeline.
- Aggregated daily; retained per the analytics pipeline's standard (90 days raw, indefinite aggregated).

EXAMPLE -->

---

## 7. [Definition of Done (DoD)](#7-definition-of-done-dod)

*The coding agent uses this to verify its own work.*

[TODO: Concrete, checkable items the implementing agent (Dev) verifies before proposing `ready-for-deploy`. Maps to per-task DoD in `docs/plan/phase-NN/tasks/T-NNN.md`.]

* [ ] Unit tests cover 100% of the Business Rules listed in each FRS.
* [ ] Integration tests confirm state transitions in the DB.
* [ ] Log outputs follow the project's structured-logging format.
* [ ] No new external dependencies added (or, if added, approved per `.claude/skills/third-party-dependency-evaluation/` and recorded in `docs/decisions/`).
* [ ] All endpoints in §3.4 emit the metrics declared in §4 Observability.
* [ ] All audit-log entries declared in §6 are emitted for the matching actions.
* [ ] Error handling matches §3.4 Error Handling Table exactly (status code + error code).
* [ ] For UI-bearing FRS: structural test cases derived from `docs/uiux/visual-specs/<task-id>.md` pass per `.claude/skills/test-case-author/`.

<!-- EXAMPLE — Spectator feature

* [ ] Unit tests cover the 4 invariants in FRS-SPECTATOR-001 Business Rules.
* [ ] Integration test confirms `MatchSpectatorSession` state machine (connecting → live → disconnected).
* [ ] Spectator API emits `spectator.join.success` / `.failure` metrics; verified via Prometheus query.
* [ ] `SpectatorSessionStarted` event lands in Kafka `spectator-events` within 1 second of session activation.
* [ ] Web + iOS + Android UI implementations pass tier 1 + tier 2 visual spec validation.
* [ ] Regional flag enforcement: CN-region anonymous join returns 401 with `ERR_AUTH_REQUIRED_REGIONAL`.

EXAMPLE -->

---

## 8. [Open Questions & Clarifications](#8-open-questions--clarifications)

*Items that are ambiguous, unclear, or missing from the original request. These must be resolved before sign-off. Status remains `In-Review` while any OQ is open.*

[TODO: Numbered OQs. Each OQ describes the question, who needs to resolve it, and suggested options where possible. When resolved, move the entry to §9 Resolved Questions and update Status if the OQ was the last one.]

<!-- EXAMPLE

8.1 **Spectator authentication:** Is anonymous spectating permitted for non-CN regions, or must all spectators authenticate via Account/Passport? Tournament Ops wants anonymous for casual discovery; Security flagged the abuse vector.
   - Required to resolve: PM decision on auth policy; Security review of abuse mitigations if anonymous is permitted.
   - Suggested options:
     - [a] Always require Account/Passport
     - [b] Anonymous viewing with rate-limit + IP heuristics; auth required for interactions (out of scope this SRS)
     - [c] Anonymous viewing during scheduled-tournament windows only

8.2 **Stream cost at scale:** Will pub/sub costs at 50K concurrent / match × ~20 matches / tournament fit our infrastructure budget?
   - Required to resolve: Eng review of Redis Cluster capacity + cost projection vs target throughput.

EXAMPLE -->

---

## 9. [Resolved Questions](#9-resolved-questions)

*Append-only history of OQs that have been resolved. Never edit prior entries. Move OQ entries here from §8 when the user picks an option (typically via the `oq-resolver` agent flow). Reset Status to `Signed-off` once §8 is empty.*

[TODO: Empty until OQs are resolved.]

<!-- EXAMPLE

8.1 **Spectator authentication** → Resolved 2026-05-13 by Viet Phan.
   - Chosen: option [c] — anonymous viewing during scheduled-tournament windows only.
   - Rationale: balances community-discovery goal with controlled abuse exposure.
   - SRS impact: §4.1.1 Authentication and §5 viewer-role default updated.

EXAMPLE -->

---

## 11. [Deprecated User Stories](#11-deprecated-user-stories)

*Append-only graveyard for User Stories that were once in §3.2 but have been removed in a later SRS version. Never delete; preserve for history. Each row carries the version in which it was deprecated; per-US files at `docs/user-stories/<US-ID>.md` get `Status: Deprecated` and a `## Deprecation Note` section explaining why.*

[TODO: Empty for first-version SRSs. Populated by BA Phase 4 during iteration when a US-ID is removed.]

<!-- EXAMPLE

| ID | Title | Deprecated-In | Reason | Replacement |
|---|---|---|---|---|
| US-014 | Spectator pre-roll ad | v1.1 | Removed per PM decision after Q1 review; ad-revenue strategy moved to in-stream | N/A |

Per-US file `docs/user-stories/US-014.md` carries `Status: Deprecated` in its frontmatter and an explanation under `## Deprecation Note` in the file body.

EXAMPLE -->

---

## 12. [Deprecated FRS](#12-deprecated-frs)

*Same pattern as §11, but for FR-IDs removed from §3.3. The per-FR file at `docs/frs/<FR-ID>.md` carries `Status: Deprecated` and a `## Deprecation Note`.*

[TODO: Empty for first-version SRSs. Populated by BA Phase 4 during iteration when an FR-ID is removed.]

<!-- EXAMPLE

| ID | Title | Deprecated-In | Reason | Replacement |
|---|---|---|---|---|
| FR-019 | POST /ads/preroll endpoint | v1.1 | Endpoint removed per US-014 deprecation | N/A |

EXAMPLE -->

---

## 10. [Changelog](#10-changelog)

*Append-only record of changes to this SRS. Scope or AC changes revert Status to `Draft` and restart the sign-off protocol. Typo / wording fixes log here without reverting Status.*

[TODO: Record changes as they happen.]

<!-- EXAMPLE

| Date | Change | By |
|---|---|---|
| 2026-05-10 | Initial draft | PM |
| 2026-05-11 | Added US-002 (Match-Ended Overlay) per ops team feedback | PM |
| 2026-05-12 | BA Phase 1 ingestion: added §4.1 Security & Compliance, §3.4.1-3.4.3 UI sections, populated §8 OQs | BA |
| 2026-05-13 | OQ-8.1 resolved → §9; Status: In-Review → Signed-off | BA |

EXAMPLE -->
