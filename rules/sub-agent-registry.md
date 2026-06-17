# Sub-Agent Registry

This file holds CLAUDE.md §3 (role definitions) and §3a (registry mapping).
Section numbers are preserved from the original CLAUDE.md so existing cross-references in agent
templates (e.g., `§3.1`, `§3.5`) continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`.

---

## 3. Roles (Sub-Agents)

Each role has a defined input, output, and exit criteria. No role proceeds without its inputs being signed off.

### 3.0 Agent Generator (Meta-Agent)

The Agent Generator is a meta-role that creates and refreshes the role-specific agent files in `.claude/agents/` based
on the current SRS and architecture. Two dispatch modes — `default` (post-sign-off, full specialization) and `bootstrap`
(pre-sign-off, skeleton-only) — handle the chicken-and-egg between BA / SA-extract / SA-adequacy needing to run before
SRS is Signed-off.

- **Input (default mode):** Signed-off `docs/SRS.md`, `docs/architecture.md` (if exists), static skeletons in
  `.claude/agents/_templates/`.
- **Input (bootstrap mode):** Static skeleton at `.claude/agents/_templates/<role>.md` only; SRS is intentionally NOT
  read (this mode exists precisely because SRS doesn't yet exist or isn't Signed-off).
- **Output (default mode):** Generated `.claude/agents/<role>.md` files for every SDLC role with a header block:

  ```
  Generated-From-SRS-Hash: <sha256-of-SRS>
  Generated-At: <ISO-8601>
  Generator-Version: 1.0
  SRS-Status-At-Generation: Signed-off
  ```

  Plus a `## Project Specialization` section per role.
- **Output (bootstrap mode):** A single `.claude/agents/<role>.md` (the role named in dispatch input — BA always, or SA
  with explicit `dispatch_intent`) containing the template verbatim plus a bootstrap header:

  ```
  Generated-From-SRS-Hash: bootstrap
  Generated-At: <ISO-8601>
  Generator-Version: 1.0
  SRS-Status-At-Generation: <Draft | In-Review | absent>
  Mode: bootstrap
  Dispatch-Intent: <ba-first-dispatch | sa-extract | sa-external-integration-adequacy>
  Will-Be-Regenerated-On: SRS Status → Signed-off
  ```

  No `## Project Specialization` is added in bootstrap mode.
- **Triggered when:**
  1. **Default mode**: SRS Status transitions Draft → Signed-off (the primary regen trigger); architecture is created or substantially changed; operator runs `/regenerate-agents`; or default-mode dispatch of any SDLC role finds its file absent post-sign-off. **On subsequent sign-off transitions (after the first ever), the Orchestrator halts at §9 Step 4.5 with an operator regen-confirmation gate — three options (skip / targeted regen / full regen) with smart default based on SRS diff size. Default mode supports a `target_roles:` parameter for the targeted-regen path.**
  2. **Bootstrap mode**: Orchestrator §9 Step 4.5 detects a pre-sign-off dispatch (BA first-ever, SA `extract`, SA `external-integration-adequacy`) and the target role's file is absent. Dispatch input names `mode: bootstrap` + `target: <role>` + (for SA) `dispatch_intent: <extract | external-integration-adequacy>`.
- **Exit criteria:**
  - Default mode: every SDLC role per §3a has a file; every file's `Generated-From-SRS-Hash` equals the current SRS hash; no skeleton rule dropped.
  - Bootstrap mode: the one named role has a file with `Mode: bootstrap` header; no other roles touched.
- **Authority:** The **only** role permitted to write under `.claude/agents/` (excluding `_templates/`, which is human-edited, and `_non-sdlc/`, which is kit-shipped). Bootstrap-mode writes are subject to the same authority rule.

**Regeneration discipline:**

- Never edit a generated agent file by hand. If a fix is needed, update either the template (skeleton-level fix) or the
  SRS (project-level fix), then regenerate.
- The Orchestrator must check `Generated-From-SRS-Hash` against the current SRS hash before dispatching any sub-agent.
  If the file's hash is `bootstrap` AND SRS is now Signed-off, dispatch Agent Generator in default mode to regenerate (this is the standard "specialization timing" path). If the file's hash is a real SRS sha256 but doesn't match current SRS, also regenerate (SRS changed since last generation).

### 3.0a Commit-Before-Done Discipline (cross-role exit criterion)

Every SDLC role's exit criteria — in addition to the role-specific exits below — includes one universal item: **Git commit completed for all dispatch work, per [`.claude/skills/git-commit/SKILL.md`](../skills/git-commit/SKILL.md), before signaling done**. Concretely:

- **SDLC roles** (BA / SA / TL / QA-Author / BE Dev / FE Dev / DevOps / QA-Exec / UI/UX Designer): the `task-completion-commit-check.cjs` hook refuses `plan-update.json` writes when `git status --porcelain` is non-empty in the agent's cwd. Agents commit their worktree-local artifacts before emitting the dispatch return signal.
- **Non-SDLC roles** (Researcher / Debugger / Code Reviewer / OQ Resolver / Codebase Archaeologist): the hook doesn't fire (no `plan-update.json`); the prose Hard Rule in each non-SDLC template + Orchestrator's return-time validation (§9 Step 7) enforce the same discipline.
- **Agent Generator**: commits generated `.claude/agents/<role>.md` files before returning, via the prose Hard Rule in `_meta/agent-generator.md`.
- **Orchestrator**: commits master-plan transitions on main per §9 Step 7 (unchanged); is bound by the same discipline.

The pre-flight Step 0 (orchestrator-operating-rules.md §9 Step 0) guarantees a working git context exists before any dispatch; this rule guarantees every dispatch leaves a clean worktree behind.

### 3.1 Business Analyst (BA)

- **Input:** User request, existing `docs/SRS.md`
- **Output:** Updated `docs/SRS.md`; Status transitions per CLAUDE.md §2; `docs/uiux/completeness-reports/<task-id>.md`
  when re-dispatched after designer handoff
- **Exit criteria:** SRS Status = `Signed-off` (Phase 1+2); design completeness report emitted (Phase 3)

### 3.1a UI/UX Designer

- **Input:** Signed-off SRS with UI requirements lacking qualified designs; in `revise` mode, the BA's
  `docs/uiux/completeness-reports/<task-id>.md`
- **Output:** Figma designs covering every UI surface in SRS; `docs/uiux/handoffs/<task-id>.md`; updated
  `## Design References` in SRS
- **Modes:** `create` (greenfield — no designs exist, designer authors new screens), `import` (existing designs already in Figma — designer reads, produces handoff, flags gaps; read-only against Figma), `revise` (designs exist but BA Phase 3 returned unqualified), or `incorporate` (the Designated Design Approver edited Figma directly between handoff and confirmation; absorb the human's edits into a regenerated handoff). See `.claude/rules/parallel-execution.md` §4 Step 1 for the mode-selection matrix.
- **Exit criteria:** Every UI requirement in SRS has a pinned Figma node; proposes design sub-status
  `design-ready-for-review`

### 3.2 Solution Architect (SA)

- **Input:** Signed-off SRS
- **Output:** New or updated `docs/architecture.md`; ADR in `docs/decisions/` for any non-trivial choice;
  `docs/instrumentation-contract.md` for any UI-bearing SRS (mandatory; gives QA-Author a single selector source — see `.claude/rules/parallel-execution.md` §4 Pass 1 / Pass 2)
- **Exit criteria:** Architecture covers every SRS requirement; cross-cutting concerns (auth, data, observability,
  failure modes) are explicit

### 3.3 Tech Lead (TL)

- **Input:** SRS + architecture
- **Output:** Phased backlog proposed as a `plan-proposal/` tree in the TL's worktree mirroring `docs/plan/` — phases, tasks, dependencies, definition-of-done per
  task. Each task is tagged with its track: `be`, `fe`, `be+fe`, `infra`, or `qa`.
- **Exit criteria:** Every SRS User Story and FR maps to at least one task; every task has a clear DoD and track tag

### 3.4 QA (Authoring)

- **Input:** SRS + master plan
- **Output:**
  - Test cases under `docs/test-cases/by-us/<US-NNN>/` (by-us mode, US-scoped) and `docs/test-cases/by-task/<task-id>/` (by-task mode, task-scoped), linked to SRS User Story anchors (Main Flow steps, Business Rules, Post-conditions) and FR Error Handling rows. Test cases distinguish UI-level,
    API-level, and end-to-end coverage.
  - For UI tasks: visual spec at `docs/uiux/visual-specs/<task-id>.md`

### 3.5 Backend Developer (BE Dev)

- **Scope:** Server-side code, data layer, APIs, background jobs, integrations
- **Input:** Assigned BE or BE+FE task, SRS `Backend-Track:` / `Backend-Framework:`, and §3.4.5 Source Layout service mapping
- **Output:**
  - Implementation + self-verification (unit tests pass, lint clean, task DoD met)
  - **API contract** published or updated under `docs/api-contracts/<endpoint>.md` (or OpenAPI/Proto file) **before**
    any FE task that depends on it can start
- **Exit criteria:** Self-verification passes; API contract published if applicable; proposes task status
  `ready-for-deploy`

### 3.6 Frontend Developer (FE Dev)

- **Scope:** UI code, client-side state, browser/mobile-side logic, accessibility, frontend build
- **Input:** Assigned FE or BE+FE task. For UI tasks: confirmation that the task's design sub-status =
  `design-confirmed` and the Figma file version ID recorded in master plan; reference to
  `docs/uiux/handoffs/<task-id>.md`. For BE-dependent tasks: confirmation that the API contract is `Frozen` and the
  path under `docs/api-contracts/`.
- **Output:**
  - Implementation + self-verification (unit tests pass, lint clean, task DoD met)
  - Per-task design contract under `docs/uiux/refs/<task-id>.md` and associated reference snapshots, frozen against the
    user-confirmed Figma file version, before any UI code is written
- **Exit criteria:** Self-verification passes; UI matches the linked User Story's Business Rules / Post-conditions and the per-task design contract;
  proposes task status `ready-for-deploy`

### 3.7 DevOps

- **Input:** Task marked `ready-for-deploy`
- **Output:** Local environment deployed (FE and BE composed together where the task spans both), health checks green;
  deploy report at `docs/deploy-reports/<task-id>.md`
- **Exit criteria:** QA can reach the deployed build end-to-end

### 3.8 QA (Execution)

- **Input:** Deployed build + test cases
- **Output:** Test execution report at `docs/qa-reports/<task-id>.md` with per-property validation results, plus visual
  artifacts under `docs/qa-reports/<task-id>/`. Coverage gap report (components or states unexercised) is included.
- **Failure = blocker.** Notify TL with the failed track (FE / BE / integration); flow returns to the responsible
  Developer with a sub-plan.

### 3.9 SRS Source Validator (first sign-off gate; source faithfulness)

- **Input:** `docs/SRS.md` at Status `Ready-for-Sign-off` + the full source corpus at `docs/requirements/` (initial PM input + `conversational-additions/`) + every `docs/user-stories/<US-ID>.md` + `docs/frs/<FR-ID>.md` + `docs/external-integrations/<system-slug>.md`. Dispatched by Orchestrator when BA's Phase 2 flips Status to `Ready-for-Sign-off`.
- **Output:** `docs/srs-validation-reports/v<srs-version>.md` — append-only artifact with one `## Validation run <N>` section per dispatch; coverage matrix; verdict `qualified` or `unqualified`; per-gap routing recommendations. Updates `docs/SRS.md` Status field (and OQ list on `unqualified`).
- **Exit criteria:** Verdict written; SRS Status correctly transitioned (`qualified` → `Source-Validated`; `unqualified` → `In-Review`); `plan-update.json` signals routing to Orchestrator.
- **Authority:** The **sole** role permitted to write `Status: Source-Validated` to `docs/SRS.md`. BA cannot self-sign-off; the Orchestrator cannot manually flip Status. Does NOT directly sign off — `srs-feasibility-validator` is the second gate.

### 3.10 SRS Feasibility Validator (second sign-off gate; technical feasibility)

- **Input:** `docs/SRS.md` at Status `Source-Validated` + the most recent source-validation report (qualified) + every `docs/user-stories/<US-ID>.md` + `docs/frs/<FR-ID>.md` + `docs/external-integrations/<system-slug>.md` + (when present) `docs/architecture.md` + `docs/decisions/<ADR-ID>.md` + the `solution-defaults` + `third-party-dependency-evaluation` skills. Dispatched by Orchestrator when srs-source-validator flips Status to `Source-Validated`.
- **Output:** `docs/srs-feasibility-reports/v<srs-version>.md` — append-only artifact with one `## Feasibility run <N>` section per dispatch; six concern areas covered (cross-FR / NRS / external-integration / API-contract-format / Security / third-party dependency). Updates `docs/SRS.md` Status field (and OQ list on `unqualified`).
- **Exit criteria:** Verdict written; SRS Status correctly transitioned (`qualified` → `Signed-off`; `unqualified` → `In-Review`); `plan-update.json` signals routing to Orchestrator.
- **Authority:** The **sole** role permitted to write `Status: Signed-off` to `docs/SRS.md`. BA cannot self-sign-off; srs-source-validator cannot self-sign-off; the Orchestrator cannot manually flip Status; the operator cannot override (no escape hatch). The kit's discipline rests on author-and-approver-being-different-agents AND on source-vs-feasibility concerns staying separated.

### 3.11 Architecture Validator (independent design gate; post-SRS-sign-off, pre-TL)

- **Input:** `docs/architecture.md` at `Status: Draft` (SA `design` mode just returned, or SA revised after a prior `unqualified`) + signed-off `docs/SRS.md` + every `docs/user-stories/<US-ID>.md` + `docs/frs/<FR-ID>.md` + `docs/external-integrations/<system-slug>.md` + every ADR under `docs/decisions/` + `docs/instrumentation-contract.md` (when UI-bearing) + the `solution-defaults` / `format-boundary-contracts` / `data-lifecycle-contracts` skills. Dispatched by Orchestrator after SA produces/updates the architecture and BEFORE TL.
- **Output:** `docs/architecture-validation-reports/v<arch-version>.md` — append-only artifact with one `## Validation run <N>` section per dispatch; seven checks covered (SRS→component coverage / §6 cross-component contracts / ADR completeness / instrumentation-contract presence / NRS→mechanism mapping / cross-cutting concerns / source-layout + self-containment). Updates `docs/architecture.md` Status field (header only).
- **Exit criteria:** Verdict written; architecture Status correctly handled (`qualified` → `Validated`; `unqualified` → stays `Draft` with a revision list); `plan-update.json` signals routing to Orchestrator.
- **Authority:** The **sole** role permitted to write `Status: Validated` to `docs/architecture.md`. SA cannot self-validate; TL cannot start until `Validated`; the Orchestrator cannot manually flip Status; the operator cannot override (no escape hatch). Closes the kit's last self-attested load-bearing artifact — same author-≠-approver discipline the two SRS validators apply to the SRS.

---

## 3a. Sub-Agent Registry

The roles in Section 3 are conceptual. The actual invokable sub-agents are defined in `.claude/agents/`:

| Role | Agent file | Dispatch `subagent_type` | Tool scope |
|---|---|---|---|
| BA | `.claude/agents/ba.md` | `ba` | Read repo; Read external sources via MCP (Mode C ingestion); Write `docs/SRS.md`, `docs/user-stories/<US-ID>.md`, `docs/frs/<FR-ID>.md`, `docs/open-issues.md`, `docs/uiux/completeness-reports/<task-id>.md` |
| UI/UX Designer | `.claude/agents/ui-ux-designer.md` | `ui-ux-designer` | Read repo; Read+Write Figma via MCP; Write SRS `## Design References` only; Write `docs/uiux/handoffs/<task-id>.md`, `docs/open-issues.md`, `plan-update.json` |
| SA | `.claude/agents/sa.md` | `sa` | Read repo; Write `docs/architecture.md`, `docs/decisions/`, `docs/instrumentation-contract.md` |
| TL | `.claude/agents/tl.md` | `tl` | Read repo; Write `master-plan-proposal.md` (worktree), `plan-update.json` |
| QA-Author | `.claude/agents/qa-author.md` | `qa-author` | Read repo + Figma (read-only); Write `docs/test-cases/`, `docs/uiux/visual-specs/<task-id>.md` |
| BE Dev | `.claude/agents/be-dev.md` | `be-dev` | Read/write backend code paths and `docs/api-contracts/`; Write `plan-update.json` |
| FE Dev | `.claude/agents/fe-dev.md` | `fe-dev` | Read `docs/api-contracts/`, `docs/uiux/handoffs/<task-id>.md`, `docs/uiux/visual-specs/<task-id>.md`, Figma (read-only); Write frontend code, `docs/uiux/refs/<task-id>.md`, `plan-update.json` |
| DevOps | `.claude/agents/devops.md` | `devops` | Read repo; execute deploy scripts; Write `docs/deploy-reports/<task-id>.md`, `plan-update.json` |
| QA-Exec | `.claude/agents/qa-exec.md` | `qa-exec` | Read repo + deployed env; Write `docs/qa-reports/<task-id>.md`, `docs/qa-reports/<task-id>/`, `plan-update.json` |
| SRS Source Validator | `.claude/agents/srs-source-validator.md` | `srs-source-validator` | Read entire repo (especially `docs/requirements/`, `docs/SRS.md`, `docs/user-stories/`, `docs/frs/`, `docs/external-integrations/`); Write `docs/SRS.md` (Status + Changelog + OQ appends only), `docs/srs-validation-reports/v<srs-version>.md`, `docs/open-issues.md`, `plan-update.json` |
| SRS Feasibility Validator | `.claude/agents/srs-feasibility-validator.md` | `srs-feasibility-validator` | Read entire repo + `docs/architecture.md` (when present) + `docs/decisions/` + skills `solution-defaults`, `third-party-dependency-evaluation`; Write `docs/SRS.md` (Status + Changelog + OQ appends only), `docs/srs-feasibility-reports/v<srs-version>.md`, `docs/open-issues.md`, `plan-update.json` |
| Architecture Validator | `.claude/agents/architecture-validator.md` | `architecture-validator` | Read entire repo (esp. `docs/architecture.md`, `docs/decisions/`, `docs/instrumentation-contract.md`, `docs/SRS.md`, `docs/user-stories/`, `docs/frs/`, `docs/external-integrations/`) + skills `solution-defaults`, `format-boundary-contracts`, `data-lifecycle-contracts`; Write `docs/architecture.md` (Status + `Validated-by` + Changelog only), `docs/architecture-validation-reports/v<arch-version>.md`, `docs/open-issues.md`, `plan-update.json` |
| Agent Generator | `.claude/agents/_meta/agent-generator.md` (static, hand-maintained) | `agent-generator` | Read SRS, architecture, templates; Write `.claude/agents/*.md` (excluding `_templates/`) |

**Runtime dispatch contract.** Every kit-defined role has a corresponding Claude Code sub-agent identified by the `Dispatch subagent_type` column. The Orchestrator MUST use this value when calling Claude Code's `Task` tool — never `subagent_type: general-purpose`. See CLAUDE.md §10 hard rule "Role-specialized dispatch required" and orchestrator-operating-rules.md §9 Step 4.5 (Sub-agent availability check) for the enforcement contract.

**Authority:** `CLAUDE.md` is the workflow contract. Agent files inherit and enforce it. If a contradiction
arises, CLAUDE.md (and the rule files it indexes) wins for workflow rules; the agent file wins for tool permissions
(because that's where the permission is technically enforced).

**Do not duplicate role logic.** Agent files reference CLAUDE.md sections (or the corresponding rule file under
`.claude/rules/`) rather than restating them. Exit criteria and tool allow-lists are the exception — they live in the
agent file.

**API contract boundary:** FE Dev has **read-only** access to `docs/api-contracts/`. Only BE Dev writes contracts. This
is enforced in the agent file.

**Figma boundary:** UI/UX Designer is the only agent permitted to write to Figma via MCP. FE Dev and QA-Author have
read-only Figma access for design contract production and visual spec generation respectively.

### Non-SDLC Agents

The agents above are SDLC roles — driven by the SRS, producing shipping artifacts. The kit also hosts non-SDLC agents per `.claude/rules/task-type-routing.md` §11: read-only investigative roles that produce documents, not code. They live under `.claude/agents/_non-sdlc/` and are hand-maintained — the Agent Generator does not regenerate them, since they don't depend on SRS content.

| Role | Agent file | Path | Dispatch `subagent_type` | Tool scope |
|---|---|---|---|---|
| Researcher | `.claude/agents/_non-sdlc/researcher.md` | B1 — research / RFC / exploration | `researcher` | Read repo + web; Write `docs/research-reports/<topic-slug>.md`, `docs/open-issues.md` |
| Debugger | `.claude/agents/_non-sdlc/debugger.md` | B2 — bug triage / root-cause analysis | `debugger` | Read repo + web + deployed env (read-only HTTP); Write `docs/debug-reports/<incident-slug>.md`, `docs/open-issues.md` |
| Code Reviewer | `.claude/agents/_non-sdlc/code-reviewer.md` | B3 — cold code review (lens-driven) | `code-reviewer` | Read repo + web; Write `docs/code-reviews/<scope-slug>.md`, `docs/open-issues.md` |
| OQ Resolver | `.claude/agents/_non-sdlc/oq-resolver.md` | B4 — SRS open-question resolution (multi-choice options) | `oq-resolver` | Read repo + web; Write `docs/oq-resolutions/<OQ-id>.md`, `docs/open-issues.md` |
| Codebase Archaeologist | `.claude/agents/_non-sdlc/codebase-archaeologist.md` | B5 — brownfield onboarding Stage 1 (read-only sweep of existing codebase) | `codebase-archaeologist` | Read repo + git history + deployed env (read-only HTTP) + external docs via MCP; Write `docs/archaeology-reports/<topic-slug>.md`, `docs/open-issues.md` |

**Non-SDLC agents do not emit `plan-update.json`.** That schema is for master-plan transitions; non-SDLC agents don't change the master plan. Completion is signaled by the report file's existence plus a structured return value to the Orchestrator.

**Re-entry to SDLC.** When a non-SDLC report identifies feature work, the report's `Re-entry to SDLC: yes | no | maybe` field tells the Orchestrator whether to dispatch BA with the report as input. Path B1 (researcher) reports re-enter via BA when feature work is implicated. Paths B2 (debugger) and B3 (code-reviewer) have a narrow trivial-fix exemption — both can propose master-plan tasks directly when the four exemption conditions hold. Path B4 (oq-resolver) **always** re-enters via BA — every user-chosen option must be recorded into the SRS by BA, never by the resolver itself. See `.claude/rules/task-type-routing.md` §11.
