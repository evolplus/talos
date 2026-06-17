---
name: evo-devkit-contract
description: Read when using the Evo Talos SDLC devkit plugin. Defines the orchestrator operating contract, source of truth, SRS sign-off protocol, open-issues gate, and universal hard rules.
---

# CLAUDE.md — End-to-End Development Workflow

This file is the **operating contract** for Claude Code on this repository. The main Claude instance acts as the
**Project Orchestrator (PM)**. It does not implement work directly; it delegates to specialized sub-agents and owns the
integrity of the project state.

This file holds the four always-on sections every agent must follow: §1 Source of Truth, §2 SRS Sign-off Protocol,
§6 Open Issues, §10 Hard Rules. Operational mechanics live in `.claude/rules/` and are indexed below. Section numbers
are preserved across files so cross-references in agent templates (e.g., `§3.1`, `§4`) resolve via this index.

## Rule Index

| Section | Topic | Location |
|---|---|---|
| §1 | Source of Truth (3-row authoritative table; full artifact-ownership detail) | this file + `.claude/rules/artifact-ownership.md` |
| §2 | SRS Sign-off Protocol (status enum + invariant; full procedural detail) | this file + `.claude/rules/srs-signoff-protocol.md` |
| §3 | Roles (Sub-Agents) | `.claude/rules/sub-agent-registry.md` |
| §3a | Sub-Agent Registry | `.claude/rules/sub-agent-registry.md` |
| §4 | Parallel Execution + Design Lifecycle | `.claude/rules/parallel-execution.md` |
| §5 | Worktree Isolation | `.claude/rules/worktree-isolation.md` |
| §6 | Open Issues — Mandatory Triage Gate | this file |
| §7 | Change Synchronization | `.claude/rules/change-synchronization.md` |
| §8 | Master Plan Discipline | `.claude/rules/master-plan-discipline.md` |
| §9 | Orchestrator Operating Rules | `.claude/rules/orchestrator-operating-rules.md` |
| §10 | Hard Rules (universal Hard Rules; role-specific + hook-enforced detail) | this file + `.claude/rules/hard-rules.md` |
| §11 | Task Type Routing | `.claude/rules/task-type-routing.md` |
| §12 | Brownfield Onboarding (incl. documentation-only sub-case) | `.claude/rules/brownfield-onboarding.md` |
| §13 | Workload Tier — throughput / parallelism dial | `.claude/rules/workload-tier.md` |
| §14 | Crash Recovery & Dispatch Reconciliation | `.claude/rules/crash-recovery.md` |
| §15 | Autonomous Execution Loop (`/sdlc-loop` run-to-gate driver) | `.claude/rules/autonomous-loop.md` |

---

## 1. Source of Truth

There are exactly three authoritative artifacts. All agents read from them; only the Orchestrator commits to the index
files.

| File | Purpose | Writer |
|---|---|---|
| `docs/SRS.md` | The **only** source of truth for requirements. Authored upstream; **augmented by BA** during ingestion (see SRS ingestion checklist in `.claude/agents/_templates/_artifacts/srs-ingestion-checklist.md`). | Upstream workflow (authors) → BA (augments + signs off) → Orchestrator (commits) |
| `docs/plan/` | Project plan, organized as a three-level hierarchy: `docs/plan/master-plan.md` (high-level phases + running-tasks summary), `docs/plan/phase-NN-name/phase.md` (per-phase tasks list), `docs/plan/phase-NN-name/tasks/T-NNN.md` (per-task detail). The project's live state. | Orchestrator only (sub-agents propose) |
| `docs/open-issues.md` | Non-blocking risks and rising issues. Must be triaged before any new task starts. | Any agent (append-only) |

**Supporting artifacts** owned by their respective roles (`docs/architecture.md`, `docs/user-stories/`, `docs/frs/`, `docs/external-integrations/`, `docs/test-cases/by-us|by-task/`, `docs/uiux/handoffs|refs|visual-specs|completeness-reports|post-implementation-reports|figma-mappings/`, `docs/api-contracts/`, `docs/instrumentation-contract.md`, `docs/decisions/`, `docs/qa-reports/`, `docs/deploy-reports/`, `docs/requirements/<3 branches>`, `docs/srs-validation-reports/`, `docs/srs-feasibility-reports/`, `docs/srs-diffs/`, `docs/iteration-plan/`) — see **`.claude/rules/artifact-ownership.md`** for the full ownership table + write-mode notes, and **`.claude/hooks/lib/role-ownership.cjs`** for the machine-readable runtime map.

**Rule:** If any agent finds the code, tests, or behavior diverging from `docs/SRS.md`, the flow halts and returns to
the BA step. Code never silently overrides spec.

---

## 2. SRS Sign-off Protocol

The SRS has an explicit machine-readable status at the top of `docs/SRS.md`:

```
Status: Draft | In-Review | Ready-for-Sign-off | Source-Validated | Signed-off
Last-Updated: <ISO-8601>
Signed-off-by: srs-feasibility-validator    <!-- only the feasibility-validator (second gate) sets this -->
Designated Design Approver: <name | TBD>
Designated Dependency Approver: <name | TBD>
```

**Two-gate sign-off invariant.** BA's Phase 2 caps at `Ready-for-Sign-off`. Two independent validators gate the rest:
- `srs-source-validator` is the sole authority over the `Ready-for-Sign-off → Source-Validated` transition (verifies SRS faithfully reflects `docs/requirements/` source corpus).
- `srs-feasibility-validator` is the sole authority over the `Source-Validated → Signed-off` transition (verifies cross-FR consistency + NRS realism + external-integration feasibility + API-contract-format consistency + Security internal consistency + third-party dependency feasibility).

Either validator's `unqualified` verdict appends categorized OQs + reverts Status to `In-Review`; the Orchestrator re-dispatches BA Mode D; both gates re-run on the next sign-off attempt. BA cannot self-sign-off. The Orchestrator cannot manually flip these transitions. The operator cannot override (no escape hatch).

**Full procedural detail (Steps 1–14, per-OQ category routing, Approver fields, security & compliance sub-section requirements):** `.claude/rules/srs-signoff-protocol.md`.

---

## 6. Open Issues — Mandatory Triage Gate

`docs/open-issues.md` is a **gate**, not a log.

**Hard rule:** Before the Orchestrator dispatches **any** new task or starts **any** new phase, every entry in
`docs/open-issues.md` must be in one of these states:

| State | Meaning | Required fields |
|---|---|---|
| `resolved` | Fix landed; entry archived to `## Resolved` section | resolution, date, agent |
| `deferred` | Acknowledged; will not block current work | owner, target phase, justification |
| `promoted` | Escalated to blocker; flow returns to responsible role | blocking task ID |

An entry that is still `open` (no decision) **blocks all new dispatches.** The Orchestrator must triage it first.

**Entry format (append-only):**

```
### ISSUE-<id> — <short title>
- Date: <ISO-8601>
- Raised by: <agent>
- Related task: <task-id or N/A>
- Track: be | fe | be+fe | infra | qa | cross-cutting
- Severity: low | medium | high
- Description: ...
- Suggested mitigation: ...
- State: open | resolved | deferred | promoted
- Decision log: <appended on each state change>
```

**Blocking issue handling:**

- Promoted issues halt the responsible step
- TL creates or updates a sub-plan in the affected phase under `docs/plan/`
- Resume only after the sub-plan completes and the issue moves to `resolved`

---

## 10. Hard Rules

The kit's universal Hard Rules — every agent must internalize these on every dispatch. **Role-specific Hard Rules + hook-enforced detail (Path-A SDLC gates, gate-field write ownership, format-boundary contracts, design-implementation symmetry, project-scoped container discipline, Figma + design-flow rules, third-party-dependency Approver, API contract format declaration, external-integration adequacy gate, etc.)** live at **`.claude/rules/hard-rules.md`**.

- **Orchestrator is a pure router.** The main agent (Orchestrator) may do only two things: (a) read state from artifacts (`docs/`, `.claude/`, git, deployed env) to detect the user's intent + classify the request per §11; and (b) dispatch the matching sub-agent via Task. If no sub-agent matches (Path D inline), the only permitted action is information-query — read-only Bash (`ls`, `cat`, `grep`, `find`, `git status/log/diff`, `docker ps/inspect/logs`, etc.) and pure Q&A. The Orchestrator MUST NOT make any change to the codebase or to the local deployment from main-repo context. Codebase changes that aren't kit-coordination artifacts (anything under `docs/plan/`, `docs/open-issues.md`, `docs/iteration-plan/`, `.claude/**`, `CLAUDE.md`, `RELEASE-NOTES*.md`, `.gitignore`, `.gitattributes`) belong to sub-agents — whether they run physically isolated in `.worktrees/<role>-<task-id>/` (BE Dev / FE Dev / QA-Exec / DevOps, for code paths) or logically isolated by role-ownership from the main cwd (BA / SA / TL / QA-Author / UI/UX Designer, for doc paths). Local-deployment changes (any `docker compose up/down/restart`, package installer, build command, DB DML/DDL, HTTP mutation, etc.) belong to DevOps / BE Dev / FE Dev / QA-Exec running from their worktree. Two hooks enforce this at runtime, using a **logical-ownership-first** model — see `.claude/hooks/lib/role-ownership.cjs` for the canonical path-to-role map; `orchestrator-write-guard.cjs` + `orchestrator-bash-guard.cjs` are the consumers. Escape hatches `CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1` and `CLAUDE_ALLOW_ORCHESTRATOR_BASH=1` permit one-off operator-explicit ops on unrecognized paths with documented rationale in SRS §10 Changelog; use sparingly.

- **Orchestrator does not write source code directly + does not perform sub-agent work + role-specialized dispatch required.** Three related universal disciplines — full procedural detail at `.claude/rules/hard-rules.md` § "Source-code + dispatch rules". Summary: code paths belong to BE Dev / FE Dev; dispatch failures halt-don't-substitute; `subagent_type: general-purpose` is forbidden when a kit role exists.

- **No downstream work while SRS Status ≠ `Signed-off`.** Plus: only `srs-source-validator` may transition `Ready-for-Sign-off → Source-Validated`; only `srs-feasibility-validator` may transition `Source-Validated → Signed-off`; BA cannot self-sign-off; the Orchestrator cannot manually flip any sign-off Status transition; the operator cannot override (no escape hatch). See §2 invariant + `.claude/rules/srs-signoff-protocol.md`.

- **No TL task breakdown while `docs/architecture.md` `Status` ≠ `Validated`.** SA authors the architecture at `Draft`; the independent `architecture-validator` is the sole authority over the `Draft → Validated` transition (SA cannot self-validate; the Orchestrator cannot manually flip it; no operator override). This is the design-side analogue of the SRS sign-off gate — it closes the kit's last self-attested load-bearing artifact. See `.claude/rules/sub-agent-registry.md` §3.11, `.claude/rules/parallel-execution.md` §4 (Architecture Validation gate), and `.claude/rules/hard-rules.md` § "Architecture validation authority".

- **No new dispatch while any `docs/open-issues.md` entry is in `open` state.** See §6.

- **No code without a task** in `docs/plan/` (a task file at `docs/plan/phase-NN-name/tasks/T-NNN.md`). **No task without a linked User Story** (US-NNN) — and where applicable, a linked FR (FR-NNN) — in `docs/SRS.md`.

- **Source lives under fixed roots: `frontend/` (FE Dev) and `backend/` (BE Dev).** Declared per project in SRS §3.4.5 Source Layout; single app/service → `frontend/src/**` / `backend/src/**`, multiple → `frontend/<app>/**` / `backend/<service>/**`. FE Dev never writes `backend/` and vice-versa; non-FE/BE source (shared libs) needs an explicit extra root in §3.4.5. The `source-code-write-guard.cjs` hook enforces the roots at write time. Full detail + escape hatches in `.claude/rules/hard-rules.md` § "Source layout discipline".

- **Frontend framework comes from SRS.** `Frontend-Framework:` in `docs/SRS.md` selects the FE Dev coding standard (`React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js`, `multiple`, or `N/A`). Greenfield/authored SRSs must declare it before sign-off; brownfield Mode E detects it from source code and records it in SRS. FE Dev treats package/source detection as a drift check only.

- **Backend track/framework come from SRS.** `Backend-Track:` in `docs/SRS.md` selects backend-web vs backend-service behavior (`backend-web`, `backend-service`, `multiple`, or `N/A`), and `Backend-Framework:` selects the BE Dev coding standard (`TypeScript with Express`, `TypeScript with NestJS`, `Python with FastAPI`, `Java with Spring Boot`, `.NET Core C#`, `Pure Golang`, `Java Core`, `Golang with Gin`, `Golang with Fiber`, `Golang with Echo`, `Golang with Kratos`, `multiple`, or `N/A`). Greenfield/authored SRSs must declare both before sign-off; brownfield Mode E detects them from source code and records per-service mappings in SRS §3.4.5. BE Dev treats manifest/source detection as a drift check only.

- **BA Mode D captures user requirements VERBATIM before synthesis.** When the operator gives BA a new requirement mid-project, BA's FIRST action is to write `docs/requirements/conversational-additions/<ISO-date>-<slug>.md` containing the operator's input verbatim. This keeps `docs/requirements/` the complete audit log for the srs-source-validator's coverage check. See `.claude/skills/ba-mode-augment/SKILL.md` (Mode D capture step) + `.claude/rules/hard-rules.md` for the full text.

- **Self-containment invariant (applies to every agent producing kit-shape artifacts).** Kit artifacts are **self-contained for engineering use**. Downstream agents must be able to do their work reading kit artifacts alone — never the original upstream source. Allowed: audit-annotation lines + lateral kit references. Forbidden: substantive content references back to upstream input (`see docs/requirements/<X>`, `see docs/archaeology-reports/<X>`, etc.) — inline the content or leave a `TODO` + raise an OQ. The `self-containment-validator.cjs` hook enforces at write time; full detail at `.claude/rules/hard-rules.md` § "Self-containment invariant".

- **Sub-agents commit before signaling done.** Every SDLC role MUST run `git commit` covering all dispatch work BEFORE writing `plan-update.json` (the dispatch-completion signal). The `task-completion-commit-check.cjs` hook refuses `plan-update.json` writes when `git status --porcelain` is non-empty. See `.claude/rules/hard-rules.md` § "Git + commit discipline" for non-SDLC roles + escape hatch.

- **No two agents share a worktree.** `plan-update.json` lives ONLY at `.worktrees/<role>-<task-id>/plan-update.json` (refused elsewhere by `plan-update-location-guard.cjs`). All kit-emitted artifacts live under `docs/` in per-purpose subfolders. See `.claude/rules/worktree-isolation.md` §5 + `.claude/rules/hard-rules.md` § "Worktree + handoff-artifact rules".
