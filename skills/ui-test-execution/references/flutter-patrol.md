# Flutter UI Test Execution — Patrol

Reference playbook for QA-Author and QA-Exec when the target surface is a Flutter app and the project uses Patrol on top of Flutter's `integration_test` (the org default per `solution-defaults`).

## When to use this playbook

- SRS §3.4.2 UI Introspection Profile names Flutter as the framework for at least one surface.
- The project hasn't deviated from the Patrol default (any deviation is an ADR per `.claude/skills/adr-author/`).

## Project layout

```
<repo-root>/
├── integration_test/
│   ├── by-us/
│   │   └── us-001-spectator-join_test.dart
│   ├── by-task/
│   │   └── t-014/
│   │       ├── e2e_test.dart
│   │       └── structural_test.dart
│   ├── fixtures/
│   │   ├── users.dart
│   │   └── matches.dart
│   └── helpers/
│       ├── patrol_config.dart
│       └── waits.dart
└── pubspec.yaml                        (patrol as dev_dependency)
```

`integration_test/` is Flutter's standard test directory. Patrol layers on top — no separate folder.

## Selector convention

- Set `Key('<id>')` on testable widgets, or `Semantics(identifier: '<id>')` for accessibility-driven selection.
- The instrumentation contract names the IDs. Don't invent.
- In Patrol specs: `$(#'<id>')` finds by key; `$(Semantics).withIdentifier('<id>')` finds by accessibility identifier.

## File template

```dart
import 'package:patrol/patrol.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fixtures/users.dart';
import '../fixtures/matches.dart';

void main() {
  patrolTest(
    'TC-US001-001 — Spectator joins live tournament match end-to-end',
    ($) async {
      // Arrange
      final viewer = testUsers.spectatorVN;
      final match = await seedMatch(state: 'in-progress', publiclySpectatable: true);

      // Act
      await $.pumpWidgetAndSettle(SpectatorApp());
      await $(#emailField).enterText(viewer.email);
      await $(#passwordField).enterText(viewer.password);
      await $(#loginButton).tap();
      await $(#spectateButton(match.id)).tap();

      // Assert
      expect($(#viewerCount), findsOneWidget);
      expect($(#liveBadge), findsOneWidget);
    },
  );
}
```

## Invocation

```sh
patrol test --target integration_test/by-us/us-001-spectator-join_test.dart \
  --dart-define=BASE_URL=$BASE_URL \
  --dart-define=API_BASE_URL=$API_BASE_URL
```

Per-platform variants (`--device <iOS sim id>` for iOS, `--device <Android emulator>` for Android).

## Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── patrol-report/
├── screenshots/
└── logs/
```

## Visual diff

Patrol supports screenshot comparison via `patrolTest`'s screenshot helper or the `golden_toolkit` package layered on top. Reserve for `Visual-Critical: yes` surfaces. Pin the rendering simulator/emulator version in the deploy report's `## Test Environment` block.

## Common pitfalls

- **`pumpAndSettle` timeouts** — animations that never settle (loaders, ongoing pulses) hang the test. Use `$.pump(<duration>)` with explicit waits on the condition, not pump-and-settle.
- **Permissions / system dialogs** — Patrol's value over stock `integration_test` is handling these. Use `await $.native.<action>` for system-level interactions.
- **Hot reload state leaks** — tests must restart the app between runs. `integration_test` resets per `patrolTest`; verify your fixtures don't carry state.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- Patrol docs (external; stable) — https://patrol.leancode.co/
