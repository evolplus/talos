<!--
Per-US detail template — canonical structure for `docs/user-stories/<US-ID>.md`

This file lives in the SRS's companion folder. SRS §3.2 holds the index
(one-row-per-US table); each row points here for full detail.

Two purposes:

1. **Reference for authors.** Copy this to `docs/user-stories/US-NNN.md` and fill in.
2. **Validation baseline for BA's Phase 1.** BA verifies each US-ID in SRS §3.2
   has a corresponding file at `docs/user-stories/<US-ID>.md` with all required
   sections present.

Required sections (validated by BA):
- Description, Pre-conditions, Main Flow, Business Rules, Post-conditions

Replace this HTML comment block before publishing the User Story.
-->

# US-NNN: <Title>

- **Status:** Draft <!-- Draft | Active | Deprecated -->
- **Priority:** P0 (MVP) <!-- P0 (MVP) | P1 | P2 -->
- **Role:** <one of the roles in SRS §5 User Roles & Permissions>
- **Last-Updated:** <ISO-8601>
- **Linked SRS:** docs/SRS.md §3.2 User Stories index row for this US
- **Linked FRs:** FR-NNN, FR-NNN <!-- FRs in SRS §3.3 / docs/frs/ that operationalize this US -->

## Description

**As a** <Role from SRS §5>
**I want to** <Action — observable from outside the system>
**So that** <Value — concrete; no "better experience">

<!-- EXAMPLE
**As a** spectator with an Account/Passport session
**I want to** join a live tournament match by tapping the Spectate button
**So that** I can watch real-time gameplay during the tournament window
EXAMPLE -->

## Context / Files

[Optional: hint at services/packages this US touches. The TL phases tasks against this.]

<!-- EXAMPLE
`services/spectator/`, `services/match/`, `web/spectator-ui/`
EXAMPLE -->

## Pre-conditions

[TODO: List facts that must be true about the system or actor before the flow begins. Each is one statement; no compound conditions.]

<!-- EXAMPLE
1. Viewer has a valid Account/Passport session.
2. Match is in `in-progress` state.
3. Match's `MatchPublicVisibility.is_public` is true (current time within tournament window AND admin toggle on).
EXAMPLE -->

## Main Flow (Step-by-Step)

[TODO: Numbered observable steps. Each step is one action by one actor. Reference Aggregate Root methods where applicable (per SRS §3.1 DDD). FR-specific operational detail belongs in the cited FR's file, not here.]

<!-- EXAMPLE
1. Spectator UI sends `POST /spectate/{match_id}/join` with `{ account_id, client_meta }` (operationalized by FR-001).
2. Spectator service validates: (a) Account/Passport session valid, (b) match exists and is in-progress, (c) match is publicly spectatable.
3. Service creates a new `MatchSpectatorSession` (state = `connecting`).
4. Service establishes pub/sub subscription to `match-state.{match_id}` (Redis Cluster channel).
5. Service transitions session to `live` and emits `SpectatorSessionStarted` event.
6. Service returns `{ session_id, stream_endpoint, viewer_count }` to client.
EXAMPLE -->

## Business Rules (Invariants)

[TODO: Numbered invariants. Each rule is testable in isolation: a QA agent can write a test case from it alone without guessing inputs, expected outputs, or success/failure conditions. Each Rule is testable, unambiguous, bounded (see `.claude/skills/user-story-author/` for the quality bar).

For rules whose test shape isn't obvious from the rule statement alone, add an optional `Test:` sub-field in Given/When/Then form. The `Test:` sub-field is OPTIONAL — pure mathematical invariants (e.g., "count is monotonic in a window") may not need it. It is RECOMMENDED for action-triggered rules where the trigger / observable outcome would otherwise be ambiguous. If the rule's test shape is fully covered by an Acceptance Scenario, cite that scenario instead of duplicating.]

<!-- EXAMPLE — Spectator US

- **Rule 1:** A `MatchSpectatorSession` can only enter `live` state after a successful pub/sub subscription handshake.
  - **Test:** Given a pending session in `connecting` state, When the pub/sub channel returns the first heartbeat, Then the session transitions to `live` and `SpectatorSessionStarted` is emitted. Negative: When the handshake times out (>5s), Then session stays `connecting` and is reaped after 30s.
- **Rule 2:** Concurrent sessions per `account_id` per match are capped at 1; a duplicate join request reuses the existing session.
  - **Test:** Covered by Acceptance Scenario 2.
- **Rule 3:** Anonymous spectating is forbidden for CN region (PIPL real-name verification requirement; see SRS §4.1.7 Regional).
  - **Test:** Covered by Acceptance Scenario 3.

EXAMPLE -->

## Acceptance Scenarios

[MANDATORY: At least one happy-path scenario. Add alternate paths + negative cases (negatives REQUIRED when the US involves auth, payments, external integrations, retries, or background jobs). Each scenario is in Given/When/Then form so it translates 1:1 into a QA-Author test case at `docs/test-cases/by-us/<US-ID>/`. The cross-consistency check at BA Phase 2 sign-off verifies every scenario aligns with the Main Flow + Business Rules above.]

### Scenario 1: [Happy path title]

- **Given** [preconditions / state context — multiple `Given` lines OK]
  - [additional precondition if needed]
- **When** [trigger action — typically one line, one observable event]
- **Then** [expected outcome — multiple `Then` lines OK; each is independently verifiable]
  - [additional then if needed]

<!-- EXAMPLE — Spectator joins live match

### Scenario 1: Happy path — spectator joins live tournament match

- **Given** match `M-T-001` is in `in-progress` state AND publicly spectatable
  AND the viewer has a valid Account/Passport session
- **When** the viewer sends `POST /spectate/M-T-001/join` with `{ account_id, client_meta }`
- **Then** the response is 200 with body `{ session_id, stream_endpoint, viewer_count }`
  AND a `MatchSpectatorSession` row exists with `state=live`
  AND a `SpectatorSessionStarted` event is published to Kafka within 1 second
  AND viewer count for `M-T-001` is incremented in the current window

### Scenario 2: Duplicate join from same account returns existing session

- **Given** the viewer has an active `MatchSpectatorSession` on match `M-T-001` (state=live)
- **When** the viewer sends a second join request from a different client
- **Then** the response is 200 with the SAME `session_id` as the existing session
  AND no new `MatchSpectatorSession` row is created
  AND viewer count is NOT incremented a second time

### Scenario 3: Anonymous spectating forbidden in CN region (negative)

- **Given** the client is geolocated to CN region
  AND no Account/Passport session is attached to the request
- **When** the client sends `POST /spectate/M-T-001/join` without `Authorization` header
- **Then** the response is 401 with body `{ "error": "ERR_AUTH_REQUIRED_REGIONAL", ... }`
  AND no `MatchSpectatorSession` row is created
  AND no event is published

EXAMPLE -->

## Post-conditions

[TODO: Verifiable end-state assertions. Each is observable from outside the system: row exists / event published / counter incremented / cache invalidated. No subjective adjectives.]

<!-- EXAMPLE
- `SpectatorSessionStarted` event published to Kafka `spectator-events` topic within 1 second.
- `MatchSpectatorSession` row persisted with state `live`.
- `ViewerCount` for the match incremented in the current window.
EXAMPLE -->

## Linked artifacts

[TODO: Cross-references to other docs as they become available.]

<!-- EXAMPLE
- FRs implementing this US: `docs/frs/FR-001.md` (join endpoint), `docs/frs/FR-002.md` (disconnect on heartbeat loss)
- Test cases: `docs/test-cases/by-us/US-001/functional.md` (when QA-Author lands by-us cases)
- ADRs touching this US: ADR-0012 (Redis Cluster), ADR-0013 (Spectator API contract)
- Master-plan tasks implementing this US: T-014 (BE — endpoint), T-015 (FE — UI integration)
EXAMPLE -->

## Notes

[Free-form: rationale, alternatives considered for this US specifically, edge cases worth flagging. Not for invariants — those go in Business Rules.]

## Deprecation Note

[Empty for active User Stories. When the US is deprecated by a later SRS version, BA's Phase 4 sets `Status: Deprecated` in the frontmatter AND fills this section with: (1) which SRS version deprecated it, (2) why (per the SRS §11 Deprecated User Stories row), (3) what replaced it (if anything), (4) what happened to tasks that implemented it (transitioned to `cancelled` or `done-deprecated` per master-plan-discipline). The file stays in place — index churn is worse than orphaned references; consumers (test-cases, code comments) keep their paths and read the Status field.]

<!-- EXAMPLE
- Deprecated-In: v1.1
- Reason: Ad-revenue strategy pivoted from pre-roll to in-stream per Q1 review (Viet Phan, 2026-04-15).
- Replacement: US-031 (in-stream ad slot during match break).
- Task disposition: T-031 (BE endpoint) → done-deprecated; T-032 (FE integration) was in-progress → cancelled. Cleanup task T-040 added to phase-04 to remove the pre-roll ad endpoint and related FE code.
EXAMPLE -->
