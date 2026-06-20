# Skill Registry

Role → skills the role typically consults during the SDLC pipeline. Agents look here first; native skill auto-discovery (via `description` matching) is the convenience layer.

A skill may belong to more than one role. The owner column is who keeps the skill current; if it goes stale, that's who to ping.

## By role

### Cross-cutting (all agents)

Skills consulted by any agent or human committing or operating in the repo, regardless of role.

| Skill | When | Status |
|---|---|---|
| [`sdlc-init`](./sdlc-init/SKILL.md) | Codex command shim for `/sdlc-init` — initialize or refresh `AGENTS.md` and optional Claude target files from the plugin | active |
| [`sdlc-loop`](./sdlc-loop/SKILL.md) | Codex command shim for `/sdlc-loop` / `start project` — run the governed orchestration loop until the next gate or completion | active |
| [`git-commit`](./git-commit/SKILL.md) | Any commit on a worktree or main branch — identity check, conventional message format, .gitignore baseline, compliance attribution | active |

### BA — Business Analyst

| Skill | When | Status |
|---|---|---|
| [`ba-mode-single-doc`](./ba-mode-single-doc/SKILL.md) | Ingestion **Mode A** setup (Phase 1.A) — bulk single-doc SRS with inline US/FR | active |
| [`ba-mode-multi-doc`](./ba-mode-multi-doc/SKILL.md) | Ingestion **Mode B** setup (Phase 1.B) — existing SRS + per-US/FR files with pairing orphans | active |
| [`ba-mode-external-source`](./ba-mode-external-source/SKILL.md) | Ingestion **Mode C** setup (Phase 1.C) — SRS content in Confluence/Notion/Jira/SharePoint via MCP; + re-ingestion path | active |
| [`ba-mode-augment`](./ba-mode-augment/SKILL.md) | Ingestion **Mode D** setup (Phase 1.D) — steady state; verbatim-captures new requirements before synthesis | active |
| [`ba-mode-reverse-engineer`](./ba-mode-reverse-engineer/SKILL.md) | Ingestion **Mode E** setup (Phase 1.E) — brownfield Stage 3; derive SRS from code + archaeology + extracted architecture | active |
| [`ba-mode-requirements-folder`](./ba-mode-requirements-folder/SKILL.md) | Ingestion **Mode F** setup (Phase 1.F) — greenfield; synthesize SRS from docs/requirements/ fragments | active |
| [`ba-ingestion-pipeline`](./ba-ingestion-pipeline/SKILL.md) | Every ingestion dispatch after the mode skill — Phase 1.X common + Phase 1.Z delta + Phase 2 sign-off gate | active |
| [`ba-design-completeness`](./ba-design-completeness/SKILL.md) | Phase 3 — design completeness verification against a UI/UX Designer handoff (post-sign-off, pre-FE) | active |
| [`ba-post-implementation`](./ba-post-implementation/SKILL.md) | Phase 5 — post-implementation completeness verification of a UI task (mode: post-implementation), including Design Element Manifest row coverage against FE diff/source | active |
| [`ba-iteration-planning`](./ba-iteration-planning/SKILL.md) | Phase 4 — iteration dispatch planning when a sign-off follows a non-empty SRS diff | active |
| [`user-story-author`](./user-story-author/SKILL.md) | Writing or reviewing SRS §3.2 User Stories — Pre-conditions, Main Flow, Business Rules (Invariants), Post-conditions — during Phase 1 ingestion or Phase 2 sign-off | active |
| [`acceptance-criteria-author`](./acceptance-criteria-author/SKILL.md) | DEPRECATED — renamed to `user-story-author`; kept as stub so legacy references resolve | deprecated |
| [`security-compliance-checklist`](./security-compliance-checklist/SKILL.md) | Adding or updating SRS `## Security & Compliance` section | active |

### SA — Solution Architect

| Skill | When | Status |
|---|---|---|
| [`sa-architecture-design`](./sa-architecture-design/SKILL.md) | SA `design` mode — produce or revise `docs/architecture.md`, ADRs, instrumentation contract, C4 C1-C3, data/format contracts, and dependency decisions from a signed-off SRS | active |
| [`sa-brownfield-extract`](./sa-brownfield-extract/SKILL.md) | SA `extract` mode — brownfield Stage 2 provisional as-built architecture from archaeology reports and code, with extracted/confidence tags and confirmation issues | active |
| [`external-integration-adequacy`](./external-integration-adequacy/SKILL.md) | SA `external-integration-adequacy` mode — fill external integration placeholders and set `Adequacy:` before SRS sign-off | active |
| [`solution-defaults`](./solution-defaults/SKILL.md) | Pre-approved org defaults for common dependency categories (DB, cache, queue, etc.). Check BEFORE running third-party-dependency-evaluation. | active |
| [`adr-author`](./adr-author/SKILL.md) | Recording any non-trivial architectural choice in `docs/decisions/` | active |
| [`third-party-dependency-evaluation`](./third-party-dependency-evaluation/SKILL.md) | Proposing any new third-party dependency (paid service, OSS library, managed cloud, external API, first-time-use vendor tool) for human approval | active |
| [`c4-author`](./c4-author/SKILL.md) | Authoring C1/C2/C3 C4 diagrams in `docs/architecture.md` (design mode) or extracting to C3 (brownfield extract mode). C4-PlantUML notation; worked example + pitfalls. | active |
| [`data-lifecycle-contracts`](./data-lifecycle-contracts/SKILL.md) | Identifying gate fields and authoring `docs/architecture.md` §6 Cross-Component Data Contracts table — write-ownership for columns read by one component to gate behavior. Prevents the class of bug where ORM-convenience patterns silently break downstream skip / state-machine / eligibility gates. | active |
| [`format-boundary-contracts`](./format-boundary-contracts/SKILL.md) | Identifying format boundaries (data crossing systems with different format specs for the same conceptual type — ISO-8601 vs MySQL DATETIME, integer-cents vs decimal-string, etc.) and authoring `docs/architecture.md` §6 format-boundary rows. Prevents the class of bug where each layer (DAL, ORM, tests, retry logic) assumes someone else handled format conversion. Sibling to `data-lifecycle-contracts`; both live in §6. | active |

### TL — Tech Lead

| Skill | When | Status |
|---|---|---|
| [`task-sizing`](./task-sizing/SKILL.md) | Breaking the architecture into a phased master-plan proposal | active |

### QA-Author

| Skill | When | Status |
|---|---|---|
| [`qa-author-by-us`](./qa-author-by-us/SKILL.md) | QA-Author `by-us` mode — US-scoped functional TCs and executable specs, with Pass 1 / Pass 2 selector timing | active |
| [`qa-author-by-task`](./qa-author-by-task/SKILL.md) | QA-Author `by-task` mode — task-scoped structural/API/e2e/rare functional cases after TL and design confirmation where needed | active |
| [`visual-spec-author`](./visual-spec-author/SKILL.md) | QA-Author visual-spec generation for UI tasks — derives `docs/uiux/visual-specs/<task-id>.md` from UI/UX handoff, Design Element Manifest, Figma nodes, and instrumentation contract | active |
| [`test-case-author`](./test-case-author/SKILL.md) | Writing markdown test cases for an assigned task | active |
| [`ui-test-execution`](./ui-test-execution/SKILL.md) | Authoring executable specs alongside markdown TCs — cross-runner principles (TC↔spec mapping, selectors, fixtures, determinism, visual diff) | active |
| [`playwright-author`](./playwright-author/SKILL.md) | Writing Playwright specs for web UI surfaces (the org default per `solution-defaults`) | active |

### BE Dev — Backend Developer

| Skill | When | Status |
|---|---|---|
| [`api-contract-author`](./api-contract-author/SKILL.md) | Publishing or updating an API contract under `docs/api-contracts/` | active |
| [`be-framework-coding-standard`](./be-framework-coding-standard/SKILL.md) | Implementing or reviewing backend tasks after SRS `Backend-Track:` and `Backend-Framework:` are declared - selects the matching backend-web/backend-service and TypeScript/Python/Java/.NET/Go coding standard without migrating the stack | active |

### QA-Exec

| Skill | When | Status |
|---|---|---|
| [`qa-execution-runner`](./qa-execution-runner/SKILL.md) | QA-Exec dispatches — collect task test cases, enforce pre-run gates, execute the runner, produce QA report/artifacts, and route failures | active |
| [`ui-test-execution`](./ui-test-execution/SKILL.md) | Invoking the test runner against the deployed build — Run Contract per platform, artifact layout under `docs/qa-reports/<task-id>/` | active |

### UI/UX Designer

| Skill | When | Status |
|---|---|---|
| [`ui-ux-page-scoping`](./ui-ux-page-scoping/SKILL.md) | Mandatory Step 0 for every UI/UX Designer mode — resolve one Figma page root before reading or writing Figma | active |
| [`figma-design-handoff`](./figma-design-handoff/SKILL.md) | UI/UX Designer `create` / `import` / `revise` / `incorporate` modes — Figma-backed handoff with Design Element Manifest, refs, SRS Design References updates, and reconciliation | active |
| [`figma-canvas-layout`](./figma-canvas-layout/SKILL.md) | Authoring or revising Figma content (create / revise / incorporate modes) AND as a mandatory pre-handoff lint in every mode (including import). Enforces deterministic placement + 3-segment frame naming + overlap lint via Figma MCP. Blocks `create` / `revise` / `incorporate` handoff when top-level screen frames overlap or cannot be reviewed comfortably. | active |
| [`figma-srs-mapping`](./figma-srs-mapping/SKILL.md) | UI/UX Designer `map` mode — pre-sign-off scan of provided Figma URL; maps frames to SRS surfaces; qualifies design at sign-off (Design-Flow A) | active |
| [`design-system-author`](./design-system-author/SKILL.md) | Every UI/UX Designer dispatch — build a Foundation Figma page (tokens: color / typography / spacing / radius / elevation / motion; components: Button / Input / Card / Modal / Nav / etc. with all variants and states) BEFORE drawing screens; consume only from Foundation in screens; supports preset slugs, `from-figma`, and `none`; pre-handoff token-compliance lint flags hardcoded values and non-component buttons. Prevents inconsistent spacing / text sizes / button styles / element alignment drift across screens. | active |
| [`figma-requirements-extraction`](./figma-requirements-extraction/SKILL.md) | UI/UX Designer `extract` mode (Design-Flow A, pre-BA). Reads a Figma file via MCP (read-only) and produces `docs/requirements/design-extracted/<figma-file-id>-<ISO-date>.md` enumerating screens / components / exact copy / form fields / interaction flows / design guideline evidence / accessibility hints. CONFIRMED-vs-INFERRED discipline — BA at Phase 1.X synthesizes US/FR only from confirmed elements + inferred items the textual PRD anchors and may set `Design-Guideline: from-figma` from Section 6. Output becomes one of three branches of `docs/requirements/` source corpus consumed by BA AND srs-source-validator. | active |

### Design Guidelines (presets under `design-system-author`)

Predefined Foundation starting points. Selected by SRS header `Design-Guideline:` (BA Phase 1.X step 10b). Consumed by UI/UX Designer at Step 0 of every dispatch. Adding a new preset: copy `references/presets/_template/` and append a row below.

| Preset slug | Location | When to use | Status |
|---|---|---|---|
| `default` | [`design-system-author/references/presets/default/`](./design-system-author/references/presets/default/) | Kit catch-all. Cool-blue professional palette (`#1c5d99` primary, `#639fab` secondary, `#bbcde5` disabled, `#222222` text, `#FFFFFF` surface). Inter typeface, locale-neutral. B2B / SaaS / admin / dashboards without strong brand voice. | active |
| `from-figma` | `docs/requirements/design-extracted/<figma-file-id>-<date>.md` Section 6 | Design-Flow A source. Use when the provided Figma file has enough palette / typography / spacing / radius / component-pattern evidence to become the Foundation source, even if no formal design-system page exists. | n/a |
| `none` | (none) | Project authors Foundation from SKILL.md defaults. Use when no shipped preset matches and the project has bandwidth to author tokens from scratch. | n/a |

### DevOps

| Skill | When | Status |
|---|---|---|
| [`local-deployment`](./local-deployment/SKILL.md) | Every DevOps dispatch against a `ready-for-deploy` task — Docker-based environment composition, port probing (never hardcode 3000), `docker-compose.override.yml` in worktree (don't edit project's compose), health-check polling, deploy report populated with both `## Test Environment` (QA-Exec consumes) and `## Human Trial URLs` (operator opens in browser). | active |

### FE Dev

| Skill | When | Status |
|---|---|---|
| [`fe-framework-coding-standard`](./fe-framework-coding-standard/SKILL.md) | Implementing or reviewing frontend tasks after SRS `Frontend-Framework:` is declared - selects the matching React Native, ReactJS, Flutter, Vue.js, Angular, or Next.js coding standard and requires every Design Element Manifest field/item/copy/action to be implemented | active |

## By SDLC phase

| Phase | Skills |
|---|---|
| Cross-cutting (all phases) | sdlc-init, sdlc-loop, git-commit |
| Planning (BA / SA / TL) | user-story-author, security-compliance-checklist, solution-defaults, sa-architecture-design, sa-brownfield-extract, external-integration-adequacy, adr-author, third-party-dependency-evaluation, task-sizing, c4-author, data-lifecycle-contracts, format-boundary-contracts |
| Design (UI/UX Designer) | ui-ux-page-scoping, figma-requirements-extraction, figma-srs-mapping, figma-design-handoff, figma-canvas-layout, design-system-author |
| Implementation (BE / FE) | api-contract-author, be-framework-coding-standard, fe-framework-coding-standard |
| QA (Author / Exec) | qa-author-by-us, qa-author-by-task, visual-spec-author, qa-execution-runner, test-case-author, ui-test-execution, playwright-author |
| Deploy (DevOps) | local-deployment |
| Post-release | — |

## Adding a new skill to the registry

After creating `.claude/skills/<your-skill>/SKILL.md`:

1. Add a row to the relevant role table above.
2. Add it to the SDLC-phase table.
3. PR reviewer confirms `name`, `description`, `agents`, `sdlc_phase`, `owner`, `status` are filled in (`.claude/skills/README.md` schema).
