---
name: third-party-dependency-evaluation
description: How to evaluate and propose third-party dependencies for human approval. Consult when SA, BE Dev, or FE Dev is about to introduce a new third-party dependency that hasn't been approved in a prior ADR for this project.
agents: [sa, be-dev, fe-dev]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Third-Party Dependency Evaluation

## When to use

You are SA producing architecture, or a Dev about to add a new library / managed service / external API. You are about to introduce a dependency that is third-party and has not been approved in a prior ADR for this project. Per CLAUDE.md §10 hard rule, you must NOT include the dependency in your output (architecture, code, contracts) without explicit human approval first.

This skill defines: what counts as third-party, what's exempt, how to propose alternatives, what dimensions to weigh per category, and what the `NEEDS_CONTEXT` prompt should look like for the Orchestrator to relay to the Designated Dependency Approver.

## What counts as "third-party" (approval required)

A dependency is third-party when **both** are true:

1. It is **not in-org** (the central identity provider, storefront, launcher, etc. — your organization's own services are pre-approved at the org level).
2. It has **not been approved in a prior ADR for this project**. Cite the prior ADR (`Refs: ADR-NNNN approves use of Vendor X`) and no new approval is needed.

This includes:

- **Paid SaaS / hosted services**: Stripe, Auth0, Sentry, Datadog, Cloudflare paid tier, etc.
- **Managed cloud services creating lock-in**: DynamoDB, Bedrock, Cloud Run, Cloud Pub/Sub, Redis Cloud, MongoDB Atlas, etc.
- **External partner APIs**: game publishers, payment providers, identity providers, KYC providers
- **OSS frameworks and libraries**: npm/PyPI/Maven/Go-module packages — yes, including these. Supply-chain risk, license review, and maintenance-status check are real engineering risks
- **Self-hosted vendor tools** (first-time inclusion only): PostgreSQL, Redis, RabbitMQ, etc. — first time adopted on a project needs approval; subsequent ADRs cite the original

## What is exempt (no approval needed)

- **Standards**: HTTP, REST, JSON, SQL, gRPC, OpenAPI, OAuth, JWT (the specs, not specific libraries implementing them)
- **Languages and their standard libraries**: Node stdlib, Go stdlib, Python stdlib, Java stdlib, etc. (third-party packages from npm/PyPI/etc. are NOT exempt — they are OSS dependencies)
- **Generic platform**: Linux, POSIX, Docker, Kubernetes runtime (specific managed K8s like GKE/EKS is NOT exempt — that's a cloud-managed service)
- **In-org services**: the central identity provider, storefront, launcher, promotion engine, analytics, etc.

If in doubt, ask via NEEDS_CONTEXT. "It feels like it should be exempt" is not exempt.

## Procedure

**Step 0 — Check `.claude/skills/solution-defaults/` first.** Before going through the evaluation below, check if the dependency category has an org-level default. If yes and you'll use the default, no `NEEDS_CONTEXT` is needed — write an ADR citing `.claude/skills/solution-defaults/` as the `Approver` source. Only run the full evaluation below when:

- The category has no default in `solution-defaults`, OR
- The category has a default but the row's `Deviate when` condition applies to your case.

When you're deviating, the proposal must cite the default explicitly: "Default is X per `.claude/skills/solution-defaults/`; we deviate because Y."


1. **Determine whether a dependency is genuinely needed.** Document the requirement that drives the need (SRS § Non-functional, integration scope, etc.). Often "build in-house" or "do without" is a viable option worth presenting.
2. **Check for prior approval.** Scan `docs/decisions/` for an ADR approving this vendor for this project. If found, cite it; no new approval needed — proceed with the existing approval.
3. **Generate 2–4 options.** Always include a "do without / build in-house" option if technically feasible, even when it looks unattractive — the trade-off shape matters and reviewers need to see it. Use [`references/options-template.md`](./references/options-template.md).
4. **Evaluate each option** per the dimensions in [`references/dimensions.md`](./references/dimensions.md). Use the dimensions relevant to the dependency's category (paid SaaS / OSS / managed cloud / external API / self-hosted vendor tool).
5. **Halt and return `NEEDS_CONTEXT`** to the Orchestrator with the multi-choice prompt (format below). Recommend one option with confidence and what-would-change-my-mind.
6. **The Orchestrator relays to the Designated Dependency Approver** (named in SRS header per CLAUDE.md §2). The Approver picks.
7. **Resume work after the user picks.** Write the architecture changes and an ADR recording the choice. The ADR's `Approver:` field carries the human's name; `Approval-Date:` is the ISO-8601 timestamp.

## NEEDS_CONTEXT prompt format

When the dependency is complex enough to warrant a written proposal (managed service, payment provider, identity provider), write a research-report-style doc at `docs/research-reports/<dependency-slug>.md` and reference it in the prompt:

```
Status: NEEDS_CONTEXT
Reason: New third-party dependency required: <short description>
Question: <natural-language form, e.g., "Which approach for real-time spectator pub/sub?">
Options:
  [a] <Vendor X> — <one-line trade-off summary>
  [b] <Vendor Y> — <one-line trade-off summary>
  [c] <Self-host / in-house> — <one-line trade-off summary>
Recommended: a
Confidence: medium
Approver: <Designated Dependency Approver from SRS header>
Detailed proposal: docs/research-reports/<slug>.md  (when complex)
```

For trivial decisions (Day.js vs date-fns: both MIT, both well-maintained, both small bundle), the inline multi-choice is enough — no separate doc needed.

## Approver and ADR

After the human picks, write the ADR. The ADR template gains two fields:

```
Approver: <human name, the Designated Dependency Approver>
Approval-Date: <ISO-8601>
```

These are **required** for any ADR that introduces a third-party dependency. They are absent (and need not be present) for ADRs that document non-dependency choices (e.g., "use event sourcing for the audit log").

When a subsequent ADR depends on the same vendor, cite the prior ADR rather than re-approving:

```
Refs: ADR-0007 (approves Stripe for payments)
```

## Hard Rules

- Never include a new third-party dependency in `docs/architecture.md`, `docs/decisions/`, or implementation code without prior ADR + human approval. Halt and request via `NEEDS_CONTEXT`.
- Never approve your own dependency choice. The `Approver` field is a human's name, set by the user through the Orchestrator's clarification flow.
- Never present a single option as a faux choice. Always offer at least 2 — including "build in-house" or "do without" when technically feasible.
- Cite the dimensions you weighed in the proposal. "Trust me, Stripe is the right call" is not an evaluation.
- Once approved via ADR, the approval persists for the project. Re-use without re-approving. Re-approve only if the dependency itself changes materially (vendor sold to private equity, license changed, security incident, abandoned maintenance, etc.).
- OSS dependencies count. First-time inclusion of any OSS library needs approval — even MIT-licensed, well-maintained ones. The discipline of always-asking-once catches the next "we accidentally adopted an abandoned-since-2019 package" before it ships.

## References

- [`references/dimensions.md`](./references/dimensions.md) — per-category evaluation dimensions (paid SaaS, OSS, managed cloud, external API, self-hosted vendor)
- [`references/options-template.md`](./references/options-template.md) — structured option-listing template
- `.claude/skills/solution-defaults/SKILL.md` — check this BEFORE running the evaluation; defaults are org-level pre-approvals and skip the per-project Approver step
- CLAUDE.md §10 — hard rule gating inclusion on ADR + Approver
- `.claude/skills/adr-author/` — ADR format including the Approver field
- `.claude/skills/security-compliance-checklist/` — additional dimensions when the dependency touches auth, payments, PII, account data
- `.claude/agents/_non-sdlc/oq-resolver.md` — if the dependency choice surfaced as a SRS Open Question, OQ resolver can also generate the option set
