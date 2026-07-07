# Flutter Coding Standard

Read this when `fe-framework-coding-standard` selects Flutter. This file is a routing card: load the focused mobile skill(s) below instead of trying to keep the whole Flutter playbook in one context block.

## Skill map

| Work type | Load |
|---|---|
| Any Flutter widget, page, state, navigation, theming, accessibility, key/semantics, or ordinary Dart/widget test work | [`../../flutter-implementation/SKILL.md`](../../flutter-implementation/SKILL.md) |
| Slow widgets, rebuild churn, jank, large lists, image-heavy UI, animations, startup, memory, isolates, or expensive layout/paint review | [`../../flutter-performance/SKILL.md`](../../flutter-performance/SKILL.md) |
| Platform channels, plugins, permissions, flavors, dart-define config, deep links, push notifications, secure storage, lifecycle, native iOS/Android files, or platform-specific behavior | [`../../flutter-platform-integration/SKILL.md`](../../flutter-platform-integration/SKILL.md) |
| Patrol/Maestro executable UI specs or QA runner behavior | [`../../ui-test-execution/SKILL.md`](../../ui-test-execution/SKILL.md) and [`../../ui-test-execution/references/flutter-patrol.md`](../../ui-test-execution/references/flutter-patrol.md) when Patrol applies |

## Loading rule

1. Always load `flutter-implementation` before editing Flutter source.
2. Add `flutter-performance` only when the task has performance risk or a performance acceptance criterion.
3. Add `flutter-platform-integration` only when the task crosses the Dart/native boundary or changes platform config.
4. Add `ui-test-execution` when authoring/updating executable UI tests or when a selector/test-runner decision is needed.

## Quick guardrails

- Keep `docs/SRS.md` `Frontend-Framework:` authoritative; package files are only a drift check.
- Use SRS §3.4.6 frontend config keys for API/base URLs; never hardcode environment endpoints.
- Implement every Design Element Manifest row before proposing `ready-for-deploy`.
- Do not add plugins, platform permissions, platform channels, or mobile dependencies without architecture/dependency approval.
