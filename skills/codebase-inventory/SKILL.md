---
name: codebase-inventory
description: "Produce the deterministic Tier-1 inventory of an existing codebase — routes/RPC/jobs, broker channels, persistent schema, external egress, deployables, production libraries, test specs — as a reproducible ID-stamped manifest at docs/archaeology-reports/<slug>.inventory.md. Use first on every Codebase Archaeologist dispatch (brownfield Stage 1a), on SA brownfield extract, and on any re-extraction. It is the ground truth the extraction-validator reconciles kit artifacts against at Stage 3.5."
agents: [codebase-archaeologist, extraction-validator, sa]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Codebase Inventory (brownfield Tier 1)

## Use

Use at brownfield Stage 1a, before any interpretive reading of the codebase; at Stage 3.5 when the validator re-derives ground truth; and on every re-extraction.

The kit splits brownfield evidence into two tiers:

- **Tier 1 (this skill) — mechanical.** What is demonstrably there, produced by recorded commands rather than judgement. Same commit in, same manifest out.
- **Tier 2 — interpretive.** What it means and why it exists. Expensive, non-reproducible, and the only tier that can be wrong in an interesting way.

Tier 1 exists so Tier 2 can be checked. Interpretive sweeps fail silently by omission: nothing in the output points at the surface that was never found. Every omission the archaeologist's procedure has since patched with prose — nested sub-namespaces invisible to flat globs, routes reachable only through a service registry, one-sided broker observations — is this failure mode.

## Inputs

- Codebase root at a named commit SHA, working tree clean
- Config files, build system, lockfiles
- The dispatch `scope:` (`unscoped` or a service/module name)

## Outputs

- `docs/archaeology-reports/<slug>.inventory.md` — ID-stamped manifest with a `## Reproduction` block carrying every command that produced it, and a `## Surface totals` block
- On a re-run for an existing slug: `docs/archaeology-reports/<slug>.inventory-diff.md`

## Inventory ID scheme (load-bearing — do not improvise)

Kit artifacts cite these IDs in `Covers-Inventory:`, and Stage 3.5 computes coverage as a set difference over them.

| Prefix | Section | One row is |
|---|---|---|
| `INV-R-NNN` | Routes & sync surfaces | one HTTP route / RPC method / GraphQL field / WebSocket channel / UI route |
| `INV-E-NNN` | Async surfaces | one topic, queue, subscription, consumer group, cron entry, or scheduled job |
| `INV-T-NNN` | Persistent schema | one table / collection / key-pattern |
| `INV-X-NNN` | External egress | one distinct external host or service endpoint |
| `INV-D-NNN` | Deployables | one deployable unit (image, service, lambda, static bundle) |
| `INV-L-NNN` | Production libraries | one production-tagged dependency |
| `INV-S-NNN` | Test specs | one test file |

IDs are assigned in sorted order within each section so they stay stable across re-runs of the same commit.

## Procedure

1. **Pin the snapshot.** `git rev-parse HEAD`. Halt if the working tree is dirty — an inventory over uncommitted changes is not reproducible. Record `Snapshot-Commit`, `Generated`, `Scope`, `Toolchain` in the header.
2. **Deployables and file census (`INV-D`).** Enumerate from build/deploy artifacts, never from directory intuition: `Dockerfile*`, compose files, k8s manifests, serverless configs, Procfiles, `go.mod` / `package.json` / `*.csproj` / `pom.xml` / `Cargo.toml`. Record per-language LOC so later sections can be scale-checked — 40K LOC and three routes means route extraction under-ran.
3. **Routes and sync surfaces (`INV-R`).** Prefer, in order: a spec the project already generates (`openapi.json`, `.proto`, GraphQL SDL, `rails routes`, `php artisan route:list`, `django show_urls`); a registry / factory / container / router class, read in full with every registered identifier enumerated; a recursive-glob fallback over route-declaration syntax (`**/*.go`, `**/*.php`, `**/*.cs`, `**/*.ts`) so nested sub-namespaces are reached. Record identifier, method+path, declaring file:line, and the extractor that found it.
4. **Async surfaces (`INV-E`).** Topics, queues, consumer groups, and schedules from producer/consumer registration, broker config, infra-as-code, crontabs, k8s `CronJob`, and framework schedulers. A brokered flow needs both sides: record the producer row and the consumer row separately, and mark a one-sided observation `Parse: unresolved` rather than assuming the counterpart.
5. **Persistent schema (`INV-T`).** Migrations, DDL, ORM models, or live `information_schema` introspection when a read-only connection exists. Include column types — SA's extract needs type-level detail and re-introspecting later is wasted work. For KV/document stores, one row per key pattern with TTL and value shape.
6. **External egress (`INV-X`).** Hostnames and base URLs from config, env templates, Helm values, ConfigMaps, service-registry classes, and hard-coded literals. Enumerate first; categorize never — categorization is Tier 2. A host serving an internal concern (SSO, alerting, chat) still gets a row.
7. **Production libraries (`INV-L`).** From the lockfile where one exists (the lockfile is truth; the manifest is intent). Name, resolved version, pinned or floating.
8. **Test specs (`INV-S`).** One row per test file with layer and framework. Do not estimate coverage percentages — a coverage number without a run is a guess, and guesses are Tier 2.
9. **Emit the totals block.** Per section: total, and count of `Parse: unresolved`. This is what Stage 3.5 reconciles against.
10. **Re-run mode.** When a manifest exists for this slug, emit the diff — rows added, removed, changed, by ID. Re-extraction is then a diff, not a redo: only artifacts citing a changed ID need revisiting.

## Hard Rules

- No judgement in Tier 1. If a row required deciding what something means, it is Tier 2. Purpose, bounded context, "core vs bolted on" — all Tier 2.
- Every row carries a command and a file:line. A row you cannot attribute is not evidence.
- Never drop an unparseable row. Record `Parse: unresolved` with the raw text. A dropped row is an unknown unknown; that is the failure this skill exists to prevent.
- Two extractors beat one where the second is cheap (generated spec vs source glob, lockfile vs manifest, migrations vs live introspection). Record both counts and the delta — disagreement localizes the gap and is the highest-value signal here.
- The manifest is an audit-trail artifact, never a deliverable. Kit artifacts stay self-contained and cite inventory IDs in provenance headers only, never in body content.
