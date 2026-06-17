# Component minimum set — <preset name>

The Designer's Foundation page MUST ship at least these components. Each component MUST have all variants + states modeled as Figma component variants.

## Required components

| Component | Variants | States | Notes |
|---|---|---|---|
| Button | primary / secondary / tertiary / destructive / link | default / hover / active / disabled / loading | <preset-specific rules> |
| Input | text / email / password / number / search | default / focused / error / disabled | Always paired with FormField wrapper for label + helper |
| FormField | — | — | Wraps Input with label + helper-text + error-text per the spacing tokens |
| Card | default / interactive / selected | — | <preset-specific rules> |
| Modal | sm / md / lg | open / closing | Backdrop, header, body, footer slots |
| Nav | top-nav / side-nav / breadcrumb | default / active | <preset-specific rules — pick which variants apply to this preset> |
| ListItem | default / interactive / selected / disabled | — | — |
| Avatar | sm / md / lg / xl | image / initials / placeholder | — |
| Badge | neutral / info / success / warning / error | — | — |
| Tag | filled / outlined | default / removable | — |
| Icon | — | — | Placeholder; FE Dev imports the actual icon library |
| Divider | horizontal / vertical | — | — |
| Spinner | sm / md / lg | — | — |

## Preset-specific additions

<List any preset-domain components beyond the universal set — e.g., a `GameCard` for game-website presets, a `PromoBanner` for webshop presets.>

## Conventions

- Component naming: `Feature-Agnostic-Component-Name` (e.g., `Button`, never `SpectatorButton`).
- Each component MUST consume Foundation tokens — never hardcode color, spacing, or typography values.
- Each component MUST use Figma auto-layout so it resizes predictably.
- States MUST be modeled as variants, not separate components.
