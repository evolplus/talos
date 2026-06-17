# Crash Recovery & Dispatch Reconciliation

This file holds CLAUDE.md §14. Section number is preserved across files for cross-referencing.

For workflow contract entry-point, see `CLAUDE.md`. This rule closes the kit's **transactional gap**: the dispatch
lifecycle finalizes state (cleanup, status transition, worktree removal) only on the success-return path
(`.claude/rules/orchestrator-operating-rules.md` §9 Step 7). Any interruption between dispatch-start (§9 Step 4.6) and a
clean return leaves orphan artifacts behind with no mechanism to detect, clear, or restart them. §14 adds that
mechanism.

---

## 14. Crash Recovery & Dispatch Reconciliation

### 14.1 Why this exists

A dispatch is a multi-step operation:

1. Orchestrator creates the worktree + sets task status `→ in-progress` (§9 Step 4.6).
2. Sub-agent works — writes code into its worktree, writes doc artifacts (logically-isolated roles write directly to
   `docs/` on main), makes intermediate commits, emits `plan-update.json`.
3. Orchestrator validates, ingests `plan-update.json`, commits the master-plan transition, merges role-owned artifacts,
   **removes the worktree** (§9 Step 7).

Every action that *undoes* a dispatch lives in Step 3. The lifecycle has no Step-3-failed branch. If the sub-agent
crashes, hits an unsatisfiable hook block, or the session is killed anywhere between Step 1 and a clean Step 3, the
following are orphaned **permanently** — the next session cannot tell a crashed dispatch from a completed one:

- The physical worktree `.worktrees/<role>-<task-id>/` and its branch `agent/<role>/<task-id>`.
- The task stuck at `in-progress` in `docs/plan/`, with no record of which dispatch owned it or when it started.
- **Partial doc artifacts written directly onto `main`** by logically-isolated roles (BA / SA / TL / QA-Author /
  UI/UX Designer). This corrupts the source-of-truth artifact itself, with no isolation boundary to discard.
- Intermediate commits stranded on the orphan branch; a half-written or absent `plan-update.json`.

The fix has four parts: a **dispatch journal** (intent log) makes the in-flight operation recoverable; a **session-start
detection** surfaces interrupted dispatches; a **reconciliation procedure** (§9 Step 0.6) clears them; **restart** is
then a normal re-dispatch from a clean baseline.

### 14.2 The dispatch journal (intent log)

The journal is the record of dispatch *intent* that makes a dispatch recoverable. Without it, the Orchestrator cannot
distinguish "this worktree belongs to a crashed dispatch" from "this is concurrent live work," nor can it know what
baseline to roll a partial doc write back to.

- **Location:** `.claude/dispatch-journal/<role>-<task-id>.json` (one file per in-flight dispatch). The directory is
  git-ignored — journal entries are transient operational state, never committed.
- **Written by:** the Orchestrator, at §9 Step 4.6, **before** the `Task` dispatch call and the status `→ in-progress`
  write.
- **Deleted by:** the Orchestrator, at §9 Step 7, as the final step of clean-up — *after* `plan-update.json` is
  ingested, the master-plan transition is committed, role-owned artifacts are merged, and the worktree is removed.

The invariant that powers detection: **a journal entry that survives into a new session is, by definition, an
interrupted dispatch** — a clean dispatch deletes its own journal entry inside the same Orchestrator turn that started
it.

Schema:

```json
{
  "task_id": "T-042",
  "role": "be-dev",
  "subagent_type": "be-dev",
  "isolation": "physical | logical",
  "worktree": ".worktrees/be-dev-T-042/",
  "branch": "agent/be-dev/T-042",
  "dispatched_at": "2026-06-15T08:00:00Z",
  "status_before": "not-started",
  "baseline": {
    "head": "<sha-of-main-HEAD-at-dispatch-time>",
    "owned_paths": ["docs/architecture.md", "docs/decisions/", "docs/instrumentation-contract.md"]
  }
}
```

`baseline.head` is `main`'s HEAD at dispatch time. `baseline.owned_paths` is the role's logically-owned `docs/` paths
(per `.claude/rules/artifact-ownership.md`) — the set that a logically-isolated role may have partially written and that
reconciliation must restore. For physically-isolated (code) roles `owned_paths` may be empty: their partial work is
confined to the worktree, so rollback is just worktree removal.

### 14.3 Detection (read-only, every session start)

Two detectors, both read-only and fail-open:

- **`session-init-summary.cjs` (SessionStart hook)** scans `.claude/dispatch-journal/*.json` and `.worktrees/*`. For
  each journal entry it prints a warning line naming the role, task-id, worktree, and `dispatched_at`. It also flags any
  `.worktrees/*` directory with **no** matching journal entry (orphans from a pre-journal session). This is a
  heat-map signal — it never blocks and never mutates.
- **Orchestrator §9 Step 0.6** is the action counterpart (below). It runs after the Step 0 git pre-flight and Step 0.5
  straggler sweep, before SRS classification.

### 14.4 Clearing (Orchestrator §9 Step 0.6 — reconciliation)

For each journal entry found at session start, the Orchestrator reconciles deterministically. Reconciliation is
**re-entrant**: it first sets the task status to `interrupted` (§14.7) so that a crash *during* reconciliation is itself
recoverable on the next session.

1. **Mark.** Set the task status `in-progress → interrupted` in `docs/plan/.../tasks/T-NNN.md` with an append-only
   status-history row (`notes: "Session boundary; dispatch journal survived — reconciling"`).
2. **Discard the worktree (physical roles).** `git worktree remove --force .worktrees/<role>-<task-id>/` then
   `git branch -D agent/<role>/<task-id>`. The partial code is throwaway by design — the sub-agent had not passed exit
   criteria, so nothing on that branch is trusted.
3. **Roll back partial doc writes (logical roles).** For each path in `baseline.owned_paths`, restore main to the
   journaled baseline:
   `git restore --source=<baseline.head> --staged --worktree -- <path>`. This discards uncommitted partial writes to the
   role's owned artifacts. (If a logically-isolated role committed intermediate work directly to `main` — which §14.6
   exists to prevent — the Orchestrator halts with `NEEDS_CONTEXT` rather than `git reset` main automatically; resetting
   shared history is never automatic.)
4. **Reset status.** Transition the task `interrupted → not-started` (append-only history row:
   `notes: "Rolled back to <baseline.head>; eligible for fresh re-dispatch"`). Clear any design sub-status that the
   interrupted dispatch had advanced but not confirmed.
5. **Delete the journal entry.** `rm .claude/dispatch-journal/<role>-<task-id>.json`.
6. **Log** to the session-start summary:
   `[orchestrator] Reconciled interrupted dispatch <role>/<task-id>: worktree+branch discarded, docs rolled back to <sha>, task → not-started`.

Edge cases:

- **Orphan worktree with no journal entry** (pre-journal residue): remove the worktree + branch if its `<task-id>` maps
  to a task currently `in-progress` with no journal; reset that task to `not-started`. If the worktree's task-id is
  unknown to the plan, log it and leave it for operator review — do not guess.
- **Journal entry but no worktree** (interrupted before Step 4.6 finished, or a logical-only role): only steps 1, 3, 4,
  5 apply.
- **`plan-update.json` present in the worktree** (sub-agent finished work but session died before Step 7 ingestion):
  this is **not** an interruption to roll back — it is a completed dispatch awaiting ingestion. The Orchestrator ingests
  it normally (§9 Step 7 path) and then deletes the journal entry. Reconciliation must check for `plan-update.json`
  before discarding any worktree.

### 14.5 Restart

Restart is **not a special path**. After §14.4 resets the task to `not-started` and restores the baseline, the task is
just an eligible `not-started` task. Normal §9 Step 4 task discovery re-dispatches it on the same Orchestrator turn,
from a clean baseline, idempotently. The restarted dispatch writes a fresh journal entry per §14.2.

This is why the journal + rollback matter: without them, a "restart" would resume a new agent on top of a failed
attempt's partial (possibly committed) state — the exact anti-pattern the old §9 Step 4.6 "reuse the worktree if it
exists" line invited.

### 14.6 Structural fix — uniform physical isolation for rollback safety

The root exacerbator of doc corruption is the v0.3.2 optimization (`.claude/rules/worktree-isolation.md` §5) that lets
logically-isolated roles write directly to `docs/` on main to save ~200ms per dispatch. That trade gave up crash-safety:
a code role's partial work is confined to a throwaway worktree, but a doc role's partial work lands on the canonical
tree with no boundary to discard.

Two ways to make rollback uniform; the kit adopts (a):

- **(a) Recommended — give every dispatch a worktree.** Reverse the "skip worktree for doc roles" default in §9 Step
  4.6: create `.worktrees/<role>-<task-id>/` for doc roles too. Rollback becomes uniform — discard the worktree, main is
  never touched mid-dispatch. The role-ownership write-guard still governs *which* paths the role may write; the
  worktree governs *where* partial state lives. Cost: ~200ms per doc dispatch, paid back the first time a crash would
  otherwise have corrupted `docs/SRS.md`.
- **(b) Minimum — baseline-restore only.** Keep doc roles on main but rely on §14.4 step 3 (`git restore` to journaled
  baseline). This works **only if doc roles never commit intermediate work to main** — they commit once, at done, per
  the commit-before-done discipline. If that discipline holds, every mid-dispatch doc write is uncommitted and
  `git restore` cleanly discards it.

Either way, the journal's `baseline.head` is the anchor. Adopting (a) makes step 3's `git restore` a rare fallback
rather than the primary mechanism.

### 14.7 The `interrupted` task status

A new value in the master-plan status enum (`.claude/rules/master-plan-discipline.md` §8): **`interrupted`** — a task
whose dispatch was abandoned by a session boundary or crash, detected by §14.3 and being reconciled by §14.4. It is a
*transient* status: reconciliation sets it, then moves the task to `not-started` once rollback completes. A task seen at
`interrupted` at the start of a turn means a prior reconciliation was itself interrupted — re-run §14.4 from step 2.

Distinguish from neighbors:

- `failed` — QA-Exec ran and the build failed against test cases. Real verified outcome; routes to TL sub-plan.
- `cancelled` — work deliberately abandoned because its requirement was deprecated by an iteration.
- `interrupted` — no verified outcome at all; the dispatch never completed. Always rolls back and restarts.

### 14.8 Hard Rules

- **The dispatch journal is Orchestrator-only.** No sub-agent writes `.claude/dispatch-journal/`. The journal records
  Orchestrator intent; sub-agents signal completion via `plan-update.json` (per `.claude/rules/worktree-isolation.md`
  §5). The `orchestrator-write-guard.cjs` role-ownership map treats `.claude/dispatch-journal/` as Orchestrator-owned.
- **Reconciliation never resets shared history automatically.** §14.4 discards worktrees/branches and `git restore`s
  uncommitted partial writes, but never `git reset`s `main`. A logically-isolated role that committed to main mid-task
  is a §14.6(b) discipline violation — the Orchestrator halts with `NEEDS_CONTEXT` and asks the operator.
- **A worktree containing `plan-update.json` is a completed dispatch, not an interruption.** §14.4 checks for it before
  discarding, and ingests it via the normal Step 7 path. Discarding a completed-but-uningested dispatch would lose real
  work.
- **Reconciliation is re-entrant.** The `interrupted` transient status + journal-entry-as-source-of-truth mean a crash
  during reconciliation leaves the system reconcilable on the next session. Never delete the journal entry before
  rollback completes (§14.4 step 5 is last).
- **Detection is read-only and fail-open.** `session-init-summary.cjs` only reports; it never removes worktrees, never
  mutates the plan. All clearing is the Orchestrator's job in Step 0.6, where it has the SDLC context to roll back
  correctly.
- **No escape hatch skips reconciliation.** A surviving journal entry MUST be reconciled before any new dispatch in the
  turn — an interrupted task left `in-progress` would be invisible to §9 Step 4 eligibility and silently stall the
  project. (Operators may inspect/override individual reconciliations interactively, but the Step 0.6 gate itself is
  unconditional.)

### 14.9 Cross-references

- `.claude/rules/orchestrator-operating-rules.md` §9 Step 0.6 — the reconciliation procedure; §9 Step 4.6 — journal
  write + worktree creation; §9 Step 7 — journal delete on clean return.
- `.claude/rules/worktree-isolation.md` §5 — worktree lifecycle + the logical-vs-physical isolation model §14.6 amends.
- `.claude/rules/master-plan-discipline.md` §8 — the `interrupted` status in the enum + append-only status-history
  discipline.
- `.claude/hooks/session-init-summary.cjs` — the read-only detector (§14.3).
- `.claude/rules/hard-rules.md` — git + commit discipline (commit-before-done) that §14.6(b) depends on.
