# Per-Category Security & Compliance Checklist

Each section below lists what the SRS's `## Security & Compliance` section must answer when the trigger category applies. If the SRS is silent on any item, raise it as `## Open Questions` rather than inventing an answer.

## Authentication

- Authentication mechanism (password / SSO / magic link / OAuth / MFA) and which mechanisms are required vs optional
- Session model: where stored (cookie / token), lifetime, idle expiry, refresh policy
- Token rotation: when (privilege change, password change, suspicious activity)
- Account recovery flow and the threat model for recovery (e.g., email-only recovery is weaker than email + secondary factor)
- Brute-force / credential-stuffing protection: rate limit, account lockout, captcha, IP heuristics
- Logout: client-side token clear AND server-side session invalidation (or stateless model rationale)

## Authorization

- Role / scope / permission model: which roles, what each role can do
- Default role for new users
- Privilege escalation path (who can grant which roles, audit logging requirement)
- Resource ownership rules (who can read / modify which records)
- Cross-tenant isolation: how is "user A cannot see user B's data" enforced — at query level, at API level, both
- Admin endpoint discipline: list of admin-only endpoints, audit logging requirement

## Payments

- Card data handling: SRS must state explicitly that no card data is stored on our servers (or, if it is, the PCI-DSS scope and compliance plan)
- Payment provider integration: provider name, contract type (charge / token / vault), reconciliation process
- Idempotency: how repeated charge requests are deduped
- Refund flow: who can initiate, audit trail, money trail
- Currency, taxation, and FX behavior if multi-region
- Fraud signals: which signals are checked, who reviews flagged transactions
- Audit log retention period (and which actions are logged)

## PII

- Categories of PII collected (each one explicit — name, email, phone, address, gov ID, biometric, etc.)
- Purpose for each category (data minimization)
- Retention period for each category
- Deletion / right-to-be-forgotten flow
- Export / right-to-data-portability flow
- Encryption at rest, in transit
- Access control: who internally can read PII, audit logging
- Sub-processor list if PII goes to third parties

## Account data

For games: progress, in-game purchases, friend lists, chat history, profile photos, voice clips.

- Categories of account data and retention per category
- Cross-account leak protection (chat history of A is invisible to B)
- Profile photo / voice clip moderation: pre-upload check, post-upload review, takedown SLA
- Chat content moderation: real-time filter, user-reporting flow, retention for moderation review vs deletion for privacy
- Linked-account migration: when a user merges accounts, what data follows them, what doesn't, who is notified

## Public endpoints

- List of endpoints reachable without auth (or with weak / share-link auth)
- For each: rate limit, expected legitimate traffic shape, abuse-detection signals
- Cache control: which responses are cacheable by CDN / public caches, which leak data if cached
- CORS policy
- Security headers (CSP, X-Frame-Options, Referrer-Policy, HSTS) — the actual values, not "industry standard"

## Third-party integrations

- List of third parties and what data flows to each (request shape, response shape, frequency)
- Auth model with each (API key / OAuth / mTLS); where the secret is stored
- Failure mode: what does our system do when the third party is down — fail closed, fail open, queue, degrade
- Data residency: where is the third party's data hosted, does that conflict with our regional regimes
- Sub-processor flow-down for PII (the third party becomes a sub-processor)
- Termination plan: if we stop using the third party, how do we get the data out

## Regional regimes (relevant subset)

| Region | Key constraints to call out |
|---|---|
| Vietnam | Cybersecurity Law: data localization for certain user data, content takedown SLAs, real-name verification for some services |
| China | PIPL + Cybersecurity Law: data localization, cross-border transfer assessments, license requirements for online games |
| EU + UK | GDPR: lawful basis, DSAR (data subject access requests), DPO involvement, breach notification within 72 hours |
| Korea | PIPA: explicit consent for sensitive data, breach notification, data localization for certain categories |
| Indonesia / Thailand / Philippines | National privacy laws with varying consent and notification requirements; check per launch region |

When a feature is exposed to multiple regions, the strictest constraint usually wins. List the regions; flag the strictest constraint per item.

## Threat-model starter prompts

Useful prompts when filling the `### Threats considered` subsection:

- Who would want to abuse this feature, and what would they get?
- What's the cheapest attack? (credential stuffing, replay, parameter tampering, mass scrape)
- What's the most damaging attack?
- What signals would we see when an attack succeeds?
- What's the blast radius if a single user account is compromised?
- What's the blast radius if our service-to-service token leaks?
