# Design-guideline presets

Each subfolder is a named, opinionated starting point for the Foundation page that the UI/UX Designer authors at `create` (or audits at `import` / `revise` / `incorporate`). A preset is a **content catalog** — token values, type scale, component conventions, layout grid — that the Designer applies verbatim instead of inventing from scratch.

## Why presets exist

Without presets, every project re-derives basic Foundation choices (4pt vs 8pt grid; modular ratio for type scale; brand color palette; button-corner-radius convention; component minimum set). Different choices across different products in your organization yield visual fragmentation — two products look like different companies because their type scales differ by 2px.

Presets encode a single answer per company / product family / domain so every UI authored under the kit anchors to the same Foundation choices. Projects opt in via the SRS header `Design-Guideline:` field — see `_artifacts/srs-template.md`.

## Selection rule

The SRS header `Design-Guideline:` field declares which Foundation source the project consumes. Preset values are folder names under `presets/` (e.g., `modern-saas-admin`, `ios-consumer`, `default`). Value `from-figma` is permitted for Design-Flow A when `figma-requirements-extraction` found enough palette / typography / spacing / radius evidence in the provided Figma file. Value `none` is permitted for projects authoring from scratch — the Designer falls back to the SKILL.md defaults.

BA Phase 1.X step 10 prompts for the value at SRS sign-off time when the SRS has any UI surface. The choice cannot change post-sign-off without an SRS revert (the Foundation tokens are downstream-load-bearing for FE Dev's `docs/uiux/refs/<task-id>.md` design contract and QA-Author's `docs/uiux/visual-specs/<task-id>.md`).

## Preset shape

Every preset folder MUST contain:

```
presets/<slug>/
  preset.md              # one-page overview: when to use, brand voice, dos/don'ts
  tokens.json            # color + spacing + radius + elevation + motion tokens
  typography.md          # type scale + font stack + usage table
  components.md          # required component minimum set + variant conventions
  layout-grid.md         # column system + breakpoints + container widths
```

The `_template/` folder ships the empty shape so authors of a new preset don't start from a blank slate. Copy `_template/` to `<your-slug>/` and fill the fields.

## Adding a new preset

1. `cp -r _template/ <your-slug>/`
2. Fill `preset.md` first (the "why" — when to use, what makes this preset distinct).
3. Fill `tokens.json`, `typography.md`, `components.md`, `layout-grid.md`. Token values are downstream-load-bearing — every number is part of the contract.
4. Cross-check against any existing organization brand guidelines, accessibility commitments, or product-family conventions.
5. Append the preset to `.claude/skills/registry.md` § Design Guidelines.
6. Optionally update `.claude/agents/_templates/_artifacts/srs-template.md` § Design-Guideline reference list to surface the new option to BA Phase 1.X.

## Adding a project-specific override

If a project needs to diverge from a preset (e.g., a product ships a brand-refresh palette but otherwise inherits an existing preset), the preferred pattern is:

- Clone the preset to a new slug (e.g., `modern-saas-admin-2026`).
- Modify only the diverging tokens / sections.
- Annotate `preset.md` § Provenance with the parent preset slug and the diff summary.

Avoid editing a shared preset in place for project-specific reasons — that breaks the contract for every other project consuming the same preset slug.

## Selection vs composition

Presets are selected, not composed. A project picks ONE preset slug. If a project needs cross-cutting layout patterns that span presets (e.g., "publishing tokens + Material 3 responsive scale"), clone the preset and merge the patterns explicitly. The kit's discipline is "Foundation tokens are unambiguous"; partial inheritance via dynamic composition makes that contract muddy.
