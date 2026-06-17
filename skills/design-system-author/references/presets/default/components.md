# Component minimum set — Default

Foundation MUST ship at least these components. Variants + states modeled as Figma component variants.

## Required components

| Component | Variants | States | Notes |
|---|---|---|---|
| Button | primary / secondary / tertiary / destructive / link / icon | default / hover / active / focused / disabled / loading | Height 36px (default), 44px (large CTA), 28px (compact toolbar). Primary uses `accent-brand`; secondary uses `accent-secondary`; tertiary is `surface-subtle` with `text-primary`. |
| Input | text / email / password / number / search / textarea | default / focused / error / disabled / readonly | Height 36px default; 44px touch. Focused border = `border-focus` (brand). Disabled bg = `surface-disabled` (#bbcde5). |
| FormField | — | — | Wraps Input + label (top) + helper (below) + error (replaces helper); spacing: label→input 4px, input→helper 4px, field→field 16px |
| Select | single / multi / async-search | default / focused / open / error / disabled | Same height as Input; popover uses `elevation-md` |
| Checkbox | default / mixed | unchecked / checked / disabled / focused | 16×16 box; label uses `label-md` |
| Radio | — | unchecked / selected / disabled / focused | Same as Checkbox |
| Switch | — | off / on / disabled | Use ONLY for binary preferences, not destructive actions |
| Card | default / interactive / selected / muted | — | `radius-md` (8px); `elevation-sm` resting, `elevation-md` on hover for `interactive` variant; selected uses `accent-brand-subtle` background |
| Modal | sm (400px) / md (560px) / lg (800px) / xl (1024px) | open / closing | Backdrop opacity 0.5; `radius-modal` (12px); `elevation-xl` |
| Drawer | left / right | open / closing | For multi-step forms, detail panels |
| Popover | — | open | `elevation-md`; arrow optional |
| Tooltip | — | hovered / focused | Single-line preferred |
| Toast | info / success / warning / error | entering / visible / exiting | Top-right; `space-5` from edges; auto-dismiss 5s default |
| Banner | info / success / warning / error / promo | dismissable / persistent | Page-level alerts; full-width within container |
| TopNav | — | — | 56px height; brand area left, page title / breadcrumb center, user-menu right |
| SideNav | default / collapsed | item-default / item-active / item-hover | 240px expanded, 56px collapsed; sticky. Active item uses `accent-brand-subtle` background + `accent-brand` left border indicator. |
| Breadcrumb | — | — | `label-sm`; separator " / "; last item not clickable |
| Tabs | top / left / segmented | default / active / disabled | `label-md` text; indicator 2px line under active in `accent-brand` |
| Pagination | — | default / current / disabled | Numbered + prev/next; per-page selector |
| Table | default / compact / striped | row-default / row-hover / row-selected / row-disabled | Sticky header; sortable columns; row height 48px default / 36px compact. Selected row uses `accent-brand-subtle` background. |
| ListItem | default / interactive / selected | — | For non-tabular lists; left-icon + title + secondary slot |
| Avatar | sm (24) / md (32) / lg (40) / xl (56) | image / initials / placeholder | Circle |
| Badge | neutral / brand / info / success / warning / error | — | `radius-full`; `label-sm`; 4px×8px padding |
| Tag | filled / outlined | default / removable / selected | `radius-sm`; `label-sm`; for filters + categorization |
| Icon | — | — | Outline style (1.5px stroke); 16/20/24px sizes; FE Dev imports Lucide or equivalent |
| Divider | horizontal / vertical | — | 1px `border-default` |
| Spinner | sm (16) / md (20) / lg (24) | — | Brand color by default; inverted (white) when on dark surface |
| EmptyState | default / error / search-no-results | — | Centered icon + heading-sm + body-md + optional CTA |
| Skeleton | text-line / rect / circle | — | For loading placeholders; subtle shimmer using `gray.100` and `gray.200` |
| ErrorBoundary | — | — | Caught-error fallback. Title `heading-md` + body `body-md` + retry button (secondary) |
| Stat | default / trending-up / trending-down | — | Numeric KPI display: large number + label + delta indicator |

## Disabled-state convention

The disabled state uses the brand-tinted `surface-disabled` (`#bbcde5`) for the element's background instead of the pure-neutral `gray.100`. This ties disabled-state recognition subtly to the brand palette — users learn that "this light blue-gray surface means disabled" rather than reading it as a generic neutral. Text on disabled elements uses `text-disabled` (`gray.400`).

Avoid using `surface-disabled` for any non-disabled purpose (page backgrounds, card variants, accent moments) — the visual association breaks down if the same color appears in active contexts.

## Conventions

- Component naming: `Feature-Agnostic-Component-Name` (e.g., `Button`, NOT `FintechButton`).
- Every component MUST consume tokens — no hardcoded color / spacing / typography / radius.
- Every interactive component MUST define a `focused` variant with `border-focus` (brand) outline (accessibility commitment).
- Every interactive component MUST have a `disabled` variant where: text uses `text-disabled`, surface uses `surface-disabled`, hover is suppressed.
- Touch-target minimum: 36×36 web, 44×44 mobile-bridge contexts.
- Iconography style: outline icons only. Mixing outline + filled in the same screen context is a lint violation.

## Locale-neutral by default

This preset does NOT ship locale-specific components (no `RegionSwitcher`, no `LanguageSwitcher`). When the project needs locale switching, add the component as a project-specific extension (clone this preset to a new slug per the README's clone-don't-edit discipline).
