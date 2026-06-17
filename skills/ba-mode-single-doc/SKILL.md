---
name: ba-mode-single-doc
description: "BA Phase 1.A ingestion mode (ingest-from-single-doc). Load when Shape Detection selects Mode A: docs/SRS.md is one bulk document with US/FR content inline and the per-US/per-FR file trees are empty. Restructures the bulk doc into the kit's three-file shape before the common pipeline runs."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode A — ingest-from-single-doc

## When to use

You are the BA and Shape Detection (Phase 1.0, in the BA agent router) selected **Mode A**: `docs/SRS.md` is one bulk document with User Story and FR content inline, and `docs/user-stories/` + `docs/frs/` are empty. Run this setup, then hand to the ingestion pipeline.

#### Phase 1.A — Mode `ingest-from-single-doc` setup

The incoming SRS is one bulk document with US and FR content inline (any source format — markdown, Word, plain text dropped into `docs/SRS.md` from an upstream paste). Your job is to restructure it into the kit's three-file shape **before** the common procedure runs.

A1. **Identify inline US blocks.** Walk SRS §3.2 looking for per-US sub-sections (`#### [US-NNN]` headers or equivalent). For each:
   - Extract the US content (Description / Pre-conditions / Main Flow / Business Rules / Post-conditions).
   - Write a new file at `docs/user-stories/US-NNN.md` per [`user-story-template.md`](../../agents/_templates/_artifacts/user-story-template.md).
   - Replace the SRS §3.2 sub-section with an index-table row (ID / Title / one-line Description / Role / Priority / Linked FRs / Status).

A2. **Identify inline FR blocks.** Walk SRS §3.3 (or §3.4 if FRs were mixed into technical constraints in the upstream doc). For each FR with inline detail:
   - Extract Description / Preconditions / Main Flow / Business Rules / schemas / Error Handling / sequence diagram.
   - Write a new file at `docs/frs/FR-NNN.md` per [`frs-template.md`](../../agents/_templates/_artifacts/frs-template.md).
   - Replace the SRS §3.3 sub-section with an index-table row.

A3. **Set `Source: inline`** in the SRS header (this is the default for Mode A — the materialized files ARE the source of truth going forward; the upstream bulk doc is treated as input, not as an external system to sync against).

A4. **Log the split** in SRS §10 Changelog: `<ISO-8601> | BA Mode A ingestion — split N inline User Stories into docs/user-stories/, M inline FRs into docs/frs/`.

A5. **Gap detection (no invention).** After the split, walk the resulting SRS against the kit's required-section list (per `srs-ingestion-checklist.md` § Gap Handling). For every kit-required field that the bulk doc didn't supply (US Description's "So that", Business Rules, Post-conditions, §4.1 sub-categories, role rows, DoD items, etc.), leave a `TODO: <field expected>` marker AND raise a paired OQ in SRS §8. Never auto-author. The bulk doc is the only source; if it didn't say something, neither does the synthesized SRS.

A6. **Conflict detection (batched).** Cross-reference sections of the bulk doc for internal contradictions (e.g., §3.4 says error code AUTH_001; §4.1 says ACCESS_DENIED for the same case; US-001 Business Rule contradicts FR-001 Error Handling row). Accumulate all conflicts. If at least one exists, halt with one batched `NEEDS_CONTEXT` listing every conflict — never per-conflict round-trips. On re-dispatch with user resolutions, apply each decision and continue.

A7. **Inline-don't-link (self-containment).** Before exiting setup, walk the produced SRS body + per-US files + per-FR files for any `see docs/SRS.md`-style references back to the now-superseded bulk doc, OR pointers to externally-named upstream artifacts. Replace each substantive back-reference with inlined content from the source. If the source didn't carry the needed content, leave a `TODO: <field expected>` marker and raise an OQ. The kit artifact must be self-contained per CLAUDE.md §10 self-containment invariant.

A8. Proceed to Phase 1.X common procedure.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
