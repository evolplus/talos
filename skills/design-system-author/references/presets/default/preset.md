# Default — cool-blue professional SaaS / admin

- **Slug:** `default`
- **Owner:** Platform Eng (kit-shipped)
- **Status:** active
- **Provenance:** Kit-shipped default. Anchor colors operator-provided. Locale-neutral; not tied to any specific brand.
- **Last reviewed:** 2026-06-05

## When to use

The kit's catch-all default preset. Use when:

- The project has no organization-specific or product-specific design system to apply
- The product is B2B / SaaS / admin / internal tools / dashboards without a strong brand voice
- The visual personality should be restrained, trustworthy, professional — not playful
- Locale neutrality matters more than diacritic optimization (use a locale-optimized preset instead for locale-heavy products)

Pick a more opinionated preset when the project has a defined brand or domain personality. Pick `none` only when you actively need to author Foundation from SKILL.md defaults from scratch.

## Brand voice + visual character

Cool, professional, calm. The user is doing focused work — favor information density over generous whitespace. Restrained color: cool-blue primary reserved for primary CTAs + active-state indicators; surfaces stay white + neutral gray. Disabled states use a brand-tinted gray (`#bbcde5`) rather than pure neutral, which ties disabled treatment subtly to the primary palette without screaming for attention.

Soft corner radii (`radius-md` 8px) on cards / inputs / buttons; sharp corners (`radius-none`) on data tables to maximize horizontal density. The vibe is "enterprise trust" — banking / finance / B2B SaaS / compliance dashboards / internal tooling.

## Dos

- Pair brand color (`accent-brand`) with white surface only — never colored backgrounds behind primary CTAs.
- Use neutral gray surfaces (`surface-default` / `surface-subtle`) for content areas; reserve color for state signaling (success / warning / error / info) and primary action.
- Secondary color (`accent-secondary` — the muted blue-gray) is for secondary CTAs, ghost buttons, inactive tabs, link hover states — moments that need brand-tied accent without competing with the primary CTA.
- Disabled state uses `surface-disabled` (the brand-tinted blue-gray) for the disabled element's background; text on disabled element uses `text-disabled`.
- Default to 8pt grid units for vertical rhythm at the page level; 4pt for component-internal padding.
- Use data-table density mode (compact row height = 36px) for any list view with >20 rows expected.

## Don'ts

- Never use the brand color for body text — it's reserved for CTA + selected-state + link.
- Never use generous hero spacing (`space-7` / `space-8`) within content areas — that's marketing pattern, not admin pattern.
- Never use uppercase as a primary type pattern — accessibility + readability cost > stylistic gain.
- Never use shadow elevation > `elevation-md` (3dp) in content — heavier elevation belongs to overlays only (modal, popover, toast).
- Never mix line icons and filled icons in the same screen context.
- Never use the brand-tinted disabled color (`#bbcde5`) as a regular surface — it's reserved exclusively for disabled states so users learn the visual association.

## Inherits from

None (kit-shipped default).

## Related presets

- `none` — when the project needs Foundation authored from scratch per SKILL.md defaults.

## Anchor colors (operator-provided)

| Token | Hex | Role |
|---|---|---|
| `accent-brand` | `#1c5d99` | Primary CTAs, focused-state borders, selected-state, active-state indicators |
| `accent-secondary` | `#639fab` | Secondary CTAs, ghost buttons, inactive tabs, link hover |
| `surface-disabled` | `#bbcde5` | Disabled element backgrounds — brand-tinted so the association is visual |
| `text-primary` | `#222222` | Body text + headings |
| `surface-default` | `#FFFFFF` | Page + card backgrounds |

The full 50-900 scales in `tokens.json` are derived around these anchors. The neutral gray scale runs from `#FAFAFA` (`gray.50`) to `#222222` (`gray.900` — equals `text-primary`).
