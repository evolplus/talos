---
name: qa-author-by-task
description: QA-Author by-task mode procedure. Use when QA-Author is dispatched for a master-plan task after TL, and after design-confirmed for UI tasks, to author task-scoped structural/api/e2e/functional test cases under docs/test-cases/by-task/<task-id>/ and coordinate visual-spec generation for UI tasks.
agents: [qa-author]
sdlc_phase: qa
owner: Platform Eng
status: active
---

# QA Author By-Task

## Use

Use this skill for QA-Author `by-task` mode. Load `test-case-author` for TC format, `ui-test-execution` for executable specs, and `visual-spec-author` before writing structural tests for UI tasks.

## Inputs

- Task file under `docs/plan/phase-*/tasks/<task-id>.md`
- Linked US/FR files
- `docs/architecture.md`
- Frozen API contracts for BE/BE+FE tasks
- `docs/uiux/handoffs/<task-id>.md` and `docs/instrumentation-contract.md` for UI tasks
- Existing by-us test cases for linked US IDs

## Preconditions

- TL has linked US IDs and FR IDs.
- UI tasks have `design-confirmed` and a handoff on main.
- FE tasks dependent on BE contracts have frozen API contracts.
- Missing preconditions cause `NEEDS_CONTEXT`/blocked return; do not author partial task TCs silently.

## Procedure

1. Verify by-us coverage exists for each linked US. If missing, file an open issue and continue only for task-specific layers that can be authored safely.
2. Determine required task layers:
   - `api.md` for BE or BE+FE contract/API work;
   - `structural.md` for UI tasks;
   - `e2e.md` for multi-system or cross-surface flows;
   - `functional.md` only for task-specific behavior not covered by by-us.
3. For UI tasks, run `visual-spec-author` first. Structural TCs derive from `docs/uiux/visual-specs/<task-id>.md`, not from ad-hoc Figma interpretation.
4. For API tests, read both the FR file and frozen API contract. If they disagree, file an open issue; do not silently let one override the other.
5. Author markdown TCs under `docs/test-cases/by-task/<task-id>/`.
6. Author executable specs at every TC's `Executable:` path using the project runner conventions.
7. Ensure runner test names start with the TC ID.
8. Emit `plan-update.json` with `track: "qa"` and by-task notes.

## Hard Rules

- Never author by-task cases into by-us paths or the reverse.
- Never invent missing API contract behavior.
- Never write structural UI tests before visual spec exists.
- Every executable TC needs a real spec file.
- Commit before signaling done.
