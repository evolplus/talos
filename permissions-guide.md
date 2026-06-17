# evo-talos Devkit — Permissions Guide

## Why the kit ships with a wide allow-list

The kit is designed for **autonomous SDLC execution**: a single user request typically fans out to several sub-agent dispatches, each running tens to hundreds of tool calls (reading files, running tests, invoking MCP connectors, committing to a worktree). If Claude Code prompted on every tool call, the operator would spend more time clicking "allow" than reviewing work.

Permission prompts add value **only where the kit's hook layer doesn't already enforce a boundary**. The kit ships ten PreToolUse hooks that block the things that actually matter:

| Hook | What it blocks |
|---|---|
| `privacy-check.cjs` | Reads of sensitive paths unless `CLAUDE_PRIVACY_OK` is set |
| `srs-status-guard.cjs` | Surfaces SRS Status; reminder injection on every UserPromptSubmit |
| `open-issues-triage-gate.cjs` | Reminds when open issues are un-triaged |
| `master-plan-write-guard.cjs` | Writes under `docs/plan/` from inside a sub-agent worktree (path-based detection). Escape hatch: `CLAUDE_ALLOW_PLAN_WRITE=1` |
| `plan-update-validator.cjs` | Schema-validates `plan-update.json` |
| `kit-role-dispatch-guard.cjs` | Refuses `subagent_type: general-purpose` when the prompt looks like kit-role work |
| `acceptance-scenarios-validator.cjs` | Writes to `docs/user-stories/` or `docs/frs/` without `## Acceptance Scenarios` Given/When/Then |
| `self-containment-validator.cjs` | Kit-artifact writes that body-reference upstream input (`docs/requirements/`, archaeology reports, Confluence URLs, code paths) |
| `external-integration-adequacy-validator.cjs` | SRS Status flips to `Signed-off` while any external-integration doc is non-adequate |
| `source-code-write-guard.cjs` | Writes to source-code paths from outside a sub-agent worktree (Orchestrator-direct edits to **/src/, e2e specs). Escape hatch: `CLAUDE_ALLOW_ORCHESTRATOR_CODE=1` |
| `orchestrator-write-guard.cjs` | All Orchestrator-direct writes outside the allow-list (docs/plan/, docs/open-issues.md, docs/iteration-plan/, .claude/, CLAUDE.md, RELEASE-NOTES*.md, .gitignore). Role-aware block message names the owning sub-agent. Escape hatch: `CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1` |
| `orchestrator-bash-guard.cjs` | State-mutating Bash from Orchestrator context (installers, docker compose mutations, DB DML/DDL, HTTP mutations, FS destructive, sed -i, > to project paths, git push/reset/rebase, chmod, build commands). Detected via event.cwd outside .worktrees/. Escape hatch: `CLAUDE_ALLOW_ORCHESTRATOR_BASH=1` |
| `plan-update-location-guard.cjs` | Writes to any `plan-update*.json` outside `.worktrees/<role>-<task-id>/`. The transient handoff artifact has a single canonical home; root-level stragglers are leakage. Escape hatch: `CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1` |
| `docker-scope-guard.cjs` | Docker mutations on out-of-scope containers. Escape hatch: `CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1` |
| `task-completion-commit-check.cjs` | `plan-update.json` writes while the worktree has uncommitted changes |
| `session-init-summary.cjs` | Read-only digest at session start |

**Inside the hook-covered space**, permission prompts are redundant — the hooks make the call. **Outside the hook-covered space** (Bash arguments, network egress, file writes outside `docs/`), permission prompts still matter, and the kit's policy reflects that.

## What the shipped policy does

`.claude/settings.json` ships with `permissions.defaultMode: "acceptEdits"`, a wide `allow` list, and a focused `deny` list.

### `defaultMode: "acceptEdits"`

Auto-accepts Edit / Write / MultiEdit tool calls without prompting. The shipped `deny` list overrides this for sensitive paths (see below). The kit's hooks catch role-boundary violations regardless of mode.

### `allow` — pre-approved (no prompt)

- **Always-safe tools:** `Read`, `Glob`, `Grep`, `Task`, `TodoWrite`, `WebFetch`, `WebSearch`.
- **Bash — inspection / read commands:** `ls`, `cat`, `head`, `tail`, `wc`, `find`, `grep`, `rg`, `awk`, `sed -n` (read-only `-n` mode), `tree`, `file`, `stat`, `diff`, `pwd`, `whoami`, `date`, `echo`, `printf`, `which`, `env`.
- **Git — full operational scope:** status, log, diff, show, branch, remote, worktree, stash, checkout/switch/restore, add, commit, fetch, pull, merge, rebase, reset, tag, clone, **push** (force variants explicitly denied below).
- **Build tooling:** `node`, `npm`, `npx`, `yarn`, `pnpm`, `python`/`python3`, `pip`/`pip3`, `pytest`, `bash`, `sh`.
- **File operations:** `mkdir`, `touch`, `cp`, `mv`, `chmod` (kit hooks catch the kit-artifact boundary cases).
- **Dev utilities:** `gh` (GitHub CLI), `jq`, `curl`.
- **MCP — Atlassian read operations:** all `get*` / `search*` / `fetch` tools on Confluence, Jira, SharePoint. Write tools (`create*` / `update*` / `transition*`) are NOT pre-allowed and will prompt.
- **MCP — Figma read operations:** `mcp__figma__get_*` and `mcp__figma__read_*` patterns. Figma write tools are NOT pre-allowed; only UI/UX Designer dispatches with explicit operator confirmation should reach them.

### `deny` — blocked outright (no prompt, no allow)

Deny rules override `allow` and `defaultMode`. They cover the unambiguous-bad patterns:

- **Destructive Bash:** `sudo`, `rm -rf /`, `rm -rf /*`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf .`.
- **Destructive git:** `git push --force`, `git push -f`, `git push --force-with-lease`, `git push --mirror`, `git push --delete`, `git filter-branch`, `git filter-repo`.
- **Secret reads:** `.env`, `.env.*`, anywhere under `**/secrets/**`, `**/.ssh/**`, `**/credentials`, `**/.aws/credentials`, `**/.gnupg/**`.
- **Secret writes:** Edit / Write to any of the above secret-read patterns.
- **Hook layer protection:** Edit / Write to `.claude/hooks/**` or `.claude/settings.json` from any sub-agent. The hooks ARE the safety boundary; agents must not be able to disable them. (Operators editing these files locally still work — the `deny` rule fires at Claude Code's tool-use moment, not at filesystem level.)

## Tightening or loosening per operator

`.claude/settings.json` is committed and applies to every clone. Per-operator overrides go in `.claude/settings.local.json` (gitignored by the kit's default `.gitignore`).

### To tighten — example "I want to see every Bash call"

`.claude/settings.local.json`:

```json
{
  "permissions": {
    "defaultMode": "default",
    "deny": [
      "Bash(*)"
    ]
  }
}
```

Local settings merge with the shipped settings; the local `defaultMode` and `deny` rules override.

### To loosen — example "I'm running this in a sandboxed VM, allow MCP writes too"

`.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__atlassian__createConfluencePage",
      "mcp__atlassian__updateConfluencePage",
      "mcp__atlassian__createJiraIssue",
      "mcp__atlassian__editJiraIssue",
      "mcp__atlassian__addCommentToJiraIssue",
      "mcp__atlassian__transitionJiraIssue"
    ]
  }
}
```

Note: even with the wider allow, the kit's `kit-role-dispatch-guard` still blocks `general-purpose` dispatches for kit-role work. Permissions and hooks are independent layers.

## What still prompts (and why that's fine)

With the shipped policy, prompts remain for:

- **MCP write operations** to Confluence / Notion / Jira (kit's Mode C ingestion is read-only; writes are out of scope for SDLC dispatches).
- **MCP write operations** to Figma other than the read pattern (only UI/UX Designer should write Figma, and that dispatch is gated by the design lifecycle).
- **Bash commands not on the allow list** — anything exotic gets a prompt. Operators add to `.claude/settings.local.json` as patterns emerge in their workflow.
- **Edit / Write outside the project root.** `defaultMode: "acceptEdits"` applies inside the project; writes elsewhere still prompt. (Claude Code's default project scoping.)

## Compatibility with existing kit invariants

Adding `permissions` to `.claude/settings.json` does not affect:

- `hooks` configuration — both blocks coexist; hooks fire on tool calls regardless of the permission decision (PreToolUse runs before the prompt and can block before permission is even evaluated).
- Path-based detection (`.worktrees/<role>-<task-id>/` segment) distinguishes sub-agent context from Orchestrator context — no env-vouched writer pattern required for `master-plan-write-guard.cjs` or `source-code-write-guard.cjs`.
- The `CLAUDE_PRIVACY_OK=1` env-vouched override pattern (`privacy-check`).
- The `CLAUDE_ALLOW_GENERAL_PURPOSE=1` env-vouched escape hatch (`kit-role-dispatch-guard`).
- The four-layer defense pattern (prose rule + agent procedure + automated check + runtime hook).

## Failure modes to watch in pilot

This is an aggressive policy. Specific things to watch for during the first pilots:

1. **Auto-accepted Edit / Write to a path the kit doesn't recognize.** The hooks check kit-artifact paths (SRS, US, FR, architecture, etc.); writes outside those paths pass through `acceptEdits` silently. If an agent writes to, say, `tools/scratch.txt`, no hook intervenes. Watch for misplaced files.

2. **Bash patterns the allow list missed.** New tooling (e.g., `terraform`, `kubectl`, language-specific build tools) will prompt at first. Add to `settings.local.json` to clear the prompt for routine use.

3. **MCP write attempts on systems where reads were pre-allowed.** An agent reasoning about a Confluence page might try `createConfluencePage` for an unintended side effect. The deny list doesn't cover MCP writes (they prompt instead) — operators should reject anything unexpected.

4. **Secret-pattern false positives.** If your project legitimately stores non-secret content in a file named `.env.example` or similar, the deny rule fires on it. The shipped deny list is conservative on `.env*` — adjust in `settings.local.json` if needed.

5. **Force-push impossible-via-Bash but possible-via-MCP-or-API.** The deny list covers Bash `git push --force` but not equivalent MCP calls if a connector exposed them. None currently do; flag if one appears.

Surface findings via `docs/open-issues.md` with `Track: cross-cutting`.
