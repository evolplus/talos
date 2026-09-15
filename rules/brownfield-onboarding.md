# Brownfield Onboarding

This file holds CLAUDE.md §12. Section number is preserved across files for cross-referencing.

For workflow contract entry-point, see `CLAUDE.md`. The brownfield onboarding workflow inverts the kit's normal **SRS → architecture → code** flow into **code → architecture → SRS** for projects that exist before kit adoption.

---

## 12. Brownfield Onboarding

The kit's default rules (Path A SDLC) assume SRS precedes architecture precedes code. Real projects often invert this: the code exists for months or years before any team considers kit governance. Adopting the kit onto an existing project requires a different workflow because the load-bearing artifacts must be **extracted** from code rather than **authored** to drive code.

This rule describes the brownfield onboarding workflow: six stages, three evidence sub-stages, and one independent validation gate. It is the only documented path by which the kit's canonical artifacts (SRS, architecture, master-plan) may be produced from an existing codebase rather than from a new requirement.

The workflow rests on one division of labour. Machines find what is **missing or fabricated** — mechanical, exhaustive, cheap to re-run. Humans decide what was **intended** — judgement, and the only part of the problem that does not scale. Every stage below is placed to keep those two jobs apart, because the way brownfield onboardings fail is by spending human attention on machine work and running out of it before the intent questions are asked.

### When this workflow applies

| Project state | Workflow |
|---|---|
| New project, no code yet | Default — Path A SDLC starting from BA Phase 1 SRS ingestion. |
| Existing project, kit-shape SRS already authored upstream | Default — Path A SDLC starting from BA Phase 1 Ingestion Mode A / B / C / D. |
| **Existing project, no kit-shape SRS, codebase is the source of truth** | **Brownfield Onboarding (§12) — this rule.** Stages 1 (1a/1b/1c) → 2 → 3 → 3.5 → 4 → 5 → 6 below. |
| Existing project, partial kit adoption already in progress | Default — Path A SDLC with augment-existing (Mode D); use brownfield only for the parts that haven't been extracted yet. |

### The fundamental tension

In greenfield, the SRS is **prescriptive** — it tells code what to do, and code is verified against it. In brownfield, the extracted SRS is **descriptive** — it documents what code already does. The same artifact (`docs/SRS.md`) plays opposite roles, and downstream agents need to know which they're consuming. The kit handles this via a per-section `Source: authored | extracted | confirmed | deprecated` flag (see `.claude/agents/_templates/_artifacts/srs-template.md`).

Three things code can NEVER reveal alone:

1. **"Why" / value statements.** Code shows what happens; never why anyone wanted it.
2. **Intent vs accident.** A retry-3-times policy in code might be a deliberate SLA or a hack around a bug fixed years ago. Code can't tell you which.
3. **Tribal knowledge.** Customer-support workarounds, hotfix lore, oncall runbook detail — none of this lives in code.

These three gaps mean extracted artifacts CANNOT have the same confidence as authored ones. The brownfield workflow's Stage 4 confirmation gate is what closes the gap, and it CANNOT be auto-approved by any agent.

Two of the three gaps are narrower than they look. Code is silent about why, but **history usually is not** — the commit that introduced a retry count, the PR that argued about it, and the ticket it referenced are frequently still there. Stage 1b mines exactly that, turning a share of the human gate's questions from "explain this to us" into the far cheaper "confirm this still holds." The third gap — tribal knowledge — has no such shortcut and stays a gap.

### Stage 1 — Evidence gathering (three sub-stages)

**Agent:** Codebase Archaeologist (`.claude/agents/_non-sdlc/codebase-archaeologist.md`, Path B5).

Stage 1 is split into three sub-stages because the three kinds of evidence have different cost, different reproducibility, and different failure modes. Collapsing them makes it impossible to tell a thing that is absent from the system apart from a thing that is merely absent from the report.

#### Stage 1a — Mechanical inventory (Tier 1)

**Skill:** `.claude/skills/codebase-inventory/SKILL.md`.

**Goal:** Enumerate what is demonstrably there, by recorded command rather than judgement. Same commit in, same manifest out.

**Output:** `docs/archaeology-reports/<topic-slug>.inventory.md` — routes/RPC/jobs, broker channels (producer and consumer sides as separate rows), persistent schema, external egress, deployables, production libraries, test specs. Each row carries a stable `INV-*` ID, a file:line, and the command that produced it. Header pins `Snapshot-Commit`.

**Gate:** Clean working tree and a pinned snapshot commit. An inventory taken over uncommitted changes is not reproducible and is refused.

**Why first.** Every downstream stage is generative, and generative processes fail silently by omission: nothing in the output points at what is not in the output. The manifest is the only artifact in the workflow against which absence is detectable, and Stage 3.5 reconciles against it.

#### Stage 1b — Intent archaeology

**Skill:** `.claude/skills/intent-archaeology/SKILL.md`.

**Goal:** For every item heading toward `Confidence: inferred`, trace the "why" through `git log -S`, blame, the merge commit, the PR description, and the linked ticket **before** it becomes a question for a human.

**Output:** `docs/archaeology-reports/<topic-slug>.intent.md` — one row per probed item with verdict `documented` / `circumstantial` / `accidental` / `not-found`, verbatim evidence, and its reference.

**Gate:** None; informational. But Stage 3.5 Check 5 refuses any `inferred` item carrying no `Intent-Trace:`, so skipping this sub-stage does not save work — it defers it and makes it more expensive.

**Why it matters.** The Stage 4 gate is the binding constraint on adoption; every item resolved here is an item nobody has to be interviewed about, and an `accidental` verdict is how a team prunes dead behavior instead of enshrining it.

#### Stage 1c — Runtime evidence (optional; high value where available)

**Goal:** Reconcile the static picture against what the system actually does. Read-only access to access logs, APM traces, broker lag/consumer metrics, or gateway metrics.

**Output:** a `## Runtime Evidence` section in the interpretive report: per-surface request volume over a stated window, observed P50/P95/P99 and error rates, consumer lag and DLQ depth per channel, the empirical call graph, and the list of surfaces with **zero traffic**.

**Gate:** None. Skipped when no observability access exists — say so explicitly rather than silently omitting the section.

**Why it matters.** It supplies the NRS figures that would otherwise be `unknown -- measure during pilot`; it identifies dead surfaces, which is how extracted scope shrinks instead of grows on a long-lived system; and a static call graph contradicted by traces is a finding worth more than either source alone.

#### Stage 1 interpretive report (Tier 2)

**Output:** `docs/archaeology-reports/<topic-slug>.md`. Confidence-tagged read of the system: services, public surfaces, route/RPC/job traces, internal dependency edges, API/message spec candidates, message broker producer/consumer logic, data model, cross-cutting concerns, NFR posture, tests, git signals, existing docs, and explicit gap categories. Every claim cites an `INV-*` ID or a file:line.

**Gate:** None in the canonical-artifact sense. The report is informational and is NOT truth by itself. `SUFFICIENT_FOR_EXTRACT` requires enough route trace, dependency, API/message contract, and broker/consumer evidence for SA to produce architecture plus extracted contract stubs. A shallow service inventory is `PARTIAL_GAPS` at best.

**Re-dispatch:** Large codebases may need multiple archaeology dispatches (one per service / sub-module). The Orchestrator coordinates. Re-runs of Stage 1a additionally emit `<topic-slug>.inventory-diff.md`, so re-extraction is a diff rather than a redo.

### Stage 2 — Architecture Extract

**Agent:** Solution Architect (SA) in `extract` mode (`.claude/skills/sa-brownfield-extract/`).

**Goal:** Produce a provisional `docs/architecture.md` documenting the as-built system.

**Output:** `docs/architecture.md` with every section flagged `Source: extracted` and `Confidence: high | medium | low | inferred`, plus the provenance header block (`Snapshot-Commit`, `Extracted-From`, `Covers-Inventory`, `Source-Hash`) per § Provenance and drift; extracted contract stubs under `docs/api-contracts/` for observable HTTP/RPC/GraphQL/WebSocket/message surfaces; ADRs at `docs/decisions/` only for decisions the code irrefutably encodes — never for inferred intent.

**Gate:** Sections marked `Confidence: inferred` get paired open-issues with category `extract-confirmation-pending`. Missing contract stubs for observable routes/messages, or missing producer/consumer logic for brokered flows, are extraction gaps and must be resolved before Stage 3 unless the dispatch is explicitly scoped to `architecture-only`.

**Hard rule:** SA in `extract` mode does NOT propose new architectural decisions. It documents what exists. Recommendations / changes are a future Path A SDLC task.

### Stage 3 — SRS Extract

**Agent:** Business Analyst (BA) in Mode E `reverse-engineer-from-code` (`.claude/skills/ba-mode-reverse-engineer/SKILL.md`).

**Goal:** Derive a kit-shape SRS from the archaeology report + extracted architecture + user-supplied context.

**Output:**

- `docs/SRS.md` with `Status: Draft`, `Source: extracted`, per-section `Source` flags.
- `docs/user-stories/US-NNN.md` — **one per capability, not one per endpoint**, each carrying `Covers-Inventory:` for the `INV-*` surfaces it subsumes, with `Source: extracted | Last-Confirmed: TBD`. A one-to-one endpoint mapping cements today's implementation shape as tomorrow's requirement, and inflates the Stage 4 gate past the point where anyone finishes it.
- `docs/frs/FR-NNN.md` (one per observed operation, tagged `as-built` rather than as a forward contract) with `Source: extracted | Confidence: <level>` per section.

Every extracted artifact carries the provenance header block (§ Provenance and drift). Every `Confidence: inferred` item and every `TODO: <team must confirm>` marker carries an `Intent-Trace:` field sourced from Stage 1b.

**Gate:** Phase 1.E halts before flipping `Status` past `Draft`, and BA does NOT build its own confirmation checklist — it is the author, so the ranking must come from somewhere independent. Stage 3.5 validation runs next; Stage 4 confirmation follows only on a `qualified` verdict.

**Hard rules:**

- **`So that <Value>` is never extracted.** Mark `TODO: <team-supplied value statement>` and tag inferred.
- **NRS numbers** come from observed metrics OR are explicitly `unknown — measure during pilot`. Never invent.
- **HIGH-severity security issues** from Stage 1 are blockers — Stage 3 halts; team addresses via Path A first.
- **Route/message contracts come from Stage 2 outputs.** BA derives FR schemas, flows, and error handling from `docs/api-contracts/`, architecture API inventory, route trace rows, and broker/consumer logic. If those are absent for an observable surface, BA raises an extraction gap rather than inventing behavior.

### Stage 3.5 — Extraction Validation (independent gate, mandatory)

**Agent:** Extraction Validator (`.claude/agents/_templates/extraction-validator.md`).

**Goal:** Verify that the extracted architecture, contract stubs, and SRS are faithful to the code — complete, sourced, and honestly tagged — before a single hour of human attention is spent at Stage 4.

**Output:** `docs/extraction-validation-reports/<topic-slug>-v<n>.md` (append-only, one run per dispatch) and, on a qualified governance verdict, the risk-ranked `docs/brownfield-confirmation/<topic-slug>.md` that Stage 4 consumes.

**Gate:** Seven checks, all run every dispatch; Checks 1–6 are blocking:

1. **Citation resolution** — every `Extracted-From` path, `Covers-Inventory` ID, `x-source-evidence` value, and `file:line` resolves at the snapshot commit. A citation that does not resolve is fabrication.
2. **Reverse coverage** — every `INV-*` ID is either covered by a kit artifact or explicitly dispositioned (`out-of-scope` / `dead` / `internal` / `deprecated`) with evidence. The pass condition is zero undispositioned IDs, **not** a coverage percentage: a percentage is gameable and never tells you which surface was missed.
3. **Contract-stub coverage** — every `INV-R-*` appears as an operation in a `docs/api-contracts/` artifact of the declared format, every `INV-E-*` appears as a channel with **both** producer and consumer bindings, and no extracted stub is `Frozen`. Stage 2 already declares this rule; this is where it acquires teeth.
4. **Forward traceability + confidence-tier conformance** — every substantive claim carries an inventory ID, a resolvable file:line, or a test reference; and the confidence tag is a function of evidence class, not a self-assessment (`high` requires an inventory ID or a passing test; `inferred` requires an intent-trace and a paired OQ).
5. **Intent-trace completeness** — no `inferred` item reaches the humans without a Stage 1b trace. Missing traces route back to Stage 1b, not forward to a person.
6. **Invention detection** — content tracing to no code observation and no intent evidence. Fluent `So that <Value>` clauses are the prime suspect, since the kit forbids extracting value from code at all.
7. **Risk-ranked confirmation set** — built on a qualified governance verdict; the input Stage 4 works from.

On `qualified`, the validator writes `Extraction-Validated: <date> | run <N> | commit <SHA>` to the architecture and SRS headers. That header is what unblocks Stage 4.

**Why this stage exists.** Brownfield was the only place in the kit where the author was also the approver. `srs-source-validator` checks the SRS against `docs/requirements/`, which brownfield leaves empty — the source corpus is the codebase. `architecture-validator` presupposes a signed-off SRS and its brownfield carve-out skips the coverage check outright. So the extracted architecture, its contract stubs, and the extracted SRS were self-attested, with a human reading the whole output as the only defense. That defense is misallocated: people are sharp at spotting a claim that is wrong and nearly blind to a surface that is absent. Machines find the absences; humans decide intent.

**Applies to `documentation` purpose too.** Checks 1–6 run. A reference document that omits a third of the surface is worse than no document, because people will trust it. Only Check 7 is skipped.

### Stage 4 — Human Confirmation Gate (mandatory, multi-mode)

**Actor:** Human team (Product Owner, Engineering Lead, named domain experts).

**Precondition:** Stage 3.5 returned `qualified`. Running this gate over an unvalidated extraction spends the organization's scarcest resource on defects a machine should have caught.

**Goal:** Confirm which extracted items reflect actual product intent versus accidental implementation. This is what transforms `Source: extracted` artifacts into kit-canonical `Source: confirmed` artifacts.

**Modes (selected at the Stage 3 NEEDS_CONTEXT prompt):**

- **`risk-ranked` (DEFAULT, recommended)** — the team works `docs/brownfield-confirmation/<topic-slug>.md`, the ranked set the Extraction Validator produced, top-down against a stated budget. Band 1 (uncertain AND consequential — auth / money / PII / retention, or contested by runtime evidence) and Band 2 (inside the blast radius of planned forward work) are confirmed; Band 3 stays `Source: extracted` and confirms lazily on touch. Items are phrased as assertions to falsify, and split by audience: capability-level claims to Product, mechanism-level claims to Engineering.
- **`batch-confirm`** — team attests the whole extracted set is "good enough" in one pass. Fast, and appropriate only when scope is genuinely small. At any real scale this is a rubber stamp, and a rubber stamp over extracted artifacts is worse than no kit at all.
- **`per-item confirm`** — every item reviewed individually via the same confirmation file. Rigorous; tractable only for compliance-regulated systems or a single narrow slice.
  - Confirm → flag flips to `confirmed`.
  - Reject → flag flips to `deprecated`; cleanup-task open-issue filed per kit iteration pattern.
  - Refine → OQ in SRS §8 filed for rewording; flag stays `extracted` until the OQ resolves.
- **`defer`** — nothing is confirmed now; items stay `extracted`. Downstream agents treat extracted-but-unconfirmed items as inferred-only. Future SDLC dispatches that touch unconfirmed items re-confirm them inline as a side effect.

**Why ranked is the default.** The other three modes are the two ends of a spectrum with nothing in the middle: batch-confirm does not scale in *quality*, per-item does not scale in *time*, and defer defers everything including the items most likely to be wrong. Ranking is what makes the gate finishable — and a gate with a stated budget ("38 items, two 90-minute sessions, these four people") is a gate the organization will actually schedule. An unbounded gate is a gate nobody walks through, which is how brownfield onboardings die.

**Ask people to falsify, not to approve.** Every item is written as a claim with True / False / Don't know. Reviewers are reliable at rejecting a wrong statement and unreliable at ratifying a correct one; a checklist of approvals harvests assent, not knowledge.

**Hard rule:** Stage 4 CANNOT be auto-approved by any agent. Mirrors the design lifecycle's user-confirmation step at `.claude/rules/parallel-execution.md` §4 Step 4. Skipping or faking confirmation silently encodes bad code as canonical requirements — worse than no kit at all. Stage 3.5's `qualified` verdict is **not** a substitute: it certifies that the extraction is faithful to the code, and says nothing about whether the code does the right thing.

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
3. **Reconcile drift via the inventory diff, not by re-reading the codebase.** Re-run Stage 1a at the current commit; `<topic-slug>.inventory-diff.md` names exactly which `INV-*` IDs changed, and therefore exactly which extracted artifacts need revisiting (§ Provenance and drift). Feed that set through Phase 4 iteration mode (`.claude/skills/ba-iteration-planning/SKILL.md`).

This is the most complex onboarding pattern, but the diff is what keeps it bounded: reconciliation cost tracks the size of the change, not the size of the system. Prefer slicing it — take one bounded context through Stages 1–4 to completion before starting the next, so governance value lands in the first week rather than after the whole system is mapped.

### Documentation-only sub-case

When the goal is NOT kit governance — just reference documentation of an existing system — the workflow stops earlier than the full 6 stages.

**Typical scenarios:**

- Onboarding new engineers to a long-running service (need readable architecture + per-capability docs)
- Compliance audit (need §4.1 Security & Compliance + §6 Activity Logging snapshot)
- Architecture review pre-refactor (need architecture.md showing current state)
- API consumer documentation (need docs/frs/ for an external team's consumption)
- Incident postmortem reference (need a snapshot of the failing system's docs)

**How it works.** Stages 1–3.5 produce the same artifacts as full onboarding (`docs/archaeology-reports/`, `docs/architecture.md`, `docs/api-contracts/`, `docs/SRS.md` + `docs/user-stories/` + `docs/frs/`), **including the Stage 3.5 validation pass** — the team halts after Stage 3.5 and does NOT run Stages 4–6. Stage 3.5 is not waivable here: reference documentation is trusted precisely because nobody re-derives it, so an omission in a doc-only extraction is more dangerous than one in a governance extraction, not less. Artifacts remain at `Source: extracted` (not promoted to `confirmed`); `docs/plan/` and `docs/test-cases/` are not produced.

**To make the intent explicit, set `Purpose: documentation` in the SRS header.** Downstream agents see this flag and refuse to dispatch SDLC Path A work against this SRS (the artifact is reference-only, not a governance contract). The kit's Path A hard rules do NOT apply to documentation-purpose SRSs because there's no forward work to govern.

**Stage 4 (confirmation) is OPTIONAL for documentation purpose.** Some teams run it anyway as a quality-validation pass; most skip it. If skipped, the documentation is "as-extracted" — useful but not vetted.

**Staying current.** Documentation-only outputs go stale as the codebase evolves. Two options:

1. **Diff-driven refresh (recommended).** Re-run Stage 1a at the current commit and read `<topic-slug>.inventory-diff.md`. Only the artifacts whose `Covers-Inventory` IDs changed, or whose `Source-Hash` no longer matches their `Extracted-From` paths, need re-extraction (§ Provenance and drift). Quarterly is a reasonable cadence; on the default branch the hash check is cheap enough to run in CI and flag stale artifacts on the commit that staled them.
2. **Continuous reconciliation.** Apply the active-development sub-case pattern (snapshot freeze + iteration reconciliation) even though no forward governance is happening. Higher overhead; rarely worth it for doc-only.

**Promoting from documentation to governance later.** A team that started with `Purpose: documentation` may later decide to adopt kit governance. The path:

1. Re-dispatch BA in Mode E with the existing extracted artifacts as input (or refresh first via periodic-refresh if stale).
2. BA flips Phase 1.E NEEDS_CONTEXT to a normal confirmation prompt (risk-ranked / batch / per-item / defer), and Stage 3.5 re-runs against the refreshed artifacts.
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

### Provenance and drift

Extracted documentation has a half-life. The onboarding produces a snapshot; the codebase keeps moving; six months later nobody can tell which parts of `docs/architecture.md` are still true, so the team stops trusting all of it. That is the normal end state of reverse-engineering projects, and it is what decides whether this workflow was worth doing.

The fix is to make staleness **detectable per artifact** rather than per document.

**Every extracted artifact carries a provenance header block:**

```
Source: extracted
Snapshot-Commit: <full SHA at extraction>
Extracted-From: <code paths this artifact was derived from>
Covers-Inventory: INV-R-012, INV-R-013, INV-T-004
Source-Hash: <hash of the Extracted-From paths at Snapshot-Commit>
Extraction-Validated: <date | run N | commit SHA>   # written by Stage 3.5 only
Intent-Trace: <verdict + ref>                        # on inferred items only
```

Extracted contract stubs carry the same block, alongside the `x-source-evidence` file:line values the stub format already requires.

Three things follow, and they are why the ceremony earns its keep:

1. **Coverage becomes computable.** `Covers-Inventory` is what Stage 3.5 Check 2 reconciles as a set difference. Without it, "did we document everything" is an opinion.
2. **Drift becomes a diff.** Re-run Stage 1a at the current commit; the inventory diff names the changed `INV-*` IDs; the artifacts citing those IDs are exactly the ones that went stale. Re-extraction is surgical — you never re-read the whole system to find out that one table changed.
3. **Staleness becomes a check, not a memory.** Recomputing `Source-Hash` against `Extracted-From` at HEAD is cheap enough to run in CI on the default branch, so a stale artifact is flagged on the commit that staled it — the only moment anyone has the context to fix it.

**Provenance survives confirmation.** After Stage 4 the flag becomes `Source: confirmed (originally extracted YYYY-MM-DD)` and the rest of the block stays. A confirmed artifact still drifts, and a reader two years out still needs to know that this section was read off code rather than authored ahead of it.

### Hard Rules

- Stages are sequential. Stage 1b and 1c may not start before 1a pins a snapshot commit. Stage 2 cannot start before Stage 1 produces at least one `SUFFICIENT_FOR_EXTRACT` or `PARTIAL_GAPS` report. Stage 3 cannot start before Stage 2 produces `docs/architecture.md` plus contract stubs for the observable surfaces. Stage 4 cannot start before Stage 3.5 returns `qualified`.
- **Stage 3.5 is mandatory and cannot be waived**, including for `documentation` purpose. No agent may self-certify its own extraction; the Extraction Validator is the sole writer of `Extraction-Validated`. The one relaxation for documentation purpose is that the risk-ranked confirmation set is not produced.
- **Every stage runs against the pinned snapshot commit**, never the working tree. Mixing commits produces phantom gaps and phantom fixes in equal measure.
- Stage 4 (human confirmation) is mandatory. No agent may auto-approve it, and a `qualified` Stage 3.5 verdict is not a substitute — it certifies fidelity to the code, not correctness of the code. No SDLC Path A work may start against `Source: extracted` (unconfirmed) artifacts.
- **Confidence tags are a function of evidence class, not a self-assessment.** `high` requires a Tier-1 inventory ID or a passing test. Stage 3.5 Check 4 enforces this; an inflated tag is blocking because it is exactly the tag reviewers skim past.
- **An unparseable or uncovered surface is never silently dropped.** Tier 1 records it `Parse: unresolved`; Stage 3.5 requires every inventory ID to be covered or explicitly dispositioned. Omission is the failure mode this workflow is built against.
- **A one-sided broker observation is not a flow.** A channel with a producer and no consumer (or the reverse) is an extraction gap at Stage 3.5 Check 3, not an acceptable partial.
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
- **Confidence vs scope trade-off is managed, not eliminated.** `risk-ranked` mode bounds the human gate by confirming the uncertain-and-consequential items first, but the ranking is a heuristic: a low-ranked item can still be the wrong one. Band 3 items stay `Source: extracted` precisely so that being wrong about them is not load-bearing.
- **Intent archaeology has a floor.** History answers why a line was written, never whether the reason still holds. A `documented` verdict makes the human question cheap; it never removes it.
- **Runtime evidence needs a representative window.** Zero traffic over 90 days is strong evidence of a dead surface; zero traffic over a quiet week is not. Seasonal and campaign-driven surfaces look dead if the window is wrong.
- **Bad code → bad SRS.** If the codebase is genuinely badly designed, the extracted SRS documents the badness. Stage 1b's `accidental` verdicts and Stage 4's Reject path give the team a chance to prune rather than enshrine; if the team doesn't, the kit faithfully preserves the badness. Deriving User Stories at capability level rather than one-per-endpoint limits how much implementation shape reaches the requirements layer, but it does not fix a bad design — that is a Path A refactor, not an extraction.

### References

- `.claude/agents/_non-sdlc/codebase-archaeologist.md` — Stage 1 agent
- `.claude/skills/codebase-inventory/SKILL.md` — Stage 1a Tier-1 manifest + `INV-*` ID scheme
- `.claude/skills/intent-archaeology/SKILL.md` — Stage 1b intent tracing
- `.claude/agents/_templates/extraction-validator.md` — Stage 3.5 independent gate
- `.claude/agents/_templates/_artifacts/extraction-validation-report-template.md` — Stage 3.5 report format
- `.claude/skills/sa-brownfield-extract/` — Stage 2 mode
- `.claude/skills/ba-mode-reverse-engineer/SKILL.md` — Stage 3 mode
- `.claude/rules/task-type-routing.md` §11 — Path B5 routing
- `.claude/rules/master-plan-discipline.md` §8 — `done-deprecated` status used in Stage 5
- `.claude/rules/parallel-execution.md` §4 — design lifecycle (analogous human-confirmation pattern)
- `.claude/agents/_templates/_artifacts/srs-template.md` — `Source:` per-section flag schema
