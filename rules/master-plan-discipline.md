# Master Plan Discipline

This file holds CLAUDE.md §8. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`. For the worktree-based proposal mechanism that
sub-agents use to propose master plan transitions, see `.claude/rules/worktree-isolation.md` §5.

---

## 8. Master Plan Discipline

The project plan lives under **`docs/plan/`** as a three-level hierarchy. This shape exists so the kit scales to large projects without exploding any single file's size — agents load only the layers they need.

### Layout

```
docs/plan/
├── master-plan.md                              # top — high-level shape only
└── phase-NN-kebab-name/                        # one folder per phase
    ├── phase.md                                # phase-level — task table for THIS phase
    └── tasks/
        └── T-NNN.md                            # one file per task — full detail
```

Conventions:

- **Phase folder name**: `phase-NN-kebab-name/`. `NN` is zero-padded sequential. `kebab-name` is short, lowercase, dash-separated (e.g., `phase-01-foundation/`, `phase-02-core-auth/`).
- **Phase file**: always named `phase.md` inside the folder. Orchestrator finds it without a lookup.
- **Task file**: `tasks/T-NNN.md`. `T-NNN` matches the existing task ID format. One task per file.

### What lives where

| File | Contains | Does NOT contain |
|---|---|---|
| `docs/plan/master-plan.md` | Phase list with status; running-tasks summary (in-progress tasks across all phases); phase-level changelog; SRS reference | Individual task details; per-task status history; design sub-status detail |
| `docs/plan/phase-NN-name/phase.md` | Phase description, dependencies, exit criteria; task table with current status per task; phase-level changelog (task transitions in this phase) | Per-task status history; full task DoD; task-level artifact links |
| `docs/plan/phase-NN-name/tasks/T-NNN.md` | Full task detail: track, DoD, linked SRS US-IDs and FR-IDs, dependencies, status history, design sub-status, linked artifacts | Anything about other tasks |

This split keeps `master-plan.md` small (~100 lines max for any size project), `phase.md` medium (~200 lines), and task files small (~50–100 lines). Agents load ~350 lines total per dispatch, not a multi-thousand-line monolith.

### Top-level `master-plan.md` schema

```markdown
# Master Plan

- SRS: docs/SRS.md (Status: <Signed-off|In-Review|Draft>, Last-Updated: <ISO-8601>)
- Project shape: <N> phases, <M> tasks total

## Phases

| Phase | Folder | Status | Tasks | Notes |
|---|---|---|---|---|
| 01 — Foundation | phase-01-foundation/ | done | 3/3 done | — |
| 02 — Core Auth | phase-02-core-auth/ | in-progress | 2/4 done, 1 in-progress | — |
| 03 — Profile | phase-03-profile/ | not-started | 0/4 done | depends on 02 |

## Running tasks

(In-progress tasks across all phases.)

| Task | Phase | Track | Status | Design sub-status |
|---|---|---|---|---|
| T-005 | 02 | be | in-progress | — |
| T-006 | 02 | fe | in-progress | design-confirmed |

## Phase-level changelog

| Date | Phase | Change |
|---|---|---|
| 2026-05-12 | 02 | started |
| 2026-05-10 | 01 | completed |
```

### Phase `phase.md` schema

```markdown
# Phase 02 — Core Auth

- Status: in-progress
- Phase folder: phase-02-core-auth/
- Depends on: phase-01-foundation (done)
- Exit criteria: login round-trips end-to-end; password reset works

## Tasks

| Task | Track | Status | DoD link | Design sub-status |
|---|---|---|---|---|
| T-004 | be | done | tasks/T-004.md | — |
| T-005 | be | in-progress | tasks/T-005.md | — |
| T-006 | fe | in-progress | tasks/T-006.md | design-confirmed |
| T-007 | fe | not-started | tasks/T-007.md | design-confirmed |

## Phase changelog

| Date | Change |
|---|---|
| 2026-05-12 | T-005 → in-progress |
| 2026-05-11 | T-006 → in-progress; design-confirmed by Viet Phan |
| 2026-05-10 | T-004 → done |
| 2026-05-10 | Phase started |
```

### Task `T-NNN.md` schema

```markdown
# T-005 — POST /auth/login endpoint

- Phase: phase-02-core-auth/
- Track: be
- Status: in-progress
- DoD: Contract `Frozen`; login succeeds per US-008 Main Flow; fails with explicit error codes per FR-008 Error Handling
- Linked US-IDs: US-008
- Linked FR-IDs: FR-008
- Dependencies: T-002 (auth middleware, done)
- Design sub-status: (only when track is fe or be+fe with UI surface)

## Status history

Append-only. Never overwrite.

| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-12T08:00:00Z | not-started | in-progress | orchestrator | Dispatched be-dev |
| 2026-05-10T10:00:00Z | — | not-started | tl | Created |

## Linked artifacts

- API contract: docs/api-contracts/auth-login.md
- Test cases: docs/test-cases/by-us/US-008/, docs/test-cases/by-task/T-005/api.md
- Deploy report: docs/deploy-reports/T-005.md (when ready)
- QA report: docs/qa-reports/T-005.md (when ready)

## Notes

(Free-form. Contract-pending reason, sub-plan reference for blocking issues, etc.)
```

### Allowed task statuses

- `not-started`, `in-progress`, `blocked`, `contract-pending` (FE only), `ready-for-deploy`, `in-test`, `failed`, `done`
- `cancelled` — task was in-flight (`not-started` / `in-progress` / `contract-pending` / `blocked`) when its linked US-ID or FR-ID was deprecated by an iteration (BA Phase 4). The work is no longer wanted; the agent halts. Code that may have been partially written is preserved in the worktree's branch and may be referenced by a cleanup task.
- `done-deprecated` — task was `done` when its linked US-ID or FR-ID was later deprecated by an iteration. The work shipped but the requirement is removed. The implementation persists until a follow-up cleanup task removes it (if scope justifies); meanwhile QA-Exec skips the task's test cases (test files keep their `Status: Deprecated` flag).
- `interrupted` — transient status set by Orchestrator §9 Step 0.6 reconciliation when a dispatch journal survives a
  session boundary (crash / kill / unsatisfiable hook block). The dispatch never completed and has no verified outcome.
  Reconciliation rolls the task back and moves it to `not-started` for fresh re-dispatch. A task still at `interrupted`
  at turn start means a prior reconciliation was itself interrupted — re-run §14.4. See `.claude/rules/crash-recovery.md`
  §14.7. Distinct from `failed` (verified QA failure) and `cancelled` (deliberately abandoned via iteration).
  
Status changes are logged in the **task file's `## Status history` table** with ISO-8601 timestamp and the agent that proposed the change. Phase and master files reflect *current* status only; history lives in the task file.

### Design sub-statuses

For UI tasks (`fe` or `be+fe` with a UI surface), the additional design sub-status records design lifecycle progress: `design-ready-for-review`, `design-revision-needed`, `design-pending-user-confirmation`, `design-human-edited`, `design-confirmed`. The task's main status remains `not-started` while the design lifecycle runs; it transitions to `in-progress` only after `design-confirmed` (and `Frozen` API contract for `be+fe`).

Design sub-status is recorded in the task file (alongside Status) and surfaced in the phase's task table and master-plan's running-tasks summary.

### Sub-plans for blocking issues

When a task moves to `failed` (QA fail) or an open-issue is `promoted`, TL produces a remediation sub-plan. The sub-plan attaches to the **affected task's phase** — usually as additional tasks in the same `phase.md` and corresponding new `T-NNN.md` files. The kit does not introduce a separate "sub-plans" hierarchy; remediation work is just additional tasks in the existing phase.

### Write discipline

- **Only the Orchestrator** commits status transitions; sub-agents propose via `plan-update.json` in their worktree (per `.claude/rules/worktree-isolation.md` §5).
- The `master-plan-write-guard.cjs` hook refuses writes to `docs/plan/` from inside any `.worktrees/<role>-<task-id>/` path (sub-agent context); Orchestrator writes from main repo are allowed by default. No env-var setup required. Escape hatch `CLAUDE_ALLOW_PLAN_WRITE=1` exists for rare kit-dogfooding scenarios.
- Status history in `T-NNN.md` is **append-only** — supersede with a new row; never overwrite.
- Phase and master files reflect *current* state; the audit trail lives in the task file.

### Project state is recoverable from `docs/SRS.md` + `docs/plan/`

If those two artifacts are stale or inconsistent, fix that before doing any other work.
