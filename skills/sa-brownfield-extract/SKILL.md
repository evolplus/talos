---
name: sa-brownfield-extract
description: "SA extract-mode procedure for brownfield onboarding Stage 2. Use when Solution Architect is dispatched in `extract` mode before SRS exists to turn Codebase Archaeologist reports and existing code/docs into a provisional docs/architecture.md with Source: extracted and confidence tags, plus extracted API-contract stubs and confirmation-pending open issues."
agents: [sa]
sdlc_phase: architecture
owner: Platform Eng
status: active
---

# SA Brownfield Extract

## Use

Use this skill only for SA `extract` mode during brownfield onboarding Stage 2. The output documents what exists; it does not recommend changes.

## Inputs

- `docs/archaeology-reports/<topic-slug>.md`
- Existing codebase/docs named by the report
- Optional `scope:` dispatch parameter: `architecture-only`, `security-compliance`, or a service/module name

## Outputs

- Provisional `docs/architecture.md`
- Observed-decision ADRs only when code irrefutably encodes the decision
- Extracted API contract stubs under `docs/api-contracts/` when endpoints/messages are observable
- `docs/open-issues.md` entries with category `extract-confirmation-pending`
- Worktree `plan-update.json`

## Procedure

1. Read all archaeology reports for the scope. If any required report is `INSUFFICIENT`, halt and request more archaeology or team-interview input.
2. Map observed services/modules to C4 C1-C3:
   - C1/C2 are usually high confidence from repo layout, deploy manifests, and public surfaces.
   - C3 is package/module inferred; mark confidence honestly.
   - Do not extract C4 Code.
3. Populate architecture sections from observed evidence:
   - data models from migrations/ORM/schema files;
   - API inventory from route/RPC/topic registration;
   - dependency/call graph from imports, clients, service registries, and manifests;
   - async workflows from producers, consumers, topics, state transitions, retry/DLQ configs;
   - cross-cutting concerns from middleware/config;
   - NFR posture from metrics when available, otherwise `unknown -- measure during pilot`.
4. For each discovered API/message, create a draft contract stub with `Source: extracted`, confidence, observed auth, schemas, and TODO markers for non-introspectable fields.
5. Tag every architecture section with `Source: extracted | Confidence: high|medium|low|inferred`.
6. File one open issue for every `Confidence: inferred` item.
7. Keep architecture self-contained. Do not put substantive body references back to archaeology reports or source paths.
8. Commit changes, then emit `plan-update.json`.

## Hard Rules

- Document what exists; do not recommend or redesign.
- Do not invent intent.
- Do not omit confidence tags.
- Do not propose new third-party dependencies.
- Do not write SRS or plan content.
- Commit before signaling done.
