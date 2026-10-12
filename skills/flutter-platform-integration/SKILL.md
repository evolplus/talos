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
7. **When you cannot build — operator-run build handoff.** If your sandbox has no Flutter/Android/Xcode toolchain, a build-config, plugin, SDK-level or native change is *unverified* until someone else builds it. Do not describe a static read as "compatibility confirmed". Instead:
   - **Read the failing component's own source before proposing a fix.** For a plugin build error, open the plugin's `android/build.gradle` / `ios/*.podspec` in the package cache (`~/.pub-cache/hosted/pub.dev/<pkg>-<ver>/`) or the pub.dev archive. A plugin that hard-codes `compileSdk 34` cannot be fixed from the app's Gradle files, and no amount of root-project override will make it so. Cite the file and line in the task notes.
   - **Write the build handoff into the deploy report / task notes**, so the operator's build can be checked against it — not just "run `flutter build apk`":
     - exact command, flavor and `--dart-define-from-file` used;
     - host prerequisites (`sdkmanager "platforms;android-NN"`, Xcode/CocoaPods version, FVM pin);
     - **release-signing check** — the release build type must be signed with the registered key, not the debug fallback. Name how signing engages (env vars or `android/key.properties`) and give the verification: `apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk | grep SHA-1` must equal the SHA-1 registered for Google Sign-In / Firebase / Play. A debug-signed release builds and launches fine and then fails every Google sign-in with `ApiException: 10`;
     - the smoke the operator should run on the installed build (sign-in, the changed flow) and what "pass" looks like.
   - Propose `ready-for-deploy` with the verification explicitly marked operator-owed. A failed operator build is a reopen; the second one routes to diagnosis (`orchestrator-operating-rules.md` §9 Step 7.6), not to another speculative attempt.

   Why: a plugin that hard-codes its own `compileSdk` cannot be fixed from the app's Gradle files, and guessing from the error message costs an operator build per guess. Separately, a rebuild that silently falls back to debug signing installs and launches normally and then fails every Google sign-in — a handoff that names SDK prerequisites but not the signing check lets that ship.

## Hard rules

- Do not add platform capabilities, permissions, plugins, or native APIs without SRS/architecture coverage.
- Do not store tokens or secrets in plain local storage.
- Do not hardcode environment endpoints in Dart, Gradle, Xcode, plist, or manifest files.
- Do not mark a native/build-config change verified from a static read. If you could not build it, say so and hand off the build with the checks in Procedure step 7.
- Do not let platform-channel errors disappear into generic UI failure; map them to user-visible or logged failure states per architecture.

## References

- [`../flutter-implementation/SKILL.md`](../flutter-implementation/SKILL.md) - baseline Flutter implementation discipline.
- [`../flutter-performance/SKILL.md`](../flutter-performance/SKILL.md) - performance review for channel-heavy or platform-heavy changes.
- [`../third-party-dependency-evaluation/SKILL.md`](../third-party-dependency-evaluation/SKILL.md) - dependency approval for plugins.
- [`../local-deployment/SKILL.md`](../local-deployment/SKILL.md) - deploy/env evidence consumed by QA.
