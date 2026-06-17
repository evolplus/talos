# ADR Template

Copy this into `docs/decisions/<NNNN>-<title>.md` and fill in.

## Standard ADR (non-dependency choice)

```markdown
# ADR-NNNN: <Title>

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Date: <ISO-8601>
- Author: <name or role>
- Reviewers: <names or roles, when Accepted>
- Supersedes: <ADR-XXXX, optional>

## Context

What is the situation that forces a decision? What constraints are in play? What did we know at this moment? Be concrete — names, numbers, links to SRS requirements. A reader 18 months from now should be able to reconstruct why we cared.

## Decision

The decision, stated as an active sentence: "We will use event sourcing for the audit log." Not "We're considering event sourcing." If you can't write it as an active sentence, the decision isn't ready.

## Consequences

What follows from this decision? Both directions:

- **Positive:** what we get
- **Negative:** what we give up, what we now have to maintain, what we now can't easily change later
- **Neutral:** what becomes a different problem

## Alternatives Considered

For each rejected alternative, one paragraph:
- What was it?
- Why was it rejected?
- Under what condition would we revisit it?

## Notes

Links to spike code, benchmarks, vendor conversations, related ADRs.
```

## Third-party-dependency ADR (extra fields required)

When the ADR introduces a new third-party dependency that requires human approval per CLAUDE.md §10, add two fields to the header:

```markdown
# ADR-NNNN: <Title>

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Date: <ISO-8601>
- Author: <name or role>
- Reviewers: <names or roles>
- Approver: <human name — the Designated Dependency Approver per SRS>
- Approval-Date: <ISO-8601>
- Supersedes: <ADR-XXXX, optional>

(... rest of the ADR sections as above ...)
```

The `Approver` field is **required** for any ADR introducing a new third-party dependency (paid service, OSS library, managed cloud service, external API, self-hosted vendor tool). It is **not** required for non-dependency ADRs.

Do not write `Status: Accepted` until the Approver has confirmed via the `NEEDS_CONTEXT` flow. See `.claude/skills/third-party-dependency-evaluation/SKILL.md`.

## Worked example — standard ADR (no dependency)

```markdown
# ADR-0007: Use event sourcing for the audit log

- Status: Accepted
- Date: 2026-04-12
- Author: SA
- Reviewers: Platform Lead, Security Lead

## Context

SRS-022 (audit & compliance) requires retention of every authz-relevant action for 7 years with tamper-evidence. Current logging is append-only but doesn't survive schema changes; query for "what did user X do on date Y" is O(table-scan).

## Decision

We will use event sourcing for the audit log: append-only event stream, immutable records, periodic snapshots for query performance.

## Consequences

**Positive:**
- Tamper-evidence: events are append-only by construction
- Schema evolution: events are versioned; old records remain readable
- Audit query becomes a stream consumer, isolated from production load

**Negative:**
- Engineers must learn event-sourcing patterns (some on team haven't)
- Snapshot/replay tooling needs to be built or vendored

## Alternatives Considered

- **Append-only Postgres table with hash chain:** simpler, but tamper-evidence is weaker (DB admin can rewrite).
- **External logging vendor:** would be a new third-party dependency, requires separate ADR + Approver. Deferred for now.

## Notes

Pattern follows the design in <link to internal RFC or external reference>.
```

## Worked example — third-party-dependency ADR

```markdown
# ADR-0012: Use Redis Cluster for spectator real-time pub/sub

- Status: Accepted
- Date: 2026-05-12
- Author: SA
- Reviewers: Platform Lead
- Approver: Viet Phan
- Approval-Date: 2026-05-12

## Context

SRS-007 (Spectator Live Match View) requires real-time match-state propagation to up to 50K concurrent viewers per match with P95 < 200ms. Current stack does not include a pub/sub layer.

Evaluation of options proposed via `.claude/skills/third-party-dependency-evaluation/` and reviewed by Designated Dependency Approver. See `docs/research-reports/spectator-pubsub.md` for full proposal.

## Decision

We will use a self-hosted Redis Cluster (3-node primary + 3-node replica, AOF persistence enabled) for spectator pub/sub. Approved by Viet Phan on 2026-05-12.

## Consequences

**Positive:**
- No new vendor billing line; uses existing infrastructure tooling
- Fits the kit's existing Redis usage (cache, rate-limiter)
- Egress and latency stay within our perimeter

**Negative:**
- Operational burden: we run the cluster (vs Pusher/Ably which would be turnkey)
- Capacity planning is on us; spectator burst events need ahead-of-time provisioning
- On-call rotation needs to learn Redis cluster failure modes

**Neutral:**
- Standard Redis pub/sub semantics are at-most-once; loss is acceptable for spectator-view (we don't need durable delivery for match-state ticks)

## Alternatives Considered

- **Pusher (managed SaaS):** fast to integrate, ~$50/mo at expected scale. Vendor lock-in, data residency in US-east only (SRS VN region concerns).
- **Ably (managed SaaS):** similar to Pusher, regional presence in APAC. Slightly higher per-MAU cost.
- **AWS IoT Core:** fits AWS-managed footprint we already use elsewhere, but per-message pricing scales aggressively with our event rate.
- **Long-polling without pub/sub:** no new dep, simplest. Rejected — fails the P95 < 200ms target at the concurrency we expect.

## Notes

- Full proposal with cost / latency / compliance analysis: `docs/research-reports/spectator-pubsub.md`
- Related: ADR-0003 (auth model — session keys overlap with pub/sub channel auth)
```
