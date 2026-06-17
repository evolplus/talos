# Worktree Isolation

This file holds CLAUDE.md §5. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`. For master plan write discipline, see
`.claude/rules/master-plan-discipline.md` §8.

---

## 5. Worktree Isolation

**v0.3.2 update — logical-ownership-first model.** This section originally described full physical isolation (every sub-agent runs from its own `.worktrees/<role>-<task-id>/` cwd). Claude Code's Task tool does not accept a `cwd` parameter, so sub-agents inherit the harness cwd (project root) regardless of `isolation: worktree` (which uses a Claude-internal path that doesn't match the kit's `.worktrees/`). The kit now operates in a **two-tier** model:

- **Logical isolation by role-ownership** (default for doc-writing roles: BA, SA, TL, QA-Author, UI/UX Designer). Sub-agents write directly to their owned paths under `docs/` from the main cwd. The `orchestrator-write-guard.cjs` hook consults `.claude/hooks/lib/role-ownership.cjs` to allow any kit-role-owned path. The owning role's prose Hard Rules in their agent template are the gate against cross-role writes. This is the **primary** discipline going forward.
- **Physical isolation by worktree** (required for code-writing roles: BE Dev, FE Dev, QA-Exec, DevOps). The Orchestrator runs `git worktree add .worktrees/<role>-<task-id>/` BEFORE dispatch (per `.claude/rules/orchestrator-operating-rules.md` §9 Step 4.6). The sub-agent's dispatch prompt names the absolute worktree path; the sub-agent uses it as the prefix for all source-code writes, which themselves land under the project's declared source roots (`frontend/**`, `backend/**` per SRS §3.4.5 Source Layout — e.g. `<worktree>/frontend/web/src/**`). The `source-code-write-guard.cjs` hook blocks source-code paths NOT inside any `.worktrees/<role>-<task-id>/` segment. This preserves merge-conflict isolation where logical role-ownership is ambiguous (BE Dev and FE Dev both write to `src/`).

When this section's prose references "the worktree" or "the sub-agent's cwd," substitute "logical role-ownership" for doc-writing roles and "physical worktree" for code-writing roles. The layout diagram below shows the physical worktree shape; doc-writing roles use the layout less and less in practice — their writes land directly under `docs/<role-owned-path>/`.

All sub-agents operate under **isolation** to enable safe parallel work — logical by default for docs, physical for code.

**Layout:**

```
<repo-root>/                    # Orchestrator's main worktree
.worktrees/
  ba-<task-id>/
  ui-ux-designer-<task-id>/
  sa-<task-id>/
  tl-<task-id>/
  qa-author-<task-id>/
  be-dev-<task-id>/
  fe-dev-<task-id>/
  devops-<task-id>/
  qa-exec-<task-id>/
```

**Rules:**

1. The Orchestrator creates a worktree per dispatched sub-agent on a dedicated branch: `agent/<role>/<task-id>`.
2. Sub-agents commit their work in their own worktree. They do **not** push to the shared branch directly.
3. **The `docs/plan/` hierarchy is special.** Sub-agents do **not** edit anything under `docs/plan/` in their worktrees. Instead, they emit a
   `plan-update.json` proposal in their worktree:

   ```json
   {
     "task_id": "T-042",
     "track": "be | fe | be+fe | infra | qa",
     "from_status": "in-progress",
     "to_status": "ready-for-deploy",
     "design_sub_status": "design-confirmed",
     "agent": "be-dev",
     "timestamp": "2026-05-06T10:30:00Z",
     "notes": "..."
   }
   ```

   The `design_sub_status` field is optional. Populate it only when the proposal moves the design sub-status
   (UI/UX Designer, BA Phase 3, or the user-confirmation handler).

4. The Orchestrator reads `plan-update.json` from each returning worktree, validates the transition, and is the **sole
   writer** to anything under `docs/plan/` on the main branch.

   **Location invariant.** `plan-update.json` lives ONLY at `.worktrees/<role>-<task-id>/plan-update.json`. No suffixed variants (`plan-update-T-001.json`), no root-level writes, no copies under `docs/`. The `plan-update-location-guard.cjs` hook refuses any write to a `plan-update*.json` path outside `.worktrees/`; the Orchestrator's §9 Step 0.5 pre-flight cleans up any existing stragglers at root. If you're a sub-agent and your write is refused, verify your cwd is inside your worktree. A single `plan-update.json` typically results in the Orchestrator updating 1–3 files: always the task file (`docs/plan/phase-NN-name/tasks/T-NNN.md`), sometimes the phase file (`docs/plan/phase-NN-name/phase.md`) when the per-task summary changes, and rarely the top `docs/plan/master-plan.md` (only when the running-tasks set changes — i.e., the task entered or left `in-progress`). See `.claude/rules/master-plan-discipline.md` §8 for the file schemas.
5. Role-owned artifacts (architecture, API contracts, test cases, code) are merged from worktrees via fast-forward or
   PR-style merge by the Orchestrator after exit-criteria validation.
   **Ingestion vs git-merge.** The TL's `plan-proposal/` tree is **consumed via ingestion**, not git-merged: the Orchestrator reads the proposal, writes new files into `docs/plan/` from its main-repo cwd (the `master-plan-write-guard.cjs` hook allows by default; only `.worktrees/...` writes to `docs/plan/` are blocked), then **deletes** `plan-proposal/` along with the worktree at cleanup (rule 7). The proposal tree never lands on main. Same principle for any other transient handoff artifact (e.g., per-agent `plan-update.json`).

6. **Merge order:** Designer's `docs/uiux/handoffs/<task-id>.md` and BA's `docs/uiux/completeness-reports/<task-id>.md`
   merge before FE Dev starts (logically enforced by the design lifecycle gate). For BE+FE features, BE Dev merges
   before FE Dev so the API contract is on main when FE pulls.
7. Worktree cleanup is the Orchestrator's responsibility once the task closes.

### Command scoping for code-writing roles (Bash surface)

Because the Task tool does not accept a per-dispatch `cwd`, every sub-agent inherits the project-root cwd. File-tool source writes are kept in the worktree by `source-code-write-guard.cjs` (which now resolves `..` and exempts only *well-formed* `.worktrees/<role>-<task-id>/` paths). The Bash surface is held to the same discipline by `orchestrator-bash-guard.cjs`, which (via `.claude/hooks/lib/worktree-scope.cjs`) treats a command as worktree-scoped when its cwd is inside a worktree OR it scopes itself there (`cd .worktrees/<role>-<task-id> && …`, `git -C`, `--prefix`, `make -C`). Unscoped builds / installs / mutations run against the shared root tree and are blocked — that is the cross-agent-conflict and source-tree-contamination risk the rule exists to prevent.

**Known limit (honest):** these guards enforce *worktree-scoped*, not *agent-owns-this-specific-worktree*. With no role/task identity in the PreToolUse event and no reliable per-dispatch env propagation to the hook subprocess, the runtime layer cannot stop one agent from writing into another's worktree. Rule 1 above (one agent per worktree, Orchestrator-created) remains the control for that, pending a harness `cwd` parameter on Task.

This eliminates merge conflicts on the plan hierarchy and gives every agent a clean, isolated filesystem.
