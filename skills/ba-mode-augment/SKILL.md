---
name: ba-mode-augment
description: BA Phase 1.D ingestion mode (augment-existing) — the steady-state mode for most post-initial-ingest dispatches. Load when Shape Detection selects Mode D. Captures operator-supplied new requirements VERBATIM to docs/requirements/conversational-additions/ BEFORE any synthesis, per CLAUDE.md §10.
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode D — augment-existing

## When to use

You are the BA and Shape Detection selected **Mode D** (the steady-state mode): `docs/SRS.md` and its per-US/per-FR file trees are fully populated, and the dispatch carries an incremental change. Capture any operator-supplied new requirement VERBATIM first, then hand to the pipeline.

#### Phase 1.D — Mode `augment-existing` setup

This is the steady-state mode — most BA dispatches after the initial ingest are Mode D.

##### Step D0 — Capture user-input requirements VERBATIM (mandatory when dispatch carries new requirements)

When the Orchestrator's dispatch prompt contains operator-supplied new requirements (an SRS revision request, a new feature spec, a constraint change, a scope addition, a clarification), BA's **FIRST action** is to capture the input VERBATIM at `docs/requirements/conversational-additions/<ISO-date>-<slug>.md` BEFORE any synthesis into US / FR / external-integration content. This keeps `docs/requirements/` the complete audit log of every requirement that ever entered the project, so the downstream `srs-validator` can do its coverage check against a complete source corpus.

**File location:** `docs/requirements/conversational-additions/<ISO-date>-<slug>.md`
- `<ISO-date>` = today's UTC date in `YYYY-MM-DD` format
- `<slug>` = short kebab-case noun describing the addition (e.g., `add-batch-rbac-permissions`, `clarify-promo-state-machine`, `change-max-batch-size`)

**File content shape:**

```markdown
# <Operator-supplied title or BA-derived if not provided>

- Captured-by: BA (Mode D, dispatch <task-id-or-N/A>)
- Captured-at: <ISO-8601>
- Operator: <name from CLAUDE.md user context, or "operator" if unknown>
- Dispatch-context: <one-line summary of what the Orchestrator told BA — e.g., "user added batch RBAC constraint to FR-022 batch UI flow">
- Verbatim input follows. NO BA editorial intervention.

---

<the operator's input, copied verbatim — paragraph breaks preserved, no rewording, no summarization, no commentary>
```

**Hard rules for the capture step:**

- **Verbatim only.** No paraphrasing. No correction of typos. No clarification of ambiguity (clarifications happen as OQs in Phase 1.X). If the operator wrote "the maxbatch size shoudl be 50 lol" the file says exactly that. The audit-log value depends on faithfulness.
- **One file per dispatch carrying new requirements.** If a single dispatch carries multiple requirement additions (e.g., the operator's message added FR-022 batch RBAC + clarified US-007 + asked to change the max-count), create ONE file with one section per addition — not multiple files. The dispatch boundary is the file boundary.
- **Empty input → no file.** If the dispatch carries only the operator's "please run BA Mode D" with no new requirements (e.g., the dispatch is a re-run after SA's `external-integration-adequacy` returned, or a Phase 4 iteration re-dispatch), do NOT create a conversational-additions file. The audit log captures requirement *additions*, not coordination round-trips.
- **The file is read-only after creation.** Subsequent BA dispatches do not edit prior conversational-additions files. If the operator later contradicts or supersedes a prior addition, the new dispatch creates a NEW conversational-additions file (e.g., `2026-06-04-supersede-max-batch-size.md`); the prior file remains as the audit-trail record of what was originally said.

After the capture file is committed, proceed to Phase 1.X common procedure. The synthesized US / FR / external-integration content lands in the SRS-side artifacts as usual; the conversational-additions file becomes one of the source-corpus inputs that srs-validator will cross-check against in Phase 2.

Proceed directly to Phase 1.X common procedure.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
