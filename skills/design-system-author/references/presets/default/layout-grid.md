# Layout grid — Default

## Container widths

Default preset targets desktop primarily. Mobile-bridge support exists but is not the design priority — adjust if the project's SRS declares mobile-first.

| Breakpoint | Min width | Container | Outer padding | Columns | Gutter |
|---|---|---|---|---|---|
| Mobile S | 320px | 100% | 16px | 4 | 16px |
| Mobile L | 480px | 100% | 20px | 4 | 16px |
| Tablet | 768px | 100% (with side-nav collapsed) | 24px | 8 | 24px |
| Desktop | 1024px | 100% (side-nav 240px + content) | 24px | 12 | 24px |
| Desktop L | 1440px | 100% (side-nav 240px + content) | 32px | 12 | 24px |
| Desktop XL | 1920px | content capped at 1680px, centered | 32px | 12 | 32px |

Data tables and full-bleed lists IGNORE the content cap at Desktop XL — they extend to the viewport edge minus outer padding for maximum row width.

## Vertical rhythm

All vertical spacing MUST be from the spacing scale. No off-scale values.

| Context | Mobile | Desktop |
|---|---|---|
| Page top → first heading | `space-5` (24px) | `space-6` (32px) |
| Section → section | `space-5` (24px) | `space-6` (32px) |
| Heading → next content block | `space-3` (12px) | `space-4` (16px) |
| Card grid gap | `space-3` (12px) | `space-4` (16px) |
| Form field → field | `space-4` (16px) | `space-4` (16px) |
| Table row height | 48px default / 36px compact | 48px default / 36px compact |
| Toast → viewport edge | `space-5` (24px) | `space-5` (24px) |

## Page anatomy (the canonical admin shell)

```
┌──────────────────────────────────────────────────────┐
│ TopNav (56px, sticky, white surface, border-default  │
│        bottom)                                       │
├──────────┬───────────────────────────────────────────┤
│          │ Breadcrumb (32px) + Page heading-lg       │
│  SideNav │                                           │
│  (240px, │ Content area                              │
│  sticky, │   - Tables, cards, forms                  │
│  white)  │   - Section spacing space-6               │
│          │                                           │
│          │ Footer (optional, 48px)                   │
└──────────┴───────────────────────────────────────────┘
```

Active SideNav item uses `accent-brand-subtle` background with a 4px-wide `accent-brand` left border indicator. Inactive items have transparent background + `text-secondary` color; hovered items get `surface-subtle` background.

## Responsive rules

- Below 1024px: SideNav collapses to icon-only (56px wide); labels show on hover.
- Below 768px: SideNav becomes a drawer triggered from a hamburger in TopNav.
- Below 768px: 12-col grid collapses to 4-col. Most admin pages are NOT optimized below this breakpoint — flag SRS expectations explicitly.
- Modals: `sm` (400px) and `md` (560px) stay centered down to 480px; below 480px they become full-screen.
- Tables below 768px: switch to "card-per-row" layout where each row becomes a Card with key fields stacked.

## Forbidden patterns

- Horizontal scroll on the content area (the WHOLE content area). Tables may scroll horizontally inside their own container; the page itself must not.
- Multi-column content arrangements below 768px (admin tablet/mobile users get single-column).
- Fixed pixel paddings that don't come from the spacing scale.
- Asymmetric padding (top ≠ bottom, left ≠ right) without an explicit reason documented in `## Foundation Changes`.
- Using `surface-disabled` (#bbcde5) for anything other than disabled-state surfaces. The color is reserved.
