---
name: staging-deployment
description: Deploy and verify software in a staging or testing environment. Use when DevOps must promote a build beyond local deployment, run staging smoke checks, coordinate SSH/Docker/Kubernetes staging rollout, preserve rollback evidence, and produce a deploy report without exposing environment credentials or secrets.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Staging Deployment

## When to use

Use this skill when a DevOps task targets staging, testing, UAT, pre-prod, or any shared non-local environment. Local QA deploys still use `local-deployment`; this skill governs promotion into an environment other people depend on.

## Inputs and outputs

- **Inputs:** task ID, target environment, approved build/image/version, deployment mechanism, release-readiness evidence, rollback plan, environment config contract, and access method.
- **Outputs:** staging deploy report, smoke-test evidence, target URLs, rollout/rollback command references, and follow-up issues for failed gates.

## Procedure

1. **Confirm target and approval.** Verify the task explicitly names the staging environment and version/build to deploy. If the target is ambiguous, halt with `NEEDS_CONTEXT`.
2. **Run release gates first.** Consult `release-readiness`; do not deploy if release readiness, migration safety, rollback readiness, secrets/config audit, or observability readiness is incomplete.
3. **Select execution path.** Use `ssh-remote-operations`, `docker-deployment`, or `kubernetes-deployment` depending on the target. Reference credential files only as command inputs.
4. **Freeze the deploy input.** Record commit SHA, image tag/digest, migration version, config version, and artifact checksum where available. Do not deploy mutable `latest` unless the task has an approved exception.
5. **Deploy in a bounded scope.** Touch only the named environment, namespace, host alias, compose project, or service set. Avoid broad cluster/host operations.
6. **Run staging smoke checks.** Verify health endpoints, required background workers, migrations, critical user flows, and external dependency connectivity using non-production fixtures.
7. **Capture rollback evidence.** Record previous version, rollback command, rollback owner, expected data constraints, and whether rollback was tested or only prepared.
8. **Write the deploy report.** Include environment, version, deploy mechanism, validation results, smoke checks, URLs, known limitations, and redacted config status.

## Hard rules

- Never deploy to staging without an explicit target environment and build/version.
- Never bypass release-readiness, rollback-readiness, migration-safety, secrets-config-audit, or observability-readiness gates when they apply.
- Never read or print environment secrets, SSH config contents, kubeconfigs, `.env*` values, registry tokens, or cloud credentials.
- Never mark staging deployment successful until smoke checks pass against the deployed environment.
- Never proceed to production from this skill; production promotion requires a separate approved task/change record.

## References

- [`../release-readiness/SKILL.md`](../release-readiness/SKILL.md) - pre-deploy gate checklist.
- [`../rollback-readiness/SKILL.md`](../rollback-readiness/SKILL.md) - rollback gate.
- [`../migration-safety/SKILL.md`](../migration-safety/SKILL.md) - migration gate.
- [`../secrets-config-audit/SKILL.md`](../secrets-config-audit/SKILL.md) - secret/config handling.
- [`../observability-readiness/SKILL.md`](../observability-readiness/SKILL.md) - monitoring/alerting readiness.
