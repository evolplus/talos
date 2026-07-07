---
name: flutter-performance
description: Flutter performance guidance for FE Dev. Use for slow widgets, rebuild churn, jank, large lists, image-heavy UI, animations, startup time, memory pressure, isolates, expensive layout/paint, or performance review of Flutter code.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# Flutter Performance

## When to use

Use this when a Flutter task touches performance-sensitive UI: large lists, image-heavy layouts, charts, animations, startup, memory pressure, expensive rebuilds, platform-channel traffic, or jank. Load it alongside `flutter-implementation`.

## Inputs and outputs

- **Inputs:** affected widgets/pages, existing profiling or QA evidence, device/emulator target, design manifest, data size assumptions, current state/image/list/animation libraries.
- **Outputs:** targeted performance changes with preserved behavior, measurable before/after evidence when feasible, and tests/checks that prove no manifest or accessibility regression.

## Procedure

1. Define the performance surface:
   - name the slow path, expected data volume, device class, platform, and success criterion;
   - inspect existing Flutter DevTools/profile evidence before changing code when available.
2. Control rebuilds:
   - prefer `const` constructors and immutable inputs;
   - keep state close to the widget subtree that changes;
   - use selectors/consumers/builders from the project's state library to narrow rebuild scope;
   - avoid allocating expensive derived collections in `build()`.
3. Tune lists and scrolling:
   - use `ListView.builder`, `SliverList`, grids, or project virtualized components for dynamic collections;
   - provide stable keys where item identity matters;
   - avoid `shrinkWrap` and nested scrollables on large lists unless the layout truly requires them;
   - keep empty/loading/refresh states explicit.
4. Handle image and asset cost:
   - request appropriately sized images;
   - use caching through the project image pipeline;
   - avoid decoding oversized images in hot list cells;
   - use placeholders and error widgets that match the visual spec.
5. Keep animation smooth:
   - prefer implicit animations or existing animation primitives for simple transitions;
   - keep animation controllers scoped and disposed;
   - avoid work in listeners that runs every frame unless it is trivial;
   - respect reduced-motion behavior when the project supports it.
6. Move heavy work off the UI isolate:
   - use existing repository/background mechanisms first;
   - consider isolates/`compute` for CPU-heavy transforms only when serialization cost is worth it;
   - do not parse large payloads synchronously in widget code.
7. Verify:
   - run the narrowest repeatable check: profile build smoke, DevTools frame capture, list scroll test, animation test, or memory check;
   - record unmeasured performance assumptions in task notes instead of presenting them as proof.

## Hard rules

- Do not optimize by weakening accessibility, selector stability, state coverage, or manifest completeness.
- Do not add a new image/list/state/performance library without dependency approval.
- Do not solve rebuild churn by making shared mutable global state.
- Do not tune only in debug mode when the issue is production performance.

## References

- [`../flutter-implementation/SKILL.md`](../flutter-implementation/SKILL.md) - baseline Flutter implementation discipline.
- [`../third-party-dependency-evaluation/SKILL.md`](../third-party-dependency-evaluation/SKILL.md) - dependency approval for new performance libraries.
- [`../ui-test-execution/SKILL.md`](../ui-test-execution/SKILL.md) - UI regression checks after performance changes.
