---
name: user-story-author
description: Patterns and quality bar for writing testable User Stories. SRS §3.2 carries an index table; full US detail lives at docs/user-stories/<US-ID>.md. Consult during BA Phase 1 ingestion or Phase 2 sign-off — specifically when filling Pre-conditions, Main Flow, Business Rules (Invariants), and Post-conditions in the per-US file.
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# User Story Author

## When to use

You are the BA, augmenting a SRS during Phase 1 ingestion or running the Phase 2 sign-off check. The DDD-based SRS template (see `.claude/agents/_templates/_artifacts/srs-template.md`) expresses behavior through **User Stories indexed at SRS §3.2**, with full detail in **per-US files at `docs/user-stories/<US-ID>.md`** per [`user-story-template.md`](../../agents/_templates/_artifacts/user-story-template.md). Each US has structured sub-sections: Description, Pre-conditions, Main Flow, Business Rules (Invariants), Post-conditions. You need every US's Business Rules and Post-conditions to be testable, unambiguous, and bounded before Status can become `Signed-off`. This skill gives you the quality bar, the anti-patterns, and templates by feature category.

(Note: there are no longer free-standing "acceptance criteria" in the kit's SRS template. The Business Rules + Post-conditions in each User Story together carry the testable contract that ACs used to carry. Per-FR Business Rules and Error Handling rows in `docs/frs/<FR-ID>.md` carry the rest.)

## Inputs and outputs

- **Inputs:** a draft User Story (or candidate US for an under-described capability) — either a row in `docs/SRS.md` §3.2 index missing detail, or an under-specified `docs/user-stories/<US-ID>.md` file
- **Outputs:** an index row in SRS §3.2 (ID, Title, one-line Description, Role, Priority, Linked FRs, Status) AND a complete `docs/user-stories/<US-ID>.md` whose Pre-conditions, Main Flow, Business Rules, and Post-conditions each meet the Quality Bar below

## Quality bar — applies to every sub-section

| Sub-section | Quality bar |
|---|---|
| **Description** | `As a <Role>`, `I want to <Action>`, `So that <Value>`. Role is a named one (matches SRS §5 User Roles). Action is observable from outside the system. Value is concrete (no "better experience"). |
| **Pre-conditions** | Each pre-condition is a stateable, verifiable fact about the system or actor *before* the flow begins. No subjective adjectives. |
| **Main Flow** | Numbered steps. Each step has a single observable action (Agent receives X / Agent validates Y / Agent persists Z / Agent publishes event). No "the agent processes the request" without saying what processing means. |
| **Business Rules (Invariants)** | Each rule is **testable, unambiguous, bounded** (see definitions below). Numbered (Rule 1, Rule 2). One rule = one assertion. Invariants — not narrative. |
| **Post-conditions** | Each post-condition is a verifiable assertion about end-state: row exists / event published / counter incremented / cache invalidated. No subjective adjectives. |

### Definitions (carried from the old AC skill — same bar, now applied per-rule and per-post-condition)

- **Testable** — a QA agent can write a test case from this alone without guessing inputs, expected outputs, or success/failure conditions.
- **Unambiguous** — no "fast", "user-friendly", "scalable", "intuitive", "robust" without explicit numbers or observable behavior.
- **Bounded** — explicit success *and* failure conditions where both apply. A Business Rule that says "the rule holds" is half a rule; the failure side ("the rule fails when …") is the other half. Post-conditions are usually bounded by being assertions of fact ("X exists").

If you cannot write the sub-sections meeting this bar for a User Story, the requirement is incomplete. Raise it as an Open Question in SRS §8 and do not set Status to `Signed-off` until resolved.

## Procedure

1. Read the draft requirement end-to-end. Identify the actor (named user role), the primary capability, and the bounded context.
2. Decide its category: CRUD, async / event-driven, integration with external system, UI flow, performance / non-functional, security / authz. See [`references/templates.md`](./references/templates.md) for US templates per category.
3. Draft the **Description** in As-a / I-want-to / So-that form. Anchor Role to SRS §5.
4. Enumerate **Pre-conditions** as facts. Each is one statement; no compound conditions.
5. Write the **Main Flow** as numbered steps. Each step is one observable action. Aim for 3–8 steps; if the flow exceeds 10 steps, the US is probably two stories — split.
6. Extract **Business Rules (Invariants)** from the flow: every step that conditionally proceeds has an underlying invariant. Numbered Rule 1, Rule 2. Each invariant meets the Quality Bar (testable, unambiguous, bounded).
7. Enumerate **Post-conditions** as facts about end-state. Each is verifiable from outside the function (DB row, event, metric, cache state, log line).
8. For any US involving auth / payments / external integrations / retries / background jobs, write at least one negative case as either a Business Rule (rule fails when X) in `docs/user-stories/<US-ID>.md` or as an Error Handling row in the FR file (`docs/frs/<FR-ID>.md`). The bar for "did this US think about failure?" is whether negatives are present and explicit.
9. Verify by mentally writing a TC for each Business Rule and each Post-condition. If you'd have to invent inputs that aren't in the US (or the FR it cites), the US is under-specified — tighten.
10. Anchor the User Story to the immutable ID `US-NNN`. Write detail to `docs/user-stories/US-NNN.md` per the template; add a row to SRS §3.2 index. QA-Author will write `Linked anchor: US-NNN.MF-N | US-NNN.BR-N | US-NNN.PC-N` against this ID.

## Anti-patterns to refuse

- **Subjective verbs**: "fast", "user-friendly", "intuitive", "responsive", "scalable", "modern" — replace with numbers or observable behavior, or raise an Open Question if the team hasn't decided.
- **Compound Business Rules**: a Rule that bundles success + failure + edge cases into one bullet. Split — each Rule is one invariant.
- **Aspirational language**: "should ideally", "where possible", "best-effort". A Business Rule is a promise; if it's aspirational, it's not a rule.
- **Implementation leak**: rules that name a function, a database table, or a class. Rules describe *what* the invariant is, not *how* the code enforces it. (Exception: when the bounded context maps a domain term to a code identifier via §3.1 Ubiquitous Language, citing that identifier is the *what* — that's fine.)
- **Backward-engineered**: US written after the code is built, that just describes what the code happens to do. Refuse; ask BA to derive the US from the business need.
- **Main Flow steps that hide branching**: "Agent processes the request" is not a step. "Agent validates X; if X fails, agent returns 4xx with code Y" — split into a step and a rule.
- **Post-conditions phrased as actions**: "user sees the dashboard" is a UI assertion, fine; "the system handles the response" is not — what's the verifiable end-state?

## Acceptance Scenarios discipline

Every User Story carries a mandatory `## Acceptance Scenarios` section (per `user-story-template.md`). At least one happy-path scenario. Negative scenarios REQUIRED when the US involves auth, payments, external integrations, retries, or background jobs.

Each scenario is in Given/When/Then form so it translates 1:1 into a QA-Author test case (per `.claude/skills/test-case-author/`). The translation rule:

| Acceptance Scenario component | Maps to QA-Author markdown TC field |
|---|---|
| `Given <X>` line(s) | `Preconditions` bullet(s) |
| `When <Y>` line | `Steps` bullet(s) |
| `Then <Z>` line(s) | `Expected` bullet(s) + `Pass / Fail` |
| Scenario title | TC short title |
| US-NNN.Scenario-N | TC `Linked anchor` field |

QA-Author should NOT re-author scenarios at test-case-authoring time — translate, don't invent. If a scenario in the SRS seems incomplete or ambiguous, raise an OQ rather than fabricating coverage.

### Templates by category

**CRUD operation:**

```
- **Given** an authenticated caller with role <R> AND <resource X> in state <S>
- **When** the caller performs <action> on <resource X>
- **Then** the response is <status code + body shape>
  AND <persistent side effect — DB row created/updated/deleted>
  AND <event emitted, if applicable>
```

**Async / event-driven:**

```
- **Given** <upstream state>
- **When** event `<EventName>` is published to `<topic>` with payload `<shape>`
- **Then** within <latency budget> the consumer <observable side effect>
  AND metric `<name>` is incremented
- (Negative) **When** <downstream> is unavailable for <duration>
- **Then** the event is <retried | dead-lettered> with <observable signal>
```

**Integration with external system:**

```
- **Given** <our state> AND <external system contract assumption>
- **When** we call <external endpoint> with <payload>
- **Then** on a <success response> our state moves to <state>
  AND <our side effect>
- (Alternative) **When** the external system returns <specific error code>
- **Then** our state moves to <failure state> with reason <reason>
- (Alternative) **When** the external call exceeds <timeout budget>
- **Then** <our retry / dead-letter / degrade behavior>
```

**UI flow:**

```
- **Given** the user is on <screen> in <state>
- **When** the user performs <gesture> on <element>
- **Then** the UI transitions to <screen / state>
  AND <element visibility / content assertions>
- (Negative) **When** the user performs <invalid action variant>
- **Then** the UI shows <error message text> at <location>
  AND <focus / disabled-control state>
```

**Performance / non-functional:**

```
- **Given** sustained load of <concurrency / rate / payload size>
- **When** the system processes requests over <observation window>
- **Then** P95 latency at <observation point> is <bound>
  AND error rate is <bound>
- **Violation:** <metric exceeds bound for duration W within window>
```

**Security / authorization:**

```
- **Given** a caller with role <permitted role>
- **When** the caller performs <action> on <resource>
- **Then** the response is 200 with <expected body>
  AND an audit log entry is written with `{principal_id, action, resource, outcome:"permitted", timestamp}`
- (Negative) **Given** a caller with role <denied role>
- **When** the caller performs the same action
- **Then** the response is 403 with `{ "error": "FORBIDDEN" }`
  AND an audit log entry is written with `outcome:"denied", reason:"<role-name>"`
```

## Cross-consistency rule (BA Phase 2 sign-off check)

Before flipping Status to `Signed-off`, BA's Phase 2 runs an automated cross-consistency check across each US's three testable sections: **Main Flow ↔ Business Rules ↔ Acceptance Scenarios**. Specifically:

1. **Scenario ↔ Main Flow happy path:** Every Main Flow step should have a corresponding action in the happy-path Acceptance Scenario's `When` + `Then` chain. If the Main Flow has step N that no scenario covers, that's an inconsistency — file an OQ.
2. **Scenario ↔ Business Rules:** For each Business Rule with no `Test:` sub-field, verify that at least one Acceptance Scenario exercises the rule (positive or negative). Rules without coverage = inconsistency.
3. **Scenario ↔ Business Rules (contradictions):** For each Business Rule, verify that no scenario's `Then` clause contradicts the rule. If Rule 2 says "viewer count is monotonic in a window" but Scenario 5's `Then` includes "viewer count decremented," that's a contradiction — file an OQ.
4. **Pre-conditions ↔ Scenario `Given`:** Every US Pre-condition should appear as a `Given` in at least one scenario (otherwise it's an unstated assumption nobody verifies).
5. **Post-conditions ↔ Scenario `Then`:** Every US Post-condition should appear in at least one happy-path scenario's `Then` clause.

When BA finds inconsistencies during this check, raise each as an OQ in SRS §8 with explicit citation: `OQ-NNN — Inconsistency: <US-ID> Rule <N> not covered by any Acceptance Scenario`. Status stays `In-Review` until OQs resolve.

This is an automated procedural check, not a hook (the kit's hooks parse markdown structure but not semantic consistency). BA walks through the 5-point list above for each US during Phase 2.

## Hard rules

- No User Story passes Phase 2 sign-off without Business Rules and Post-conditions meeting all three bars (testable, unambiguous, bounded).
- Every User Story has a mandatory `## Acceptance Scenarios` section with at least one happy-path scenario. Negative scenarios required when the US involves auth, payments, external integrations, retries, or background jobs.
- BA's Phase 2 sign-off runs the 5-point cross-consistency check (Scenario ↔ Main Flow, Scenario ↔ Business Rules positive coverage, Scenario ↔ Business Rules contradictions, Pre-conditions ↔ Given, Post-conditions ↔ Then). Inconsistencies become OQs in SRS §8.
- Every User Story has a unique stable ID `US-NNN`. Test cases trace to it; rename = downstream churn.
- Negative cases are required for any US involving auth, payments, external integrations, retries, or background jobs. Negatives may live in the US's Business Rules (rule fails when X) or in the cited FR's Error Handling rows.
- "User-friendly" is never a Business Rule. Either translate it into an observable behavior or raise it as an Open Question.
- Sub-sections you skipped (e.g., no Post-conditions listed) must be either filled or explicitly justified ("this US has no DB or event side-effect"). Silent omission ≠ "no post-conditions exist."

## Relationship to FR files

A User Story typically cites one or more FRs in SRS §3.3 (the FR index table). The FR files at `docs/frs/<FR-ID>.md` carry:

- Input / Output schemas (the contract shape)
- Error Handling table (status codes + error codes the FR may return)
- FR-level Business Rules (rules specific to the FR, not the US)
- Sequence Diagram

Don't duplicate FR content into the User Story. Cite the FR by ID and let the FR file carry the operational detail. Business Rules in the US are *user-facing invariants*; Business Rules in the FR are *operation-level invariants*.

## References

- [`references/templates.md`](./references/templates.md) — User Story templates by feature category, with worked examples
- CLAUDE.md §2 — SRS Sign-off Protocol (the gate this skill helps you pass)
- `.claude/agents/_templates/_artifacts/srs-template.md` — canonical SRS structure, including §3.2 User Stories index
- `.claude/agents/_templates/_artifacts/user-story-template.md` — canonical per-US file structure (Description, Pre-conditions, Main Flow, Business Rules, Post-conditions, Linked artifacts, Notes)
- `.claude/agents/_templates/_artifacts/frs-template.md` — per-FR file structure (cited by Business Rules that depend on an FR-specified behavior)
- `.claude/agents/_templates/_artifacts/srs-ingestion-checklist.md` — your full ingestion playbook
