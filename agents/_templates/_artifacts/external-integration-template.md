<!--
External Integration Template — canonical structure for `docs/external-integrations/<system-slug>.md`

This file serves two purposes:

1. **Reference for SA when authoring an external-integration doc.** Copy this to
   `docs/external-integrations/<system-slug>.md` and fill in.
2. **Validation baseline.** The external-integration-adequacy-validator hook reads the
   `Adequacy:` header field at SRS sign-off time. Downstream agents (BE Dev, FE Dev,
   QA-Author for integration tests, QA-Exec) consume the operations table as the
   authoritative interface contract.

One file per external system (not per integration purpose). All operations the product
uses from that system live in this one file under §2 Operations.

Coverage scope: **every** external system the product touches — including in-org
defaults (Account/Passport, Kafka) and managed cloud services (Redis, MySQL, S3),
not only third-party. Solution-defaults is a pre-fill starting point, not a substitute.

The Adequacy field is the gate:
  - `adequate` — every Operation has full interface detail; SRS sign-off allowed.
  - `deprecated` — integration RETIRED but the file is retained for audit per SRS §3.5;
    SRS sign-off allowed. A deprecated integration has no active consumer, so the
    adequacy gate (which guarantees a downstream dev can build against an ACTIVE
    integration) does not apply. The file MUST also be marked deprecated in the SRS
    §3.5 index — BA Phase 2 step 3 cross-checks this so `deprecated` cannot be abused
    to skip adequacy work on a still-live system. SA flips Adequacy to `deprecated`
    when the integration is retired; record the transition in §8 Changelog.
  - `inadequate` — at least one Operation has gaps in §7; SRS sign-off blocked.
  - `deferred` — explicitly deferred to a target phase; SRS sign-off blocked (the kit's
    Block-All gate per CLAUDE.md §10). `deferred` exists for tracking purposes only;
    sign-off requires `adequate` (or `deprecated`) — never passes on `deferred`.

SA, not BA, authors per-operation detail. BA creates the placeholder during Phase 1
identification; SA fills it during the `external-integration-adequacy` dispatch.
BA's only direct edits are §3.5 SRS index pairing and the `Linked SRS operations`
header field. SA is the only agent permitted to flip Adequacy to `adequate`.

Replace this entire HTML comment block before SA marks Adequacy adequate.
-->

# External Integration — [System Name]

- **System name:** [Name]
- **Type:** in-org | third-party | self-hosted-vendor | managed-cloud
- **Owner team:** [Team / squad responsible for this external system]
- **Owner contact:** [Email, Slack channel, on-call rotation — whoever fields integration questions]
- **Adequacy:** inadequate <!-- inadequate | adequate | deprecated | deferred — only SA may set adequate or deprecated; adequate+deprecated pass sign-off, inadequate+deferred block -->
- **Adequacy-last-validated-by:** SA [name] <!-- agent + author at the last adequacy decision -->
- **Adequacy-last-validated-on:** <ISO-8601>
- **Source-URL:** [Authoritative spec URL — Confluence / vendor docs / OpenAPI / proto file]
- **Source-Version:** [Vendor API version or doc version at last pull]
- **Source-Last-Pulled:** <ISO-8601>
- **Linked SRS operations:** US-NNN, FR-NNN <!-- comma-separated list of every US/FR that touches this system -->
- **Linked ADRs:** ADR-NNNN <!-- the dependency-approval ADR(s); omit for solution-defaults in-org systems -->

---

## 1. Overview

*What this system is, what we use it for, and where it sits in our architecture. One paragraph.*

[TODO: 3–5 sentences. Name the system, its role in our product, and which architecture container(s) call it.]

<!-- EXAMPLE — Account/Passport for Spectator feature

The organization's central identity provider is the org-wide identity backbone. Spectator Service uses it
for session-token validation on every join request (US-001 / FR-001) and to enforce
regional auth rules (CN-region anonymous-join refusal per US-001 Business Rule 3).
The Spectator API container's Auth Adapter component (architecture.md §3.1) is the
only caller; no other Spectator container talks to Passport directly.

EXAMPLE -->

---

## 2. Operations

*Each operation we call on this external system gets one sub-section. SA fills these
during the `external-integration-adequacy` dispatch. Every operation must carry
complete interface detail OR be marked in §7 Open Adequacy Issues with the missing
fields enumerated.*

[TODO: One sub-section per operation. Add as many §2.N as needed. If only one operation, still use §2.1.]

### 2.1 [Operation 1 — short imperative title, e.g., "Validate session token"]

- **Linked FRs:** FR-NNN <!-- which FRs in our product invoke this operation -->
- **Direction:** outbound (we call them) | inbound (they call us via webhook) | bidirectional
- **Protocol:** HTTPS | gRPC | WebSocket | async-event (Kafka topic) | other
- **Endpoint:** [URL pattern / topic name / RPC method — e.g., `GET https://auth.example.com/sessions/validate`]
- **Auth mode:** [How we authenticate to them — e.g., service-account JWT in Authorization header; mutual TLS; signed Kafka producer]
- **Idempotency:** idempotent | non-idempotent | natural-key-driven
  - If natural-key-driven, name the key: [`session_id` / `match_id` / etc.]
- **Request schema:** (inline; JSON example or schema)

  ```json
  {
    "session_token": "<jwt>"
  }
  ```

- **Response schema (success):** (inline)

  ```json
  {
    "account_id": "<uuid>",
    "session_valid": true,
    "expires_at": "<ISO-8601>"
  }
  ```

- **Response schema (each error variant):** (inline; one block per distinct error)

  ```json
  {
    "error": "TOKEN_EXPIRED",
    "expires_at": "<ISO-8601>"
  }
  ```

- **Error codes table:**

  | External code | Meaning | Our handling | Maps to our error |
  |---|---|---|---|
  | `TOKEN_EXPIRED` | Session token past expiry | Surface to client; client re-authenticates | `ERR_AUTH_EXPIRED` |
  | `TOKEN_REVOKED` | Token explicitly revoked | Surface to client; client must re-login | `ERR_AUTH_REVOKED` |
  | `5xx` | Passport unavailable | Retry per Retry policy below; if exhausted, surface 503 | `ERR_AUTH_UPSTREAM_UNAVAILABLE` |

- **Rate limit:** [Their published limit — e.g., 1000 req/min per service account]
- **Latency SLO:** [Their published target — e.g., P95 < 50ms; P99 < 200ms]
- **Retry policy:** [How we retry on failure — e.g., exponential backoff 100ms → 1.6s; max 3 retries; never retry on 4xx]
- **Webhook callback behavior:** [Required only when Direction = inbound or bidirectional; describe how they reach us, what signature/HMAC they sign with, what payload they send, what response they expect]

#### Format Contract

*Per-field format spec for any field that crosses a format boundary to another system (database, downstream API, queue, file). Apply the detection heuristic from [`.claude/skills/format-boundary-contracts/SKILL.md`](../../skills/format-boundary-contracts/SKILL.md) — datetime variants, UUID encoding, monetary precision, boolean coercion, encoding, length limits, null/empty semantics. Each row makes the format axis explicit so downstream consumers don't conflate format conversion with timezone interpretation, length truncation with normalization, etc.*

| Field | Format here | Notes / gotchas | Downstream conversion required? |
|---|---|---|---|
| `<field name>` | `<exact format spec>` | `<edge cases — leading zeros, trailing whitespace, encoding, precision>` | `<yes → see architecture.md §6 / no → format matches typical destinations>` |

<!-- EXAMPLE — GitLab MR response datetime fields

| Field | Format here | Notes / gotchas | Downstream conversion required? |
|---|---|---|---|
| `merged_at` | ISO-8601 with `T` separator + `Z` suffix (e.g., `"2025-06-15T14:30:00Z"`); always UTC; never null when state=merged | Different from MySQL `DATETIME` format (`'YYYY-MM-DD HH:MM:SS'`); `T` and `Z` characters cause MySQL bind-parameter syntax errors. Don't pass verbatim to MySQL — convert first. | **Yes** — see architecture.md §6 format-boundary row for `merged_at`. Conversion lives in MR Collection Service (T-013); function `gitLabIsoToMysqlDatetime()`. |
| `iid` | Integer (project-local sequence); fits 32-bit | Distinct from `id` (global integer); confusing — name carefully in DB schema | No — both systems handle integers identically |
| `author.id` | Integer | Always > 0 for real users; system-bot accounts return id < 0 in some self-hosted GitLab installs | No — but document the negative-id case in app code if you care about bot exclusion |

EXAMPLE -->

<!-- EXAMPLE — Account/Passport "Validate session token"

- **Linked FRs:** FR-001 (Join in-progress match)
- **Direction:** outbound
- **Protocol:** HTTPS
- **Endpoint:** `GET https://auth.example.com/v2/sessions/validate?token={token}`
- **Auth mode:** Service-account JWT in `Authorization: Bearer <sa-jwt>` header; SA tokens rotated by Passport every 24h via PKI infrastructure
- **Idempotency:** idempotent (safe to retry; same token always returns same result within token lifetime)
- **Request schema:**

  ```
  GET /v2/sessions/validate?token=<jwt>
  Authorization: Bearer <service-account-jwt>
  ```

- **Response schema (success):**

  ```json
  {
    "account_id": "01HZX7Y...",
    "session_valid": true,
    "expires_at": "2026-05-21T12:34:56Z",
    "region": "VN" | "CN" | "TH" | "..."
  }
  ```

- **Response schema (error variants):**

  ```json
  // 401 — token problems
  { "error": "TOKEN_EXPIRED" | "TOKEN_REVOKED" | "TOKEN_MALFORMED", "expires_at": "<ISO-8601 or null>" }

  // 503 — Passport unavailable
  { "error": "SERVICE_UNAVAILABLE", "retry_after_ms": 1000 }
  ```

- **Error codes table:**

  | External code | Meaning | Our handling | Maps to our error |
  |---|---|---|---|
  | `TOKEN_EXPIRED` | Past expiry | Client re-authenticates via Passport SDK | `ERR_AUTH_EXPIRED` |
  | `TOKEN_REVOKED` | Explicitly revoked | Client must re-login | `ERR_AUTH_REVOKED` |
  | `TOKEN_MALFORMED` | Bad signature / format | Surface as 401 + log + alert (likely tampering) | `ERR_AUTH_MALFORMED` |
  | `SERVICE_UNAVAILABLE` | Passport down | Retry with backoff; cache last positive result up to 30s | `ERR_AUTH_UPSTREAM_UNAVAILABLE` |

- **Rate limit:** 5000 req/sec per service account (Passport-published; we're well below)
- **Latency SLO:** P95 < 30ms; P99 < 100ms (Passport-published)
- **Retry policy:** Exponential backoff 100ms → 400ms → 1600ms (3 attempts max); never retry on 401; honor `retry_after_ms` when present
- **Webhook callback behavior:** N/A — outbound only

EXAMPLE -->

### 2.2 [Operation 2 — if applicable]

[Same structure as §2.1.]

---

## 3. Authentication & Authorization

*How we authenticate TO this system as a whole (cross-cutting; per-operation auth notes
stay in §2). Covers credential management, rotation, and trust setup.*

[TODO: Cover credential type, where stored, how rotated, who has access, what break-glass procedure looks like.]

<!-- EXAMPLE — Account/Passport

- **Credential type:** Service-account JWT signed by Passport's PKI
- **Credential storage:** Injected via Kubernetes Secret at pod start; never written to disk
- **Rotation:** Automatic every 24h by Passport's SA-rotation cronjob; pods read fresh token on next API call
- **Access:** Spectator Service pods only; not exposed to other org services
- **Break-glass:** If rotation breaks, manual rotation via Passport admin console (Eng Lead has access; 4-hour SLO from page to rotation)

EXAMPLE -->

---

## 4. Non-Functional Posture

*Their published SLOs/SLAs and our integration's non-functional commitments to those.*

[TODO: One row per binding NFR commitment. Cross-reference our SRS §4 NRS rows when relevant.]

| Aspect | Their published target | Our integration's posture | SRS NRS ref |
|---|---|---|---|
| Availability | [99.95% per their SLA] | [We assume <0.05% failure budget per quarter] | NFR-NNN |
| Latency P95 | [<50ms] | [Built into our match-state P95 budget — see architecture.md §4] | NFR-NNN |
| Throughput | [5000 req/sec per SA] | [Peak expectation 200 req/sec at tournament start] | NFR-NNN |
| Regional availability | [VN, CN, TH, GLOBAL] | [We call from VN region; CN spectators routed via CN-region Passport] | NFR-NNN |

<!-- EXAMPLE — Account/Passport for Spectator

| Aspect | Their published target | Our integration's posture | SRS NRS ref |
|---|---|---|---|
| Availability | 99.95% per Passport SLA | Spectator API uptime budget assumes this; degradation cached 30s | NFR-003 |
| Latency P95 | <30ms | Built into Join-flow latency P95 < 200ms; Passport call is one hop | NFR-001 |
| Throughput | 5000 req/sec per SA | Peak expectation 200 req/sec at tournament-window start; well within | NFR-002 |
| Regional availability | VN, CN, TH, GLOBAL Passport instances | We route per spectator's region; CN PIPL requires CN-region Passport | NFR-005 (regional compliance) |

EXAMPLE -->

---

## 5. Failure Modes

*What fails on their side, how we detect it, how we degrade. One row per material failure path.*

[TODO: One row per failure mode that's load-bearing or might surface in a runbook.]

| Failure | Detection | Our recovery | Cross-ref |
|---|---|---|---|
| [System unavailable — 5xx burst] | [Error-rate metric > 1% over 30s] | [Circuit-break for 30s; cached results; client-facing 503] | architecture.md §5 |
| [Token-validation latency spike] | [P95 > 500ms over 60s] | [Bypass cache; force re-validation; alert] | — |
| [Token-rotation broken] | [SA cred age > 25h] | [Page Eng Lead; manual rotation via Passport admin] | runbook §<X> |

---

## 6. Regional / Compliance Constraints

*Required when the integration crosses regional boundaries (VN / CN / EU) or interacts
with regulated data (PII, payments, health). Omit otherwise.*

[TODO: Required only when regional or compliance constraints apply. Omit the section if not.]

<!-- EXAMPLE — Account/Passport regional concerns

- **VN region:** Spectator Service calls VN-Passport instance for VN-region spectators; data residency Vietnam Cybersecurity Law compliant.
- **CN region:** PIPL requires anonymous-viewing forbidden; Spectator Service calls CN-Passport instance for CN-region spectators; account-id storage in CN region only.
- **EU/UK:** Passport GDPR lawful basis = consent at sign-up; no additional consent needed for Spectator use; account data flows through Spectator Service do not cross EU border.

EXAMPLE -->

---

## 7. Open Adequacy Issues

*Gaps in our knowledge of this integration's interface. Each row blocks SRS sign-off
(per CLAUDE.md §10 strict gate). SA fills this during `external-integration-adequacy`
dispatch; BA mirrors each row as a SRS §8 OQ with category `external-integration-adequacy-gap`.*

[TODO: Empty when Adequacy = adequate or deprecated. Populated when Adequacy = inadequate or deferred.]

| Gap | Operation | Severity | What's missing | Owner (to resolve) |
|---|---|---|---|---|
| [Rate limit for batch validation] | §2.1 | high | Passport docs don't publish a rate limit for the bulk endpoint; we assumed 5000 req/sec but unverified | PM → Passport team |
| [Webhook signature scheme] | §2.3 | medium | Vendor docs reference HMAC-SHA256 but don't provide the secret distribution mechanism | PM → vendor support |

---

## 8. Changelog

*Append-only. Every Adequacy transition, operation addition, schema change, and
re-pull from Source-URL gets a row.*

[TODO: Record changes as they happen.]

| Date | Change | By |
|---|---|---|
| <ISO-8601> | Initial placeholder created (BA Phase 1 identification) | BA |
| <ISO-8601> | SA adequacy check: filled §2.1, §3, §4; 2 gaps remain — Adequacy: inadequate | SA |
| <ISO-8601> | OQ-NNN resolved by PM; updated §2.1 rate limit and §2.3 webhook signature — Adequacy: adequate | SA |
