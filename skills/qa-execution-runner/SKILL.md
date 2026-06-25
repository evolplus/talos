---
name: qa-execution-runner
description: QA-Exec run contract for executing authored test cases against the deployed build. Use when QA-Exec is dispatched for a task in-test to gather by-us/by-task test cases, check executable specs and instrumentation coverage, invoke the proper runner, execute UI tiers, validate visual specs, route failures, and write docs/qa-reports/<task-id>.md plus artifacts.
agents: [qa-exec]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# QA Execution Runner

## Use

Use this skill for every QA-Exec dispatch.

## Inputs

- Target task file and linked US/FRs
- `docs/test-cases/by-us/<US-ID>/` and `docs/test-cases/by-task/<task-id>/`
- Executable specs named by each TC
- `docs/deploy-reports/<task-id>.md`
- UI artifacts: design refs, visual specs, instrumentation contract, UI refs

## Procedure

1. Gather test cases:
   - read linked US IDs and FR IDs from the task;
   - load every linked by-us functional TC;
   - load task-scoped structural/api/e2e/functional TCs;
   - halt on missing expected coverage.
2. For UI tasks, enforce strict artifact presence:
   - by-task TC directory with at least one TC;
   - `docs/uiux/visual-specs/<task-id>.md`;
   - instrumentation contract when UI selectors/testIDs are expected.
3. Run bidirectional instrumentation coverage for UI tasks:
   - every contract-declared testID appears in at least one spec;
   - when bundle is reachable, every contract-declared testID ships in the bundle.
   - Route spec gaps to QA-Author and bundle gaps to FE Dev.
4. Pre-run checks:
   - parse deploy report `## Test Environment`;
   - verify base URLs, fixtures, env vars, build/commit/instrumentation identity;
   - verify `env_files`, `env_templates`, and `env_validation` are present; `compose_config_quiet` is `pass`; `missing_required_env` is `none`; and `secret_values_redacted` is `true`;
   - verify every `Executable:` file exists;
   - grep executable specs for `TODO: instrumentation-contract`; any hit is `blocked`.
5. Skip deprecated US test cases with reason `deprecated-us`; report the skip.
6. Select runner from `solution-defaults`, project ADRs, and SRS UI Introspection Profile. Load `ui-test-execution` and any relevant runner reference.
7. Invoke the runner against the deployed environment, never against production data.
8. For UI tasks:
   - Tier 1 functional always;
   - Tier 2 structural/token always where introspection allows;
   - Tier 3 visual diff only when SRS marks Visual-Critical.
9. Validate visual spec before UI execution:
   - `Status: Generated`;
   - Figma version matches confirmed task version;
   - handoff hash matches current handoff.
10. Report each TC as `pass`, `fail`, `blocked`, or `skipped`.
11. For failures, attach actual vs expected, logs/screenshots/traces/diffs, and suspected track.
12. Write `docs/qa-reports/<task-id>.md` and artifacts under `docs/qa-reports/<task-id>/`.
13. Emit `plan-update.json`: `in-test -> done` only when no fail/blocked cases remain; otherwise `in-test -> failed`.

## UI Tiers

- **Tier 1 functional:** required elements, copy, interactions, form validation, required states, and accessibility checks named by the SRS.
- **Tier 2 structural/token:** layout, spacing, colors, typography, component hierarchy, and required states from `docs/uiux/visual-specs/<task-id>.md`.
- **Tier 3 visual fidelity:** screenshot diff against approved references, only for `Visual-Critical: yes`.

Report Tier 2 per component/property. A component passes only when every non-skipped property in every required state passes.

## No-Introspection Fallback

Use this only when SRS §3.4.3 explicitly accepts a non-introspectable UI surface, such as a Unity build where AltTester was rejected.

1. Confirm the SRS records the acceptance decision. If not, halt with `blocked: introspection-gap`.
2. Use the coordinate + template registry pattern:
   - fixed viewport/device resolution;
   - screenshot capture per state;
   - registry row per component with bounds, coordinate target, template image, source handoff node, and tolerance;
   - artifacts under `docs/qa-reports/<task-id>/registry/`.
3. Treat coordinate/template checks as fragile. If this is not a one-off transitional path, file a high-severity open issue recommending instrumentation.
4. Do not claim Tier 2 properties that cannot be observed. Mark them `skipped: framework-not-introspectable`.

## Artifact Layout

Every run writes artifacts under `docs/qa-reports/<task-id>/`:

```text
docs/qa-reports/<task-id>/
|-- playwright-report/      (or framework-equivalent HTML report)
|-- traces/                 (one trace.zip per failing test, named TC-ID.trace.zip)
|-- screenshots/            (test-captured screenshots, named TC-ID.<step>.png)
|-- visual-diffs/           (Tier 3 only)
|-- registry/               (coordinate/template fallback)
|-- xcresult/               (iOS only)
|-- android-report/         (Android only)
`-- logs/                   (browser console, native logs, network captures)
```

The markdown report at `docs/qa-reports/<task-id>.md` links the supporting artifact for each fail/blocked/skipped item.

## Failure Tracks

- `be`: server/data/status error.
- `fe`: UI render/behavior error with correct data.
- `integration`: contract/auth/CORS/boundary mismatch.
- `design-drift`: SRS/design mismatch requiring BA + Designer reconciliation.
- `introspection-gap`: tooling cannot verify the property.
- `instrumentation-violation`: missing testIDs/accessibility/instrumentation.
- `unknown`: TL diagnoses.

## Hard Rules

- Never modify build, code, or tests to make a run pass.
- Never declare done with failed or blocked cases.
- Never silently skip verification.
- Missing spec files, stale visual specs, build identity mismatch, and unresolved selector TODOs are blocked states.
- Missing or failed deploy-report env validation is a blocked state routed back to DevOps. QA-Exec never guesses local `.env` behavior.
- Flaky is failure until proven otherwise.
- Per-property UI reporting is mandatory for Tier 2.
- Commit before signaling done.
