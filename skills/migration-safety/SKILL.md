---
name: migration-safety
description: Evaluate database, schema, data, queue, index, or storage migrations before deployment. Use when DevOps must verify migration ordering, dry-run results, backups, expand-contract strategy, lock/runtime impact, data-loss risk, rollback constraints, and operator approvals.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Migration Safety

## When to use

Use this skill whenever a deployment includes schema changes, data migrations, queue/topic changes, search index rebuilds, object-storage rewrites, or irreversible data operations.

## Inputs and outputs

- **Inputs:** migration files, ORM migration plan, architecture data contracts, affected services, target environment, backup policy, expected data volume, and rollback plan.
- **Outputs:** migration safety verdict, execution order, preflight/dry-run evidence, backup/restore notes, risk classification, and blockers.

## Procedure

1. **Classify the migration.** Label as additive, backfill, destructive, contract/removal, reindex, data rewrite, or operational maintenance. Destructive/irreversible work needs explicit approval.
2. **Check compatibility.** Prefer expand-contract: deploy additive schema first, release compatible code, backfill safely, then remove old fields in a later release.
3. **Estimate runtime impact.** Identify locks, table scans, long transactions, index builds, queue replays, and service downtime. Require batching or online migration tools when needed.
4. **Verify backup and restore.** Record backup location/status by name only, restore procedure, owner, and latest restore-test evidence. Do not read backup credentials.
5. **Run dry-run/preflight.** Use local/staging with production-like schema where possible. For production, use native dry-run/explain tooling or a reviewed plan before mutation.
6. **Coordinate app versioning.** Verify old and new app versions tolerate the migration during rolling deploy and rollback.
7. **Define failure handling.** Record pause/resume, retry, rollback, manual repair, and "stop-the-line" thresholds.
8. **Emit verdict.** `safe`, `safe-with-conditions`, or `blocked`.

## Hard rules

- Never run a migration against staging or production without an explicit target and approval.
- Never approve destructive or irreversible migrations without backup/restore evidence and human sign-off.
- Never assume rollback is possible after data deletion, type narrowing, irreversible transforms, or external side effects.
- Never print database URLs, credentials, tokens, dumps, or row-level sensitive data.
- Never couple schema removal with first code deployment unless architecture explicitly proves compatibility.

## References

- [`../rollback-readiness/SKILL.md`](../rollback-readiness/SKILL.md) - rollback constraints for migrations.
- [`../secrets-config-audit/SKILL.md`](../secrets-config-audit/SKILL.md) - DB credential handling.
- [`../../agents/_templates/devops.md`](../../agents/_templates/devops.md) - DevOps role contract.
