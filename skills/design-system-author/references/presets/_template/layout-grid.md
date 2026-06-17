# Layout grid — <preset name>

## Container widths

| Breakpoint | Min width | Container | Gutter | Columns |
|---|---|---|---|---|
| Mobile S | 320px | 100% (16px outer padding) | 16px | 4 |
| Mobile L | 480px | 100% (20px outer padding) | 16px | 4 |
| Tablet | 768px | 720px max | 24px | 8 |
| Desktop | 1024px | 960px max | 24px | 12 |
| Desktop L | 1280px | 1200px max | 32px | 12 |
| Desktop XL | 1536px | 1440px max | 32px | 12 |

## Vertical rhythm

Pages MUST use the spacing scale (`space-1` through `space-8`) for ALL vertical separations. No off-scale values.

Typical patterns:

- Section-to-section: `space-6` (32px) on mobile, `space-7` (48px) on desktop
- Card grid gap: `space-4` (16px) mobile, `space-5` (24px) desktop
- Form field-to-field: `space-4` (16px)
- Inline button gap: `space-2` (8px)

## Responsive rules

- <e.g., side-nav collapses to top-nav at <768px>
- <e.g., 12-col grid collapses to 4-col at <768px>
- <e.g., modal full-screen at <480px>
