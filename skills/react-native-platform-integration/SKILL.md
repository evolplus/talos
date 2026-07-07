---
name: react-native-platform-integration
description: React Native and Expo native/platform integration guidance for FE Dev. Use when a task touches Expo config, native iOS/Android files, permissions, deep links, push notifications, secure storage, app lifecycle, native modules, build settings, or platform-specific behavior.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# React Native Platform Integration

## When to use

Use this for React Native/Expo work that crosses the JS/native boundary: native modules, permissions, platform files, app config, deep links, push notifications, background tasks, secure storage, lifecycle hooks, or iOS/Android-specific behavior. Load it alongside `react-native-implementation`.

## Inputs and outputs

- **Inputs:** SRS/architecture permission and platform requirements, API contracts, env configuration, existing Expo/bare RN setup, iOS/Android project files, current native module inventory.
- **Outputs:** platform changes that are approved by architecture, configured per environment, covered by smoke/build checks, and documented in task notes or deploy reports when QA/DevOps needs them.

## Procedure

1. Classify the runtime:
   - Expo managed: prefer config plugins and Expo APIs already present;
   - Expo prebuild: understand generated native files and project rules before editing;
   - bare RN: edit native iOS/Android files directly only when the task requires it.
2. Check authorization before changing platform capabilities:
   - new permissions, native modules, background modes, push notifications, app groups, associated domains, and platform services require architecture/dependency approval;
   - if the requirement is absent, halt with an OQ instead of silently adding capability.
3. Implement environment-safe config:
   - use SRS §3.4.6 keys and existing config loaders;
   - keep dev/staging/prod endpoints out of source literals;
   - expose only non-secret values to JS bundles.
4. Keep permission UX complete:
   - update iOS usage descriptions and Android permission declarations;
   - provide user-facing rationale/copy where required by the feature;
   - handle denied, restricted, unavailable, and recoverable states in UI.
5. Isolate platform differences:
   - use `.ios.tsx` / `.android.tsx`, platform adapters, or config modules for real divergence;
   - keep shared UI unaware of native file details.
6. Verify platform behavior:
   - run at least one affected platform build/check when native files or permissions change;
   - test deep links, push/open flows, storage migration, or lifecycle paths on the relevant simulator/emulator/device;
   - record any platform that could not be checked.

## Hard rules

- Do not add native capabilities or permissions without SRS/architecture coverage.
- Do not store tokens or secrets in plain async storage.
- Do not edit generated native files in Expo managed/prebuild projects unless that is the established project workflow.
- Do not let iOS and Android selector IDs diverge unless the instrumentation contract explicitly declares platform-specific IDs.

## References

- [`../react-native-implementation/SKILL.md`](../react-native-implementation/SKILL.md) - baseline RN implementation discipline.
- [`../react-native-performance/SKILL.md`](../react-native-performance/SKILL.md) - performance review for native bridge or platform-heavy changes.
- [`../third-party-dependency-evaluation/SKILL.md`](../third-party-dependency-evaluation/SKILL.md) - dependency approval for native modules.
- [`../local-deployment/SKILL.md`](../local-deployment/SKILL.md) - deploy/env evidence consumed by QA.
