---
name: qa-author-by-us
description: QA-Author by-us mode procedure. Use when QA-Author is dispatched after SRS sign-off to author User Story scoped functional test cases under docs/test-cases/by-us/<US-ID>/, create executable spec scaffolding, perform Pass 1 selector TODO marking, or perform Pass 2 selector backfill from docs/instrumentation-contract.md.
agents: [qa-author]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# QA Author By-US

## Use

Use this skill for QA-Author `by-us` mode. Load `test-case-author` first for TC format and coverage rules, then `ui-test-execution` for executable spec conventions.

## Inputs

- Signed-off `docs/SRS.md`
- Per-US files at `docs/user-stories/<US-ID>.md`
- Linked FR files as needed
- Optional scope filter of US IDs
- Pass number: `1` or `2`

## Pass 1 Procedure

1. For each in-scope US, read its Description, Main Flow, Business Rules, Post-conditions, and Acceptance Scenarios.
2. Write `docs/test-cases/by-us/<US-ID>/functional.md`.
3. Cover:
   - happy path Main Flow;
   - every Business Rule;
   - every Post-condition;
   - negative cases for auth, payments, integrations, retries, and background jobs.
4. Fill each TC's `Executable:` path.
5. Author executable spec scaffolding at the `Executable:` path. Use one test per TC ID and keep the TC ID at the start of the runner test name.
6. For non-UI tests, write full assertions.
7. For UI tests:
   - Use selectors from `docs/instrumentation-contract.md` when available.
   - If a needed selector is missing, write a literal `TODO: instrumentation-contract -- <purpose>` marker in the framework's comment syntax and file a paired `docs/open-issues.md` entry with `Category: selector-pending-contract`.
8. Emit `plan-update.json` notes with selector TODO count.

## Pass 2 Procedure

1. Read `docs/instrumentation-contract.md`.
2. For every dispatched TC/spec carrying `TODO: instrumentation-contract`, replace the marker with the declared selector.
3. If a selector is still missing from the contract, keep the marker and raise/update an open issue against SA.
4. Reverse-check coverage: every contract ID for the affected surface should appear in at least one spec. File `instrumentation-coverage-gap` for unused IDs.
5. Resolve paired `selector-pending-contract` issues that were fully backfilled.
6. Emit `plan-update.json` notes with selectors backfilled and issues resolved.

## Marker Syntax

Use the literal marker so QA-Exec can grep it:

| Runner | Marker |
|---|---|
| Playwright / Detox / Patrol / XCUITest / Espresso / AltTester | `// TODO: instrumentation-contract -- <purpose>` |
| Maestro YAML | `# TODO: instrumentation-contract -- <purpose>` |

## Hard Rules

- Translate signed-off Acceptance Scenarios; do not invent new scenarios.
- Do not invent selectors.
- Pass 1 specs with TODO markers are intentionally unrunnable.
- Every executable TC must have a spec file.
- Commit before signaling done.
