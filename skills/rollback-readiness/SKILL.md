---
name: rollback-readiness
description: Verify that a deployment can be safely rolled back. Use when DevOps must define previous version, rollback command, data compatibility, feature flag fallback, artifact retention, operator ownership, rollback test evidence, and stop conditions before staging or production rollout.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Rollback Readiness

## When to use

Use this skill before staging, production, risky local demos, or any deployment with migrations, external integrations, feature flags, queues, or user-visible traffic.

## Inputs and outputs

- **Inputs:** current deployed version, candidate version, deployment mechanism, migration safety notes, feature flags, traffic/routing mechanism, and health checks.
- **Outputs:** rollback verdict, rollback command/path, previous artifact reference, data compatibility notes, validation checks, and owner/escalation contact.

## Procedure

1. **Identify the rollback target.** Record previous image tag/digest, release directory, Helm revision, Git SHA, package version, or compose file.
2. **Check artifact availability.** Confirm previous artifacts are retained and accessible without rebuilding from mutable state.
3. **Validate data compatibility.** Consult `migration-safety`. If new data cannot be read by the old version, rollback may require roll-forward or feature-disable instead.
4. **Define trigger thresholds.** Name metrics, health checks, error rates, smoke-test failures, or incident signals that trigger rollback.
5. **Write the rollback command.** Provide exact command references with environment/namespace/project scoping. Do not include credentials.
6. **Plan post-rollback validation.** Health checks, smoke flows, queue lag, background workers, external callbacks, and user-visible surface checks.
7. **Test when appropriate.** In local/staging, execute or simulate rollback. For production, record why it was not executed and who owns the decision.
8. **Emit verdict.** `ready`, `conditional`, or `blocked`.

## Hard rules

- Never declare rollback ready without a concrete previous artifact/version.
- Never assume rollback is safe across irreversible data migrations.
- Never rely on rebuilding `latest` as rollback.
- Never omit validation checks after rollback.
- Never include secret values in rollback commands or reports.

## References

- [`../migration-safety/SKILL.md`](../migration-safety/SKILL.md) - data compatibility and irreversible-operation checks.
- [`../docker-deployment/SKILL.md`](../docker-deployment/SKILL.md) - Docker rollback patterns.
- [`../kubernetes-deployment/SKILL.md`](../kubernetes-deployment/SKILL.md) - Kubernetes rollout undo / Helm rollback patterns.
