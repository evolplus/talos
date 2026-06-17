# SRS Feasibility Report — v<srs-version>

- **SRS version:** v<srs-version>
- **SRS Last-Updated (at validation):** <ISO-8601>
- **Validator:** srs-feasibility-validator (second gate)
- **First-gate (source) report:** docs/srs-validation-reports/v<srs-version>.md (verdict: qualified)
- **Latest run:** Run <N> — <ISO-8601>
- **Latest verdict:** `qualified | unqualified`

> **Append-only file.** Each feasibility pass adds a new `## Feasibility run <N>` section. Prior runs are NEVER overwritten.

---

## Feasibility run <N>

- **Dispatch:** first-feasibility-check | re-validation (after BA addressed OQ-<list>)
- **Verdict:** `qualified | unqualified`
- **Issues found:** <N>  (0 if qualified)
- **OQs filed:** OQ-<NNN>..OQ-<NNN>
- **Recommendation:** flip-to-signed-off | re-dispatch-BA-mode-D-with-OQ-list

### Step 1 — Cross-FR / Cross-US internal consistency

| Pair | Concern | Detail | Outcome |
|---|---|---|---|
| FR-007 + FR-022 | Shared data path (repositories table) | FR-007 expects real-time consistency (<100ms); FR-022 batch-writes every 5min | `cross-fr-conflict` — routes to OQ-NNN |
| US-003 + US-021 | Shared user-role (admin) | US-003 grants `repo:read`; US-021 assumes admin has `repo:write` — but `write` is not granted by any US for admin role | `permission-gap` — routes to OQ-NNN |

(Empty when `qualified`.)

### Step 2 — NRS realism

| NRS target | Section | Org-default range | Stack baseline | Outcome |
|---|---|---|---|---|
| Latency p99 <10ms (cross-region) | §4 | 50-200ms (per solution-defaults) | n/a | `nrs-unrealistic` — routes to OQ-NNN |
| Availability 99.99% | §4 | 99.9% (Passport SLA) | — | Chain break: vendor SLA caps at 99.9%; `nrs-chain-break` — routes to OQ-NNN |

### Step 3 — External-integration feasibility

| System | SRS-expected use | Vendor capability | Outcome |
|---|---|---|---|
| Passport | OAuth + region: VN | Confirmed | accurate |
| External vendor X | 10k req/s sustained | Docs say 1k req/s | `external-integration-infeasible` — routes to OQ-NNN |
| Vendor Y | Data-residency VN | APAC-Singapore only | `region-mismatch` — routes to OQ-NNN |

### Step 4 — API contract format consistency

| API style declared | §3.4.4 format | Default | Match? | Outcome |
|---|---|---|---|---|
| REST | openapi-3.1 | openapi-3.1 | yes | accurate |
| gRPC | (not declared) | proto3 | missing | `api-contract-format-inconsistent` — routes to OQ-NNN |

### Step 5 — Security & Compliance internal consistency

| §4.1 claim | Conflicting FR / §3.5 row | Outcome |
|---|---|---|
| Encryption: at-rest + in-transit | §3.5 row "external vendor X" endpoint is HTTP-only | `security-internal-conflict` — routes to OQ-NNN |
| Anonymous access: forbidden | FR-007 says `Public read OK` | `security-vs-fr-conflict` — routes to OQ-NNN |

### Step 6 — Third-party dependency feasibility

| Dependency | Availability | Budget | Region | License | Outcome |
|---|---|---|---|---|---|
| Postgres | active GA | within | VN | OSS PostgreSQL | accurate |
| Vendor X (per-call $0.01) | GA | 1M calls/mo × $0.01 = $10k/mo (no budget declared in SRS §3.6) | VN | proprietary | `dependency-budget-exceeded` (or `budget-not-declared`) — routes to OQ-NNN |
| Designated Dependency Approver | header: `TBD` | — | — | — | `dependency-approver-missing` — routes to OQ-NNN |

### Verdict

`qualified` — every cross-FR pair is consistent; every NRS target is realistic; every external integration is feasible; every API contract format is declared; every §4.1 claim is internally consistent; every third-party dependency is available + within budget + in region.

OR

`unqualified` — <N> issue(s) found. Per-issue detail + proposed OQ texts in § Issues below.

### Issues (only when `unqualified`)

#### Issue 1 — `cross-fr-conflict`

- **Pair:** FR-007 + FR-022
- **Concern:** FR-007 expects real-time consistency on the repositories table; FR-022 batch-writes the same table every 5 minutes. The 5-minute batch will stall FR-007's <100ms reads during write windows.
- **Proposed OQ for SRS:**
  ```
  ### OQ-NNN — FR-007 / FR-022 timing conflict
  - Category: cross-fr-conflict
  - Affected: FR-007, FR-022, repositories table
  - Question: How should the conflict be resolved? Options:
      [a] Loosen FR-007 to "best-effort during batch windows" with a documented exception
      [b] Change FR-022 to delta-writes (replace batch with streaming) — re-scope batch FR
      [c] Add read-replica for FR-007 reads (architecture change; SA dispatch needed post-sign-off)
      [d] Defer — accept the conflict + document operator awareness in §4.1
  - Recommended: <a / b / c / d based on context>
  ```

#### Issue 2 — `nrs-unrealistic`

(same shape — propose OQ with options the BA / operator can pick from)

(Repeat per issue.)

### Recommendation

`re-dispatch-BA-mode-D-with-OQ-list` — Orchestrator re-dispatches BA Mode D with the OQs. BA addresses each per the routing table:

| OQ category | Routes to |
|---|---|
| `cross-fr-conflict` | BA (synthesis fix) OR operator (scope decision) |
| `nrs-unrealistic` / `nrs-chain-break` | Operator (scope decision — loosen target or change tech) |
| `external-integration-infeasible` / `region-mismatch` | Operator (vendor change OR scope reduction) |
| `api-contract-format-inconsistent` | BA (declare format in §3.4.4) |
| `security-internal-conflict` / `security-vs-fr-conflict` | BA + operator (reconcile §4.1 with FRs) |
| `dependency-unavailable` / `dependency-budget-exceeded` / `dependency-approver-missing` | Operator (vendor choice / budget call / Approver name) |

After BA addresses + flips Status back to `Ready-for-Sign-off`, both gates re-run. Loop until both qualified.

OR

`flip-to-signed-off` — Status: Signed-off; downstream SDLC unblocked.

---

(Feasibility run <N+1> appears here after the next dispatch, if any.)
