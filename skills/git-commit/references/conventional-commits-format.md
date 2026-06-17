# Conventional Commits Format

Full specification for commit messages in this kit. The SKILL.md gives the summary; this reference is the authoritative source when the summary is ambiguous.

## Anatomy of a commit message

```
<type>(<scope>)(<task-tag>): <description>

<body>

<footer trailers>
```

Three parts, separated by blank lines:

1. **Subject line** — one line, 50–72 chars total, structured as `type(scope)(task-tag): description`. Parentheses around scope and task-tag are optional, but if used, they immediately follow the type with no space.
2. **Body** — optional, free-form prose explaining *why* (not what — the diff shows what). Wrap at 72 chars. Use blank lines between paragraphs.
3. **Footer trailers** — optional, one per line, key-value form `Key: value`. Standard trailers: `Refs:`, `Co-authored-by:`, `Generated-By:`, `BREAKING CHANGE:`, `Reviewed-by:`.

## Type catalog

| Type | When to use | Example subject |
|---|---|---|
| `feat` | A new user-facing feature or capability | `feat(billing): add voucher application flow` |
| `fix` | A bug fix — observable behavior was wrong, now it isn't | `fix(auth): handle expired refresh token` |
| `docs` | Documentation only — no code change | `docs(kit): document approver gate at design step 0` |
| `style` | Formatting, whitespace, lint-only changes — no logic change | `style(web): apply prettier to ui module` |
| `refactor` | Code restructure with no observable behavior change | `refactor(sdk): extract retry helper from request module` |
| `perf` | Performance improvement with no functional change | `perf(analytics): index events_at on events table` |
| `test` | Test cases added or fixed; no production code change | `test(billing): add coverage for tiered discount edge cases` |
| `chore` | Routine maintenance — dependencies, configs, scripts | `chore(deps): bump axios from 1.6.0 to 1.7.2` |
| `build` | Build system, CI config, packaging changes | `build(web): switch to vite from webpack` |
| `ci` | CI pipeline changes — workflow yaml, runners, etc. | `ci(kit): add hook test suite to PR checks` |
| `revert` | Reverts a previous commit — body should cite the SHA | `revert(web): revert "feat(web): nightly auto-update"` |

If a commit straddles two types, split it into two commits. If you can't split, pick the one that represents the user-visible outcome.

## Scope conventions

Scope identifies the *area of the codebase* the change touches. Use lowercase, dash-separated. The kit defines two flavors of scope:

### Product / area scopes

Map to the areas of your application. Use a canonical short name; tailor the list to your project. Example scopes:

| Scope | Area |
|---|---|
| `api` | Backend API service |
| `web` | Web frontend |
| `auth` | Authentication service |
| `billing` | Billing / payments |
| `sdk` | Client SDK |
| `analytics` | Analytics |
| `customer-support` | Customer support |
| `admin` | Internal admin portal |

### Kit-area scopes

Map to areas of this kit itself, when changes are to the workflow infrastructure rather than product code:

| Scope | Area |
|---|---|
| `agents` | `.claude/agents/` |
| `rules` | `.claude/rules/` |
| `skills` | `.claude/skills/` |
| `hooks` | `.claude/hooks/` |
| `kit` | Cross-cutting kit changes (CLAUDE.md, multiple rule files at once) |
| `docs` | Repository-level documentation (`README`, `CONTRIBUTING`, etc., not `docs/SRS.md`) |

A commit may omit scope only if the change genuinely doesn't fit any scope (rare). Adding a new scope is a small kit change — document it in this file before using.

## Task-tag (traceability)

Every commit on a worktree branch is tied to a master-plan task. The kit supports two equivalent forms:

- **In-subject form:** `feat(billing)(T-014): add voucher application flow`
- **In-footer form:** subject is plain (`feat(billing): add voucher application flow`), and a `Refs: T-014` trailer appears in the footer.

Pick one form per project and stick with it. In-subject is more visible in `git log --oneline`; in-footer is cleaner for unusual cases (e.g., a commit serves multiple tasks: `Refs: T-014, T-017`).

For commits not tied to a master-plan task (kit edits, non-SDLC reports), use:

- `Refs: none` for genuinely standalone work
- `Refs: docs/research-reports/<slug>.md` for non-SDLC report commits
- `Refs: kit-process` for kit infrastructure changes during construction

## Subject-line regex

Default regex enforcing the format (without the optional task-tag inline, since the trailer form is supported):

```regex
^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([a-z0-9-]+\))?: [a-z][^.\n]{0,71}$
```

With optional in-subject task-tag:

```regex
^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([a-z0-9-]+\)(\(T-[0-9]+\))?)?: [a-z][^.\n]{0,71}$
```

Tighten per project as needed (e.g., constrain scope to a project-specific whitelist, require `T-NNN` always present).

## Body

Use the body to explain **why**, not what. The diff shows what.

Good body content:
- Motivation: what user need, regression, or design intent drove this
- Trade-offs considered: why this approach over alternatives
- Side-effects: what else changed (config, schema migration, etc.)
- Caveats: what this commit deliberately does *not* fix

Bad body content:
- Restating the diff line-by-line
- "Changed foo to bar" (the diff already says that)
- "Looks good" (no information)
- PII or customer identifiers

Wrap at 72 chars per line for readability in `git log` output and emails.

## Footer trailers

Standard trailers used by this kit:

| Trailer | Purpose | Example |
|---|---|---|
| `Refs:` | Master-plan task ID(s) or artifact paths the commit serves | `Refs: T-014` |
| `Co-authored-by:` | Human contributors whose work shaped this commit | `Co-authored-by: Jane Doe <jane.doe@example.com>` |
| `Generated-By:` | The agent role that authored, when an agent is primary author | `Generated-By: be-dev` |
| `BREAKING CHANGE:` | Subject of breaking-change footer (per Conventional Commits spec) | `BREAKING CHANGE: /users/me response field 'avatar' renamed to 'avatar_url'` |
| `Reviewed-by:` | Reviewer when code review preceded the commit | `Reviewed-by: code-reviewer (architecture-fit + security-threat-model)` |

Trailers go after a blank line at the end of the message. One trailer per line. Format is `Key: value`.

## Worked examples

### Good

```
feat(billing)(T-014): add voucher application flow

Implements US-007 (voucher application) per the user-confirmed Figma
design. Voucher codes are validated server-side before discount is
applied; the UI reflects validation state inline rather than after submit.

Refs: T-014
Generated-By: fe-dev
Reviewed-by: code-reviewer (architecture-fit + maintainability)
```

```
fix(auth): handle expired refresh token

Previously, an expired refresh token returned 500 with no error code.
FR-008.Error-REFRESH_TOKEN_EXPIRED requires 401 with code REFRESH_TOKEN_EXPIRED so the client
can prompt re-authentication.

Refs: T-022
Generated-By: be-dev
```

```
docs(kit): document approver gate at design step 0

Refs: kit-process
```

```
chore(skills): add git-commit skill

Establishes commit discipline for all agents: identity check before
first commit, conventional-commits format with traceability,
.gitignore baseline, and compliance attribution (Co-authored-by for
human contributors via the design-human-edited Figma flow,
Generated-By for AI authorship).

Refs: kit-process
Generated-By: ba (kit construction)
```

### Bad — and why

| Bad subject | Why bad |
|---|---|
| `Add voucher feature` | No type. No scope. Implementation-flavored ("Add", not "feat:"). |
| `Feat: Voucher application flow.` | Type is `Feat:` (should be lowercase `feat:`). Description starts with capital. Trailing period. |
| `feat: fix the voucher thing and also tidy up some other modules` | Two changes in one commit ("feat" + "tidy" = "feat" + "refactor"). Split. |
| `feat(billing): added voucher application flow` | Past tense ("added"). Should be present-tense imperative. |
| `feat(billing): add voucher application flow. and also update analytics emit` | "and also" → split into two commits. Period after "flow" makes the regex fail. |
| `fix: customer customer@example.com cannot apply voucher` | PII (customer email) in commit history. Reference via ticket ID instead. |
| `feat: add MFA support per customer's request after Slack call last Tuesday` | Untraceable references ("Slack call last Tuesday"). Replace with a ticket ID or a SRS User Story / FR anchor (e.g., `Refs: US-014.BR-2`). |
