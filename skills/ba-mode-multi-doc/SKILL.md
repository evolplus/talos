---
name: ba-mode-multi-doc
description: "BA Phase 1.B ingestion mode (ingest-from-multi-doc). Load when Shape Detection selects Mode B: docs/SRS.md plus some/all per-US and per-FR files already exist but the index-to-file pairing has orphans. Validates each per-file artifact and flags gaps for the common pipeline."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode B — ingest-from-multi-doc

## When to use

You are the BA and Shape Detection selected **Mode B**: `docs/SRS.md` plus some/all of `docs/user-stories/*.md` + `docs/frs/*.md` already exist, but the pairing has orphans. Validate each per-file artifact and identify the gaps the common pipeline will close.

#### Phase 1.B — Mode `ingest-from-multi-doc` setup

The incoming repo already has `docs/SRS.md` + some/all of `docs/user-stories/*.md` + `docs/frs/*.md`. Your job is to validate each per-file artifact and identify the gaps the common procedure will close.

B1. **Per-file structural validation.** For each `docs/user-stories/<US-ID>.md`, verify it has Description, Pre-conditions, Main Flow, Business Rules, Post-conditions, Linked artifacts sections per [`user-story-template.md`](../../agents/_templates/_artifacts/user-story-template.md). For each `docs/frs/<FR-ID>.md`, verify Description, Preconditions, Main Flow, Business Rules, Input Schema, Output Schema, Error Handling, Sequence Diagram per [`frs-template.md`](../../agents/_templates/_artifacts/frs-template.md). Missing-section issues become OQs in Phase 1.X.

B2. **Index-vs-file pairing.** Phase 1.X Step 0a + 0b handle this. Note in advance which orphans you've detected so the common procedure produces OQs of the right granularity.

B3. **Set `Source: inline`** if not already set.

B4. **Gap detection (no invention).** Walk every per-file artifact (`docs/user-stories/<US-ID>.md`, `docs/frs/<FR-ID>.md`) against its template's required sub-sections. For every required sub-section that's missing or empty, leave a `TODO: <sub-section expected>` marker in the file AND raise a paired OQ in SRS §8 citing the file+sub-section. Same for the SRS body — apply Gap Handling per `srs-ingestion-checklist.md` § Gap Handling. Never auto-author missing content.

B5. **Conflict detection (batched).** Cross-reference per-file artifacts for contradictions (US-001's Business Rules vs FR-001's Error Handling; two USes claiming the same capability with different roles; etc.) AND against the SRS body. Accumulate all conflicts. Halt with one batched `NEEDS_CONTEXT` if any exist. Single round-trip.

B6. Proceed to Phase 1.X common procedure.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
