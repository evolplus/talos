---
name: playwright-author
description: Concrete how-to for QA-Author writing Playwright specs from markdown TCs — project layout, fixtures, network mocking, parallelism, retries, trace capture, screenshot/visual-diff usage. Consult after `ui-test-execution` when the target surface is web AND the project uses Playwright (the org default per solution-defaults).
agents: [qa-author]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# Playwright Author

## When to use

You are QA-Author writing an executable spec for a web UI surface. The `ui-test-execution` skill gave you the cross-runner principles; this skill is the Playwright-specific procedure. Consult both: `ui-test-execution` for the contract, `playwright-author` for the implementation.

Use this skill only when:

- Surface is web (per SRS §3.4.2 UI Introspection Profile row's Framework column).
- Project uses Playwright (the org default per `solution-defaults`; otherwise an ADR justifies the deviation).
- You have the markdown TCs in hand and need to produce the matching `.spec.ts` files.

## Inputs and outputs

- **Inputs:** markdown TCs (under `docs/test-cases/by-us/<US-NNN>/` or `docs/test-cases/by-task/<task-id>/`), instrumentation contract (`docs/instrumentation-contract.md`), visual spec (`docs/uiux/visual-specs/<task-id>.md`) for structural cases, frozen API contract for API-touching flows
- **Outputs:** one `.spec.ts` file per US (or per task layer), one `test()` per TC, page objects under `e2e/pages/` when reuse warrants, fixtures under `e2e/fixtures/`

## Project layout convention

```
<repo-root>/
├── e2e/
│   ├── playwright.config.ts
│   ├── specs/
│   │   ├── by-us/
│   │   │   └── us-001-spectator-join.spec.ts
│   │   └── by-task/
│   │       └── t-014/
│   │           ├── api.spec.ts
│   │           ├── e2e.spec.ts
│   │           └── structural.spec.ts
│   ├── pages/                          (page object models — one class per screen)
│   │   └── spectator-live-view.page.ts
│   ├── fixtures/                       (test data + setup)
│   │   ├── users.ts                    (test users by role)
│   │   ├── matches.ts                  (DB seed factories)
│   │   └── api-mocks/                  (network response mocks)
│   └── utils/                          (shared helpers)
│       ├── auth.ts                     (login flow as a fixture, not a re-tested flow)
│       └── waits.ts                    (condition-based waits)
└── package.json                        (playwright as devDependency)
```

- `e2e/` is reserved for tests. No production code lives here.
- `specs/by-us/` matches the markdown path (`docs/test-cases/by-us/<US-NNN>/`).
- `specs/by-task/<T-NNN>/` matches `docs/test-cases/by-task/<task-id>/`. Layers (api / e2e / structural) become files inside the task folder.

## File template

```typescript
import { test, expect } from '@playwright/test';
import { SpectatorLiveView } from '../../pages/spectator-live-view.page';
import { testUsers } from '../../fixtures/users';
import { seedMatch } from '../../fixtures/matches';

test.describe('US-001 — Spectator joins in-progress tournament match', () => {

  test('TC-US001-001 — Spectator joins live tournament match end-to-end', async ({ page, request }) => {
    // Arrange — Preconditions from the markdown TC, one bullet per fixture call
    const viewer = testUsers.spectatorVN;
    const match = await seedMatch(request, { state: 'in-progress', publiclySpectatable: true });

    // Act — Main Flow steps from the markdown TC
    const view = new SpectatorLiveView(page);
    await view.goto();
    await view.loginAs(viewer);
    await view.tapSpectate(match.id);

    // Assert — Expected items from the markdown TC, one expect() per Expected bullet
    await expect(view.viewerCount).toBeVisible();
    await expect(view.viewerCount).toHaveText(/\d+/);
    await expect.poll(() => request.get(`/admin/sessions/by-account/${viewer.id}`).then(r => r.json()))
      .toMatchObject({ state: 'live', match_id: match.id });
    // PC-1 — SpectatorSessionStarted event present
    const events = await request.get('/admin/events/recent?topic=spectator-events').then(r => r.json());
    expect(events.some((e: any) => e.type === 'SpectatorSessionStarted' && e.match_id === match.id)).toBe(true);
  });

  test('TC-US001-002 — Concurrent session per account is capped at 1', async ({ page, request, browser }) => {
    // …
  });
});
```

Notes on the template:

- `test.describe` carries the US-ID + title from the markdown — readable in the HTML report.
- Each `test()` name starts with the TC ID verbatim. QA-Exec's report cites it unchanged.
- Comments mark the TC's Preconditions / Steps / Expected bullets. A reader can map every line back to the markdown.
- Page object methods name the action (`tapSpectate`), not the implementation (`clickButton`).

## Page Object Model — when to use

Use POM when:

- A screen is exercised by 3+ tests across multiple US/task files.
- The screen's selectors live in one place so a UI refactor (testID rename, layout change) touches one file.

Skip POM when:

- A flow is exercised by exactly one test. Inline selectors are fine.
- The "page" is a single API call (`request.get(...)`). Just call it.

POM is a tool; over-applied it adds indirection without saving anything.

## Fixtures pattern

Fixtures live in `e2e/fixtures/` and seed state via the test API or the deployed env's admin endpoints. Each fixture is one function returning the seeded entity:

```typescript
// e2e/fixtures/matches.ts
import { APIRequestContext } from '@playwright/test';

export interface SeededMatch {
  id: string;
  state: 'in-progress' | 'scheduled' | 'completed';
  publiclySpectatable: boolean;
}

export async function seedMatch(
  request: APIRequestContext,
  opts: { state: SeededMatch['state']; publiclySpectatable: boolean }
): Promise<SeededMatch> {
  const r = await request.post('/admin/test-fixtures/match', { data: opts });
  if (!r.ok()) throw new Error(`seedMatch failed: ${r.status()} ${await r.text()}`);
  return r.json();
}
```

- Fixture functions are typed; the test reads like a recipe.
- Fixtures use admin endpoints the deployed local env exposes (DevOps's deploy report should declare the admin base URL alongside the public one).
- Test data is per-test: every test seeds its own match, its own user, its own session.

## Network mocking — when to use

Two modes:

- **Mock the network at the browser** via `page.route()` when the test is verifying client-side behavior independent of the backend. Useful for "what does the UI do when the API returns 503?" — easier than seeding a real backend failure.
- **Hit the real deployed backend** when the test is verifying the integration. Most `by-us` happy-path tests should hit the real backend because that's what's actually being shipped.

Mixing modes in one test = noise. Pick.

## Parallelism and isolation

- Playwright runs tests in parallel by default. Lean into that.
- Each test must NOT depend on order. If TC-001 must run before TC-002, the test is malformed — split state into the fixture.
- Workers don't share state. If two parallel tests both create a match, the API must accept that (fixture endpoints return per-call IDs).

## Retries

Project config: 1 retry on CI, 0 retries locally.

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 1 : 0,
  // …
});
```

A test that fails twice is a real failure (or a real flake). A test that needs 2+ retries to pass = flaky = failing per the kit's rule. Fix the test, don't bump retries.

## Trace, screenshot, video capture

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['html', { outputFolder: 'docs/qa-reports/<task-id>/playwright-report' }],
    ['list'],
  ],
});
```

Configure the HTML report to output under `docs/qa-reports/<task-id>/` so QA-Exec's report can link to it directly. The exact `<task-id>` is passed via an env var (`TASK_ID=T-014 npx playwright test`).

## Visual diff (Tier 3 only)

For SRS `Visual-Critical: yes` surfaces:

```typescript
test('TC-US001-099 — Match-ended overlay visual fidelity', async ({ page }) => {
  await page.goto('/spectate/M-T-001/ended');
  await expect(page).toHaveScreenshot('match-ended-overlay.png', {
    maxDiffPixelRatio: 0.001,  // 0.1%
  });
});
```

Baselines live at `e2e/specs/__screenshots__/`. The first run captures a baseline; subsequent runs diff. Update baselines ONLY with human approval, never via `--update-snapshots` in CI.

## Hard rules

- One `test()` per TC ID. Multiple TCs in one `test()` = lossy report (you can't tell which TC failed).
- Test name starts with the TC ID. `'TC-US001-001 — …'`, not `'should join match …'`.
- Selectors come from the instrumentation contract. `page.getByTestId('<id>')` referencing an ID the contract declares. No CSS / XPath / text selectors for stable elements.
- No `page.waitForTimeout(<ms>)`. Use `expect(...).toBeVisible()` / `expect.poll(...)`. Time-based waits are flakes waiting to happen.
- No shared state across tests. Each test seeds its own fixtures. Login flows go in a fixture, not in every test.
- HTML report writes to `docs/qa-reports/<task-id>/playwright-report/`. QA-Exec consumes it from there.
- Visual diff baseline updates require human review. `--update-snapshots` on a CI run is forbidden.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles; consult first
- `.claude/skills/ui-test-execution/references/web-playwright.md` — additional Playwright project-setup detail
- `.claude/skills/qa-author-by-us/` and `.claude/skills/qa-author-by-task/` — QA-Author modes that define `Executable:` usage
- `.claude/skills/qa-execution-runner/` — QA-Exec run contract that invokes Playwright
- Playwright docs (external; stable) — https://playwright.dev/docs/intro
