# Artifact Ownership

This file holds the supporting-artifacts table that was previously embedded in CLAUDE.md §1. Section number is preserved for cross-reference compatibility — when agents cite "CLAUDE.md §1," this file is the operational expansion.

For workflow contract entry-point, see `CLAUDE.md`. The 3-row authoritative-artifacts table stays in CLAUDE.md §1; this file holds the broader supporting-artifacts inventory + cross-references.

The canonical PATH-TO-ROLE map for runtime hook enforcement lives at `.claude/hooks/lib/role-ownership.cjs`. This file is the human-readable view; the hook lib is the machine-readable source of truth for path ownership.

---

## 1a. Supporting Artifacts

Per-role ownership of every artifact path the kit writes. Each row lists: path pattern + owning role(s) + writing mode / phase.

- `docs/architecture.md` — Solution Architect (per `_artifacts/architecture-template.md` — C1 Context + C2 Containers + C3 Components per the C4 model; C4 Code is Dev-owned and optional)
- `docs/architecture-validation-reports/v<arch-version>.md` — Architecture Validator (independent design gate; runs after SA produces `docs/architecture.md` (`Status: Draft`) and before TL; sole authority over the architecture `Draft → Validated` transition; seven-check coverage report). The validator also writes the `Status` / `Validated-by` / `## Changelog` header fields of `docs/architecture.md` (header only — body content stays SA-owned). See `.claude/agents/_templates/architecture-validator.md`.
- `docs/requirements/<file>` — Upstream input + ongoing requirements audit log. Three branches: (1) **top-level files** — PM-authored at greenfield ingestion (read by BA Mode F); (2) **`conversational-additions/<ISO-date>-<slug>.md`** — BA Mode D Step D0 verbatim captures of mid-project operator input; (3) **`design-extracted/<figma-file-id>-<ISO-date>.md`** — UI/UX Designer `extract` mode output at Design-Flow A, runs PRE-BA so BA synthesis is informed by design content (screens, exact copy, form fields, flows). All three branches are read by BA at Phase 1.X synthesis AND by srs-source-validator at sign-off; together they form the complete source corpus. Files preserved in place post-ingestion. See `.claude/skills/ba-mode-requirements-folder/SKILL.md` + `.claude/skills/ba-mode-augment/SKILL.md` + `.claude/skills/figma-requirements-extraction/SKILL.md`.
- `docs/srs-validation-reports/v<srs-version>.md` — SRS Source Validator (first sign-off gate; independent fresh reviewer; sole authority over `Status: Source-Validated` transition; coverage matrix vs `docs/requirements/`). Triggered when Status reaches `Ready-for-Sign-off`. See `.claude/agents/_templates/srs-source-validator.md`.
- `docs/srs-feasibility-reports/v<srs-version>.md` — SRS Feasibility Validator (second sign-off gate; independent fresh reviewer; sole authority over `Status: Signed-off` transition; cross-FR / NRS / external-integration / API-contract-format / Security / dependency feasibility). Triggered when Status reaches `Source-Validated`. See `.claude/agents/_templates/srs-feasibility-validator.md`.
- `docs/user-stories/<US-ID>.md` — BA (per-US detail companion to SRS §3.2 index; ingestion-checked against `srs-ingestion-checklist.md` docs/user-stories/ Pairing Rule)
- `docs/frs/<FR-ID>.md` — BA (per-FR detail companion to SRS §3.3 index; ingestion-checked against `srs-ingestion-checklist.md` docs/frs/ Pairing Rule)
- `docs/external-integrations/<system-slug>.md` — BA + SA (per-external-system interface spec; companion to SRS §3.5 index; BA files placeholders during Phase 1.X step 9 identification, SA fills per-operation detail during `external-integration-adequacy` dispatch and is the only agent permitted to flip `Adequacy: adequate`; ingestion-checked against `srs-ingestion-checklist.md` docs/external-integrations/ Pairing Rule)
- `docs/decisions/` — ADRs from Solution Architect
- `docs/api-contracts/` — Backend Developer (FE consumes)
- `docs/instrumentation-contract.md` — Solution Architect
- `docs/test-cases/by-us/<US-NNN>/` — QA Author (by-us mode, authored post-SRS-sign-off parallel with SA)
- `docs/test-cases/by-task/<task-id>/` — QA Author (by-task mode, authored per task after TL + design-confirmed for UI)
- `docs/uiux/figma-mappings/v<srs-version>.md` — UI/UX Designer (`map` mode artifact; PRE-sign-off Design-Flow A only; one mapping per SRS version; `Mapping-Status:` field gates SRS sign-off via BA Phase 2 step 3.5)
- `.claude/skills/design-system-author/references/presets/<slug>/` — kit-level Foundation presets (tokens, type scale, components, layout grid). Selected per project via SRS header `Design-Guideline:` (BA Phase 1.X step 10b). Consumed by UI/UX Designer (Foundation page), FE Dev (`docs/uiux/refs/<task-id>.md`), QA-Author (`docs/uiux/visual-specs/<task-id>.md`). Adding a project-specific preset: copy `_template/` to a new slug, fill files, append to skills registry.
- `docs/uiux/handoffs/<task-id>.md` — UI/UX Designer
- `docs/uiux/completeness-reports/<task-id>.md` — BA (Phase 3 — design completeness against handoff)
- `docs/uiux/post-implementation-reports/<task-id>.md` — BA (Phase 5 — implementation completeness against design-confirmed handoff; UI tasks only; gates `ready-for-deploy` transition for UI-bearing tasks per `.claude/rules/parallel-execution.md` §4 Step 6)
- `docs/uiux/refs/<task-id>.md` and `docs/uiux/refs/<task-id>/` — Frontend Developer
- `docs/uiux/visual-specs/<task-id>.md` — QA Author
- `docs/qa-reports/<task-id>.md` — QA Exec
- `docs/deploy-reports/<task-id>.md` — DevOps
- `docs/srs-diffs/v<old>-to-v<new>.md` — BA (iteration-mode artifact: field-level diff between two SRS versions; produced during Phase 1.Z when an iteration trigger fires)
- `docs/iteration-plan/v<version>.md` — BA (iteration-mode artifact: surgical re-dispatch matrix consumed by Orchestrator §9 Step 3.5 after BA Phase 4 produces it)

## Cross-references

- Hooks enforce ownership at runtime: `.claude/hooks/lib/role-ownership.cjs` (canonical machine-readable map) + `.claude/hooks/orchestrator-write-guard.cjs` (consumer).
- Sub-agent registry for dispatch contract: `.claude/rules/sub-agent-registry.md` §3a.
- Worktree isolation discipline (logical vs physical): `.claude/rules/worktree-isolation.md` §5.
- Master plan hierarchy: `.claude/rules/master-plan-discipline.md` §8.

## Adding a new artifact path

Two-step:

1. Add an ownership row above (this file) and a corresponding pattern row in `.claude/hooks/lib/role-ownership.cjs`. Both must agree.
2. Reference the new path in the owning agent's template (where it appears in Outputs / Tool Scope) and in `sub-agent-registry.md §3a` if it changes the agent's surface.
