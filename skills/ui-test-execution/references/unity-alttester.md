# Unity UI Test Execution — AltTester

Reference playbook for QA-Author and QA-Exec when the target surface is a Unity-rendered UI (game or game-adjacent surface) and the project uses AltTester for scene-graph instrumentation — the org default per `solution-defaults`.

## When to use this playbook

- SRS §3.4.2 UI Introspection Profile names Unity as the framework for at least one surface AND the introspection level is `Full` or `Partial` (AltTester provides the introspection layer).
- For `None` introspection (project rejected AltTester), this playbook does not apply — fall back to QA-Exec's coordinate-and-template registry pattern.

## Project layout

```
<repo-root>/
├── Assets/
│   └── AltTester/               (AltTester package — installed via Unity Package Manager)
├── e2e/
│   ├── playwright.config.ts     (the AltTester driver is invoked from a separate test process — Playwright / Python / C# host all work; choose one per project)
│   └── specs/
│       ├── by-us/
│       │   └── us-001-spectator-join.spec.ts
│       └── by-task/
│           └── t-014/
│               └── e2e.spec.ts
└── unity-build/                 (built Unity player with AltTester instrumented)
```

## Instrumentation requirement

The Unity build under test MUST have the `AltTesterPrefab` placed in the first scene and the `AltTester` script attached. Without it, the test process cannot connect. FE/Unity Dev: this is part of the **instrumentation contract** (`docs/instrumentation-contract.md`) — missing AltTesterPrefab = `instrumentation-violation` failure track when QA-Exec halts.

## Selector convention

- Set each testable GameObject's `name` to the testID declared by the instrumentation contract. AltTester finds by name: `altDriver.FindObject(By.NAME, "<id>")`.
- For nested objects, use `By.PATH` with a `/`-separated path.
- Never select by world-position coordinates — they break on every layout change.

## File template (Playwright-driven AltTester)

```typescript
import { test, expect } from '@playwright/test';
import { AltDriver } from 'alttester-node';
import { testUsers } from '../../fixtures/users';
import { seedMatch } from '../../fixtures/matches';

test.describe('US-001 — Spectator joins in-progress tournament match', () => {
  let altDriver: AltDriver;

  test.beforeEach(async () => {
    altDriver = new AltDriver({ host: 'localhost', port: 13000 });
    await altDriver.callStaticMethod('UnityEngine.SceneManagement.SceneManager', 'LoadScene', ['SpectatorLobby']);
  });

  test('TC-US001-001 — Spectator joins live tournament match end-to-end', async () => {
    // Arrange
    const viewer = testUsers.spectatorVN;
    const match = await seedMatch({ state: 'in-progress', publiclySpectatable: true });

    // Act
    await altDriver.findObject('emailField').setText(viewer.email);
    await altDriver.findObject('passwordField').setText(viewer.password);
    await altDriver.findObject('loginButton').tap();
    await altDriver.findObject(`spectateButton-${match.id}`).tap();

    // Assert
    const viewerCount = await altDriver.findObject('viewerCount');
    expect(await viewerCount.getText()).toMatch(/\d+/);
  });

  test.afterEach(async () => {
    await altDriver.stop();
  });
});
```

## Invocation

The Unity player must be running with AltTester listening (typically `localhost:13000`). Invocation:

```sh
# 1. Start the Unity player (DevOps's deploy report names the command)
./unity-build/<project>.app &  # or .exe on Windows

# 2. Run the test driver
BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL npx playwright test e2e/specs/by-us/
```

Alternative drivers: C# (NUnit), Python (`alttester-python`). The driver language is a project decision per ADR.

## Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── playwright-report/      (driver test report)
├── traces/
├── screenshots/            (Unity frame captures via altDriver.getPNGScreenshot())
├── visual/                 (Tier 3 — frame diffs)
└── logs/
    └── unity-player.log
```

## Visual diff in Unity

- `altDriver.getPNGScreenshot()` captures the current frame at the player's render resolution.
- Reserve for `Visual-Critical: yes` surfaces.
- Pin the render resolution and graphics settings in the deploy report's `## Test Environment` block — different MSAA / shader-variant settings produce false diffs.

## Degraded path (no AltTester)

If the project explicitly rejects AltTester (signed off via SRS §3.4.3 Acceptance of Non-Introspectable Surfaces), QA-Exec falls back to the **coordinate + template registry** pattern documented in `.claude/skills/qa-execution-runner/`. Test cases for this path are coordinate-dependent and break on every layout change — declare a high-severity entry in `docs/open-issues.md` if the gap is not transient.

## Common pitfalls

- **AltTester port conflicts** — default port `13000`; if multiple Unity builds run on the same host, ports collide. DevOps's `## Test Environment` block must name the chosen port.
- **Scene-load races** — the test starts before the scene finishes loading. Always `await` scene readiness via a sentinel GameObject in the target scene.
- **Frame-timing flakiness** — animations / transitions complete asynchronously. Wait on the GameObject's state, not on time.
- **Build-config drift** — debug vs release builds expose different sets of objects (some are stripped). Test against the same build config QA will sign off against.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- AltTester docs (external; stable) — https://alttester.com/docs/
