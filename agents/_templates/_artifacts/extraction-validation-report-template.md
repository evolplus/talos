# Extraction Validation Report — <slug>

<!--
  Owner: extraction-validator. APPEND-ONLY.
  One `## Validation run <N>` section per dispatch. Never overwrite a prior run —
  the sequence of runs is the audit trail of how the extraction converged.
  Brownfield onboarding Stage 3.5; see .claude/rules/brownfield-onboarding.md §12.
-->

- **Slug:** <topic-slug>
- **Snapshot-Commit:** <full SHA — all checks run against this commit, not the working tree>
- **Inventory:** `docs/archaeology-reports/<slug>.inventory.md`
- **Intent report:** `docs/archaeology-reports/<slug>.intent.md`
- **Purpose:** governance | documentation
- **Artifacts under validation:** `docs/architecture.md`, `docs/api-contracts/`, `docs/SRS.md`, `docs/user-stories/`, `docs/frs/`

---

## Validation run <N>

- **Date:** <ISO-8601>
- **Dispatch intent:** first-validation | re-validation
- **Verdict:** qualified | unqualified

### Coverage summary

| Section | Total IDs | Covered | Dispositioned | Undispositioned | Coverage |
|---|---|---|---|---|---|
| Routes (`INV-R`) | <n> | <n> | <n> | <n> | <%> |
| Async (`INV-E`) | <n> | <n> | <n> | <n> | <%> |
| Tables (`INV-T`) | <n> | <n> | <n> | <n> | <%> |
| Egress (`INV-X`) | <n> | <n> | <n> | <n> | <%> |
| Deployables (`INV-D`) | <n> | <n> | <n> | <n> | <%> |
| Prod libraries (`INV-L`) | <n> | <n> | <n> | <n> | <%> |

*Pass condition is `Undispositioned = 0`, not a coverage percentage. The percentage is reported for trend, not for gating.*

**Dispositions recorded this run**

| Inventory ID | Disposition | Evidence |
|---|---|---|
| `INV-R-014` | internal | `src/health.go:12` — bound to the loopback listener only |
| `INV-R-031` | dead | Stage 1c: zero requests in 90 days |

### Contract-stub coverage

| Surface | `INV-*` ID | Contract artifact | Format | Both bindings | Status |
|---|---|---|---|---|---|
| `POST /orders` | `INV-R-007` | `docs/api-contracts/orders.openapi.yaml` | openapi-3.1 | n/a | Extracted |
| `orders.created` | `INV-E-003` | `docs/api-contracts/orders.asyncapi.yaml` | asyncapi-2.6 | producer + consumer | Extracted |

*A channel with only one binding is `contract-stub-incomplete` — a one-sided message observation is not a flow. No extracted stub may be `Frozen`.*

### Check results

| # | Check | Result | Blocking findings |
|---|---|---|---|
| 1 | Citation resolution | pass / fail | <n> |
| 2 | Reverse coverage | pass / fail | <n> |
| 3 | Contract-stub coverage | pass / fail | <n> |
| 4 | Forward traceability + confidence-tier conformance | pass / fail | <n> |
| 5 | Intent-trace completeness | pass / fail | <n> |
| 6 | Invention detection | pass / fail | <n> |
| 7 | Confirmation set built | done / skipped (`purpose: documentation`) | — |

### Blocking findings

<!-- One block per finding. Omit the section entirely when the verdict is qualified. -->

#### F-<NNN> — <category> — <one-line summary>

- **Category:** extraction-gap | contract-stub-missing | contract-stub-incomplete | fabricated-citation | unsourced-claim | confidence-inflation | untraced-inference | invention
- **Artifact:** <path> § <section>
- **Inventory ID:** `INV-R-042` (when applicable)
- **Finding:** <what is wrong, stated as a fact about the artifact>
- **Evidence:** <the command run and its result, or the citation that failed to resolve>
- **Routes to:** Stage 1a | Stage 1b | Stage 2 (SA extract) | Stage 3 (BA Mode E)
- **Required revision:** <what the authoring stage must do to clear this>

*Worked examples of the two classes this gate exists to catch:*

> **F-003 — extraction-gap — the admin surface is absent from the extracted SRS.**
> `INV-R-088` … `INV-R-104` (17 routes under `Services/Admin/`) appear in the Tier-1 manifest and in no kit artifact. Nested sub-namespace; a flat glob over the controller directory does not reach it. Routes to Stage 3 — architecture §3.6 does carry them, so this is an SRS-side omission, not a re-inventory.

> **F-007 — contract-stub-incomplete — `orders.created` has a producer binding and no consumer.**
> `INV-E-003` is declared in `orders.asyncapi.yaml` with a publish operation only. The manifest records a consumer group at `workers/fulfilment/consumer.go:44` that the stub does not bind. Retry/DLQ and ack behavior are therefore undocumented. Routes to Stage 2.

### Non-blocking observations

Appended to `docs/open-issues.md` with category `extract-confirmation-pending`. For the humans at Stage 4, not for a re-dispatch.

| # | Artifact | Observation | Why it is not blocking |
|---|---|---|---|

### Verdict and transition

- **On `qualified`:** `Extraction-Validated: <ISO-8601> | run <N> | commit <SHA>` written to the headers of `docs/architecture.md` and `docs/SRS.md`. Confirmation set produced (governance purpose). Stage 4 unblocked. `plan-update.json` → `next_action: stage-4-confirmation`.
- **On `unqualified`:** artifact headers untouched. `plan-update.json` → `next_action: re-dispatch-<stage>-with-revision-list`.

### Confirmation set summary (qualified + governance only)

- **Path:** `docs/brownfield-confirmation/<slug>.md`
- **Items ranked for human confirmation:** <n> of <total extracted items>
- **Budget:** <estimated session length> across <n> sessions
- **Audience split:** Product <n> items (capability-level) / Engineering <n> items (mechanism-level)

| Band | Items | Why ranked here |
|---|---|---|
| 1 — must confirm | <n> | inferred or low confidence AND (auth / money / PII / retention), or contested by runtime evidence |
| 2 — should confirm | <n> | inside the blast radius of planned forward work |
| 3 — lazy confirm on touch | <n> | high-confidence, low-consequence; stays `Source: extracted` until a dispatch touches it |

*Band 3 items are not "skipped" — they stay `Source: extracted`, which downstream agents already treat as inferred-only-not-binding. The budget is what makes the gate finishable; an unbounded gate is a gate nobody walks through.*
