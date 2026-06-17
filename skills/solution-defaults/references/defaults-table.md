# Solution Defaults — Table and Changelog

The pre-approved technology choices for the org. Maintained separately from the [`SKILL.md`](../SKILL.md) so the table can be edited and reviewed independently of the skill's procedure.

See `../SKILL.md` for how to use this table, the ADR pattern for default-vendor choices, and the governance for adding/changing rows.

## Status markers

- **✓ confirmed** — Ratified by your engineering leadership. Using this default skips per-project human approval. SA writes an ADR citing `solution-defaults` and proceeds.
- **⚠ starter** — Placeholder pending org confirmation. Until ratified, agents should still propose via `NEEDS_CONTEXT` for these categories — the row is a hint, not a binding default.

## Defaults

| Category | Default | Rationale | Deviate when | Status |
|---|---|---|---|---|
| Relational database | MySQL 8+ | Org standard. Existing ops tooling, backup/restore, failover playbooks all assume MySQL. Most engineering staff have years of MySQL experience. | Requirement needs PostgreSQL features that MySQL lacks: full-text search via `tsvector`, heavy JSONB / GIN-index workloads, geospatial via PostGIS, array types, partial indexes, listen/notify pub/sub. State the specific feature in the deviation ADR. | ✓ confirmed |
| Distributed event bus / queue | Kafka | Org standard. Durable, replayable, scales to org event volume. Existing tooling around topic creation, consumer-group monitoring, schema registry. | Lightweight reliable queue for low volume (<1K msg/s) with no replay need; or strict ordered FIFO with at-most-once that Kafka doesn't fit. Document the volume + ordering needs in the deviation ADR. | ✓ confirmed |
| In-memory cache | Redis | Org standard. Persistence (RDB + AOF), replication, pub/sub, data structures (sorted sets, streams) all in one — fits more use cases than memcache. Existing operational maturity. | **Never deviate to memcache** — explicitly forbidden as a cache by the org. Deviating to a managed Redis-compatible service (ElastiCache, Redis Cloud) still requires per-project approval. | ✓ confirmed |
| Auth / Identity (end-user) | Central IdP (the organization's central identity provider) | Org standard. The Central IdP is the org identity backbone. | Service-to-service tokens may use OAuth client-credentials or signed JWT issued by the Central IdP. **Never roll a custom IdP for end users.** | ✓ confirmed |
| Object storage | S3-compatible (per cloud — AWS S3, GCS, MinIO for on-prem) | Universal standard interface; vendor portability is good. | Vendor-proprietary object-storage features needed (S3 intelligent tiering, GCS lifecycle policies). Document the feature + portability cost in the deviation ADR. | ⚠ starter |
| Container orchestration | Kubernetes | Org standard for service deployment. | Specific managed-K8s flavor (GKE, EKS, AKS) is per-cloud and counts as a separate dependency choice — falls back to third-party-dependency-evaluation for the cloud choice. | ⚠ starter |
| Reverse proxy / API gateway (edge) | nginx | Org standard. Mature, well-known, performant. | Need traffic-shaping / WAF / rate-limiting features that warrant Envoy, HAProxy, or a managed API gateway. Document the feature gap. | ⚠ starter |
| API style (sync) | REST + OpenAPI 3.1+ for cross-team / external; gRPC permitted for internal service-to-service when binary perf matters. **Declared per project in SRS §3.4.4 API Contract Format** (default `openapi-3.1` for REST; `proto3` for gRPC; `graphql-sdl` for GraphQL; `asyncapi-2.x` for messaging). | Cross-team contracts benefit from REST tooling maturity. Per-project declaration in SRS §3.4.4 prevents per-task format drift. | Latency or binary-payload requirements justify gRPC overhead, OR GraphQL is needed for client-driven query flexibility (rare for backend-to-backend). Markdown contracts are legacy/prototype only — require ADR ref in §3.4.4 Justification column. | ⚠ starter |
| Error tracking | (Project-decision — typically Sentry, but Sentry is paid SaaS) | No org default declared yet. | Always — falls through to third-party-dependency-evaluation. When your organization decides org-wide, update this row. | ⚠ starter |
| Logging aggregation | (Project-decision — common options: Elasticsearch/OpenSearch, Loki, CloudWatch) | No org default declared yet. | Always — falls through to third-party-dependency-evaluation. Update this row when decided. | ⚠ starter |
| Web UI test runner | Playwright | Modern cross-browser (Chromium / Firefox / WebKit), Microsoft-backed, codegen + trace viewer + UI mode, built-in screenshot diff via `toHaveScreenshot()`. Cypress is single-domain-limited; Selenium is verbose and slower. | Project already invested in Cypress / Selenium with non-trivial existing tests AND migration cost outweighs benefit — document the existing investment in the deviation ADR. | ⚠ starter |
| Web visual diff | Playwright `toHaveScreenshot()` (built-in) | Zero extra dependency; integrates with the same test runner; baselines under VCS. | Multi-tenant brand variance, design-system distribution at scale, or PM-led visual review workflow — consider Percy or Applitools and declare via third-party-dependency-evaluation. | ⚠ starter |
| Flutter UI test runner | Patrol | Adds native-side automation on top of Flutter `integration_test`, handles permissions / system dialogs Flutter's stock runner can't. | Stock `integration_test` for simple component tests is fine but doesn't scale. Maestro accepted when the team owns Flutter alongside other mobile stacks and prefers shared YAML flows; trade depth for breadth. | ⚠ starter |
| React Native UI test runner | Detox | Mature RN-specific runner; deep bridge synchronization with RN's render loop; well-supported by Wix. | Maestro when the team owns RN alongside other mobile stacks AND prefers shared YAML flows. Appium accepted for legacy projects already invested. | ⚠ starter |
| Native mobile UI test runner | XCUITest (iOS) / Espresso (Android) | Apple- / Google-blessed, runs against real devices, full accessibility-API coverage. | Cross-platform team using Maestro (preferred over Appium for new projects) when one team owns multiple mobile stacks AND prefers shared YAML flows over per-stack DSLs. Appium also accepted on a per-project basis for legacy reasons. | ⚠ starter |
| Unity UI test runner | AltTester (formerly AltUnity) | Exposes Unity scene graph for external test drivers; Unity-team-recommended. | Project explicitly rejects scene-graph instrumentation — fall back to coordinate-and-template registry per QA-Exec's no-introspection path. | ⚠ starter |
| Cross-platform mobile UI testing (alternative) | Maestro | One YAML-driven tool covers iOS native / Android native / React Native / Flutter. Lower onboarding cost; non-engineer authors can write flows. Does NOT cover Unity. | Default = stack-committed projects use the platform-native runner (XCUITest / Espresso / Detox / Patrol). Deviate TO Maestro when team owns 2+ mobile stacks AND values flow-reuse over per-stack depth. | ⚠ starter |
| Programming language | Project-specific (no org-wide default; declare in SRS or architecture) | Org has multiple stacks (Go, Java, Node/TS, Python). The choice depends on team ownership and existing service language. | Always declared per project; not a "deviation" but a per-project choice. | ⚠ starter |

## Changelog

Append-only. Never delete entries.

| Date | Change | Approver |
|---|---|---|
| 2026-05-12 | Initial: MySQL, Kafka, Redis, Central IdP declared as defaults (relational DB, queue, cache, identity). Starter rows for object storage, K8s, nginx, REST, error tracking, logging, programming language added with ⚠ marker. | Engineering leadership |
| 2026-05-19 | Added Web UI test runner (Playwright), Web visual diff (Playwright built-in), Flutter UI test runner (Patrol), Native mobile UI test runners (XCUITest / Espresso), Unity UI test runner (AltTester) — all ⚠ starter, pending ratification. | (pending ratification) |
| 2026-05-19 | Added React Native UI test runner (Detox) + Cross-platform mobile UI testing alternative (Maestro). Updated native-mobile and Flutter rows' deviate-when to reference Maestro. All ⚠ starter, pending ratification. | (pending ratification) |

## How to update this file

Per the governance in [`../SKILL.md`](../SKILL.md):

1. Append a Changelog row dated today, naming the human Approver (org engineering leadership).
2. Edit the row in the Defaults table. For a starter ⚠ → ✓ promotion, just change the marker and update the Rationale / Deviate-when if needed.
3. For a deprecated default, transition `Status:` to `Deprecated` and add a `Superseded by: <new default category row>` field — do not delete the row.
4. For a new category, add the row to the table with all five columns filled.

The Changelog is the audit trail for default-setting decisions. Treat it like the SRS's `## Resolved Questions` — append-only, never edit prior entries.
