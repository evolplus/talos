# Worktree Isolation

This file holds CLAUDE.md §5. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`. For master plan write discipline, see
`.claude/rules/master-plan-discipline.md` §8.

---

## 5. Worktree Isolation

**v0.3.2 update — logical-ownership-first model.** This section originally described full physical isolation (every sub-agent runs from its own `.worktrees/<role>-<task-id>/` cwd). Claude Code's Task tool does not accept a `cwd` parameter, so sub-agents inherit the harness cwd (project root) regardless of `isolation: worktree` (which uses a Claude-internal path that doesn't match the kit's `.worktrees/`). The kit now operates in a **two-tier** model:

- **Logical isolation by role-ownership** (default for doc-writing roles: BA, SA, TL, QA-Author, UI/UX Designer). Sub-agents write directly to their owned paths under `docs/` from the main cwd. The `orchestrator-write-guard.cjs` hook consults `.claude/hooks/lib/role-ownership.cjs` to allow any kit-role-owned path. The owning role's prose Hard Rules in their agent template are the gate against cross-role writes. This is the **primary** discipline going forward.
- **Physical isolation by local worktree** (required for code-writing roles: BE Dev, FE Dev, QA-Exec, DevOps). The Orchestrator runs `git worktree add --detach .worktrees/<role>-<task-id>/ <base-ref>` BEFORE dispatch (per `.claude/rules/orchestrator-operating-rules.md` §9 Step 4.6). The detached worktree is a local scratch execution area, not a branch to push or merge. The sub-agent's dispatch prompt names the absolute worktree path; the sub-agent uses it as the prefix for all source-code writes, which themselves land under the project's declared source roots (`frontend/**`, `backend/**` per SRS §3.4.5 Source Layout — e.g. `<worktree>/frontend/web/src/**`). The `source-code-write-guard.cjs` hook blocks source-code paths NOT inside any `.worktrees/<role>-<task-id>/` segment. This preserves conflict isolation where logical role-ownership is ambiguous (BE Dev and FE Dev both write to `src/`).

When this section's prose references "the worktree" or "the sub-agent's cwd," substitute "logical role-ownership" for doc-writing roles and "physical worktree" for code-writing roles. Logical roles may still create a plain, non-Git `.worktrees/<role>-<task-id>/` handoff directory solely for `plan-update.json`; it must be removed after ingestion. The layout diagram below includes both physical worktrees and these handoff-only directories.

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

1. For code-writing roles, the Orchestrator creates a local detached worktree:
   `git worktree add --detach .worktrees/<role>-<task-id>/ <base-ref>`. For logically isolated doc roles, do not register
   a Git worktree; create `.worktrees/<role>-<task-id>/` only as the transient handoff directory needed for
   `plan-update.json`.
2. Sub-agents may commit inside their own detached worktree so `git status` is clean before `plan-update.json`. These commits are local-only evidence/checkpoints; they are **not** integration branches, are **never pushed**, and are **never merged/cherry-picked** into main.
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
     "artifacts": [
       "backend/src/handlers/join.js",
       "docs/api-contracts/join-v1.yaml"
     ],
     "timestamp": "2026-05-06T10:30:00Z",
     "notes": "..."
   }
   ```

   The `design_sub_status` field is optional. Populate it only when the proposal moves the design sub-status
   (UI/UX Designer, BA Phase 3, or the user-confirmation handler).

   **`artifacts` is the PROMOTION MANIFEST and is REQUIRED for physically-isolated roles** (BE Dev, FE Dev, DevOps,
   QA-Exec); logically-isolated doc roles omit it, since they write main directly. Each entry is the repo-relative path
   **as it lands on main** — not the `.worktrees/<role>-<task-id>/` copy. It lists every path the Orchestrator must
   ingest at §9 Step 7 step (2). `plan-update-validator.cjs` rejects a code-role proposal without it.

   Rationale: this kit integrates by path-scoped ingestion, so "promote the approved paths" needs a definition of
   *which* paths. Without a manifest, a dispatch that shipped 3 of 4 DoD scopes gets 3 of 4 promoted and every
   downstream signal reads green — that is precisely the FR-022 batch-UI silent drop. The manifest turns promotion
   from a judgement call into a checkable list, and it is what lets `worktree-promotion-guard.cjs` prove each path
   actually reached HEAD before the worktree is destroyed.

4. The Orchestrator reads `plan-update.json` from each returning worktree, validates the transition, and is the **sole
   writer** to anything under `docs/plan/` on the main branch.

   **Location invariant.** `plan-update.json` lives ONLY at `.worktrees/<role>-<task-id>/plan-update.json`. No suffixed variants (`plan-update-T-001.json`), no root-level writes, no copies under `docs/`. The `plan-update-location-guard.cjs` hook refuses any write to a `plan-update*.json` path outside `.worktrees/`; the Orchestrator's §9 Step 0.5 pre-flight cleans up any existing stragglers at root. If you're a sub-agent and your write is refused, verify your cwd is inside your worktree. A single `plan-update.json` typically results in the Orchestrator updating 1–3 files: always the task file (`docs/plan/phase-NN-name/tasks/T-NNN.md`), sometimes the phase file (`docs/plan/phase-NN-name/phase.md`) when the per-task summary changes, and rarely the top `docs/plan/master-plan.md` (only when the running-tasks set changes — i.e., the task entered or left `in-progress`). See `.claude/rules/master-plan-discipline.md` §8 for the file schemas.
5. **Promotion is a closure gate, not a housekeeping step.** Role-owned artifacts (architecture, API contracts, test
   cases, code) are promoted from worktrees by **path-scoped ingestion**, never by `git merge`, `git cherry-pick`, or
   `git push`. The promotion must be *verified*, not merely attempted, before anything is torn down.
   - The Orchestrator validates exit criteria, then ingests **exactly the paths in the `artifacts` manifest** (rule 3)
     from `.worktrees/<role>-<task-id>/` into the main worktree. The manifest is the definition of "approved file
     paths" — promotion is never eyeballed from a directory listing.
   - The Orchestrator commits the promoted result on main with the task traceability and attribution trailers from the sub-agent's local commits/report.
   - **Verification (the gate).** After the finalization commit and the journal marker, prove all three facts:

     ```bash
     # 1. the finalization commit really landed
     git merge-base --is-ancestor "$MAIN_COMMIT" HEAD          # must exit 0

     # 2. every manifest path exists on HEAD ...
     git show "HEAD:$P" >/dev/null                             # for each $P in artifacts[]

     # 3. ... and matches what the worktree produced (catches a PARTIAL promotion)
     git show "HEAD:$P" | diff -q - ".worktrees/<role>-<task-id>/$P"
     ```

     Fact 1 alone only proves *a* commit happened, not that it contained everything — facts 2 and 3 are what catch the
     dispatch that promoted most of its work. All three must hold; a manifest path that cannot be checked is a closure
     blocker, not a vacuous pass.
   - **On an ingestion conflict** (the path changed on main since the worktree's base ref): resolve it during ingestion
     and re-verify, or halt with `NEEDS_CONTEXT` and leave the worktree intact. Never skip the path and continue — the
     dispatch already passed exit criteria and the plan is about to read `ready-for-deploy`.
   - The worktree's detached Git history is discarded with the worktree. It must not become a branch on the remote.
   - The `local-worktree-git-guard.cjs` hook blocks branch-backed `.worktrees/` creation, `git push` from/against `.worktrees/`, and merge/cherry-pick/rebase/pull commands involving local worktrees or `agent/*` / `local-agent/*` branches.

5a. **Two hooks enforce rule 5 at runtime.** `local-worktree-git-guard.cjs` already forbids promoting worktree history
   *via git*; these two supply the missing counterpart — forbidding the worktree's **destruction** until its content has
   actually been ingested:

   - `worktree-promotion-guard.cjs` (PreToolUse, Bash) refuses `git worktree remove` and
     `rm -rf .worktrees/<role>-<task-id>` while promotion is unproven. It classifies the dispatch via
     `hooks/lib/dispatch-promotion-state.cjs` and blocks `ready-to-finalize` (signaled done, finalization unproven),
     `partially-promoted` (marker says finalized but manifest paths are missing from or differ on HEAD) and
     `unverifiable` (no manifest, so nothing can be checked). It **allows** `in-flight` (journal entry, no
     `plan-update.json`) — that is `.claude/rules/crash-recovery.md` §14.4 discarding work whose exit criteria never
     ran, which is throwaway by design.
   - `unpromoted-dispatch-audit.cjs` (Stop / SessionStart / UserPromptSubmit) refuses to let a turn END with a completed
     dispatch unpromoted, and reports residue at session start. This is the gate that covers `/sdlc-loop`, where no
     operator watches any individual iteration.

   Escape hatches: `CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1` (operator-explicit; destroys completed work — document rationale
   in SRS §10 Changelog), `CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1` (crash-recovery discard when the journal entry is
   already gone), `CLAUDE_SKIP_PROMOTION_AUDIT=1`.

   **Why this needs hooks even though the prose was already right.** Rule 1 ships the worktree-*create* command
   verbatim, and rule 7 ships the teardown commands verbatim — and the Bash guard explicitly *permits* those teardown
   targets. Promotion, the step between them, was prose. A step described in prose, sitting between two steps shipped
   as commands, is the step that gets skipped. And the consequence here is more severe than an unmerged branch: a
   **detached** worktree has no ref, so the moment `git worktree remove --force` runs its commits are unreachable —
   there is no branch name to recover from and no reflog entry to find. The kit's own recoverability story (the
   `finalization` marker + `dispatch-journal-gc.cjs`) only proves that *a* finalization commit exists; it cannot
   reconstruct content that was never ingested.
   **Ingestion vs git-merge.** The TL's `plan-proposal/` tree is **consumed via ingestion**, not git-merged: the Orchestrator reads the proposal, writes new files into `docs/plan/` from its main-repo cwd (the `master-plan-write-guard.cjs` hook allows by default; only `.worktrees/...` writes to `docs/plan/` are blocked), then **deletes** `plan-proposal/` along with the worktree at cleanup (rule 7). The proposal tree never lands on main. Same principle for any other transient handoff artifact (e.g., per-agent `plan-update.json`).

6. **Promotion order:** Designer's `docs/uiux/handoffs/<task-id>.md` and BA's `docs/uiux/completeness-reports/<task-id>.md`
   are promoted to main before FE Dev starts (logically enforced by the design lifecycle gate). For BE+FE features, BE Dev artifacts are promoted
   before FE Dev so the API contract is on main when FE starts.
7. **Cleanup is the Orchestrator's responsibility once the task closes — and it runs LAST, only after rule 5's
   verification passes.** The order is: validate exit criteria → ingest the `artifacts` manifest → apply the
   `docs/plan/` transition → ONE finalization commit containing both → write the `finalization` marker → **verify all
   three facts** → remove the worktree → delete the journal entry. Use the `git worktree remove --force` command
   only for paths listed by `git worktree list --porcelain`. For a logical-role handoff-only directory, use
   `rm -rf -- .worktrees/<role>-<task-id>/`. Then remove the matching journal with
   `rm -- .claude/dispatch-journal/<role>-<task-id>.json`. The Bash guard permits only these strict cleanup targets,
   and `worktree-promotion-guard.cjs` additionally refuses them while promotion is unproven — because the Bash guard
   permitting a target says the command is *well-formed*, not that it is *safe to run yet*.

### Command scoping for code-writing roles (Bash surface)

Because the Task tool does not accept a per-dispatch `cwd`, every sub-agent inherits the project-root cwd. File-tool source writes are kept in the worktree by `source-code-write-guard.cjs` (which now resolves `..` and exempts only *well-formed* `.worktrees/<role>-<task-id>/` paths). The Bash surface is held to the same discipline by `orchestrator-bash-guard.cjs`, which (via `.claude/hooks/lib/worktree-scope.cjs`) treats a command as worktree-scoped when its cwd is inside a worktree OR it scopes itself there (`cd .worktrees/<role>-<task-id> && …`, `git -C`, `--prefix`, `make -C`). Unscoped builds / installs / mutations run against the shared root tree and are blocked — that is the cross-agent-conflict and source-tree-contamination risk the rule exists to prevent.

**Known limit (honest):** these guards enforce *worktree-scoped*, not *agent-owns-this-specific-worktree*. With no role/task identity in the PreToolUse event and no reliable per-dispatch env propagation to the hook subprocess, the runtime layer cannot stop one agent from writing into another's worktree. Rule 1 above (one agent per worktree, Orchestrator-created) remains the control for that, pending a harness `cwd` parameter on Task.

This eliminates merge conflicts on the plan hierarchy and gives every agent a clean, isolated filesystem.
