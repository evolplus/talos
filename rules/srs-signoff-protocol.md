# SRS Sign-off Protocol

This file holds the procedural detail for the two-gate SRS sign-off, formerly embedded in CLAUDE.md §2. Section number is preserved — when agents cite "CLAUDE.md §2," this file is the operational expansion.

For workflow contract entry-point, see `CLAUDE.md`. The Status enum + sign-off invariant stay in CLAUDE.md §2 (always-on for every agent). This file holds the per-step procedural detail BA + the two validators need.

---

## 2a. Sign-off Protocol (operational detail)

**Two-gate sign-off model (v0.3.4).** The kit's earlier model had BA both authoring and approving the SRS — a self-attest pattern the kit's discipline rejects everywhere else (FE Dev's Phase 5 verdict is BA-authored; Code Reviewer is a cold non-SDLC role; QA-Exec is independent of QA-Author). The 2026-06-04 FR-022 incident showed the structural cost of self-attest gates on the implementation side; this two-gate protocol closes the parallel gap on the ingestion side. **The protocol uses TWO independent validators with sequential authority** — source-faithfulness and technical-feasibility are different concerns with different inputs and different failure-routing.

### Step 1 — BA's job (Phase 1.X + Phase 2)

1. BA reads the SRS end-to-end.
2. BA identifies gaps, ambiguities, conflicts with architecture, or User Stories whose Business Rules / Post-conditions are missing or untestable (per `.claude/skills/user-story-author/`).
3. **Every** such item is written to the `## Open Questions` section of `docs/SRS.md` with a unique ID (`OQ-001`, `OQ-002`, ...).
4. **If `Open Questions` is non-empty → Status remains `In-Review`.** No downstream role may start.
5. **If `Open Questions` is empty → BA sets Status to `Ready-for-Sign-off`** (NOT `Signed-off`). BA leaves `Signed-off-by:` empty. BA's `plan-update.json` signals: `notes: "SRS Status: Ready-for-Sign-off. Dispatch srs-source-validator (first sign-off gate)."`

### Step 2 — srs-source-validator's job (first sign-off gate; source faithfulness)

6. The Orchestrator detects Status = `Ready-for-Sign-off` and dispatches `srs-source-validator`. The validator is independent of BA — its job is to verify the SRS faithfully reflects the source corpus at `docs/requirements/` (initial PM input + `conversational-additions/`).
7. The validator builds a coverage matrix (every source claim → SRS target; every SRS claim → source justification or `Source: ba-augmentation` annotation) and produces `docs/srs-validation-reports/v<srs-version>.md` with verdict `qualified` or `unqualified`.
8. **`qualified` verdict** → validator flips Status `Ready-for-Sign-off → Source-Validated`. `Signed-off-by:` stays empty (feasibility-validator will set it). Validator's `plan-update.json` signals: `notes: "SRS Status: Source-Validated. Dispatch srs-feasibility-validator (second sign-off gate)."`
9. **`unqualified` verdict** → validator appends new OQs (categorized: `requirement-source-orphan`, `srs-orphan-no-source`, `synthesis-drift`, `verbatim-mismatch`, `source-conflict-unresolved`), flips Status back to `In-Review`. Orchestrator re-dispatches BA Mode D. Loop until source-validator returns `qualified`.

### Step 3 — srs-feasibility-validator's job (second sign-off gate; technical feasibility)

10. The Orchestrator detects Status = `Source-Validated` and dispatches `srs-feasibility-validator`. The validator is independent of BA AND of srs-source-validator — its job is to verify the SRS describes technically feasible work. It checks six concerns:
    - **Cross-FR / cross-US internal consistency** (shared data paths with conflicting timing; shared user-roles with conflicting permissions; state-machine overlap; cross-cutting §4.1 consistency)
    - **NRS realism** (latency / throughput / availability targets vs org SLOs in `solution-defaults` skill and vendor SLAs in §3.5)
    - **External-integration feasibility** (vendor's stated capabilities vs SRS's expected use; region fit; auth/encryption match)
    - **API contract format consistency** (§3.4.4 declared format covers every API style in §3.4; per-FR mentions align)
    - **Security & Compliance internal consistency** (§4.1 claims don't contradict FRs or §3.5 vendors; PII/auth/payment coverage)
    - **Third-party dependency feasibility** (availability, budget, region, license, Approver named)

11. The validator produces `docs/srs-feasibility-reports/v<srs-version>.md` with verdict `qualified` or `unqualified`.
12. **`qualified` verdict** → validator flips Status `Source-Validated → Signed-off`, sets `Signed-off-by: srs-feasibility-validator`, appends Changelog row citing BOTH reports. Downstream SDLC unblocks.
13. **`unqualified` verdict** → validator appends new OQs (categorized: `cross-fr-conflict`, `nrs-unrealistic`, `external-integration-infeasible`, `api-contract-format-inconsistent`, `security-internal-conflict`, `dependency-unavailable`, `dependency-budget-exceeded`), flips Status back to `In-Review` (NOT `Source-Validated` — BA's fix may invalidate the prior source-validation pass, so both gates re-run on re-dispatch).

14. Any subsequent change to SRS scope, US contracts, FR contracts, or §4.1 reverts Status to `Draft` and the protocol restarts (BA Phase 1.Z handles via iteration mode when applicable).

Pure wording / typo fixes do not revert sign-off but must be logged in SRS changelog.

### Hard Rule (mirrored in `.claude/rules/hard-rules.md`)

- Only `srs-source-validator` may transition `Ready-for-Sign-off → Source-Validated`.
- Only `srs-feasibility-validator` may transition `Source-Validated → Signed-off`.
- BA cannot self-sign-off (caps at `Ready-for-Sign-off`).
- The Orchestrator cannot manually flip any sign-off Status transition.
- The operator cannot override (escape hatches do not apply to these transitions).

The kit's discipline rests on the author-and-approver-being-different-agents principle, AND on the source-vs-feasibility concerns staying separated. Both gates must return `qualified` before `Signed-off` is reachable.

### Resolving Open Questions efficiently

When the SRS has multiple unresolved OQs and resolutions require investigation (technical trade-offs, vendor comparisons, security regime fit), the user can dispatch the `oq-resolver` agent (Path B4 per `.claude/rules/task-type-routing.md` §11). The resolver reads each OQ, proposes 2–3 concrete options with trade-offs, and surfaces a multi-choice prompt. The user picks; BA is dispatched to record the chosen option into the SRS `## Resolved Questions`. The resolver itself never modifies the SRS.

### Designs are not a sign-off prerequisite

UI requirements may sign off without pinned Figma nodes. The UI/UX Designer fills the gap post-sign-off, and BA verifies completeness in Phase 3 (see `.claude/rules/parallel-execution.md` §4).

### Security & Compliance

If the requirement involves auth, payments, PII, account data, public endpoints, or third-party integrations, the BA adds a `## Security & Compliance` section to the SRS. Sign-off cannot complete until this section is present and reviewed.

### Designated Design Approver

The SRS header field names the human who confirms designs at design lifecycle step 4 (`.claude/rules/parallel-execution.md` §4). The field is **required to be present** in every SRS, but its value can be `TBD` until UI work begins. When the SRS has at least one UI surface and Approver is `TBD` at sign-off, the BA files a `deferred` entry in `docs/open-issues.md` with `Target phase: before UI/UX Designer dispatch` so the gap is tracked visibly. SRS sign-off proceeds normally; the gate is enforced at design lifecycle step 0 by the Orchestrator, which refuses UI/UX Designer dispatch until the SRS field is populated.

**Changing the Approver mid-project** is process metadata, not scope. Update the SRS header, log the change in the SRS `## Changelog`, and notify any task with design sub-status between `design-pending-user-confirmation` and `design-confirmed` (the in-flight confirmations restart against the new Approver). No status revert.

### Designated Dependency Approver

Parallels the Design Approver but applies to third-party dependency choices (paid services, OSS libraries, managed cloud services, external APIs, first-time-use self-hosted vendor tools — see `.claude/skills/third-party-dependency-evaluation/`). The SRS header names the human who confirms any new third-party dependency before it enters `docs/architecture.md` or `docs/decisions/`. Required to be present in every SRS; value can be `TBD` until SA work begins. When the SRS has architecture / SA scope and Approver is `TBD` at sign-off, the BA files a `deferred` entry in `docs/open-issues.md` with `Target phase: before SA dispatch surfaces a new third-party dependency`. SRS sign-off proceeds normally; the gate is enforced at SA dispatch time by the SA agent itself, which halts and requests via `NEEDS_CONTEXT` when a new dependency is needed (see `.claude/rules/hard-rules.md` Dependency Approver rule + `.claude/skills/sa-architecture-design/`).

## Cross-references

- Status enum + invariant: `CLAUDE.md §2`
- BA's per-mode synthesis discipline: `.claude/agents/_templates/ba.md`
- Source validator agent: `.claude/agents/_templates/srs-source-validator.md`
- Feasibility validator agent: `.claude/agents/_templates/srs-feasibility-validator.md`
- OQ resolver agent (Path B4): `.claude/agents/_non-sdlc/oq-resolver.md`
- Orchestrator dispatch routing for both validators: `.claude/rules/orchestrator-operating-rules.md` §9 Step 1
