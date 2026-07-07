# React Native Coding Standard

Read this when `fe-framework-coding-standard` selects React Native or Expo. This file is a routing card: load the focused mobile skill(s) below instead of trying to keep the whole React Native playbook in one context block.

## Skill map

| Work type | Load |
|---|---|
| Any React Native/Expo screen, component, navigation, state, styling, accessibility, or selector work | [`../../react-native-implementation/SKILL.md`](../../react-native-implementation/SKILL.md) |
| Slow screens, large lists, image-heavy UI, animations, startup, memory, bridge overhead, or render-cost review | [`../../react-native-performance/SKILL.md`](../../react-native-performance/SKILL.md) |
| Native modules, permissions, deep links, push notifications, secure storage, app lifecycle, Expo config, iOS/Android files, build settings, or platform-specific behavior | [`../../react-native-platform-integration/SKILL.md`](../../react-native-platform-integration/SKILL.md) |
| Detox/Maestro executable UI specs or QA runner behavior | [`../../ui-test-execution/SKILL.md`](../../ui-test-execution/SKILL.md) and [`../../ui-test-execution/references/react-native-detox.md`](../../ui-test-execution/references/react-native-detox.md) when Detox applies |

## Loading rule

1. Always load `react-native-implementation` before editing React Native source.
2. Add `react-native-performance` only when the task has performance risk or a performance acceptance criterion.
3. Add `react-native-platform-integration` only when the task crosses the JS/native boundary or changes platform config.
4. Add `ui-test-execution` when authoring/updating executable UI tests or when a selector/test-runner decision is needed.

## Quick guardrails

- Keep `docs/SRS.md` `Frontend-Framework:` authoritative; package files are only a drift check.
- Use SRS §3.4.6 frontend config keys for API/base URLs; never hardcode environment endpoints.
- Implement every Design Element Manifest row before proposing `ready-for-deploy`.
- Do not add native permissions/modules or mobile dependencies without architecture/dependency approval.
