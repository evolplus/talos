---
name: test-case-author
description: Format and coverage rules for test cases under docs/test-cases/. Consult when QA-Author is writing test cases — either in `by-us` mode (post-SRS-sign-off, parallel with SA) or `by-task` mode (post-TL, optionally post-design-confirmed).
agents: [qa-author]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# Test Case Author

## When to use

You are QA-Author. The dispatch named one of two modes:

- **`by-us`** — author functional test cases from SRS §3.2 User Stories (full detail at `docs/user-stories/<US-NNN>.md`), scoped per US-NNN. Runs after SRS sign-off, in parallel with SA. Outputs to `docs/test-cases/by-us/<US-NNN>/`.
- **`by-task`** — author task-scoped cases (structural / api / e2e / occasionally functional) from a specific master-plan task. Runs after TL (and `design-confirmed` for UI tasks). Outputs to `docs/test-cases/by-task/<task-id>/`.

This skill defines the format, the per-mode procedure, the coverage rules, and what must never appear in a test case.

## Inputs and outputs

### `by-us` mode

- **Inputs:** signed-off SRS (§3.2 index), per-US files at `docs/user-stories/<US-NNN>.md` (the actual content you derive cases from), per-FR files at `docs/frs/<FR-ID>.md` (for cross-reference), optional US-ID filter (default = all User Stories missing a by-us file)
- **Outputs:** `docs/test-cases/by-us/<US-NNN>/functional.md` per US — happy-path + Business Rules + Post-conditions + negative cases derived from the US

### `by-task` mode

- **Inputs:** master-plan task file (track, DoD, linked US-IDs, linked FR-IDs), architecture, US files at `docs/user-stories/<US-NNN>.md`, FR files at `docs/frs/<FR-ID>.md`, frozen API contracts (when applicable), designer handoff + instrumentation contract (UI tasks)
- **Outputs:** `docs/test-cases/by-task/<task-id>/{structural,api,e2e,functional}.md` (use the layers relevant to the task's track), plus `docs/uiux/visual-specs/<task-id>.md` for UI tasks (see `.claude/skills/visual-spec-author/` — visual-spec generation is a separate procedure, by-task mode only)

## Layered split

Each layer has a primary source. Author it from that source; cross-reference, never duplicate, the other layers.

| File | Source | Mode | Path |
|---|---|---|---|
| `functional.md` (per US) | `docs/user-stories/<US-NNN>.md` — Main Flow + Business Rules + Post-conditions | `by-us` | `docs/test-cases/by-us/<US-NNN>/functional.md` |
| `functional.md` (per task) | Task-specific behavior the US doesn't fully capture (rare) | `by-task` | `docs/test-cases/by-task/<task-id>/functional.md` |
| `structural.md` | `docs/uiux/visual-specs/<task-id>.md` (visual spec) | `by-task` (UI only) | `docs/test-cases/by-task/<task-id>/structural.md` |
| `api.md` | `docs/frs/<FR-ID>.md` (Input/Output schemas + Error Handling) + frozen `docs/api-contracts/<endpoint>.md` | `by-task` (BE or BE+FE) | `docs/test-cases/by-task/<task-id>/api.md` |
| `e2e.md` | Multi-system flows the SRS User Stories describe | `by-task` (BE+FE) | `docs/test-cases/by-task/<task-id>/e2e.md` |

Most functional cases live in `by-us`. Per-task `functional.md` is rare — only when a task implements something the User Story doesn't fully capture (typically internal-only admin tools).

## Test case format

```markdown
### TC-<scope-id>-<NNN> — <short title>

- Linked anchor: <US-NNN.MF-N | US-NNN.BR-N | US-NNN.PC-N | FR-NNN.Rule-N | FR-NNN.Error-CODE>
- Scope: by-us <US-NNN>  |  by-task <task-id>
- Layer: functional | structural | api | e2e
- Executable: <path to the runnable spec, e.g., e2e/specs/by-us/us-001-spectator-join.spec.ts>
- Preconditions:
  - ...
- Steps:
  1. ...
- Expected:
  - ...
- Pass / Fail:
  - Pass: all Expected items observable
  - Fail: any Expected missing — record actual values

- Tier (UI tasks only): T1 (always run) | T2 (always run) | T3 (Visual-Critical only)
- Suspected track on fail (QA-Exec fills): be | fe | integration | design-drift | introspection-gap | instrumentation-violation
```

**`Executable:` is mandatory** for any Layer in `{functional, structural, api, e2e}`. The path points at a spec file the test runner exercises (Playwright `.spec.ts`, Patrol `.dart`, XCUITest `.swift`, Espresso `.kt`, AltTester `.cs`). One `test()` per TC ID; the test name starts with the TC ID verbatim. Pure-documentation TCs may omit `Executable:` IF they declare `Manual: yes` with a written justification.

**Required fields:** ID, Linked anchor, Scope, Layer, Executable (or `Manual: yes` with justification), Preconditions, Steps, Expected, Pass/Fail. UI cases also include Tier.

## Linked-anchor convention

The `Linked anchor` field traces the case back to the exact SRS fragment it covers. Use the smallest precise unit available:

| Anchor | Source | Example |
|---|---|---|
| `US-NNN.MF-N` | `docs/user-stories/US-NNN.md`, Main Flow step N | `US-001.MF-3` |
| `US-NNN.BR-N` | `docs/user-stories/US-NNN.md`, Business Rule (Invariant) N | `US-001.BR-2` |
| `US-NNN.PC-N` | `docs/user-stories/US-NNN.md`, Post-condition N | `US-001.PC-1` |
| `FR-NNN.Rule-N` | `docs/frs/FR-NNN.md`, Business Rule N | `FR-002.Rule-1` |
| `FR-NNN.Error-<CODE>` | `docs/frs/FR-NNN.md`, Error Handling row keyed by error code | `FR-002.Error-AUTH_REQUIRED_REGIONAL` |

A single TC may list multiple anchors when the case demonstrates a Main Flow step *and* a Business Rule simultaneously (typical for happy-path cases).

## Translating Acceptance Scenarios (Given/When/Then) to TCs

When the SRS-level US/FR carries `## Acceptance Scenarios` (mandatory per `user-story-template.md` / `frs-template.md`), QA-Author's job is to **translate, not author**. The PM/BA wrote the scenarios at SRS time; QA-Author refines them into the markdown TC format without inventing new coverage.

### Direct mapping

| Acceptance Scenario field | Markdown TC field |
|---|---|
| Scenario title (e.g., "Scenario 2: Duplicate join from same account returns existing session") | TC short title (e.g., "Duplicate join returns existing session") |
| `Given <X>` line(s) | `Preconditions` bullet(s) — one bullet per `Given` line |
| `When <Y>` line | `Steps` bullet(s) — one numbered step per atomic action |
| `Then <Z>` line(s) | `Expected` bullet(s) — one per assertion; `Pass / Fail` summarizes all-or-nothing |
| US-NNN.Scenario-N OR FR-NNN.Scenario-N | TC `Linked anchor` field — cite the scenario directly |

The `Linked anchor` value uses a new sub-format for scenarios:

- `US-NNN.Scenario-N` — translation of US-NNN's Scenario N
- `FR-NNN.Scenario-N` — translation of FR-NNN's Scenario N
- (Existing anchors still apply: `US-NNN.MF-N`, `US-NNN.BR-N`, `US-NNN.PC-N`, `FR-NNN.Rule-N`, `FR-NNN.Error-<CODE>`)

When a TC corresponds 1:1 to an Acceptance Scenario, prefer the `Scenario-N` anchor. The `BR-N` / `PC-N` anchors remain for TCs that cover Business Rules or Post-conditions that aren't fully represented by any single scenario.

### Translate-don't-author hard rule

If a US/FR carries an Acceptance Scenario, QA-Author MUST use it (translating into TC form). QA-Author MUST NOT:

- Skip a scenario the US/FR includes (every scenario maps to at least one TC)
- Invent a new scenario the US/FR doesn't include (if coverage is missing, file an OQ in SRS §8 asking BA to extend the Acceptance Scenarios — never extend them yourself in TC form)
- Contradict the scenario (e.g., if the scenario says "response is 401", the TC's Expected MUST say 401 — not "401 or 403")

If a scenario in the SRS is incomplete or ambiguous, QA-Author raises an OQ and halts; does NOT silently fix or expand it. The Acceptance Scenarios are the SRS-time-signed-off contract.

### Worked example

SRS US-001 carries Acceptance Scenario 1 (the Spectator happy path). QA-Author translates it into:

```markdown
### TC-US001-001 — Spectator joins live tournament match end-to-end

- Linked anchor: US-001.Scenario-1
- Scope: by-us US-001
- Layer: functional
- Executable: e2e/specs/by-us/us-001-spectator-join.spec.ts
- Preconditions:
  - Match `M-T-001` is in `in-progress` state AND publicly spectatable
  - Viewer has a valid Account/Passport session
- Steps:
  1. Viewer sends `POST /spectate/M-T-001/join` with `{ account_id, client_meta }`
- Expected:
  - Response 200 with body `{ session_id, stream_endpoint, viewer_count }`
  - `MatchSpectatorSession` row exists with `state=live`
  - `SpectatorSessionStarted` event published to Kafka within 1 second
  - Viewer count for `M-T-001` incremented in current window
- Pass / Fail:
  - Pass: all four Expected items observable
  - Fail: any Expected missing — record actual values
- Tier: T1, T2
```

The translation is mechanical: Given → Preconditions, When → Steps, Then → Expected. No content was invented.

## ID convention

`TC-<scope-id>-<NNN>` where:

- `scope-id` is `US<NNN>` (no separator; the per-anchor breakdown lives in the `Linked anchor` field) in `by-us` mode. Example: `TC-US001-001` is the first TC under US-001, covering any combination of its anchors.
- `scope-id` is `T<NNN>` in `by-task` mode. Example: `TC-T014-001`.
- `<NNN>` is unique within the file (per-file counter starting at 001).

The scope is part of the identifier; same `NNN` may exist across different files (`TC-US001-001` and `TC-T014-001` are distinct, valid IDs).

QA-Exec reports cite the full ID — never collapse to `TC-001`.

## Coverage rules

### `by-us` mode

- Every SRS User Story has at least one functional case covering its happy-path Main Flow end-to-end in `docs/test-cases/by-us/<US-NNN>/functional.md`. The case's `Linked anchor` cites either the terminal Main Flow step (e.g., `US-001.MF-6`) or multiple step IDs.
- Every Business Rule (Invariant) in the US is exercised by at least one TC (positive: rule holds; negative: rule fails when expected).
- Every Post-condition listed in the US is asserted in at least one TC's Expected section.
- Negative cases are required for any US touching: auth, payments, external integrations, retries, background jobs. Source negatives from Business Rules and from the FR's Error Handling table when an FR is referenced.
- Every TC has a corresponding spec file at the `Executable:` path. Markdown TC + missing spec = incomplete; QA-Exec halts on first encounter.
- If a US Business Rule is untestable as written, do not invent a stricter version — raise an Open Question in SRS §8 (via BA on the next round).

### `by-task` mode

- Pre-flight: verify by-us files exist for every US-ID linked to the task in master-plan. If a US is missing its by-us file, file `docs/open-issues.md` (the gap is visible; Orchestrator dispatches by-us QA-Author to fill in parallel) — the task can still be QA'd against existing by-us coverage.
- For UI tasks: every component in `docs/uiux/visual-specs/<task-id>.md` has at least one structural test case.
- For `be` and `be+fe` tasks: every status code / error code documented in the FR's Error Handling table AND every status code in the frozen `docs/api-contracts/<endpoint>.md` has at least one API test case. If the FR and the contract disagree, file an open-issue — drift is a real defect, not something QA absorbs.
- For tasks marked `contract-pending`: write what you can from the FR file; defer contract-dependent details to a follow-up `api-contract-pending.md` so the gap is visible.

## What must never appear

- Pass/fail conditions that are subjective ("looks correct", "is intuitive", "feels responsive"). Replace with observable assertions or refuse the test.
- Test cases derived from the implementation rather than the SRS User Story or FR. If the US/FR is unclear, raise an Open Question — don't backfill the test from what the code happens to do.
- Implementation details (function names, file paths, internal class names). Test cases describe behavior at the system boundary.
- "Should look right" as an Expected. Visual fidelity goes in tier-3 visual-diff cases for `Visual-Critical` requirements only.

## Procedure

### `by-us` mode

1. Read SRS §3.2 index for the target US-ID(s); then open each `docs/user-stories/<US-NNN>.md`. Note each US's Pre-conditions, Main Flow, Business Rules (Invariants), and Post-conditions.
2. Cross-reference each FR cited by the US in SRS §3.3 — open `docs/frs/<FR-ID>.md` for the schemas, error handling, and any FR-level Business Rules.
3. Draft a happy-path TC walking the full Main Flow end-to-end. Anchor on the terminal step or list all step anchors.
4. For each Business Rule (US-level and FR-level cited by the US): draft a positive case demonstrating the rule holds; draft a negative case demonstrating the rule fires when violated.
5. For each Post-condition: ensure it appears in at least one TC's Expected section.
6. For any US involving auth / payments / integrations / retries / background jobs, ensure negatives cover the FR's Error Handling rows.
7. Verify coverage: every Main Flow step, Business Rule, and Post-condition has at least one TC. File header includes a coverage matrix mapping anchor → TC IDs.
8. Write to `docs/test-cases/by-us/<US-NNN>/functional.md`. One file per US.

### `by-task` mode

1. Read the task file in `docs/plan/phase-NN-name/tasks/T-NNN.md`. Note its track, DoD, `Linked US-IDs`, and `Linked FR-IDs`.
2. Verify by-us coverage for each linked US (per "Coverage rules — by-task mode" above).
3. For UI tasks: generate or refresh `docs/uiux/visual-specs/<task-id>.md` (see `.claude/skills/visual-spec-author/`), then derive `structural.md` per component.
4. For `be` / `be+fe` tasks: read the FR file's schemas + Error Handling, and the frozen API contract. Write `api.md` cases per documented status code / error code from both sources. File an open-issue on any drift between the two.
5. For `be+fe` tasks (or any task the SRS describes as multi-system via a US Main Flow spanning components): write `e2e.md` cases per SRS flow.
6. If task DoD describes behavior not fully captured by the linked US(s), write task-scoped `functional.md` cases. This should be rare; if it's frequent, the US is under-specified and BA should be re-engaged.
7. Add the file header (see [`references/examples.md`](./references/examples.md)) with task ID, linked US-IDs, linked FR-IDs, layer summary, coverage matrix.

## Iteration: deprecated test cases

When BA Phase 4 deprecates a US-ID during an iteration:

- The per-US file at `docs/user-stories/<US-ID>.md` gets `Status: Deprecated` in its frontmatter.
- Test cases at `docs/test-cases/by-us/<US-ID>/` **stay in place** — do not delete or move. File paths are referenced by historical reports and code comments; moving them creates index churn that's worse than orphaned references.
- The TC file's `Linked anchor` field still points at the deprecated US's anchors; this is fine. The Status flag on the per-US file is the authoritative deprecation signal.
- QA-Exec's Pre-Run check reads the per-US file's Status; if `Deprecated`, the TC is `skipped` with reason `deprecated-us` in the qa-report.
- A future cleanup task (filed by TL during Phase 4) may eventually remove the test-case files alongside the obsolete implementation — that's a deliberate Dev/QA cleanup, not an automatic deletion.

## Format-boundary tests

When an FR's `## Data Effects` references an architecture.md §6 format-boundary row, the test discipline is stricter than the usual "assert what the FR computes":

### Hard rule: assert on the converted value, not the input

If the FR consumes data from system A in format X and writes to system B in format Y, the test MUST assert on the value as it appears in system B. Asserting on the system-A value (or worse, on a mock that doesn't enforce system-B format) confirms only that data round-tripped through the test fixture — not that the conversion happened.

The motivating bug pattern:

- FR consumes GitLab `merged_at = "2025-06-15T14:30:00Z"` (ISO-8601 with `T`+`Z`).
- FR writes to MySQL `DATETIME` column (`'YYYY-MM-DD HH:MM:SS'` zone-less).
- WRONG test: asserts `params[6] === utcMergedAt` — i.e., the raw ISO string is passed verbatim. This test confirmed the bug was correct behavior; the mock DAL accepted the malformed value silently.
- RIGHT test: asserts `params[6] === '2025-06-15 14:30:00'` — i.e., the converted value reaching MySQL. OR asserts `params[6]` matches `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/` (no `T`, no `Z`).

### Hard rule: integration test over mock for format-touching paths

Unit tests with mock DALs cannot enforce destination-system format constraints — the mock has no `Incorrect datetime value` error to raise. **For every FR touching a §6 format-boundary row, by-us authoring includes at least one integration test** that runs against the local-deployment Docker backend (per [`local-deployment`](../local-deployment/SKILL.md)). The integration test:

- Boots the docker-compose'd local environment (real MySQL / Postgres / etc.).
- Exercises the FR's main flow with realistic fixtures.
- Verifies the destination system holds the converted value in the correct format.
- Fails loudly if the destination rejects the format (driver error surfaces; not masked behind a generic retry-failure wrapper).

This makes the §6 format contract executable, not just documented.

### Test naming convention for format-boundary tests

Test names should signal the boundary explicitly:

- ✅ `converts GitLab ISO datetime to MySQL DATETIME format`
- ✅ `rejects malformed datetime input with deterministic FormatError (no retry)`
- ❌ `passes verbatim ISO datetime to MySQL`  ← this name encodes the bug as the spec

The "passes verbatim" framing in test names is a footgun: it asserts pass-through where conversion is the actual requirement.

### Worked example — TC-FR-013.Scenario-1 (post-fix)

```markdown
- **TC-id:** TC-FR013-001
- **Linked anchor:** FR-013.Scenario-1 (Happy path — MR collection writes to MySQL)
- **Layer:** integration (NOT unit; format-boundary tests run against real MySQL)
- **Preconditions:**
  - Local-deployment env up (per docs/deploy-reports/T-013.md Test Environment block).
  - MySQL container running with `time_zone='+07:00'`.
- **Steps:**
  1. Stub GitLab API to return MR with `merged_at = "2025-06-15T14:30:00Z"`.
  2. Trigger MR Collection Service worker for the project.
  3. Wait for `merge_requests` row to land (poll up to 5s).
- **Expected:**
  - `SELECT merged_at FROM merge_requests WHERE iid = ...` returns datetime equivalent to `'2025-06-15 21:30:00'` (UTC+7 converted from `2025-06-15T14:30:00Z` UTC; per-connection `time_zone='+07:00'` makes the read appear in UTC+7).
  - Bound parameter value at insert time matched `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/` — verified via DAL audit log.
  - NO `Incorrect datetime value` errors in MySQL log.
  - Per architecture.md §6 format-boundary row for `merged_at`: conversion function `gitLabIsoToMysqlDatetime()` was invoked exactly once per MR.
```

Compare with the buggy test that would have shipped without this discipline:

```markdown
- **Steps:** Mock DAL.insert(); call MR Collection with GitLab fixture.
- **Expected:** `mockDal.insert.lastCall.params[6]` equals `"2025-06-15T14:30:00Z"`.
```

That mock-based test asserted the bug was correct.

## Hard rules

- **Translate, don't author.** When a US/FR carries `## Acceptance Scenarios`, every scenario maps to at least one TC. Never skip a scenario; never invent a scenario not in the US/FR; never contradict the scenario's Given/When/Then. If a scenario is incomplete or ambiguous, raise an OQ and halt — do NOT silently extend it.
- **Use `Scenario-N` anchor when 1:1.** When a TC translates a specific Acceptance Scenario, the `Linked anchor` field cites `US-NNN.Scenario-N` or `FR-NNN.Scenario-N`. Reserve `MF-N` / `BR-N` / `PC-N` for TCs that don't correspond to a specific scenario.

- A test case with subjective pass/fail is rejected. Tighten or refuse.
- Block task *closure* if test cases are missing for any linked US Business Rule or Post-condition; never block task *start* — Devs run in parallel with you (CLAUDE.md §4).
- For UI tasks, structural cases derive from the visual spec, not from your interpretation of Figma. Generate the spec first.
- Hardcoded values in Figma that don't map to a design token: raise as Open Question; do not absorb design-system violations silently.
- Never author `by-us` cases into `by-task/` paths or vice versa. The scope dictates the path.
- In `by-task` mode, never start before preconditions are met (TL linked US-IDs + FR-IDs; `design-confirmed` for UI; `Frozen` contract for FE-on-BE). Halt and signal back to the Orchestrator.
- FR-spec / frozen-contract drift is always an open-issue, never a silent absorption.

## References

- [`references/examples.md`](./references/examples.md) — worked test cases including negative cases and a coverage matrix
- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles for the executable spec you author alongside each markdown TC
- `.claude/skills/playwright-author/SKILL.md` — per-runner playbook for web (the org default)
- `.claude/skills/qa-author-by-us/` — QA-Author US-scoped mode
- `.claude/skills/qa-author-by-task/` — QA-Author task-scoped mode
- `.claude/skills/visual-spec-author/` — visual-spec generation for UI tasks
- `.claude/rules/parallel-execution.md` §4 — when each mode is dispatched
- `.claude/skills/user-story-author/SKILL.md` — your inputs come from there (US structure and quality bar)
