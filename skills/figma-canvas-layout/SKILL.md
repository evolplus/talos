---
name: figma-canvas-layout
description: How to lay out Figma frames and Sections on the canvas — Sections on a computed page grid, every screen fully inside its parent Section (parent-local coordinates), no overlap — with frame-naming conventions and a pre-handoff layout lint. Consult when UI/UX Designer is producing Figma content (create / revise / incorporate modes), and ALWAYS as a pre-handoff sanity check.
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
3. Inside each Section, place frames by the reading order of Rule 3 using these gaps:
   - `FRAME_GAP_X = max(240px, 0.15 * widest-frame-width-in-row)`.
   - `FRAME_GAP_Y = max(320px, 0.25 * tallest-frame-height-in-row)`.
   - Long-scroll frames define the row height; never let a short neighbor's height determine the vertical step.
4. **Append each frame to its Section first, then set its `x` / `y` in Section-local coordinates** (Rule 5). Never derive a child's position from the Section's page position.
5. Fit every Section to its children (Rule 5 step 4).
6. Place the fitted Sections on the page grid (Rule 4), starting at `CANVAS_ORIGIN_X = 0`, `CANVAS_ORIGIN_Y = 0`. If existing scoped content already occupies that region, start the grid at `y = bottom of existing content + SECTION_GAP_Y` instead of interleaving.
7. Re-enumerate bounding boxes and run the layout lint. If any frame or Section moved because of a collision, record it in the handoff `## Canvas Layout Lint` notes.

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

### Rule 3 — Within-section reading order

Within a Section, arrange frames however the flow reads best — horizontal row (one column per state), vertical column (one row per state), or 2D grid (rows by screen, columns by state). Freeform placement is allowed only when it still follows the explicit-coordinate placement contract above and the reading order is documented in the handoff.

For most mobile flows, **horizontal row per screen × vertical column per state** reads naturally — eye moves right through the flow, down through the states of any one screen.

Two bounds apply regardless of arrangement:

- **Wrap long rows.** No more than **8 frames in one row** inside a Section. A longer flow wraps to a new row (left-to-right, then top-to-bottom).
- **Section aspect ratio ≤ 4:1** in either direction. A Section 30 000px wide and 900px tall is the symptom of an unwrapped row — re-wrap it.

### Rule 4 — Sections sit on a computed page grid

The page is a grid of Sections, not a free canvas. This keeps the scoped page from growing into one very long horizontal strip or vertical column.

**Order.** Sort Sections into reading order: US-ID ascending, or phase/task order when Sections are grouped by phase or task. Placement is row-major in that order.

**Gutter.** `SECTION_GAP_X = SECTION_GAP_Y = 1200px` (the placement-contract value; always ≥ the Rule 1 gap for the neighbouring Sections).

**Column count — compute, don't guess.** Try every column count `C = 1..N` and keep the one whose resulting page bounding box has an aspect ratio (width ÷ height) closest to **1.6** (16:10). Tie → fewer columns.

**Placement (true grid — rows AND columns align):**

```
colW[j] = max width  of Sections in column j          (j = i mod C)
rowH[r] = max height of Sections in row r             (r = floor(i / C))
colX[0] = ORIGIN_X;  colX[j] = colX[j-1] + colW[j-1] + SECTION_GAP_X
rowY[0] = ORIGIN_Y;  rowY[r] = rowY[r-1] + rowH[r-1] + SECTION_GAP_Y
Section i → (x, y) = (colX[i mod C], rowY[floor(i / C)])
```

Every Section in a row shares the same top edge; every Section in a column shares the same left edge. The grid uses **fitted** Section sizes (Rule 5), so fit first, then place.

**Page aspect bound.** The union of all Sections must have aspect ratio between **1:3 and 3:1**. Outside that band with ≥ 4 Sections → lint violation.

**No orphans.** When Sections are mandatory (see Hard rules), every screen frame lives inside a Section. A screen frame sitting loose on the page is a lint violation.

### Rule 5 — Every child is fully inside its parent (parent-local coordinates)

A screen placed at a huge `(x, y)` inside a Section renders outside the Section's bounds and is effectively invisible — the Approver opens the Section and sees nothing. The root cause is almost always a **coordinate-space mistake**, not a layout choice:

- In Figma, a child's `x` / `y` are **relative to its parent** when the parent is a `SECTION`, `FRAME`, or `COMPONENT`. `GROUP` is the exception — it creates no coordinate space; its children use the nearest frame/section/page ancestor.
- Failure A — **double offset:** compute a page position (`section.x + 500`), append the frame to the Section, then set `frame.x = section.x + 500`. The frame lands at roughly twice the Section's page offset — far outside it.
- Failure B — **set-then-append:** set `x/y` while the frame is on the page, then `appendChild` into the Section. The numbers are kept but reinterpreted as Section-local, shifting the frame by the Section's page offset.
- Failure C — **container never grows:** frames are placed correctly in local space, but the Section stays at its creation size, so most frames hang outside it.

**Order for every placement:**

1. Create (or reuse) the Section.
2. Create the frame and **`appendChild` it into the Section first.**
3. **Then** set `x` / `y` in **Section-local coordinates**, measured from the Section's top-left. Never read `section.x` / `section.y` when positioning a child.
4. After all frames of the Section are placed, **fit the Section to its content**: resize it to the children's local bounding box plus padding (top **160px** for the Section title, other sides **120px**). Resize the container to fit the children — never shrink or move children to fit a container.
5. Only after every Section is fitted, run the Rule 4 grid. Moving a Section moves its children; they need no re-placement.

**Containment invariant** — checked in absolute coordinates, so it is immune to the local/page confusion:

```
for every child C of a SECTION or FRAME parent P:
  C.absoluteBoundingBox ⊆ P.absoluteBoundingBox
```

Never compare a child's local `x` with a parent's page `x`.

**Do not use `GROUP` as a screen container.** Groups auto-size, carry no title, and create no coordinate space — they hide this defect instead of preventing it. Use `SECTION` to group screens and `FRAME` for each screen.

**Reference (Figma Plugin API, as executed through a write-capable Figma MCP):**

```js
const section = figma.createSection();
section.name = "US-001 — Checkout Flow";
page.appendChild(section);

const PAD = { top: 160, right: 120, bottom: 120, left: 120 };
let x = PAD.left, y = PAD.top, rowH = 0, col = 0;
for (const spec of screens) {                       // reading order
  const f = figma.createFrame();
  section.appendChild(f);                           // 1) parent first
  f.resize(spec.w, spec.h);
  if (col === 8) {                                  // Rule 3 wrap
    x = PAD.left; y += rowH + Math.max(320, 0.25 * rowH); rowH = 0; col = 0;
  }
  f.x = x; f.y = y;                                 // 2) LOCAL coords — never section.x + ...
  x += spec.w + Math.max(240, 0.15 * spec.w);
  rowH = Math.max(rowH, spec.h); col++;
}
const kids = section.children;                      // 3) fit Section to children
section.resizeWithoutConstraints(
  Math.max(...kids.map(k => k.x + k.width))  + PAD.right,
  Math.max(...kids.map(k => k.y + k.height)) + PAD.bottom);
```

If the MCP exposes higher-level tools (`create_frame(parentId, x, y, ...)`) instead of raw Plugin API, check whether its `x/y` are parent-relative. If unclear, create one probe frame, read back its `absoluteBoundingBox`, and confirm before placing the rest.

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

## Pre-handoff layout lint

Run this procedure BEFORE flipping the design sub-status to `design-ready-for-review` (i.e., before producing `docs/uiux/handoffs/<task-id>.md`).

### Step 1 — Enumerate all Sections and frames

Via Figma MCP, list every Section and every screen frame on the scoped page. For each, capture: name, node type, parent node (id + type), local `{x, y, width, height}`, and **`absoluteBoundingBox`**. All geometric checks below use `absoluteBoundingBox`.

### Step 1a — Containment check (Rule 5)

For every screen frame whose parent is a `SECTION` or `FRAME`:

```
contained = C.abs.x >= P.abs.x and C.abs.y >= P.abs.y
        and C.abs.x + C.abs.width  <= P.abs.x + P.abs.width
        and C.abs.y + C.abs.height <= P.abs.y + P.abs.height
```

- `contained == false` → **violation** (`out-of-bounds`). Record how far outside the parent the frame sits. A distance close to the parent's own page offset is the Failure A/B signature — say so in the Detail column.
- Contained but inside the Section's padding band (closer than 160px to the top edge or 120px to the other edges) → warning (`padding`).
- Screen frame whose parent is a `GROUP` → warning (`group-container`).
- Screen frame whose parent is the page while Sections are mandatory → violation (`orphan`).

### Step 2 — Compute pairwise overlaps

For every pair of frames `(A, B)` on the **same page** (using `absoluteBoundingBox`), and separately for every pair of Sections, (skip cross-page pairs; pages are independent canvases):

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

### Step 3a — Page grid check (Rule 4)

Over the Sections of the scoped page:

- **Alignment:** Sections in the same grid row share the same top `y` (±1px); same grid column → same left `x` (±1px). Misalignment → warning (`grid-misaligned`).
- **Page aspect:** `union(all Sections).width ÷ height` outside **[1/3, 3]** with ≥ 4 Sections → violation (`page-aspect`). Report the ratio and the column count Rule 4 would choose.
- **Section aspect:** any Section beyond 4:1 either way → warning (`section-aspect`), usually an unwrapped row.
- **Reading order:** row-major Section order differs from US-ID / phase order → warning (`grid-order`).

### Step 4 — Emit lint report

Append a `## Canvas Layout Lint` section to the handoff doc with the following shape:

```markdown
## Canvas Layout Lint

- **Lint run:** <ISO-8601>
- **Frames audited:** <N>
- **Page aspect ratio:** <W:H> (grid columns: <C>)
- **Pages audited:** <N>
- **Sections audited:** <N>

### Violations (block handoff)

| Frame A | Frame B | Page | Type | Detail |
|---|---|---|---|---|
| Spectator/MatchList/Default | Spectator/MatchDetail/Default | Spectator Flow | overlap | A bottom edge at y=4200; B top edge at y=4150 — 50px overlap |

### Containment & grid findings

| Node | Parent | Page | Type | Detail |
|---|---|---|---|---|
| Checkout/Payment/Default | US-001 — Checkout Flow | Checkout | out-of-bounds | frame abs x=48 120; Section right edge at x=24 300 — 23 820px outside (≈ Section page x: double offset) |
| (page) | — | Checkout | page-aspect | 9 Sections in one row: 7.8:1; Rule 4 picks C=3 → 1.5:1 |

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
- **Exceptions — always fix:** `out-of-bounds` and `orphan` violations (Rule 5) are rendering defects, not style; fix them wherever found and note in `## Revision Notes`. A `page-aspect` violation may be fixed by re-running the Rule 4 grid, which moves whole Sections only — never the frames inside them.
- Run the lint before handoff. If the file had pre-existing violations not flagged in the original handoff, decide:
  - If the violations would distract the Approver's review of THIS revision → fix them as a side effect; note in handoff `## Revision Notes`.
  - If the violations are unrelated to the revision scope → record in lint report and halt with `NEEDS_CONTEXT` only when they block review of the revised frames. Otherwise, keep the cleanup out of scope.

### `incorporate` mode (human edited Figma directly between handoff and confirmation)

- **Do NOT auto-rearrange silently.** The human owns the canvas; you absorb their edits, you don't reformat them without permission.
- Run the lint and record results in the handoff doc.
- If lint surfaces overlap, below-50%-gap, `out-of-bounds`, or `page-aspect` violations introduced by human edits, do not mark the design `design-ready-for-review`. Halt with `NEEDS_CONTEXT` and ask for one of:
  - permission to normalize the scoped page in a follow-up `revise` pass using the placement contract above, or
  - confirmation that the human will clean up the canvas before re-dispatch.
- An `out-of-bounds` screen is hidden from the Approver: list it first in `## Human Edit Reconciliation Notes` so it is not missed. Do not move it.
- If lint surfaces only minor below-floor warnings, flag them in `## Human Edit Reconciliation Notes` and proceed only when the changed frames remain easy to inspect.

### `import` mode (read existing Figma → produce handoff, never write Figma)

- This skill is **read-only** in import mode — the designer doesn't write Figma in import mode.
- Run the lint and record results in handoff doc + as `docs/open-issues.md` entries with category `figma-canvas-lint-gap` for any violations.
- Violations in `import` mode do NOT block the handoff (the kit's brownfield-onboarding flavor — document what exists, gaps are for Stage 4 confirmation). Approver decides whether to commission a `revise` pass to clean up.

## Hard rules

- **No frame overlap is allowed at handoff time** in `create` / `revise` / `incorporate` modes. (`import` mode is exempt — flagged but not blocking.)
- **No newly created or revised screen frame may be left at the default origin or stacked over another frame.** Every touched frame gets explicit `x` / `y` coordinates derived from the placement contract.
- **Every screen frame is fully inside its parent Section** (absolute-bounding-box containment). Children are positioned in parent-local coordinates after `appendChild`; Sections are resized to fit their children. `out-of-bounds` blocks handoff in writing modes.
- **Sections are placed on the Rule 4 grid** with a computed column count (~16:10 page). Page aspect outside 1:3–3:1 with ≥ 4 Sections blocks handoff in writing modes.
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
