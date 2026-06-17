---
name: solution-defaults
description: Org-level default technology choices for common architectural components (database, cache, queue, etc.). Consult before evaluating third-party dependencies — defaults are pre-approved at the org level; using them skips per-project human approval. Deviating from a default still requires the full third-party-dependency-evaluation flow.
agents: [sa, be-dev, fe-dev]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Solution Defaults

## When to use

You are SA producing architecture, or a Dev about to add a dependency. **Check this skill before** running through `.claude/skills/third-party-dependency-evaluation/`. The defaults in [`references/defaults-table.md`](./references/defaults-table.md) are pre-approved at the org level — using them skips per-project human approval. Deviating from a default, or using a category not covered, still requires the full evaluation + `NEEDS_CONTEXT` flow.

## How defaults interact with the approval flow

```
SA / Dev needs a dependency
    ↓
Step 1 — Open references/defaults-table.md
    ├── Category has a default (Status: ✓) AND you'll use it
    │     → Use it. Write ADR citing this skill as the approval source. No NEEDS_CONTEXT.
    ├── Category has a default but row is Status: ⚠ (starter, not yet confirmed)
    │     → Treat as a hint, not binding. Full .claude/skills/third-party-dependency-evaluation/ flow.
    ├── Category has a default (Status: ✓) BUT you need to deviate
    │     → Full .claude/skills/third-party-dependency-evaluation/ flow.
    │     → ADR records project's Designated Dependency Approver + the deviation reason.
    └── Category not in the table
          → Full .claude/skills/third-party-dependency-evaluation/ flow.
          → ADR records project's Designated Dependency Approver.
          → Consider proposing the result as a new default — see "Adding a new default" below.
```

## Where the defaults live

The table of pre-approved defaults is in [`references/defaults-table.md`](./references/defaults-table.md), separated from this skill so the table can be edited and reviewed independently of the procedure.

The table has five columns:

- **Category** — the dependency kind (relational DB, cache, queue, etc.)
- **Default** — the chosen vendor / technology
- **Rationale** — why this default exists
- **Deviate when** — concrete conditions under which the default does *not* apply
- **Status** — `✓ confirmed` (binding) or `⚠ starter` (placeholder, not yet ratified)

## Procedure for SA / Dev

1. Open [`references/defaults-table.md`](./references/defaults-table.md).
2. Find the matching row for the dependency category you need. If no row matches, proceed to step 5.
3. Read the row's `Status`:
   - `⚠ starter` → treat as a hint, not binding. Proceed to step 5.
   - `✓ confirmed` → continue to step 4.
4. Evaluate the row's `Deviate when` condition:
   - The condition does **not** apply → use the default. Write an ADR for the choice with `Approver: Org Engineering Standards (per .claude/skills/solution-defaults/)` and `Approval-Date: <date this default was declared per the Changelog>`. No `NEEDS_CONTEXT` needed. **Done.**
   - The condition **does** apply, or you're not sure → proceed to step 5.
5. **Trigger the full evaluation flow** in `.claude/skills/third-party-dependency-evaluation/`. The proposal MUST cite this skill: "Default for this category is X per `.claude/skills/solution-defaults/references/defaults-table.md`; we are deviating because Y" or "No default exists for this category."

## Writing the ADR for a default-vendor choice

```markdown
# ADR-NNNN: Use <Default> for <use case>

- Status: Accepted
- Date: <ISO-8601>
- Author: SA
- Approver: Org Engineering Standards (per `.claude/skills/solution-defaults/`)
- Approval-Date: <date the default was declared — see the skill's Changelog>

## Context
We need a <category> for <use case>. The org default applies.

## Decision
We will use <Default vendor> per `.claude/skills/solution-defaults/references/defaults-table.md`.

## Consequences
- Positive: matches org tooling, ops playbooks, hiring pipeline
- Negative: any constraints of the default (cite from the table's Rationale or Deviate-when)
- Neutral: standard operational surface

## Alternatives Considered
- (Briefly note the alternatives the table's Deviate-when lists; explain why none of the deviation conditions apply.)
```

## Adding a new default — governance

A new row in the table or a status change (⚠ → ✓) requires:

1. **Real-project surface.** Don't add speculative defaults. Add when a project actually needs the category and the choice should be the same next time.
2. **Eng standards review.** A new default is an org-level pre-approval. It needs the same sign-off rigor as the `Designated Dependency Approver` per CLAUDE.md §2 — but at the org level, not the project level.
3. **Append the Changelog.** Every change to the table appends a row to the Changelog in `references/defaults-table.md`, dated today, with the human Approver named.
4. **Append, don't rewrite.** Defaults that get deprecated transition to `Status: Deprecated` with a `Superseded by:` pointer — never delete history.

See `references/defaults-table.md` § How to update this file for the mechanical edit steps.

## Hard Rules

- Never use memcache as a cache. Redis is the cache. Period. (Encoded in the table; called out here so it's impossible to miss.)
- Never roll a custom IdP for end-user identity. Account/Passport is the org identity backbone.
- Never silently deviate from a `✓ confirmed` default. Deviation requires `NEEDS_CONTEXT` + project Approver + ADR documenting the specific deviation reason.
- Never treat a `⚠ starter` row as binding. Until ratified, it's a hint — still requires per-project approval via the full evaluation flow.
- Never add a new default unilaterally. New defaults go through the governance process above and append to the Changelog.
- Never edit the table without appending a Changelog row. Stale defaults without provenance are worse than no defaults.

## References

- [`references/defaults-table.md`](./references/defaults-table.md) — the table itself + changelog (edit here when adding/changing defaults)
- `.claude/skills/third-party-dependency-evaluation/SKILL.md` — what to do when you deviate from a default or hit a category not in the table
- `.claude/skills/adr-author/` — ADR format, including the default-vendor ADR pattern
- CLAUDE.md §10 — hard rule that all third-party dependencies need ADR + Approver (defaults satisfy this via the skill citation)
- CLAUDE.md §2 — Designated Dependency Approver for per-project deviations
