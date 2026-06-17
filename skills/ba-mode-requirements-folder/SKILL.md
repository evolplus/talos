---
name: ba-mode-requirements-folder
description: "BA Phase 1.F ingestion mode (ingest-from-requirements-folder) — greenfield with fragmented upstream. Load when Shape Detection selects Mode F: no SRS yet, but docs/requirements/ holds requirement fragments (md/txt/html, or docx/pdf when those skills are active). Synthesizes a kit-shape SRS from the fragments with full Synthesized-From provenance."
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Mode F — ingest-from-requirements-folder

## When to use

You are the BA and Shape Detection selected **Mode F**: greenfield project, no SRS, but `docs/requirements/` holds requirement fragments. Synthesize a kit-shape SRS from the fragments (no invention; full `Synthesized-From:` provenance), then hand to the pipeline.

#### Phase 1.F — Mode `ingest-from-requirements-folder` setup (greenfield, fragmented upstream)

Greenfield project. The PM has dropped requirements fragments into `docs/requirements/` rather than authoring a single SRS doc. Files may be markdown, plain text, exported HTML, or — when the project's skills allow — `.docx` / `.pdf`. Your job is to synthesize a kit-shape SRS from these fragments. Distinct from Mode A (which expects a single bulk doc at `docs/SRS.md`) and from Mode E (which extracts from code).

F1. **Enumerate `docs/requirements/`.** List every file. Note file extension. For non-text formats (.docx, .pdf):
   - If the corresponding skill is active on the project (`.claude/skills/docx/`, `.claude/skills/pdf/`), use it to extract content.
   - If the skill is NOT active, do NOT half-attempt. Return `NEEDS_CONTEXT` to the Orchestrator: "Found `<file>.docx` in `docs/requirements/`; project does not have the `docx` skill active. Convert to `.md` first OR activate the `docx` skill; halt until resolved."

F2. **Classify each file's likely role** by content sampling (don't trust filenames alone — PMs name things inconsistently). Categories:
   - Executive summary / vision (typical signals: "we want to build", "the goal is", high-level paragraphs)
   - User stories (typical signals: "As a / I want / So that", "user can", numbered capabilities)
   - Functional requirements (typical signals: endpoint definitions, schemas, error codes, data flows)
   - Non-functional / NRS (typical signals: latency numbers, throughput, uptime targets)
   - Security / compliance (typical signals: PII, auth, regulatory references)
   - Roles / permissions (typical signals: role enumeration, who-can-do-what tables)
   - Design references (typical signals: Figma URLs, screen names, mockup descriptions)
   - Glossary / domain language (typical signals: term definitions, ubiquitous-language tables)
   - **Other** (anything that doesn't fit; surface in OQ for the team to clarify intent)

   File a brief classification table at the top of SRS §10 Changelog so the audit trail records how BA interpreted the fragments.

F3. **Synthesize the kit-shape SRS.** For each kit-required section (§1–§10):
   - Find every fragment whose classification maps to that section.
   - Combine their content into the kit's expected shape.
   - Cite provenance via a `Synthesized-From:` annotation at the section level. Example: `Synthesized-From: docs/requirements/vision.md + docs/requirements/exec-summary-draft.docx` (multi-source) or `Synthesized-From: docs/requirements/user-stories.md` (single-source).
   - Preserve original phrasing as footnotes when meaningful intent might be lost in normalization (e.g., when a fragment says "use case" but kit needs "user story" — normalize the heading, footnote the original term).

F4. **Construct per-US and per-FR files** where fragments carry that detail.
   - Each `docs/user-stories/US-NNN.md` gets a `Synthesized-From:` line.
   - Each `docs/frs/FR-NNN.md` gets the same.
   - Description's "So that" must come from a fragment — never fabricated. If no fragment provides it, mark `TODO: <PM-supplied value statement>` and file an OQ (same pattern as Mode E for missing value statements).

F5. **Conflict detection.** When two or more fragments contradict each other (different error codes for the same operation, different rate limits, different role assignments, etc.), accumulate the conflicts. Do NOT halt on the first conflict — that would force noisy round-trips for projects with many small fragments.

   After all fragments are processed, halt with ONE `NEEDS_CONTEXT` listing every conflict in a single payload:

   ```
   Status: NEEDS_CONTEXT
   Reason: <N> conflicts detected across requirements fragments. Team must resolve each before BA can finalize the synthesized SRS.
   Question: How should each conflict resolve?
   Conflicts:
     [c1] FR-008 error code: docs/requirements/api-spec.md says `AUTH_001`; docs/requirements/security-notes.md says `ACCESS_DENIED`. Which is authoritative?
     [c2] US-003 role: docs/requirements/roles.md says `admin only`; docs/requirements/user-stories.md says `any authenticated user`. Which is correct?
     [c3] …
   Recommended: resolve [c1] = AUTH_001 (consistent with project-wide error envelope at §3.4), [c2] = unknown — PM decision required.
   Confidence: medium for [c1]; low for the rest.
   ```

   On re-dispatch with user resolutions, apply each decision and continue.

F6. **Gap detection.** When a kit-required section has NO fragment addressing it:
   - Leave the section's placeholder in SRS with a `TODO: <description of expected content>` marker.
   - File one OQ per gap, citing which kit-required section is missing.
   - Sign-off remains `In-Review` until the team fills the gaps.

F7. **Annotate-in-place preservation.** Each file in `docs/requirements/` gets a header annotation appended (NOT prepended — don't disturb the original first line which might be metadata):

   ```
   ---
   _BA annotation (2026-MM-DD): Ingested into kit-shape SRS via Mode F. Maps to SRS sections: §1, §2 (partial). See SRS §10 Changelog for the full classification table._
   ```

   Files stay in place. Don't delete, don't move to `_archive/`. The original is preserved as historical reference; the kit's SRS is the new canonical artifact.

F8. **Set SRS header.**
   - `Version: 1.0`
   - `Status: Draft` initially; transitions to `In-Review` once Phase 1.X common procedure runs and the OQ set is final.
   - `Source: requirements-folder` (new value)
   - `Last-Updated: <ISO-8601>`
   - `Designated Design Approver: TBD`, `Designated Dependency Approver: TBD` (team must name).

F9. **Log to SRS §10 Changelog.** A single entry:

   ```
   | <ISO-8601> | BA Mode F ingestion — synthesized SRS from <N> fragments in docs/requirements/. Classification table: <embed table from F2>. Conflicts resolved: <N>. Gaps remaining: <N>. | BA |
   ```

F10. **Inline-don't-link (self-containment).** Walk the synthesized SRS body + per-US/per-FR files for body-content references back to `docs/requirements/<file>` (`see docs/requirements/security-notes.md`, `details in docs/requirements/api-spec.md`, etc.). The `docs/requirements/` files are preserved in place but downstream agents read kit artifacts ONLY — they should never need to open the requirements fragments. Replace every substantive back-reference with inlined content from the fragment; raise OQs for gaps. The `Synthesized-From:` annotation is the ONLY allowed reference to upstream fragments. Self-containment per CLAUDE.md §10.

F11. Proceed to Phase 1.X common procedure.

**Hard rules specific to `ingest-from-requirements-folder`:**

- **Never invent content to fill gaps.** Missing kit-required section → TODO marker + OQ. Fabrication is forbidden.
- **Synthesis decisions get logged.** Every SRS section, US, and FR carries a `Synthesized-From:` line citing source fragment(s). No untraced content.
- **Format normalization preserves intent.** When BA changes "use case" to "user story", the original term is footnoted so the team can verify intent was captured.
- **Conflicts halt the batch, not the fragment.** Accumulate all conflicts across all fragments; surface in one NEEDS_CONTEXT round. Single round-trip per ingestion run, not per-conflict.
- **`.docx` / `.pdf` require their skills active.** If the skill is absent, refuse with a clear "convert to .md first OR activate the skill" message. Don't half-attempt with regex.
- **`docs/requirements/` files are preserved in place** post-ingestion. Annotate (don't delete, don't move). The SRS becomes canonical; the fragments stay as historical reference.

## Next step

After completing this mode's setup, load [`ba-ingestion-pipeline`](../ba-ingestion-pipeline/SKILL.md) and run its Common Procedure (Phase 1.X) → Delta Detection (Phase 1.Z) → Sign-off Gate (Phase 2).
