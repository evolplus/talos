---
name: task-sizing
description: Heuristics for breaking architecture into right-sized tasks for the master plan. Consult when TL is producing master-plan-proposal.md from a signed-off SRS and architecture.
agents: [tl]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Task Sizing

## When to use

You are the TL. You have a signed-off SRS and a current architecture. Your job is to produce a master plan that the Orchestrator can dispatch in parallel where possible. This skill gives you the sizing heuristics, the smell tests for an over-sized task, and the splitting and phasing patterns.

## Inputs and outputs

- **Inputs:** signed-off `docs/SRS.md`, `docs/architecture.md`, `docs/decisions/`, optionally `docs/instrumentation-contract.md`
- **Outputs:** `master-plan-proposal.md` in your worktree with phases, tasks, dependencies, track tags, DoD per task

## Procedure

1. Read the SRS requirements and the architecture end-to-end. List the user-visible features the SRS names.
2. For each feature, propose a vertical or horizontal split (see Splitting patterns). Default to vertical — usable slices first.
3. Sketch tasks at the smallest level you can defend. Apply the Sizing heuristics to each candidate task; split anything that fails.
4. Run the Smell tests across the candidate task list. Combine, split, or rename until none apply.
5. Group tasks into phases per the Phasing patterns: each phase ends at a verifiable milestone, tasks within a phase run mostly in parallel.
6. Tag each task with its track (`be | fe | be+fe | infra | qa`) and a one-sentence DoD. Mark FE tasks consuming new endpoints as `contract-pending` with the BE task as a dependency.
7. Verify coverage: every SRS User Story (§3.2) and every FR (§3.3) maps to at least one task. Fail to verify = exit blocked.

## Sizing heuristics

A right-sized task is one a single developer in a single role can complete in a focused work session. Use these checks:

1. **One developer, one session.** If finishing the task requires more than one person or more than one focused day, split.
2. **≤ 5 SRS acceptance-criterion mappings.** A task linked to more ACs is doing too much. Split by AC group.
3. **≤ 3 inter-task dependencies.** A task that depends on more than three other tasks is in the wrong phase — your phase boundary is wrong, not the task.
4. **One track tag.** If you can't pick a single `be | fe | be+fe | infra | qa` tag, the task is two tasks. (`be+fe` is allowed only when the BE and FE pieces truly cannot ship independently.)
5. **DoD is testable.** If you cannot write a one-sentence DoD that names the artifact and the verification, the task is under-defined.

## Smell tests for an over-sized task

- Title contains "and" or "with" describing two distinct deliverables ("auth and profile", "list view with filtering")
- DoD is a paragraph, not a sentence
- Task touches three or more files in the architecture diagram
- Task description includes both "implement X" and "while we're at it, refactor Y"
- The same task appears with similar wording in two different phases (a sign you're modeling the same work as setup + finish)

If any apply, split.

## Splitting patterns

Two main directions:

- **Vertical (narrower scope of feature):** ship a thinner version end-to-end. Login with email-only first, MFA later. List with no filtering first, filtering as a follow-up. Splits the feature by user value.
- **Horizontal (one layer at a time):** ship one architectural layer first (data model + migration), then the next (API), then UI. Splits by track. Use when the layers are slow-moving and worth freezing one at a time.

Vertical is usually safer (you ship something usable sooner). Horizontal is necessary when the BE-FE contract needs time to settle before FE can begin (per CLAUDE.md §4 contract-freeze rule).

## Phasing patterns

A phase is a set of tasks that can complete before the next phase makes sense. Good phase boundaries:

- A phase ends with a verifiable milestone (the auth flow works end-to-end, the data model is migrated and observable, etc.)
- Tasks within a phase mostly run in parallel
- Tasks across phases mostly have dependencies

Bad phase boundaries:

- A phase ends with "everything in track X is done" (you've grouped by team, not by milestone)
- Phases are sized by calendar time ("Phase 1 = first sprint") rather than by completed work
- Phases require all of track Y to finish before any of track Z starts (you've serialized work that could parallelize)

See [`references/examples.md`](./references/examples.md) for a worked breakdown of a feature into phases and tasks.

## The contract-pending pattern

For any `fe` task that consumes a new endpoint:

1. Mark it `track: fe`, status `contract-pending`.
2. List the BE task that publishes the contract as a dependency.
3. The Orchestrator will not transition this task to `not-started` until the BE task's contract is `Frozen`.

This is a first-class status for a reason — it makes the BE→FE serial dependency explicit without forcing the whole feature into one task.

## Sub-plans for blocking issues (CLAUDE.md §6)

When a task moves to `failed` (QA fail) or an open issue is `promoted`, you (TL) are dispatched to produce a sub-plan: remediation tasks, dependencies, expected resolution. The sub-plan goes under the affected task's phase folder in `docs/plan/phase-NN-name/` (as additional tasks in that phase), not as a separate "sub-plans" hierarchy. Resume the original phase only after the sub-plan completes.

## Hard rules

- Never start before SRS = `Signed-off` and architecture exists.
- Every SRS User Story and FR must map to at least one task. Verify coverage before exit (per `.claude/rules/sub-agent-registry.md` §3.3).
- Every task has exactly one track tag and a one-sentence DoD.
- Never invent requirements not in the SRS. If implementation needs something the SRS does not state, raise an Open Question.
- A task with > 5 AC mappings or > 3 task dependencies is unsplit work — split before submitting the proposal.

## References

- [`references/examples.md`](./references/examples.md) — worked feature breakdown
- CLAUDE.md §3.3 — TL role and exit criteria
- `.claude/rules/parallel-execution.md` §4 — what can parallelize, what must serialize
- `.claude/rules/master-plan-discipline.md` §8 — task statuses and design sub-statuses
