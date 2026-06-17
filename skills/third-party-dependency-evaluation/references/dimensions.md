# Per-Category Evaluation Dimensions

Different categories of third-party dependencies have different relevant dimensions. Use the matching set when evaluating an option; don't pad with "N/A" — skip dimensions that don't apply.

## Paid SaaS / hosted service

Examples: Stripe, Auth0, Sentry, Datadog, PagerDuty, paid Cloudflare tier, Twilio.

| Dimension | What to capture |
|---|---|
| Cost | Pricing model (per-user, per-event, per-MAU, flat). Cost at expected scale. Cost at 10× scale. Free-tier coverage. |
| Vendor lock-in | Data portability (export and migrate path). Proprietary APIs vs standard. Contract minimums and termination terms. |
| Data residency | Where data is physically stored. Aligns with SRS §Security & Compliance §Regional? |
| Sub-processor status | Does this add a sub-processor to our DPA / customer-facing list? Triggers customer notification under GDPR / PIPL / Vietnam Cybersecurity Law? |
| Compliance certifications | SOC2 Type 2? ISO 27001? GDPR-compliant? PCI-DSS for payment paths? Whatever the SRS's regulatory regime requires. |
| Operational reliability | Public SLA, status page, recent incident history, scheduled-maintenance pattern. |
| Security posture | Vulnerability disclosure process, recent CVEs, last security audit, supply-chain transparency. |
| Integration cost | SDK availability for our stack, API quality, sandbox environment, time-to-first-call. |
| Exit cost | Migration plan if we need to leave. Format compatibility with alternatives. |

## OSS framework or library

Examples: npm/PyPI/Maven/Go-module packages.

| Dimension | What to capture |
|---|---|
| License | Permissive (MIT, Apache 2.0, BSD-3, ISC)? Copyleft (GPL, AGPL, LGPL)? Compatible with our use? Legal/IP team verdict if in doubt. |
| Maintenance status | Last commit date, release cadence over the last 12 months, number of active maintainers, ratio of open-to-closed issues. |
| Supply-chain risk | Provenance (signed releases? reproducible builds?), registry trust, # of transitive deps, vulnerability scan against current version. |
| Adoption signal | Download count, GitHub stars, community size, used by visibly-credible projects. Proxy signals for survival probability. |
| Documentation | API docs quality, tutorials, common-gotchas section, runnable examples. |
| Footprint | Bundle size (FE), runtime memory (BE), binary size (mobile / game). Matters more for performance-sensitive contexts. |
| Type / test quality | TypeScript types (for TS projects), test coverage of the lib itself, CI maturity. |
| Maintainer governance | Single maintainer (bus factor 1)? Corporate sponsor? Foundation (Apache, CNCF, OpenJS)? |

## Managed cloud service creating lock-in

Examples: DynamoDB, Bedrock, Cloud Run, Cloud Pub/Sub, ElastiCache, S3 (sometimes), Lambda, BigQuery.

| Dimension | What to capture |
|---|---|
| Lock-in degree | How proprietary is the API? How portable is the data shape? Does standard tooling work, or vendor SDK only? |
| Cost | Usage-based pricing components (request, storage, egress, read/write capacity). Expected monthly bill at production scale. Egress cost (matters more than you'd think when migrating later). |
| Performance | Latency profile (P50, P95, P99), throughput limits, regional availability. |
| Compliance | Same as paid SaaS. |
| Skill cost | Existing engineering experience with this service? Hiring availability for it? |
| Region match | Available in our deployment regions, including the regions SRS's §Security & Compliance §Regional requires? |
| Cost of exit | Migration off this service: how hard, how expensive, what tools exist? |

## External partner API

Examples: payment providers (Stripe, Adyen), identity providers (Auth0, partner SSO), game-store APIs, KYC/AML providers, weather/maps APIs.

| Dimension | What to capture |
|---|---|
| Contractual basis | Existing contract / DPA in place? If new, who negotiates and on what timeline? |
| Compliance | Same as paid SaaS, plus partner-specific (game-store certification, age-rating, regional licensing). |
| Rate limits | Per-minute / per-day quotas. Burst tolerance. What happens at quota exhaustion (hard 429, queued, dropped)? |
| Failure mode | When the vendor is down: what does our system do (fail closed, fail open, queue and retry, degrade gracefully)? |
| Audit trail | Does the partner provide one? Do we need to maintain our own (regulatory)? |
| Termination | What happens to in-flight transactions / data if the partnership ends? Data return clauses? |
| Versioning | API versioning policy. Deprecation notice period. Required migration cadence. |

## Self-hosted vendor-provided tool

Examples: PostgreSQL, MySQL, Redis, RabbitMQ, NATS, Elasticsearch, Kafka.

| Dimension | What to capture |
|---|---|
| License | Same as OSS. Watch for license shifts (e.g., Elasticsearch SSPL, Redis license changes). |
| Operational complexity | Who runs it? Backup story, failover playbook, scaling pattern, monitoring story. |
| Cost | Infrastructure cost (compute + storage + ops time + on-call burden). |
| Security posture | Patch cadence (do we keep up?), hardening defaults, known production gotchas (Postgres replication, Redis OOM, etc.). |
| Skill cost | Existing team experience? Documentation quality (official + community)? |
| Migration cost | Standard interface (Postgres = SQL+ standard; usually portable) vs proprietary (Redis = proprietary protocol; harder to swap). |
| Operational maturity | Existing automation (Terraform modules, Helm charts), known-good production deployments at companies our size. |

## Universal dimensions (apply to every category)

- **Necessity**: is the dependency genuinely required, or could we build/avoid it? What requirement does it satisfy? Cite SRS User Story Business Rule (US-NNN.BR-N), FR Error Handling row (FR-NNN.Error-CODE), or §4 NRS target.
- **Replacement difficulty**: 6 months from now, if this turns out wrong, how hard is the swap?
- **Security exposure**: what's the blast radius if this dependency is compromised?
- **Compliance exposure**: does this dependency drag the rest of the system into a new regulatory regime?
