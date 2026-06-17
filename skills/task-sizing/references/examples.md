# Worked Task Breakdowns

Two examples of breaking a feature into phases and tasks, with annotations.

## Example 1: User auth & profile (medium feature, 4 phases)

SRS: US-001…US-014 cover login, profile view/edit, and password reset (FRs FR-001…FR-014 detail the API contracts).

### Phase 1: Foundation

| Task | Track | Deps | DoD |
|---|---|---|---|
| T-001 | Migrate `users` and `sessions` tables | infra | — | Migration applied to local + staging; rollback plan documented |
| T-002 | Auth middleware (token validation, role check) | be | T-001 | Middleware passes auth contract tests on a stub endpoint |
| T-003 | Test infrastructure for auth flows (fixture users, token mint) | qa | T-001 | QA-Author can write auth-protected test cases |

Phase ends when: a stub endpoint is reachable, returns 401 without token, 200 with valid token, role-checked.

### Phase 2: Core auth

| Task | Track | Deps | DoD |
|---|---|---|---|
| T-004 | POST /auth/login + contract | be | T-002 | Contract `Frozen`; login succeeds with valid creds, fails with explicit error codes per AC |
| T-005 | POST /auth/logout + contract | be | T-002 | Contract `Frozen`; session invalidated server-side and client-side |
| T-006 | Login UI (form, error display, redirect) | fe | T-004 (contract-pending) | Login screen passes structural + functional tests against frozen contract |
| T-007 | Logout UI (header menu) | fe | T-005 (contract-pending) | Logout link clears session, redirects to login |

Notes:
- T-006 starts as `contract-pending`; transitions to `not-started` when T-004's contract freezes; transitions to `in-progress` when design sub-status = `design-confirmed`.
- T-006 and T-007 design lifecycle runs in parallel with T-004/T-005 implementation — they're not blocked on the contract.

### Phase 3: Profile

| Task | Track | Deps | DoD |
|---|---|---|---|
| T-008 | GET/PUT /users/me + contract | be | T-002 | Contract `Frozen`; profile read/update works with auth |
| T-009 | Profile view UI | fe | T-008 (contract-pending) | View screen renders all fields per design |
| T-010 | Profile edit UI | fe | T-008 (contract-pending) | Edit screen updates fields, shows validation errors, persists on save |

### Phase 4: Password reset

| Task | Track | Deps | DoD |
|---|---|---|---|
| T-011 | POST /auth/reset-request + contract | be | T-002 | Email-send job triggers within 30s; rate-limited |
| T-012 | POST /auth/reset-confirm + contract | be | T-002 | Token verified, password updated, sessions invalidated |
| T-013 | Reset request UI | fe | T-011 (contract-pending) | Form submit shows confirmation, doesn't leak whether email exists |
| T-014 | Reset confirm UI | fe | T-012 (contract-pending) | Token from email URL pre-fills, password set succeeds, redirects to login |

### Why this breakdown

- **Vertical splits** — login (P2) ships before profile (P3) ships before reset (P4). Each phase is a usable slice.
- **Track tags** are clean: every task has one. T-001 is `infra` because it's a migration. The QA test infrastructure work is `qa` (test infra), not `qa` (test cases) — those come from QA-Author per task.
- **Dependencies stay short.** No task depends on more than 2 others.
- **Phase boundaries are milestones**, not calendar dates. P1 ends when auth middleware works; P2 ends when login round-trips; P3 ends when profile is editable; P4 ends when reset round-trips.

## Example 2: Same feature, miscommunication patterns to avoid

A common bad breakdown of the same SRS:

| Task | Track | DoD | Why bad |
|---|---|---|---|
| T-001 | Implement entire auth system | be+fe | "Login, logout, profile, reset all work" | Title says "and" three times. > 14 AC mappings. Untestable DoD. |
| T-002 | Frontend for auth | fe | "All auth UIs done" | Same problem at the FE layer. |
| T-003 | Refactor existing user model | be | "Cleaner user model" | Subjective DoD. Smells like opportunistic scope. |

The smell tests catch all three immediately. Split into the 14 tasks of Example 1.
