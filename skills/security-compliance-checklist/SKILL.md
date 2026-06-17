---
name: security-compliance-checklist
description: Checklist for the SRS `## Security & Compliance` section. Consult during BA ingestion when the requirement involves auth, payments, PII, account data, public endpoints, or third-party integrations.
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Security & Compliance Checklist

## When to use

You are the BA. The incoming SRS describes a feature that involves at least one of: authentication, authorization, payments, PII, account data, public endpoints, or third-party integrations. CLAUDE.md §2 requires a `## Security & Compliance` section in the SRS before sign-off, and this skill is the BA's playbook for what that section needs.

## Inputs and outputs

- **Inputs:** a draft SRS with at least one trigger category present
- **Outputs:** a populated `## Security & Compliance` section in `docs/SRS.md`, plus any Open Questions for unresolved items

## Trigger categories

If the SRS touches any of these, the section is mandatory:

| Trigger | Examples |
|---|---|
| Authentication | Login flows, SSO, magic links, OAuth, MFA enrollment / recovery |
| Authorization | Role checks, scope checks, resource ownership, admin endpoints |
| Payments | Card data, payment provider integrations, refunds, ledger entries |
| PII | Names, emails, phone numbers, addresses, government IDs, biometrics |
| Account data | Game progress, in-game purchases, friend lists, chat history, profile photos |
| Public endpoints | Anything reachable without auth, or with weak auth (e.g., share-by-link) |
| Third-party integrations | External APIs (payment, identity, analytics, CDN, partner game services) |

## Procedure

1. Read the SRS; mark every requirement that touches one of the trigger categories.
2. For each marked requirement, walk the per-category checklist in [`references/per-regime.md`](./references/per-regime.md). Copy answers (or unanswered questions) into the SRS's `## Security & Compliance` section.
3. Where the SRS is silent or ambiguous on a checklist item, raise it as `## Open Questions`. Do not invent answers.
4. Add a final subsection `### Threats considered`: 3–6 bullets naming threat actors and how the requirement addresses them. Lightweight threat-modeling, not a full STRIDE analysis.
5. If any item touches **regional data law** (Vietnam Cybersecurity Law, China data localization, Southeast Asia patchwork, GDPR for EU users), include a `### Regional` subsection naming the regions the feature is exposed to and which constraints apply per region.

## Hard rules

- The SRS cannot reach `Signed-off` while `## Security & Compliance` has unresolved items, regardless of how complete the rest of the SRS is.
- Never reduce a security requirement to "follow industry best practices". State the actual control: "tokens stored in Secure HttpOnly cookies, 30-minute idle expiry, rotated on privilege escalation".
- BA never decides on threat-model trade-offs alone. Trade-offs go in `## Open Questions` and are resolved by SA + Security review (or whoever your org names) before sign-off.
- For games/products in regulated regions: account, payment, and chat data are subject to regional data laws. Any feature touching these requires the Regional subsection.
- When in doubt about whether a category applies, include it. Over-documenting security is cheaper than under-documenting.

## References

- [`references/per-regime.md`](./references/per-regime.md) — per-category checklist with required SRS content
- CLAUDE.md §2 — SRS Sign-off Protocol (the gate this skill helps you pass)
- CLAUDE.md §10 — Hard Rules
