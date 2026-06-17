# SRS Ingestion Checklist

Run this against any incoming SRS before sign-off. The SRS may have been authored by an upstream workflow with a
different template. BA's job is to ensure the SRS satisfies this checklist by adding missing sections, re-using
existing content where it covers a checklist item under a different name, or raising Open Questions where content is
insufficient.

## Companion: SRS Template

BA uses this checklist together with [`srs-template.md`](./srs-template.md). The template renders the same requirements as a fillable document; this checklist is the per-field verification view. Two views of the same canonical structure:

- **Template** (`srs-template.md`) — what a conformant SRS looks like as a document. Used by humans to author SRSs and by BA as the structural baseline for the Phase 1 conformance check.
- **Checklist** (this file) — per-field verification rules, augmentation structures, and content quality bars. Used by BA during Phase 1 + Phase 2 ingestion.

If the two ever drift, the checklist wins (it's the authoritative source for required content); update the template to match.

## Required Header

- [ ] `# [Project Name]: [Feature Title]` H1 title
- [ ] `Version:` field present
- [ ] `Domain:` field (e.g., Game Publishing, Webshop, Account/Passport, …)
- [ ] `Author:` field (human name + role)
- [ ] `Status:` field (values: `Draft` | `In-Review` | `Ready-for-Sign-off` | `Source-Validated` | `Signed-off`). **Two-gate sign-off:** BA flips up to `Ready-for-Sign-off`; `srs-source-validator` flips to `Source-Validated`; `srs-feasibility-validator` flips to `Signed-off` (CLAUDE.md §2 + §10).
- [ ] `Last-Updated:` ISO-8601 timestamp
- [ ] `Signed-off-by:` field (empty at BA Phase 2 + Source-Validated; populated by `srs-feasibility-validator` when its verdict is `qualified` — value is `srs-feasibility-validator`).
- [ ] `Designated Design Approver:` field (values: `<name>` | `TBD`)
- [ ] `Frontend-Framework:` field (values: `React Native` | `ReactJS` | `Flutter` | `Vue.js` | `Angular` | `Next.js` | `multiple` | `N/A`)
- [ ] `Backend-Track:` field (values: `backend-web` | `backend-service` | `multiple` | `N/A`)
- [ ] `Backend-Framework:` field (values: `TypeScript with Express` | `TypeScript with NestJS` | `Python with FastAPI` | `Java with Spring Boot` | `.NET Core C#` | `Pure Golang` | `Java Core` | `Golang with Gin` | `Golang with Fiber` | `Golang with Echo` | `Golang with Kratos` | `multiple` | `N/A`)
- [ ] `Designated Dependency Approver:` field (values: `<name>` | `TBD`)

If absent → BA adds them. Initial Status = `In-Review`.

## Required Content Sections

Each numbered section below must be **present and substantive**. "Substantive" means QA-Exec, SA, or TL could act on it without asking the BA. Where a section's required content depends on whether the feature has a UI surface or triggers a security/compliance category, those conditions are noted.

### Always required

- [ ] `## 1. Executive Summary` — 3–5 sentences on what, who, why-now, visible-difference.
- [ ] `## 2. Business Requirements Document (BRD)` — strategic intent, success metrics, scope boundaries, stakeholders, timeline.
- [ ] `## 3. Functional Requirements` — see sub-sections below.
- [ ] `## 4. Non-Functional Requirements (NRS)` — performance, scale, availability, reliability, observability (with explicit numbers, not adjectives).
- [ ] `## 5. User Roles & Permissions` — role matrix; default role; privilege escalation path; cross-tenant isolation.
- [ ] `## 6. User Activity Logging & Tracking Specification` — audit logs / operational logs / product analytics (each with fields, retention, access).
- [ ] `## 7. Definition of Done (DoD)` — concrete, checkable items the Dev verifies before proposing `ready-for-deploy`.
- [ ] `## 8. Open Questions & Clarifications` — numbered OQs; may be empty.
- [ ] `## 9. Resolved Questions` — append-only history; may be empty.
- [ ] `## 10. Changelog` — append-only record of SRS changes.

### Required sub-sections under §3 Functional Requirements

- [ ] `### 3.1. Domain Specification (DDD)` — Bounded Context, Aggregate Root, Entities, Value Objects, Ubiquitous Language Mapping (replaces stand-alone Glossary).
- [ ] `### 3.2. User Stories` — index table only (one row per US with ID, Title, Description-one-line, Role, Priority, Linked FRs, Status). **Per-US detail must exist at `docs/user-stories/<US-ID>.md`** per [`user-story-template.md`](./user-story-template.md). BA verifies: every index row has a corresponding file, and every file has a corresponding index row (orphans in either direction raise OQs).
- [ ] `### 3.3. Functional Requirement Specifications (FRS)` — index table only (one row per FR with ID, Title, Priority, User Story, Status). **Per-FR detail must exist at `docs/frs/<FR-ID>.md`** per [`frs-template.md`](./frs-template.md). BA verifies: every index row has a corresponding file, and every file has a corresponding index row (orphans in either direction raise OQs).
- [ ] `### 3.4. Technical Constraints & Interface` — project-wide error envelope (if standardized). **Per-FR Input/Output schemas and Error Handling rows live in `docs/frs/<FR-ID>.md`**, not in this section.
- [ ] `### 3.5. External Integrations` — index table only (one row per external system the product touches, including in-org defaults). **Per-system interface detail must exist at `docs/external-integrations/<system-slug>.md`** per [`external-integration-template.md`](./external-integration-template.md). BA verifies: every index row has a corresponding file, every file has a corresponding index row, and SA has flipped every file's `Adequacy:` to `adequate` before BA signs off (CLAUDE.md §10 strict gate).

### Conditional sub-sections under §3.4 (UI-bearing SRSs only)

If at least one User Story has a UI surface:

- [ ] `#### 3.4.1 Design References` — table present, one row per UI surface. `Figma File` and `Figma Node ID` cells may be empty at sign-off; the UI/UX Designer fills them in post-sign-off.
- [ ] `#### 3.4.2 UI Introspection Profile` — Levels: Full | Partial | None per surface; `Framework / Renderer` uses the same canonical frontend framework names as `Frontend-Framework:` when one of the supported frameworks applies.
- [ ] `#### 3.4.3 Acceptance of Non-Introspectable Surfaces` — required only if §3.4.2 contains Partial or None rows.

#### Conditional sub-section under §3.4 (any project with APIs)

- [ ] `#### 3.4.4 API Contract Format` — declares format per API style (REST / gRPC / GraphQL / async messaging). Required when project exposes any API. Defaults: openapi-3.1 (REST), proto3 (gRPC), graphql-sdl (GraphQL), asyncapi-2.x (messaging). Deviations require ADR reference. Markdown is legacy/prototype only — also ADR-required.
- [ ] `#### 3.4.5 Source Layout` — declares the two fixed source roots (`frontend/`, `backend/`) and one sub-directory per app/service when a tier has more than one. Required for any project that ships FE or BE code. Single app/service per tier → source under the root directly; multiple → `frontend/<app-slug>/`, `backend/<service-slug>/` (slugs mirror architecture.md C4 containers). Frontend rows include `Framework / Runtime` so FE Dev can choose the matching skill reference when `Frontend-Framework: multiple`. Backend rows include `Framework / Runtime` and `Backend Track` so BE Dev can choose the matching skill reference when `Backend-Framework:` or `Backend-Track:` is `multiple`. The `source-code-write-guard.cjs` hook reads this and blocks source writes outside the declared roots.

**Downstream note (for BA's awareness; not BA's output).** Any UI-bearing SRS triggers a downstream mandate: SA must produce `docs/instrumentation-contract.md` declaring the project's testID set, regardless of UI Introspection Profile level. This is the canonical selector source for QA-Author's by-us mode (Pass 1 + Pass 2 timing in `.claude/rules/parallel-execution.md` §4). Previously the kit required it only for Partial/None introspection; widened so QA-Author has a single selector source on every UI project.

### Conditional sub-sections under §4 (triggered features only)

If the feature involves any of: authentication, authorization, payments, PII, account data, public endpoints, third-party integrations:

- [ ] `### 4.1 Security & Compliance` with sub-sub-sections per applicable trigger category (Authentication, Authorization, Account Data, Public Endpoints, Third-Party Integrations, Threats Considered, Regional).

See `.claude/skills/security-compliance-checklist/` for the full per-category checklist.

## Design References Rule

`#### 3.4.1 Design References` is **required at sign-off** when the feature has a UI surface, but **its rows may be empty of Figma node IDs**.

- BA verifies that the table exists, with one row per UI requirement listing surface name, platform, and the `Visual-Critical` flag.
- The `Figma File` and `Figma Node ID` cells may be left blank if no design exists yet.
- Empty design cells do **not** block sign-off. The UI/UX Designer fills them in post-sign-off via the design lifecycle (`.claude/rules/parallel-execution.md` §4), and BA verifies completeness in Phase 3.
- If the upstream SRS already provides Figma references, BA carries them forward unchanged.

**Downstream dispatch implication (for BA's awareness).** The state of `Figma Node ID` cells at sign-off determines which Designer mode the Orchestrator dispatches at design lifecycle Step 1:

- **All Node IDs pinned** → Designer dispatched in `import` mode (read existing Figma, produce handoff, flag gaps).
- **Some pinned, some empty** → `import` for the pinned, then `create` for the empty.
- **None pinned** + PM-supplied Figma URL passed via dispatch input → `import` against the URL.
- **None pinned + no URL** → `create` (greenfield).

See `.claude/rules/parallel-execution.md` §4 Step 1 for the full matrix. Carrying forward existing Node IDs is BA's job; the Orchestrator's mode selection depends on it being done correctly.

## Frontend Framework Rule

The `Frontend-Framework:` header is the source of truth FE Dev uses to load the matching `fe-framework-coding-standard` reference. FE Dev does not choose a framework from preference or from ad-hoc package discovery.

- BA verifies the field is present in the header. If absent -> BA adds it with value `TBD`.
- If the SRS has no UI surface and no frontend source, set `Frontend-Framework: N/A`.
- If the upstream requirement explicitly names one supported framework (`React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js`), carry that value into the header.
- If the upstream requirement names different supported frameworks for different surfaces/apps, set `Frontend-Framework: multiple` and ensure §3.4.2 and §3.4.5 identify the canonical framework per surface/app.
- If the upstream requirement is greenfield/authored and no framework is named, BA halts with `NEEDS_CONTEXT` asking the user to choose from the supported framework list. Do not infer from personal preference.
- If the SRS is brownfield (`Source: extracted`), BA Mode E derives the framework from code evidence (package manifests, `angular.json`, `pubspec.yaml`, native RN/Expo files, source file extensions, existing build configs) and records evidence/confidence in §3.4.2 and §3.4.5. If evidence conflicts, set `multiple` only when separate app boundaries are clear; otherwise halt with `NEEDS_CONTEXT`.
- Sign-off blocks while `Frontend-Framework:` is `TBD`, empty, unsupported, or inconsistent with §3.4.2 / §3.4.5 for a UI-bearing/frontend project.

Supported values map to skill references:

| Header value | FE Dev reference |
|---|---|
| `React Native` | `fe-framework-coding-standard/references/react-native.md` |
| `ReactJS` | `fe-framework-coding-standard/references/reactjs.md` |
| `Flutter` | `fe-framework-coding-standard/references/flutter.md` |
| `Vue.js` | `fe-framework-coding-standard/references/vuejs.md` |
| `Angular` | `fe-framework-coding-standard/references/angular.md` |
| `Next.js` | `fe-framework-coding-standard/references/nextjs.md` |
| `multiple` | Use §3.4.2 / §3.4.5 to select one of the rows above per task surface/app |
| `N/A` | No FE Dev framework skill applies |

## Backend Track and Framework Rule

The `Backend-Track:` and `Backend-Framework:` headers are the source of truth BE Dev uses to load the matching `be-framework-coding-standard` reference. BE Dev does not choose a backend stack from preference or ad-hoc manifest discovery.

- BA verifies both fields are present in the header. If absent -> BA adds them with value `TBD`.
- If the SRS has no server-side operation, no API/message surface, and no backend source, set both fields to `N/A`.
- `Backend-Track:` values:
  - `backend-web` — web-facing HTTP API, BFF, API gateway, or backend directly serving frontend/web clients.
  - `backend-service` — microservice, domain service, worker, scheduler, consumer, gRPC/internal service, or service-mesh runtime component.
  - `multiple` — more than one backend row exists; §3.4.5 must identify the track per backend service.
  - `N/A` — no backend implementation applies.
- If the upstream requirement explicitly names one supported backend framework, carry that value into the header.
- If the upstream requirement names different supported frameworks for different backend services, set `Backend-Framework: multiple` and ensure §3.4.5 identifies the canonical framework per backend service.
- If the upstream requirement is greenfield/authored and no backend track/framework is named, BA halts with `NEEDS_CONTEXT` asking the user to choose from the supported backend track/framework lists. Do not infer from personal preference.
- If the SRS is brownfield (`Source: extracted`), BA Mode E derives the track/framework from code evidence (manifests, framework config, route/controller/worker entrypoints, package/module imports, service inventory, architecture container stack fields) and records evidence/confidence in §3.4.5. If evidence conflicts, set `multiple` only when separate service boundaries are clear; otherwise halt with `NEEDS_CONTEXT`.
- Sign-off blocks while either field is `TBD`, empty, unsupported, or inconsistent with §3.4.5 for a backend-bearing project.

Supported framework values map to skill references:

| Header value | BE Dev reference |
|---|---|
| `TypeScript with Express` | `be-framework-coding-standard/references/typescript-express.md` |
| `TypeScript with NestJS` | `be-framework-coding-standard/references/typescript-nestjs.md` |
| `Python with FastAPI` | `be-framework-coding-standard/references/python-fastapi.md` |
| `Java with Spring Boot` | `be-framework-coding-standard/references/java-spring-boot.md` |
| `.NET Core C#` | `be-framework-coding-standard/references/dotnet-core-csharp.md` |
| `Pure Golang` | `be-framework-coding-standard/references/pure-golang.md` |
| `Java Core` | `be-framework-coding-standard/references/java-core.md` |
| `Golang with Gin` | `be-framework-coding-standard/references/golang-gin.md` |
| `Golang with Fiber` | `be-framework-coding-standard/references/golang-fiber.md` |
| `Golang with Echo` | `be-framework-coding-standard/references/golang-echo.md` |
| `Golang with Kratos` | `be-framework-coding-standard/references/golang-kratos.md` |
| `multiple` | Use §3.4.5 to select one of the rows above per backend service |
| `N/A` | No BE Dev framework skill applies |

## Designated Design Approver Rule

The `Designated Design Approver:` field is **required at sign-off**, but **its value may be `TBD`**.

- BA verifies the field is present in the header. If absent → BA adds it with value `TBD`.
- If the upstream SRS names an approver, BA carries it forward unchanged.
- If unnamed (value = `TBD`) AND the SRS has at least one UI surface → BA files a `deferred` entry in `docs/open-issues.md` with `Target phase: before UI/UX Designer dispatch` so the gap is visibly tracked. The SRS signs off normally.
- If unnamed AND the SRS has no UI surfaces → no action needed. The field stays `TBD` and never gates anything.
- The orchestrator enforces the runtime gate at design lifecycle Step 0 (`.claude/rules/parallel-execution.md` §4): no UI/UX Designer dispatch until SRS field is populated.
- Empty Approver field (i.e., literally missing) is **not** the same as `TBD`. Missing field → BA must add the field with value `TBD` during ingestion.

**Example deferred open-issue entry:**

```
### ISSUE-<N> — Designated Design Approver not named
- Date: <ISO-8601>
- Raised by: ba
- Related task: N/A (SRS-level)
- Track: cross-cutting
- Severity: medium
- Description: SRS has UI surface(s) but Designated Design Approver is TBD.
- Suggested mitigation: PM or lead designer to name the approver before UI/UX Designer dispatch.
- State: deferred
- Target phase: before UI/UX Designer dispatch
- Decision log: <ISO-8601> deferred at SRS ingestion; SRS signs off normally; approver must be named before design lifecycle Step 0.
```

## Designated Dependency Approver Rule

Parallels the Designated Design Approver Rule but for third-party dependencies. The `Designated Dependency Approver:` field is **required at sign-off**, but **its value may be `TBD`**.

- BA verifies the field is present in the header. If absent → BA adds it with value `TBD`.
- If the upstream SRS names an approver (could be the same as Design Approver, or different), BA carries it forward.
- If unnamed (value = `TBD`) AND the SRS has architecture / SA scope → BA files a `deferred` entry in `docs/open-issues.md` with `Target phase: before SA dispatch surfaces a new third-party dependency`. SRS signs off normally.
- If unnamed AND the SRS has no architecture / SA scope → no action needed. The field stays `TBD` and never gates anything.
- The gate is enforced at SA dispatch time: when SA is about to propose a new third-party dependency, the SA agent halts and requires the Approver to confirm via `NEEDS_CONTEXT`. See `.claude/skills/sa-architecture-design/`.
- Same as Design Approver: empty field (literally missing) is **not** the same as `TBD`. Missing field → BA adds with value `TBD`.

**Example deferred open-issue entry (for SA-scope projects with TBD Approver):**

```
### ISSUE-<N> — Designated Dependency Approver not named
- Date: <ISO-8601>
- Raised by: ba
- Related task: N/A (SRS-level)
- Track: cross-cutting
- Severity: medium
- Description: SRS has architecture / SA scope but Designated Dependency Approver is TBD.
- Suggested mitigation: PM or engineering lead to name the Approver before SA proposes a new third-party dependency.
- State: deferred
- Target phase: before SA dispatch surfaces a new third-party dependency
- Decision log: <ISO-8601> deferred at SRS ingestion; SRS signs off normally; Approver must be named before SA's first NEEDS_CONTEXT for a new dependency.
```

## Augmentation Structures

When BA adds a missing engineering section, use the structures shown in `srs-template.md`. Specifically:

- §3.1 Domain Specification — Bounded Context / Aggregate Root / Entities / Value Objects / Ubiquitous Language Mapping bullets.
- §3.2 User Stories — index table with ID / Title / Description-one-line / Role / Priority / Linked FRs / Status columns. Per-US detail (Description / Pre-conditions / Main Flow / Business Rules / Post-conditions) lives in `docs/user-stories/<US-ID>.md` per [`user-story-template.md`](./user-story-template.md).
- §3.3 FRS index — table with ID / Title / Priority / User Story / Status columns. Per-FR detail (Description / Preconditions / Steps / Business Rules / Schemas / Error Handling / Sequence Diagram) lives in `docs/frs/<FR-ID>.md` per [`frs-template.md`](./frs-template.md).
- §3.4 Technical Constraints — project-wide patterns only. Per-FR Input Schema / Output Schema / Error Handling rows belong in each `docs/frs/<FR-ID>.md`.
- §3.5 External Integrations — index table with System / Type / Linked US-FRs / Adequacy / File columns. Per-system detail lives in `docs/external-integrations/<system-slug>.md` per [`external-integration-template.md`](./external-integration-template.md).
- §3.4.1 Design References — table with Req-ID / Surface / Platform / Figma File / Figma Node ID / Visual-Critical columns.
- §3.4.2 UI Introspection Profile — table with Surface / Framework / Introspection Level / Notes; canonical framework values are `React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js` when applicable.
- §3.4.3 Acceptance of Non-Introspectable Surfaces — table with Surface / Reason / Accepted-by / Date / Mitigation.
- §3.4.4 API Contract Format — table with API style / Declared format / Default? / Justification columns. Required when project has APIs; lists one row per API style in use.
- §3.4.5 Source Layout — fixed roots `frontend/` + `backend/`, plus a sub-directory table (one row per app/service) with Framework / Runtime, Backend Track, and SDLC Track columns. Required for any project shipping FE or BE code.
- §4 NRS — explicit numbers (P95, throughput, uptime); no subjective adjectives.
- §4.1 Security & Compliance — sub-sub-sections per applicable trigger category.
- §5 Roles — role matrix table.
- §6 Logging — three tables (audit / operational / analytics) with Action / Fields / Retention / Access.
- §7 DoD — checkbox list mapping to FRS Business Rules + §4 metrics + §6 audit-log entries.

## Gap Handling

When BA's ingestion (any of Modes A–F per the `ba-mode-*` skills; routing in `.claude/agents/_templates/ba.md`) finds that the upstream source does not supply content for a kit-required field, the kit's discipline is uniform: **leave a `TODO: <field expected>` marker AND raise a paired Open Question in SRS §8**. Never fabricate content; never silently auto-fill from "common sense" or defaults. The upstream source is the only authority for requirement content; ceremony fields (`Status`, `Last-Updated`, `Source-Hash`) are the only fields BA fills without surfacing an OQ.

### Required vs optional kit fields

The no-invention invariant applies only to **required** fields. Optional fields that the upstream legitimately omits do NOT generate OQs.

**Required (missing → TODO marker + OQ):**

| Field | Where it lives | Why required |
|---|---|---|
| SRS §1 Executive Summary | SRS body | Stakeholder-facing context; no SRS without it |
| SRS §2 BRD strategic intent + success metrics | SRS body | Drives every NRS decision downstream |
| SRS §3.1 Domain Specification (Bounded Context, Aggregate Root, Entities) | SRS body | SA cannot proceed without these |
| SRS §3.2 User Stories index + per-US Description (As-a / I-want / So-that), Pre-conditions, Main Flow, Business Rules, Post-conditions | SRS + `docs/user-stories/<US-ID>.md` | QA-Author by-us mode anchors against these |
| SRS §3.3 FRS index + per-FR Description, Preconditions, Main Flow, Business Rules, Input/Output Schema, Error Handling, Sequence Diagram | SRS + `docs/frs/<FR-ID>.md` | BE Dev / FE Dev consume the schemas; QA-Exec consumes Error Handling |
| SRS §4 NRS quantitative targets (P95 latency, throughput, uptime) | SRS body | NFR-bearing tasks gated on these |
| SRS §5 User Roles & Permissions matrix | SRS body | Authorization implementation gated on these |
| SRS §7 DoD checklist items | SRS body | Dev self-verification gated on these |
| Designated Design Approver header field | SRS header | UI lifecycle gated; `TBD` permitted at sign-off if no UI scope |
| Designated Dependency Approver header field | SRS header | SA-dependency lifecycle gated; `TBD` permitted at sign-off if no SA scope |
| Frontend-Framework header field | SRS header | FE Dev must select the correct framework coding standard from the SRS, not guess from preference. Required when the project has frontend source or UI surfaces; `multiple` requires per-surface/per-app rows in §3.4.2 and §3.4.5. |
| Backend-Track and Backend-Framework header fields | SRS header | BE Dev must select the correct backend track/framework coding standard from the SRS, not guess from preference. Required when the project has backend source or server-side operations; `multiple` requires per-service rows in §3.4.5. |
| SRS §3.4.4 API Contract Format | SRS body | BE Dev's api-contract-author skill reads this; without it, BE picks format ad-hoc per task and project ends up with `users.openapi.yaml` + `orders.md` + `payments.proto` mix. Required when project has APIs; N/A row when no APIs. |
| SRS §3.4.5 Source Layout | SRS body | FE Dev / BE Dev write source only under the declared roots (`frontend/`, `backend/`); `source-code-write-guard.cjs` enforces. Required for any project shipping FE or BE code. |
| SRS §3.5 External Integrations index + per-system `docs/external-integrations/<system-slug>.md` with `Adequacy: adequate` | SRS + integration docs | SA, BE Dev, FE Dev, QA-Author for integration tests all gated on these; per CLAUDE.md §10 strict gate, every system must reach Adequacy: adequate before BA signs off |

**Conditionally required (depends on scope):**

| Field | Required when | Otherwise |
|---|---|---|
| SRS §3.4.1 Design References | SRS has at least one UI surface | Omit silently |
| SRS §3.4.2 UI Introspection Profile | §3.4.1 is present | Omit silently |
| SRS §3.4.3 Acceptance of Non-Introspectable Surfaces | §3.4.2 has any Partial or None rows | Omit silently |
| SRS header `Frontend-Framework:` | Project has frontend source or UI surfaces | `N/A` |
| SRS headers `Backend-Track:` and `Backend-Framework:` | Project has backend source or server-side operations | `N/A` |
| SRS §3.4.4 API Contract Format | Project exposes any API (REST / gRPC / GraphQL / messaging) | N/A row stating 'no API surface' |
| SRS §3.4.5 Source Layout | Project ships any FE or BE source | N/A root row for a tier with no source |
| SRS §4.1 Security & Compliance | SRS involves auth, payments, PII, account data, public endpoints, or third-party integrations | Omit silently |
| SRS §6 User Activity Logging & Tracking | SRS involves audit-required actions (admin role changes, payment, security-relevant) | Omit silently with §10 Changelog note |

**Optional (missing → silent skip, log in SRS §10 Changelog):**

| Field | Reason it can be skipped |
|---|---|
| §3.1 Ubiquitous Language Mapping (`Business Term → Code/DB Name`) | Useful when domain vocabulary differs from code; omit when terms match natively |
| §3.4 Project-wide error envelope | Useful when project standardizes error shape; omit when per-FR Error Handling is sufficient |
| Glossary | Useful for specialized domains; omit when domain terms are self-explanatory |

### Per-mode application

| Mode | Where this rule fires |
|---|---|
| **A** `ingest-from-single-doc` | Step A5 Gap detection — after the constructive split, walk against this list; required-missing → TODO + OQ |
| **B** `ingest-from-multi-doc` | Step B4 Gap detection — walk per-file artifacts AND SRS body |
| **C** `ingest-from-external-source` | Step C6 Gap detection — after materialization. External sources are often skeletons; this catches it |
| **D** `augment-existing` | Phase 1.X common procedure Step 3 — the existing "missing engineering section" handling |
| **E** `reverse-engineer-from-code` | Phase 1.E E2-E5 procedures already enforce; reinforced here |
| **F** `ingest-from-requirements-folder` | Phase 1.F F6 Gap detection — when fragments don't cover a required section |

### Conflict-handling discipline (also uniform across modes)

When upstream sources contradict themselves (within a bulk doc, across multi-doc files, across external pages, across fragments, or between archaeology and team-supplied intent), BA accumulates all conflicts and halts with **one batched** `NEEDS_CONTEXT` listing every conflict. Never silent merge; never per-conflict round-trips. Single ingestion run = at most one batched conflict-resolution prompt.

## Insufficient Content Handling

If a section is present but BA judges it insufficient (e.g., a User Story whose Business Rules reduce to "user-friendly" with no measurable definition, or an FR Error Handling table that says "returns an error" without status codes):

- Do NOT silently rewrite it.
- Add an entry to `## 8. Open Questions & Clarifications` flagging the gap.
- Status remains `In-Review`.

## docs/user-stories/ Pairing Rule

SRS §3.2 (the User Stories index) and `docs/user-stories/` (the per-US files) must be in lock-step:

- Every row in SRS §3.2 has a corresponding file at `docs/user-stories/<US-ID>.md`.
- Every file under `docs/user-stories/` has a corresponding row in SRS §3.2.
- Each US file conforms to [`user-story-template.md`](./user-story-template.md) (Description, Pre-conditions, Main Flow, Business Rules, Post-conditions, Linked artifacts, Notes).

If BA finds an orphan (row without file, or file without row): raise an OQ in SRS §8. Do NOT silently delete either side — orphans usually indicate a draft-in-progress that needs the author's attention.

## docs/frs/ Pairing Rule

SRS §3.3 (the FRS index) and `docs/frs/` (the per-FR files) must be in lock-step:

- Every row in SRS §3.3 has a corresponding file at `docs/frs/<FR-ID>.md`.
- Every file under `docs/frs/` has a corresponding row in SRS §3.3.
- Each FR file conforms to [`frs-template.md`](./frs-template.md) (Description, Preconditions, Main Flow, Business Rules, Input Schema, Output Schema, Error Handling, Sequence Diagram, Linked artifacts, Notes).

If BA finds an orphan (row without file, or file without row): raise an OQ in SRS §8. Do NOT silently delete either side — orphans usually indicate a draft-in-progress that needs the author's attention.

## docs/external-integrations/ Pairing Rule

SRS §3.5 (the External Integrations index) and `docs/external-integrations/` (the per-system files) must be in lock-step:

- Every row in SRS §3.5 has a corresponding file at `docs/external-integrations/<system-slug>.md`.
- Every file under `docs/external-integrations/` has a corresponding row in SRS §3.5.
- Each integration file conforms to [`external-integration-template.md`](./external-integration-template.md) (header metadata including `Adequacy:`, §1 Overview, §2 Operations, §3 Auth, §4 NFR, §5 Failure Modes, §7 Open Adequacy Issues, §8 Changelog).

If BA finds an orphan (row without file, or file without row): raise an OQ in SRS §8 with category `external-integration-pairing-orphan`. Do NOT silently delete either side.

**Sign-off gate (CLAUDE.md §10 strict).** Every `docs/external-integrations/<system-slug>.md` must have `Adequacy: adequate` before BA flips SRS Status to `Signed-off`. Files with `Adequacy: inadequate` or `Adequacy: deferred` raise SRS §8 OQs of category `external-integration-adequacy-gap`, citing the operations table rows that still carry gaps. The `external-integration-adequacy-validator.cjs` hook enforces at write time; BA's Phase 2 sign-off procedure runs the same check as a final audit.

## Ingestion Modes — Per-Mode Supplements

BA Phase 1 runs in one of six modes (A single-doc / B multi-doc / C external-source / D augment-existing / E reverse-engineer / F requirements-folder). See `.claude/agents/_templates/ba.md` Dispatch Routing plus the `ba-mode-*` and `ba-ingestion-pipeline` skills for the full procedure. This section is the per-mode checklist supplement BA consults during ingestion.

### Mode A — `ingest-from-single-doc`

Single bulk SRS doc arrives in `docs/SRS.md` with US and FR content inline.

- [ ] Walked SRS §3.2 for inline US blocks (`#### [US-NNN]` headers or equivalent). Every one extracted to `docs/user-stories/US-NNN.md` per [`user-story-template.md`](./user-story-template.md).
- [ ] Walked SRS §3.3 (and §3.4 if FRs were placed there in upstream) for inline FR detail. Every one extracted to `docs/frs/FR-NNN.md` per [`frs-template.md`](./frs-template.md).
- [ ] SRS §3.2 reduced to an index table; per-US content removed from inline.
- [ ] SRS §3.3 reduced to an index table; per-FR content removed from inline.
- [ ] SRS header has `Source: inline`.
- [ ] SRS §10 Changelog entry records the split (`BA Mode A ingestion — split N USes into docs/user-stories/, M FRs into docs/frs/`).
- [ ] Pairing Rules (both layers) satisfied after split.

**Common failure mode:** upstream doc nests FR detail INSIDE a User Story block (e.g., a "User flow" section with embedded API request/response bodies). Split the API content out to the FR file and leave a US `Linked FRs:` reference; do not silently duplicate the schema in both places.

### Mode B — `ingest-from-multi-doc`

Repo arrives with `docs/SRS.md` + `docs/user-stories/*.md` + `docs/frs/*.md` already authored.

- [ ] Every `docs/user-stories/<US-ID>.md` has all required sections per [`user-story-template.md`](./user-story-template.md): Description, Pre-conditions, Main Flow, Business Rules, Post-conditions, Linked artifacts. Missing-section per file → OQ in SRS §8 citing the file.
- [ ] Every `docs/frs/<FR-ID>.md` has all required sections per [`frs-template.md`](./frs-template.md): Description, Preconditions, Main Flow, Business Rules, Input Schema, Output Schema, Error Handling, Sequence Diagram. Missing-section per file → OQ in SRS §8 citing the file.
- [ ] Pairing Rules (both layers) satisfied. Orphans → OQs; do NOT silently delete.
- [ ] SRS header has `Source: inline` (if not, this is actually Mode C disguised — re-classify).

**Common failure mode:** US file references an FR that doesn't exist yet (e.g., `Linked FRs: FR-007` but `docs/frs/FR-007.md` absent). This is an FR-index orphan even though the FR-index row exists — file the OQ against the FR side.

### Mode C — `ingest-from-external-source`

SRS content lives in Confluence / Notion / Jira / SharePoint; BA materializes via MCP.

- [ ] Source URL captured in dispatch input or via NEEDS_CONTEXT.
- [ ] MCP reader documented for this source type (under `.claude/mcp-readers/` if such a directory exists; otherwise file open-issue requesting reader documentation).
- [ ] Content fetched and content hash captured (SHA-256 of rendered text or equivalent).
- [ ] Materialization completed into one of:
  - `docs/SRS.md` only → run Mode A's split rules to produce per-US and per-FR files.
  - `docs/SRS.md` + per-page-tree mapping to `docs/user-stories/*.md` + `docs/frs/*.md` directly.
- [ ] SRS header has `Source: <url>`, `Source-Last-Pulled: <ISO-8601>`, `Source-Hash: <hash>`.
- [ ] SRS §10 Changelog records the ingest with the source URL and hash.
- [ ] After materialization, Mode A or B common-procedure pass runs against the materialized content.

**Re-ingestion (subsequent Mode C runs):**

- [ ] Fetched current source content + new hash.
- [ ] Compared with stored `Source-Hash`. Unchanged → no work; report and stop.
- [ ] Changed → diff computed; affected `docs/user-stories/*.md` / `docs/frs/*.md` / SRS body updated.
- [ ] SRS `Status` reverted to `Draft` (drift in source = re-sign-off needed per CLAUDE.md §2 protocol).
- [ ] `Source-Last-Pulled` and `Source-Hash` refreshed.
- [ ] §10 Changelog records the re-ingest and the high-level diff summary.

**Common failure mode:** Confluence page tree where parent page describes the feature but child pages are dated working notes (not the canonical US/FR content). Don't materialize working notes into `docs/user-stories/` or `docs/frs/` — that's content that should NOT be the engineering source of truth. Flag the ambiguity as an OQ asking the PM to identify the canonical page tree.

### Mode D — `augment-existing`

Repo is already in kit shape from a prior ingestion. BA's job is augmentation + sign-off only.

- [ ] No mode-specific setup needed.
- [ ] Phase 1.X common procedure (Steps 0 / 0a / 0b / 1–7) runs as-is.
- [ ] If you find evidence Mode A / B / C work was incomplete (orphaned files, missing sections, stale `Source-Hash`), file OQs; do not retroactively re-run prior modes inside Mode D.

**Common failure mode:** scope creep masquerading as "augmentation." If the incoming change introduces new User Stories or FRs that aren't in the current §3.2 / §3.3 index, that's scope expansion — `Status` reverts to `Draft` per CLAUDE.md §2, this is a Mode A or B sub-ingestion, not Mode D augmentation.


### Mode F — `ingest-from-requirements-folder` (greenfield, fragmented upstream)

Greenfield project with multiple requirements fragments in `docs/requirements/` instead of a single SRS doc. BA synthesizes the kit-shape SRS from the fragments.

- [ ] Enumerated every file in `docs/requirements/`. Markdown / txt / html read natively; `.docx` / `.pdf` only if the corresponding skill is active (else halt with "convert to .md first OR activate the skill").
- [ ] Classified each file's likely role (executive summary / user stories / FRs / NRS / security / roles / design refs / glossary / other). Classification table embedded in SRS §10 Changelog as audit trail.
- [ ] Every SRS section, US, and FR carries a `Synthesized-From:` annotation citing the source fragment(s). No untraced content.
- [ ] Conflicts (contradictory fragments) accumulated and surfaced in ONE batch `NEEDS_CONTEXT` round. Never silent merge; never per-conflict round-trips.
- [ ] Gaps (kit-required sections with no fragment coverage) filed as OQs in SRS §8. Sign-off blocked until resolved.
- [ ] SRS header set: `Source: requirements-folder`, `Status: Draft`, `Last-Updated: <ISO-8601>`.
- [ ] `docs/requirements/` files preserved in place; appended `_BA annotation (<date>)` footer noting ingestion (no deletes, no moves).
- [ ] §10 Changelog entry records the ingestion with classification table + conflicts-resolved count + gaps-remaining count.

**Common failure mode:** the team treats `docs/requirements/` as a dumping ground — drops random docs (meeting notes, slide exports, unrelated reference PDFs). BA's classification step flags `Other`-category files as OQs; team must clean up `docs/requirements/` (move non-requirements artifacts elsewhere) before BA can produce a clean synthesis. Catch-22 risk: re-dispatch after team cleanup.
## What BA Must Not Do

- Never invent Figma node IDs. The Designer pins them post-sign-off; BA's job is to verify they exist after handoff (Phase 3), not to fabricate them at sign-off.
- Never auto-pick an introspection level. If the technical stack is unclear in the upstream SRS, raise an Open Question to SA.
- Never sign off on §4.1 Security & Compliance without explicit content. Empty sub-section ≠ "no concerns" — it means the question wasn't asked.
- Never write code-level decisions into §3.1 Domain Specification on SA's behalf. If the upstream SRS doesn't specify a Bounded Context, leave a placeholder + raise an Open Question rather than invent one.
- Never fabricate User Story IDs or FRS IDs. If the upstream SRS has unnamed requirements, assign IDs sequentially during ingestion and log the assignment in §10 Changelog.
