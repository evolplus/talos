---
name: data-lifecycle-contracts
description: How SA identifies gate fields and cross-component column-write contracts in the data model, and documents them in docs/architecture.md §6 so BE/FE Dev know which columns each task may write. Prevents the class of bug where the "ORM convenience" pattern (stamping a timestamp on every upsert) silently breaks downstream skip / eligibility / rate-limit gates that read the same column.
agents: [sa]
sdlc_phase: design
owner: Platform Eng
status: active
---

# Data Lifecycle Contracts

## When to use

You are the SA authoring `docs/architecture.md` (in `design` or `extract` mode). Your data model has columns that are **written by one component** and **read by another to gate behavior**. This skill prescribes how to identify those columns and document their write-ownership contract so downstream developers don't accidentally break the gate.

The motivating bug: A repository-sync service stamped `last_synced_at = CURRENT_TIMESTAMP` on every upsert during the discovery phase (a natural ORM-convenience pattern). The downstream WorkerPool's skip check read the same column to decide whether to re-process a repo: `now - last_synced_at < SYNC_MIN_INTERVAL → skip`. Result: every repo appeared "just synced" right after discovery, so every repo was always skipped. The data pipeline never ran. The discovery service wrote the column with one semantic ("we touched this row"); the worker read it with a different semantic ("last successful data collection"). No layer of the kit's discipline caught the mismatch because column-level write ownership sits between C3 (component responsibilities) and C4 (code-level columns) — neither layer documented it.

This skill exists so the SA explicitly hoists this contract up into the architecture.

## Inputs and outputs

- **Inputs:** SRS §3.1 Domain Specification + §3.3 FRs (which name the data-mutating operations); `docs/architecture.md` §3 Components (which name the components doing the mutations).
- **Outputs:** Architecture §6 Cross-Component Data Contracts table; cross-references from the relevant FRs' Data Effects sub-section; gate-field write-prohibition constraints propagated to BE Dev / FE Dev `## Project Specialization` by the Agent Generator.

## What is a gate field?

A column whose **read** controls behavior in a component different from the one(s) that write it. Common patterns:

| Pattern | Read controls | Common columns |
|---|---|---|
| Skip / rate-limit gate | "Should I re-process this row?" | `last_synced_at`, `last_run_at`, `next_eligible_at`, `cooldown_until` |
| State machine gate | "What transition is allowed?" | `state`, `status`, `phase`, `disposition` |
| Eligibility gate | "Is this row eligible for X?" | `is_active`, `is_verified`, `is_premium`, `eligible_until` |
| Idempotency / dedup gate | "Have we already done this?" | `processed_at`, `acknowledged_at`, `idempotency_key`, `dedup_hash` |
| Version gate | "Is the data new enough?" | `schema_version`, `etag`, `last_modified` |
| Ownership / audit gate | "Who owns this and when was it touched?" | `owner_id`, `updated_by`, `created_by` (when used in authorization) |

**Detection heuristic.** For each column in the data model, ask:

1. Is this column **read in a WHERE clause** by a component other than the one that writes it?
2. Is this column **read in a JOIN condition** that controls visibility?
3. Is this column **read by a worker / scheduler** to decide what to process next?
4. Is this column **read by an authorization check**?

If yes to any → it's a gate field. Document it in §6.

## Why this matters at architecture level

Without an explicit contract, BE Dev (and FE Dev for client-side caches with similar semantics) makes a judgment call when implementing the writer task. The judgment is influenced by common ORM patterns:

- "Stamp `updated_at` / `last_synced_at` / `touched_at` on every upsert" — natural ORM convenience.
- "Use the timestamp for index ordering" — natural index-design pattern (e.g., `(last_synced_at, is_active)` composite for least-recently-synced queries).
- "Stamp `state = 'discovered'` even though we haven't processed yet" — natural state-machine pattern.

Each is locally sensible. Each silently breaks the downstream gate. The bug surfaces only at integration time, when the worker / authz check / scheduler reads the column with a different semantic.

The architecture is where this contract lives because:

- The **SRS** is functional (what behavior the user gets), not data-flow.
- The **C3 Components** describe responsibilities ("upserts repositories table") but not per-column write semantics.
- The **C4 Code** is where the violation happens — too late.
- **BE Dev / FE Dev specialization** is where the constraint should be enforced, but it has to be sourced from somewhere upstream.

§6 fills the gap.

## Authoring §6

The architecture template provides a structured table — see [`.claude/agents/_templates/_artifacts/architecture-template.md`](../../agents/_templates/_artifacts/architecture-template.md) §6 for the canonical format. Schema:

| Column | Owner(s) | Write condition | Consumers (Readers) | Gate semantics | Other-writer constraint |
|---|---|---|---|---|---|
| `<schema.column>` | `<Component / Task>` | `<when this writer stamps>` | `<who reads it + how>` | `<what the read controls>` | `<what other services MUST NOT do>` |

### Authoring procedure

1. **Enumerate candidate columns** by walking the data model + applying the detection heuristic above. Aim for a small, focused list — most data-model columns are NOT gate fields. A typical project has 3–15 gate fields total.

2. **For each candidate, identify owners.** Owner = the component(s) authorized to write under the documented condition. Multiple owners is common (e.g., `last_synced_at` is written by both Branch Detection AND MR Collection, after successful per-repo data collection).

3. **State the write condition precisely.** Not "during data sync" but "AFTER successful per-repo data collection (Main Flow steps 5–8 of FR-003 complete without error)." Vague conditions don't bind BE Dev to a specific implementation point; precise conditions do.

4. **Name every consumer.** WorkerPool's skip check, scheduler's eligibility filter, authz middleware, etc. If you can't name a consumer, the column might not be a gate field — re-check the detection heuristic.

5. **Document gate semantics.** The exact condition under which the read changes behavior. E.g., `now - last_synced_at < SYNC_MIN_INTERVAL → skip` is precise enough that BE Dev knows the stamping moment matters.

6. **Spell out the other-writer constraint.** This is what prevents the bug. Examples:

   - "Repository Sync Service (T-011) MUST NOT stamp `last_synced_at`. T-011 only writes structural metadata: `name`, `path_with_namespace`, `gitlab_group_id`, `is_active`."
   - "Authorization middleware MUST NOT mutate `state`; state transitions are owned by Order Service."
   - "Read-replica queries MUST NOT update `last_accessed_at` (which the eviction worker reads to decide cache TTL)."

Without the explicit prohibition, BE Dev sees "the writer column" as a general-purpose timestamp and stamps it whenever they touch the row.

## Worked example — the T-011 case

The bug report's case, written as §6 would document it:

```markdown
## 6. Cross-Component Data Contracts

| Column | Owner(s) | Write condition | Consumers (Readers) | Gate semantics | Other-writer constraint |
|---|---|---|---|---|---|
| `repositories.last_synced_at` | Branch Detection (T-012), MR Collection (T-013) | After successful per-repo data collection — all of FR-002 (branch detection succeeded), FR-003 (MR collection succeeded), FR-004 (commit collection succeeded), FR-005 (scoring succeeded) complete without error | WorkerPool skip check (per FR-006 Main Flow step 4) | `now - last_synced_at < SYNC_MIN_INTERVAL_MS → skip this repo for the current run` | Repository Sync Service (T-011, FR-001) MUST NOT stamp `last_synced_at` during discovery / upsert. T-011 only writes structural metadata: `name`, `path_with_namespace`, `gitlab_group_id`, `is_active`. ORM-convenience patterns (stamping `updated_at` on every upsert) MUST NOT apply to this column. |
| `repositories.is_active` | Repository Sync Service (T-011) | When project not found in GitLab discovery (set false) OR re-discovered after absence (set true) | WorkerPool eligibility filter (per FR-006 Main Flow step 3); analytics queries | `is_active = false → skip from current run` | Branch Detection (T-012), MR Collection (T-013) MUST NOT toggle `is_active`. Discovery owns active/inactive lifecycle. |
| `collection_runs.status` | Worker (T-006) | At run start (`running`), on each batch checkpoint (`running` heartbeat), at run end (`completed`, `partial`, `failed`) | Health-check API (per FR-011); admin dashboard | `status = running AND now - last_heartbeat > 5min → mark crashed` | Per-repo task workers (T-011/T-012/T-013) MUST NOT mutate `collection_runs.status`. Pool owns the run lifecycle; per-repo failures aggregate via event emission, not direct column writes. |
```

Each row encodes what was implicit in the SRS + architecture before. With §6 present, the Agent Generator extracts each row into BE Dev's `## Project Specialization` as a write-prohibition constraint:

```markdown
### Gate-field write constraints (from architecture.md §6)

For T-011 (Repository Sync Service) implementation:

- MUST NOT write to `repositories.last_synced_at`. This column is owned by T-012 and T-013, written AFTER successful per-repo data collection. T-011 only writes structural metadata: `name`, `path_with_namespace`, `gitlab_group_id`, `is_active`. The ORM-convenience pattern of stamping a timestamp on every upsert MUST be suppressed for this column.
- MAY write to `repositories.is_active` (T-011 is the owner of the active/inactive lifecycle per §6).
- MUST NOT write to `collection_runs.status` (Worker-pool-owned).
```

That's the kind of guardrail BE Dev needs at dispatch time. Without it, the bug is inevitable; with it, the implementation is constrained correctly.

## Common pitfalls

- **Treating a gate field as "just an updated_at."** ORM convenience patterns (UPDATE SET updated_at = NOW() on every mutation) silently break gates. If a column is a gate, it is NOT a general-purpose timestamp — it has a specific write semantic that the gate depends on.
- **Owner = "the service that touches the row most often."** Owner = "the service whose write semantic matches what the reader expects." Frequency is irrelevant.
- **Forgetting the precise write condition.** "During the sync flow" is too vague. "After FR-003 Main Flow steps 5–8 complete without error" is precise enough to constrain BE Dev's code placement.
- **Omitting the other-writer constraint.** Without "T-011 MUST NOT write this column" stated explicitly, BE Dev sees no prohibition and stamps it.
- **Documenting only timestamps.** State enums, eligibility flags, idempotency keys, version columns are all candidates. Don't filter to "timestamp columns."
- **Putting it in C3 component descriptions instead of §6.** C3 prose ("upserts repositories table") doesn't bind column-level semantics. §6's table format is unambiguous.

## Hard rules

- **§6 is mandatory for any data model with at least one gate field.** N/A is acceptable ONLY when the architecture genuinely has no cross-component column writes (rare — usually a sign you haven't applied the detection heuristic carefully enough).
- **Every row's other-writer constraint is mandatory.** It's the row that prevents the bug.
- **Cross-reference from per-FR Data Effects.** Each FR that writes a column listed in §6 must reference the §6 row in its Data Effects sub-section. This makes the contract visible at FR-level for QA-Author + Code Reviewer.
- **Code Reviewer's lens-driven review checks §6 compliance.** A PR that writes a §6 column without being the declared owner is flagged.
- **Updates to §6 are architecture changes.** Adding / removing rows or changing owners reverts SRS `Status` per `.claude/rules/change-synchronization.md` §7 (architecture change triggers downstream re-check).

## References

- [`.claude/agents/_templates/_artifacts/architecture-template.md`](../../agents/_templates/_artifacts/architecture-template.md) §6 — canonical table format.
- [`.claude/skills/sa-architecture-design/`](../sa-architecture-design/SKILL.md) — design-mode producer of architecture data contracts.
- [`.claude/agents/_templates/_artifacts/frs-template.md`](../../agents/_templates/_artifacts/frs-template.md) — Data Effects sub-section per FR cross-references §6.
- [`.claude/agents/_templates/be-dev.md`](../../agents/_templates/be-dev.md) — consumer of the propagated constraints in `## Project Specialization`.
- [`.claude/agents/_templates/fe-dev.md`](../../agents/_templates/fe-dev.md) — same, for client-side cache columns with similar gating semantics.
- [`.claude/agents/_meta/agent-generator.md`](../../agents/_meta/agent-generator.md) — the extraction step that pulls §6 into BE/FE Dev specialization.
- [`.claude/agents/_non-sdlc/code-reviewer.md`](../../agents/_non-sdlc/code-reviewer.md) — review checklist gains a §6-compliance item.
