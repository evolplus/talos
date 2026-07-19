---
name: backend-logging-traceability
description: Backend logging and traceability standard for BE Dev. Use when implementing, refactoring, or reviewing backend handlers/controllers, services, repositories, workers, schedulers, jobs, queue consumers/producers, external integrations, auth paths, state transitions, retries, or error handling, especially when code has sparse logs, poor operator traceability, missing debug/info/warn/error coverage, missing correlation/request IDs, or weak incident-diagnosis evidence.
agents: [be-dev]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# Backend Logging Traceability

## Goal

Make every backend change diagnosable by maintainers and operators without reading source code first. Logs must explain what operation ran, which path it took, what changed, which dependency was involved, how long it took, and why it failed.

Use the project's existing logger, context propagation, metrics, and tracing conventions. Do not introduce a new logging library unless an ADR or architecture task already approved it.

## When to use

Use this skill whenever BE Dev changes or reviews backend runtime behavior: HTTP/gRPC handlers, service/application methods, repositories, workers, schedulers, queue consumers/producers, external integrations, retries, state transitions, and error paths. Load it alongside `be-framework-coding-standard` before editing source and again before `ready-for-deploy`.

## Inputs and outputs

- **Inputs:** assigned task, SRS US/FR/NFR IDs, architecture components, instrumentation contract when present, current backend logger/middleware, error envelope, auth context, data contracts, and existing log format.
- **Outputs:** backend code with structured debug/info/warn/error logs, correlation/request/trace propagation, safe fields, log-aware tests or smoke evidence, and implementation notes naming the important log events added.

## Logging coverage procedure

1. **Map operations before editing.** List each changed endpoint, worker, job, consumer, producer, scheduler, service method, repository operation, external call, transaction, and state transition.
2. **Preserve the logging substrate.** Reuse existing logger injection, middleware, context keys, trace/span handling, request ID, correlation ID, and redaction helpers. If none exists, use the framework/stdlib logger already in the stack and file an open issue for a structured-logging foundation.
3. **Add boundary logs.** Each changed operation needs:
   - start/received log with operation name and safe identifiers;
   - success/completed log with status/result class, changed-counts where useful, and duration;
   - failure log on every propagated error path with error code/class and enough context to route ownership.
4. **Add decision logs.** Log branch decisions that matter during incident diagnosis: validation rejection, auth/authz denial, idempotency duplicate, feature flag branch, skipped work, retry scheduling, fallback, circuit/degraded dependency path, no-op due to state, and partial-success handling.
5. **Add dependency logs.** For database, queue, cache, object storage, and external service calls, log the dependency name, operation, attempt number, timeout/retry classification, result class, duration, and safe resource IDs.
6. **Add state-change logs.** For create/update/delete, lifecycle transitions, gate-field writes, moderation/actions, billing/payment-like flows, and irreversible operations, log previous state, next state, actor/system source, reason, and idempotency key when present.
7. **Review levels.** Use the taxonomy below; do not put everything at `info`.
8. **Verify.** Use log-capture tests where the project has them. Otherwise run a focused unit/integration/smoke path and record representative emitted events in the task notes or QA handoff without secrets or PII.

## Level taxonomy

| Level | Use for | Do not use for |
|---|---|---|
| `debug` | Internal branch decisions, sanitized payload shape/counts, query/filter choices, retry classifier inputs, feature-flag evaluation, cache hit/miss, no-op reason. | Secrets, full request/response bodies, high-cardinality spam in hot loops without sampling. |
| `info` | Operation received/completed, business state transition, job/consumer batch summary, external dependency success, admin/moderation action, data migration step, important lifecycle event. | Expected per-field validation noise or every line inside a tight loop. |
| `warn` | Recoverable anomaly, transient dependency failure before retry, fallback/degraded mode, duplicate idempotency key, skipped unsafe work, rate limit, partial success, stale/out-of-order message. | Fatal failures that stop the operation. |
| `error` | Operation failed and returns/propagates an error, retry budget exhausted, message moved to DLQ, transaction rollback, invariant violation, unexpected panic/exception, dependency outage after classification. | Expected user validation failures that are handled normally. |

## Required fields

Prefer existing project field names. If the project has no convention, use these names consistently:

| Field | Purpose |
|---|---|
| `operation` | Stable name such as `admin.config.update`, `activity.ingest.consume`, or `account.delete.request`. |
| `component` / `service` | Owning service/component from architecture. |
| `request_id`, `correlation_id`, `trace_id` | Request and cross-service traceability where available. |
| `actor_id`, `tenant_id`, `runner_id`, `admin_id` | Include only safe internal IDs and only when useful for ownership/routing. |
| `resource_type`, `resource_id` | Safe domain resource reference. |
| `status`, `result`, `error_code`, `error_class` | Outcome and routable failure class. |
| `duration_ms` | Latency for request, dependency call, job, transaction, or batch. |
| `attempt`, `max_attempts`, `retryable` | Retry and queue diagnostics. |
| `idempotency_key` | Include when already part of the contract and safe to log. |
| `changed_count`, `skipped_count`, `batch_size` | Batch/job/operator summaries. |

## Safety rules

- Never log secrets, credentials, tokens, cookies, auth headers, OAuth codes, private keys, raw trace baggage, signed URLs, payment data, full addresses, health data, or full request/response bodies.
- Mask or omit PII. If an identifier is not already safe in existing logs, hash or omit it.
- Never swallow an error after logging it. Return, propagate, retry, or explicitly mark it handled.
- Avoid duplicate error logs at every stack layer. Log once at the ownership boundary with enough context; lower layers may log debug details only when useful.
- Keep log messages stable and grep-friendly. Prefer structured fields over prose-only messages.
- Do not add noisy logs inside high-frequency loops without aggregation, sampling, or debug level.

## Ready-for-deploy checklist

Before writing `plan-update.json`, confirm:

- Every changed backend operation has start, success, and failure observability.
- Every new error branch logs or is covered by a higher-level ownership-boundary log.
- Every changed worker/job/consumer logs batch start/end, counts, retries, poison/DLQ path, and duration.
- Every external dependency call has result/duration/error classification.
- Every state transition that affects downstream behavior is logged with previous/next state and safe actor/resource IDs.
- Correlation/request IDs are propagated into services, repositories, external clients, and async jobs where the stack supports it.
- Tests or smoke evidence exercised at least one success and one failure/edge log path for high-risk behavior.

## Related skills

- [`../be-framework-coding-standard/SKILL.md`](../be-framework-coding-standard/SKILL.md) - framework and track-specific backend implementation.
- [`../api-contract-author/SKILL.md`](../api-contract-author/SKILL.md) - API contract updates when logged errors reflect public error models.
- [`../data-lifecycle-contracts/SKILL.md`](../data-lifecycle-contracts/SKILL.md) - gate-field writes that require explicit state-change logs.
- [`../format-boundary-contracts/SKILL.md`](../format-boundary-contracts/SKILL.md) - deterministic conversion failures that should be classified, not retried.
