# Typography — Default

## Font stack

- **Body / UI:** `Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- **Monospace:** `"JetBrains Mono", ui-monospace, SFMono-Regular, "Courier New", monospace`
- **Display:** none — admin / internal tools never use display fonts in UI.

### Why Inter

- The de-facto modern geometric sans for B2B / SaaS / admin UIs.
- Google Fonts (free, no licensing complications).
- High legibility at small sizes (data tables, helper text).
- Locale-neutral — broad Latin coverage; adequate for most European languages.
- If the project has heavy Vietnamese-diacritic content, switch to a Vietnamese-diacritic-optimized typeface like Be Vietnam Pro.

### FE Dev integration

1. Add Inter to the project's font-loading layer (Google Fonts link in `index.html` or `next/font` import for Next.js).
2. Pin the font weights actually used: 400, 500, 600, 700.
3. Configure `font-display: swap` to avoid FOIT on slow connections.

## Type scale

Modular ratio: 1.250 (Major Third). Base: 16px.

| Token | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `heading-xl` | 48px | 700 | 56px | RESERVED — only for empty-page / 404 / onboarding hero |
| `heading-lg` | 32px | 700 | 40px | Top-of-page section title (one per page max) |
| `heading-md` | 24px | 600 | 32px | Card / dialog title |
| `heading-sm` | 20px | 600 | 28px | Inline group / fieldset title |
| `body-lg` | 18px | 400 | 28px | Lead paragraph — rare in admin UI |
| `body-md` | 16px | 400 | 24px | Default body text |
| `body-sm` | 14px | 400 | 20px | Secondary text, captions, helper text |
| `label-md` | 14px | 600 | 20px | Form label, button text, table column header |
| `label-sm` | 12px | 600 | 16px | Tag, badge, micro-label, breadcrumb |
| `code-md` | 14px | 400 | 20px | Inline code, IDs, hashes |
| `table-md` | 14px | 400 | 20px | Default data-table row text |
| `table-sm` | 13px | 400 | 18px | Dense data-table row text (compact mode) |

## Rules of use

- A page MAY have at most one `heading-lg`. Multiple `heading-md` are allowed (per content section).
- `heading-xl` is reserved for full-page empty / 404 / onboarding states — never use in normal content.
- Button text MUST use `label-md`. Never `body-md`, never `body-sm`.
- Form labels MUST use `label-md`. Helper text uses `body-sm`. Error text uses `body-sm` colored with `state-error`.
- Data-table cells default to `table-md`. Switch to `table-sm` for compact mode (>20 rows).
- Inline IDs / hashes / tokens MUST use `code-md`. Wrap in a monospace span.
- Never use uppercase as a primary type pattern. The `label-*` tokens are sentence-case at component level; `text-transform: uppercase` is forbidden in production CSS.
- Color rule: body text uses `text-primary` (#222222 — the operator-anchored text color). Brand color is reserved for links (`text-link`), CTAs, and selected/active states — never for body text.
