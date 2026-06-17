# Commit Compliance Policy

Defaults the kit ships with, plus areas where your organization's policy applies. Items marked **(policy)** are placeholders — fill in with your organization's actual rule before relying on them.

## Identity

### Kit default

- Every commit has `user.email` and `user.name` set.
- No anonymous identities (`root@hostname`, `unknown`, etc.).
- For organizational work, identity should match your corporate email pattern. Personal emails are for personal projects only.
- The skill refuses to commit if either field is missing — agents and humans must configure before the first commit.

### Organization-specific **(policy)**

- Is identity verification stricter? (e.g., must the email exactly match the corporate directory? GPG-signed commits required?)
- Is there a kit-default identity for shared service accounts (CI bots, deploy bots, etc.)?
- For contractors / agencies, what email pattern is acceptable?

Document the answer in this file and update the skill's hard rules accordingly.

## Attribution

### Kit default

Two trailers carry attribution context:

| Trailer | When to use |
|---|---|
| `Co-authored-by: <name> <email>` | A human's work shaped this commit beyond mere review. Most common: the `design-human-edited` Figma flow per `.claude/rules/parallel-execution.md` §4, where a human modified the Figma file directly and the UI/UX Designer agent absorbed the changes. The human is treated as a co-author, not a reviewer. |
| `Generated-By: <agent-role>` | A Claude Code sub-agent is the primary author. Value is the agent role (e.g., `Generated-By: be-dev`, `Generated-By: ba`). When multiple agents contributed (e.g., a researcher's report led to a BA-augmented SRS), list each on its own trailer line. |

These trailers are not mutually exclusive — a single commit can have both:

```
feat(web): apply human-edited login flow

Co-authored-by: Jane Doe <jane.doe@example.com>
Generated-By: ui-ux-designer (incorporate mode)
Refs: T-007
```

### Organization-specific **(policy)**

- **AI authorship transparency.** Does your organization's policy require more than `Generated-By: <role>`? Some orgs require:
  - Model identifier (`Generated-By: be-dev (Claude Code, claude-opus-4-x)`)
  - Prompt reference / session ID
  - Statement of human-review status
- **IP / ownership.** Whose IP is the commit? Default assumption: the organization owns work performed on its infrastructure by its affiliated agents. AI-authored content may have ambiguous status in some jurisdictions; legal review recommended.
- **Disclosure obligations.** Does any external party (customer, regulator, partner) need to be notified when AI-authored code ships? Most contexts: no. Some heavily-regulated contexts (medical, financial advisory): possibly.

Document the answer here. The trailer convention can be tightened without changing the skill's body.

## Signing

### Kit default

- Signing (GPG or SSH-based) is **not required** by the kit. It's straightforward to add per project.
- If the repo enables signing (`commit.gpgSign = true` or `commit.gpgSign = true` with `gpg.format = ssh`), every commit must be signed; unsigned commits will be rejected by branch protection.

### Organization-specific **(policy)**

- Does your organization require commit signing for protected repos? For all repos?
- Which signing format — GPG, SSH, or X.509 (smimesign)?
- How are keys distributed and rotated?
- How are bot / agent signing identities provisioned?

Document the answer here and update the skill's procedure to include a signing check before the first commit if required.

## Traceability

### Kit default

Every commit on a worktree branch references its master-plan task:

- In-subject: `feat(billing)(T-014): add voucher application flow`
- In-footer: `Refs: T-014`

For non-task commits:

- Kit infrastructure changes: `Refs: kit-process`
- Non-SDLC report commits: `Refs: docs/research-reports/<topic-slug>.md` (or `docs/debug-reports/...` / `docs/code-reviews/...` / `docs/oq-resolutions/...`)
- One-off documentation: `Refs: none`

The traceability rule is a hard rule in CLAUDE.md §10. Commits without `Refs:` or in-subject task-tag will be flagged in code review (`api-contract-conformance` / `maintainability` lens) and during git log audits.

### Organization-specific **(policy)**

- Should commits also reference external tracker tickets (Jira, Asana, Linear, Notion)? If yes, what trailer key? Suggestion: `Tracker: <ticket-id>`.
- Are there mandatory references to compliance / change-management systems? (e.g., a change ticket for production deploys.)

## Hygiene

### Kit default

- **No secrets in commit history.** Static defense: `.gitignore`. Dynamic defense: the privacy-check hook at runtime. Both layers are required; neither is sufficient alone.
- **No PII in commit messages.** Never include user / customer / partner identifiers (names, emails, internal account IDs, addresses, phone numbers). Reference by ticket or task ID; the durable git log should not become a PII broadcaster.
- **No force-pushing to shared branches.** Sub-agents push only to their own worktree branch (`agent/<role>/<task-id>`); the Orchestrator merges per `.claude/rules/worktree-isolation.md` §5.
- **Squash on merge** is the kit's default. The Orchestrator's merge of a sub-agent worktree branch into main is squashed; the squashed commit retains the attribution trailers from the sub-agent's commit chain. (If the project chooses merge-commit or rebase-merge, document here.)

### Organization-specific **(policy)**

- Are there secrets-scanning tools that gate pre-push? (Examples: TruffleHog, gitleaks, GitHub Advanced Security secret scanning.)
- Is there a regulatory requirement to retain commit history beyond ordinary repo retention? (Some compliance regimes require N years of audit trail.)
- Are there situations where `git filter-repo` / `BFG` history rewrites are forbidden? (Default kit guidance: allowed if the repo hasn't been widely shared; consult legal/security for shared repos.)

## Repository hosting and data residency **(policy)**

This is firmly in your organization's policy territory; the kit can't decide it.

- Which repository host is used (GitHub Cloud, GitHub Enterprise self-hosted, GitLab, Bitbucket, Gitea)?
- Where is the repo data physically stored? Some regions have data-localization requirements for source code containing personal data flows.
- Are mirrors / backups in scope of the same residency rules?
- How are agent commits (made from any region) reconciled with residency expectations?

Document the answer with whoever owns infrastructure security at your organization. Update this file accordingly.

## How to update this file

This document is the policy ledger. When a question marked **(policy)** is answered:

1. Remove the **(policy)** marker.
2. Write the decision plainly. State who decided, when, and the authoritative source (link to internal policy doc if possible).
3. If the decision tightens a hard rule in `SKILL.md`, update the skill's `## Hard Rules` section.
4. If the decision implies a new trailer or scope, document in `conventional-commits-format.md`.

The skill is meant to evolve. Stale **(policy)** markers are fine while the kit is new — what's not fine is shipping commits that violate a decision that was made but never documented.
