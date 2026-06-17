# Option-Listing Template

When proposing a third-party dependency choice, structure each option this way so the Designated Dependency Approver can compare on the same axes.

## Inline (for simple cases — bundle size, date library, etc.)

```
Options:
  [a] <Vendor X> — <one-line trade-off summary>
  [b] <Vendor Y> — <one-line trade-off summary>
  [c] Build in-house — <one-line trade-off summary>
Recommended: a
Confidence: high
```

## Structured (for substantial cases — managed service, payment provider, identity provider)

Write a proposal at `docs/research-reports/<dependency-slug>.md` (same format as the researcher's report) and reference it. The body looks like:

```markdown
# Dependency proposal: <topic>

- Status: Awaiting approval | Approved (by <name>, <date>) | Rejected
- Date: <ISO-8601>
- Proposed by: sa
- Category: paid SaaS | OSS | managed cloud | external API | self-hosted vendor tool
- Approver: <Designated Dependency Approver from SRS header>
- Linked SRS requirement: REQ-<NN> — <which requirement drives the need>

## Why we need a dependency at all

What requirement (SRS User Story Business Rule, FR Error Handling row, or NRS target) drives this. Why "build in-house" or "do without" isn't sufficient.

## Options

### Option A: <vendor>

- **Approach:** what we'd actually do — 2–4 sentences.
- **Dimensions** (use the relevant set from references/dimensions.md):
  - Cost: <concrete numbers when known>
  - Vendor lock-in: <portable / moderate / high>
  - Compliance: <relevant regimes; certifications they have>
  - Security posture: <recent CVEs, audit status>
  - Operational complexity: <who runs it, what fails>
  - Integration cost: <SDK availability, time to first call>
  - Exit cost: <migration path off this dependency>
- **Recommended SRS/architecture impact:** <what would be added to docs/architecture.md if chosen>

### Option B: <alternative vendor>

(same structure)

### Option C: Build in-house / do without

(same structure — even when this looks unattractive, present it so the reviewer sees the trade-off shape)

## Recommendation

<Option X> because <2–4 sentences>. Confidence: <high/medium/low>. The thing that would change my mind: <one sentence>.

## What the Approver needs to decide

> Pick A, B, or C: <natural-language form>

## Sources

| # | Source | Type | Accessed | Note |
|---|---|---|---|---|
| 1 | <vendor pricing page URL> | vendor doc | <ISO-8601> | Cost at expected scale |
| 2 | … | | | |
```

After approval, the ADR records the final choice. The `Approver:` and `Approval-Date:` fields in the ADR carry the same values, and the ADR may reference the proposal: `See proposal at docs/research-reports/<dependency-slug>.md`.
