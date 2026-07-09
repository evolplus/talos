---
name: observability-readiness
description: Verify that a deployment is observable before promotion. Use when DevOps must check logs, metrics, traces, dashboards, alerts, health endpoints, synthetic probes, SLO/error-budget signals, correlation IDs, runbook links, and incident triage evidence without exposing credentials or sensitive telemetry.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Observability Readiness

## When to use

Use this skill before staging/production deployment, before enabling traffic, and during release readiness for features whose failure needs operational detection.

## Inputs and outputs

- **Inputs:** architecture/instrumentation contract, service list, health endpoints, expected logs/metrics/traces, dashboards/alerts, target environment, and incident runbook references.
- **Outputs:** observability readiness verdict, missing telemetry findings, dashboard/alert references, smoke probe evidence, and deploy-report observability fields.

## Procedure

1. **Map critical signals.** For each deployed service, identify health endpoint, readiness/liveness signal, key logs, metrics, traces, and business/user-impact indicators.
2. **Check deploy-time telemetry.** Verify the new version emits startup logs, request logs, errors, latency, saturation/resource metrics, background job signals, and dependency health.
3. **Verify correlation.** Confirm request IDs/correlation IDs connect frontend, backend, workers, and external calls where applicable.
4. **Confirm dashboards and alerts.** Record dashboard names/links and alert names/status. Use names or URLs only; do not include tokens or private query credentials.
5. **Define smoke/synthetic probes.** List post-deploy probes for user flows, API health, queues, scheduled jobs, and external integrations.
6. **Check runbook path.** Ensure a human can move from alert to runbook to rollback/mitigation path.
7. **Emit verdict.** `ready`, `ready-with-gaps`, or `blocked`.

## Hard rules

- Never promote a high-risk deployment with no health signal, no alert, and no rollback trigger.
- Never expose sensitive logs, PII, auth headers, trace baggage, API keys, or dashboard tokens.
- Never treat "container running" as observability readiness.
- Never invent SLOs or alert thresholds; record missing contracts as follow-up work.
- Never mark observability ready when incident responders cannot identify service/version/environment from telemetry.

## References

- [`../release-readiness/SKILL.md`](../release-readiness/SKILL.md) - release gate that consumes this verdict.
- [`../rollback-readiness/SKILL.md`](../rollback-readiness/SKILL.md) - rollback trigger thresholds.
- [`../../agents/_templates/devops.md`](../../agents/_templates/devops.md) - deploy-report expectations.
