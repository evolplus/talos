# Autonomous Execution Loop

This file holds CLAUDE.md §15. Section number is preserved across files for cross-referencing.

For workflow contract entry-point, see `CLAUDE.md`. This rule turns the kit's per-turn dispatch cycle (`.claude/rules/orchestrator-operating-rules.md` §9, whose Step 8 says "re-evaluate from step 2") into an explicit **run-to-gate loop** the operator starts ONCE — via the `/sdlc-loop` command — instead of repeatedly prompting "continue" / "next".

The loop is a **driver around §9**, not a replacement for it. Every §9 step, every §10 Hard Rule, every gate (sign-off, architecture validation, design-confirmed, brownfield Stage 4, Dependency Approver, open-issues triage), the §13 workload tier, and the §14 crash-recovery semantics all hold unchanged inside the loop.

---

## 15. Autonomous Execution Loop

### 15.1 Why this exists

Without this rule, the orchestrator advances the project one operator prompt at a time: the operator types "continue," the orchestrator dispatches the next eligible batch, ingests returns, and stops. For a multi-phase plan that is dozens of round-trips of pure "continue." The autonomous loop lets the operator say `/sdlc-loop` once; the orchestrator then keeps dispatching eligible work on its own until it reaches a point where a human decision is genuinely required, a circuit breaker trips, the plan completes, or the invocation's token budget is exhausted.

### 15.2 The load-bearing property: the loop is bounded by disk state, not context

The loop is safe to run unattended because **every iteration durably checkpoints to disk** and **the orchestrator re-reads project state from disk each iteration** rather than holding the run in its context window:

- Each iteration ends with the master-plan transition committed (`docs/plan/`), role-owned artifacts merged, the worktree removed, and the dispatch-journal entry deleted (§9 Step 7).
- Project state is fully recoverable from `docs/SRS.md` + `docs/plan/` (`.claude/rules/master-plan-discipline.md`).
- Therefore **"the invocation ran out of tokens mid-loop" is identical to a crash** — there is no special token-exhaustion handling to get right. The next invocation runs §9 Step 0.6 reconciliation (`.claude/rules/crash-recovery.md` §14), rolls back any interrupted dispatch, and resumes from the exact same eligible-task frontier.

This is the invariant the loop depends on: **the orchestrator must read eligibility from `docs/plan/` at the top of every iteration — never from an in-memory list built earlier in the invocation.** A loop that trusts stale in-context state would re-dispatch completed tasks or skip newly-unblocked ones.

### 15.3 Entry

The operator starts the loop with the `/sdlc-loop` slash command (`.claude/commands/sdlc-loop.md`), or by asking the orchestrator to "run the SDLC loop." Optional arguments:

- `--tier <aggressive|standard|conservative>` — sets `CLAUDE_WORKLOAD_TIER` for this run (per §13.3 priority; overrides the SRS header for the session). Absent → the normal §13.3 resolution applies (env → SRS header → kit default `aggressive`).
- `--schedule [cadence]` — in addition to running now, registers a scheduled task that re-invokes `/sdlc-loop` on a cadence until the plan completes (see §15.7).
- `--max-iterations <N>` — overrides the per-invocation soft cap (§15.5 circuit breaker). Default 50.

### 15.4 Loop body

`/sdlc-loop` runs the §9 pre-flight **once** at invocation start (Step 0 git setup, Step 0.5 straggler sweep, Step 0.6 crash-recovery reconciliation), then repeats the following iteration until a §15.5 halt condition fires:

1. **Read state from disk** — §9 Steps 1–3.7: SRS Status; `docs/open-issues.md`; `docs/plan/` (master + the relevant phase/task files); the iteration-plan flag (Step 3.5); the architecture-validation gate (Step 3.7).
2. **Evaluate halt conditions FIRST** (§15.5). If any fires, halt, surface, and exit the loop — do NOT dispatch this iteration.
3. **Identify the eligible batch** — §9 Step 4, honoring the active workload tier (§13.4): at `aggressive`, every eligible-parallel task + cross-phase pipelining in one turn; at `standard`, up to 3; at `conservative`, one.
4. **Dispatch + ingest** — §9 Steps 4.5 (availability), 4.6 (journal + worktree for code roles), 5 (dispatch), 7 (validate exit criteria, ingest `plan-update.json`, commit the master-plan transition, merge role-owned artifacts, clean up worktree + journal). Run the PIV gate (Step 7.5) for UI tasks.
5. **Record the iteration outcome** — did any task transition? Did any task fail or return an error? (feeds the §15.5 circuit breaker).
6. **Loop** — return to step 1.

Agent-to-agent routing is handled INSIDE the loop automatically — it is NOT a halt. Specifically: architecture `unqualified` → re-dispatch SA; SRS source/feasibility `unqualified` → re-dispatch BA Mode D; QA-Exec `failed` → TL sub-plan then re-dispatch the responsible Dev; design lifecycle transitions that don't need human confirmation (`design-ready-for-review` → BA Phase 3, `design-revision-needed` → Designer `revise`). The loop keeps these moving without operator involvement.

### 15.5 Halt conditions (stop-at-first-gate policy)

The loop halts the WHOLE run on the FIRST occurrence of any condition below, surfaces it to the operator, and exits. (The operator chose stop-at-first-gate: a single, predictable pause point rather than parking gated items and continuing other tracks.)

| # | Condition | How detected | What the orchestrator surfaces |
|---|---|---|---|
| H1 | **Human confirmation gate** | A task needs design-confirmed (`.claude/rules/parallel-execution.md` §4 Step 4); brownfield Stage 4; Designated Design Approver `TBD` at design lifecycle step 0; Designated Dependency Approver `TBD` when SA needs a new dependency | The exact confirmation required + the artifact (Figma URL+version / Stage-4 checklist / SRS header field to set) |
| H2 | **NEEDS_CONTEXT** from any dispatched sub-agent | sub-agent return value | The verbatim question + suggested resolution |
| H3 | **`open` entry in `docs/open-issues.md`** | §6 triage gate (also enforced by `open-issues-triage-gate.cjs`) | The issue(s) needing triage (resolve / defer / promote) |
| H4 | **OQ requiring an operator scope decision** | a validator/agent appended an OQ + reverted Status, and the OQ routes to "operator" (e.g. `nrs-unrealistic`, `dependency-budget-exceeded`) per the report's routing table | The OQ list + the options to choose from (offer `oq-resolver` dispatch) |
| H5 | **Circuit breaker tripped** | §15.6 | The wedged task + its failure history |
| H6 | **Plan complete or fully blocked** | §9 Step 4 yields no eligible tasks AND none are in-flight | A completion summary (done tasks / remaining blocked tasks + their blockers) |
| H7 | **Token / context budget exhausted** | the invocation simply ends mid-loop | Nothing special is required — state is durable (§15.2). On the next `/sdlc-loop`, §14 reconciliation resumes. The orchestrator SHOULD, when it senses its context is getting large, proactively emit a progress checkpoint summary and stop cleanly rather than risk an abrupt cut. |

Note on H1/H4: these are exactly the points the kit already refuses to auto-approve (§13.6, §2, §12 Stage 4, parallel-execution §4 Step 4). The loop inherits that refusal — it cannot self-confirm a design, self-name an Approver, self-sign-off, or self-resolve an operator-routed OQ.

### 15.6 Circuit breaker

To stop the loop spinning or burning budget on wedged work:

- **Per-task failure cap.** If the same `task_id` reaches `failed` (QA-Exec) OR a dispatch for it returns an error 2 times within the loop, halt (H5) instead of re-dispatching a 3rd time. Report the task, both failure reasons, and the responsible track.
- **No-progress guard.** If a full iteration completes with ZERO task transitions while eligible tasks existed (everything dispatched returned without advancing), halt (H5). One no-progress iteration is enough — a second identical pass would not differ.
- **Per-invocation iteration cap.** A soft ceiling (default 50, override via `--max-iterations`) bounds a single invocation even if nothing else fires. On hitting it, treat as H7: checkpoint summary + stop; re-run resumes. (Token budget usually hits before this in `aggressive` mode.)

### 15.7 Continuation

- **Manual (default).** When the loop pauses (any halt condition, or budget), the operator re-runs `/sdlc-loop`. Disk-state durability (§15.2) + §14 reconciliation make resumption exact — the new invocation picks up the eligible frontier with no lost or duplicated work. For H1–H4 halts, the operator first resolves the surfaced item (confirms the design, names the Approver, triages the issue, answers the OQ), then re-runs `/sdlc-loop`.
- **Optional scheduler (`--schedule`).** `/sdlc-loop --schedule [cadence]` additionally registers a scheduled task — using whatever scheduled-task mechanism the host environment provides (e.g. a `create_scheduled_task` tool in Cowork; cron / an external SDK driver under bare Claude Code) — whose prompt is `/sdlc-loop`, firing on `cadence` (default: hourly). If the environment has no scheduler, `--schedule` degrades gracefully to manual continuation and the orchestrator says so rather than failing. Each scheduled run is a fresh invocation that reconciles (§14) and continues the loop. The scheduler is a convenience for long unattended runs — it does NOT change any gate: a scheduled run that hits H1–H5 still halts and surfaces (the result is visible in that run's output), and the next scheduled fire will re-detect the same unresolved gate and halt again until the operator resolves it. **Cost caution:** a scheduled aggressive loop can spend tokens on each fire even when blocked; the loop SHOULD, on detecting H6 (plan complete), cancel or flag its own scheduled driver (via the host's scheduled-task update mechanism) and tell the operator. When a run halts at H1–H5, it should report that the schedule will keep re-firing fruitlessly until the gate is resolved, so the operator can pause the schedule if the gate is long-lived.

### 15.8 Hard rules

- **The loop never bypasses a gate.** Sign-off (§2), architecture validation (§3.7 / sub-agent-registry §3.11), design-confirmed (parallel-execution §4 Step 4), brownfield Stage 4 (§12), Dependency Approver, open-issues triage (§6), worktree isolation (§5), commit-before-done, role-specialized dispatch (§10) — all hold inside the loop. The loop's autonomy is "keep dispatching eligible work," never "skip a confirmation."
- **Eligibility is read from disk every iteration.** Never dispatch from a stale in-context task list (§15.2).
- **The loop honors the workload tier.** It does not force `aggressive`; it runs at whatever §13.3 resolves (or `--tier`).
- **The loop is Orchestrator-only behavior.** It dispatches sub-agents per §9; it never performs sub-agent work itself, never writes source code, never manually flips a gate Status (§10).
- **A halt is a surface-and-stop, not a silent pause.** Every halt (H1–H7) MUST produce an operator-readable summary naming the condition and the next action. Stop-at-first-gate means the loop does not continue other tracks after a halt — it exits so the operator sees a single clear pause point.

### 15.9 Cross-references

- `.claude/rules/orchestrator-operating-rules.md` §9 — the per-iteration dispatch cycle the loop drives (Steps 0–8); the loop automates Step 8's "re-evaluate from step 2".
- `.claude/rules/workload-tier.md` §13 — parallelism/batching per iteration.
- `.claude/rules/crash-recovery.md` §14 — reconciliation that makes token-exhaustion / crash resumption exact.
- `.claude/rules/master-plan-discipline.md` §8 — the disk state the loop reads/commits each iteration.
- `.claude/commands/sdlc-loop.md` — the operator entrypoint.
