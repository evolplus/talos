---
name: design-system-author
description: How to build a Figma Foundation page (design tokens + reusable components) BEFORE drawing screens, so spacing / text sizes / button styles / element alignment stay consistent across every surface. Consult on every UI/UX Designer dispatch (create / revise / import / incorporate). Pre-handoff token-compliance lint mandatory in every mode.
agents: [ui-ux-designer]
sdlc_phase: design
owner: Platform Eng
status: active
---

# Design System Author

## When to use

You are the UI/UX Designer authoring or revising Figma content via MCP. Without a shared Foundation, every screen invents its own spacing scale (16px here, 12px there), text sizes (18pt vs 20pt for the same role), button radii (8px vs 12px), and alignment grid — drift compounds across screens and the Approver sees visual chaos at confirmation time. This skill is the **content-hygiene** complement to [`figma-canvas-layout`](../figma-canvas-layout/SKILL.md) (canvas-hygiene): same pre-handoff lint pattern, different concern.

Consult this skill:

- **In every Figma-writing mode** (`create` / `revise` / `incorporate`) — apply the Foundation tokens, never invent ad-hoc values.
- **In `import` mode** — extract what tokens already exist in the file; flag gaps as `figma-design-system-gap` open-issues.
- **As a pre-handoff lint** — every mode, every dispatch.

## Inputs and outputs

- **Inputs:** SRS §3.4.1 Design References (UI surfaces), SRS `## Design System` or brand-guidance section if present, the Figma file you're writing to via MCP.
- **Outputs:** A `Foundation` Figma page (separate Figma page tab) containing tokens + components; every other page's frames consume from Foundation; an updated `docs/uiux/handoffs/<task-id>.md` enumerating tokens used; a pre-handoff token-compliance lint report appended to the handoff doc.

## The Foundation page

Every Figma file the kit produces has a dedicated **Foundation** Figma page (separate page tab, NOT a section on a screens page). The Foundation page is the single source of truth for tokens + components. Screen pages reference it; screens never define their own colors, type styles, or spacing values.

Foundation is structured as five Figma sections. **Before authoring those sections from scratch**, run the Foundation-source selection step below — most projects inherit from a named preset, while Flow A projects may derive the Foundation from extracted Figma evidence.

### Step 0 — Foundation source selection (run BEFORE any of Sections 1-5)

The kit ships a catalog of named presets at `references/presets/<slug>/`. Each preset is a pre-authored Foundation: tokens, type scale, component minimum set, layout grid. For Design-Flow A, the SRS may instead declare `Design-Guideline: from-figma`, meaning the existing Figma file itself is the Foundation source and the Designer must build or audit against the design-extracted token evidence.

#### Procedure

1. **Read the SRS header.** `docs/SRS.md` declares the chosen Foundation source in the `Design-Guideline:` field (set by BA Phase 1.X step 10b at sign-off time). Possible values:
   - A preset slug → e.g., `modern-saas-admin`, `ios-consumer`, `default`.
   - `from-figma` → Design-Flow A extracted the design guideline from the provided Figma file. Build/audit Foundation from `docs/requirements/design-extracted/<figma-file-id>-*.md` Section 6.
   - `none` → no preset; author Foundation from the SKILL.md defaults (Sections 1–5 below).
   - Missing field → halt with `NEEDS_CONTEXT` and ask the Orchestrator to dispatch BA Mode D to set the field. Do NOT pick a preset unilaterally; the choice is BA + operator territory.

2. **If `Design-Guideline: from-figma`, load extraction evidence.** Read the latest `docs/requirements/design-extracted/<figma-file-id>-*.md` for each Figma URL in SRS §3.4.1 and extract `## Section 6 — Design guideline extraction (Flow A)`:
   - Use formal Figma styles/variables/components first when Section 6 identifies them.
   - When no formal styles exist, use medium/high-confidence repeated values from Section 6 as token candidates.
   - Build Sections 1–5 from the extracted palette, typography, spacing, radius, elevation/effects, component patterns, and layout grid evidence.
   - Preserve numeric values from the extraction. Do not "round" a 6px radius to 8px or convert a 20px spacing value to 24px unless the handoff explicitly records it as a fallback/deviation.
   - If a required token category is absent, fill the missing category from SKILL.md defaults and record the fallback in `## Design System Source` and `## Foundation Changes`.
   - If Section 6 is missing, low-confidence, or contradictory, halt with `NEEDS_CONTEXT`; do not silently switch to a preset.

3. **If a preset slug is declared, load the preset.** Read every file under `.claude/skills/design-system-author/references/presets/<slug>/`:
   - `preset.md` — when-to-use, dos / don'ts (apply throughout your authoring).
   - `tokens.json` — color + spacing + radius + elevation + motion + z-index tokens. **Apply these values verbatim to the Figma Foundation page's Sections 1, 3, 4 — do NOT invent your own values.**
   - `typography.md` — type scale + font stack + rules. **Apply to Section 2.**
   - `components.md` — required component set + variants + states + preset-specific additions. **Apply to Section 5.**
   - `layout-grid.md` — column system + breakpoints + container widths + vertical rhythm rules. **Apply to your page-level layouts and document in `## Foundation Changes` if you need to deviate.**

4. **Honour source-specific rules.** `preset.md` carries Dos / Don'ts for preset sources; Section 6 carries source evidence and gaps for `from-figma`. These ARE Foundation rules — bake them into your component variants + screen authoring. Example: a preset may forbid `text-transform: uppercase`; a `from-figma` extraction may show all cards use 12px radius and 24px internal padding. Both are enforced via the lint at Step 3 below.

5. **Note deviations explicitly.** If the SRS implies a Foundation value that conflicts with the declared Foundation source (e.g., SRS §3.4.1 specifies a custom brand color), document the deviation in the handoff doc's `## Foundation Changes` section. Do NOT silently override the source; the explicit annotation lets FE Dev + QA-Author know which values are preset-stock, Figma-extracted, or project-customized.

#### When to clone a preset

If the project consistently diverges from its declared preset on >3 token values, the cleaner long-term move is to clone the preset to a new slug:

1. `cp -r references/presets/<parent>/ references/presets/<new-slug>/`.
2. Edit the new preset's `preset.md` § Provenance to cite the parent + diff summary.
3. Apply the changes only to the new preset.
4. Re-dispatch BA Mode D to update SRS `Design-Guideline:` to the new slug.
5. Append the new preset to `.claude/skills/registry.md` § Design Guidelines.

Cloning preserves the parent for other projects and lets this project diverge cleanly. Avoid editing the shared preset in place for project-specific reasons.

#### When the preset is `none`

If `Design-Guideline: none`, author Foundation from the SKILL.md defaults below (Sections 1–5). Document in the handoff that no preset applies — FE Dev + QA-Author then derive tokens from your authored Foundation directly, not from any preset path.

#### When the guideline is `from-figma`

If `Design-Guideline: from-figma`, the Flow A design-extracted file is the source of truth. Build or audit the Foundation from its Section 6 token evidence:

- Colors, typography, spacing, radius, elevation/effects, component patterns, and layout grid values come from the extracted Figma evidence.
- The handoff `## Design System Source` section must cite the exact extraction artifact path, Figma version, and confidence level for every token category.
- Missing token categories use SKILL.md defaults only as explicit fallbacks. Each fallback is recorded so FE Dev and QA-Author know which values are extracted vs synthesized.
- If the live Figma file has drifted from the extracted evidence, halt with `NEEDS_CONTEXT` and ask whether to re-run `figma-requirements-extraction` before authoring.

---

### Section 1 — Color tokens

Define named colors as Figma color styles. Two layers:

- **Primitives** — raw color values (e.g., `gray-50`, `gray-100`, ..., `gray-900`; `blue-500`; `red-500`). Don't use primitives directly in screens.
- **Semantic** — purpose-bound aliases referencing primitives (e.g., `text-primary` → `gray-900`; `text-secondary` → `gray-600`; `surface-default` → `white`; `accent-brand` → `blue-500`; `state-error` → `red-500`; `state-success` → `green-500`; `border-default` → `gray-200`). Screens consume semantic tokens only.

Why two layers: changing the brand color updates `accent-brand`'s primitive reference once; every screen that consumes `accent-brand` updates automatically. Direct-primitive consumption defeats this.

### Section 2 — Typography tokens

Define named text styles as Figma text styles. Default scale (modular ratio 1.250, 16px base):

| Name | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `heading-xl` | 48px | 700 | 56px | Page-hero title |
| `heading-lg` | 32px | 700 | 40px | Section title |
| `heading-md` | 24px | 600 | 32px | Card title |
| `heading-sm` | 20px | 600 | 28px | Inline group title |
| `body-lg` | 18px | 400 | 28px | Lead paragraph |
| `body-md` | 16px | 400 | 24px | Default body text |
| `body-sm` | 14px | 400 | 20px | Secondary text, captions |
| `label-md` | 14px | 600 | 20px | Form label, button text |
| `label-sm` | 12px | 600 | 16px | Tag, badge, micro-label |
| `code-md` | 14px | 400 | 20px | Monospace inline code |

Pair with a defined font family (e.g., Inter for body, system monospace for code). Document the family name in Section 2.

### Section 3 — Spacing tokens

Define named spacing values as a 4pt baseline scale (override to 8pt if SRS's design system mandates):

| Name | Value | Use |
|---|---|---|
| `space-0` | 0 | Flush edges |
| `space-1` | 4px | Tight inline gap (icon + label) |
| `space-2` | 8px | Default inline gap |
| `space-3` | 12px | Form field internal padding |
| `space-4` | 16px | Default block gap |
| `space-5` | 24px | Section gap |
| `space-6` | 32px | Major section gap |
| `space-7` | 48px | Hero / page top |
| `space-8` | 64px | Page-level separator |
| `space-9` | 96px | Rarely used (landing pages only) |

All paddings, margins, gaps in screen frames MUST use one of these values. Off-scale values (e.g., 15px, 22px) fail the lint.

### Section 4 — Other tokens

| Token type | Default values |
|---|---|
| **Border radius** | `radius-none` 0, `radius-sm` 4px, `radius-md` 8px, `radius-lg` 12px, `radius-full` 9999px (pills) |
| **Elevation / shadow** | `elevation-none`, `elevation-sm` (1dp), `elevation-md` (3dp), `elevation-lg` (8dp), `elevation-xl` (16dp) — RGB shadow values defined per token |
| **Motion / duration** | `motion-instant` 0ms, `motion-fast` 150ms, `motion-default` 250ms, `motion-slow` 400ms |
| **Z-index layers** | `z-base` 0, `z-dropdown` 100, `z-sticky` 200, `z-modal` 1000, `z-toast` 2000 (document only; Figma doesn't render z but the values are needed by FE Dev) |

### Section 5 — Component library

Build the reusable components as Figma components (the actual master components, not instances). Required minimum set:

- **Button** — variants: primary / secondary / tertiary / destructive; sizes: sm / md / lg; states: default / hover / active / disabled / loading
- **Input** — variants: text / email / password / number / search; states: default / focused / error / disabled; sub-elements: label / helper-text / error-text
- **Card** — variants: default / interactive / selected; with header / body / footer slots
- **Modal** — header / body / footer; sizes: sm / md / lg
- **Nav** — top nav variant + side nav variant (if SRS platform implies)
- **List item** — default / interactive / selected states
- **Form field** — composed of Input + label + helper + error (one component that wraps these to enforce form-field spacing)
- **Avatar** — sizes: sm / md / lg / xl; states: image / initials / placeholder
- **Badge / Tag** — variants: neutral / info / success / warning / error
- **Icon** — placeholder component for icon-set integration (FE Dev imports the actual icon library)

Each component MUST:
1. Consume tokens (color / typography / spacing / radius / elevation) — never hardcode.
2. Use Figma auto-layout — components resize predictably when content changes.
3. Have all variants defined as Figma component variants (not separate components).
4. Have all states explicitly modeled (don't infer hover/active from the same default frame).
5. Be named `Feature-Agnostic-Component-Name` (e.g., `Button`, `Card`, NOT `SpectatorButton`).

## Procedure by mode

### `create` mode (greenfield)

1. **Run Foundation-source selection (Step 0 above) FIRST.** Read SRS `Design-Guideline:`; load the preset or `from-figma` extraction evidence; halt if the field is missing.
2. **Build Foundation page.** Populate all five sections from the chosen preset's reference files, the Flow A extraction evidence, or the SKILL.md defaults when `Design-Guideline: none`. Do NOT mix source tokens with ad-hoc values; deviations go to `## Foundation Changes` in the handoff doc.
3. **Build the component library** in Section 5 — at minimum the components the linked SRS US-IDs imply. Preset sources use `components.md`; `from-figma` sources use Section 6 component pattern evidence plus the required component minimum set below.
4. **Then draw screens** that consume from Foundation. Every text element references a typography token; every color element references a semantic color token; every gap/padding references a spacing token; every interactive element is an INSTANCE of a Foundation component, not a standalone copy.
5. **Run the token-compliance lint** before handoff (see below). The lint cross-checks tokens used in screens against the declared Foundation source — off-source values fail unless documented in `## Foundation Changes`.

### `import` mode (existing Figma → read-only handoff produce)

1. **Run Foundation-source selection (Step 0 above) FIRST.** Read SRS `Design-Guideline:`; load the preset or `from-figma` extraction evidence for comparison. (Don't mutate Figma — source-load is read-only here too.)
2. **Inventory existing tokens** in the file. Look for Figma color styles, text styles, effect styles, named components.
3. If a Foundation page exists → document its contents in the handoff doc `## Design System Inventory` section. Diff its values against the loaded source. Off-source values become `figma-design-guideline-divergence` entries in the handoff lint (non-blocking in `import` mode but visible).
4. If NO Foundation page exists OR tokens are sparse → file an open-issue with category `figma-design-system-gap` describing what's missing relative to the declared source. Do NOT auto-create a Foundation page in `import` mode (read-only against Figma).
5. **Run the token-compliance lint** — flag every hardcoded color/text-size/spacing in the screens as `non-tokenized-value` entries in the handoff doc.
6. Lint violations in `import` are non-blocking (brownfield-onboarding flavor — document what exists, don't fix unilaterally).

### `revise` mode (BA Phase 3 returned unqualified)

1. **Apply existing Foundation tokens** to the revised frames. If a revision needs a NEW token (a color or spacing not in Foundation):
   - Add the token to Foundation FIRST.
   - Then use it in the screen.
   - Note the addition in handoff doc `## Foundation Changes`.
2. Do NOT mass-refactor unrelated existing screens that already use off-token values — that introduces churn the Approver hasn't asked for. File `figma-design-system-gap` open-issues for those, but limit the revise scope to what was asked.
3. **Run the token-compliance lint** on the revised frames. Block handoff if your own revisions introduced new hardcoded values.

### `incorporate` mode (human edited Figma between handoff and confirmation)

1. **Do NOT auto-refactor** human-authored frames into the Foundation system. The human owns the canvas.
2. **Run the token-compliance lint** and record results in `## Human Edit Reconciliation Notes`. If the human introduced new ad-hoc values, flag in handoff doc + raise an open-issue. Approver decides whether to commission a `revise` pass to align.

## Pre-handoff token-compliance lint

Run this procedure BEFORE flipping the design sub-status to `design-ready-for-review`. Pairs with the `figma-canvas-layout` lint — both must pass.

### Step 1 — Enumerate Foundation

Via Figma MCP, list every named color style, text style, effect style, and component master on the Foundation page. Capture the value of each.

### Step 2 — Scan screen frames

For every frame on every non-Foundation page, walk every leaf node (text nodes, rectangles, frames, instances) and capture:

- Color fills + strokes → does each reference a named color style? Or is it a raw hex?
- Text styles → does each text node use a named text style? Or is it raw font-size + weight?
- Paddings, margins, item-spacing in auto-layout → are they one of the spacing-scale values? Or off-scale?
- Border radii → are they one of the radius tokens? Or raw px?
- Are interactive elements (buttons, inputs, cards) INSTANCES of Foundation components, or standalone copies?

### Step 3 — Compute violations

For each value that's NOT token-referenced, record:

- `non-tokenized-color` — raw hex used instead of color style
- `non-tokenized-typography` — raw font-size/weight instead of text style
- `non-tokenized-spacing` — value not in the spacing scale (use a 1-unit tolerance for 1px rounding artifacts)
- `non-tokenized-radius` — raw px not matching a radius token
- `non-component-button` (or input, card, modal) — standalone frame that LOOKS like a Foundation component but isn't an instance of one
- `missing-state` — a button or input rendered in default state but no hover/active/disabled variant defined in Foundation

For each visual-quality rule (Rules A–F above), also record:

- `button-text-misalignment` — button instance's auto-layout is NOT `align-items: center` + `justify-content: center` (Rule A.1)
- `padding-asymmetry` — container has `padding-left != padding-right` OR `padding-top != padding-bottom` without documented exception (Rule A.3)
- `touch-target-too-small` — interactive element's bounding box (including transparent hit area) is below platform minimum: 44×44 mobile, 32×32 web (Rule A.4)
- `form-field-spacing-wrong` — label→input gap, input→helper gap, or field→field gap not matching the prescribed spacing tokens (Rule B.1)
- `inconsistent-stroke-width` — screen has >2 unique non-zero stroke widths (Rule C.1)
- `inconsistent-shadow-direction` — screen has shadows with conflicting `offset.y` signs OR contradictory `offset.x` directions (Rule C.2)
- `mixed-iconography-style` — same screen context mixes line icons and filled icons (Rule C.3)
- `inner-radius-larger-than-outer` — nested element's corner radius is larger than its container's (Rule C.4)
- `missing-on-color` — text on a non-default colored surface uses a primitive color instead of a `text-on-*` semantic token (Rule D.1)
- `contrast-failure` — text-on-background contrast ratio fails WCAG AA threshold (Rule D.2)
- `missing-focus-indicator` — interactive Foundation component has no `focused` variant defined (Rule E.1)
- `disabled-treatment-wrong` — disabled element has hover effect OR uses default text color OR doesn't apply opacity/muted-color (Rule E.2)
- `hover-equals-active` — component's hover and active variants are visually identical (warning; Rule E.3)
- `empty-state-placeholder-only` — non-default state contains only `[Empty state]` text with no real content (warning; Rule E.4)
- `mixed-input-pattern` — screen mixes placeholder-as-label and always-visible-label patterns (Rule F.1)
- `mixed-required-indicator` — screen mixes required-field conventions (Rule F.2)
- `mixed-aspect-ratio` — list/grid context has images/videos with inconsistent aspect ratios (Rule F.3)

### Step 4 — Emit lint report

Append `## Token Compliance Lint` section to `docs/uiux/handoffs/<task-id>.md`:

```markdown
## Token Compliance Lint

- **Lint run:** <ISO-8601>
- **Foundation page state:** <present | missing | partial>
- **Frames audited:** <N>
- **Components audited:** <N>

### Foundation inventory

| Type | Count | Notes |
|---|---|---|
| Color styles | 24 | 9 primitives + 15 semantic |
| Text styles | 10 | Full default scale |
| Spacing tokens | 10 | 4pt baseline (space-0 through space-9) |
| Components | 12 | Button + Input + Card + Modal + Nav + ListItem + FormField + Avatar + Badge + Icon + Divider + Spinner |

### Violations (block handoff in writing modes)

| Type | Location | Detail |
|---|---|---|
| non-tokenized-color | Spectator/MatchList/Default → bg | Raw #2A4D7B; closest token `accent-brand` is #2E50A0 — author or alias? |
| non-tokenized-spacing | Spectator/MatchList/Default → CardRow gap | 14px; not on the 4pt scale (12 or 16 available) |
| non-component-button | Spectator/JoinFlow/Default → CTA | Looks like a button but isn't an instance of Foundation/Button |

### Visual quality violations (block handoff in writing modes)

| Type | Location | Detail |
|---|---|---|
| button-text-misalignment | Spectator/JoinFlow/Default → CTA | Button auto-layout uses `align-items: flex-start`; should be `center` |
| padding-asymmetry | Spectator/MatchList/Default → CardContent | padding-left=16, padding-right=12; should be equal pair |
| touch-target-too-small | Spectator/MatchList/Loading → CloseIcon | 16×16 with no transparent hit padding; needs 44×44 total on mobile |
| inconsistent-stroke-width | Spectator/JoinFlow/Default | 3 unique stroke widths found (1px, 1.5px, 2px); pick one |
| contrast-failure | Spectator/MatchList/Empty → BodyText | `text-secondary` on `surface-default`: 3.8:1 < AA 4.5:1 |
| missing-focus-indicator | Foundation/Components/ListItem (interactive variant) | No `focused` variant defined; required per WCAG 2.4.7 |
| missing-on-color | Spectator/MatchDetail/Default → HeaderTitle | White text on `accent-brand` surface; should use `text-on-brand` token |

### Visual quality warnings (Approver review)

| Type | Location | Detail |
|---|---|---|
| hover-equals-active | Foundation/Components/Button (secondary variant) | hover and active variants are pixel-identical; consider stronger active state |
| empty-state-placeholder-only | Spectator/MatchList/Empty | Contains only `[Empty state goes here]` placeholder; populate with illustration + headline + body + action |

### Warnings (foundation gaps)

| Type | Location | Detail |
|---|---|---|
| missing-state | Foundation/Components/Button | No `loading` variant defined; FR-001 implies async join — please add |
```

### Step 5 — Block or proceed

- **Violations present in `create` / `revise` / `incorporate` modes** → DO NOT flip to `design-ready-for-review`. Fix the violations (refactor frames to use tokens; add missing components to Foundation; replace standalone copies with instances) and re-run.
- **Violations in `import` mode** → record in handoff doc + file open-issues with category `figma-design-system-gap`; non-blocking.
- **Warnings only** → proceed; warnings appear in the handoff doc for the Approver's awareness.
- **Clean lint** → proceed to handoff.

## Visual quality rules

Token compliance is necessary but not sufficient. A button can have the right color, the right typography, the right padding values, and still look broken if the text isn't centered, the touch target is too small, or the focus indicator is missing. These are foundational graphic-design rules that AI agents and inexperienced humans routinely miss. The pre-handoff lint extends to check the rules below; the checkable ones are added to the violation/warning categories above, the subjective ones surface as warnings for human Approver review.

### Rule A — Component-internal alignment

**A.1 Button text centering.** Every button instance has its text centered both horizontally AND vertically inside the button bounds. In Figma terms: the button's auto-layout uses `align-items: center` + `justify-content: center` (centered on both axes). Buttons MUST NOT have text top-aligned, bottom-aligned, or left-aligned within their bounds. Long labels that wrap stay center-aligned horizontally and centered as a block vertically.

**A.2 Icon + text optical centering.** When a button has both icon and text:

- Icon precedes text by default (right-to-left locales mirror automatically via auto-layout).
- Gap between icon and text = `space-2` (8px) by default.
- Icon vertical center aligns with text vertical center — not bounding boxes. Glyphs with trailing whitespace or asymmetric profiles need manual nudge (1–2px) for optical centering; document any nudge in the component's notes.
- Icon size matches the text's line-height: 16px icon for `body-md`/`label-md` (line-height 20–24px), 20px icon for `body-lg`/`heading-sm`, etc.

**A.3 Padding symmetry.** Every container's padding follows the symmetric-pair rule:

- Horizontal: left padding == right padding (both `space-4`, both `space-5`, etc.).
- Vertical: top padding == bottom padding.
- Horizontal and vertical pairs may differ from each other (`16px H / 12px V` is fine), but each pair MUST be equal within itself.
- Exception: directional containers (a side panel flush to the scroll edge; a card with a header strip whose top padding is `space-3` while body padding is `space-4`) — document the asymmetry in handoff doc with explicit rationale.

**A.4 Touch target minimums.** All interactive elements meet platform minimums:

- Mobile (iOS / Android): **44 × 44 px** minimum tap target (per iOS HIG / Material).
- Web / desktop: **32 × 32 px** minimum interactive target; **44 × 44** recommended for primary actions and touch-screen laptops.
- If a visual element is smaller (e.g., a 16px close-icon), it MUST have a surrounding transparent hit area bringing the total to the platform minimum. The Foundation/Button component encodes this minimum per size variant; standalone interactive elements (text links, icon buttons not in the library) must follow the same rule.

### Rule B — Inter-element alignment

**B.1 Form field stacking.** Label, input, helper-text, error-text follow a fixed vertical rhythm:

- Label sits ABOVE the input with `space-2` (8px) gap.
- Helper-text or error-text sits BELOW the input with `space-1` (4px) gap.
- Between two adjacent form fields: `space-4` (16px) gap.
- Required-field indicator (see Rule F.2) appears AFTER the label text, not before, not above.
- All four elements (label / input / helper / error) left-align to the input's left edge.

**B.2 Baseline grid.** Adjacent text elements in different components should share a baseline grid. The baseline is the bottom of lowercase letters excluding descenders. Practical rule: vertical positioning uses the spacing scale (multiples of 4px on the kit default), which naturally lands on the baseline grid when paired with the typography scale's line-heights. Don't position text at arbitrary y-offsets; use auto-layout gaps from the spacing scale.

**B.3 Grouped element alignment.** Elements that belong to the same logical group share an alignment axis:

- Headline + sub-headline + body in a hero section: all left-align.
- List items: all left-align to a common left edge regardless of internal content variance.
- Card titles: align to the card's content-area left edge (respecting card padding); don't randomly indent.
- Numbered/bulleted list items: text left-aligns; markers float to the left of the text edge.

### Rule C — Visual consistency

**C.1 Stroke width consistency.** All strokes (borders, dividers, outlines) within a screen use the same width — typically **1px throughout**. Exceptions (an emphasis card with a thicker accent border; a focus ring) are deliberate and rare. Screens with more than 2 unique stroke widths fail the lint as a consistency violation.

**C.2 Shadow direction consistency.** All elevation shadows on a screen project in the same direction — typically down-and-slightly-right (`offset y > 0`, `offset x ≥ 0`) OR straight down (`y > 0, x = 0`). The implicit light source is consistent across the screen. Screens with shadows in conflicting directions (one drops down, another casts up; one rightward, another leftward) fail the lint.

**C.3 Iconography style consistency.** All icons in the same screen context use the same style:

- All line icons OR all filled icons (don't mix a line "home" icon with a filled "user" icon in the same nav).
- Same stroke weight across all line icons (1.5px or 2px throughout).
- Same corner-radius style (square ends vs rounded ends).
- Same level of detail (don't mix minimalist 16px icons with detailed 32px illustrations).

Different contexts MAY use different styles (e.g., minimal line icons for nav; filled icons for primary actions) — but within one context, stay consistent.

**C.4 Corner-radius coherence.** A container's outer corners and its inner elements' corners follow one of two rules:

- Same radius token throughout (card outer = `radius-md`, all inner pills also `radius-md`).
- Smaller-inside (card outer = `radius-md`, nested avatar = `radius-sm` OR `radius-full`).

Inner-larger-than-outer FAILS the lint — the inner element's corner visually clips the outer container, producing optical errors.

### Rule D — Color and contrast

**D.1 "On" semantic colors.** When text is placed on a non-default background, use the matching `text-on-*` semantic color:

- `accent-brand` background → `text-on-brand` text.
- `state-error` background → `text-on-error` text.
- `state-success` background → `text-on-success` text.
- Any custom colored surface → define and use a matching `text-on-<surface>` token.

Foundation MUST define these "on" colors explicitly per surface color. Inferring "probably white" without defining it leads to inconsistent contrast — and silent drift when the underlying brand color changes.

**D.2 WCAG contrast baselines.** All text-on-background combinations meet WCAG 2.1 AA:

- Body text (under 18pt regular, under 14pt bold): contrast ratio ≥ **4.5:1**.
- Large text (18pt+ regular, 14pt+ bold): contrast ratio ≥ **3:1**.
- Non-text UI elements (button borders, input strokes, focus rings, icon glyphs that convey meaning): contrast ratio ≥ **3:1** against the adjacent surface.

The lint computes contrast for every text-on-color-fill pair via the WCAG luminance formula and flags failures. Disabled-state text is exempt from contrast requirements per WCAG SC 1.4.3 (its purpose is to look not-actionable), but disabled-state text must still meet 3:1 for legibility recommendation.

### Rule E — State coverage and quality

**E.1 Focus indicators.** Every interactive element has a visible focus indicator — required for keyboard navigation (WCAG 2.1 SC 2.4.7). Indicator options:

- Outline / ring around the element (2px solid `accent-brand`, offset 2px).
- Background-color change to a focus-tone token.
- Underline (for inline links).

The indicator MUST meet **3:1 contrast** against the adjacent surface (WCAG 2.1 SC 1.4.11). Foundation/Button, Input, Card-interactive, etc. all carry a `focused` variant; instances inherit it. Elements without a focus variant FAIL the lint as `missing-focus-indicator`.

**E.2 Disabled treatment.** Disabled state uses ONE of:

- Reduced opacity (40–50% of default).
- A muted semantic color (e.g., `text-disabled`, `surface-disabled` defined in Foundation).

Plus:

- NO hover effect on disabled elements (hover variant doesn't apply when state is disabled).
- Cursor: `not-allowed` (documented in component notes; FE Dev applies in CSS).
- Optional: a tooltip explaining why the element is disabled — strongly recommended for primary actions.

**E.3 Active vs hover distinction.** Active state (current page, selected item, pressed button) and hover state (mouse over) are visually DISTINCT. Common patterns:

- Hover: subtle lighten (e.g., 4–8% lighter) OR a `surface-hover` token.
- Active: stronger weight — accent-brand fill, bolder text, or `surface-active` token.

Don't merge them (showing the same color for hover and active confuses keyboard / accessibility users about what's selected vs what they're pointing at). The lint flags components where `hover` and `active` variants are visually identical as a warning.

**E.4 Empty / loading / error state content quality.** When designing a non-default state, populate it with realistic, useful content:

- **Empty state:** illustration or icon (40–80px) + headline (`heading-sm`, e.g., "No matches scheduled yet") + body (`body-md`, one sentence of context, e.g., "Tournaments resume Monday at 7pm SGT") + primary action (`Button` instance, e.g., "Browse upcoming tournaments"). Don't just show "No data."
- **Loading state:** skeleton that matches the eventual content shape (header bar + 3 list-item skeletons), OR a centered spinner with `body-md` status text ("Loading matches…"). Don't leave the area blank.
- **Error state:** headline ("Couldn't load matches"), body (one sentence of cause when identifiable, "Network unavailable"), retry action ("Try again"). If the error is permanent (e.g., 404), provide a navigation action instead ("Back to home").

These are content-quality judgments — the lint flags as **warnings** (not blocking) when a non-default state contains only a placeholder ("[Empty state goes here]") with no real content. Approver-judgment-required.

### Rule F — Pattern consistency

**F.1 One input pattern across the file.** Pick one and apply uniformly:

- **Placeholder-as-label:** placeholder text shows the field name; on focus, the placeholder shrinks to a floating label above the input.
- **Always-visible label above input:** label is always rendered separately; placeholder shows example content ("e.g., user@example.com") OR is empty.

Don't mix. Document the choice in handoff doc.

**F.2 Required-field indicator.** Pick one convention across the file:

- **Asterisk after label:** "Email **\\***" with the asterisk in `state-error` red.
- **Inline "Required" label:** "Email *(required)*" with the parenthetical in `text-secondary`.
- **Invert the convention:** mark OPTIONAL fields instead, leaving required fields unmarked. Common for forms that are mostly-required.

Don't mix conventions within the file.

**F.3 Aspect-ratio consistency.** Within a list/grid context, all images or videos use the SAME aspect ratio. Choose from common ratios (1:1, 4:3, 16:9, 3:4, 2:3) and apply uniformly. Mixed aspect ratios in the same list fail the lint.

**F.4 Card / list-item internal padding.** Within a single screen, all cards (or all list items) use the same internal padding values. Don't have one card with `space-4` padding and another with `space-5`. The Foundation/Card component encodes the standard; instances inherit.


## Override path: project-specific design system

The defaults above (4pt grid, modular type scale, 10-step color primitives) are sensible starting points. When the SRS has a `## Design System` section or brand guidance specifying different values:

- SRS-specified scales override the defaults verbatim. Do NOT mix (don't add a 5px spacing token because the SRS's 4-8-12-16 scale "should have one").
- SRS-specified colors override Section 1 primitives + semantic aliases.
- SRS-specified type family overrides the default Inter recommendation.
- SRS silence on a token category → use the kit defaults.

Document the source of every Foundation decision in handoff doc's `## Design System Source` section:

```markdown
## Design System Source

| Token type | Source | Notes |
|---|---|---|
| Colors (primitives + semantic) | SRS §Design System §Brand Palette | 9 brand colors specified; semantic aliases mapped per kit defaults |
| Typography | Kit defaults (Inter, modular 1.250) | SRS did not specify; using defaults |
| Spacing | Kit defaults (4pt scale) | — |
| Radius | SRS §Design System (radius-md = 6px override) | — |
| Elevation | Kit defaults | — |
```

## Hard rules

- **Foundation page is mandatory in `create` mode** before any screen is drawn. The kit refuses handoffs from `create` mode that have no Foundation.
- **No hardcoded values in screen frames.** Every color, text, spacing, radius is token-referenced or component-instance-based. Lint enforces.
- **Components must include all states.** A Button with only a default frame fails the lint (`missing-state` warning) — define hover/active/disabled/loading as Figma component variants.
- **Foundation comes first; new tokens come BEFORE use.** Never paste a one-off value in a screen "to come back and tokenize later" — add to Foundation FIRST, then consume.
- **`import` mode is read-only against Figma.** Document gaps; don't unilaterally restructure someone else's file.
- **Foundation tokens use semantic naming, not feature names.** `Button` not `SpectatorButton`; `accent-brand` not `accent-spectator`. The library is feature-agnostic.
- **Visual quality rules A–F apply to every screen.** Button text centered H/V, padding symmetric, touch targets meet platform minimums, form fields stack with prescribed gaps, stroke widths consistent, shadow directions consistent, icons same style in same context, inner-radius ≤ outer-radius, `text-on-*` tokens used on colored surfaces, WCAG AA contrast met, focus indicators present, disabled treatment correct, hover ≠ active, empty/loading/error states populated with real content, one input pattern, one required-field convention, consistent aspect ratios. The pre-handoff lint enforces the checkable subset; the subjective subset surfaces as warnings for Approver review.

## References

- [`.claude/skills/figma-canvas-layout/SKILL.md`](../figma-canvas-layout/SKILL.md) — sibling skill (canvas hygiene); both lints run pre-handoff in every mode.
- [`.claude/agents/_templates/ui-ux-designer.md`](../../agents/_templates/ui-ux-designer.md) — dispatching role.
- [`.claude/rules/parallel-execution.md`](../../rules/parallel-execution.md) §4 Design lifecycle — where Approver review happens.
- [`docs/uiux/handoffs/<task-id>.md`](../../../docs/uiux/handoffs/) — where the lint report + Foundation inventory + Design System Source sections land.
- [`docs/uiux/visual-specs/<task-id>.md`](../../../docs/uiux/visual-specs/) — QA-Author output; benefits from token-named values (e.g., spec rows say `space-4` instead of "16px give or take").
