---
name: figma-requirements-extraction
description: "Extract requirements information from a Figma file (screens, components, states, exact copy, form fields, interaction flows, accessibility hints) and write to docs/requirements/design-extracted/<figma-file-id>-<ISO-date>.md as additional source corpus for BA synthesis + srs-source-validator coverage check. Use when a PRD references Figma URLs and Design-Flow: A is in effect — runs PRE-BA so BA's first US/FR pass is informed by what the design already specifies. Strictly read-only against Figma (consumer pattern); strictly inferred-vs-confirmed discipline (no invention)."
agents: [ui-ux-designer]
sdlc_phase: ingestion
owner: Platform Eng
status: active
---

# Figma Requirements Extraction

## When to use

You are the UI/UX Designer dispatched in `extract` mode. The Orchestrator has detected a Figma URL in the project's PRD source AND set SRS header `Design-Flow: A` (per BA Phase 1.X step 10) AND no `docs/requirements/design-extracted/<figma-file-id>-*.md` exists yet on disk.

The kit's pattern is: BA's first US/FR synthesis at Phase 1.X must be informed by FULL source corpus. Textual PRD + design-extracted requirements + conversational additions are the three branches. Without design-extracted input, BA invents details that Figma already specifies (or worse, misses details Figma specifies that the textual PRD omits) — every subsequent dispatch then re-discovers the gap.

You produce a structured markdown enumerating WHAT THE DESIGN SHOWS. You do NOT author requirements (that's BA's role); you produce evidence that BA synthesizes into the SRS.

## Inputs and outputs

- **Inputs:** Figma file URL passed by Orchestrator dispatch; Figma MCP server (read-only).
- **Outputs:** `docs/requirements/design-extracted/<figma-file-id>-<ISO-date>.md` (the one and only artifact this skill produces).
- **Consumed by:** BA Phase 1.X (synthesis input); srs-source-validator (coverage check spans this file as part of `docs/requirements/`).

## Hard discipline: confirmed vs inferred

The extractor enumerates two distinct categories:

- **CONFIRMED elements** — text the extractor reads directly from Figma text nodes; components that are instances of named master components; states that exist as Figma variants; explicit copy on buttons / labels / dialogs. These are facts on the canvas.
- **INFERRED requirements** — behaviors / rules / scope items the extractor THINKS the design implies but cannot prove without PRD anchor. Example: a "confirm" modal with a destructive action button is INFERRED to mean "destructive operations require confirmation," but the extractor cannot prove this is a global rule vs incidental to this one flow.

The output file ALWAYS separates the two. BA at Phase 1.X synthesizes US/FR ONLY from confirmed elements + inferred items the textual PRD also supports. Inferred-only items become OQs (per BA's no-invention invariant).

This is the same discipline as solution-defaults skill (kit-provided defaults vs project-confirmed values) and brownfield Mode E (extracted vs confirmed).

## Procedure

### Step 0 — Pre-flight + page-scoping

1. Read the dispatch prompt: confirm `figma_url` is present and `Design-Flow: A` per SRS header.
2. Compute the output filename: `<figma-file-id>-<YYYY-MM-DD>.md` where `<figma-file-id>` is parsed from the Figma URL (the segment after `/file/` or `/design/`).
3. Verify no design-extracted file already exists for this file-id+date. If one exists from today's date for the SAME file-id, halt with `NEEDS_CONTEXT` — the dispatch is redundant; the Orchestrator should reuse the existing file unless re-extraction is explicitly requested (e.g., the Figma version changed).
4. Read the Figma file's `version` ID via MCP. Capture it for the output header.

5. **Resolve `Figma-Design-Page-Node-ID` — the root of all enumeration.** Read SRS §3.4.1 header field `Figma-Design-Page-Node-ID` paired with this URL. A Figma file has MULTIPLE pages (top-level tabs); the project's design lives on ONE specific page. Without page-scoping, this extraction would walk every page (brainstorms, old designs, Foundation page, etc.) and either grab irrelevant frames OR miss the project design.

   Three sub-cases:

   - **The captured value is a PAGE node** (Figma MCP: query node type → `CANVAS` / `PAGE`) → use it directly as the root. Proceed to Step 1.
   - **The captured value is a FRAME or SECTION node** (the PM deep-linked to a specific frame they wanted to highlight) → walk UP the tree via Figma MCP's parent-pointer until you reach a `CANVAS` / `PAGE` node. Record the resolution in the extract output's `## Page-scope resolution` section. Update SRS §3.4.1 `Figma-Design-Page-Node-ID` to the resolved page node (you have write access to this single field; do NOT touch other SRS content).
   - **The captured value is a PAGE NAME (string, not Node ID)** — BA at Phase 1.X step 10 wrote the operator's answer as a name (e.g., "Project Design") rather than an ID. Resolve by querying Figma MCP for pages in the file, finding the one with matching name (case-insensitive, trimmed), and recording its Node ID. Update SRS §3.4.1 with the resolved ID. If no page matches by name → halt with `NEEDS_CONTEXT` asking the operator to choose from the list of actual page names in the file.

6. The root of all enumeration in Steps 1-6 below is the resolved page node. Walk only its subtree. Frames on OTHER pages are NOT enumerated (they are out of scope for the project's design).

### Step 1 — Enumerate screens (frames)

Walk every top-level frame under the resolved page node only. For each frame:
- Capture: frame name, Node ID, page name, dimensions, position on page.
- Identify variants: if the frame is part of a component-set, list all variants by name.
- Infer purpose from name (e.g., "RepositoryList/Default" → purpose: browse repositories; state: default).
- Identify states from variants and from frames with same base-name + state suffix (e.g., "RepositoryList/Empty", "RepositoryList/Loading", "RepositoryList/Error").

### Step 2 — Enumerate components per screen

For each frame, walk every nested instance:
- Capture: component master name, instance name, testID (if `data-testid` set in any node), position within frame, visible properties (label text, icon, state variant).
- Group by type: buttons, inputs, cards, modals, navs, list items, toasts, etc.
- For interactive components: note interaction targets (Figma Prototype connections) — these reveal flows.

### Step 3 — Enumerate exact copy

Walk every text node in every frame:
- Capture the EXACT text (no normalization, no rephrasing). Preserve locale if multi-language frames exist.
- Group by element role: page titles, section headings, button labels, helper text, error messages, placeholder text, empty-state copy, confirmation-dialog copy, toast text.
- Flag template-style copy (e.g., "Show {count} repositories") — these become parameterized strings BA must specify in the FR.

### Step 4 — Enumerate form fields

For every form-shaped frame (input + label + helper pattern):
- Per field: label text, placeholder, default value, validation hints visible in Figma (e.g., red border on `RepoNameInput/Error` variant), error message text, required-marker visibility.
- Per form: submit button label, submit button states (default / loading / disabled), validation timing (on-blur vs on-submit if inferable from interactions).

### Step 5 — Enumerate interaction flows

Walk Figma Prototype connections (the connector arrows between frames). For each:
- Source frame + interaction (click button X) → destination frame + transition style.
- Build a list of flows: "Login → Dashboard" / "Repository List → Repository Detail (drill-in)" / etc.
- Flag flows with no explicit destination in Figma as gaps.

### Step 6 — Enumerate accessibility hints

When the design carries explicit a11y metadata:
- Focus order if numbered on the canvas.
- ARIA semantics in component descriptions.
- Color contrast pairs annotated in Figma (some designers note "AA-compliant" on swatches).
- Touch-target sizes for mobile-bridge surfaces.

Empty when design doesn't specify (most projects don't).

### Step 7 — Write the design-extracted file

Open `docs/requirements/design-extracted/<figma-file-id>-<YYYY-MM-DD>.md`. Use the structure below (template: confirmed-first, inferred-last). Do not include opinion or recommendation — just enumerate what the design contains.

```markdown
# Design-extracted requirements — <figma-file-name>

- **Figma-File-URL:** <url>
- **Figma-File-ID:** <id>
- **Figma-File-Version:** <version-id-at-extraction>
- **Figma-Design-Page-Node-ID:** <page-node-id resolved at Step 0>
- **Figma-Design-Page-Name:** <human-readable page name as it appears in Figma>
- **Extracted-by:** ui-ux-designer (extract mode)
- **Extracted-at:** <ISO-8601>
- **Designer (per Figma metadata):** <name if available, else "(not surfaced in file metadata)">
- **Total frames:** <N>
- **Total pages:** <N>

## Provenance

This file is one of three branches of the `docs/requirements/` source corpus that BA reads at Phase 1.X synthesis. The other two are top-level PM-authored files and `conversational-additions/` (BA Mode D Step D0 captures). The srs-source-validator's coverage check spans ALL three branches.

This file contains CONFIRMED elements (Sections 1–5 below) and INFERRED requirements (Section 6 below). BA at Phase 1.X synthesizes US/FR only from confirmed elements + inferred items the textual PRD also supports. Inferred-only items must become OQs per BA's no-invention invariant.

## Section 1 — Screens (frames)

| Frame name | Node ID | Page | Purpose | States detected |
|---|---|---|---|---|
| RepositoryList/Default | 530:2 | Repositories | List view | default, loading, empty, error |
| RepositoryList/SelectedRow | 530:14 | Repositories | List with selection | with-selection (1+ rows checked) |
| ConfirmDialog/Hide | 533:2 | Repositories | Destructive action confirm | open, closing |

## Section 2 — Components per screen

### RepositoryList/Default (530:2)
- Per-row checkbox (testID: `rep-row-checkbox-<id>`) — states: default / checked / disabled. Touch target 24×24.
- Select-all checkbox (testID: `rep-select-all-checkbox`) — states: unchecked / mixed / all.
- Search input (testID: `rep-search`) — placeholder: "Search repositories…".
- Filter chips (testIDs: `rep-filter-region`, `rep-filter-status`) — 4 chip variants visible (Active, Hidden, Pending, Archived).
- Batch action bar (testID: `rep-batch-bar`) — sticky-bottom, visible when ≥1 row checked. Contains: "Show selected" button, "Hide selected" button, selection-count indicator.

(Repeat per screen.)

## Section 3 — Exact copy

| Element | Text | Locale | Notes |
|---|---|---|---|
| Page title (RepositoryList) | "Repository Visibility Admin" | en | h1 |
| Search placeholder | "Search repositories…" | en | input.placeholder |
| Empty state heading (RepositoryList/Empty) | "No repositories yet" | en | empty state |
| Empty state body | "Connect your first repository to get started" | en | empty state |
| Batch button — Show | "Show selected" | en | primary action |
| Batch button — Hide | "Hide selected" | en | destructive action |
| Confirm dialog title | "Show {count} repositories?" | en | PARAMETERIZED — `count` must be supplied by FR |
| Confirm dialog body | "{count} repositories will become publicly visible." | en | PARAMETERIZED |
| Confirm dialog button — primary | "Show" | en | primary |
| Confirm dialog button — secondary | "Cancel" | en | secondary |
| Completion toast | "{count} repositories updated" | en | PARAMETERIZED |

## Section 4 — Form fields

(Per form: label, placeholder, validation rules visible in Figma, error message text, default values. Empty if no forms in the file.)

## Section 5 — Interaction flows

| Flow | Source | Trigger | Destination | Notes |
|---|---|---|---|---|
| Browse → Detail | RepositoryList/Default | click row | RepositoryDetail/Default | drill-in |
| Batch Hide flow | RepositoryList/SelectedRow | click "Hide selected" | ConfirmDialog/Hide | open modal |
| Batch Hide confirm | ConfirmDialog/Hide | click "Show" | RepositoryList/Default | close modal + toast |
| Batch Hide cancel | ConfirmDialog/Hide | click "Cancel" | RepositoryList/SelectedRow | close modal, preserve selection |

## Section 6 — Inferred requirements (proposed; require PRD anchor or OQ)

Items the extractor infers from the design but cannot confirm. BA decides per Phase 1.X gap-handling: anchor to textual PRD OR file as OQ. Do NOT synthesize US/FR from this section without anchor.

- **Inferred (selection state):** Selection persists across pagination — inferred from the "with-selection" state appearing on RepositoryList/Default-pagination-2. No textual confirmation of persistence rule.
- **Inferred (destructive confirmation):** All destructive bulk actions require modal confirmation — inferred from ConfirmDialog/Hide existing for batch-hide. Cannot confirm "all destructive" vs "this one only" without PRD.
- **Inferred (max batch size):** No max-count UI element visible — design may imply unlimited OR may rely on backend enforcement. PRD must confirm.
- **Inferred (toast timing):** Completion toast auto-dismisses — duration not visible in Figma (no timeline annotation).
- **Inferred (locale support):** Only en copy in this file — VN / TH / TW locale support unknown.

## Section 7 — Gaps observed

Items the extractor expected to find but didn't. These become OQs for BA to surface during synthesis:

- No design for `RepositoryList/Error` variant with specific error code (only generic error state)
- No design for offline / network-unavailable state
- No design for the "Hide selected" success path when some rows fail (partial success state)
- No accessibility annotations visible on the canvas (focus order, ARIA labels not surfaced)
- No design for mobile-bridge layout (< 480px viewport) — adaptive behavior unclear
```

### Step 8 — Commit

Commit the file with conventional-commits convention (`feat(requirements): extract design requirements from <figma-file-name>`). Reference any task ID if the dispatch carried one.

## Hard Rules

- **READ-ONLY against Figma.** This skill uses Figma MCP in consumer mode only. No frame edits, no comment additions, no version changes.
- **NO INVENTION.** Section 1–5 contains ONLY what the canvas literally shows. Section 6 contains inferred items but explicitly flags them as proposals BA must anchor or OQ. Empty sections stay empty (do not fabricate sample data).
- **VERBATIM COPY.** Section 3 captures text exactly as it appears — no normalization, no fixing typos, no spelling corrections, no translation. The audit-log value depends on faithfulness.
- **PARAMETERIZED STRINGS marked clearly.** When copy contains `{placeholders}`, flag as PARAMETERIZED so BA's FR specifies the parameter source.
- **One file per dispatch.** If the Figma file is large enough that the extraction produces a >5000-line single file, split by Figma page into multiple files: `<figma-id>-<date>-<page-slug>.md`. The Orchestrator's BA dispatch reads the full directory; multiple files are fine.
- **No SRS-side writes except page-scope resolution.** This skill writes to `docs/requirements/design-extracted/`. The only allowed SRS update is the page-scope field update delegated to `ui-ux-page-scoping` when a frame/section/name must be resolved to a page Node ID. It does NOT touch SRS body content, `docs/user-stories/`, `docs/frs/`, or any role-owned doc that BA / SA / QA-Author own.
- **The output is source corpus, not authored requirements.** BA at Phase 1.X is the synthesis authority. Your output is INPUT to BA's authoring, in the same way PM's textual PRD is input.

## Edge cases

- **Figma file inaccessible / version mismatch:** halt with `NEEDS_CONTEXT`. Do not produce a partial extraction; the audit-log value depends on completeness.
- **Empty Figma file (canvas blank or trivial):** produce the output file with all sections marked "(no content extracted)" + a note in Section 7 stating "Figma file appears not yet designed." BA's Phase 1.X synthesis then treats this branch as informational-only.
- **Multi-version Figma file:** extract from the file's HEAD version only. If PRD references a specific version-id different from HEAD, halt with `NEEDS_CONTEXT` asking which to extract.
- **Permission restricted:** if MCP can't read the file (private, restricted), halt with `NEEDS_CONTEXT` requesting access.

## References

- Workflow contract: CLAUDE.md
- Source corpus discipline: CLAUDE.md §1
- BA synthesis authority: `.claude/agents/_templates/ba.md` § Phase 1.X
- srs-source-validator (consumer at sign-off): `.claude/agents/_templates/srs-source-validator.md`
- Design-Flow A detection: `.claude/agents/_templates/ba.md` § Phase 1.X step 10
- Sibling skill (Figma-SRS mapping after BA): `.claude/skills/figma-srs-mapping/SKILL.md`
- Sibling skill (Foundation authoring): `.claude/skills/design-system-author/SKILL.md`
