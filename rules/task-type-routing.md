# Task Type Routing

This file holds CLAUDE.md §11. Section number is preserved across files for cross-referencing.

For workflow contract entry-point, see `CLAUDE.md`. The Orchestrator consults this rule **before** the §9 numbered sequence on every invocation.

---

## 11. Task Type Routing

User requests don't all map to the SDLC pipeline. Some are investigations, debug triage, cold code reviews, or direct skill invocations that don't produce shipping code. This rule classifies a request and selects the matching path.

The default is the SDLC pipeline. Non-default paths exist for genuine non-implementation work and have gates that prevent them from being used to bypass the SDLC.

### When the Orchestrator consults this rule

On every invocation, before reading `docs/SRS.md`. The classification decides which §9 step applies (or whether §9 applies at all).

### Path A — SDLC pipeline (default)

Work that produces shipped behavior: features, capability additions, migrations, breaking changes — anything that needs a SRS requirement.

| | |
|---|---|
| **Triggers (verbs)** | build, implement, ship, add, deliver, integrate, migrate, refactor-with-behavior-change |
| **Path** | BA → (SA + QA-Author parallel) → TL → Dev → DevOps → QA-Exec |
| **Source of truth** | `docs/SRS.md` |
| **Output** | Shipping code, test cases, deploy report |
| **Gates** | All §10 hard rules apply: SRS signed-off, open-issues triaged, contract frozen for FE start, design-confirmed for UI implementation |

### Path B — Non-SDLC paths

Work that produces a document, not shipping code. The kit hosts these via dedicated agents under `.claude/agents/_non-sdlc/`. Researcher (B1), debugger (B2), code-reviewer (B3), and oq-resolver (B4) are all in place. The Orchestrator dispatches the matching agent per the user request shape; code-reviewer additionally requires a declared lens (see its agent file); oq-resolver always re-enters via BA for SRS recording.

#### B1 — Research / RFC / exploration

| | |
|---|---|
| **Triggers** | investigate, explore, evaluate, research, RFC, what-if, vendor-comparison, prototype-without-shipping |
| **Path** | `.claude/agents/_non-sdlc/researcher.md` — read-only repo + web |
| **Output** | `docs/research-reports/<topic>.md` |
| **Gate** | If the report identifies feature work to ship, the work re-enters via Path A. Researcher never produces shipping code. |

#### B2 — Bug triage / debugging

| | |
|---|---|
| **Triggers — explicit verbs** | debug, triage, diagnose, reproduce, root-cause, regression-hunt, investigate this error / bug / failure |
| **Triggers — issue-language phrasings (broader)** | "X is broken", "X isn't working", "X is failing", "X returns errors", "I'm getting <error code/message>", "something's wrong with X", "X doesn't work", "production issue", "deployed env failing", "the API is down", "tests are red", "CI is broken", "this is throwing", "fix this error" |
| **Path** | `.claude/agents/_non-sdlc/debugger.md` — read-only code + logs + deployed env (Docker, per DevOps's deploy report) |
| **Output** | `docs/debug-reports/<incident>.md` |
| **Gate** | The debugger diagnoses; it does not apply non-trivial fixes. See "Trivial-fix exemption" below for the only carve-out. **The debugger MUST read `docs/deploy-reports/<task-id>.md` and reproduce against the deployed Docker environment — never builds or runs on the host.** |

**Default routing rule for ambiguous issue language.** When the user's request contains ANY issue indicator (error, broken, failing, doesn't work, returns errors, fails, exception, crashes, slow, timeout, hangs) AND the request is NOT explicitly a feature add ("build", "implement", "add Y"), the Orchestrator MUST classify as **Path B2**. Common operator phrasings the kit treats as B2:

| Operator says... | Classification |
|---|---|
| "the API is returning 500s" | Path B2 (debug — symptom described) |
| "tests are red after the last merge" | Path B2 (debug — regression hunt) |
| "deploy is failing" | Path B2 (debug — deploy log analysis) |
| "this endpoint hangs on prod" | Path B2 (debug — production incident) |
| "why is X slow / broken / not working" | Path B2 (debug — root-cause request) |
| "I'm getting `ECONNRESET` from service Y" | Path B2 (debug — error message) |
| "**add** support for X" | Path A (SDLC — feature add) |
| "**implement** the new endpoint" | Path A (SDLC) |
| "**build** Y" | Path A (SDLC) |

**Orchestrator-inline debug is forbidden.** When issue language is detected, the Orchestrator MUST dispatch the debugger agent (`subagent_type: debugger`) — not "handle it inline" by reading the codebase and proposing fixes. The original incident pattern that drives this rule: user said "the API is broken", Orchestrator (default-mode reasoning) read the code, tried `npm install && npm run build` on the host, missed the deploy report entirely, never reproduced the actual symptom. The debugger agent's procedure starts at the deployed environment, not the source code.

#### B3 — Cold code review

| | |
|---|---|
| **Triggers** | review, audit-this-code, check-for-X, scan-for-Y, sanity-check |
| **Path** | `.claude/agents/_non-sdlc/code-reviewer.md` — read-only code + repo (lens-driven) |
| **Output** | `docs/code-reviews/<scope>.md` |
| **Gate** | Findings either re-enter via Path A (non-trivial scope) or land as a `qa` or `infra`-track task in master-plan (trivial scope). Code-reviewer never modifies code. |

#### B4 — Open Question resolution

| | |
|---|---|
| **Triggers** | resolve OQ, propose options, help me decide, options for, what should we pick, resolve open questions |
| **Path** | `.claude/agents/_non-sdlc/oq-resolver.md` — read repo + web; produces multi-choice options for user decision |
| **Output** | `docs/oq-resolutions/<OQ-id>.md` (one file per resolved OQ) |
| **Gate** | Resolver proposes 2–3 options; user picks; BA records the choice into the SRS. Resolver never modifies SRS; never decides. Re-entry to BA is mandatory for every resolved OQ. |

#### B5 — Codebase archaeology (brownfield onboarding Stage 1)

| | |
|---|---|
| **Triggers** | onboard kit to existing project, reverse-engineer codebase, document as-built system, brownfield ingestion, "what does this code do", "we have N years of code with no SRS" |
| **Path** | `.claude/agents/_non-sdlc/codebase-archaeologist.md` — read-only sweep across code + git history + deployed env + existing non-kit docs |
| **Output** | `docs/archaeology-reports/<topic-slug>.md` (one per dispatch; multi-service projects may have multiple) |
| **Gate** | Report is informational ONLY. NOT a kit-canonical artifact. SA's `extract` mode and BA's `reverse-engineer-from-code` Ingestion Mode (Mode E) consume the report at Stages 2–3 of `.claude/rules/brownfield-onboarding.md` §12. Confirmation by humans at Stage 4 is what produces canonical artifacts. |

### Path C — Direct skill invocation

Some requests match a single skill's documented scope and need no agent dispatch. The Orchestrator invokes the skill directly; output goes to the skill-defined location.

Examples (existing skills):

| Request shape | Skill |
|---|---|
| "Write a release note for sprint X" | `gpp-release-note` |
| "Audit GPP runbook structure" | `gpp-document-creator` |

Direct invocation is appropriate when **all three** apply:

1. The request matches a skill's description trigger
2. The work is fully contained within the skill's documented scope
3. The output does not introduce new shipping requirements (SRS, architecture, master-plan)

If any of these breaks down, route to Path A instead.

### Path D — Out-of-kit / inline

**Strictly read-only work.** Q&A, status checks, classification, planning thoughts. The Orchestrator may answer the user from the state it has read; it MUST NOT mutate anything.

What Path D explicitly does NOT permit:

- **NO writes to the codebase or any project file.** Any Write/Edit/MultiEdit/NotebookEdit outside the Orchestrator allow-list (`docs/plan/`, `docs/open-issues.md`, `docs/iteration-plan/`, `.claude/**`, `CLAUDE.md`, `RELEASE-NOTES*.md`, `.gitignore`, `.gitattributes`) is refused by `orchestrator-write-guard.cjs`. Source-code writes (`**/src/`, `e2e/**/*.spec.*`, project-declared custom dirs) additionally refused by `source-code-write-guard.cjs`. Code changes — even one-liner typo fixes — route through Path A (SDLC) or the Path B2 trivial-fix exemption flow.
- **NO state-mutating Bash.** Any package installer, docker compose mutation, DB DML/DDL, HTTP mutation (curl POST/PUT/DELETE, etc.), FS destructive op, `sed -i`, redirect to source/docs/env/config paths, git push/reset/rebase, chmod, build command, or service mutation is refused by `orchestrator-bash-guard.cjs` when run from main-repo cwd. Deploy + build + integration work routes to DevOps / BE Dev / FE Dev / QA-Exec.
- **NO modifications to local deployment.** Containers stay as DevOps configured them; database state stays as the seed/migration left it; HTTP services are queried via read methods only (GET / HEAD / OPTIONS).

What Path D DOES permit:

- Read-only Bash (`ls`, `cat`, `grep`, `find`, `git status/log/diff/show/branch`, `docker ps/inspect/logs/port/stats`, plus `git commit/add/init/worktree add` for Orchestrator-legitimate master-plan ingestion per §9).
- Q&A about the codebase ("which file holds X?", "what does Y do?", "explain the architecture diagram").
- Recommendations + classifications + planning thoughts that don't write anywhere.

If the request requires any write or any state-mutating Bash, it is not Path D — classify as Path A (SDLC for shipping code), Path B1–B5 (research / debug / review / OQ / archaeology), or Path C (skill invocation).

The Orchestrator handles these inline. Pattern repetition is the signal: if the same Path D request shape comes up three times, it's a candidate for a new skill (move to Path C) or a new agent (move to Path B).

**What Path D is NOT:** an excuse for the Orchestrator to "just fix this one line." The original incident pattern (operator types "fix the bug in `src/X.ts`" → Orchestrator runs Edit directly → no BA spec update, no TL task, no QA test) is exactly what Path D is NOT. Even single-line source-code fixes route through Path A or the Path B2 trivial-fix exemption (debugger files a task → Orchestrator dispatches Dev → Dev makes the edit in their worktree → QA-Exec verifies). The source-code-write-guard hook + escape-hatch flow (CLAUDE_ALLOW_ORCHESTRATOR_CODE=1, rationale in SRS §10 Changelog) is the only operator-explicit way to bypass; use sparingly and document.

### Decision tree

```
Is the user requesting...
├── Code that ships?                          → A. SDLC pipeline
├── A document / report / analysis?
│   ├── Investigation / RFC?                  → B1. researcher
│   ├── Bug triage / root-cause analysis?     → B2. debugger
│   ├── Cold code review?                     → B3. code-reviewer
│   ├── Resolve SRS open question?            → B4. oq-resolver
│   └── Codebase archaeology (brownfield)?    → B5. codebase-archaeologist
├── Output matching a registered skill?       → C. direct skill invocation
└── Trivial / one-off / Q&A?                  → D. inline
```

When in doubt, default to Path A. Mis-routing toward more rigor is recoverable; mis-routing away from rigor lets feature creep past the SDLC gate.

### Trivial-fix exemption (Path B2 → master-plan → Dev)

The only carve-out where a non-SDLC path lands code: a B2 debugger report identifies a fix that meets **all four**:

1. Single-line or single-method change
2. Single file
3. No observable behavior change beyond the bug fix itself
4. No SRS requirement is implicated by the fix

In that case, the debugger files the fix as a task in master-plan with the appropriate track tag (typically `be` or `fe`); the Orchestrator dispatches the relevant Dev for the patch and QA-Exec for verification. The SRS / BA step is the only gate exempted; every other gate (open-issues, master-plan, QA-Exec pass) still applies.

**Important: the Orchestrator NEVER makes the edit itself**, even for trivial single-line fixes. The flow is always: debugger files master-plan task → Orchestrator dispatches Dev → Dev edits in worktree → commit → plan-update.json → QA-Exec runs. This preserves: traceability (the change has a task ID), commit ownership (Dev's identity in `git log`), test coverage (QA-Exec verifies), and audit (the SDLC chain stays intact). The `source-code-write-guard.cjs` hook refuses Orchestrator-direct writes to source paths; treat this as a feature, not a friction point.

If even one of the four conditions fails, the fix re-enters via Path A (full SDLC: BA augments SRS → SA reviews architecture impact → TL files task → Dev → QA).

### Re-entry flow (B → A)

Whenever a Path B output identifies feature work, the flow is:

1. The B-path agent's report names the proposed scope
2. The Orchestrator dispatches BA with the report as input
3. BA augments / authors the relevant SRS section, runs sign-off
4. From SRS `Signed-off`, normal Path A resumes

The B-path report becomes an input to BA's ingestion, not a substitute for it.

### Hard rules

- Non-SDLC paths (B1, B2, B3, B5) cannot produce shipping code. Trivial-fix exemption above is the only carve-out and applies only to B2. B5 cannot produce canonical kit artifacts (SRS / architecture / master-plan); SA's `extract` mode and BA's Mode E do that downstream via the brownfield-onboarding flow (§12).
- Direct skill invocation (C) cannot introduce new shipping requirements. If it would, route to A instead.
- Path classification happens before §9 step 1. The Orchestrator must decide which path applies before invoking the SDLC gates.
- "Treat everything as SDLC" is allowed and safe; "treat anything as non-SDLC to skip the gates" is not.
- A B-path report whose findings would land code without re-entering A is a kit violation — flag it explicitly and require the operator to confirm scope.

### References

- `.claude/rules/orchestrator-operating-rules.md` §9 — Orchestrator Operating Rules (consults this rule on each invocation)
- `.claude/rules/sub-agent-registry.md` §3a — Sub-Agent Registry (SDLC agents + researcher + debugger + code-reviewer + oq-resolver all live)
- `.claude/skills/registry.md` — skill discovery for Path C
- CLAUDE.md §10 — Hard Rules
