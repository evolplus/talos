# Hooks

Runtime guardrails that fire on Claude Code tool events. Wired up in `.claude/settings.json` (project-level — applies to every session in this repo).

Hooks supplement the prose rules in `CLAUDE.md` and `.claude/rules/`. The rules describe what agents *should* do; hooks make sure they *can't* do certain things even if they try.

All hooks are **fail-open**: if a hook crashes or its event JSON is malformed, it allows the tool call and writes a warning to stderr. We never want a buggy hook to block legitimate work.

## Inventory

| Hook | Event | Purpose |
|---|---|---|
| `session-init-summary.cjs` | SessionStart | Prints SRS / open-issues / master-plan state on every session start |
| `srs-status-guard.cjs` | UserPromptSubmit | Reminds when SRS Status ≠ Signed-off |
| `open-issues-triage-gate.cjs` | UserPromptSubmit | Reminds when any open-issues entry is `State: open` |
| `privacy-check.cjs` | PreToolUse | Blocks reads/writes/searches against sensitive paths |
| `plan-update-validator.cjs` | PreToolUse (Write) | Validates `plan-update.json` schema |
| `master-plan-write-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks direct writes to anything under `docs/plan/` (master-plan.md, phase.md, task files) from sub-agents |
| `kit-role-dispatch-guard.cjs` | PreToolUse (Task) | Blocks `subagent_type: general-purpose` dispatches when the prompt contains kit-role signals (BA Mode X, SA extract, QA-Author, etc.). Enforces CLAUDE.md §10 "Role-specialized dispatch required" |
| `post-bash-security-audit.cjs` | PreToolUse (Bash, `--snapshot`) + PostToolUse (Bash) | Post-tool-run security audit: sensitive-path tamper detection (`.git/hooks`, `.claude/**`, shell rc files), dependency-install audit (install scripts, off-registry deps, typosquats), command red flags (`curl\|sh`, etc.). Findings file a `State: open` entry in `docs/open-issues.md` (§6 gate) + warn the agent via additionalContext. Detection-only — never blocks. |
| `pre-install-dependency-verifier.cjs` | PreToolUse (Bash) | Verifies packages against trusted sources (OSV.dev advisories + deps.dev metadata) BEFORE download/install. Tiered: known malware (MAL-*) blocks; CVEs, brand-new packages/versions, and unverifiable git/URL specs warn. Fail-open when sources unreachable. Covers npm/yarn/pnpm/bun/npx, pip/poetry/uv/pipx/uvx, cargo, go, gem, composer. |
| `session-init-summary.cjs` (extended) | SessionStart | …also flags interrupted dispatches (surviving dispatch-journal entries + orphan worktrees) per CLAUDE.md §14.3 |

Plus shared utilities in `lib/`:

| Util | Purpose |
|---|---|
| `lib/strip-fences.cjs` | Pure function used by markdown-parsing hooks to remove content inside ``` fenced blocks before regex matching. Prevents fenced "format reference" examples from being parsed as real data. |
| `lib/worktree-scope.cjs` | Worktree-scope detection shared by `orchestrator-bash-guard` and `source-code-write-guard`. `isOperationWorktreeScoped(cwd, cmd)` is true when the cwd is inside `.worktrees/<role>-<task-id>/` OR the command scopes itself there (`cd .worktrees/<role>-<task-id> && …`, `git -C`, `--prefix`, `make -C`). `wellFormedWorktreePath(p)` resolves `..` then checks the write lands INSIDE a worktree (traversal escapes are rejected). It enforces *worktree-scoped*, not *agent-owns-this-worktree* — see the lib header for why the latter isn't runtime-achievable today. |

## session-init-summary.cjs (SessionStart)

Pure read. On every session start (startup, resume, clear, compact), prints to stdout:

- SRS status and Last-Updated date
- Counts of open-issues by state
- Best-effort phase counts and running-task counts from `docs/plan/master-plan.md` (top-level only; phase and task files are loaded on demand by the orchestrator, not the hook)

stdout is captured by Claude Code as additional session context, so the orchestrator sees the state summary without having to read three files manually.

Caveat: the master-plan section uses regex counts of `Status:` mentions and design sub-status keywords because the kit doesn't pin a strict format. Treat as a rough heat map, not authoritative state.

All three sub-functions (`summarizeSrs`, `summarizeOpenIssues`, `summarizeMasterPlan`) consume content through `lib/strip-fences.cjs`, so fenced documentation blocks inside the source files don't bias the counts.

## srs-status-guard.cjs (UserPromptSubmit)

Reads `docs/SRS.md` once per prompt. If Status is not `Signed-off`, injects a reminder citing CLAUDE.md §10 hard rule "No downstream work while SRS Status ≠ Signed-off." Stays silent when the gate is open.

SRS content is stripped of fenced code blocks before the `^Status:` / `^Last-Updated:` regex matches — so a SRS that includes a "for reference, here's what the header should look like" fenced block at the top doesn't shadow the real header values.

## open-issues-triage-gate.cjs (UserPromptSubmit)

Parses `docs/open-issues.md` for entries with `State: open`. If any exist, lists their IDs and cites CLAUDE.md §6. Stays silent when no open entries exist.

Entry format expected (per §6):

```
### ISSUE-001 — title
- Date: 2026-05-10T08:00:00Z
- State: open | resolved | deferred | promoted
```

The file is stripped of fenced code blocks before parsing, so example/template entries inside ``` fences are ignored. State values are also stripped of trailing punctuation (`.,;:!?`) so `- State: open.` is recognized as `open`.

## privacy-check.cjs (PreToolUse)

Blocks `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Glob`, `Grep`, and `Bash` calls that touch sensitive paths.

**Patterns blocked** (extend the list at the top of the file):

- `.env*` (any env file)
- `secrets/`, `credentials/`, `private/` directories
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`
- `~/.ssh/`, `~/.aws/credentials`, `~/.config/gcloud/`, `~/.kube/config`
- `.netrc`

**Allowlisted** (always permitted): `.env.example`, `.env.template`, `.env.sample`

**Override per-session**: `export CLAUDE_PRIVACY_OK=1`

**Known coverage gaps** (extend the patterns when you encounter these on real repos):

- `.envrc` (direnv) — frequently contains secret exports; not currently blocked
- `.npmrc` (npm) — can contain private registry auth tokens
- Bare `kubeconfig` / `kubeconfig.yaml` (no dot prefix) — some teams use this convention
- `.terraformrc`, `.pypirc` — credential containers

The privacy hook is the runtime defense layer; the `.gitignore` baseline in `.claude/skills/git-commit/references/gitignore-template.md` is the static defense layer. Both are required; neither alone is sufficient.

**Known limitation**: Bash command parsing is substring-only. `cat /tmp/copy-of-env.txt` slips through; `cat ./.env` is caught. The hook covers the common case; adversarial cases require code review.

## plan-update-validator.cjs (PreToolUse on Write)

Validates `plan-update.json` content against the schema in `.claude/rules/worktree-isolation.md §5` *before* the file is written. Blocks malformed proposals so the orchestrator never has to deal with one.

**Required fields**: `task_id`, `track`, `from_status`, `to_status`, `agent`, `timestamp`
**Optional fields**: `design_sub_status`, `notes`

**Enum-validated**:

- `track` — `be | fe | be+fe | infra | qa | ba | sa | tl`
- `from_status`, `to_status` — `not-started | in-progress | blocked | contract-pending | ready-for-deploy | in-test | failed | done`
- `design_sub_status` (when present) — `design-ready-for-review | design-revision-needed | design-pending-user-confirmation | design-human-edited | design-confirmed`
- `agent` — `ba | ui-ux-designer | sa | tl | qa-author | be-dev | fe-dev | devops | qa-exec`
- `timestamp` — ISO-8601

**Known limitation**: only validates `Write`. An agent that uses `Edit` / `MultiEdit` to amend an existing `plan-update.json`, or that uses Bash to write the file (`echo '{...}' > plan-update.json`), bypasses the validator. Low real-world risk — agents typically Write a fresh file per worktree — but document if you ever see malformed updates land.

## master-plan-write-guard.cjs (PreToolUse)

Refuses `Write`, `Edit`, `MultiEdit`, `NotebookEdit` on `docs/plan/` paths that lie **inside** a sub-agent worktree (`.worktrees/<role>-<task-id>/`). Orchestrator writes from the main repo are allowed by default — no env var required.

**Detection** is path-based, using the kit's existing worktree-isolation invariant (`.claude/rules/worktree-isolation.md` §5). Sub-agents always write inside their own `.worktrees/<role>-<task-id>/`; the Orchestrator always writes from main repo root. Anywhere the write target contains a `.worktrees/<*>/` segment, the hook treats it as sub-agent context and refuses; everywhere else, it allows.

**Sub-agents must never write to `docs/plan/` directly.** They emit `plan-update.json` proposals in their worktree root (which `plan-update-validator.cjs` schema-checks). The Orchestrator ingests those on dispatch return and commits the actual `docs/plan/` transitions.

**Override (rare — kit-dogfooding only)**: `export CLAUDE_ALLOW_PLAN_WRITE=1`. Permits a sub-agent-shaped write to `docs/plan/`. Use sparingly; document rationale in SRS §10 Changelog. Hook emits a stderr warning when active.

**Historical note.** The kit v0.2 first draft gated this hook on `CLAUDE_ORCHESTRATOR=1` being set (via an early-exit). Different polarity from the source-code-write-guard bug — here the failure mode was fail-loud (Orchestrator writes were blocked unless it remembered to `export CLAUDE_ORCHESTRATOR=1` before each session). The path-based redesign removes the self-policing requirement and matches the same physical invariant the kit already enforces via worktree-isolation §5.

**Known limitation**: this hook does not parse Bash commands. A Bash redirect like `echo ... > docs/plan/master-plan.md` (or any file under `docs/plan/`) would still get through. Bash parsing for write redirects is brittle and tends to break on edge cases (heredocs, `tee`, `dd`, multiple shells); the prose rule (CLAUDE.md §10) is the authoritative control. The hook catches the common-case file-tool path.

## kit-role-dispatch-guard.cjs (PreToolUse on Task)

Blocks `Task` tool dispatches that use `subagent_type: general-purpose` when the prompt content contains a kit-role signal. Enforces CLAUDE.md §10 hard rule "Role-specialized dispatch required" and orchestrator-operating-rules.md §9 Step 4.5.

**Detection mechanism.** Regex matches against the dispatch prompt for known kit-role phrases:

- BA / Mode A–F / `ba.md` / ingest-from-* / augment-existing / reverse-engineer-from-code
- SA / SA extract / SA design / `sa.md` / architecture.md
- TL / Tech Lead / `tl.md` / master-plan-proposal
- QA-Author / by-us mode / by-task mode / visual-specs/
- BE Dev / FE Dev / api-contracts/
- DevOps / deploy-reports/
- QA-Exec / qa-reports/
- UI/UX Designer / designer create/import/revise/incorporate
- Agent Generator
- Researcher / Debugger / Code Reviewer / OQ Resolver / Codebase Archaeologist (Paths B1–B5)
- Kit artifact paths (docs/user-stories/US-*, docs/frs/FR-*, docs/plan/, plan-update.json)

When a match fires AND `subagent_type === 'general-purpose'`, the hook exits 2 with an error message that:

- Names the matched kit-role pattern
- Suggests the correct `subagent_type` value
- Cites the CLAUDE.md §10 rule + Orchestrator §9 Step 4.5
- Mentions the Agent Generator workaround for missing `.claude/agents/<role>.md`
- Documents the escape hatch

**Override**: `export CLAUDE_ALLOW_GENERAL_PURPOSE=1` permits general-purpose for one-off cross-cutting work that genuinely has no kit role. Use sparingly; document the rationale in SRS §10 Changelog.

**Known limitation**: substring matching against the prompt. An adversarial dispatch that avoids these phrases ("synthesize documentation from these files" without mentioning BA) would slip through. The prose rule (CLAUDE.md §10) is the authoritative control; the hook is best-effort defense-in-depth. The most likely real-world failure mode is the Orchestrator making the mistake under load, which the hook catches reliably.

**Known coverage gaps** (extend the patterns when you encounter these):

- Dispatch prompts that refer to roles by capability only ("write a SRS") rather than by role name
- Cross-cutting work that legitimately spans multiple roles (rare; usually a routing mistake)

## source-code-write-guard.cjs (PreToolUse)

Refuses `Write`, `Edit`, `MultiEdit`, `NotebookEdit` on source-code paths that lie **outside any `.worktrees/<role>-<task-id>/` directory** — i.e., the Orchestrator's main-repo cwd. Block-by-default; no env var required to engage.

**Why this exists.** CLAUDE.md §10: "Orchestrator does not write source code directly." Code changes go through the SDLC pipeline (BA → SA → TL → BE Dev / FE Dev → DevOps → QA-Exec) or the Path B2 trivial-fix exemption flow which still routes through Dev dispatch — never direct Orchestrator write. The Orchestrator's "I'll just fix this one line" instinct silently bypasses every SDLC gate.

**Sub-agent context detection (tightened by the worktree-scope hardening).** Sub-agents operate inside their own worktree per `.claude/rules/worktree-isolation.md` §5, so the path argument to their Write/Edit calls contains a `.worktrees/<role>-<task-id>/` segment. `.worktrees` is no longer a blanket `EXCLUDED_SEGMENTS` entry; instead `isSourceCodePath()` calls `wellFormedWorktreePath()` (from `lib/worktree-scope.cjs`), which resolves `..` and confirms the write lands INSIDE a worktree before exempting it. A traversal escape (`.worktrees/<slug>/../../src/x.ts`) resolves back onto the shared root tree, is no longer exempt, and is blocked. Orchestrator writes target main-repo paths (`src/foo.ts`, `e2e/bar.spec.ts`) with no worktree segment — those are blocked.

**Override (trivial Path D fixes only)**: `export CLAUDE_ALLOW_ORCHESTRATOR_CODE=1`. Use sparingly for one-liner typo fixes or legitimate kit-dogfooding work; document rationale in SRS §10 Changelog. The hook emits a stderr warning when the escape hatch is active so the bypass is visible.

**Source-code path detection.** Any path with a source-code extension (.ts, .tsx, .js, .py, .go, .java, .kt, .c, .cpp, .rs, .rb, .php, .swift, .cs, .dart, .scala, .sh, .vue, .svelte, .css, .scss, .less, .html, etc.) under a `/src/` segment OR matching `e2e/**/*.spec.*` OR under a `CLAUDE_SOURCE_CODE_DIRS` custom prefix. Excluded segments (`node_modules`, `dist`, `build`, `out`, `.output`, `.claude`, `docs`, `.git`, `.worktrees`) are never blocked.

**Source-layout gate (sub-agent writes).** Two checks now run per path. The Orchestrator-direct block above only fires for source paths *outside* a worktree. A second check governs source writes *inside* a worktree (the legitimate sub-agent case): the kit fixes two source roots — `frontend/` (FE Dev) and `backend/` (BE Dev), declared per project in SRS §3.4.5 Source Layout. The hook strips the `.worktrees/<role>-<task-id>/` prefix (via `worktreeRelativePath()` in `lib/worktree-scope.cjs`) and, using `lib/source-layout.cjs`, refuses a `/src/` source write whose worktree-relative path is not under a declared root. Allowed roots = `frontend`, `backend` (defaults) ∪ extra `<tier> root:` lines parsed from SRS §3.4.5 (e.g. `shared root: packages/`) ∪ `CLAUDE_SOURCE_CODE_DIRS` prefixes. Single app/service per tier → `frontend/src/**`, `backend/src/**`; multiple → `frontend/<app>/**`, `backend/<service>/**`. Test code (e2e specs) and non-`/src/` files (configs, SQL, manifests) are exempt. Fail-open: if `docs/SRS.md` is absent or §3.4.5 unparseable, only the two kit-default roots apply. The hook cannot tell FE from BE (no role identity in the PreToolUse event — see `lib/worktree-scope.cjs` header), so it enforces "all app source under a declared root," not "FE only in frontend/"; the FE→frontend / BE→backend binding is a prose Hard Rule in the be-dev / fe-dev templates. **Override**: `export CLAUDE_SKIP_SOURCE_LAYOUT_CHECK=1` (operator-explicit; document rationale in SRS §10 Changelog).

**Historical note.** The kit v0.2 first draft gated this hook on `CLAUDE_ORCHESTRATOR=1` being set — but nothing in the kit reliably set that env var, so the hook silently no-op'd in real sessions. The block-by-default redesign uses the worktree-path signal which is physically enforced by `.claude/rules/worktree-isolation.md` §5 (Orchestrator at repo root, sub-agents in `.worktrees/<*>/`) and doesn't require any operator setup.

**Known limitation**: this hook does not parse Bash commands. `echo ... > src/foo.ts` would slip through. Same trade-off as `master-plan-write-guard.cjs`; the prose rule (CLAUDE.md §10) is the authoritative control.

## orchestrator-write-guard.cjs (PreToolUse)

Enforces the **pure-router invariant**: the Orchestrator may only Write/Edit/MultiEdit/NotebookEdit to a small allow-list of paths; everything else (role-owned docs, project root files, source code outside its own narrower guard) is refused with a role-aware error message naming the sub-agent that owns the path.

**Block-by-default for Orchestrator context** (paths outside any `.worktrees/<role>-<task-id>/` segment). Sub-agent writes pass through. No env-var setup required.

**Orchestrator allow-list:**
- `docs/plan/**` — sole writer per CLAUDE.md §1
- `docs/open-issues.md` — any agent appends per §6
- `docs/iteration-plan/**` — Orchestrator processes per §9 Step 3.5
- `.claude/**` — kit-dev files (operator dogfooding the kit itself)
- `CLAUDE.md` — kit operating contract
- `RELEASE-NOTES*.md` — kit-level documentation
- `.gitignore`, `.gitattributes` — kit-level git config

**Block list** (everything else, including):
- `docs/SRS.md`, `docs/user-stories/`, `docs/frs/` → BA
- `docs/architecture.md`, `docs/decisions/`, `docs/instrumentation-contract.md` → SA
- `docs/api-contracts/` → BE Dev
- `docs/test-cases/by-us/`, `docs/test-cases/by-task/`, `docs/uiux/visual-specs/` → QA-Author
- `docs/uiux/handoffs/` → UI/UX Designer
- `docs/uiux/refs/` → FE Dev
- `docs/deploy-reports/` → DevOps; `docs/qa-reports/` → QA-Exec
- `docs/research-reports/`, `docs/debug-reports/`, `docs/code-reviews/`, `docs/oq-resolutions/`, `docs/archaeology-reports/` → Path B agents
- `package.json`, `Dockerfile`, `docker-compose.yml`, `.env`, `tsconfig.json`, `Cargo.toml`, `go.mod`, `pom.xml`, etc. → BE/FE Dev or DevOps in worktree

The block message names the owning role + dispatch mode so the operator knows which classification to use.

**Override (rare — operator-explicit one-off):** `export CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1`. Hook emits stderr warning when active.

**Layering vs source-code-write-guard.** Both fire on Write/Edit/MultiEdit/NotebookEdit; source-code-write-guard has the more specific "SDLC pipeline" message for `**/src/` + `e2e/**/*.spec.*` paths. Defense-in-depth — each provides its own focused error regardless of which trigger fires first.

## orchestrator-bash-guard.cjs (PreToolUse)

Enforces the **pure-router invariant** on the Bash side: blocks state-mutating Bash commands when the agent's `cwd` is outside `.worktrees/<role>-<task-id>/` (i.e., main-repo / Orchestrator context). Sub-agents running from inside their worktree pass through.

**Detection (command-aware as of the worktree-scope hardening):** the hook treats a command as sub-agent context when EITHER `event.cwd` is inside `.worktrees/<role>-<task-id>/` OR the command explicitly scopes itself into a worktree (`cd .worktrees/<role>-<task-id> && …`, `git -C <worktree>`, `--prefix <worktree>`, `make -C <worktree>`), via `lib/worktree-scope.cjs`. This closes the gap where — under the §5 reality that Task can't set a per-dispatch cwd, so every sub-agent inherits root cwd — a dev agent's correctly-scoped `cd .worktrees/<role>-<task-id> && npm run build` was indistinguishable from an Orchestrator root build and got blocked. Unscoped mutations/builds (which would corrupt the shared root source tree and collide with parallel agents) stay blocked. Path/command-based — no env-var setup required.

**Mutating-pattern block list** (block-by-pattern; commands not matching any pattern pass through):
- Package installers: `npm/yarn/pnpm install|add|remove`, `pip install`, `cargo add`, `go get`, `brew install`, etc.
- Docker mutations: `docker compose up/down/restart/build/run`, `docker run/exec/start/stop/rm`, `docker image/volume/network` mutations, `docker system prune`
- Orchestration: `kubectl apply/delete/patch/rollout`, `helm install/upgrade/delete`
- DB DML/DDL: `psql -c "INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|..."`, same patterns for `mysql -e`, `sqlite3`, `mongosh`, `redis-cli SET/DEL/FLUSHDB`
- HTTP mutations: `curl -X POST|PUT|DELETE|PATCH`, `curl -d|--data`, `wget --post-data`, `http POST/PUT/DELETE`
- FS destructive: `rm -rf|-f`, `mv` (outside `/tmp`), `shred`
- In-place edits: `sed -i`, `perl -i`, `awk -i`
- Shell redirects to project paths: `> src/`, `> e2e/.../spec.ts`, `> docs/` (except plan/ + open-issues.md + iteration-plan/), `> .env`, `> package.json|Dockerfile|...`, `tee` to non-temp paths
- Git mutations beyond commit: `git push`, `git reset --hard`, `git rebase -i`, `git checkout -- <path>`, `git clean`, `git stash drop/clear/pop`, `git filter-branch/repo`
- Permissions: `chmod`, `chown`, `chgrp`
- Build artifacts: `npm/yarn/pnpm run build`, `cargo build`, `go build`, `mvn package`, `gradle build`, `make` (except `-n` dry-run)
- Service mutations: `systemctl start/stop/restart`, `crontab -e|-r`

**Pass-through:** read-only commands (`ls`, `cat`, `grep`, `find`, `git status/log/diff/show`, `docker ps/inspect/logs/port/stats`, `git commit/add/init/worktree add`) and any command not matching a mutating pattern.

**Override (rare — operator-explicit one-off):** `export CLAUDE_ALLOW_ORCHESTRATOR_BASH=1`. Hook emits stderr warning when active.

**Known limitation:** Bash pattern matching is best-effort defense-in-depth, not airtight. Heredocs piped to shells, function definitions wrapping mutations, subshells with command substitution all can slip through. The prose rule in CLAUDE.md §10 is the authoritative control; this hook catches the most common operator-tempting mutations.

## plan-update-location-guard.cjs (PreToolUse)

Refuses `Write`/`Edit`/`MultiEdit`/`NotebookEdit` on any file matching `plan-update*.json` (canonical, suffixed, dated — anything starting with `plan-update` and ending with `.json`) when the target path is OUTSIDE a `.worktrees/<role>-<task-id>/` segment.

**Why:** Per `.claude/rules/worktree-isolation.md` §5 + CLAUDE.md §10, `plan-update.json` is a transient handoff artifact that lives only inside the sub-agent's worktree. The Orchestrator ingests its content into `docs/plan/` then cleans up the worktree. Files at project root accumulate as leakage from pre-hook sessions or escape-hatch overrides; this hook prevents new ones from landing there.

**Sub-agent context detection:** path-based — same pattern as `source-code-write-guard` and `orchestrator-write-guard`. If the file_path contains a `.worktrees/<*>/` segment, allow; otherwise block.

**Companion: Orchestrator §9 Step 0.5** sweeps existing root-level stragglers on every Orchestrator invocation. The hook prevents new accumulation; the pre-flight handles historical residue.

**Override (rare — one-off operator ops):** `export CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1`. Hook emits stderr warning when active.

**Known limitation:** doesn't parse Bash commands. `cat <<EOF > plan-update-T-NNN.json` would slip through; that's the trade-off across all hooks of this shape. The prose rule (CLAUDE.md §10) is the authoritative control.

## Cross-cutting design notes

### Fail-open philosophy

Every hook exits 0 on internal errors and on malformed event JSON, with a warning to stderr. Rationale: a buggy hook should never block legitimate work — the failure mode is "the gate is open more than intended," not "everything is blocked." The flip side: a hook bug produces only a stderr warning, which the user may not be reading. The test suite (`test-hooks.sh`) is the catch-it-before-prod layer.

### Markdown parsing by regex

Several hooks parse kit-format markdown (SRS header, open-issues entries, master-plan task structure). This works because the kit prescribes the format, but regex-based markdown parsing has a recurring failure mode: fenced code blocks inside the source file get matched as if they were real data.

The kit's defense:

- All markdown-parsing hooks pass content through `lib/strip-fences.cjs` before regex matching.
- The test suite includes "messy fixtures" — synthetic files with fenced format-reference blocks at the top — that assert the hooks ignore the fenced content.
- Regression: when adding a new hook that parses kit-format markdown, follow the same pattern (strip fences first) and add a messy-fixture test case.

If a future failure shows up that fence-stripping doesn't cover (e.g., inline code spans, indented fences, tilde fences), consider replacing the lib with a real markdown parser. Current stance: three hooks doing regex parsing is below that threshold; if the kit ever has 5+ such hooks, revisit.

### Bash-command parsing trade-off

`master-plan-write-guard.cjs` and `plan-update-validator.cjs` deliberately do not parse Bash commands. Reasons:

- Bash redirect parsing is brittle. `echo > file` is easy; `cat <<EOF | dd of=file conv=notrunc` is hard. Each new shell idiom is a new bypass to plug.
- The prose rule (CLAUDE.md §10) is the authoritative control. Sub-agents that try to bypass the file-tool path via Bash are explicitly violating the contract, not exploiting a hook gap.
- The privacy-check hook does parse Bash commands (substring match against sensitive paths) because the asymmetric cost of a credential leak justifies the brittle defense. Master-plan corruption is recoverable from git history; credential leaks are not.

If you want stricter Bash enforcement, the right move is a Bash-redirect detection hook layered separately, not piling parsing into the existing hooks.

### Environment variable escape hatches

Two env vars bypass hook enforcement:

| Variable | Bypasses | Set by |
|---|---|---|
| `CLAUDE_PRIVACY_OK=1` | `privacy-check.cjs` (sensitive-path block) | User, per-session, when knowingly handling a sensitive file |
| `CLAUDE_ALLOW_PLAN_WRITE=1` | `master-plan-write-guard.cjs` (sub-agent docs/plan/ write block) | Operator, per-session, for rare kit-dogfooding scenarios where the Orchestrator role acts from inside a worktree; document rationale |
| `CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1` | `plan-update-location-guard.cjs` (plan-update*.json outside .worktrees/) | Operator, per-session, for rare one-off writes; document rationale |
| `CLAUDE_ALLOW_ORCHESTRATOR_CODE=1` | `source-code-write-guard.cjs` (Orchestrator-direct source-code write) | Operator, per-session, for trivial Path D fixes or kit dogfooding; document rationale in SRS §10 Changelog |
| `CLAUDE_SKIP_SOURCE_LAYOUT_CHECK=1` | `source-code-write-guard.cjs` (sub-agent source write outside declared `frontend/` / `backend/` roots, SRS §3.4.5) | Operator, per-session, for legacy layouts or one-off cross-tier work; document rationale in SRS §10 Changelog |
| `CLAUDE_SOURCE_CODE_DIRS=<prefixes>` | `source-code-write-guard.cjs` (adds extra allowed source roots beyond `frontend/` / `backend/`) | Operator, for monorepo shared-code roots not declared in SRS §3.4.5 |
| `CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1` | `orchestrator-write-guard.cjs` (Orchestrator write outside allow-list) | Operator, per-session, for one-off operator-explicit edits to role-owned paths; document rationale |
| `CLAUDE_ALLOW_ORCHESTRATOR_BASH=1` | `orchestrator-bash-guard.cjs` (Orchestrator state-mutating Bash) | Operator, per-session, for one-off operator-explicit Bash ops; document rationale |
| `CLAUDE_ALLOW_GENERAL_PURPOSE=1` | `kit-role-dispatch-guard.cjs` (Task-tool general-purpose block) | User, per-session, for one-off cross-cutting work that genuinely has no kit role |
| `CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1` | `docker-scope-guard.cjs` (project-scoped container guard) | Operator, per-session, when intentionally operating cross-project; document rationale |
| `CLAUDE_SKIP_COMMIT_CHECK=1` | `task-completion-commit-check.cjs` (commit-before-done) | Sub-agent, per-dispatch, when no-op return is intentional; document rationale |

These are documented escape hatches, not security boundaries. An agent that has Bash access can `export` these. The prose rule says agents don't set them; the hook honors them when set. If you need a stricter posture, consider an outer-process check (e.g., a CI step that re-runs the hook against the actual commit).

## Testing

```sh
bash .claude/hooks/tests/test-hooks.sh
```

Pipes synthetic Claude Code tool events through each hook and asserts exit codes plus, where relevant, stdout content. Includes "messy fixtures" — files with fenced format-reference blocks — that assert hooks ignore fenced content. Run before committing changes to any hook, the shared lib, or `settings.json`.

## Adding a new hook

1. Drop `<name>.cjs` in this directory.
2. Read JSON event from stdin.
3. Exit 0 to allow / 2 to block (PreToolUse) — for UserPromptSubmit / SessionStart, exit 0 and write to stdout to inject context.
4. Be paranoid about malformed input — never let the hook itself break the tool call (fail-open).
5. If parsing kit-format markdown, `require('./lib/strip-fences.cjs')` and strip fences before regex matching.
6. Wire it up in `.claude/settings.json` under the appropriate trigger.
7. Add coverage in `tests/test-hooks.sh`. If parsing markdown, add a messy-fixture case alongside the happy path.

## post-bash-security-audit.cjs (PreToolUse --snapshot + PostToolUse, Bash)

The kit's only PostToolUse hook. PreToolUse guards gate *intent*; this hook audits *outcome* — what a Bash command actually changed after it ran. Closes the malware-install gap: an `npm install` whose package carries a malicious postinstall passes every pre-guard, then executes arbitrary code.

**Two wirings, one file:**

- **PreToolUse (Bash, `--snapshot`)**: hashes the sensitive-path watchlist into `.claude/hooks/.state/sensitive-baseline.json`. Never blocks, no output.
- **PostToolUse (Bash)**: compares against the baseline + audits the command's effects.

**Checks:**

1. **Sensitive-path tampering** — changed / new / deleted files under persistence vectors: `.git/hooks/`, `.claude/settings.json`, `.claude/hooks|agents|rules/`, `CLAUDE.md`, `~/.bashrc` & friends, `~/.ssh/authorized_keys`. New executables in `.git/hooks` are HIGH.
2. **Dependency-install audit** (when the command matches npm/yarn/pnpm/bun/pip/poetry/uv/composer/gem/cargo/go install patterns) — diffs lockfiles vs git HEAD; flags new packages with `preinstall`/`install`/`postinstall`/`prepare` scripts (HIGH when the script contains curl/wget/base64/eval/etc.), deps resolved outside the default registry, and typosquat candidates (Damerau edit-distance 1 from a popular-package list — extend `POPULAR_NPM` at the top of the file).
3. **Command red flags** (report-only) — `curl|sh` pipes, base64-decode-to-shell, `chmod +x` on hidden/temp paths, crontab edits, `nc -e`, redirects into shell rc files.

**Response model: detection-only.** Findings append ONE `State: open` entry to `docs/open-issues.md` (CLAUDE.md §6 format, `ISSUE-SEC-<hash>`) — the existing triage gate then blocks all new dispatches until a human triages. Findings are also injected back to the agent via `additionalContext`. The hook never blocks the (already completed) tool call and always exits 0.

**Dedupe**: finding fingerprints in `.claude/hooks/.state/audit-seen.json` prevent the same finding set from re-filing on every subsequent Bash run.

**Trusted kit init/update receipt**: `sdlc-init` writes `.claude/hooks/.state/sdlc-init-receipt.json` with the hashes of sensitive files it intentionally changed. When the audited Bash command is a fresh `sdlc-init` run, the hook suppresses only matching sensitive-path findings. Extra changed files, stale/missing receipts, hash mismatches, deleted files, dependency findings, and command red flags still file open issues.

**Override per-session**: `export CLAUDE_SKIP_SECURITY_AUDIT=1`

**Known limits** (extend when they bite): no advisory-DB lookup (npm audit / osv — deliberately excluded from the inline hook for speed; run on demand); first-install of an untracked lockfile skips per-package extraction (URL/script scans still run); watchlist walk capped at 800 files; a long-running background process started by one command and mutating files later is attributed to the NEXT Bash run's audit window.

## pre-install-dependency-verifier.cjs (PreToolUse, Bash)

The prevention counterpart to `post-bash-security-audit.cjs`: that hook detects what an install DID; this one stops known-bad packages BEFORE they are downloaded and their install scripts execute.

**Trusted sources** (queried live, per spec, with a 24h verdict cache at `.claude/hooks/.state/verify-cache.json`):

1. **OSV.dev** `/v1/querybatch` — aggregated advisory database (GitHub Security Advisories, the malicious-packages repo, PyPA, RustSec, …).
2. **deps.dev** — package metadata; resolves unpinned installs to the concrete version that WOULD land, and supplies publish dates for the recency heuristics.

**Tiered enforcement:**

- **BLOCK (exit 2)** — the version (or package, when unresolvable) carries an OSV `MAL-*` advisory: known malware. Applies equally to `npx` / `pnpm dlx` / `bunx` / `uvx` immediate-execution installs and to installs buried in chained commands (`cd app && npm i evil-pkg && …`).
- **WARN (allow)** — non-malware advisories (CVE/GHSA/PYSEC/…); package first published <30 days ago (the typosquat window); resolved version published <7 days ago (pre-advisory window); git/URL/local specs that can't be checked against any registry. Warnings reach the agent via PreToolUse `additionalContext` and stderr.
- **FAIL-OPEN** — sources unreachable / timeout / unknown ecosystem: install proceeds with a "verification skipped" note. Partial-lookup results are not cached, so the next attempt re-verifies.

**Covered ecosystems:** npm-family (npm/yarn/pnpm/bun + npx/dlx/bunx), Python (pip/poetry/uv/pipx/uvx), and OSV-only depth for cargo, go, gem, composer.

**Override per-session**: `export CLAUDE_SKIP_DEPENDENCY_VERIFY=1` (document rationale in SRS §10 Changelog). Test endpoints: `CLAUDE_VERIFY_OSV_BASE` / `CLAUDE_VERIFY_DEPSDEV_BASE`; per-request timeout `CLAUDE_VERIFY_TIMEOUT_MS` (default 4000).

**Known limits**: lockfile-driven installs (`npm ci`, bare `npm install` with no args) carry no specs to pre-verify — the PostToolUse audit covers their outcome; version ranges/dist-tags resolve via deps.dev default version (approximation of the installer's resolver); transitive dependencies are not pre-verified (post-audit + lockfile diff covers them); deprecated-package flags not yet sourced. Tests: `tests/test-dependency-verifier.sh` (offline, self-stubbed).
