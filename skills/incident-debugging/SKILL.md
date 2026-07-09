---
name: incident-debugging
description: Diagnose incidents in deployed environments from a DevOps operating stance. Use when a staging or production-like service is failing, error rates spike, rollouts regress, infrastructure degrades, or operators need timeline, impact, mitigation, rollback, and routing evidence without mutating systems or exposing secrets by default.
agents: [devops]
sdlc_phase: post-release
owner: Platform Eng
status: active
---

# Incident Debugging

## When to use

Use this skill when DevOps is asked to diagnose a deployed-environment incident or regression. The default mode is read-only investigation and mitigation planning; mutation requires explicit operator approval and a scoped task/change record.

## Inputs and outputs

- **Inputs:** incident statement, target environment, time window, recent deploy reports, release version, monitoring/log references, rollback readiness, and any approved access method.
- **Outputs:** incident timeline, impact summary, suspected cause, evidence, immediate mitigation options, rollback recommendation, routing to Dev/SA/QA/PM, and post-incident follow-up tasks.

## Procedure

1. **Declare incident scope.** Record environment, service, version, symptoms, affected users/flows, start time, and current severity. If scope is vague, ask for target environment and symptom.
2. **Stay read-only by default.** Inspect deploy reports, health endpoints, logs, metrics, traces, Kubernetes events, Docker status, and remote host state using approved credential references. Do not mutate services unless explicitly approved.
3. **Build a timeline.** Correlate deploy events, config changes, migrations, alerts, traffic changes, dependency incidents, and first user impact.
4. **Check common failure classes.** Recent release, migration lock/data error, config/secret mismatch, resource exhaustion, dependency outage, certificate/DNS issue, queue backlog, bad rollout, or observability gap.
5. **Assess mitigation.** Options include rollback, disable feature flag, scale capacity, pause worker, drain traffic, retry failed jobs, or route to Dev for code fix. Name risk and owner for each option.
6. **Preserve evidence safely.** Capture sanitized log excerpts, metric names, alert names, resource statuses, and timestamps. Do not include PII, tokens, auth headers, secret values, kubeconfig contents, or private keys.
7. **Route follow-up.** If root cause is code, route to BE/FE Dev. If architecture/data contract, route to SA. If missing test, route to QA-Author/QA-Exec. If unclear product impact, route to PM/BA.
8. **Write incident report content.** Use `docs/devops/<task-id>/incident-debugging.md` or task notes, plus open issues for unresolved risks.

## Hard rules

- Never mutate staging/production during incident debugging without explicit approval and scoped command.
- Never dump secrets or broad environment variables while investigating.
- Never claim root cause without evidence; use confidence labels.
- Never hide an observability gap; record it as a follow-up.
- Never let rollback recommendation omit data/migration compatibility constraints.

## References

- [`../rollback-readiness/SKILL.md`](../rollback-readiness/SKILL.md) - rollback decision support.
- [`../observability-readiness/SKILL.md`](../observability-readiness/SKILL.md) - telemetry gap classification.
- [`../migration-safety/SKILL.md`](../migration-safety/SKILL.md) - migration-related incident checks.
