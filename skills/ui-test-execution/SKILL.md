---
name: ui-test-execution
description: Framework-agnostic principles for executing UI tests against the running build — how markdown test cases map to executable specs, selector strategy by platform, fixture discipline, determinism rules, and visual-diff guidance. Consult when QA-Author writes executable specs or when QA-Exec invokes a test runner against a deployed build.
agents: [qa-author, qa-exec]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# UI Test Execution

## When to use

You are either:

- **QA-Author**, writing executable test specs alongside the markdown TCs at `docs/test-cases/by-us/<US-NNN>/` and `docs/test-cases/by-task/<task-id>/`, or
- **QA-Exec**, invoking a test runner against the deployed local environment to produce a `docs/qa-reports/<task-id>.md`.

This skill gives you the principles that apply across runners (Playwright for web, Patrol for Flutter, XCUITest/Espresso for native mobile, AltTester for Unity). Per-runner playbooks live in `references/`. Pick the matching playbook AFTER reading this skill.

## Inputs and outputs

- **Inputs (QA-Author):** the markdown TC you're authoring, the project's chosen test runner (per `solution-defaults` or SRS §3.4.2 UI Introspection Profile), the test directory path
- **Outputs (QA-Author):** a markdown TC carrying an `Executable: <path>` field AND a runnable spec file at that path (one `test()` per TC, or multiple per file with explicit TC-ID mapping)
- **Inputs (QA-Exec):** the test cases for the task, the deployed build's `Test Environment` block from `docs/deploy-reports/<task-id>.md` (carrying `base_url`, fixtures, env vars)
- **Outputs (QA-Exec):** test execution artifacts under `docs/qa-reports/<task-id>/` (HTML report, traces, screenshots, visual-diffs) + the per-property report in `docs/qa-reports/<task-id>.md`

## Tool selection — defer to solution-defaults

The kit's `solution-defaults` skill names the org-level default per platform:

| Platform | Default | Selector convention |
|---|---|---|
| Web | Playwright | `data-testid="<id>"` → `page.getByTestId('<id>')` |
| React Native | Detox | `testID="<id>"` → `element(by.id('<id>'))` |
| Flutter | Patrol | `Key('<id>')` and `Semantics(identifier: '<id>')` → `$(#'<id>')` |
| Native iOS | XCUITest | `accessibilityIdentifier = "<id>"` → `app.buttons["<id>"]` |
| Native Android | Espresso | `contentDescription="<id>"` → `onView(withContentDescription("<id>"))` |
| Unity | AltTester | named `AltElement` → `altDriver.FindObject(By.NAME, "<id>")` |
| Cross-platform mobile (alternative) | Maestro | one identifier per platform per the instrumentation contract → `tapOn: id: "<id>"` (YAML flows, works on iOS native / Android native / RN / Flutter) |

Deviating from the default requires an ADR per `.claude/skills/adr-author/`. Cite the existing default and justify.

**Maestro as a cross-platform alternative.** For projects with multiple mobile stacks (Flutter app + RN app + native iOS app, etc.), Maestro can replace per-stack runners with one YAML-driven tool. Trade-off: simpler authoring + shared flows across platforms, but less depth than Detox/XCUITest/Patrol for stack-specific scenarios. See [`references/cross-platform-maestro.md`](./references/cross-platform-maestro.md) for the decision rubric. Adopting Maestro is an ADR; the kit doesn't make it the default because most projects are stack-committed.

## TC ↔ Spec mapping convention

Every markdown TC carries an `Executable:` field that points at exactly one spec file. The spec file contains one `test()` per TC ID:

```markdown
### TC-US001-001 — Spectator joins live tournament match end-to-end
- Executable: e2e/specs/us-001-spectator-join.spec.ts
- Linked anchor: US-001.MF-1..US-001.MF-6, US-001.PC-1
```

Inside the spec, the `test()` name must contain the TC ID so the report ties back:

```typescript
test('TC-US001-001 — Spectator joins live tournament match end-to-end', async ({ page }) => {
  // …
});
```

**Why ID-in-test-name:** test runners report by test name. When a test fails, the report carries `TC-US001-001` verbatim, which the QA-Exec markdown report cites unchanged. No lossy translation.

### One spec per US (or per task), multiple TCs per spec

- `by-us` mode TCs → `e2e/specs/us-<NNN>-<slug>.spec.ts` (one file per US, multiple `test()` blocks, one per TC).
- `by-task` mode TCs → `e2e/specs/task-<NNN>-<slug>.spec.ts` (one file per task; layers like `api`, `e2e`, `structural` either become sub-folders `e2e/api/`, `e2e/structural/` or get a layer suffix in the file name — pick one project-wide and stick to it).

Don't proliferate spec files per TC; that fragments the runner and makes parallelism harder. One file per US / per task is the right granularity.

## Selector discipline

- **Selectors come from the instrumentation contract.** Never invent a selector. The contract at `docs/instrumentation-contract.md` is mandatory for any UI-bearing SRS per `.claude/skills/sa-architecture-design/`; it declares every testID the project commits to.
- **When QA-Author Pass 1 needs a selector the contract doesn't yet declare** (SA still in flight), write the literal string `TODO: instrumentation-contract` in the spec file's comment syntax AND file a paired open-issue with `Category: selector-pending-contract`. See `.claude/skills/qa-author-by-us/` for marker syntax per framework. **Pass 2 of by-us mode** (post-SA-instrumentation) backfills these.
- **Prefer accessibility-driven selectors over data-attributes when available** — `getByRole`, `getByLabel`, `getByPlaceholder` in Playwright; equivalent in other frameworks. They double as accessibility checks. The instrumentation contract declares accessibility identifiers, not just `data-testid` strings.
- **Never use CSS / XPath / nth-child selectors** unless the framework offers nothing else. They break on every refactor.
- **Never use text content as the primary selector for stable elements.** Text changes with locale and copy edits. testID is stable.

## Fixture discipline

- **Per-test isolation.** Each test seeds its own state (DB rows, account, session) and tears down on completion. Shared state across tests = flakes.
- **Fixtures live in `e2e/fixtures/`** (or framework-equivalent). Schema versions match the API contract version they target.
- **Never reach into the production DB.** Tests run against the deployed local env's DB seeded by the fixture. If the local env reuses prod data, that's a DevOps deployment defect — raise an open-issue.
- **Test users are explicit fixtures**, not shared "QA accounts". Names like `test-spectator-vn-001` make the trace readable.

## Determinism rules

Flaky tests are failures until proven otherwise (QA-Exec hard rule). To stay deterministic:

1. **No `sleep` / `wait(<ms>)`.** Wait on the condition (element present, network response received, state value changed), not on time.
2. **Deterministic clock.** If the SUT does anything time-dependent (countdowns, expiry), inject a fixed clock via test fixture.
3. **Network requests are explicit.** Either mock at the network layer (Playwright `page.route()`) or pin the test against a known fixture in the deployed env. Half-pinned tests fail intermittently.
4. **No `Math.random`.** Seed any randomness used in setup.
5. **Single observable per assertion.** A test that asserts "the page loads AND the user is logged in AND the dashboard renders" hides which step failed. Split.

## Visual diff guidance

Visual diff (Tier 3 in QA-Exec) is the most-flaky tier. Use sparingly:

- **Only for surfaces with SRS `Visual-Critical: yes`.** Visual diff on a utility screen costs more than it catches.
- **Pin the rendering environment** — use a container image with fixed fonts and antialiasing. Without this, OS-level differences (macOS vs Linux runner) produce false diffs.
- **Threshold is explicit** — typically 0.1% pixel difference at the same viewport. Higher = visual regressions slip through; lower = noise.
- **Update the baseline only with human approval** — never auto-update on green. A "passing diff that matches yesterday's diff" is not the same as "matches the design."
- **Default to framework-built-in** for visual diff (Playwright `toHaveScreenshot()`, Patrol screenshot diff). Layer Percy / Applitools only when the project has tenant-variant UI or design-system distribution at scale.

## Report artifact layout

Every QA-Exec run writes to `docs/qa-reports/<task-id>/` under sub-folders:

```
docs/qa-reports/<task-id>/
├── playwright-report/      (or framework-equivalent HTML report)
├── traces/                 (one trace.zip per failing test, named TC-ID.trace.zip)
├── screenshots/            (test-captured screenshots, named TC-ID.<step>.png)
├── visual-diffs/           (Tier 3 only — baseline.png, actual.png, diff.png per Visual-Critical TC)
├── registry/               (coordinate / template registry for no-introspection surfaces — Unity etc.)
└── logs/                   (captured browser console, native logs, network logs)
```

The summary at `docs/qa-reports/<task-id>.md` cites these by relative path. QA-Exec's per-property reporting (per the agent template) shows `pass` / `fail` / `skipped` per property and links the supporting artifact when relevant.

## Hard rules

- Every UI-touching TC has an `Executable:` field pointing at a real spec file. A TC without one is incomplete; QA-Exec halts and reports.
- The test name inside the spec contains the TC ID verbatim. Test-name drift from TC ID is a report-traceability failure.
- Selectors come from the instrumentation contract. Inventing selectors during spec authoring is forbidden. When the contract is incomplete, use the `TODO: instrumentation-contract` marker + paired open-issue + defer to QA-Author Pass 2 (see `.claude/skills/qa-author-by-us/`).
- No `sleep` / time-based waits. Wait on the condition.
- Visual diff is reserved for SRS `Visual-Critical: yes` surfaces. Layering it on every UI test guarantees flakiness.
- Test fixtures isolate per-test. Shared mutable state across tests is forbidden.
- Baselines for visual diff are updated only with human approval — auto-update on green is forbidden.
- `TODO: instrumentation-contract` markers in a spec file mean the spec is intentionally unrunnable until QA-Author Pass 2 lands the real selectors. QA-Exec's Pre-Run check halts on any marker hit. Markers are NEVER acceptable in shipped specs; they are Pass-1-to-Pass-2 handoff annotations only.

## References

- [`references/web-playwright.md`](./references/web-playwright.md) — Playwright project layout, fixtures, network mocking, parallelism
- [`references/react-native-detox.md`](./references/react-native-detox.md) — Detox for React Native: testID convention, project layout, per-platform invocation
- [`references/flutter-patrol.md`](./references/flutter-patrol.md) — Patrol setup, finder semantics, screenshot diff
- [`references/native-mobile.md`](./references/native-mobile.md) — XCUITest (iOS) and Espresso (Android) conventions
- [`references/cross-platform-maestro.md`](./references/cross-platform-maestro.md) — Maestro YAML flows for iOS native / Android native / RN / Flutter; decision rubric vs platform-native runners
- [`references/unity-alttester.md`](./references/unity-alttester.md) — AltTester instrumentation; degraded mode for un-instrumented Unity builds
- `.claude/skills/solution-defaults/` — org-level test-runner defaults per platform
- `.claude/skills/playwright-author/` — Playwright-specific spec-authoring skill (consult after this one when writing web specs)
- `.claude/skills/qa-author-by-us/` — QA-Author US-scoped spec authoring
- `.claude/skills/qa-author-by-task/` — QA-Author task-scoped spec authoring
- `.claude/skills/qa-execution-runner/` — QA-Exec runner side of the spec
- `.claude/agents/_templates/devops.md` — DevOps role; deploy report carries the `Test Environment` block QA-Exec consumes
