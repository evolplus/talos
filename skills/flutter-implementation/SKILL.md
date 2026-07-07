---
name: flutter-implementation
description: Flutter implementation guidance for FE Dev. Use after fe-framework-coding-standard selects Flutter, when building or reviewing widgets, pages, state, navigation, theming, accessibility, selectors, and ordinary Dart/widget tests without changing native platform channels.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# Flutter Implementation

## When to use

Use this after `fe-framework-coding-standard` selects `Flutter` for the task surface. This is the default Flutter implementation skill for widgets, pages, state, theming, navigation, accessibility, instrumentation, and normal unit/widget test work.

For platform channels, permissions, flavors, deep links, app lifecycle, native files, or secure storage, also load `flutter-platform-integration`. For rebuild, list, image, animation, startup, memory, or jank work, also load `flutter-performance`.

## Inputs and outputs

- **Inputs:** task file, SRS `Frontend-Framework:` and §3.4.5 source layout, §3.4.6 frontend env keys, design handoff, Design Element Manifest, visual spec, instrumentation contract, API contracts, current Flutter source tree.
- **Outputs:** Flutter code that fits the existing app architecture, implements every manifest row, uses declared runtime config, exposes stable keys/semantics, preserves accessibility, and updates relevant unit/widget tests.

## Procedure

1. Identify the app architecture:
   - feature/module layout under `lib/`;
   - state approach: Bloc/Cubit, Riverpod, Provider, ValueNotifier, `setState`, or project wrapper;
   - navigation: Navigator, GoRouter, AutoRoute, or project wrapper;
   - theming: `ThemeData`, extensions, generated tokens, shared widgets.
2. Keep boundaries clean:
   - pages/screens own navigation, async state, permissions, and orchestration;
   - widgets render manifest sections and emit typed callbacks;
   - repositories/services stay outside widgets when the project has a data layer.
3. Implement from the Design Element Manifest:
   - render every field, label, placeholder, action, state copy, list/card item, and dialog/snackbar row;
   - preserve Figma order unless product behavior requires a documented deviation;
   - include initial, loading, data, empty, validation error, recoverable error, denied permission, disabled, and refreshing states where applicable.
4. Use Dart and state safely:
   - keep null safety and strong types;
   - convert external data into typed models quickly;
   - avoid `dynamic` except at explicit untyped boundaries;
   - dispose controllers, focus nodes, animation controllers, streams, and subscriptions.
5. Build adaptive mobile UI:
   - use constraints, `LayoutBuilder`, adaptive widgets, and scroll behavior;
   - respect safe areas, keyboard insets, text scaling, platform navigation, and orientation;
   - keep fixed dimensions limited to controls whose format requires them.
6. Add accessibility and instrumentation:
   - add `Key` values and `Semantics(identifier: ...)` only from `docs/instrumentation-contract.md`;
   - use semantic labels, hints, roles, and focus order when visible UI is insufficient;
   - keep minimum touch targets at least 48 x 48 logical pixels unless the project standard is stricter.
7. Test and verify:
   - update widget tests for rendering, validation, and state transitions;
   - update unit tests for blocs/notifiers/repositories when logic changes;
   - update Patrol/Maestro integration tests only when the task changes a critical flow, following `ui-test-execution`;
   - run `dart format`, `flutter analyze`, relevant unit/widget tests, and platform build checks when touched files require it.

## Hard rules

- Do not introduce a second state architecture, router, UI kit, or test framework without an approved ADR.
- Do not hardcode API URLs, environment names, platform domains, secrets, or selector IDs.
- Do not put business rules, network calls, or long-lived subscriptions directly inside `build()`.
- Do not create controllers, streams, or animation controllers without disposal.
- Do not close the task while any required manifest row is missing from source or tests.

## References

- [`../fe-framework-coding-standard/SKILL.md`](../fe-framework-coding-standard/SKILL.md) - framework router and universal FE rules.
- [`../flutter-performance/SKILL.md`](../flutter-performance/SKILL.md) - Flutter rebuild, list, image, animation, and startup performance.
- [`../flutter-platform-integration/SKILL.md`](../flutter-platform-integration/SKILL.md) - platform channels, permissions, flavors, storage, and native files.
- [`../ui-test-execution/SKILL.md`](../ui-test-execution/SKILL.md) - Patrol/Maestro selector, fixture, determinism, and reporting rules.
