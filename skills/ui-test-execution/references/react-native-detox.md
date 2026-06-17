# React Native UI Test Execution — Detox

Reference playbook for QA-Author and QA-Exec when the target surface is a React Native app and the project uses Detox (the org default for RN per `solution-defaults`).

## When to use this playbook

- SRS §3.4.2 UI Introspection Profile names React Native as the framework for at least one surface.
- The project has not adopted Maestro for cross-platform unification — if it has, see [`cross-platform-maestro.md`](./cross-platform-maestro.md) instead. Adopting Maestro over Detox is a per-project ADR per `.claude/skills/adr-author/`.

Detox is mature, RN-specific, has deep bridge integration (synchronization with RN's render loop), and is well-supported. Maestro is simpler but trades depth for breadth — for stack-committed RN teams, Detox usually wins.

## Project layout

```
<repo-root>/
├── e2e/
│   ├── .detoxrc.js              (Detox config: per-platform binary path + simulator/emulator target)
│   ├── jest.config.js           (Detox runs via Jest)
│   ├── specs/
│   │   ├── by-us/
│   │   │   └── us-001-spectator-join.e2e.js
│   │   └── by-task/
│   │       └── t-014/
│   │           ├── e2e.e2e.js
│   │           └── structural.e2e.js
│   ├── fixtures/
│   │   ├── users.js
│   │   └── matches.js
│   └── helpers/
│       └── waits.js
└── package.json                 (detox + jest as devDependencies)
```

Detox's standard convention is `.e2e.js` suffix; the kit reuses that to distinguish e2e specs from RN's unit-test `.test.js` files.

## Selector convention

- Set `testID="<id>"` on every testable RN component. The instrumentation contract names the IDs.
- Detox selection: `element(by.id('<id>'))`.
- For text-based selection (last resort): `element(by.text('<text>'))` — avoid for stable elements; breaks on locale.
- Accessibility-driven: `element(by.label('<label>'))` — paired with `accessibilityLabel` prop.

## File template

```javascript
const { device, element, by, expect } = require('detox');
const { testUsers } = require('../../fixtures/users');
const { seedMatch } = require('../../fixtures/matches');

describe('US-001 — Spectator joins in-progress tournament match', () => {
  beforeEach(async () => {
    await device.launchApp({
      launchArgs: {
        BASE_URL: process.env.BASE_URL,
        API_BASE_URL: process.env.API_BASE_URL,
      },
      newInstance: true,
    });
  });

  it('TC-US001-001 — Spectator joins live tournament match end-to-end', async () => {
    // Arrange
    const viewer = testUsers.spectatorVN;
    const match = await seedMatch({ state: 'in-progress', publiclySpectatable: true });

    // Act
    await element(by.id('emailField')).typeText(viewer.email);
    await element(by.id('passwordField')).typeText(viewer.password);
    await element(by.id('loginButton')).tap();
    await element(by.id(`spectateButton-${match.id}`)).tap();

    // Assert
    await expect(element(by.id('viewerCount'))).toBeVisible();
    await expect(element(by.id('liveBadge'))).toBeVisible();
  });
});
```

## Invocation

Detox runs per-platform (iOS sim or Android emulator):

```sh
# iOS
detox build --configuration ios.sim.debug
BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL detox test --configuration ios.sim.debug e2e/specs/by-us/

# Android
detox build --configuration android.emu.debug
BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL detox test --configuration android.emu.debug e2e/specs/by-us/
```

Each `--configuration` corresponds to a block in `.detoxrc.js` naming the binary path and target device.

## Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── detox-report/           (Jest HTML reporter output)
├── artifacts/              (Detox auto-captures: screenshots on failure, video, logs)
│   ├── ios.sim.debug/
│   │   └── <test-name>/
│   │       ├── screenshots/
│   │       ├── videos/
│   │       └── logs/
│   └── android.emu.debug/
└── logs/
```

Configure Detox's `artifacts` in `.detoxrc.js`:

```javascript
module.exports = {
  artifacts: {
    rootDir: `docs/qa-reports/${process.env.TASK_ID}/artifacts`,
    plugins: {
      screenshot: 'failing',
      video: 'failing',
      log: 'failing',
    },
  },
  // ... rest of config
};
```

## Visual diff

Detox does NOT include built-in screenshot comparison. For `Visual-Critical: yes` surfaces, layer one of:

- `jest-image-snapshot` — for pixel diff, baselines under `e2e/specs/__image_snapshots__/`
- A managed service (Percy, Applitools) — declared via `third-party-dependency-evaluation`

Choice is a project ADR. The default-stack recommendation is `jest-image-snapshot` (no extra dependency, baselines in VCS).

## Fixtures

Same pattern as Playwright — fixtures live in `e2e/fixtures/` and seed state via the deployed env's admin endpoints:

```javascript
// e2e/fixtures/matches.js
const fetch = require('node-fetch');

async function seedMatch({ state, publiclySpectatable }) {
  const r = await fetch(`${process.env.API_BASE_URL}/admin/test-fixtures/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, publiclySpectatable }),
  });
  if (!r.ok) throw new Error(`seedMatch failed: ${r.status}`);
  return r.json();
}

module.exports = { seedMatch };
```

## Common pitfalls

- **`waitFor` vs `expect`** — Detox's `expect(...).toBeVisible()` already waits with a timeout. Adding redundant `waitFor` blocks adds noise and brittleness. Use the implicit wait.
- **`detox.synchronization` issues** — RN's bridge can leave Detox waiting forever on background tasks (e.g., infinite animations). Disable synchronization for the problematic block: `await device.disableSynchronization(); ... await device.enableSynchronization();` — but treat each use as a red flag worth tracking down.
- **App state leaks** — `beforeEach` should call `device.launchApp({ newInstance: true })` or `device.reloadReactNative()`. Don't share state across `it()` blocks.
- **iOS sim / Android emulator drift** — different sim versions render slightly differently. Pin the version in the deploy report's `## Test Environment` block under `browser_targets`.
- **Detox builds are slow** — local dev loop is painful. Tip: run `detox build` once per session, then `detox test` repeatedly. CI rebuilds on every run, accepting the cost.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- [`cross-platform-maestro.md`](./cross-platform-maestro.md) — the cross-platform alternative; consider when the team manages multiple mobile stacks
- Detox docs (external; stable) — https://wix.github.io/Detox/
