# Worked Test Case Examples

Examples reflect the two-mode authoring split:

- **`by-us` mode** — functional cases per SRS User Story, written post-SRS-sign-off in parallel with SA. Path: `docs/test-cases/by-us/<US-NNN>/functional.md`. IDs use the `US<NNN>` scope-id.
- **`by-task` mode** — task-scoped cases (structural / api / e2e) per master-plan task, written after TL (and `design-confirmed` for UI). Path: `docs/test-cases/by-task/<task-id>/{structural,api,e2e,functional}.md`. IDs use the `T<NNN>` scope-id.

Worked example uses the Spectator feature (SRS example in `.claude/agents/_templates/_artifacts/srs-template.md`).

## File header pattern — `by-us` mode

For `docs/test-cases/by-us/US-001/functional.md`:

```markdown
# Test cases — US-001: Spectator joins an in-progress tournament match

- Scope: by-us
- US-ID: US-001
- Layer: functional
- Linked FRs: FR-001 (Join in-progress match), FR-002 (Spectator session disconnect)
- Coverage matrix:
  | Anchor | Test case IDs |
  |---|---|
  | US-001.MF-1..MF-6 (happy path) | TC-US001-001 |
  | US-001.BR-1 (live state requires handshake) | TC-US001-001, TC-US001-005 |
  | US-001.BR-2 (concurrent sessions per account ≤ 1) | TC-US001-002 |
  | US-001.BR-3 (CN region forbids anonymous) | TC-US001-003 |
  | US-001.PC-1 (SpectatorSessionStarted event published) | TC-US001-001 |
  | US-001.PC-2 (session row persisted state=live) | TC-US001-001 |
  | US-001.PC-3 (ViewerCount incremented) | TC-US001-001, TC-US001-004 |
  | FR-001.Error-MATCH_NOT_PUBLIC | TC-US001-006 |
- Negative cases included: TC-US001-002, TC-US001-003, TC-US001-005, TC-US001-006
```

## File header pattern — `by-task` mode

For `docs/test-cases/by-task/T-014/api.md`:

```markdown
# Test cases — T-014: Spectator join endpoint

- Scope: by-task
- Task: T-014
- Track: be
- Linked US-IDs: US-001
- Linked FR-IDs: FR-001
- Layer: api
- Coverage matrix:
  | Endpoint + status | Test case IDs |
  |---|---|
  | POST /spectate/{match_id}/join → 200 | TC-T014-001 |
  | POST /spectate/{match_id}/join → 401 (no session) | TC-T014-002 |
  | POST /spectate/{match_id}/join → 401 ERR_AUTH_REQUIRED_REGIONAL | TC-T014-003 |
  | POST /spectate/{match_id}/join → 404 match not found | TC-T014-004 |
  | POST /spectate/{match_id}/join → 409 ERR_MATCH_NOT_PUBLIC | TC-T014-005 |
  | POST /spectate/{match_id}/join → 429 rate limit | TC-T014-006 |
- FR / contract drift: none observed at authoring time
```

## Happy-path case (`by-us`)

File: `docs/test-cases/by-us/US-001/functional.md`

```markdown
### TC-US001-001 — Spectator joins live tournament match end-to-end

- Linked anchor: US-001.MF-1, US-001.MF-2, US-001.MF-5, US-001.PC-1, US-001.PC-2, US-001.PC-3, US-001.BR-1
- Scope: by-us US-001
- Layer: functional
- Executable: e2e/specs/by-us/us-001-spectator-join.spec.ts
- Preconditions:
  - Test viewer account exists in Account/Passport (non-CN region)
  - Tournament match `M-T-001` exists, state = `in-progress`
  - `MatchPublicVisibility.is_public` for `M-T-001` = true (within tournament window, admin toggle on)
- Steps:
  1. Authenticate as test viewer; obtain valid Account/Passport session
  2. From spectator UI, tap Spectate on `M-T-001`
  3. UI sends POST /spectate/M-T-001/join with `{ account_id, client_meta }`
- Expected:
  - Response 200 within 2 seconds, body contains `{ session_id, stream_endpoint, viewer_count }`
  - Spectator UI loads live match view; viewer count visible
  - Backend: a `MatchSpectatorSession` row exists with state = `live` (BR-1 holds — handshake succeeded)
  - Backend: `SpectatorSessionStarted` event present on Kafka `spectator-events` topic (PC-1)
  - Backend: viewer count for `M-T-001` incremented by 1 in the current window (PC-3)
- Pass / Fail:
  - Pass: all five Expected items observable
  - Fail: any Expected missing — record actual values
- Tier: T1, T2
```

## Negative case — Business Rule violation (`by-us`)

```markdown
### TC-US001-002 — Concurrent session per account is capped at 1

- Linked anchor: US-001.BR-2
- Scope: by-us US-001
- Layer: functional
- Preconditions:
  - Test viewer account has an active `MatchSpectatorSession` (state = `live`) on `M-T-001`
- Steps:
  1. From a second client (same account), tap Spectate on `M-T-001` again
- Expected:
  - Response 200; body returns the SAME `session_id` as the existing session (reuse, not create)
  - Backend: no new `MatchSpectatorSession` row created
  - Backend: viewer count NOT incremented a second time
- Pass / Fail:
  - Pass: all three observable (reuse semantics enforced)
  - Fail: a new session_id was returned OR a new row was created OR viewer count went up
- Tier: T1
```

## Regional rule (`by-us`)

```markdown
### TC-US001-003 — Anonymous spectating forbidden in CN region

- Linked anchor: US-001.BR-3, FR-001.Error-AUTH_REQUIRED_REGIONAL
- Scope: by-us US-001
- Layer: functional
- Preconditions:
  - Test client geolocated to CN region
  - No Account/Passport session attached
  - Match `M-T-001` is publicly spectatable
- Steps:
  1. Send POST /spectate/M-T-001/join without an Authorization header
- Expected:
  - Response 401 with body `{ error: "AUTH_REQUIRED_REGIONAL", message: <localized> }`
  - No `MatchSpectatorSession` row created
- Pass / Fail:
  - Pass: 401 with exact error code; no session row
  - Fail: any other status, missing error code, or session row created
- Tier: T1
```

## API case — matching the contract (`by-task`)

File: `docs/test-cases/by-task/T-014/api.md`

```markdown
### TC-T014-001 — POST /spectate/{match_id}/join returns 200 with valid session

- Linked anchor: US-001.MF-1, FR-001.Rule-1 (response shape)
- Scope: by-task T-014
- Layer: api
- Executable: e2e/specs/by-task/t-014/api.spec.ts
- Preconditions:
  - Test viewer account has a valid Account/Passport session
  - Match `M-T-001` exists, in-progress, publicly spectatable
- Request:
  ```http
  POST /api/v1/spectate/M-T-001/join
  Authorization: Bearer <session_token>
  Content-Type: application/json

  {
    "account_id": "<test_viewer_id>",
    "client_meta": { "platform": "web", "version": "1.0.0" }
  }
  ```
- Expected response:
  - Status: 200
  - Headers: `Content-Type: application/json`
  - Body shape exactly:
    ```json
    {
      "session_id": "<uuidv7>",
      "stream_endpoint": "<wss:// URL>",
      "viewer_count": <integer >= 1>
    }
    ```
- Pass / Fail:
  - Pass: status, headers, and body shape all match
  - Fail: any mismatch
```

## API error case — FR Error Handling row (`by-task`)

```markdown
### TC-T014-005 — POST /spectate/{match_id}/join returns 409 ERR_MATCH_NOT_PUBLIC

- Linked anchor: FR-001.Error-MATCH_NOT_PUBLIC
- Scope: by-task T-014
- Layer: api
- Preconditions:
  - Match `M-T-002` exists, in-progress, but `MatchPublicVisibility.is_public` = false (admin toggle off)
  - Test viewer authenticated
- Request:
  ```http
  POST /api/v1/spectate/M-T-002/join
  Authorization: Bearer <session_token>
  Content-Type: application/json

  { "account_id": "<viewer_id>" }
  ```
- Expected response:
  - Status: 409
  - Body: `{ "error": "ERR_MATCH_NOT_PUBLIC", "message": <localized> }`
  - No `MatchSpectatorSession` row created in DB
- Pass / Fail:
  - Pass: 409 with exact error code; no row created
  - Fail: any other status, missing error code, or row created
```

## E2E case — multi-system (`by-task`)

File: `docs/test-cases/by-task/T-014/e2e.md`

```markdown
### TC-T014-101 — Join match, view live state, disconnect on heartbeat loss

- Linked anchor: US-001.MF-1..MF-6, US-002 (if applicable)
- Scope: by-task T-014
- Layer: e2e
- Preconditions:
  - Test viewer authenticated; match `M-T-001` publicly spectatable
  - Deploy reachable per docs/deploy-reports/T-014.md
- Steps:
  1. Open spectator UI in browser; tap Spectate on `M-T-001`
  2. Verify live state updates render within 1 second P95
  3. Disconnect the test client's network (simulate)
  4. Wait 30 seconds
- Expected:
  - Step 1: live view loads, viewer count visible
  - Step 2: at least 5 state updates observed in 5 seconds, each <1s end-to-end latency
  - Step 4: backend `MatchSpectatorSession` row transitions to state = `disconnected`; viewer count decrements
- Pass / Fail:
  - Pass: all three observable
  - Fail: late updates, no decrement, or session left in `live` state past timeout
```

## What does NOT appear in any of the above

- "The spectator UI should look professional" — subjective
- "Stream should feel smooth" — must be a number; the US Business Rule or FR Rule author should provide it, not QA
- "Implementation should use Redis pub/sub" — implementation detail; the FR file declares pub/sub as the integration but TCs assert behavior, not infra
- "Should not be slow" — must be a number; the NRS in SRS §4 supplies P95 < 1000ms

## Note on numbering across files

TC IDs are scope-prefixed and per-file. The same numeric (`001`) can appear under different scopes:

- `TC-US001-001` (by-us, functional)
- `TC-T014-001` (by-task, api)
- `TC-T014-101` (by-task, e2e — use 101+ to keep numeric ranges distinct between layers within the same task)

QA-Exec reports cite the full ID, never the bare numeric. Path is implied by the scope prefix but should be stated when the report references the test case file.
