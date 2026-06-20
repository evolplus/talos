---
name: figma-canvas-layout
description: How to lay out Figma frames so screens don't visually overlap on the canvas, with frame-naming conventions and a pre-handoff overlap lint. Consult when UI/UX Designer is producing Figma content (create / revise / incorporate modes), and ALWAYS as a pre-handoff sanity check.
agents: [ui-ux-designer]
sdlc_phase: design
owner: Platform Eng
status: active
---

# Figma Canvas Layout

## When to use

You are the UI/UX Designer authoring or revising Figma content via MCP. The kit requires a reviewable canvas arrangement before handoff because two consumers see your canvas directly:

- **The Designated Design Approver** opens the Figma file at confirmation time (design lifecycle Step 4, `.claude/rules/parallel-execution.md` §4). Visual chaos on the canvas — long-scroll screens bleeding over neighbors, frames jumbled without grouping — produces false `unqualified` BA Phase 3 verdicts and slower approval cycles.
- **QA-Author** generates `docs/uiux/visual-specs/<task-id>.md` and may export page-level Figma snapshots. Overlapping frames muddy page exports; frame-level exports stay clean, but the operator reviewing the visual spec sees both.

FE Dev consumes frame data via MCP node-by-node and is less sensitive to canvas layout, but the design lifecycle still treats canvas readability as a **handoff quality gate**. A clean frame export is not enough; the scoped Figma page must also be usable for human review.

## Inputs and outputs

- **Inputs:** SRS UI surfaces (SRS §3.4.1 Design References), the Figma file you're writing to via MCP, the current `## Design References` state.
- **Outputs:** A Figma file whose frames satisfy the layout rules below and pass the pre-handoff overlap lint; frame names that map 1:1 to handoff-doc anchors; an updated handoff doc with the lint result recorded.

## Layout rules

The kit prescribes **deterministic placement + lint**. Choose the reading direction that fits the flow, but always compute explicit coordinates before writing or moving frames. Do not rely on Figma's default origin placement; stacked frames at `(0, 0)` or visually overlapping long-scroll screens fail handoff.

### Placement contract

Use the resolved `Figma-Design-Page-Node-ID` from `ui-ux-page-scoping` as the only screen canvas for the dispatch.

1. Group screens by US-ID or bounded feature flow.
2. Create one Figma Section per group when the page has more than five frames.
3. Place each section in a predictable grid:
   - Start at `CANVAS_ORIGIN_X = 0`, `CANVAS_ORIGIN_Y = 0` unless existing scoped frames already occupy that region.
   - Use `SECTION_GAP_X = 1200px` and `SECTION_GAP_Y = 1200px` between sections.
   - Within a section, use `FRAME_GAP_X = max(240px, 0.15 * widest-frame-width-in-row)`.
   - Within a section, use `FRAME_GAP_Y = max(320px, 0.25 * tallest-frame-height-in-row)`.
   - Long-scroll frames define the row height; never let a short neighbor's height determine the vertical step.
4. Set `x` and `y` explicitly for every newly created or revised top-level screen frame.
5. After writing frames, re-enumerate bounding boxes and run the overlap lint. If any frame moved because of a collision, record it in the handoff `## Canvas Layout Lint` notes.

The placement contract intentionally creates gaps larger than the lint minimum. The extra whitespace is cheaper than a canvas the Approver cannot visually scan.

### Rule 1 — Minimum gap between frames

Pairwise frames on the same Figma page must respect:

- **Horizontal gap ≥ max(200px, 0.1 × narrower-frame-width).** For typical mobile frames (375–414px wide), 200px is the floor. For tablet/desktop frames wider than 2000px, the 0.1× component widens the gap proportionally.
- **Vertical gap ≥ max(200px, 0.2 × shorter-frame-height).** A long-scroll screen (e.g., 4000px tall) demands a wider gap from any frame placed below or above it — `0.2 × 4000 = 800px` minimum. This is the rule that prevents the bleed-over you observed.

The 0.2× height factor matters most. Long-scroll mobile content is the common case; the gap must scale with content length.

### Rule 2 — Group related screens into Figma Sections

When the file contains screens for more than one SRS User Story or feature flow:

- Wrap each flow in a Figma **Section** (`section` node type via MCP).
- One Section = one US-ID OR one bounded feature flow. Section name carries the US-ID: e.g., `US-001 — Spectator Join Flow`, `US-002 — Tournament Admin Toggle`.
- Sections may nest if your tooling supports it; the kit's lint walks Sections recursively.

The benefit: the Approver scans Section titles to navigate; QA-Author exports by Section for visual-spec organization; lint runs per-Section, surfacing overlaps within a flow distinctly from overlaps across flows.

### Rule 3 — Page-level grid reading order

Within a Section, arrange frames however the flow reads best — horizontal row (one column per state), vertical column (one row per state), or 2D grid (rows by screen, columns by state). Freeform placement is allowed only when it still follows the explicit-coordinate placement contract above and the reading order is documented in the handoff.

For most mobile flows, **horizontal row per screen × vertical column per state** reads naturally — eye moves right through the flow, down through the states of any one screen.

## Naming convention

Every frame name follows a **3-segment path**: `Feature / Screen / State`.

### The three segments

- **Feature** — the bounded feature this frame belongs to. Maps to a SRS User Story title or feature-flow name. Examples: `Spectator`, `TournamentAdmin`, `Auth`, `Onboarding`.
- **Screen** — the screen or major surface within the feature. Maps to a SRS §3.4.1 Surface row. Examples: `MatchList`, `MatchDetail`, `JoinFlow`, `SettingsPanel`.
- **State** — the state variant of that screen. Choose from the enum below.

### State enum

| State | When to use |
|---|---|
| `Default` | Initial / normal / non-empty state |
| `Loading` | Data fetch in progress |
| `Empty` | No data to display (legitimate empty result) |
| `Error` | Error condition (network, validation, auth) |
| `Success` | Post-action confirmation (e.g., form submitted) |
| `Disabled` | Interaction-disabled variant (e.g., feature flag off, permission lack) |
| `<custom>` | Project-specific (e.g., `CountdownActive`, `OfflineMode`) — use sparingly; document in handoff doc |

### Examples

- `Spectator / MatchList / Default` — list of matches, populated.
- `Spectator / MatchList / Loading` — same screen, skeleton loaders.
- `Spectator / MatchList / Empty` — no matches in the current window.
- `TournamentAdmin / ToggleSpectatable / Success` — post-toggle confirmation.

### Why the 3-segment path matters downstream

- **Handoff doc anchors.** Each frame name appears as a section header or table-row identifier in `docs/uiux/handoffs/<task-id>.md`. The kit's BA Phase 3 design-completeness check walks SRS requirements against handoff-doc anchors; consistent naming eliminates lookup ambiguity.
- **QA-Author selectors.** When generating `docs/uiux/visual-specs/<task-id>.md`, QA-Author selects frames by name via MCP. 3-segment paths give stable, unambiguous selectors.
- **Approver navigation.** The Approver sees the layers panel with `Spectator / MatchList / Default` rather than `Frame 17` and immediately knows what they're looking at.

## Pre-handoff overlap lint

Run this procedure BEFORE flipping the design sub-status to `design-ready-for-review` (i.e., before producing `docs/uiux/handoffs/<task-id>.md`).

### Step 1 — Enumerate all frames

Via Figma MCP, list every top-level frame on every page of the file. For each, capture: name, page, parent section (if any), bounding box `{x, y, width, height}`.

### Step 2 — Compute pairwise overlaps

For every pair of frames `(A, B)` on the **same page** (skip cross-page pairs; pages are independent canvases):

```
horizontal_gap = max(0, max(A.x, B.x) - min(A.x + A.width, B.x + B.width))
vertical_gap   = max(0, max(A.y, B.y) - min(A.y + A.height, B.y + B.height))
overlap = horizontal_gap == 0 AND vertical_gap == 0
```

If `overlap == true` AND the frames are not in a parent-child relationship (a screen contains its own components as children — that's fine), record as a violation.

Also compute the actual gap when frames don't overlap but are adjacent — if it's below the Rule 1 floor, record as a near-miss warning.

### Step 3 — Compute the required gap per pair

For each non-overlapping pair, the rule-required gap is:

- Horizontal: `max(200, 0.1 × min(A.width, B.width))`
- Vertical: `max(200, 0.2 × min(A.height, B.height))`

Compare with actual gap. Below required → warning. Below 50% of required → violation (same severity as overlap).

### Step 4 — Emit lint report

Append a `## Canvas Layout Lint` section to the handoff doc with the following shape:

```markdown
## Canvas Layout Lint

- **Lint run:** <ISO-8601>
- **Frames audited:** <N>
- **Pages audited:** <N>
- **Sections audited:** <N>

### Violations (block handoff)

| Frame A | Frame B | Page | Type | Detail |
|---|---|---|---|---|
| Spectator/MatchList/Default | Spectator/MatchDetail/Default | Spectator Flow | overlap | A bottom edge at y=4200; B top edge at y=4150 — 50px overlap |

### Warnings (below-floor gap)

| Frame A | Frame B | Page | Required gap | Actual gap |
|---|---|---|---|---|
| Spectator/MatchList/Loading | Spectator/MatchList/Empty | Spectator Flow | 200px H | 120px H |

### Naming violations

| Frame | Page | Issue |
|---|---|---|
| Frame 12 | Spectator Flow | Generic name; expected `Feature / Screen / State` 3-segment path |
```

### Step 5 — Block or proceed

- **Violations present in `create` / `revise` / `incorporate` modes** → DO NOT flip to `design-ready-for-review`. Fix the violations when the mode permits writes; otherwise halt with `NEEDS_CONTEXT` and request a `revise` pass or explicit permission to normalize the canvas.
- **Warnings present in `create` / `revise` modes** → fix the gaps and re-run. Writing modes should leave the page comfortably scannable, not merely non-overlapping.
- **Warnings present in `incorporate` mode** → record them in the handoff; proceed only if there is no overlap and the below-floor gap cannot distract review of the changed frames.
- **Violations or warnings in `import` mode** → record them as read-only findings and file open issues; do not block import.
- **Clean lint** → proceed to handoff.

## Mode-specific behavior

The skill applies differently per UI/UX Designer dispatch mode (see `.claude/agents/_templates/ui-ux-designer.md` for mode routing and `.claude/skills/figma-design-handoff/` for handoff modes).

### `create` mode (greenfield Figma authoring)

- Apply the placement contract, layout rules, and naming conventions as you author. Don't rely on a post-hoc cleanup; lay out cleanly from the first frame.
- Run the lint before handoff. Any violations or writing-mode warnings are yours to fix.

### `revise` mode (BA Phase 3 returned unqualified)

- Apply rules to new/modified frames. Don't reorganize the entire file — that introduces churn the Approver hasn't asked for.
- Run the lint before handoff. If the file had pre-existing violations not flagged in the original handoff, decide:
  - If the violations would distract the Approver's review of THIS revision → fix them as a side effect; note in handoff `## Revision Notes`.
  - If the violations are unrelated to the revision scope → record in lint report and halt with `NEEDS_CONTEXT` only when they block review of the revised frames. Otherwise, keep the cleanup out of scope.

### `incorporate` mode (human edited Figma directly between handoff and confirmation)

- **Do NOT auto-rearrange silently.** The human owns the canvas; you absorb their edits, you don't reformat them without permission.
- Run the lint and record results in the handoff doc.
- If lint surfaces overlap or below-50%-gap violations introduced by human edits, do not mark the design `design-ready-for-review`. Halt with `NEEDS_CONTEXT` and ask for one of:
  - permission to normalize the scoped page in a follow-up `revise` pass using the placement contract above, or
  - confirmation that the human will clean up the canvas before re-dispatch.
- If lint surfaces only minor below-floor warnings, flag them in `## Human Edit Reconciliation Notes` and proceed only when the changed frames remain easy to inspect.

### `import` mode (read existing Figma → produce handoff, never write Figma)

- This skill is **read-only** in import mode — the designer doesn't write Figma in import mode.
- Run the lint and record results in handoff doc + as `docs/open-issues.md` entries with category `figma-canvas-lint-gap` for any violations.
- Violations in `import` mode do NOT block the handoff (the kit's brownfield-onboarding flavor — document what exists, gaps are for Stage 4 confirmation). Approver decides whether to commission a `revise` pass to clean up.

## Hard rules

- **No frame overlap is allowed at handoff time** in `create` / `revise` / `incorporate` modes. (`import` mode is exempt — flagged but not blocking.)
- **No newly created or revised top-level screen frame may be left at the default origin or stacked over another frame.** Every touched frame gets explicit `x` / `y` coordinates derived from the placement contract.
- **Every frame must use the `Feature / Screen / State` 3-segment naming pattern.** Generic names (`Frame 17`, `Group 3`) fail the lint.
- **Sections required when the file holds more than five frames.** Below that count, sections are optional; above, mandatory.
- **The lint runs every dispatch, every mode.** Lint output appears in the handoff doc whether or not violations exist (clean lint records the audit trail).
- **Canvas readability is part of design handoff quality.** FE Dev can still read frame nodes, but BA Phase 3, QA-Author, and the human Approver must be able to inspect the scoped page without visual clutter.

## References

- [`.claude/agents/_templates/ui-ux-designer.md`](../../agents/_templates/ui-ux-designer.md) — dispatching role and mode router.
- [`.claude/skills/figma-design-handoff/`](../figma-design-handoff/SKILL.md) — create/import/revise/incorporate procedures that use this lint.
- [`.claude/rules/parallel-execution.md`](../../rules/parallel-execution.md) §4 Design lifecycle — where the Approver review happens.
- [`docs/uiux/handoffs/<task-id>.md`](../../../docs/uiux/handoffs/) — where the lint report lands.
- [`docs/uiux/visual-specs/<task-id>.md`](../../../docs/uiux/visual-specs/) — QA-Author output that benefits from clean frame names.
