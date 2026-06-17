# SRS Validation Report — v<srs-version>

- **SRS version:** v<srs-version>
- **SRS Last-Updated (at validation):** <ISO-8601>
- **Validator:** srs-validator
- **Latest run:** Run <N> — <ISO-8601>
- **Latest verdict:** `qualified | unqualified`
- **Source corpus snapshot:**
  - Initial PM input: `docs/requirements/` — <N> file(s), last-modified <ISO-8601>
  - Conversational additions: `docs/requirements/conversational-additions/` — <N> file(s), last-modified <ISO-8601>
- **SRS structural surface:** <N> US in `docs/user-stories/`, <N> FR in `docs/frs/`, <N> external integrations in `docs/external-integrations/`

> **Append-only file.** Each validation pass adds a new `## Validation run <N>` section below. Prior runs are NEVER overwritten — the file is the kit's audit log of how the SRS converged on `Signed-off`.

---

## Validation run <N>

- **Dispatch:** first-validation | re-validation (after BA addressed OQ-<list>)
- **Verdict:** `qualified | unqualified`
- **Gaps found:** <N>  (0 if qualified)
- **OQs filed:** OQ-<NNN>..OQ-<NNN>  (none if qualified)
- **Coverage matrix:** see below
- **Recommendation:** flip-to-signed-off | re-dispatch-BA-mode-D-with-OQ-list

### Coverage matrix

One row per requirement-source claim. Wildcards (e.g., "all FRs in §3.3") expand to one row per matched item.

| Source claim | Source location | SRS target | Relationship | Detail |
|---|---|---|---|---|
| User must be able to filter by region | requirements/initial-prd.md L42-L48 | US-003 Main Flow step 4; FR-007 Input Schema `region: enum` | `accurate` | — |
| Batch operations capped at 50 items | requirements/initial-prd.md L120 | FR-022 BR-217 "atomicity for ≤50 items" | `paraphrased` | Source says "capped at 50"; SRS specifies atomicity semantics for that cap. Acceptable synthesis. |
| Operator approves promo before publish | requirements/conversational-additions/2026-06-04-promo-approval.md L8-L12 | (none — no US/FR maps) | `requirement-source-orphan` | **GAP.** New requirement from 2026-06-04 not yet ingested into SRS. Routes to OQ-NNN. |
| (none in source) | — | FR-031 "auto-rebalance leaderboards every hour" with no `Source:` annotation | `srs-orphan-no-source` | **GAP.** Invented content; no source provenance. Routes to OQ-NNN. |
| Batch max 50 items | requirements/initial-prd.md L120 | FR-022 BR-217 (specifies max 100) | `verbatim-mismatch` | **GAP.** Source says 50; SRS says 100. Could be typo, could be deliberate. Routes to OQ-NNN asking BA to confirm. |
| Anonymous read allowed | requirements/initial-prd.md L88 | requirements/conversational-additions/2026-06-04-auth-update.md L4 (says "authenticated read only") | `source-conflict-unresolved` | **GAP.** Two source files conflict; SRS reflects only one without an OQ acknowledging the conflict. Routes to OQ-NNN asking operator to disambiguate. |

### Verdict

`qualified` — every requirement-source claim is reflected accurately in the SRS-side artifacts; no orphan SRS content; no synthesis drift; no verbatim mismatches; no unresolved source conflicts.

OR

`unqualified` — <N> gap(s) found. Per-gap detail and proposed OQ texts in § Gaps below. Routing: re-dispatch BA Mode D with the OQ list.

### Gaps (only when `unqualified`)

#### Gap 1 — `requirement-source-orphan`

- **Source claim:** "Operator approves promo before publish" — requirements/conversational-additions/2026-06-04-promo-approval.md L8-L12
- **Why a gap:** No US, FR, or external-integration in the SRS reflects this requirement. BA Mode D dispatch on 2026-06-04 captured the source file but did not synthesize a US/FR.
- **Proposed OQ for SRS:**
  ```
  ### OQ-NNN — Promo approval flow not yet represented in SRS
  - Category: requirement-source-orphan
  - Source: requirements/conversational-additions/2026-06-04-promo-approval.md L8-L12
  - Question: How should "operator approves promo before publish" be modeled? Options:
      [a] New US — operator-approval flow with permissioning + audit trail
      [b] Extension of US-021 (existing promo workflow) — add a pre-publish gate step
      [c] Existing FR-018 covers this implicitly via the approval-state column; add SRS annotation referencing the source file
      [d] Defer — source noted but not in scope for v<srs-version>; track via SRS Changelog
  - Recommended: <a / b / c / d based on context>
  ```

#### Gap 2 — `srs-orphan-no-source`

- **SRS claim:** FR-031 "auto-rebalance leaderboards every hour"
- **Why a gap:** No requirement-source file mentions auto-rebalance; FR-031 carries no `Source:` annotation indicating provenance.
- **Proposed OQ for SRS:**
  ```
  ### OQ-NNN — FR-031 has no source provenance
  - Category: srs-orphan-no-source
  - SRS location: docs/frs/FR-031.md
  - Question: Where did FR-031 originate? Options:
      [a] Add to docs/requirements/conversational-additions/<date>-leaderboard-rebalance.md and re-validate
      [b] Annotate FR-031 with `Source: ba-augmentation (engineering-derived from US-012 performance requirements)` if the FR is a derivation, not a requirement
      [c] Remove FR-031 — invented content, not part of the project scope
  ```

(Repeat per gap.)

### Recommendation

`re-dispatch-BA-mode-D-with-OQ-list`:

The Orchestrator dispatches BA in Mode D with the new OQs (OQ-<list>) from § Gaps. BA addresses each per its Phase 1.X gap-handling discipline:
- `requirement-source-orphan` → synthesize US/FR/external-integration; cite source file
- `srs-orphan-no-source` → annotate with `Source:` OR delete invented content
- `synthesis-drift` → reconcile SRS wording with source
- `verbatim-mismatch` → confirm intended value; update SRS or source as appropriate
- `source-conflict-unresolved` → file OQ for operator disambiguation; capture resolution in `docs/requirements/conversational-additions/<date>-resolve-<topic>.md`

After BA completes, BA flips Status back to `Ready-for-Sign-off` and the Orchestrator re-dispatches srs-validator. The next pass writes `## Validation run <N+1>` below.

OR

`flip-to-signed-off`:

Verdict is `qualified`. The validator's atomic edits to `docs/SRS.md` (Status → Signed-off, Signed-off-by → srs-validator, Changelog row) have been applied. Downstream SDLC (SA + QA-Author by-us, then TL, then Devs) is unblocked.

---

(Validation run <N+1> appears here after the next dispatch, if any.)
