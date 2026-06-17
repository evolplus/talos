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

You are the UI/UX Designer authoring or revising Figma content via MCP. The kit accepts any canvas arrangement that survives a pre-handoff lint, but two consumers see your canvas directly and benefit from disciplined layout:

- **The Designated Design Approver** opens the Figma file at confirmation time (design lifecycle Step 4, `.claude/rules/parallel-execution.md` §4). Visual chaos on the canvas — long-scroll screens bleeding over neighbors, frames jumbled without grouping — produces false `unqualified` BA Phase 3 verdicts and slower approval cycles.
- **QA-Author** generates `docs/uiux/visual-specs/<task-id>.md` and may export page-level Figma snapshots. Overlapping frames muddy page exports; frame-level exports stay clean, but the operator reviewing the visual spec sees both.

FE Dev consumes frame data via MCP node-by-node and is unaffected by canvas layout. This skill is a **human-readability discipline**, not a correctness invariant.

## Inputs and outputs

- **Inputs:** SRS UI surfaces (SRS §3.4.1 Design References), the Figma file you're writing to via MCP, the current `## Design References` state.
- **Outputs:** A Figma file whose frames satisfy the layout rules below and pass the pre-handoff overlap lint; frame names that map 1:1 to handoff-doc anchors; an updated handoff doc with the lint result recorded.

## Layout rules

The kit prescribes **rules + lint**, not a fixed grid — choose any arrangement that satisfies the rules.

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

### Rule 3 — Page-level grid is your choice

Within a Section, arrange frames however the flow reads best — horizontal row (one column per state), vertical column (one row per state), 2D grid (rows by screen, columns by state), or freeform with a logical reading order. The lint doesn't care about the arrangement; it only cares that Rule 1's gaps hold.

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

- **Violations present** → DO NOT flip to `design-ready-for-review`. Either fix the violations (move frames, widen gaps) and re-run the lint, OR escalate via `NEEDS_CONTEXT` if a violation is intentional (rare; document the rationale).
- **Warnings only** → may proceed; warnings appear in the handoff doc for the Approver's awareness.
- **Clean lint** → proceed to handoff.

## Mode-specific behavior

The skill applies differently per UI/UX Designer dispatch mode (see `.claude/agents/_templates/ui-ux-designer.md` for mode routing and `.claude/skills/figma-design-handoff/` for handoff modes).

### `create` mode (greenfield Figma authoring)

- Apply layout rules and naming conventions as you author. Don't rely on a post-hoc cleanup; lay out cleanly from the first frame.
- Run the lint before handoff. Any violations are your own to fix.

### `revise` mode (BA Phase 3 returned unqualified)

- Apply rules to new/modified frames. Don't reorganize the entire file — that introduces churn the Approver hasn't asked for.
- Run the lint before handoff. If the file had pre-existing violations not flagged in the original handoff, decide:
  - If the violations would distract the Approver's review of THIS revision → fix them as a side effect; note in handoff `## Revision Notes`.
  - If the violations are unrelated to the revision scope → record in lint report as warnings, do NOT fix unilaterally.

### `incorporate` mode (human edited Figma directly between handoff and confirmation)

- **Do NOT auto-rearrange.** The human owns the canvas; you absorb their edits, you don't reformat them.
- Run the lint and record results in the handoff doc.
- If lint surfaces new violations introduced by the human edit, flag in handoff `## Human Edit Reconciliation Notes` for the Approver's awareness. Do not move human-authored frames.

### `import` mode (read existing Figma → produce handoff, never write Figma)

- This skill is **read-only** in import mode — the designer doesn't write Figma in import mode.
- Run the lint and record results in handoff doc + as `docs/open-issues.md` entries with category `figma-canvas-lint-gap` for any violations.
- Violations in `import` mode do NOT block the handoff (the kit's brownfield-onboarding flavor — document what exists, gaps are for Stage 4 confirmation). Approver decides whether to commission a `revise` pass to clean up.

## Hard rules

- **No frame overlap is allowed at handoff time** in `create` / `revise` / `incorporate` modes. (`import` mode is exempt — flagged but not blocking.)
- **Every frame must use the `Feature / Screen / State` 3-segment naming pattern.** Generic names (`Frame 17`, `Group 3`) fail the lint.
- **Sections required when the file holds more than five frames.** Below that count, sections are optional; above, mandatory.
- **The lint runs every dispatch, every mode.** Lint output appears in the handoff doc whether or not violations exist (clean lint records the audit trail).
- **The skill is a human-readability discipline, NOT a kit-correctness invariant.** FE Dev's MCP reads are unaffected; downstream agents (BA Phase 3, QA-Author for visual specs) benefit from clean canvas but don't require it.

## References

- [`.claude/agents/_templates/ui-ux-designer.md`](../../agents/_templates/ui-ux-designer.md) — dispatching role and mode router.
- [`.claude/skills/figma-design-handoff/`](../figma-design-handoff/SKILL.md) — create/import/revise/incorporate procedures that use this lint.
- [`.claude/rules/parallel-execution.md`](../../rules/parallel-execution.md) §4 Design lifecycle — where the Approver review happens.
- [`docs/uiux/handoffs/<task-id>.md`](../../../docs/uiux/handoffs/) — where the lint report lands.
- [`docs/uiux/visual-specs/<task-id>.md`](../../../docs/uiux/visual-specs/) — QA-Author output that benefits from clean frame names.
