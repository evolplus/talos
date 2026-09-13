# Hooks

Runtime guardrails that fire on Claude Code tool events. Wired up in `hooks/hooks.json` (the plugin's hook manifest; paths resolve through `${CLAUDE_PLUGIN_ROOT}`). When the kit is vendored into a repo rather than installed as a plugin, the equivalent wiring is `settings/original-settings.json`, which `scripts/sdlc-init.cjs` merges into that project's `.claude/settings.json`.

**`settings/original-settings.json` is generated from `hooks/hooks.json` — do not hand-edit it.** Run `node scripts/sync-settings-template.cjs` after changing the manifest (`--check` fails on drift, and `hooks/tests/test-vendored-parity.sh` asserts it). The two were hand-maintained and drifted by seven hooks plus an entire event; because `sdlc-init` copies every hook file but merges only the template's registrations, vendored projects ended up with hooks on disk that were never invoked. **A hook file existing is not evidence that it runs.**

Hooks supplement the prose rules in `CLAUDE.md` and `.claude/rules/`. The rules describe what agents *should* do; hooks make sure they *can't* do certain things even if they try.

All hooks are **fail-open**: if a hook crashes or its event JSON is malformed, it allows the tool call and writes a warning to stderr. We never want a buggy hook to block legitimate work.

## Inventory

| Hook | Event | Purpose |
|---|---|---|
| `dispatch-journal-gc.cjs` | SessionStart via `session-init-summary.cjs` | Deletes only journals marked finalized whose recorded finalization commit is in current `HEAD` history and whose worktree is gone |
| `session-init-summary.cjs` | SessionStart | Runs safe journal GC, then prints SRS / open-issues / master-plan state |
| `srs-status-guard.cjs` | UserPromptSubmit | Reminds when SRS Status ≠ Signed-off |
| `open-issues-triage-gate.cjs` | UserPromptSubmit | Reminds when any open-issues entry is `State: open` |
| `privacy-check.cjs` | PreToolUse | Blocks reads/writes/searches against sensitive paths and credential-dumping Bash commands while allowing safe SSH/K8s config references |
| `plan-update-validator.cjs` | PreToolUse (Write) | Validates `plan-update.json` schema |
| `acceptance-scenarios-validator.cjs` | PreToolUse (Write) | Blocks US/FR writes that lack a Given/When/Then Acceptance Scenarios section |
| `self-containment-validator.cjs` | PreToolUse (Write) | Blocks kit artifacts that back-reference upstream sources instead of being self-contained |
| `external-integration-adequacy-validator.cjs` | PreToolUse (Write/Edit) | Blocks SRS sign-off when external integration adequacy files are missing or non-adequate |
| `environment-config-validator.cjs` | PreToolUse (Write/Edit) | Blocks SRS sign-off states when FE/BE runtime scope lacks local + testing/staging + production environment config and declared runtime variables |
| `srs-design-flow-validator.cjs` | PreToolUse (Write/Edit) | Blocks Flow A SRS sign-off states when Figma extraction/mapping evidence is incomplete |
| `design-substatus-validator.cjs` | PreToolUse (Write/Edit) | Blocks task files from setting `design-confirmed` before handoff + BA completeness evidence exists |
| `integration-dod-validator.cjs` | PreToolUse (Write) | Blocks glue/cross-track tasks whose DoD lacks integration/runtime verification |
| `qa-runtime-evidence-validator.cjs` | PreToolUse (Write) | Blocks BE/be+fe QA reports that claim PASS with code-exists-only evidence |
| `master-plan-write-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks direct writes to anything under `docs/plan/` (master-plan.md, phase.md, task files) from sub-agents |
| `kit-role-dispatch-guard.cjs` | PreToolUse (Task) | Blocks `subagent_type: general-purpose` dispatches when the prompt contains kit-role signals (BA Mode X, SA extract, QA-Author, etc.). Enforces CLAUDE.md §10 "Role-specialized dispatch required" |
| `source-code-write-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks Orchestrator source-code writes and enforces declared source roots for sub-agent worktrees |
| `orchestrator-write-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks Orchestrator writes outside its allow-list of router-owned paths |
| `orchestrator-bash-guard.cjs` | PreToolUse (Bash) | Blocks state-mutating Bash from Orchestrator/main-repo context; permits cleanup-only `rm`/`rmdir` when every target is strictly below `.worktrees/` or `.claude/dispatch-journal/` |
| `local-worktree-git-guard.cjs` | PreToolUse (Bash) | Blocks pushing, pulling, merging, rebasing, or cherry-picking local `.worktrees/` Git history and blocks branch-backed `.worktrees/` creation |
| `worktree-promotion-guard.cjs` | PreToolUse (Bash) | Blocks `git worktree remove` / `rm -rf .worktrees/<role>-<task-id>` while the dispatch's content is not provably on main (§9 Step 7 step 6b). The counterpart to `local-worktree-git-guard`: that one forbids promoting worktree history *via git*, this one forbids *destroying* the worktree before path-scoped ingestion has happened. Allows the crash-recovery §14.4 discard of an in-flight dispatch |
| `unpromoted-dispatch-audit.cjs` | Stop + SessionStart + UserPromptSubmit | On `Stop`, refuses to end a turn while a completed dispatch is unpromoted (the gate that covers unattended `/sdlc-loop` iterations). On SessionStart / UserPromptSubmit, reports unpromoted dispatches and orphaned residue as context. Honors `stop_hook_active` so it cannot wedge a session |
| `plan-update-location-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks `plan-update*.json` outside `.worktrees/<role>-<task-id>/` |
| `fe-dev-design-contract-guard.cjs` | PreToolUse (Write/Edit/MultiEdit/NotebookEdit) | Blocks FE Dev source writes until `docs/uiux/refs/<task-id>.md` is Frozen and has non-empty manifest/trace rows |
| `ui-task-readiness-guard.cjs` | PreToolUse (Write) | Blocks `ready-for-deploy` proposals for UI tasks until handoff/refs/visual-spec/test artifacts are present and content-complete |
| `docker-scope-guard.cjs` | PreToolUse (Bash) | Blocks Docker mutations outside the project-scoped compose/container set |
| `task-completion-commit-check.cjs` | PreToolUse (Write) | Blocks completion proposals when the sub-agent worktree has uncommitted changes |
| `post-bash-security-audit.cjs` | PreToolUse (Bash, `--snapshot`) + PostToolUse (Bash) | Post-tool-run security audit: sensitive-path tamper detection (`.git/hooks`, `.claude/**`, shell rc files), dependency-install audit (install scripts, off-registry deps, typosquats), command red flags (`curl\|sh`, etc.). Findings file a `State: open` entry in `docs/open-issues.md` (§6 gate) + warn the agent via additionalContext. Detection-only — never blocks. |
| `pre-install-dependency-verifier.cjs` | PreToolUse (Bash) | Verifies packages against trusted sources (OSV.dev advisories + deps.dev metadata) BEFORE download/install. Tiered: known malware (MAL-*) blocks; CVEs, brand-new packages/versions, and unverifiable git/URL specs warn. Fail-open when sources unreachable. Covers npm/yarn/pnpm/bun/npx, pip/poetry/uv/pipx/uvx, cargo, go, gem, composer. |
| `session-init-summary.cjs` (extended) | SessionStart | …also flags interrupted dispatches (surviving dispatch-journal entries + orphan worktrees) per CLAUDE.md §14.3 |

Plus shared utilities in `lib/`:

| Util | Purpose |
|---|---|
| `lib/strip-fences.cjs` | Pure function used by markdown-parsing hooks to remove content inside ``` fenced blocks before regex matching. Prevents fenced "format reference" examples from being parsed as real data. |
| `lib/artifact-ids.cjs` | The kit's artifact-ID grammar, shared by every guard that looks for ID rows: `<PREFIX>-<NNN>`, `<PREFIX>-<QUALIFIER>-<NNN>` (up to four alphanumeric qualifier segments), or `<PREFIX>-NONE` for genuine absence. `idPattern` / `idOrNonePattern` / `rowPattern` build the matchers; `describeMismatch` builds the failure message, distinguishing "no rows at all" from "rows present but shaped differently" and printing the offending tokens. Added after ISSUE-179, where a hard-coded `CMP-\d+` could not match Approver-confirmed `CMP-GW-001..011`, leaving the FE Dev a choice between two falsehoods. Widen the grammar HERE — never in a guard. |
| `lib/dispatch-promotion-state.cjs` | Promotion-state classifier behind the promotion gate, shared by `worktree-promotion-guard` and `unpromoted-dispatch-audit`. `classifyDispatch(role, taskId)` returns `promoted` / `in-flight` (journal entry, no completion signal — safe to discard per §14.4) / `ready-to-finalize` (signaled done, finalization unproven) / `partially-promoted` (marker finalized but manifest paths missing or differing on HEAD) / `unverifiable` (no `artifacts` manifest) / `orphaned` / `unknown` (fail open). Promotion is proven by three independent facts: the finalization marker, that commit being an ancestor of `HEAD`, and every manifest path present on `HEAD` and matching the worktree copy. The third is the one that catches a partial promotion — the first two only prove *a* commit happened. |
| `lib/worktree-scope.cjs` | Worktree-scope detection shared by `orchestrator-bash-guard` and `source-code-write-guard`. `isOperationWorktreeScoped(cwd, cmd)` is true when the cwd is inside `.worktrees/<role>-<task-id>/` OR the command scopes itself there (`cd .worktrees/<role>-<task-id> && …`, `git -C`, `--prefix`, `make -C`). `wellFormedWorktreePath(p)` resolves `..` then checks the write lands INSIDE a worktree (traversal escapes are rejected). It enforces *worktree-scoped*, not *agent-owns-this-worktree* — see the lib header for why the latter isn't runtime-achievable today. |

## dispatch-journal-gc.cjs (SessionStart)

Is invoked synchronously by the session summary before it scans dispatch state. It garbage-collects journals only when
finalization is mechanically proven:

- `finalization.state` is `finalized`;
- `finalization.main_commit` names a commit in the current `HEAD` history; and
- the journaled worktree no longer exists.

Interrupted, malformed, stale-branch, and otherwise ambiguous journal entries are never removed. They remain visible to
the summary hook and must be reconciled under CLAUDE.md §14.

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

Blocks `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Glob`, `Grep`, and unsafe `Bash` calls that read or expose sensitive paths.

**Patterns blocked** (extend the list at the top of the file):

- `.env*` (any env file)
- `secrets/`, `credentials/`, `private/` directories
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`
- `.ssh/`, `~/.ssh/`, `~/.aws/credentials`, `~/.config/gcloud/`, `~/.kube/config`
- project-root `.k8s/` kubeconfig/credential/secret/token files
- generic `kubeconfig`, `kubeconfig.yaml`, and `kube-config.*` files
- Kubernetes Secret files such as `secret.yaml` or `secrets.json`
- `.docker/config.json`
- `.netrc`

**Allowlisted** (always permitted): `.env.example`, `.env.template`, `.env.sample`

**Operational Bash references allowed:** `ssh -F .ssh/config ...`, `scp -F .ssh/config ...`, `kubectl --kubeconfig .k8s/<config> ...`, `helm --kubeconfig .k8s/<config> ...`, and `KUBECONFIG=.k8s/<config> kubectl ...` are allowed because the command references the credential file without printing it. Commands that dump credentials, such as `cat .ssh/config`, `ssh -F .ssh/config host printenv`, or `kubectl --kubeconfig .k8s/config config view --raw`, are blocked.

**Override per-session**: `export CLAUDE_PRIVACY_OK=1`

**Known coverage gaps** (extend the patterns when you encounter these on real repos):

- `.envrc` (direnv) — frequently contains secret exports; not currently blocked
- `.npmrc` (npm) — can contain private registry auth tokens
- `.terraformrc`, `.pypirc` — credential containers
- Kubernetes Secret values embedded in ordinary manifest filenames, for example `deployment.yaml` containing `kind: Secret`; this hook is path/command based and cannot inspect file content before `Read`.

The privacy hook is the runtime defense layer; the `.gitignore` baseline in `.claude/skills/git-commit/references/gitignore-template.md` is the static defense layer. Both are required; neither alone is sufficient.

**Known limitation**: Bash command parsing is still heuristic. `cat /tmp/copy-of-env.txt` slips through; `cat ./.env`, `cat .ssh/config`, and `kubectl config view --raw` are caught. The hook covers the common case; adversarial cases require code review.

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

## plan-consistency-validator.cjs (PreToolUse)

Validates main-repo `Write` and `Edit` operations that change `master-plan.md` or a phase's `phase.md`. Activation is
path-based; `CLAUDE_ORCHESTRATOR` is not required. Sub-agent worktree paths are skipped because
`master-plan-write-guard.cjs` owns that refusal.

For compatibility with mature plans, Markdown wrappers such as `**done**` and backticked folder names are normalized
before comparison. A phase whose tasks are all terminal and include at least one historical `failed` task computes as
`done-with-caveat`; clean terminal phases compute as `done`.

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

## srs-design-flow-validator.cjs (PreToolUse)

Refuses `Write`/`Edit` to `docs/SRS.md` when `Status:` is `Ready-for-Sign-off`, `Source-Validated`, or `Signed-off`, `Design-Flow: A`, and the required Figma evidence is incomplete.

Checks: SRS `Version:` exists, each Figma URL has a paired `docs/requirements/design-extracted/<figma-file-id>-*.md` with Section 6 design-token evidence, `docs/uiux/figma-mappings/v<version>.md` exists with `Mapping-Status: qualified | orphans-only`, no `gap-surface` remains, fuzzy-match decisions are not awaiting confirmation, and Flow A Design References rows have pinned Figma Node IDs.

## environment-config-validator.cjs (PreToolUse)

Refuses `Write`/`Edit` to `docs/SRS.md` when `Status:` is `Ready-for-Sign-off`, `Source-Validated`, or `Signed-off` and the SRS has frontend/backend runtime scope but lacks SRS `§3.4.6 Environment Configuration`.

Checks: the section declares local + testing/staging + production tiers, includes a runtime config variable table with key names, owners, required environments, purpose, secret classification, and config source, and each variable covers all three tiers. For frontend+backend projects, at least one non-secret frontend-owned backend/API endpoint variable (for example `BACKEND_API_ENDPOINT` or `NEXT_PUBLIC_API_BASE_URL`) must be declared so FE Dev cannot hardcode environment-specific backend URLs.

## design-substatus-validator.cjs (PreToolUse)

Refuses task-file `Write`/`Edit` under `docs/plan/*/tasks/T-*.md` when the resulting header sets `Design sub-status: design-confirmed` before the design evidence exists.

Checks: `docs/uiux/handoffs/<task-id>.md` exists and has a checksummed `## Reference Render`, non-empty `## Visual Composition Contract`, `## Asset Export Manifest` with `AST-*` rows, `## Design Element Manifest` with `DEM-*` rows, and Design System Source/token evidence; `docs/uiux/completeness-reports/<task-id>.md` exists with a qualified verdict.

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
- FS destructive: `rm -rf|-f`, `rmdir`, `mv` (outside `/tmp`), `shred`
- In-place edits: `sed -i`, `perl -i`, `awk -i`
- Shell redirects to project paths: `> src/`, `> e2e/.../spec.ts`, `> docs/` (except plan/ + open-issues.md + iteration-plan/), `> .env`, `> package.json|Dockerfile|...`, `tee` to non-temp paths
- Git mutations beyond commit/add/init/detached-worktree creation: `git push`, `git pull`, `git merge`, `git cherry-pick`, `git reset --hard`, `git rebase`, `git checkout -- <path>`, `git clean`, `git stash drop/clear/pop`, `git filter-branch/repo`
- Permissions: `chmod`, `chown`, `chgrp`
- Build artifacts: `npm/yarn/pnpm run build`, `cargo build`, `go build`, `mvn package`, `gradle build`, `make` (except `-n` dry-run)
- Service mutations: `systemctl start/stop/restart`, `crontab -e|-r`

**Pass-through:** read-only commands (`ls`, `cat`, `grep`, `find`, `git status/log/diff/show`, `docker ps/inspect/logs/port/stats`, `git commit/add/init/worktree add --detach`) and any command not matching a mutating pattern. Branch-backed `.worktrees/` creation is refused by `local-worktree-git-guard.cjs`.

**Transient-cleanup carve-out:** a single `rm` or `rmdir` command is allowed from Orchestrator context only when every
target resolves strictly below `.worktrees/` or `.claude/dispatch-journal/`. The cleanup roots themselves, traversal,
mixed targets, variables, non-terminal globs, symlink traversal, `rmdir -p`, and composed shell commands remain
blocked. This is the exact Step-7/crash-recovery surface; it does not authorize deletion elsewhere.

**Override (rare — operator-explicit one-off):** `export CLAUDE_ALLOW_ORCHESTRATOR_BASH=1`. Hook emits stderr warning when active.

**Known limitation:** Bash pattern matching is best-effort defense-in-depth, not airtight. Heredocs piped to shells, function definitions wrapping mutations, subshells with command substitution all can slip through. The prose rule in CLAUDE.md §10 is the authoritative control; this hook catches the most common operator-tempting mutations.

## local-worktree-git-guard.cjs (PreToolUse)

Enforces the local-only worktree invariant: `.worktrees/<role>-<task-id>/` is a detached scratch execution area, not a branch that can be pushed, pulled, merged, rebased, or cherry-picked into main.

Blocks:
- Branch-backed `.worktrees/` creation such as `git worktree add -b ... .worktrees/<role>-<task-id>/ ...`; use `git worktree add --detach .worktrees/<role>-<task-id>/ <base-ref>`.
- `git push` / `git pull` / `git merge` / `git rebase` / `git cherry-pick` from a `.worktrees/...` cwd or command scoped to `.worktrees/...`.
- `git push`, `git merge`, or `git cherry-pick` that references `agent/*` or `local-agent/*` branch names from any cwd.

The intended promotion path is path-scoped ingestion: validate the sub-agent's output, copy/apply only approved file paths to main, commit the result on main, then remove the worktree. The worktree's local commits exist only to make completion auditable and clean.

**Override (rare — operator-explicit repair only):** `export CLAUDE_ALLOW_LOCAL_WORKTREE_GIT=1`. Do not use for routine SDLC dispatches.

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
| `CLAUDE_SKIP_DESIGN_CONTRACT_CHECK=1` | `fe-dev-design-contract-guard.cjs` (FE Dev Frozen design contract gate) | Operator, per-session, for non-UI FE tasks only; document rationale |
| `CLAUDE_SKIP_UI_READINESS_CHECK=1` | `ui-task-readiness-guard.cjs` (UI ready-for-deploy artifact gate) | Operator, per-session, for explicit override only; document rationale |
| `CLAUDE_SKIP_COMMIT_CHECK=1` | `task-completion-commit-check.cjs` (commit-before-ready-to-finalize) | Sub-agent, per-dispatch, when no-op return is intentional; document rationale |

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

**Trusted kit init/update receipt**: `sdlc-init` writes `.claude/hooks/.state/sdlc-init-receipt.json` with the hashes of sensitive files it intentionally changed. When the audited Bash command is a fresh `sdlc-init` run, including direct `sdlc-init` wrappers or `node .../scripts/sdlc-init.cjs --project <path>`, the hook suppresses only matching sensitive-path findings in the receipt. Re-running `sdlc-init` also auto-resolves older open `ISSUE-SEC-*` entries when every listed finding still matches the trusted receipt. Extra changed files, stale/missing receipts, hash mismatches, deleted files, dependency findings, and command red flags still file open issues.

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

## worktree-promotion-guard.cjs + unpromoted-dispatch-audit.cjs (the promotion gate)

This kit does not integrate agent work by git. Code roles run in a **detached** worktree
(`git worktree add --detach`), commit there only to make the tree clean before signaling, and
`local-worktree-git-guard.cjs` blocks push / merge / cherry-pick / rebase of that history on purpose. Integration is
**path-scoped ingestion**: the Orchestrator copies approved paths into main and commits them together with the plan
transition (§9 Step 7).

That design left one side of the contract unenforced. `local-worktree-git-guard` says *"you may not promote worktree
history via git."* Nothing said *"you may not destroy the worktree before its content has been ingested."* And the
specificity ran the wrong way: rule 1 ships the worktree-create command verbatim, rule 7 ships the teardown commands
verbatim — and the Bash guard explicitly permits those teardown targets — while promotion, the step between them, was
prose. A step described in prose, sitting between two steps shipped as commands, is the step that gets skipped.

The consequence is more severe here than an unmerged branch would be. A detached worktree has **no ref**: the moment
`git worktree remove --force` runs, its commits are unreachable, with no branch name to recover from and no reflog
entry to find. The kit's recoverability story (the `finalization` marker plus `dispatch-journal-gc.cjs`) proves that
*a* finalization commit landed; it cannot reconstruct content that was never ingested.

The fix has three layers:

1. **A promotion manifest.** `plan-update.json` carries `artifacts` — every repo-relative path the Orchestrator must
   ingest — required for BE Dev / FE Dev / DevOps / QA-Exec and validated by `plan-update-validator.cjs`. "Promote the
   approved paths" with no manifest has no definition of *which* paths, which is how a dispatch that shipped 3 of 4 DoD
   scopes gets 3 of 4 promoted with every downstream signal reading green (the FR-022 batch-UI silent drop).
2. **A verification step with a command.** §9 Step 7 gains step **6b**: `main_commit` must be an ancestor of `HEAD`,
   AND every manifest path must exist on `HEAD` and match the worktree copy. The marker check alone is insufficient by
   construction — it proves a commit, not its contents.
3. **Two hooks.** `worktree-promotion-guard.cjs` blocks the destructive moment; `unpromoted-dispatch-audit.cjs` blocks
   the passive one (no teardown ran, finalization just never completed, turn ends). The `Stop` gate is what makes this
   hold inside `/sdlc-loop`, where the plan would otherwise read `ready-for-deploy` while main never received the code —
   so later iterations dispatch downstream work against artifacts that do not exist.

**Deliberately not blocked:** the crash-recovery discard (`.claude/rules/crash-recovery.md` §14.4). A journal entry
with no `plan-update.json` means exit criteria never ran, so that partial work is throwaway by design. The guard
detects this automatically; `CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1` covers the case where the journal entry is already
gone.

Escape hatches: `CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1` (operator-explicit — **destroys completed work**; document
rationale in SRS §10 Changelog), `CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1`, `CLAUDE_SKIP_PROMOTION_AUDIT=1`.

**Do not "repair" a blocked teardown with `CLAUDE_ALLOW_LOCAL_WORKTREE_GIT=1` and a merge.** That bypasses the kit's
integration model rather than completing it. The repair is to finish the ingestion.
