---
name: format-boundary-contracts
description: How SA identifies format boundaries (any data crossing system A's output → system B's input with a format mismatch) and documents the required transformation in docs/architecture.md §6. Prevents the class of bug where each layer assumes the other handles format conversion — for example, GitLab ISO-8601 strings flowing into MySQL DATETIME columns whose binary format doesn't accept the 'T' / 'Z' characters.
agents: [sa]
sdlc_phase: design
owner: Platform Eng
status: active
---

# Format Boundary Contracts

## When to use

You are the SA authoring `docs/architecture.md` (in `design` or `extract` mode). Your design has data flowing across **two systems with different format contracts** — typically: external system A (e.g., GitLab API) → product component → external system B (e.g., MySQL). Each system has its own input format requirements. The product component sits at the boundary and is **responsible for the conversion** even when both systems "look like" they handle the same conceptual type (e.g., datetime).

This skill is the format-conversion sibling to [`data-lifecycle-contracts`](../data-lifecycle-contracts/SKILL.md) (column write ownership). Where data-lifecycle-contracts covers *when* a value is written, format-boundary-contracts covers *what shape* the value must take at each boundary. Both contracts go in architecture.md §6; together they describe the data's full lifecycle across components.

The motivating bug: GitLab returned `"merged_at": "2025-06-15T14:30:00Z"` (ISO-8601 with `T` separator + `Z` suffix). The worker passed this verbatim to MySQL as a bound parameter for a `DATETIME` column. MySQL's `DATETIME` binary format only accepts `'YYYY-MM-DD HH:MM:SS'` — it rejected the `T` and `Z` characters as syntax errors. The architecture had specified `time_zone='+07:00'` per connection (which controls *interpretation* of stored values) but never specified that the worker must strip `T`→space and `Z`→empty before binding (which controls the *format* of bound parameters). Adjacent concepts; opposite axes; nobody documented the format axis at architecture time. Every test, every mock, every DAL retry, every error wrapper silently passed the malformed value through.

## Inputs and outputs

- **Inputs:** `docs/external-integrations/<system>.md` per integration (each one's published format), SRS data-mutating requirements (which fields move from where to where), existing `docs/architecture.md` if any.
- **Outputs:** Architecture §6 format-contract rows for every data field that crosses a format boundary; per-FR `## Data Effects` sub-sections reference the §6 rows; BE Dev / FE Dev specialization gains explicit "convert X→Y here" constraints from the Agent Generator extraction.

## What is a format boundary?

A **format boundary** exists when data crosses from one system's output to another system's input, and the two systems have different format requirements for the same conceptual type. The "conceptual type" is the same (datetime, UUID, monetary amount, etc.); the *encoding* differs.

### Detection heuristic

For each field that flows across components in your architecture, ask:

1. **Where does it originate?** (External API response, user input, database read, file format.)
2. **Where does it land?** (External API request, database column, queue message, file format.)
3. **Are the format specifications identical?** Compare:
   - **Datetime:** ISO-8601 with `T`+`Z`? RFC 3339? MySQL `'YYYY-MM-DD HH:MM:SS'`? Unix epoch (seconds)? Unix epoch (milliseconds)? Locale-specific?
   - **UUID:** Hex with hyphens? Hex without hyphens? Base64? Big-endian vs little-endian byte order in binary storage?
   - **Monetary amount:** Decimal string `"19.99"`? Integer cents `1999`? Float `19.99` (lossy)? Currency-tagged object `{amount: 1999, currency: "USD"}`?
   - **Boolean:** `true`/`false`? `"true"`/`"false"` strings? `1`/`0` integers? `"Y"`/`"N"`? `"yes"`/`"no"`?
   - **Number precision:** 32-bit int? 64-bit int? 53-bit JS-safe int (anything larger needs BigInt or string)? Decimal? Scientific notation acceptable?
   - **Encoding:** UTF-8? UTF-16? Latin-1? Hex-escaped non-ASCII? Base64?
   - **Length / size:** Field length limits at each system (e.g., MySQL `VARCHAR(255)` vs API's free-form). Trailing whitespace, leading zeros, casing, normalization (NFC vs NFD).
   - **Null/empty:** `null` vs `""` vs absent key — three different things.
   - **Array semantics:** Empty array vs absent array vs `null` array. JSON vs JSONB vs delimited string.

If any answer differs between origin and destination, **a format boundary exists** and must be documented in §6.

## Common boundary patterns

| Source format | Destination format | Transformation |
|---|---|---|
| ISO-8601 `"2025-06-15T14:30:00Z"` | MySQL `DATETIME` `'2025-06-15 14:30:00'` | Strip `T`→` `; strip `Z`; ensure no offset suffix (MySQL `DATETIME` is zone-less — apply `CONVERT_TZ` or per-connection `time_zone` for interpretation) |
| Unix epoch ms `1718459400000` | ISO-8601 `"2024-06-15T14:30:00.000Z"` | `new Date(epoch).toISOString()` |
| MySQL `DATETIME` (zone-less) | ISO-8601 with explicit Z | Per-connection `time_zone='+07:00'`, then `ISO8601(value)` with explicit `+07:00` offset OR convert to UTC first |
| GitLab API decimal-string `"19.99"` (money) | Postgres `NUMERIC(10,2)` | Parse string → BigDecimal → bind as numeric (NOT float; float loses precision) |
| JSON number > 2^53 | DB `BIGINT` | Send as string to avoid JS-side precision loss; parse on receive |
| Postgres `JSONB` | API JSON | Standard `JSON.stringify` — but be aware that JSONB normalizes key order, strips whitespace, deduplicates keys (lossy for some client expectations) |
| HTTP cookie `Set-Cookie: token=abc` | DB `VARCHAR(255)` | Strip `Set-Cookie:` prefix; extract token value; URL-decode if needed |
| Kafka message protobuf | Postgres column JSON | `protobuf-to-json` library; flatten oneofs; map enums to strings; document version-skew handling |
| UUIDv4 string `"01HZX7Y..."` | Postgres `UUID` column | Often auto-handled by driver but verify on bulk inserts (some ORMs send as TEXT, requiring CAST) |
| Boolean from form `"on"`/missing | DB `BOOLEAN` | Coerce `"on"` → `true`; missing → `false` (NOT `null` — silent contract gap) |

These are common but not exhaustive. Apply the heuristic to YOUR project's specific flows.

## Why this matters at architecture level

Format conversions are deceptively small — usually one or two lines of code at the boundary. But the *decision* about where the conversion happens, what library performs it, and what the contract is on each side of the boundary is **architectural**, because:

1. **Multiple components may need the same conversion.** If the SA documents "ISO-8601 → MySQL DATETIME" once in §6, every BE Dev task that crosses this boundary applies the same conversion. Without §6, each task makes the call locally, and three tasks make three different choices (one strips `T`, one uses `Date.toMysqlString()`, one passes verbatim and discovers the bug).
2. **Test cases must assert on the converted value.** Without §6, QA-Author asserts on what they see in the test fixture (the GitLab response) and the test passes a mock DAL that doesn't enforce format. §6 makes the conversion target visible — QA-Author writes the test asserting on the MySQL-shaped value.
3. **Component contracts depend on the format.** SA's C3 components have input/output types. If the input is "ISO-8601 string" and the output is "MySQL DATETIME string," the conversion is part of the component's contract — not an implementation detail.
4. **Failure modes depend on the format.** A bad format produces a *deterministic* error (always fails the same way), not a *transient* error (retryable). The DAL's retry classification (architecture §5 Failure Modes) needs to know which errors are format violations so it doesn't waste 5 retries on each.

## Authoring §6 — format-boundary rows

Architecture §6 Cross-Component Data Contracts holds both gate-field rows (column-write ownership, per [`data-lifecycle-contracts`](../data-lifecycle-contracts/SKILL.md)) and **format-boundary rows**. The table schema accommodates both — for format-boundary rows, use these columns:

| Field | Source format | Destination format | Boundary owner (component) | Transformation | Failure mode |
|---|---|---|---|---|---|
| `<field name>` | `<format spec at origin>` | `<format spec at destination>` | `<component / task responsible>` | `<the conversion step>` | `<deterministic — DO NOT RETRY OR transient>` |

### Authoring procedure

1. **Enumerate every data flow** that crosses two systems. For each flow, list every field.
2. **Apply the detection heuristic** per field. Filter to fields where source-format ≠ destination-format.
3. **For each surviving field, document the row:**
   - Source format: exact spec (don't write "datetime"; write "ISO-8601 with `T` separator + `Z` suffix").
   - Destination format: exact spec (don't write "DATETIME"; write "MySQL `DATETIME` — `'YYYY-MM-DD HH:MM:SS'`, zone-less, NO `T`, NO `Z`, NO offset suffix").
   - Boundary owner: name the component AND the task ID. Example: "MR Collection Service (T-013); the worker that calls GitLab and inserts into MySQL."
   - Transformation: the EXACT conversion step. Example: "`gitLabDateStringToMysqlDatetime(s)` — strips `T`→` `; strips `Z`; verifies result matches `/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/`; throws on malformed input."
   - Failure mode: deterministic format violations MUST be classified as `do-not-retry` so the DAL doesn't waste retries. Document in architecture §5 (see retry-classification guidance there).

4. **Cross-reference per-FR Data Effects.** For each FR that flows the field, the FR's `## Data Effects` sub-section names the §6 row. This makes the conversion visible at FR-level — QA-Author and Code Reviewer scan FRs by ID and see "this FR involves a format boundary; tests assert on the converted value."

## Worked example — the merged_at bug

The bug report's case, written as §6 would document it:

```markdown
## 6. Cross-Component Data Contracts

### Format boundaries

| Field | Source format | Destination format | Boundary owner | Transformation | Failure mode |
|---|---|---|---|---|---|
| `merged_at` | GitLab API ISO-8601 with `T` separator + `Z` suffix (`"2025-06-15T14:30:00Z"`); always UTC | MySQL `DATETIME` `'YYYY-MM-DD HH:MM:SS'`; zone-less binary format; per-connection `time_zone='+07:00'` controls interpretation, NOT bound-parameter format | MR Collection Service (T-013); the worker that calls GitLab `/projects/:id/merge_requests` and INSERTs into `merge_requests` table | `gitLabIsoToMysqlDatetime(s)` — `s.replace('T', ' ').replace('Z', '')`; verifies result `/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/`; throws `FormatError` on malformed input. Per-connection `time_zone='+07:00'` is set separately and is orthogonal to this conversion. | **Deterministic** — DO NOT RETRY. Malformed datetime from GitLab indicates either an API change (escalate to operator) or our own input error. DAL retry-classification (§5 Failure Modes) MUST classify MySQL `Incorrect datetime value` as `do-not-retry`. |
| `created_at` | Same as above | Same as above | Same component | Same transformation function | Same |
| `started_at` | Same | Same | Same | Same | Same |
```

Each row says everything BE Dev needs:
- The exact format on each side (no guessing about which ISO-8601 variant).
- Where the conversion lives (T-013 worker code, not in the DAL).
- The conversion function name (so all three datetime fields use the same function, not three local re-implementations).
- The failure-mode classification (so the DAL's retry logic doesn't waste 5 retries on a permanent failure).

### What changes in the related artifacts

**`docs/external-integrations/gitlab.md` §2 Operations** — each datetime-returning operation gains a `## Format Contract` sub-section explicitly naming the format (ISO-8601 with `T`+`Z`, always UTC, no timezone variation).

**`docs/external-integrations/mysql.md` §2 Operations** — bound parameter format for each column type is documented; for `DATETIME`: `'YYYY-MM-DD HH:MM:SS'`, no `T`, no `Z`, no offset suffix; per-connection `time_zone` controls interpretation.

**`docs/frs/FR-013.md` `## Data Effects`** — cites architecture.md §6 row for `merged_at` / `created_at` / `started_at`; QA-Author's TC for this FR asserts on the MySQL-shaped value (`'2025-06-15 14:30:00'`), NOT the ISO-input.

**BE Dev specialization (Agent Generator extraction)** — gains explicit constraint:

```
### Format-boundary write constraints (from architecture.md §6)

For T-013 (MR Collection Service) implementation:

- Field `merge_requests.merged_at`: GitLab returns ISO-8601 with `T`+`Z`. MySQL DATETIME requires `'YYYY-MM-DD HH:MM:SS'`. MUST convert via `gitLabIsoToMysqlDatetime()` before binding. Do NOT pass GitLab string verbatim. Do NOT rely on `time_zone='+07:00'` — that's interpretation, not format. Failure mode: deterministic; do NOT retry.
- Same for `created_at`, `started_at`.
```

**Code Reviewer `data-lifecycle-contract` lens** (extended scope) — when reviewing T-013 code, walks every parameter bound to MySQL DATETIME columns; verifies each comes from `gitLabIsoToMysqlDatetime()` or equivalent; flags any verbatim pass-through.

## Common pitfalls

- **Conflating timezone interpretation with format conversion.** "We set `time_zone='+07:00'`, so MySQL handles timezones" — true for already-stored values; irrelevant to bound-parameter format. Format conversion happens BEFORE the value reaches MySQL.
- **Trusting the DAL / ORM to handle format.** ORMs typically auto-convert for well-known types (e.g., `Date` object → DATETIME), but the moment the input is a raw string the ORM passes it verbatim. Document the exact input type expected.
- **Asserting on the source value in tests.** "Test passes — got the GitLab value back." But the test never verified what reached MySQL. Always assert on the destination format.
- **Treating format errors as transient.** Format violations are deterministic — they'll fail identically every time. Retrying wastes connections and hides the real error. Classify in §5 Failure Modes.
- **Documenting only "datetime."** Be explicit: ISO-8601 with `T` separator + `Z` suffix is different from ISO-8601 with space separator + `+00:00` suffix is different from MySQL `DATETIME` zone-less. Spell out the format.
- **Forgetting integration tests against real backends.** Unit tests with mock DALs don't enforce format constraints. The bug was invisible in mocks, visible in production. Integration tests against the local-deployment Docker MySQL would have surfaced it pre-merge.

## Hard rules

- **§6 format-boundary rows are mandatory whenever data flows between systems with different format specs.** Apply the detection heuristic to every data flow in the architecture; surviving fields go in §6.
- **Source format and destination format must be specified exactly.** Not "datetime" — name the exact ISO-8601 variant + the destination's exact binary format requirement.
- **Boundary owner is a single component / task.** Two components shouldn't both perform the same conversion; that's where divergence happens.
- **Transformation step is named function-level.** Document the conversion function so it's reused across tasks; ad-hoc inline conversions are the path to divergence.
- **Failure-mode classification is mandatory.** Every format-boundary row declares whether format violations are deterministic (do-not-retry) or transient (rare; only for systems where the same input might succeed later). DAL / HTTP-client retry logic respects the classification.
- **Per-FR Data Effects cross-references the §6 row.** Visible at FR-level for QA-Author + Code Reviewer.
- **Integration tests over mocks for format-touching paths.** Unit tests with mock DALs cannot validate format. QA-Author's by-us mode authors at least one integration test per format boundary, running against the local-deployment Docker stack (per [`local-deployment`](../local-deployment/SKILL.md)).

## References

- [`.claude/skills/data-lifecycle-contracts/SKILL.md`](../data-lifecycle-contracts/SKILL.md) — sibling skill; both contract types live in architecture §6.
- [`.claude/agents/_templates/_artifacts/architecture-template.md`](../../agents/_templates/_artifacts/architecture-template.md) §6 — canonical home for format-boundary rows + §5 Failure Modes for retry-classification.
- [`.claude/agents/_templates/_artifacts/external-integration-template.md`](../../agents/_templates/_artifacts/external-integration-template.md) — each operation's `## Format Contract` sub-section documents the per-system input/output format.
- [`.claude/agents/_templates/_artifacts/frs-template.md`](../../agents/_templates/_artifacts/frs-template.md) — `## Data Effects` cross-references §6.
- [`.claude/skills/test-case-author/SKILL.md`](../test-case-author/SKILL.md) — format-boundary test discipline (assert on converted value).
- [`.claude/skills/local-deployment/SKILL.md`](../local-deployment/SKILL.md) — Docker stack for integration tests that surface format violations pre-merge.
- [`.claude/agents/_non-sdlc/code-reviewer.md`](../../agents/_non-sdlc/code-reviewer.md) — `data-lifecycle-contract` lens enforces format-boundary compliance at review time.
