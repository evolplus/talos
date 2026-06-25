# Brownfield Onboarding

This file holds CLAUDE.md §12. Section number is preserved across files for cross-referencing.

For workflow contract entry-point, see `CLAUDE.md`. The brownfield onboarding workflow inverts the kit's normal **SRS → architecture → code** flow into **code → architecture → SRS** for projects that exist before kit adoption.

---

## 12. Brownfield Onboarding

The kit's default rules (Path A SDLC) assume SRS precedes architecture precedes code. Real projects often invert this: the code exists for months or years before any team considers kit governance. Adopting the kit onto an existing project requires a different workflow because the load-bearing artifacts must be **extracted** from code rather than **authored** to drive code.

This rule describes the 6-stage brownfield onboarding workflow. It is the only documented path by which the kit's canonical artifacts (SRS, architecture, master-plan) may be produced from an existing codebase rather than from a new requirement.

### When this workflow applies

| Project state | Workflow |
|---|---|
| New project, no code yet | Default — Path A SDLC starting from BA Phase 1 SRS ingestion. |
| Existing project, kit-shape SRS already authored upstream | Default — Path A SDLC starting from BA Phase 1 Ingestion Mode A / B / C / D. |
| **Existing project, no kit-shape SRS, codebase is the source of truth** | **Brownfield Onboarding (§12) — this rule.** Stages 1–6 below. |
| Existing project, partial kit adoption already in progress | Default — Path A SDLC with augment-existing (Mode D); use brownfield only for the parts that haven't been extracted yet. |

### The fundamental tension

In greenfield, the SRS is **prescriptive** — it tells code what to do, and code is verified against it. In brownfield, the extracted SRS is **descriptive** — it documents what code already does. The same artifact (`docs/SRS.md`) plays opposite roles, and downstream agents need to know which they're consuming. The kit handles this via a per-section `Source: authored | extracted | confirmed | deprecated` flag (see `.claude/agents/_templates/_artifacts/srs-template.md`).

Three things code can NEVER reveal alone:

1. **"Why" / value statements.** Code shows what happens; never why anyone wanted it.
2. **Intent vs accident.** A retry-3-times policy in code might be a deliberate SLA or a hack around a bug fixed years ago. Code can't tell you which.
3. **Tribal knowledge.** Customer-support workarounds, hotfix lore, oncall runbook detail — none of this lives in code.

These three gaps mean extracted artifacts CANNOT have the same confidence as authored ones. The brownfield workflow's Stage 4 confirmation gate is what closes the gap, and it CANNOT be auto-approved by any agent.

### Stage 1 — Codebase Archaeology

**Agent:** Codebase Archaeologist (`.claude/agents/_non-sdlc/codebase-archaeologist.md`, Path B5).

**Goal:** Read-only sweep of the codebase + git history + deployed env + existing non-kit docs. Produce an informational report.

**Output:** `docs/archaeology-reports/<topic-slug>.md`. Confidence-tagged inventory of services, public surfaces, route/RPC/job traces, internal dependency edges, API/message spec candidates, message broker producer/consumer logic, data model, cross-cutting concerns, NFR posture, tests, git signals, existing docs, and explicit gap categories.

**Gate:** None in the canonical-artifact sense. Report is informational and is NOT truth by itself. However, `SUFFICIENT_FOR_EXTRACT` requires enough route trace, dependency, API/message contract, and broker/consumer evidence for SA to produce architecture plus extracted contract stubs. A shallow service inventory is `PARTIAL_GAPS` at best.

**Re-dispatch:** Large codebases may need multiple archaeology dispatches (one per service / sub-module). The Orchestrator coordinates.

### Stage 2 — Architecture Extract

**Agent:** Solution Architect (SA) in `extract` mode (`.claude/skills/sa-brownfield-extract/`).

**Goal:** Produce a provisional `docs/architecture.md` documenting the as-built system.

**Output:** `docs/architecture.md` with every section flagged `Source: extracted` and `Confidence: high | medium | low | inferred`; extracted contract stubs under `docs/api-contracts/` for observable HTTP/RPC/GraphQL/WebSocket/message surfaces; ADRs at `docs/decisions/` only for decisions the code irrefutably encodes — never for inferred intent.

**Gate:** Sections marked `Confidence: inferred` get paired open-issues with category `extract-confirmation-pending`. Missing contract stubs for observable routes/messages, or missing producer/consumer logic for brokered flows, are extraction gaps and must be resolved before Stage 3 unless the dispatch is explicitly scoped to `architecture-only`.

**Hard rule:** SA in `extract` mode does NOT propose new architectural decisions. It documents what exists. Recommendations / changes are a future Path A SDLC task.

### Stage 3 — SRS Extract

**Agent:** Business Analyst (BA) in Mode E `reverse-engineer-from-code` (`.claude/skills/ba-mode-reverse-engineer/SKILL.md`).

**Goal:** Derive a kit-shape SRS from the archaeology report + extracted architecture + user-supplied context.

**Output:**

- `docs/SRS.md` with `Status: Draft`, `Source: extracted`, per-section `Source` flags.
- `docs/user-stories/US-NNN.md` (one per observed user-facing surface) with `Source: extracted | Last-Confirmed: TBD`.
- `docs/frs/FR-NNN.md` (one per observed operation) with `Source: extracted | Confidence: <level>` per section.

**Gate:** Phase 1.E halts before flipping `Status` past `Draft`. Stage 4 confirmation is required.

**Hard rules:**

- **`So that <Value>` is never extracted.** Mark `TODO: <team-supplied value statement>` and tag inferred.
- **NRS numbers** come from observed metrics OR are explicitly `unknown — measure during pilot`. Never invent.
- **HIGH-severity security issues** from Stage 1 are blockers — Stage 3 halts; team addresses via Path A first.
- **Route/message contracts come from Stage 2 outputs.** BA derives FR schemas, flows, and error handling from `docs/api-contracts/`, architecture API inventory, route trace rows, and broker/consumer logic. If those are absent for an observable surface, BA raises an extraction gap rather than inventing behavior.

### Stage 4 — Human Confirmation Gate (mandatory, multi-mode)

**Actor:** Human team (Product Owner, Engineering Lead, named domain experts).

**Goal:** Confirm which extracted items reflect actual product intent versus accidental implementation. This is what transforms `Source: extracted` artifacts into kit-canonical `Source: confirmed` artifacts.

**Modes (selected at Stage 3 NEEDS_CONTEXT prompt):**

- **`batch-confirm`** — team attests the extracted set is "good enough" as a starting point. All `Source: extracted` → `Source: confirmed` in one pass with `Last-Confirmed: <date>`. Fast; recommended for first-pass adoption when scope is small.
- **`per-item confirm`** — team reviews each US / FR / NRS item via a generated `docs/brownfield-confirmation/<topic-slug>.md` checklist with Confirm / Reject / Refine slots. Slower; recommended for large or compliance-sensitive systems.
  - Confirm → flag flips to `confirmed`.
  - Reject → flag flips to `deprecated`; cleanup-task open-issue filed per kit iteration pattern.
  - Refine → OQ in SRS §8 filed for rewording; flag stays `extracted` until OQ resolves.
- **`defer`** — team chooses to not batch-confirm; items stay `extracted`. Downstream agents treat extracted-but-unconfirmed items as inferred-only. Future SDLC dispatches that touch unconfirmed items re-confirm them inline as a side effect.

**Hard rule:** Stage 4 CANNOT be auto-approved by any agent. Mirrors the design lifecycle's user-confirmation step at `.claude/rules/parallel-execution.md` §4 Step 4. Skipping or faking confirmation silently encodes bad code as canonical requirements — worse than no kit at all.

### Stage 5 — Master Plan Backfill

**Agent:** Tech Lead (TL).

**Goal:** Produce a master-plan that reflects the as-built state of the codebase.

**Output:** `docs/plan/master-plan.md` + phase + task files. Every task representing shipped code is in `done-deprecated` status (the status introduced for iteration mode at `.claude/rules/master-plan-discipline.md` §8). This acknowledges "this work exists but wasn't kit-governed."

**Optional:** If Stage 4 produced `Reject`s (items marked accidental / deprecated), TL appends cleanup tasks per the kit's iteration cleanup pattern.

**After Stage 5:** the kit's normal forward-work flow is unblocked. New features land via Path A SDLC against the confirmed SRS.

### Stage 6 — Optional Test-Case Backfill

**Agent:** QA-Author in `by-us` mode.

**Goal:** Author markdown TCs + executable specs that codify the as-built behavior for compliance / regression purposes.

**Output:** `docs/test-cases/by-us/<US-NNN>/functional.md` + executable spec stubs per the kit's two-pass `by-us` discipline (`.claude/rules/parallel-execution.md` §4).

**Optional.** Many brownfield projects already have tests (counted in the archaeology report's Tests Inventory). Stage 6 only runs when the team wants the kit's by-us / by-task test discipline applied to the as-built system — typically when the system is compliance-regulated (PII, payments, audit-required) and "we have tests" isn't a defensible answer.

**Hard rule:** Test cases authored against `Source: extracted` (unconfirmed) USes are themselves `Source: extracted`. They become canonical only after the US's Stage 4 confirmation lands.

### Active-development sub-case

When a brownfield project keeps shipping features WHILE onboarding (the common case for storefront / promotion / customer-support / content-site projects), the moving target needs handling:

1. **Freeze the codebase at a snapshot commit for archaeology purposes.** Stages 1–3 run against the snapshot.
2. **New features land via normal SDLC against the extracted SRS.** Path A dispatches refer to the extracted-and-confirmed SRS as the spec; new code goes through normal gates.
3. **Reconcile drift weekly via Phase 4 iteration mode** (`.claude/skills/ba-iteration-planning/SKILL.md`) until extraction stabilizes. The diff between the snapshot's extracted state and the current state is treated as an iteration.

This is the most complex onboarding pattern; expect 60–90 days of iteration reconciliation before the project is "fully kit-shape."

### Documentation-only sub-case

When the goal is NOT kit governance — just reference documentation of an existing system — the workflow stops earlier than the full 6 stages.

**Typical scenarios:**

- Onboarding new engineers to a long-running service (need readable architecture + per-capability docs)
- Compliance audit (need §4.1 Security & Compliance + §6 Activity Logging snapshot)
- Architecture review pre-refactor (need architecture.md showing current state)
- API consumer documentation (need docs/frs/ for an external team's consumption)
- Incident postmortem reference (need a snapshot of the failing system's docs)

**How it works.** Stages 1–3 produce the same artifacts as full onboarding (`docs/archaeology-reports/`, `docs/architecture.md`, `docs/SRS.md` + `docs/user-stories/` + `docs/frs/`). The team simply halts after Stage 3 and does NOT run Stages 4–6. Artifacts remain at `Source: extracted` (not promoted to `confirmed`); `docs/plan/` and `docs/test-cases/` are not produced.

**To make the intent explicit, set `Purpose: documentation` in the SRS header.** Downstream agents see this flag and refuse to dispatch SDLC Path A work against this SRS (the artifact is reference-only, not a governance contract). The kit's Path A hard rules do NOT apply to documentation-purpose SRSs because there's no forward work to govern.

**Stage 4 (confirmation) is OPTIONAL for documentation purpose.** Some teams run it anyway as a quality-validation pass; most skip it. If skipped, the documentation is "as-extracted" — useful but not vetted.

**Staying current.** Documentation-only outputs go stale as the codebase evolves. Two options:

1. **Periodic refresh (recommended).** Re-dispatch the archaeologist + SA extract + BA Mode E quarterly. The Source-Hash field on the SRS header detects drift; if stale, re-run Stages 1–3.
2. **Continuous reconciliation.** Apply the active-development sub-case pattern (snapshot freeze + iteration reconciliation) even though no forward governance is happening. Higher overhead; rarely worth it for doc-only.

**Promoting from documentation to governance later.** A team that started with `Purpose: documentation` may later decide to adopt kit governance. The path:

1. Re-dispatch BA in Mode E with the existing extracted artifacts as input (or refresh first via periodic-refresh if stale).
2. BA flips Phase 1.E NEEDS_CONTEXT to a normal confirmation prompt (batch / per-item / defer).
3. Team accepts accountability for previously-skipped Stage 4 by running it now.
4. After confirmation, set `Purpose: governance` and run Stages 5–6 normally.
5. Path A SDLC dispatches are permitted from this point.

This re-promotion is a deliberate human action — it cannot happen silently or via agent inference. The SRS's Changelog records the transition.

**Scoped dispatch.** Documentation-only use cases often need only a slice — just architecture for an arch review, just §4.1 Security for a compliance audit, just FRs for API consumers. SA extract and BA Mode E both accept a `scope:` dispatch parameter to narrow output:

- `scope: architecture-only` (SA produces architecture.md; no FRs/USes)
- `scope: security-compliance` (BA produces only SRS §4.1 + §6 + relevant cross-cutting from §3.4)
- `scope: api-contracts` (BA produces only docs/frs/; no USes)
- `scope: <service-name>` (limit all stages to the named service, ignore the rest of the monorepo)

Unscoped dispatch (the default) covers the whole codebase. Scoped reduces cycle time when only a slice is needed.

### Hard Rules

- Stages 1–6 are sequential. Stage 2 cannot start before Stage 1 produces at least one `SUFFICIENT_FOR_EXTRACT` or `PARTIAL_GAPS` report. Stage 3 cannot start before Stage 2 produces `docs/architecture.md`. Etc.
- Stage 4 (human confirmation) is mandatory. No agent may auto-approve it. No SDLC Path A work may start against `Source: extracted` (unconfirmed) artifacts.
- HIGH-severity security findings from Stage 1 block downstream stages until addressed via Path A.
- Extracted artifacts retain provenance forever. `Source: confirmed (originally extracted YYYY-MM-DD)` is the long-term flag, not just `Source: confirmed`.
- The kit's normal Path A hard rules (§10) re-apply once Stage 4 completes. Pre-Stage-4, the rules are relaxed because the gate hasn't fired — but pre-Stage-4 artifacts also can't be used to validate code.
- Greenfield projects MUST NOT use this workflow. Path A from BA Phase 1 ingestion is the only correct flow when no codebase exists. Mis-routing to brownfield introduces the Source-flag overhead for no benefit.

### Interaction with iteration mode

After Stage 5, the project is in normal kit-governance. Subsequent SRS changes flow through the kit's iteration mode (`.claude/skills/ba-ingestion-pipeline/SKILL.md` Phase 1.Z + `.claude/skills/ba-iteration-planning/SKILL.md`):

- A new PM-authored SRS version arrives → iteration trigger fires → Phase 4 produces diff + dispatch plan.
- During the iteration, items that were `Source: extracted (originally) → Source: confirmed` may transition to `Source: deprecated` via the iteration's deprecation flow if the new version retires them.
- Cleanup tasks for deprecated extracted items follow the same pattern as cleanup tasks for greenfield deprecations.

### What this workflow does NOT solve

- **Tribal-knowledge gaps stay gaps.** Customer-support workarounds and oncall lore won't surface from code. Plan for 60–90 days post-onboarding for these to surface via incidents and iteration cycles.
- **Confidence vs scope trade-off.** Per-item confirmation is rigorous but slow; batch-confirm is fast but lower-confidence. There's no automated tuning.
- **Bad code → bad SRS.** If the codebase is genuinely badly designed, the extracted SRS documents the badness. The kit's Stage 4 gives the team a chance to mark items deprecated and add cleanup tasks; if the team doesn't, the kit faithfully preserves the badness.

### References

- `.claude/agents/_non-sdlc/codebase-archaeologist.md` — Stage 1 agent
- `.claude/skills/sa-brownfield-extract/` — Stage 2 mode
- `.claude/skills/ba-mode-reverse-engineer/SKILL.md` — Stage 3 mode
- `.claude/rules/task-type-routing.md` §11 — Path B5 routing
- `.claude/rules/master-plan-discipline.md` §8 — `done-deprecated` status used in Stage 5
- `.claude/rules/parallel-execution.md` §4 — design lifecycle (analogous human-confirmation pattern)
- `.claude/agents/_templates/_artifacts/srs-template.md` — `Source:` per-section flag schema
