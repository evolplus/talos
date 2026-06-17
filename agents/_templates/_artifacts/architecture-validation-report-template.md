# Architecture Validation Report — v<arch-version>

- **Architecture version:** v<arch-version>
- **Architecture Last-Updated (at validation):** <ISO-8601>
- **Linked SRS:** docs/SRS.md (Status: Signed-off)
- **Validator:** architecture-validator (independent design gate)
- **Latest run:** Run <N> — <ISO-8601>
- **Latest verdict:** `qualified | unqualified`

> **Append-only file.** Each validation pass adds a new `## Validation run <N>` section. Prior runs are NEVER overwritten.

---

## Validation run <N>

- **Dispatch:** first-validation | re-validation (after SA addressed revision list R-<list>)
- **Verdict:** `qualified | unqualified`
- **Findings:** <N>  (0 if qualified)
- **Recommendation:** flip-to-validated | re-dispatch-SA-with-revision-list

### Step 1 — SRS → component coverage

| Direction | Item | Mapped to | Outcome |
|---|---|---|---|
| forward | FR-007 | Component "Sync Worker" (C3) | covered |
| forward | US-021 | (none) | `coverage-gap` — R-NNN |
| reverse | Component "Legacy Adapter" | (no US/FR) | `orphan-component` — R-NNN |

### Step 2 — §6 cross-component data contracts

| FR / flow | Crossing kind | §6 row present? | Outcome |
|---|---|---|---|
| FR-007 (GitLab ts → MySQL DATETIME) | format-boundary (datetime) | no | `format-boundary-missing` — R-NNN |
| FR-012 (worker reads `last_synced_at`) | gate-field | yes | covered |

### Step 3 — ADR completeness

| Choice / dependency | ADR present? | Approver | Outcome |
|---|---|---|---|
| Datastore = Postgres | ADR-0003 | n/a (in-org default) | covered |
| Vendor X (new paid API) | (none) | — | `adr-missing` — R-NNN |
| Redis (new managed svc) | ADR-0005 | TBD | `dependency-approver-missing` — R-NNN |

### Step 4 — Instrumentation contract presence

- UI-bearing SRS? `yes | no`
- `docs/instrumentation-contract.md` present? `yes | no`
- Outcome: `covered | instrumentation-contract-missing` — R-NNN

### Step 5 — NRS target → design mechanism

| NRS target | §ref | Design mechanism named | Outcome |
|---|---|---|---|
| p99 read < 100ms | §4 | read-replica + 60s cache (C3 "Cache") | covered |
| throughput 5k req/s | §4 | (none) | `nrs-unaddressed` — R-NNN |
| availability 99.95% | §4 | multi-AZ + health-checked failover | covered |

### Step 6 — Cross-cutting concerns

| Concern | Addressed in architecture? | Outcome |
|---|---|---|
| Auth/authz model | §2 + ADR-0002 | covered |
| Observability (SRS §6 Activity Logging) | (not addressed) | `cross-cutting-gap` — R-NNN |
| Failure modes (retry / do-not-retry) | §5 | covered |

### Step 7 — Source layout + self-containment

| Check | Outcome |
|---|---|
| C2 container names ↔ SRS §3.4.5 sub-dir slugs | `aligned | source-layout-mismatch` — R-NNN |
| No upstream-source references in body | `clean | self-containment-violation` — R-NNN |

### Verdict

`qualified` — every SRS US/FR maps to a component; every cross-system field has a §6 contract; every non-trivial choice + new dependency has an ADR with a named Approver; the instrumentation contract exists (if UI); every NRS target maps to a mechanism; every cross-cutting concern is explicit; source layout aligns; the document is self-contained.

OR

`unqualified` — <N> finding(s). Per-finding revision request below.

### Revision list (only when `unqualified`)

#### R-1 — `format-boundary-missing`

- **Location:** architecture.md §6; FR-007 data flow (GitLab `updated_at` → MySQL DATETIME).
- **Finding:** FR-007 moves an ISO-8601 datetime from GitLab into a zone-less MySQL `DATETIME` column with no §6 format-boundary row declaring the conversion. Verbatim bind = the deterministic FR-022-class bug.
- **Revision request (for SA):** Add a §6 format-boundary row: Field `updated_at`; Source `ISO-8601 (T+Z)`; Destination `MySQL DATETIME (zone-less, UTC)`; Boundary owner `Sync Worker`; Transformation `toMysqlUtcDatetime()`; Failure-mode `do-not-retry`.

#### R-2 — `nrs-unaddressed`

(same shape — name the target + ask SA for the concrete mechanism)

(Repeat per finding.)

### Recommendation

`re-dispatch-SA-with-revision-list` — Orchestrator re-dispatches SA `design` mode with R-1..R-N. SA revises `docs/architecture.md` (stays `Draft`); architecture-validator re-runs. Loop until `qualified`.

OR

`flip-to-validated` — architecture Status: Validated; TL unblocked.

---

(Validation run <N+1> appears here after the next dispatch, if any.)
