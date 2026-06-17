---
name: external-integration-adequacy
description: "SA pre-sign-off procedure for validating and completing docs/external-integrations/<system-slug>.md placeholders. Use when Solution Architect is dispatched in `external-integration-adequacy` mode to fill operations, authentication, NFR posture, failure modes, regional/compliance constraints, adequacy issues, and to set Adequacy: adequate only when complete."
agents: [sa]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# External Integration Adequacy

## Use

Use this skill when BA Phase 1.X created integration placeholders and the Orchestrator dispatches SA in `external-integration-adequacy` mode. This runs before SRS sign-off.

## Inputs

- Placeholder files under `docs/external-integrations/<system-slug>.md`
- Linked US/FR files for each placeholder
- SRS §3.5 integration index
- `solution-defaults` for in-org default systems
- Vendor/in-org interface docs named by `Source-URL`

## Outputs

- Updated external-integration files
- Mirrored SRS §3.5 Adequacy values only when needed
- Worktree `plan-update.json` summarizing adequate vs inadequate systems

## Procedure

For each placeholder:

1. Read header metadata, linked US/FRs, owner/source fields, and existing §7 gaps.
2. Pre-fill from `solution-defaults` when available, then fill product-specific details from source docs.
3. Fill §2 Operations, one subsection per operation:
   - endpoint/topic/RPC, protocol, direction, auth mode, idempotency;
   - request/response schemas, success and error variants;
   - vendor error code -> meaning -> product handling -> local error envelope;
   - rate limit, latency/SLO, retry policy, webhook/callback details.
4. Fill §3 Authentication & Authorization.
5. Fill §4 Non-Functional Posture.
6. Fill §5 Failure Modes.
7. Fill §6 Regional / Compliance when applicable.
8. Record every missing source-backed field in §7 Open Adequacy Issues.
9. Set `Adequacy: adequate` only when every operation is complete and §7 is empty; otherwise set `inadequate`.
10. Stamp validation metadata and changelog.
11. Mirror the SRS §3.5 Adequacy column to match the file header. Do not edit any other SRS body content.
12. Commit, then emit `plan-update.json`.

## Hard Rules

- SA is the only role permitted to set `Adequacy: adequate`.
- Never set `Adequacy: deferred`.
- Never invent vendor/interface details.
- Never leave TODO markers without matching §7 gaps.
- Keep files self-contained; body sections must not say `see <vendor URL>`.
- Do not discover/propose new dependencies in this mode.
- Commit before signaling done.
