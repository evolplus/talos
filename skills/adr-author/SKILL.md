---
name: adr-author
description: How to write an Architecture Decision Record under docs/decisions/. Consult when the SA needs to record a non-trivial architectural choice during architecture authoring, especially when the choice involves a third-party dependency that requires human approval.
agents: [sa]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# ADR Author

## When to use

You are the SA, drafting `docs/architecture.md` or revising it during change synchronization. You face a choice that would surprise a new engineer joining the project, or that involves a trade-off you'd want a successor to understand. Per CLAUDE.md §3.2: every non-trivial choice gets an ADR. This skill defines the format and the trigger.

## Inputs and outputs

- **Inputs:** a candidate architectural choice and the alternatives you're weighing
- **Outputs:** a numbered ADR file under `docs/decisions/`, in the format in [`references/template.md`](./references/template.md)

## When a choice is "non-trivial"

A choice deserves an ADR when at least one is true:

- It's a one-way door (hard to reverse later — pricing model, data partition strategy, primary key shape)
- It commits the team to a vendor or stack (Postgres vs DynamoDB, Stripe vs Adyen, REST vs gRPC)
- It contradicts a previous default (the team usually does X; for this feature we're doing Y)
- A reasonable engineer would assume the opposite default
- It encodes a trade-off (cost vs latency, simplicity vs flexibility, build vs buy)

If a choice is "the obvious thing the team always does," no ADR. If you can't tell, write the ADR — it's cheap.

## Third-party dependency ADRs (require human Approver)

When the ADR introduces a **third-party dependency** that has not been approved in a prior ADR for this project, the ADR gains two required fields:

- `Approver: <human name>` — the Designated Dependency Approver named in SRS header per CLAUDE.md §2. Set by the user through the Orchestrator's `NEEDS_CONTEXT` clarification flow; never set by the agent.
- `Approval-Date: <ISO-8601>` — the date the human approved the choice.

Per CLAUDE.md §10 hard rule, you must NOT write the ADR with `Status: Accepted` until the human has approved. The flow:

1. While drafting architecture, you identify a needed third-party dependency.
2. Use `.claude/skills/third-party-dependency-evaluation/SKILL.md` to evaluate options.
3. Halt and return `NEEDS_CONTEXT` to the Orchestrator with the multi-choice proposal.
4. The Orchestrator relays to the Designated Dependency Approver.
5. The Approver picks an option.
6. Resume work. Write the ADR with `Status: Accepted`, `Approver: <name>`, `Approval-Date: <date>`.

**Default-vendor ADRs** are a sub-case: when the dependency is the org-level default per `.claude/skills/solution-defaults/`, the ADR's `Approver` field cites the skill rather than naming a per-project human:

```
Approver: Org Engineering Standards (per .claude/skills/solution-defaults/)
Approval-Date: <date the default was declared — see the skill's Changelog>
```

Defaults are pre-approved at the org level; no `NEEDS_CONTEXT` is needed for the choice. See `.claude/skills/solution-defaults/` for the table of pre-approved defaults and deviation conditions.

For non-dependency ADRs (e.g., "use event sourcing for the audit log", "primary-key UUIDv7 vs ULID"), the `Approver` field is **not required**. The ADR follows the normal Proposed → Accepted path with SA + reviewers.

When a later ADR depends on the same vendor approved by a prior ADR, cite the prior ADR's approval rather than re-triggering the flow:

```
Refs: ADR-0007 (approves Stripe for payments)
```

## Procedure

1. Choose the next sequential number from `docs/decisions/`. Filenames: `0001-<kebab-title>.md`, `0002-<kebab-title>.md`, etc. Numbers are immutable; never renumber.
2. If the ADR introduces a new third-party dependency, follow the approval flow above before writing.
3. Use the template in [`references/template.md`](./references/template.md). Include `Approver:` and `Approval-Date:` if applicable.
4. Set Status to `Proposed` if the choice is still under review; `Accepted` once SA + reviewers agree (and the human Approver has confirmed for dependency ADRs).
5. Reference the ADR from the relevant section of `docs/architecture.md` (e.g., "Session storage: Postgres — see ADR-0007").
6. When a later decision supersedes this one, update *both* files: the new ADR cites `Supersedes ADR-XXXX`; the old ADR's Status changes to `Superseded by ADR-YYYY` (do not delete the old file).

## Hard rules

- Never delete an ADR. Status changes preserve history; deletion erases it.
- Never renumber an ADR. References to ADR-0007 in code comments and docs would silently rot.
- Status `Accepted` requires explicit reviewer sign-off (SA can self-accept low-stakes non-dependency ADRs; high-stakes choices need a second engineer's review).
- For third-party-dependency ADRs: `Accepted` is impossible without the `Approver` field populated. The human is the gate.
- An ADR without a `Consequences` section is incomplete — every choice has consequences, including good ones. List both.
- An ADR without `Alternatives Considered` is incomplete. If you didn't consider alternatives, you didn't make a decision; you made a default.

## References

- [`references/template.md`](./references/template.md) — copy-paste ADR template, including the Approver fields and worked examples
- CLAUDE.md §3.2 — SA exit criteria (every non-trivial choice → ADR)
- CLAUDE.md §10 — hard rule that third-party dependencies require human Approver
- `.claude/skills/solution-defaults/SKILL.md` — org-level pre-approved defaults; check before triggering the third-party-dependency-evaluation flow
- `.claude/skills/third-party-dependency-evaluation/SKILL.md` — what counts as third-party, dimensions to weigh, NEEDS_CONTEXT prompt format
- Michael Nygard's original ADR essay (external) — the format here follows his
