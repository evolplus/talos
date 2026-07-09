---
name: release-readiness
description: Assess whether a build is ready to deploy or promote. Use when DevOps must verify release candidates, artifact provenance, test evidence, dependency/security gates, environment config, migration and rollback readiness, observability, and approval status before staging or production deployment.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Release Readiness

## When to use

Use this skill before any shared-environment deployment, release candidate promotion, or production change proposal. The goal is not to deploy; it is to decide whether deployment is safe to attempt.

## Inputs and outputs

- **Inputs:** task ID, release candidate identifier, linked implementation tasks, QA reports, deploy reports, architecture/SRS constraints, migration notes, rollback plan, config contract, and approval evidence.
- **Outputs:** readiness verdict, blocking findings, required follow-up tasks, and `docs/devops/<task-id>/release-readiness.md` or equivalent report content.

## Procedure

1. **Identify the release candidate.** Record commit SHA, image tag/digest, package version, migration version, and build provenance. Reject mutable identifiers unless explicitly approved.
2. **Verify functional evidence.** Confirm required QA reports pass, staging/local deploy reports exist, and smoke/e2e coverage matches the task risk.
3. **Check dependency and security posture.** Review dependency audit/security findings, external integration adequacy, data handling, and any open security/compliance issues.
4. **Run operational gates.** Consult `migration-safety`, `rollback-readiness`, `secrets-config-audit`, and `observability-readiness` when applicable.
5. **Review environment compatibility.** Verify runtime config keys, platform/architecture constraints, database versions, queue/cache dependencies, feature flags, and external endpoints.
6. **Confirm approvals.** Staging needs task-level approval. Production needs human change approval and rollback ownership.
7. **Emit a verdict.** Use `ready`, `ready-with-warnings`, or `blocked`. A warning must be non-critical and have an owner; a blocker prevents deployment.

## Hard rules

- Never treat source code existence as release readiness; require runtime/test evidence.
- Never approve a release candidate with unresolved migration, rollback, secret/config, or observability blockers.
- Never hide warnings in prose; list each warning with owner, impact, and expiration.
- Never expose secrets while checking config readiness.
- Never deploy from this skill; route to the appropriate deployment skill after a `ready` verdict.

## References

- [`../migration-safety/SKILL.md`](../migration-safety/SKILL.md) - migration gate.
- [`../rollback-readiness/SKILL.md`](../rollback-readiness/SKILL.md) - rollback gate.
- [`../secrets-config-audit/SKILL.md`](../secrets-config-audit/SKILL.md) - secret/config gate.
- [`../observability-readiness/SKILL.md`](../observability-readiness/SKILL.md) - telemetry gate.
- [`../qa-execution-runner/SKILL.md`](../qa-execution-runner/SKILL.md) - QA evidence consumed by readiness.
