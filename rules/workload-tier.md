# Workload Tier

This file holds CLAUDE.md §13. Tunes how aggressively the Orchestrator dispatches sub-agents per loop iteration of `orchestrator-operating-rules.md` §9.

For workflow contract entry-point, see `CLAUDE.md`. Tiers are orthogonal to safety: they tune throughput / parallelism, not invariants. The kit's hard rules (sign-off gates, worktree isolation, plan-state coherence, gate-field write ownership, format-boundary contracts, commit-before-done, project-scoped containers, role-specialized dispatch, human-in-the-loop confirmation gates) hold across every tier.

---

## 13. Workload Tier

### 13.1 Why this exists

The kit's natural unit of work is one sub-agent dispatch. Without explicit tier guidance, the Orchestrator defaults to conservative behavior (one dispatch per turn, finish phase N before phase N+1, surface every NEEDS_CONTEXT immediately). For operators with constrained token budgets that's correct — for operators willing to burn tokens for throughput, it leaves throughput on the table.

The tier is a single dial that adjusts:

- **Maximum parallel dispatch** — how many sub-agents fire in one Orchestrator turn.
- **Cross-phase pipelining** — whether phase N+1 tasks start when their specific dependencies in phase N complete, vs. waiting for phase N to finish entirely.
- **Sub-agent batch dispatch** — whether one dispatch handles multiple related items (multiple US updates, multiple related tasks, etc.).
- **OQ accumulation cadence** — how often BA halts with NEEDS_CONTEXT vs. accumulates across cycles.
- **Eager pre-flight reads** — whether the Orchestrator pre-reads every in-flight task file or reads on demand.

Hooks, gates, and human-confirmation steps are unaffected.

### 13.2 Tier values

| Tier | When to use |
|---|---|
| `aggressive` | **Default.** Maximum throughput. Use when token budget is generous and operator wants the kit to drive end-to-end with minimal pauses. |
| `standard` | Moderate. Use when operator wants to see each phase complete before the next starts (visibility / debuggability). |
| `conservative` | One dispatch per Orchestrator turn; halt-friendly. Use when token-constrained OR first-pilot validation OR debugging the kit itself. |

### 13.3 Tier source — priority order

The Orchestrator determines the active tier at the start of each invocation:

1. **`CLAUDE_WORKLOAD_TIER` env var** if set (operator-explicit; highest priority).
2. **SRS header field `Workload-Tier:`** if present and SRS exists (project-level override; persists across operators).
3. **Kit default = `aggressive`** if neither source is set.

The Orchestrator logs the active tier in the session-start summary (`session-init-summary.cjs`) so the operator sees which tier is in effect.

### 13.4 Tier behavior matrix

| Behavior | `aggressive` | `standard` | `conservative` |
|---|---|---|---|
| **Max parallel dispatch per turn** | All eligible-parallel sub-agents dispatch in one Orchestrator turn (one message, multiple `Task` tool calls). No upper cap beyond Claude Code's concurrent-dispatch ceiling. | Up to 3 parallel sub-agents per turn (typical cap for visibility). | 1 sub-agent per turn. |
| **Cross-phase pipelining** | On — phase N+1's eligible tasks start when their specific phase-N dependencies complete. | Off — finish phase N's eligible tasks before dispatching phase N+1. | Off — finish phase N fully + operator confirmation before phase N+1. |
| **BA Mode D batch absorption** | Multiple US / FR updates per dispatch. | One US / FR update per dispatch. | One US / FR update per dispatch. |
| **SA `design` mode dispatch** | Architecture + ADRs + instrumentation-contract + §6 (format / gate-field rows) in ONE dispatch. | Architecture in one dispatch; ADRs in a follow-up; instrumentation-contract in a follow-up. | Same as standard but operator-paced. |
| **BE Dev batch dispatch** | 1–N related tasks sharing a service worktree per dispatch (cap: same service, same logical scope, same FR cluster). Multiple BE Devs in different worktrees run in parallel. | One task per dispatch. Multiple BE Devs across worktrees still parallel where deps allow. | One task per dispatch; no fan-out. |
| **FE Dev batch dispatch** | Same pattern as BE Dev for related FE tasks (typically per surface or per US cluster). | One task per dispatch. | One task per dispatch. |
| **QA-Author by-us Pass 1** | Already batched per protocol (all per-US TCs in one dispatch); aggressive adds: SA's instrumentation-contract emerges in same Orchestrator turn → Pass 2 dispatches immediately. | Pass 2 dispatches when SA's contract lands (sequential). | Pass 2 dispatches when contract lands + operator confirmation. |
| **QA-Author by-task batch** | Group related tasks sharing fixtures into one by-task dispatch. | One task per by-task dispatch. | One task per by-task dispatch. |
| **DevOps deploy batch** | Deploy independent components in parallel; one local-deployment dispatch composes the whole stack. | Deploy sequentially. | Deploy sequentially with operator confirmation. |
| **OQ accumulation (BA)** | BA accumulates OQs across 2–3 ingestion cycles before halting NEEDS_CONTEXT, unless an OQ is structural (e.g., conflicting requirements at the kit-blocking level — those halt immediately). | BA halts on first batched NEEDS_CONTEXT. | BA halts on first NEEDS_CONTEXT (no batching). |
| **Eager pre-flight reads** | Orchestrator pre-reads every in-flight task file + every eligible-next task file per turn. Burns tokens to gain context for batched-dispatch routing. | Reads on demand per dispatch. | Reads on demand. |
| **Operator-checkpoint frequency** | At sign-off transitions + Stage 4 brownfield + design-confirmed + iteration triggers. No others. | Above + per-phase completion. | Above + per-dispatch return (operator confirms each step). |

### 13.5 Worked example — aggressive mode on a 12-task phase

Scenario: SA + TL completed; master-plan has Phase 2 with 12 tasks. Dependencies: tasks T-005 → T-006 → T-007 form a chain (BE → API contract → FE consumer); T-008 / T-009 / T-010 are independent BE backend tasks; T-011 / T-012 are independent FE polish tasks; T-013 / T-014 / T-015 / T-016 are QA-author by-task work.

**Conservative**: 12 Orchestrator turns minimum (one dispatch each), operator confirms between phases.

**Standard**: ~6 turns. T-008 + T-009 + T-010 dispatch in one turn (3 parallel BE Devs); contract-pending dispatches sequenced; QA-Author tasks done sequentially.

**Aggressive**: ~2-3 turns.
- Turn 1: T-005 (BE Dev for the contract-publishing task) + T-008/T-009/T-010 (3 independent BE Devs) + T-011/T-012 (2 independent FE Devs working on polish that doesn't need the new contract) + T-013/T-014/T-015/T-016 (QA-Author by-task batched into 1-2 dispatches) — all dispatched in parallel in the same Orchestrator turn (multiple `Task` calls in one message).
- Turn 2: As T-005's contract lands `Frozen`, T-006 (BE follow-on) + T-007 (FE consumer) dispatch in parallel.
- Turn 3 (if needed): DevOps deploy + QA-Exec for tasks ready-for-deploy.

The aggressive tier saves wall-clock at the cost of more total tokens (5–10× depending on parallelism). For operators with the budget, the saved wall-clock is the trade.

### 13.6 What the tier does NOT change

The following remain absolute regardless of tier:

- **SRS sign-off gate** — no downstream work pre-sign-off (CLAUDE.md §2 + §10).
- **Design lifecycle human-confirmation** — Approver confirms design-confirmed; no auto-approval at any tier (parallel-execution.md §4 Step 4).
- **Stage 4 brownfield human confirmation** — extracted artifacts stay `Source: extracted` until human confirms (brownfield-onboarding.md §12).
- **Worktree isolation** — one agent per worktree, every dispatch (worktree-isolation.md §5). Aggressive tier creates MORE worktrees concurrently, but each remains isolated.
- **Plan-state coherence** — Orchestrator is sole writer to `docs/plan/`. Aggressive tier ingests `plan-update.json` from MORE concurrent worktrees per turn, but the ingestion still serializes through the Orchestrator.
- **All §10 hard rules** — including gate-field write ownership, format-boundary contracts, commit-before-done, project-scoped containers, role-specialized dispatch, API contract format declaration, self-containment, external-integration adequacy.
- **Hook layer** — every hook fires regardless of tier. Tier doesn't bypass safety; it tunes throughput.

If a safety check would block the aggressive-mode batch, the Orchestrator halts the affected dispatch and continues with the rest — the tier does not cause cascading retries on safety failures.

### 13.7 Setting the tier

**Per-operator session** (recommended for one-off tier changes):

```bash
# Bash / zsh
export CLAUDE_WORKLOAD_TIER=conservative
# Then invoke claude / claude-code as normal
```

**Per project** (recommended for the dominant operator-preference of the project):

Add to `docs/SRS.md` header:

```markdown
**Workload-Tier:** standard <!-- aggressive | standard | conservative — see CLAUDE.md §13 -->
```

The SRS field persists across operators; the env var is per-session.

**Kit-wide default** — change `CLAUDE.md` §13.2's "Default = `aggressive`" line. Affects every new project. Existing projects with explicit SRS-header tier override are unaffected.

### 13.8 When to step down from aggressive

The kit defaults to aggressive because the operator who chooses this kit typically has both ambition and a token budget. But aggressive isn't always right — step DOWN to `standard` or `conservative` when:

- **First-pilot validation** — you want to see each phase complete + verify output before letting the kit drive farther. Conservative gives operator checkpoints between dispatches.
- **Token-constrained operator** — limited budget for the run; want to minimize wasted dispatches if a phase fails mid-run.
- **Debugging the kit itself** — when you're trying to understand why a sub-agent produced unexpected output, one-dispatch-per-turn makes it easier to isolate.
- **Cost-sensitive day of the month** — your organization's budget cycle, etc.
- **Sub-agent that's flaky in your environment** — drop tier so failures are easier to retry without re-dispatching the parallel batch.

The tier is a dial, not a contract. Operator changes it as needed; SRS-header tier survives across sessions for project-level convention.

### 13.9 Hard rules

- **Aggressive tier does NOT skip human-confirmation steps.** Design-confirmed remains operator-confirmed; Stage 4 brownfield remains operator-confirmed; SRS sign-off remains a deliberate transition.
- **Aggressive tier does NOT bypass hooks.** Every PreToolUse hook fires before every dispatched sub-agent's tool call. Tier-induced concurrency increases hook fire rate; the hook layer is sized for it.
- **Aggressive tier does NOT batch unrelated tasks.** A BE Dev dispatch handling 5 tasks must verify those tasks share service / logical scope / FR cluster. Cross-service batching is a regression — batch boundaries follow worktree boundaries.
- **Operator may step down tier mid-project without ceremony.** Setting `CLAUDE_WORKLOAD_TIER=conservative` for one session doesn't invalidate prior aggressive-mode output; the Orchestrator just dispatches more cautiously from that point forward.
- **Tier is not a license to skip exit-criteria validation.** Each sub-agent's exit criteria fire per dispatch regardless of batch size; if BE Dev's batch dispatch handles 5 tasks, all 5 must pass exit criteria before the batch return.

### 13.10 Cross-references

- `orchestrator-operating-rules.md` §9 Step 4 — reads the tier and applies the dispatch matrix above
- `parallel-execution.md` §4 — tier-aware default parallel patterns
- `sub-agent-registry.md` §3.x — sub-agent exit criteria (unchanged across tiers)
- `worktree-isolation.md` §5 — worktree-per-agent (aggressive tier creates more concurrent worktrees)
- `session-init-summary.cjs` — reports active tier at session start
