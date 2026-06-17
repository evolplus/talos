# Cross-Platform Mobile UI Test Execution — Maestro

Reference playbook for QA-Author and QA-Exec when the project uses Maestro instead of (or alongside) the platform-native runners. Maestro is a YAML-driven mobile UI testing framework that works against:

- iOS native (XCUITest replacement)
- Android native (Espresso replacement)
- React Native (Detox replacement)
- Flutter (Patrol alternative; less feature-rich than Patrol for Flutter-specific concerns)

Maestro does **not** support Unity scene-graph testing; AltTester remains the answer for Unity.

## When to use this playbook

Pick Maestro over the platform-native runner when ANY of these apply:

- The team owns multiple mobile stacks (e.g., one Flutter app + one RN app + one native iOS app) and prefers a single tool with shared YAML flows over per-stack DSLs.
- Test authors are non-engineers (PMs, designers writing flows) — Maestro's YAML is approachable; Detox / XCUITest assume code fluency.
- The team values simplicity over depth — Maestro deliberately exposes less of the underlying platform than Detox / XCUITest. For 80% of flows that's a feature; for the 20% needing deep platform hooks, it's a constraint.
- Onboarding cost matters more than long-term ceiling.

Pick the platform-native runner over Maestro when:

- The stack is committed (RN-only or Flutter-only or iOS-only or Android-only) AND the team can absorb the per-stack DSL.
- Tests need deep framework integration (RN bridge sync, Flutter widget tree introspection, Compose semantic tree).
- Visual diff requirements need framework-native screenshot APIs not Maestro's screenshot primitive.

The choice is an ADR per `.claude/skills/adr-author/` whether picking Maestro or the platform-native default.

## Project layout

```
<repo-root>/
├── .maestro/
│   ├── by-us/
│   │   └── us-001-spectator-join.yaml
│   ├── by-task/
│   │   └── t-014/
│   │       ├── e2e.yaml
│   │       └── structural.yaml
│   ├── flows/                  (shared reusable flow snippets)
│   │   ├── login.yaml
│   │   └── seed-match.yaml
│   ├── fixtures/               (test data files referenced from flows)
│   │   └── users.yaml
│   └── config.yaml             (per-platform app IDs, default device, env vars)
```

Maestro doesn't impose `.maestro/` as the directory — but the kit standardizes on it parallel to `e2e/` / `integration_test/` / `.maestro/` per platform.

## Selector convention

Maestro selects by accessibility identifier, text, or position. Per-platform mapping:

| Platform | Set in app | Find in flow |
|---|---|---|
| iOS native | `accessibilityIdentifier = "<id>"` | `tapOn: id: "<id>"` |
| Android native | `contentDescription="<id>"` | `tapOn: id: "<id>"` |
| React Native | `testID="<id>"` | `tapOn: id: "<id>"` |
| Flutter | `Semantics(identifier: "<id>")` or `Key("<id>")` | `tapOn: id: "<id>"` |

The instrumentation contract names the IDs; Maestro flows reference them uniformly across platforms. **One `testID="loginButton"` in the app, and the same `tapOn: id: "loginButton"` flow runs against iOS, Android, RN, and Flutter** — that's Maestro's superpower.

Text-based selection (`tapOn: "Login"`) is supported but discouraged for stable elements; use IDs.

## File template

```yaml
# .maestro/by-us/us-001-spectator-join.yaml

appId: com.example.spectator
name: TC-US001-001 — Spectator joins live tournament match end-to-end
tags:
  - by-us
  - us-001
env:
  BASE_URL: ${BASE_URL}
  API_BASE_URL: ${API_BASE_URL}
---
# Pre-conditions: seed test match
- runScript:
    file: ../flows/seed-match.js
    env:
      STATE: in-progress
      PUBLICLY_SPECTATABLE: "true"

# Act
- launchApp:
    clearState: true
- tapOn:
    id: "emailField"
- inputText: "test@example.com"
- tapOn:
    id: "passwordField"
- inputText: ${TEST_PASSWORD}
- tapOn:
    id: "loginButton"
- tapOn:
    id: "spectateButton-${MATCH_ID}"

# Assert
- assertVisible:
    id: "viewerCount"
- assertVisible:
    id: "liveBadge"
- takeScreenshot: docs/qa-reports/${TASK_ID}/screenshots/TC-US001-001-final
```

Notes:

- Top-of-file YAML metadata (`name`, `tags`, `env`) captures the TC ID and links the flow back to the markdown TC. Maestro's reporter cites `name` verbatim — QA-Exec's report carries the TC ID through.
- `runScript` lets you call out to JS for fixture setup; the `flows/` directory holds reusable JS helpers.
- `assertVisible` is the canonical assertion; `assertNotVisible`, `assertWithAi` (for visual matching), and others are available.

## One TC per file

Unlike code-based runners where one file holds multiple `test()` blocks, Maestro flows are one-per-file by convention. Two reasons:

1. Maestro's CLI runs files, not subsets.
2. Per-file YAML keeps the flow scannable.

The cost: more files. Worth it for the clarity.

## Invocation

```sh
# Single flow
TASK_ID=T-014 BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL \
  maestro test .maestro/by-us/us-001-spectator-join.yaml

# All flows in a directory
TASK_ID=T-014 BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL \
  maestro test .maestro/by-us/

# Per-platform device targeting
maestro --device "iPhone 15 Pro Simulator" test ...
maestro --device "Pixel 7 Emulator" test ...
```

Maestro auto-detects the running simulator/emulator if only one is up; the `--device` flag is for explicit targeting when multiple devices are available.

## Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── maestro-report/         (Maestro's HTML report; written by `maestro test --report html`)
├── screenshots/            (flow-captured screenshots via takeScreenshot)
├── videos/                 (Maestro auto-records flow runs as video)
└── logs/
```

## Visual diff

Maestro supports `assertWithAi` for AI-based visual matching (uses an LLM to compare actual UI against an expected description), and `takeScreenshot` for plain captures. For pixel-diff baseline comparison:

- Maestro Cloud (managed service) provides visual diff with baselines.
- Otherwise, layer a separate pixel-diff step using ImageMagick / `pixelmatch` against `takeScreenshot` outputs.

For `Visual-Critical: yes` surfaces on Maestro projects, the cleanest path is Maestro Cloud (declared via `third-party-dependency-evaluation` if adopted), OR fall back to a platform-native runner for that specific surface (mixed-runner project is allowed; the choice is per-surface, not project-wide).

## Cross-platform flow reuse

One YAML, multiple platforms — provided the app exposes the same identifiers everywhere. This is the instrumentation contract's job: define the testID set once, every platform implements it. With that in place, the same `us-001-spectator-join.yaml` runs against iOS, Android, RN, Flutter without modification.

When platforms diverge (e.g., iOS has a permission dialog Android doesn't), use Maestro's conditional execution:

```yaml
- runFlow:
    when:
      platform: iOS
    commands:
      - tapOn: "Allow Notifications"
- tapOn: id: "loginButton"
```

## Common pitfalls

- **Identifier mismatch across platforms** — if iOS uses `loginButton` and Android uses `login_button`, Maestro's cross-platform promise breaks. The instrumentation contract MUST mandate identical identifiers across platforms. Mismatch = `instrumentation-violation` track.
- **Implicit waits** — Maestro waits up to 5 seconds for elements by default. Increase with `extendedWaitUntil:` for slow flows; never replace with `sleep:` (kit hard rule against time-based waits).
- **Flaky cloud runs** — Maestro Cloud parallelizes across devices, which can surface ordering bugs that don't appear locally. Add `clearState: true` in `launchApp` to guarantee isolation.
- **Video / screenshot disk usage** — Maestro records every run. On long suites, disk fills fast. Configure retention in CI; locally, `maestro test --no-videos` for fast inner loop.
- **AI-based assertions are non-deterministic** — `assertWithAi` is convenient but the LLM can hallucinate. Reserve for genuinely hard-to-pin assertions; pin everything else with explicit selectors and text.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- [`react-native-detox.md`](./react-native-detox.md) — the RN-specific alternative
- [`native-mobile.md`](./native-mobile.md) — iOS / Android native alternative
- [`flutter-patrol.md`](./flutter-patrol.md) — Flutter alternative
- Maestro docs (external; stable) — https://maestro.mobile.dev/
