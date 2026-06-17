# User Story Templates by Category

Use the matching template below as a starting point. Replace every placeholder with explicit data — QA-Author will write tests directly from the Main Flow, Business Rules, and Post-conditions, so vague placeholders become flaky tests.

Each User Story carries these sub-sections (per `.claude/agents/_templates/_artifacts/srs-template.md` §3.2):

- **Description** — As a / I want to / So that
- **Context/Files** (optional)
- **Pre-conditions** — facts before the flow begins
- **Main Flow** — numbered observable steps
- **Business Rules (Invariants)** — testable, unambiguous, bounded; Rule 1, Rule 2, …
- **Post-conditions** — verifiable end-state assertions

Sequence diagrams, Input/Output schemas, and Error Handling tables live in the per-FR files at `docs/frs/<FR-ID>.md` (per `.claude/agents/_templates/_artifacts/frs-template.md`). Cite the FR-ID in the US — don't duplicate the schema here.

## CRUD operations

```markdown
#### [US-NNN] - <Capability title>

* **ID:** US-NNN
* **Description:**
  **As a** <Role from SRS §5>
  **I want to** <Action: explicit method + resource + intent>
  **So that** <Value>
* **Context/Files:** `<services or paths>`
* **Pre-conditions:**
  1. <Actor is authenticated with role X>
  2. <Resource Y exists / does not exist>
* **Main Flow:**
  1. Agent receives <Input schema> at <FR-NNN endpoint>.
  2. Agent validates <Rule 1> per <FR-NNN>.
  3. Agent persists <Entity> via <Method>.
  4. Agent emits <event> on <topic>.
* **Business Rules (Invariants):**
  * **Rule 1:** <Field X is unique within Aggregate Y>
  * **Rule 2:** <Operation is idempotent on duplicate Input>
* **Post-conditions:**
  * Row <Entity> with <ID> exists in <table>.
  * Event <name> published to <topic>.
```

**Worked example — Create user (US-014):**

> #### [US-014] - Admin creates a publisher user
>
> * **ID:** US-014
> * **Description:**
>   **As a** Platform Admin
>   **I want to** create a publisher user with email and role
>   **So that** the publisher can sign in and operate within their permission scope
> * **Context/Files:** `services/identity/`, FRs: FR-014
> * **Pre-conditions:**
>   1. Admin authenticated with `platform-admin` role.
>   2. No existing `user` with the same email.
> * **Main Flow:**
>   1. Agent receives POST `/api/v1/users` with `{ email, role }` (schema per FR-014).
>   2. Agent validates email format and role-allowlist per FR-014.
>   3. Agent persists `user` row with generated UUIDv7.
>   4. Agent emits `user.created` event to Kafka topic `identity-events`.
>   5. Agent returns 201 with `{ id, email, role, created_at }`.
> * **Business Rules (Invariants):**
>   * **Rule 1:** `email` is unique across all `user` rows.
>   * **Rule 2:** `role` must be one of `{editor, viewer, publisher-admin}`; any other value rejected with 400 `INVALID_ROLE`.
>   * **Rule 3:** Duplicate POST with the same `email` returns 409 `DUPLICATE_EMAIL`; no second row is persisted.
> * **Post-conditions:**
>   * A row exists in `user` table with the supplied email.
>   * `user.created` event present on `identity-events` topic within 1 second.

## Async / event-driven

Pin: trigger, observable side effect, latency budget, idempotency.

```markdown
* **Pre-conditions:**
  1. <Upstream actor has produced state X>.
* **Main Flow:**
  1. Event `<name>` is published to `<topic>` with payload `<shape per FR-NNN>`.
  2. Consumer in `<service>` validates the event.
  3. Consumer performs <observable side effect>.
* **Business Rules (Invariants):**
  * **Rule 1:** Consumer is idempotent — a duplicate event produces no second side effect.
  * **Rule 2:** Latency from publish to side effect P95 < <latency budget>.
  * **Rule 3:** On <downstream> unavailable for <duration>, the event is <retried | dead-lettered> with <observable signal>.
* **Post-conditions:**
  * <Side effect> observable: <where and how>.
  * Metric `<name>` incremented.
```

**Worked example — Email-on-signup (US-022):**

> * **Pre-conditions:** A `user.created` event has been published for a new user.
> * **Main Flow:**
>   1. Email consumer reads `user.created` from `identity-events`.
>   2. Consumer renders the welcome-email template with `first_name` + `verification_link`.
>   3. Consumer calls SMTP provider's `/send`.
> * **Business Rules:**
>   * **Rule 1:** A duplicate `user.created` for the same user produces no second email (idempotency key = `user.id`).
>   * **Rule 2:** Time from publish to SMTP `/send` returning 2xx is P95 < 30 seconds.
>   * **Rule 3:** On SMTP 5xx, consumer retries with exponential backoff up to 5 attempts; after the 5th failure, the event moves to `email-dlq` and metric `email.send.failed` is incremented.
> * **Post-conditions:**
>   * Welcome email visible in SMTP provider audit log within 30 seconds of `user.created`.
>   * On failure: event present in `email-dlq` with the same payload.

## Integration with external system

Pin the external contract, our state, and the failure-mode branches.

```markdown
* **Pre-conditions:** <our state X>; <external contract version Y>.
* **Main Flow:**
  1. <our action that calls the external system>.
  2. <our state transition on success>.
* **Business Rules (Invariants):**
  * **Rule 1:** On a 200 response with `<external_field>`, our state moves to `<our_state>`.
  * **Rule 2:** On a specific external error code `<code>`, our state moves to `<failure_state>` with reason `<reason>`.
  * **Rule 3:** On timeout exceeding `<budget>`, we retry per <policy>; after exhaustion, our state moves to `<terminal_failure>`.
* **Post-conditions:** <our state assertion>; <event emitted>.
```

**Worked example — Payment provider charge (US-031):**

> * **Pre-conditions:** Order in `pending_payment` state; valid card token; payment provider contract v3.
> * **Main Flow:**
>   1. Agent calls payment provider's `/charge` with order amount and card token (schema per FR-031).
>   2. Agent records provider response in `payment_attempts`.
>   3. Agent transitions order state per provider response.
> * **Business Rules:**
>   * **Rule 1:** On 200 with `status:"succeeded"`, order → `paid` within 2 seconds; `payment.succeeded` event emitted.
>   * **Rule 2:** On 402 with `code:"insufficient_funds"`, order → `payment_failed` with reason `insufficient_funds`; user sees explicit message.
>   * **Rule 3:** On timeout > 30s, order stays `pending_payment`; retry scheduled at +60s; after 3 retries → `payment_failed` with reason `provider_timeout`.
> * **Post-conditions:**
>   * Order state matches the rule above.
>   * `payment_attempts` row records the response.

## UI flow

```markdown
* **Pre-conditions:** <screen X, in state Y>.
* **Main Flow:**
  1. <user gesture on element>.
  2. <UI fires action, calls FR-NNN endpoint>.
  3. <UI receives response and transitions to state Z>.
* **Business Rules (Invariants):**
  * **Rule 1:** Element <E> is disabled while <condition>; enabled when <condition>.
  * **Rule 2:** On <failure response>, UI shows error <message> at <location>; field <F> is <cleared/preserved>.
* **Post-conditions:**
  * Final screen <X>; testable element states <list>.
```

**Worked example — Login flow (US-008):**

> * **Pre-conditions:** Login screen visible; email + password fields empty; Submit disabled.
> * **Main Flow:**
>   1. User types email and password.
>   2. User clicks Submit; UI calls POST `/api/v1/auth/login` per FR-008.
>   3. On 200, UI navigates to Dashboard.
> * **Business Rules:**
>   * **Rule 1:** Submit is disabled while either field is empty or while a request is in flight.
>   * **Rule 2:** On 401, UI stays on login; error "Email or password is incorrect" appears below the password field; email field retains its value; password field is cleared.
>   * **Rule 3:** After 5 failed attempts in 10 minutes (Account/Passport-side), UI shows "Too many attempts — try again in 10 minutes" and disables Submit for 10 minutes.
> * **Post-conditions:**
>   * On success: Dashboard visible; login screen not in nav stack; session cookie set with `HttpOnly; Secure`.

## Performance / non-functional

NRS items typically don't have a Main Flow — they describe constraints over the system. Express as Business Rules attached to a parent US, or as standalone numbered items in SRS §4. If treating as a US, format:

```markdown
* **Pre-conditions:** <load conditions: concurrency, request rate, payload size>.
* **Business Rules (Invariants):**
  * **Rule 1:** Metric <X> measured at <observation point> stays <bound> over <window>.
  * **Rule 2:** Violation = <metric exceeds bound for duration W within window>; exempted = <list of windows e.g., deploy roll>.
```

**Worked example — API latency (US-046):**

> * **Pre-conditions:** Sustained load of 200 req/s against `GET /api/v1/users/<id>`; payload size 1KB.
> * **Business Rules:**
>   * **Rule 1:** P95 latency measured at load balancer < 150ms over a 5-minute window.
>   * **Rule 2:** P99 latency < 300ms over the same window.
>   * **Rule 3:** Violation = P95 exceeding 150ms for any 60-second interval within the window with success rate > 99%. Failures during deploy rolling restart are not counted.

## Security / authz

```markdown
* **Pre-conditions:** Principal with <role>; resource <R>.
* **Main Flow:**
  1. Principal performs <action> on <resource>.
* **Business Rules (Invariants):**
  * **Rule 1:** Principal with role <permitted> → response 200; principal with role <denied> → 403 with `FORBIDDEN`.
  * **Rule 2:** Unauthenticated request → 401 (not 403).
  * **Rule 3:** Every denied / permitted action emits an audit log entry with `{ principal_id, action, resource_id, outcome, reason, timestamp }`.
* **Post-conditions:**
  * Audit log entry exists in <store> within 1 second of the response.
```

**Worked example — Admin-only endpoint (US-052):**

> * **Pre-conditions:** User authenticated with role `editor`.
> * **Main Flow:** User GETs `/api/v1/admin/users`.
> * **Business Rules:**
>   * **Rule 1:** Role `platform-admin` → 200 with the user list; role `editor` (or any non-admin) → 403 with `FORBIDDEN`.
>   * **Rule 2:** Unauthenticated request → 401 (not 403).
>   * **Rule 3:** Every request emits an audit entry: `{ principal_id, action: "list_users", resource: "/admin/users", outcome, reason, timestamp }`.
> * **Post-conditions:** Audit entry exists in the audit store within 1 second; outcome reflects the request.
