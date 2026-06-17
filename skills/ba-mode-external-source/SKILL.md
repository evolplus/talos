---
name: ba-mode-external-source
description: "BA Phase 1.C ingestion mode (ingest-from-external-source). Load when Shape Detection selects Mode C: SRS content lives in an external system (Confluence/Notion/Jira/SharePoint) reached via MCP. Materializes external content into the kit's three-file shape, records provenance, and handles the re-ingestion path."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode C — ingest-from-external-source

## When to use

You are the BA and Shape Detection selected **Mode C**: the SRS content lives in an external system reached via an MCP connector. Materialize it into the kit's three-file shape, record provenance in the SRS header, then hand to the pipeline. Includes the re-ingestion path for subsequent runs.

#### Phase 1.C — Mode `ingest-from-external-source` setup

The SRS content lives in an external system (Confluence, Notion, Jira, SharePoint, …) and is reached via an MCP connector. Your job is to materialize the external content into the kit's three-file shape, record provenance in the SRS header, and then proceed.

C1. **Identify the Source URL.** The dispatch input names the source (e.g., `confluence://wiki.example.com/spaces/PROD/pages/12345`). If absent, return `NEEDS_CONTEXT` to the Orchestrator requesting the URL.

C2. **Fetch via MCP.** Use the appropriate MCP tool (Confluence / Notion / Jira / SharePoint connectors are documented in `.claude/mcp-readers/` if present; if no reader is documented for the source type, file an open-issue requesting reader documentation, then return `NEEDS_CONTEXT`). Capture the full content + a content hash (e.g., SHA-256 of the rendered text).

C3. **Materialize into kit format.** Depending on the upstream shape: if the external content is one bulk page → drop it into `docs/SRS.md` and run Mode A steps (A1–A4) on the materialized content. If the external space has a page tree (one SRS-overview page + child pages per US / per FR) → write to `docs/SRS.md` + `docs/user-stories/*.md` + `docs/frs/*.md` directly, then continue.

C4. **Record provenance** in the SRS header:
   - `Source: <url>` — the external URL pulled from.
   - `Source-Last-Pulled: <ISO-8601>` — when this materialization happened.
   - `Source-Hash: <hash>` — content hash captured in C2.

C5. **Log the ingest** in SRS §10 Changelog: `<ISO-8601> | BA Mode C ingestion from <url>; Source-Hash: <hash>`.

C6. **Gap detection (no invention).** After materialization, walk the resulting SRS against the kit's required-section list. External sources are often skeletons (a Confluence page with `## Security` heading and no body content under it). Missing required field → `TODO: <field expected>` marker + paired OQ in SRS §8. Never fill from "common sense" or default assumptions about what the external source "would have said." The external source is the only authority; if it didn't say something, neither does the synthesized SRS.

C7. **Conflict detection (batched).** When the external source has internal contradictions across pages / sections / linked sub-pages, accumulate the conflicts. Halt with one batched `NEEDS_CONTEXT` if any exist. Single round-trip. This is especially common with Confluence space hierarchies where a parent page describes a feature one way and a child page describes the same feature differently.

C8. **Inline-don't-link (self-containment).** Walk the materialized SRS body + per-US/per-FR files for body-content references back to the external source (`see <Confluence URL>`, `details at <Notion page>`, `refer to <Jira epic>`). The source URL appears ONLY in the SRS `Source:` header field and in §10 Changelog — never in body content. Replace substantive back-references with inlined content; raise OQs for gaps. Self-containment per CLAUDE.md §10.

C9. Proceed to Phase 1.X common procedure.

**Re-ingestion path (Mode C subsequent runs).** If `docs/SRS.md` already exists with `Source: <url>` and you've been dispatched to re-ingest:

- Fetch current external content + hash (C2).
- Compare with `Source-Hash`. If unchanged, nothing to do; report and stop.
- If changed: diff old vs new. Materialize the diff (write/update affected `docs/user-stories/*.md` + `docs/frs/*.md`). Revert SRS `Status` to `Draft`. Update `Source-Last-Pulled` and `Source-Hash`. Log the re-ingest in §10. Proceed to Phase 1.X for re-sign-off.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
