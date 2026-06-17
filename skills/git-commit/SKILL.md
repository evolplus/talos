---
name: git-commit
description: Commit discipline for any agent or human committing to this repo. Verify identity before the first commit, follow the conventional-commits format with task traceability, exclude secrets via .gitignore, attribute human and AI contributors honestly.
agents: [all]
sdlc_phase: implementation
owner: Platform Eng
status: active
---

# Git Commit Discipline

## When to use

Any time an agent (or human) is about to run `git commit` in a worktree or the main branch. Also at project setup, before the first commit, to verify identity and `.gitignore`. The skill applies cross-phase — BA's SRS edits, SA's architecture edits, Dev's code changes, DevOps's deploy scripts, non-SDLC agents' report files all flow through the same commit discipline.

`agents: [all]` is a sentinel — this skill is registered under `Cross-cutting` in `.claude/skills/registry.md` and applies to every agent in the kit.

## Inputs and outputs

- **Inputs:** the change to commit; the master-plan task ID (`T-NNN`) it serves if applicable; the agent role making the commit; for human-contributed work, the human's name + email
- **Outputs:** a well-formed conventional commit on a worktree branch, with identity, traceability, and any required attribution trailers

## Procedure

1. **Identity check (one-time per worktree).** Run `git config user.email && git config user.name`. If either returns empty, halt — do **not** commit. Tell the user to configure (see "Configuring identity" below).
2. **`.gitignore` check (one-time per repo).** Verify the repo has a `.gitignore` covering at minimum: env files, secrets, IDE artifacts, build outputs, OS files, the kit's own `.tmp` staging files. Use [`references/gitignore-template.md`](./references/gitignore-template.md) as the baseline.
3. **Stage the changes.** `git add <paths>` — never `git add .` blindly. Verify with `git status` and `git diff --cached` before committing.
4. **Compose the commit message** per [`references/conventional-commits-format.md`](./references/conventional-commits-format.md):
   - Subject line: `<type>(<scope>): <description>` — short, lowercase, no trailing period
   - Blank line, then body (optional but encouraged for non-trivial commits)
   - Blank line, then footer trailers (task ref, attribution)
5. **Verify message** against the regex in `conventional-commits-format.md`. If it doesn't match, rewrite — don't bypass with `--no-verify`.
6. **Add the task reference.** Every commit on a worktree branch should reference its master-plan task (e.g., `Refs: T-014` in the footer, or scope-tagged like `feat(billing)(T-014): …`).
7. **Add attribution trailers** where they apply (see [`references/compliance-policy.md`](./references/compliance-policy.md)):
   - `Co-authored-by: <name> <email>` when a human's contribution shaped this commit (notably the `design-human-edited` Figma flow per CLAUDE.md §4)
   - `Generated-By: <agent-role>` when an agent (Claude Code instance) is the primary author
8. **Commit.** `git commit -m "..."` for single-line, or `git commit` to open the editor for multi-line.
9. **Push to your worktree branch only.** Never `git push origin main` from a sub-agent. The Orchestrator merges from worktrees per `.claude/rules/worktree-isolation.md` §5.

## Configuring identity

Required values:
- `user.email` — for organizational work, prefer your corporate email domain; never use a personal email for work commits
- `user.name` — full name (real name, not a handle)

Commands:

```sh
# Per-repo (preferred for clarity; lives in .git/config):
git config user.email "you@example.com"
git config user.name "Your Full Name"

# Global (applies across all repos on this machine):
git config --global user.email "you@example.com"
git config --global user.name "Your Full Name"
```

The skill does **not** auto-configure on the agent's behalf — identity is a human-attested fact, not something an agent should infer. Refuse to commit if unconfigured; surface the gap.

## Commit message format (summary; see reference for full spec)

```
<type>(<scope>): <description>

<optional body — wrap at 72 chars; multiple paragraphs OK>

<optional footer trailers — one per line>
Refs: T-NNN
Co-authored-by: <name> <email>
Generated-By: <agent-role>
```

- `<type>`: `feat | fix | docs | style | refactor | perf | test | chore | build | ci | revert`
- `<scope>`: lowercase, dash-separated; for application work prefer area names (`api`, `web`, `auth`, `billing`, etc.) or kit areas (`agents`, `rules`, `skills`, `hooks`, `docs`)
- `<description>`: present-tense imperative, lowercase first letter, no period, ≤72 chars total subject line

Default subject-line regex (tighten per project as needed):

```regex
^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([a-z0-9-]+(\)\([A-Z]-[0-9]+\))?\))?: [a-z][^.\n]{0,71}$
```

The optional `(T-NNN)` scope-tail captures the task ID directly in the subject (`feat(billing)(T-014): add voucher application`). Equivalent footer style: `Refs: T-014` on its own line.

See [`references/conventional-commits-format.md`](./references/conventional-commits-format.md) for the full type catalog with descriptions, scope conventions, and worked examples (good and bad).

## `.gitignore` essentials

Categories that must be excluded:

- **Secrets:** `.env*` (except `.env.example`/`.env.template`/`.env.sample`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `*.crt`, `*.cer`
- **Local environment:** `node_modules/`, `.venv/`, `__pycache__/`, `.tox/`, `*.pyc`, `.cache/`
- **Build artifacts:** `dist/`, `build/`, `target/`, `bin/`, `out/`, `*.log`
- **IDE / editor:** `.vscode/` (unless team-shared), `.idea/`, `*.swp`, `.DS_Store`, `Thumbs.db`
- **Kit staging:** `*.tmp`, `CLAUDE.md.*.tmp` (the kit's awk staging files; remember to delete them after edits)

Allowlisted (always committable):

- `.env.example`, `.env.template`, `.env.sample` — these document required env keys without leaking values
- Lock files (`package-lock.json`, `yarn.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`) — these make builds reproducible

Full template: [`references/gitignore-template.md`](./references/gitignore-template.md).

The privacy-check hook (`.claude/hooks/privacy-check.cjs`) refuses reads/writes against the secret patterns at runtime — `.gitignore` is the static defense layer, the hook is the dynamic one.

## Compliance requirements

### Identity

- Every commit has a named `user.email` and `user.name`. No anonymous or default-tooling identities (`root@...`, `unknown`, etc.). Refuse to commit otherwise.
- For organizational work, identity should match the corporate email pattern. The skill doesn't hard-enforce this — it's a project policy line in [`references/compliance-policy.md`](./references/compliance-policy.md).

### Attribution

- **Human contributors → `Co-authored-by:` trailer.** Applies when a human shaped the commit beyond mere review — most notably the `design-human-edited` Figma flow per CLAUDE.md §4 (the human's edits are treated as co-authored, not as a reviewer correction).
- **AI agents → `Generated-By:` trailer.** When a Claude Code sub-agent is the primary author, the commit should declare its role (`Generated-By: be-dev`, `Generated-By: ba`, etc.). Org-specific AI-authorship policy may require more (model version, prompt log reference); flagged as policy territory in the reference.

### Traceability

- **Every worktree-branch commit references its master-plan task** — `Refs: T-NNN` in the footer, or via the scope-tail `(T-NNN)` in the subject. Commits made outside of master-plan work (kit edits, infra scripts, non-SDLC reports) reference the relevant artifact path or note `Refs: none` in the footer.
- **Non-SDLC report commits** (researcher / debugger / code-reviewer / oq-resolver outputs) reference their report path: `Refs: docs/research-reports/<topic-slug>.md`.

### Hygiene

- No secrets in commit history. If a secret ever lands in a commit, the secret is compromised — rotate immediately, then scrub history (`git filter-repo` or `BFG`). Prevention is far cheaper than remediation; the `.gitignore` + privacy-check hook are the prevention layer.
- No PII (names, emails of users / customers, internal IDs) in commit messages. Commit history is durable and broadcasts widely; PII in `git log` is a leak.
- No force-pushing to shared branches. Sub-agents commit to their own worktree branch (`agent/<role>/<task-id>`); the Orchestrator merges. Force-pushing rewrites history other contributors depend on.

## Hard Rules

- Never commit with `user.email` or `user.name` empty. If either is missing, halt and ask the user to configure.
- Never commit a message that fails the conventional-commits regex. Rewrite — never bypass with `--no-verify`.
- Never commit a `.env`, `*.pem`, `*.key`, or any other secret-class file. If `git status` shows one, stop and add it to `.gitignore` before continuing.
- Never include PII or customer identifiers in commit messages or commit bodies. Reference issues / tickets by ID, not by user.
- Never `git push --force` (or `--force-with-lease`) on a shared branch. Sub-agents push only to their own worktree branch.
- Never use a personal email for organizational work commits.
- Every commit on a worktree branch carries either `Refs: T-NNN` (or scope-tail `(T-NNN)`) for master-plan work, or `Refs: <artifact-path>` for kit / docs work. No commits without traceability.

## References

- [`references/conventional-commits-format.md`](./references/conventional-commits-format.md) — full type catalog, scope conventions, regex variants, worked examples
- [`references/gitignore-template.md`](./references/gitignore-template.md) — categorized `.gitignore` with rationale per section
- [`references/compliance-policy.md`](./references/compliance-policy.md) — identity / attribution / signing / residency — defaults plus areas where your organization's policy applies
- CLAUDE.md §5 — Worktree isolation (where the commit happens) — moved to `.claude/rules/worktree-isolation.md` §5
- CLAUDE.md §8 — Master plan task IDs for traceability — moved to `.claude/rules/master-plan-discipline.md` §8
- CLAUDE.md §4 — Design lifecycle (the `design-human-edited` co-authorship trigger) — moved to `.claude/rules/parallel-execution.md` §4
- `.claude/hooks/privacy-check.cjs` — runtime defense against committing secrets; `.gitignore` is the static defense layer
