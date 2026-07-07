---
name: react-native-performance
description: React Native and Expo performance guidance for FE Dev. Use for slow screens, large lists, image-heavy UI, animations, startup time, memory pressure, expensive renders, bridge/native-module overhead, or performance review of React Native code.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# React Native Performance

## When to use

Use this when a React Native/Expo task touches performance-sensitive UI: long lists, heavy images, charts, animations, frequent updates, navigation startup, slow gestures, memory pressure, or native bridge traffic. Load it alongside `react-native-implementation`.

## Inputs and outputs

- **Inputs:** affected RN screens/components, existing profiling or QA evidence, device/emulator target, design manifest, data size assumptions, current state/image/list/animation libraries.
- **Outputs:** targeted performance changes with preserved behavior, measurable before/after evidence when feasible, and tests/checks that prove no manifest or accessibility regression.

## Procedure

1. Define the performance surface:
   - name the slow path, expected data volume, device class, platform, and success criterion;
   - inspect existing profiler/log evidence before changing code when available.
2. Reduce render churn:
   - avoid recreating expensive arrays, callbacks, and `renderItem` closures for large lists;
   - memoize only when it removes measured or obvious repeated work;
   - keep derived data in selectors/memoized helpers, not inline render logic;
   - split components around independently changing state.
3. Tune lists:
   - use `FlatList`, `SectionList`, or the project's virtualized list library for dynamic collections;
   - provide stable keys, `getItemLayout` when row height is fixed, bounded initial render counts, and explicit empty/loading states;
   - avoid nested scroll views around virtualized lists unless the project pattern proves it safe.
4. Handle images and assets:
   - serve appropriately sized assets;
   - use the project's image cache/loader;
   - avoid decoding oversized local images inside frequently mounted cells;
   - prefetch only high-confidence next-step assets.
5. Keep animation and gestures off the busy JS path when the project stack supports it:
   - prefer Reanimated/native-driver/project animation primitives for continuous motion;
   - avoid state updates on every frame from JS;
   - respect reduced-motion settings.
6. Watch bridge/native overhead:
   - batch native calls and analytics events where the project already has a batching layer;
   - avoid polling native modules from render/effect loops;
   - keep platform adapters small and testable.
7. Verify:
   - run the narrowest repeatable check: profiler capture, release/profile build smoke test, list scroll test, animation interaction test, or memory check;
   - record unmeasured performance assumptions in the task notes instead of presenting them as proof.

## Hard rules

- Do not add blanket `memo`, `useCallback`, or `useMemo` noise without a concrete render-cost reason.
- Do not trade accessibility, selector stability, or manifest completeness for speed.
- Do not introduce a new list/image/animation library without dependency approval.
- Do not optimize only on a high-end simulator when the task targets production mobile users.

## References

- [`../react-native-implementation/SKILL.md`](../react-native-implementation/SKILL.md) - baseline RN implementation discipline.
- [`../third-party-dependency-evaluation/SKILL.md`](../third-party-dependency-evaluation/SKILL.md) - dependency approval for new performance libraries.
- [`../ui-test-execution/SKILL.md`](../ui-test-execution/SKILL.md) - UI regression checks after performance changes.
