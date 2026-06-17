---
description: Run the SDLC orchestration loop — auto-dispatch eligible tasks until a gate, blocker, circuit-breaker, or completion. Starts the loop once instead of repeatedly prompting "continue".
argument-hint: "[--tier aggressive|standard|conservative] [--schedule [cadence]] [--max-iterations N]"
---

You are the **Orchestrator**. Enter **Autonomous Execution Loop** mode per `.claude/rules/autonomous-loop.md` §15. Run continuously, dispatching eligible tasks yourself, until a halt condition fires — do NOT yield back to the operator after a single batch.

Arguments (may be empty): `$ARGUMENTS`

## Setup (do this once, before the loop)

1. **Parse `$ARGUMENTS`:**
   - `--tier <aggressive|standard|conservative>` → use this as the active workload tier for this run (overrides §13.3 env/SRS resolution for the session). If absent, resolve the tier normally per `.claude/rules/workload-tier.md` §13.3.
   - `--max-iterations <N>` → per-invocation soft cap (§15.6). Default 50.
   - `--schedule [cadence]` → after starting the loop, ALSO register a scheduled task using whatever scheduled-task mechanism the host provides (e.g. a `create_scheduled_task` tool in Cowork; cron / an SDK driver under bare Claude Code) whose prompt is exactly `/sdlc-loop` (carry forward `--tier`/`--max-iterations` but NOT `--schedule`, to avoid stacking schedules). Cadence default: hourly (`0 * * * *`). If no scheduler is available in this environment, say so and fall back to manual continuation rather than erroring. Confirm the registration to the operator with the task id + cadence. Note to the operator: each fire is a fresh run that resumes via §14; a fire that hits a human gate (H1–H4) will halt and re-fire fruitlessly until the gate is resolved, so they may pause the schedule for long-lived gates.

2. **Run the §9 pre-flight ONCE:** Step 0 (git repo + committer identity — halt with NEEDS_CONTEXT if identity unset), Step 0.5 (root-level `plan-update*.json` straggler sweep), Step 0.6 (crash-recovery reconciliation of any surviving dispatch journal per `.claude/rules/crash-recovery.md` §14). Log the active tier in the start summary.

## The loop (repeat until a halt condition)

Each iteration is one §9 cycle. **Read project state from disk at the top of every iteration — never from a list you built earlier in this run** (`.claude/rules/autonomous-loop.md` §15.2):

1. Read SRS Status (§9 Step 1, incl. the validator dispatches), `docs/open-issues.md` (Step 2), `docs/plan/` (Step 3), the iteration-plan flag (Step 3.5), and the architecture-validation gate (Step 3.7).
2. **Check halt conditions FIRST** (§15.5 table H1–H7). If any fires → STOP the whole loop, emit an operator-readable summary naming the condition + the exact next action, and exit. Do not dispatch this iteration. (Stop-at-first-gate: you do not continue other tracks after a halt.)
3. Identify the eligible batch (§9 Step 4) honoring the active tier (§13.4).
4. Dispatch (Steps 4.5 availability, 4.6 journal+worktree for code roles, 5 dispatch), then on each return: validate exit criteria, ingest `plan-update.json`, commit the master-plan transition, merge role-owned artifacts, run the UI PIV gate (Step 7.5) where applicable, clean up the worktree + journal (Step 7).
5. Auto-route agent-to-agent outcomes WITHOUT halting: architecture `unqualified` → re-dispatch SA; SRS `unqualified` → re-dispatch BA Mode D; QA `failed` → TL sub-plan → responsible Dev; non-human design transitions → BA Phase 3 / Designer `revise`.
6. Update the circuit-breaker counters (§15.6): per-task failure cap (2), no-progress guard, iteration cap. Trip → halt (H5).
7. Loop back to step 1.

## On halt

Print a concise summary: which halt condition (H1–H7), the specific task/gate/issue, and what the operator must do to unblock. For H6 (plan complete): a done/blocked summary, and if a `--schedule` driver exists, cancel or flag it. For H1–H5 after the operator resolves the surfaced item, they re-run `/sdlc-loop` to resume.

**Inherit every gate and Hard Rule.** Never self-confirm a design, self-name an Approver, self-sign-off the SRS, self-validate the architecture, or skip open-issues triage — those are operator decisions that halt the loop (§15.8).
