# Web UI Test Execution — Playwright (additional setup notes)

Companion reference to [`../../playwright-author/SKILL.md`](../../playwright-author/SKILL.md). The main playbook lives in the skill file; this reference holds setup details that belong with the cross-runner family for symmetry with the other platforms (Flutter, native mobile, Unity).

## Why two files

- `playwright-author/SKILL.md` is **authoring-focused** — what QA-Author does when writing specs. Templates, fixtures, page objects.
- This file is **setup-focused** — what the project's TL / DevOps establish once, before any spec is written.

If you're authoring specs, read the SKILL.md first. If you're setting up the test infrastructure for the first time on a new project, read this.

## One-time project setup

```sh
# In project root
npm init playwright@latest
```

When the wizard asks:

- Tests in: `e2e`
- Add GitHub Actions: project-specific (default no for kit's local-environment scope; project may add for CI later)
- Browsers: `chromium, firefox, webkit` (full matrix; trim later if needed)

The wizard generates `playwright.config.ts` and an `e2e/` scaffold. Replace the scaffold with the kit's layout (see `playwright-author/SKILL.md` § Project layout).

## Recommended `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['html', { outputFolder: `docs/qa-reports/${process.env.TASK_ID ?? 'unknown'}/playwright-report`, open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Mobile viewports (uncomment when SRS's UI Introspection Profile names mobile web):
    // { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    // { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
```

Key points:

- `testDir` follows the kit's `docs/test-cases/` mirror: `e2e/specs/by-us/` and `e2e/specs/by-task/<T-NNN>/`.
- `reporter` outputs the HTML report into `docs/qa-reports/<task-id>/playwright-report/` so QA-Exec's markdown report links directly. The `TASK_ID` env var carries the value.
- `baseURL` reads from `$BASE_URL` (set by QA-Exec from the deploy report's `## Test Environment` block).
- Browser matrix matches `browser_targets` in the deploy report.

## CI integration (project decision)

The kit's deploy is local-environment-only by design (CLAUDE.md §10 hard rule). CI is a project concern, not a kit concern. If the project layers CI on top:

- The same `playwright.config.ts` drives both local and CI; the only differences are `CI=1` (Playwright sets retries=1, workers=2) and `BASE_URL` pointing at the CI-deployed env.
- Trace and HTML report artifacts upload as build outputs.
- Visual-diff baselines live in the repo at `e2e/specs/__screenshots__/`; CI compares against them. Baseline updates require human review (kit hard rule).

## Selector strategy — quick reference

Match the order Playwright recommends:

1. `page.getByRole(role, { name })` — accessibility-driven, doubles as a11y check
2. `page.getByLabel(text)` — form fields
3. `page.getByPlaceholder(text)` — form fields without labels
4. `page.getByText(text)` — non-stable elements only (headlines, dynamic content)
5. `page.getByTestId(id)` — fallback when the above don't fit; `<element data-testid="<id>">`

CSS / XPath / nth-child are last-resort. Each one is a future-flake.

## Auth fixture

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ loggedInPage }>({
  loggedInPage: async ({ page, request }, use) => {
    // Seed a test user via admin endpoint
    const res = await request.post('/admin/test-fixtures/user', {
      data: { role: 'spectator', region: 'VN' }
    });
    const user = await res.json();

    // Programmatic login (skip UI)
    await page.goto('/login');
    await request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password } });
    await page.context().storageState({ path: `e2e/.auth/${user.id}.json` });

    await use(page);
  },
});
export { expect };
```

Then in specs:

```typescript
import { test, expect } from '../../fixtures/auth';

test('TC-US001-001 — …', async ({ loggedInPage }) => {
  await loggedInPage.goto('/spectate/lobby');
  // …
});
```

This makes the login flow ONE place; tests that need an authenticated session don't re-test login.

## Common pitfalls

- **`page.waitForTimeout(ms)` everywhere** — every appearance is a flake. Replace with `expect(...).toBeVisible()` / `expect.poll(...)`.
- **`page.locator('.btn-primary').nth(2).click()`** — CSS + position selector, breaks the moment layout changes. Use testId or accessibility selectors.
- **Tests that don't clean up** — fixtures that seed DB rows must tear down (or use a per-test transactional DB). Shared state across runs = flaky in week 2.
- **Trace files everywhere** — `trace: 'on'` retains a trace for every test, fills disk fast on CI. Stick with `retain-on-failure`.
- **Visual diff on macOS local, Linux CI** — fonts and antialiasing differ. Pin a Docker image for visual-diff runs; baselines come from the same image.

## References

- `.claude/skills/playwright-author/SKILL.md` — main authoring playbook
- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- Playwright docs (external; stable) — https://playwright.dev/docs/intro
