---
name: ba-iteration-planning
description: BA Phase 4 — iteration dispatch planning. Load after Phase 2 sign-off when Phase 1.Z produced a non-empty SRS diff (the dispatch is an iteration, not a first-time ingest). Runs the concurrent-iteration guard, magnitude check, optional cleanup-task prompt, and produces docs/iteration-plan/v<new>.md (the surgical re-dispatch matrix the Orchestrator consumes at §9 Step 3.5).
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Phase 4 — Iteration Dispatch Planning

## When to use

You are the BA and an iteration was confirmed: Phase 2 signed off the new SRS version and Phase 1.Z (in the `ba-ingestion-pipeline` skill) produced a non-empty diff at `docs/srs-diffs/`. Produce the surgical re-dispatch plan the Orchestrator consumes. Includes the concurrent-iteration guard, magnitude check, and cleanup-task prompt.

### Phase 4 — Iteration Dispatch Planning

This phase runs **after Phase 2 sign-off** AND **only when** Phase 1.Z produced a non-empty diff (the dispatch is an iteration, not first-time ingest). It produces the surgical re-dispatch plan the Orchestrator consumes at §9 Step 1.5.

#### Step 0 — Concurrent-iteration guard

Before any other Phase 4 work, scan `docs/iteration-plan/` for any file with `Processed-by-orchestrator: false`. The kit's iteration model assumes one iteration in flight at a time — overlapping iteration plans produce undefined behavior (matrix #2 may reference tasks that matrix #1 just cancelled, agents may receive stale dispatch context, etc.).

If at least one unprocessed iteration plan exists, halt with `NEEDS_CONTEXT`:

```
Status: NEEDS_CONTEXT
Reason: An earlier iteration plan is still in flight.
Question: Found <N> unprocessed iteration plan(s): <list paths>. Cannot safely start a new iteration v<new> while these are unresolved (task transitions from the earlier matrix may conflict with the new one). How do you want to proceed?
Options:
  [a] Wait — pause the new iteration here; complete the in-flight plan(s) (Orchestrator §9 Step 3.5 processes them), then re-dispatch this iteration. SAFEST.
  [b] Abandon the in-flight plan(s) — mark each as Processed-by-orchestrator: true with an `Abandoned: <reason>` line in the plan's changelog. Risky: any agent mid-task from the earlier plan must be halted manually first; tasks transitioned by the earlier plan stay in their transitioned state. Use only when the earlier plan is verifiably stale or wrong.
  [c] Cancel the new iteration — discard the incoming SRS changes; project stays at v<old>.
Recommended: a
Confidence: high
Justification: Concurrent iterations have no defined precedence in the kit's master-plan-discipline. Waiting is the only path that guarantees consistent task state.
```

Only when the response is `[a]` (after the earlier plan flips to `Processed-by-orchestrator: true`) or `[b]` (with explicit abandonment cost accepted) may Phase 4 proceed to Step 1. Option `[c]` ends Phase 4 with no plan produced; revert SRS `Status` to the prior `Signed-off` state and file a deferred open-issue.

#### Step 1 — Magnitude check

Before producing the dispatch plan, run a magnitude check against the diff. Any of these conditions triggers a halt + NEEDS_CONTEXT:

| Threshold | Trigger condition | Default |
|---|---|---|
| US-modification ratio | `# modified US-IDs` / `# total US-IDs in current SRS` | > 30% |
| FR-modification ratio | same on FR-IDs | > 50% |
| US deprecation count | `# US-IDs moved to ## Deprecated` in this iteration | > 5 |
| Domain rewrite | Any change in SRS §3.1 (Bounded Context, Aggregate Root, Entities, Value Objects, Ubiquitous Language) | any change |
| Security expansion | New sub-category added to §4.1 Security & Compliance | any add |
| NRS tightening | Quantitative target tightened by more than 2× (e.g., P95 1000ms → 200ms = 5×) | > 2× tighten |
| Cross-task impact | Tasks in `done` state affected by modified US/FR | > 10 tasks |

If ANY threshold triggers, halt with NEEDS_CONTEXT before producing the iteration plan:

```
Status: NEEDS_CONTEXT
Reason: Iteration magnitude exceeds threshold — high re-work risk.
Question: The proposed iteration v<old> → v<new> exceeds magnitude guardrails on: <list of triggered thresholds with numbers>. This level of change risks breaking the current system and forcing wide re-work. How do you want to proceed?
Options:
  [a] Proceed anyway — accept the re-work scope; BA produces the iteration plan; Orchestrator dispatches per the matrix.
  [b] Split into smaller iterations — PM revises the incoming SRS into versions v<old>.1, v<old>.2 etc., each within thresholds; BA re-ingests each smaller version separately.
  [c] Cancel iteration — discard incoming SRS; project stays at v<old>.
Recommended: b
Confidence: high
Justification: <which thresholds triggered, with the numbers — e.g., "52% US modified (16/31), exceeds 30% threshold; 14 done tasks affected, exceeds 10 threshold">
```

The recommendation defaults to **[b] split** because iterations within thresholds have predictable cycle-time; iterations outside have unpredictable rework cascades. Only after the user picks does Phase 4 continue.

#### Step 1.5 — Cleanup task prompt (optional, fires only when deprecations exist)

After magnitude check passes and BEFORE producing the iteration plan, check whether the diff deprecates any US-IDs or FR-IDs whose linked tasks are in `done` state (i.e., shipped code will become orphaned).

If at least one such case exists, halt with `NEEDS_CONTEXT` to ask whether to add cleanup task(s):

```
Status: NEEDS_CONTEXT
Reason: This iteration deprecates work that has already shipped. Cleanup tasks are optional and your call.
Question: <N> shipped task(s) will transition to `done-deprecated`: <list of T-IDs with the deprecated US/FR each linked to>. The implementation persists in the codebase until a cleanup task removes it. Add cleanup task(s) to this iteration plan?
Options:
  [a] Yes, add cleanup task(s) — TL appends a cleanup task per affected component (or one bundled cleanup task if the implementations share a module). Code is removed, dead routes / endpoints / UI screens decommissioned. RECOMMENDED for most projects.
  [b] No, leave the implementation in place — useful when the deprecated behavior is still needed for analytics, backward-compatibility, or to keep historical user data accessible. The code stays; QA-Exec still skips the deprecated test cases via the `deprecated-us` Pre-Run check.
  [c] Defer the decision — add a deferred open-issue (`State: deferred`, `Target phase: after current iteration completes`) tracking the cleanup question; iteration plan is produced without cleanup tasks; the question is answered in a future BA dispatch.
Recommended: a
Confidence: medium
Justification: Most projects accumulate cruft when cleanup is deferred; explicit `[a]` plus a tracked cleanup task is usually cheapest in the long run. Pick `[b]` deliberately when retention is the design intent, not when cleanup is hard.
```

User picks one:

- `[a]` add: include cleanup task rows in the iteration plan's re-dispatch matrix (one row per affected component, dispatched to TL who adds the task to the current phase or a new cleanup phase).
- `[b]` no: skip cleanup; the affected tasks transition to `done-deprecated` but no new cleanup task is added. Note the `[b]` choice in the iteration plan's metadata so future audits can reconstruct the decision.
- `[c]` defer: open-issue filed; iteration plan produced without cleanup; the question persists.

No prompt fires when the iteration has zero `done`-state affected tasks (e.g., all deprecations are of US-IDs whose tasks were still `not-started` or `in-progress`, which transition to `cancelled` regardless and have no shipped code to clean up).

#### Step 2 — Produce iteration plan

Once thresholds are within bounds OR user accepted `[a] proceed anyway`, produce `docs/iteration-plan/v<new-version>.md`:

```markdown
# Iteration plan — v<old> → v<new>

- Diff source: docs/srs-diffs/v<old>-to-v<new>.md
- Generated: <ISO-8601>
- Concurrent-iteration check: clean (no in-flight plans) | abandoned-prior (cite which plan paths + abandon reason)
- Magnitude check: passed | overridden-by-user (cite NEEDS_CONTEXT timestamp + chosen option)
- Cleanup decision: yes-add (cite cleanup task IDs below) | no-leave-in-place (cite NEEDS_CONTEXT timestamp) | deferred (cite open-issue ID) | n/a (no done-state deprecations in this iteration)

## Re-dispatch matrix

One row per change × agent × scope. The Orchestrator dispatches each row's agent against the cited scope.

| Change | Agent | Scope | Trigger |
|---|---|---|---|
| US-NNN modified (BR-N changed) | SA | re-check architecture for impact on this US's component | architecture review only if affected |
| US-NNN modified | QA-Author | by-us re-run for US-NNN only (regen `docs/test-cases/by-us/US-NNN/functional.md`) | functional.md regen |
| US-NNN modified | TL | re-evaluate tasks linked to US-NNN; modify DoD, add new tasks, mark obsolete tasks `cancelled` | master-plan delta |
| FR-NNN new (auth endpoint) | SA | extend architecture for new component | full new design path |
| FR-NNN new | TL | new phase or new tasks appended | append to master plan |
| FR-NNN modified (schema changed) | BE Dev | revise frozen contract at `docs/api-contracts/<endpoint>.md`; mark Status: Draft pending re-freeze | contract re-freeze |
| FR-NNN modified | FE Dev | re-implement consumers of changed contract | FE adaptation |
| US-NNN deprecated | TL | transition linked tasks to `cancelled` (if in-flight) or `done-deprecated` (if completed) | task transition |
| US-NNN deprecated (cleanup chose `yes-add`) | TL | append one cleanup task per affected component (or one bundled task if components share a module) to current phase or new cleanup phase; cleanup task DoD: "obsolete code paths removed, dead routes / endpoints / UI screens decommissioned" | cleanup task creation |
| US-NNN deprecated | QA-Author | mark `docs/test-cases/by-us/US-NNN/` files Deprecated (frontmatter `Status: Deprecated`); keep in place | test-case status flag |
| NRS target tightened (P95 1000ms → 200ms) | SA | re-evaluate architecture for new perf target; may write new ADR | architecture review |
| NRS target tightened | QA-Exec | re-run perf tests against new threshold | performance re-test |

## Affected tasks

| Task ID | Current status | Change | New status |
|---|---|---|---|
| T-NNN | done | US-NNN modified — re-test against new BR-2 | re-opened for re-QA (transitions: done → in-test) |
| T-NNN | in-progress | US-NNN deprecated | cancelled |
| T-NNN | done | US-NNN deprecated | done-deprecated |
| T-NNN | not-started | FR-NNN new — add this task | not-started (new) |

## Magnitude metrics

For audit / future-iteration tuning:

- US modification ratio: <X/Y> = <Z%>
- FR modification ratio: <X/Y> = <Z%>
- US deprecation count: <N>
- Done tasks affected: <N>
- NRS tightening ratio (max): <ratio>
- Domain spec changed: yes | no
- Security categories added: <N>

## Processed flag

- Processed-by-orchestrator: false
```

The Orchestrator flips `Processed-by-orchestrator: true` after it has dispatched every agent in the re-dispatch matrix. Subsequent BA dispatches see the flag and skip the iteration logic (the plan is already in flight).

#### Step 3 — `plan-update.json` for Phase 4

Emit `plan-update.json` with `track: "ba"` and `notes: "Phase 4 iteration plan produced for v<new>; <N> agent re-dispatches queued"`. The Orchestrator reads this and proceeds to §9 Step 1.5 (iteration plan consumption) before any other task discovery.
