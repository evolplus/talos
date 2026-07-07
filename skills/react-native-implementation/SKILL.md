---
name: react-native-implementation
description: React Native and Expo implementation guidance for FE Dev. Use after fe-framework-coding-standard selects React Native, when building or reviewing screens, components, navigation, state, styling, accessibility, selectors, and ordinary tests without changing native modules.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# React Native Implementation

## When to use

Use this after `fe-framework-coding-standard` selects `React Native` for the task surface. This is the default React Native implementation skill for UI, state, navigation, styling, accessibility, instrumentation, and normal component/unit test work.

For native modules, permissions, deep links, app config, or platform files, also load `react-native-platform-integration`. For large lists, image-heavy screens, animations, slow interactions, startup, or memory issues, also load `react-native-performance`.

## Inputs and outputs

- **Inputs:** task file, SRS `Frontend-Framework:` and §3.4.5 source layout, §3.4.6 frontend env keys, design handoff, Design Element Manifest, visual spec, instrumentation contract, API contracts, current RN/Expo source tree.
- **Outputs:** React Native/Expo code that fits the existing app architecture, implements every manifest row, uses declared runtime config, exposes stable selectors, preserves accessibility, and updates relevant unit/component tests.

## Procedure

1. Identify the app shape before editing:
   - Expo managed / Expo prebuild / bare React Native;
   - routing: Expo Router, React Navigation, or project wrapper;
   - state: project server-state and client-state libraries;
   - styling: design system, tokens, StyleSheet, NativeWind, Tamagui, Dripsy, Restyle, or local convention.
2. Keep screen boundaries thin:
   - screens own route params, navigation, permissions, data loading, and orchestration;
   - feature components render manifest sections and emit typed events;
   - hooks/services own reusable data access and side effects.
3. Implement from the Design Element Manifest:
   - render every field, label, placeholder, action, state copy, list/card item, and modal/toast row;
   - preserve Figma order unless product behavior requires a documented deviation;
   - include loading, empty, validation error, recoverable error, disabled, permission-denied, and optimistic rollback states where applicable.
4. Use project-native state and data patterns:
   - do not add a store/query library for one task;
   - guard stale async results when route params change or screens unmount;
   - keep optimistic updates reversible and user-visible on failure;
   - store only durable preferences in async storage and secrets only in approved secure storage.
5. Build mobile-safe UI:
   - handle safe areas, status bars, keyboard overlap, home indicators, scroll insets, orientation, and text scaling;
   - use `Pressable` or project button components for interactions;
   - use `FlatList` / `SectionList` for dynamic or large lists with stable keys and empty/refresh states.
6. Add accessibility and instrumentation:
   - use `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint` when visible content is insufficient;
   - add `testID` values only from `docs/instrumentation-contract.md`;
   - keep a minimum 44 x 44 logical pixel touch target unless the project standard is stricter.
7. Test and verify:
   - update Jest / React Native Testing Library tests for rendering, validation, and state transitions;
   - update Detox/Maestro only when the task changes a critical flow, following `ui-test-execution`;
   - run the project's lint, typecheck, Jest, and relevant platform build/test command when touched files require it.

## Hard rules

- Do not mix routing approaches or introduce a new state/styling/test framework without an approved ADR.
- Do not hardcode API URLs, environment names, platform domains, secrets, or selector IDs.
- Do not scatter `Platform.OS` branches through UI trees when a platform adapter or `.ios.tsx` / `.android.tsx` file is clearer.
- Do not use DOM APIs, browser-only globals, or CSS assumptions in shared React Native code.
- Do not close the task while any required manifest row is missing from source or tests.

## References

- [`../fe-framework-coding-standard/SKILL.md`](../fe-framework-coding-standard/SKILL.md) - framework router and universal FE rules.
- [`../react-native-performance/SKILL.md`](../react-native-performance/SKILL.md) - React Native render, list, image, animation, and startup performance.
- [`../react-native-platform-integration/SKILL.md`](../react-native-platform-integration/SKILL.md) - native modules, permissions, deep links, app config, storage, and platform files.
- [`../ui-test-execution/SKILL.md`](../ui-test-execution/SKILL.md) - Detox/Maestro selector, fixture, determinism, and reporting rules.
