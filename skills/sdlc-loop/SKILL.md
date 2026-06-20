---
name: sdlc-loop
description: Codex-native orchestration entrypoint for Evo Talos. Use when the user asks for /sdlc-loop, sdlc-loop, start project, continue the SDLC loop, run the governed workflow, or auto-dispatch eligible SDLC work until the next gate. Acts as the Codex equivalent of the Claude slash command.
agents: [orchestrator]
sdlc_phase: orchestration
owner: Platform Eng
status: active
---

# SDLC Loop

## Purpose

Codex plugins do not expose Claude-style slash commands from `commands/`.
This skill is the Codex command shim for `/sdlc-loop`.

Use it when the operator wants the kit to start or continue the governed SDLC
workflow.

## Before Running

1. Read the project `AGENTS.md` if it exists.
2. Read the plugin contract skill `evo-devkit-contract`.
3. Resolve any `.claude/rules/...` references in injected guidance to the
   plugin-local `rules/...` files when running in Codex, because the default
   Codex target does not copy `.claude/` into the project.
4. Read only the rule files needed for the current route. For a normal loop
   invocation, these are usually:
   - `rules/orchestrator-operating-rules.md`
   - `rules/autonomous-loop.md`
   - `rules/task-type-routing.md`
   - `rules/srs-signoff-protocol.md`
   - `rules/master-plan-discipline.md`
   - `rules/parallel-execution.md`
   - `rules/worktree-isolation.md`
   - `rules/hard-rules.md`

## Arguments

Treat text after `sdlc-loop` or `/sdlc-loop` as arguments.

- `--tier aggressive|standard|conservative` - override workload tier for this run.
- `--max-iterations N` - soft cap for loop iterations. Default: 50.
- `--schedule [cadence]` - if Codex automation tools are available, register a
  recurring run of the same prompt without `--schedule`; otherwise report that
  scheduling is unavailable in this environment.

## Loop Procedure

Run as the Orchestrator:

1. Perform pre-flight once:
   - verify repository and git identity when a git repo exists;
   - reconcile root-level `plan-update*.json` stragglers;
   - run crash-recovery reconciliation if dispatch journals exist;
   - record the active workload tier.
2. At the top of every iteration, read state from disk:
   - `docs/SRS.md` status;
   - `docs/open-issues.md`;
   - `docs/plan/`;
   - `docs/iteration-plan/`;
   - `docs/architecture.md` validation status;
   - deploy and QA reports when relevant.
3. Check halt conditions before dispatching:
   - unresolved human decision;
   - open issue that is not resolved, deferred, or promoted;
   - unsigned SRS or unvalidated architecture;
   - missing design confirmation for UI work;
   - dependency approval, external-integration adequacy, or QA failure that
     needs human or role-specific action;
   - circuit breaker or iteration cap.
4. If not halted, identify the eligible batch and dispatch the matching role.
5. On each role return, validate exit criteria, ingest `plan-update.json`,
   merge role-owned artifacts, and update task state according to the rules.
6. Auto-route non-human failures to the owning role:
   - SRS validator failure -> BA Mode D;
   - architecture validator failure -> SA revision;
   - design completeness failure -> UI/UX Designer revise or incorporate;
   - QA failure -> responsible Dev, QA-Author, DevOps, SA, UI/UX, or BA based
     on the failed artifact.
7. Stop at the first halt condition and summarize the exact unblock action.

## Codex Invocation Phrases

Operators can invoke this in Codex with natural prompts such as:

- `Run sdlc-loop`
- `Start project`
- `Continue the SDLC loop`
- `Run sdlc-loop --tier standard --max-iterations 20`

