---
name: figma-srs-mapping
description: How to scan a Figma file provided in the SRS and produce a structured mapping of Figma frames/layers to SRS surfaces (User Stories + FRs). Consult when UI/UX Designer is in `map` mode — invoked by BA Phase 1.X pre-sign-off when a Figma URL is present in the requirements. Mapping qualifies designs BEFORE SRS sign-off so FE work is never blocked on design review later.
agents: [ui-ux-designer]
sdlc_phase: pre-design
owner: Platform Eng
status: active
---

# Figma → SRS Mapping

## When to use

You are the UI/UX Designer in `map` mode. BA Phase 1.X detected a Figma URL in the requirements and dispatched you BEFORE SRS sign-off. Your job is to verify that the existing Figma file already covers the SRS scope — produce a structured mapping, identify gaps, and qualify the design at sign-off time so the design lifecycle short-circuits when FE work later begins.

This skill replaces the old "Designer dispatch happens after sign-off" flow for the Figma-provided case (Design-Flow A per `.claude/rules/parallel-execution.md` §4). The post-sign-off lifecycle still applies for Design-Flow B (no Figma → agent designs) and Design-Flow C (no Figma → agent + human edits) — see those modes\' respective procedures.

## Inputs and outputs

**Inputs:**
- The Figma URL (file-level link, or a frame-level URL) passed in the dispatch.
- SRS `## Design References` section listing UI surfaces — typically one row per User Story whose `track: fe` or `track: be+fe` and per FR with a UI surface.
- SRS `## User Stories` index — for the canonical surface names.
- Read-only Figma MCP access.

**Outputs:**
- New artifact: `docs/uiux/figma-mappings/v<srs-version>.md` — the structured mapping table + gap list + qualification status.
- Updated SRS `## Design References` — every matched surface now has its `Node-ID:` pinned.
- A `Mapping-Status:` flag in the artifact header that BA Phase 2 sign-off checks: `qualified` (all SRS surfaces matched, no gaps), `gaps` (surfaces missing in Figma — SRS sign-off blocked), or `orphans-only` (Figma has extras, no surfaces missing — SRS may sign-off, BA documents the orphans for PM disposition).

**You never write to Figma in `map` mode.** Read-only. If gaps exist, they surface as Open Questions for the PM/Approver to resolve — by adding screens to Figma, by reducing SRS scope, or by re-dispatching you in `create` mode (post-sign-off) for the missing surfaces.

## Procedure

### Step 0 — Page-scoping (resolve `Figma-Design-Page-Node-ID`)

A Figma FILE has multiple PAGES (top-level tabs). The kit's mapping MUST scope to ONE page per Figma file — without page-scoping, the enumeration would walk every page (brainstorms, old designs, design-system Foundation, the project's design, etc.) and mix in irrelevant frames OR miss the project design entirely.

For each `Figma-File-URL` in SRS §3.4.1:

1. Read the paired `Figma-Design-Page-Node-ID` value (BA Phase 1.X step 10 captured this from the URL's `?node-id=` parameter OR from operator NEEDS_CONTEXT answer).
2. Verify the captured value via Figma MCP:
   - **Captured value is a PAGE node** (Figma type: `CANVAS` / `PAGE`) → use as the root.
   - **Captured value is a FRAME or SECTION node** (PM deep-linked to a frame) → walk UP via parent-pointer to the containing PAGE node. Record the resolution in the mapping artifact's `## Page-scope resolution` section. Update SRS §3.4.1 `Figma-Design-Page-Node-ID` to the resolved page Node ID (your write access to SRS is limited to this single field and the `Figma-Design-Page-Name` companion; do NOT touch SRS body content).
   - **Captured value is a PAGE NAME string** (operator answered with the name rather than the ID) → query Figma MCP for pages in the file; match case-insensitive trimmed; record the resolved Node ID in §3.4.1. If no match → halt with `NEEDS_CONTEXT` listing the actual page names available.
3. Steps 2-6 below enumerate ONLY the subtree under the resolved page node. Frames on other pages are out of scope.

### Step 1 — Enumerate SRS surfaces

Read the SRS sections:
- `## User Stories` — every US with `track: fe` or `track: be+fe`. Pull the US ID, the Story title, and the canonical screen name.
- `## FRs` — every FR with a UI surface (look at `Linked Component:` and the FR body for screen references).
- `## Design References` (§3.4.1) — any pre-existing surface rows.

Build a normalized list with columns: SRS Surface ID, Source path, Canonical Name, Variants Expected. The "Variants Expected" column comes from the User Story\'s Acceptance Scenarios (Given/When/Then states) and the FR\'s Error Handling rows — they tell you which states the design must cover.

### Step 2 — Enumerate Figma frames (scoped to the resolved page)

**Scope:** walk only the subtree rooted at the page Node ID resolved in Step 0. Frames on other pages of the same Figma file are out of scope.

Use Figma MCP to fetch the file structure:
- File-level metadata: `name`, `lastModified`, `version` (capture for the artifact header).
- All top-level Frames and Sections on the canvas. Walk into Sections one level deep — group their child frames under the Section name.
- For each frame: `id` (Node ID), `name`, `width × height`, presence of Auto Layout (Y/N), variant set membership (Y/N + variant property names).
- Skip Components and ComponentSets at this stage — they\'re design-system primitives, not screen-level surfaces.

### Step 3 — Match frames to surfaces

For each SRS surface (Step 1), find its Figma match:

1. **Exact name match.** Surface "Login screen" ↔ frame "Login screen" or "01 - Login" or "Login". Strip ordering prefixes (`01 - `, `1. `), normalize case, normalize separators.
2. **Synonym/fuzzy match.** Surface "Dashboard" ↔ frame "Home". Surface "Settings" ↔ frame "Preferences". When fuzzy-matching, mark `matched-fuzzy` and **list under "Decisions awaiting human confirmation"** — the Approver confirms or rejects each.
3. **Variant-set match.** A single Figma variant-set may cover multiple SRS surfaces if the variants represent distinct states the SRS lists separately. Capture the variant-set node ID + the specific variant nodes used.
4. **No match.** Surface has no Figma frame. This is a gap — file under "SRS surfaces without Figma match" with severity = `blocking`.

In parallel, identify **orphans**: Figma frames with no SRS surface match. These may be (a) out-of-scope screens, (b) scratch frames, or (c) screens that SHOULD be in the SRS but were missed by the PM. The mapping lists them; the Approver decides their disposition during BA Phase 2.

### Step 4 — Qualification check

A matched frame must pass these criteria:

- **Auto Layout present.** Frames without Auto Layout produce brittle FE implementations; mark `unqualified` if absent.
- **Variants cover the SRS surface\'s required states.** Compare against the "Variants Expected" column from Step 1.
- **Frame name is consistent.** kebab-case or "NN - Name". Flag inconsistencies but don\'t block qualification on them.
- **Component references resolve.** Components must exist in the same file or via published library link.
- **Reasonable canvas layout.** Run the `figma-canvas-layout` skill\'s overlap lint. Warns but doesn\'t block.

### Step 5 — Write the mapping artifact

Path: `docs/uiux/figma-mappings/v<srs-version>.md`. One mapping per SRS version.

Schema (header + tables):

```
# Figma → SRS Mapping  ·  SRS v<N>

- SRS-Version: <N>
- SRS-Hash: <sha256-prefix of docs/SRS.md>
- Figma-File-URL: <url>
- Figma-Design-Page-Node-ID: <page-node-id used as enumeration root>
- Figma-Design-Page-Name: <human-readable page name>
- Figma-File-Version: <captured via MCP>
- Figma-Last-Modified: <ISO>
- Generated-At: <ISO>
- Generated-By: ui-ux-designer (map mode)
- Mapping-Status: qualified | gaps | orphans-only
- Last-Confirmed: TBD  (filled when Approver confirms during BA Phase 2)

## Mapping Table
| SRS Surface | US/FR ID | Figma Frame | Node ID | Auto-Layout | Variants Match | Status |
|---|---|---|---|---|---|---|
| Login screen | US-001 | "01 - Login" | 1:23 | yes | full | qualified |
| Dashboard | US-002 | "02 - Home" | 1:45 | yes | partial (empty-state missing) | gap-variant |
| Forgot password | FR-008 | (missing) | — | — | — | gap-surface |

## Gaps

### SRS surfaces without Figma match (BLOCKING sign-off)
- **FR-008 Forgot password** — no frame found. Resolution required.

### SRS surfaces with partial variant coverage (NON-BLOCKING — surface as OQ)
- **US-002 Dashboard** — empty-state variant missing.

### Figma frames without SRS match (informational)
- **"Admin Panel"** (Node 1:99) — orphan; PM disposition pending.

## Decisions awaiting human confirmation
- **US-005 Settings → "07 - Preferences"** (matched-fuzzy) — same screen?

## Qualification check
- [x] Auto Layout on every matched frame
- [ ] All SRS surfaces matched — 1 blocking gap (FR-008)
- [ ] All required variants present — 1 partial coverage (US-002)
- [x] Canvas layout passes overlap lint

**Mapping-Status: gaps** — SRS sign-off blocked until FR-008 resolved.

## SRS §3.4.1 update applied
| SRS Surface | Node ID | Frame URL |
|---|---|---|
| US-001 Login | 1:23 | <url> |
```

### Step 6 — Update SRS §3.4.1

For every matched surface, write the Node ID + frame URL back to `docs/SRS.md` `## Design References`. The SRS row gains an additional `Mapping-Status: matched | matched-fuzzy | gap-surface | gap-variant` column.

For unmatched surfaces, leave the Node ID blank and add a `Mapping-Status: gap-surface` cell. BA Phase 1.X raises these as Open Questions.

### Step 7 — Return outcome

Emit `plan-update.json` with `agent: ui-ux-designer`, `dispatch_mode: map`, `mapping_status: <qualified|gaps|orphans-only>`. The Orchestrator reads this and either (a) lets BA proceed to sign-off when `qualified`, (b) blocks sign-off and surfaces the gaps when `gaps`, or (c) lets sign-off proceed with PM disposition notes when `orphans-only`.

## Hard rules specific to `map` mode

- **Read-only against Figma.** No modifications. Gaps route via SRS Open Questions, never via inline Figma edits.
- **One mapping per SRS version.** When SRS revs (Phase 1.Z iteration), re-run `map` and produce a new `v<n>` file. Old mappings stay for audit.
- **Mapping-Status: gaps blocks SRS Status: Signed-off.** BA Phase 2 reads the artifact and refuses to flip Status if `gaps` is present.
- **Fuzzy matches require Approver confirmation before sign-off.** BA Phase 2 surfaces them as NEEDS_CONTEXT; Approver confirms or rejects each.
- **Orphans never block sign-off.** PM disposes during BA Phase 2 — accept as out-of-scope (logged in SRS §10 Changelog) or add as a new US (restarts BA Phase 1).
- **You do not create surfaces in `map` mode.** Missing surfaces go in the gap list. Creation comes only via post-sign-off Design-Flow B or C with explicit user confirmation.

## Cross-references

- `.claude/agents/_templates/ui-ux-designer.md` — UI/UX Designer mode router
- `.claude/skills/ui-ux-page-scoping/` — mandatory page scoping before mapping
- `.claude/rules/parallel-execution.md` §4 — Design-Flow A/B/C overview
- `.claude/agents/_templates/ba.md` — Phase 1.X Figma detection + Phase 2 mapping-gate
- `.claude/skills/figma-canvas-layout/SKILL.md` — overlap lint used in Step 4
- `.claude/agents/_templates/_artifacts/srs-template.md` — `Design-Flow:` header field, §3.4.1 schema
