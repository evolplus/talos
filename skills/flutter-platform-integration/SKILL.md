---
name: flutter-platform-integration
description: Flutter native/platform integration guidance for FE Dev. Use when a task touches platform channels, plugins, permissions, flavors, dart-define config, deep links, push notifications, secure storage, app lifecycle, native iOS/Android files, or platform-specific behavior.
agents: [fe-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# Flutter Platform Integration

## When to use

Use this for Flutter work that crosses the Dart/native boundary: platform channels, plugins, permissions, flavors, app config, deep links, push notifications, background tasks, secure storage, lifecycle hooks, or iOS/Android-specific behavior. Load it alongside `flutter-implementation`.

## Inputs and outputs

- **Inputs:** SRS/architecture permission and platform requirements, API contracts, env configuration, existing Flutter plugin/channel setup, iOS/Android project files, current flavor/build configuration.
- **Outputs:** platform changes that are approved by architecture, configured per environment, covered by smoke/build checks, and documented in task notes or deploy reports when QA/DevOps needs them.

## Procedure

1. Classify the integration:
   - package/plugin only;
   - MethodChannel/EventChannel/FFI/custom native code;
   - flavor/build-config change;
   - permission/deep-link/push/background lifecycle change.
2. Check authorization before changing platform capabilities:
   - new plugins, permissions, background modes, associated domains, push services, and native APIs require architecture/dependency approval;
   - if the requirement is absent, halt with an OQ instead of silently adding capability.
3. Implement environment-safe config:
   - use SRS §3.4.6 keys and the existing config loader;
   - pass non-secret values through the established `--dart-define`, flavor file, or build-time config path;
   - keep dev/staging/prod endpoints out of Dart and native source literals.
4. Keep permission UX complete:
   - update iOS usage descriptions and Android permission declarations;
   - provide user-facing rationale/copy where required by the feature;
   - handle denied, restricted, unavailable, and recoverable states in UI.
5. Isolate platform differences:
   - wrap platform calls behind services/repositories;
   - keep widgets independent of channel names and native file paths;
   - use typed DTOs for channel payloads and document nullable/error cases.
6. Verify platform behavior:
   - run at least one affected platform build/check when native files, plugins, flavors, or permissions change;
   - test deep links, push/open flows, storage migration, channel error handling, or lifecycle paths on the relevant simulator/emulator/device;
   - record any platform that could not be checked.

## Hard rules

- Do not add platform capabilities, permissions, plugins, or native APIs without SRS/architecture coverage.
- Do not store tokens or secrets in plain local storage.
- Do not hardcode environment endpoints in Dart, Gradle, Xcode, plist, or manifest files.
- Do not let platform-channel errors disappear into generic UI failure; map them to user-visible or logged failure states per architecture.

## References

- [`../flutter-implementation/SKILL.md`](../flutter-implementation/SKILL.md) - baseline Flutter implementation discipline.
- [`../flutter-performance/SKILL.md`](../flutter-performance/SKILL.md) - performance review for channel-heavy or platform-heavy changes.
- [`../third-party-dependency-evaluation/SKILL.md`](../third-party-dependency-evaluation/SKILL.md) - dependency approval for plugins.
- [`../local-deployment/SKILL.md`](../local-deployment/SKILL.md) - deploy/env evidence consumed by QA.
