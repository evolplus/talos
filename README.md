# evo-talos Devkit Plugin

End-to-end SDLC orchestration kit for Claude Code and Codex. The plugin packages role agents, slash commands, on-demand skills, operating rules, safer settings, runtime hooks, and Codex-compatible skill metadata so a project can move from requirements to architecture, design, implementation, deployment, and QA with explicit artifacts and gates.

For a visual walkthrough, open the static guide:

- [Usage guide](https://evolplus.github.io/talos/usage.html) - workflow diagram, entry tracks, design flows, FE/BE framework tracks, QA/deployment tracks, and artifact ownership.

## Token Usage Notice

This kit can consume a large amount of tokens. That is intentional: evo-talos is designed for SDLC governance, artifact traceability, role separation, validation gates, QA evidence, and keeping a project on track rather than for minimal one-shot code edits.

Use it when the cost of coordination mistakes, missing requirements, weak QA, or uncontrolled implementation drift is higher than the cost of extra model usage. For small throwaway changes, a direct Claude Code prompt may be more efficient.

## What This Plugin Does

evo-talos turns Claude Code or Codex from a single coding assistant into a structured SDLC coordinator. It gives the assistant a project-local operating model with:

- Role-based agents for BA, SA, TL, UI/UX Designer, BE Dev, FE Dev, DevOps, QA-Author, QA-Exec, and support roles.
- Claude Code slash commands and Codex command-shim skills for project setup and autonomous SDLC progression.
- Skills that load detailed instructions only when needed, reducing runtime token overhead.
- Hooks that guard privacy, plan consistency, SRS sign-off, source-code writes, Docker scope, QA evidence, and dependency safety.
- Artifact ownership rules so each role writes only the documents it owns.
- Worktree isolation and `plan-update.json` protocols for parallel execution.

## When To Use It

Use this kit when you want Claude Code to help run a disciplined software delivery flow rather than just edit files. It supports:

- Greenfield projects starting from a PRD or raw requirement document.
- Projects with an existing SRS and per-story/per-FR documentation.
- Requirements stored across a folder of source documents.
- External-source ingestion from systems such as Confluence, Notion, Jira, or SharePoint when connectors are available.
- Brownfield onboarding where code exists but trustworthy SRS/architecture docs do not.
- Figma-first product work where design content needs to feed the SRS.
- Iterative scope changes after sign-off.

## Main Workflow

1. Install or enable the plugin in Claude Code or Codex.
2. Initialize the target project:
   - Claude Code: run `/sdlc-init`.
   - Codex: prompt `Run sdlc-init`.
3. Provide the starting source: PRD, SRS, requirements folder, external source, Figma URL, or existing codebase.
4. Start the loop:
   - Claude Code: run `/sdlc-loop`.
   - Codex: prompt `Start the SDLC loop` or `Run sdlc-loop`.
5. Answer blocking questions only when the kit halts for required human context or approval.
6. Review generated artifacts, deployment reports, and QA reports before accepting completion.

The high-level flow is:

```text
Initialize:
  Claude Code: /sdlc-init
  Codex: Run sdlc-init
Start or continue:
  Claude Code: /sdlc-loop
  Codex: Start the SDLC loop
  -> BA requirements ingestion and SRS sign-off
  -> UI/UX design extraction, mapping, creation, import, revision, or incorporation
  -> SA architecture, ADRs, integration adequacy, and instrumentation contracts
  -> TL task planning
  -> BE/FE implementation
  -> DevOps local deployment
  -> QA-Exec runtime verification
  -> iteration or done
```

## Commands And Codex Skill Entrypoints

Claude Code loads command files from `commands/`, so it exposes `/sdlc-init`
and `/sdlc-loop` as slash commands.

Codex plugins currently use skills and starter prompts rather than plugin
slash-command files. For Codex, the plugin provides equivalent command-shim
skills:

- `sdlc-init` - invoke with `Run sdlc-init`, `Run sdlc-init --dry-run`, or
  `Initialize this project with Evo Talos`.
- `sdlc-loop` - invoke with `Run sdlc-loop`, `Start project`, or
  `Continue the SDLC loop`.

### `/sdlc-init`

Initializes the current project for the kit.

```sh
/sdlc-init
```

Optional flags:

```sh
/sdlc-init --target codex
/sdlc-init --target claude
/sdlc-init --target both
/sdlc-init --dry-run
/sdlc-init --force-hooks
/sdlc-init --skip-agents
/sdlc-init --skip-settings
/sdlc-init --skip-hooks
```

What it does:

- Injects the plugin guidance into the project's `AGENTS.md` inside a managed block by default.
- Warns about overlapping or conflicting headings.
- Skips `.claude/settings.json` and `.claude/hooks` for the default Codex target.
- With `--target claude`, writes `CLAUDE.md`, merges original Claude settings into the project, and mirrors hook scripts into `.claude/hooks`.
- With `--target both`, writes both `AGENTS.md` and `CLAUDE.md`, then applies Claude settings/hooks.

Run `/sdlc-init` again in Claude Code, or prompt `Run sdlc-init` in Codex,
after plugin updates when you want the target project to receive updated kit
guidance.

### `/sdlc-loop`

Runs the SDLC orchestrator loop. It reads current artifacts, dispatches the next eligible role, enforces gates, and advances tasks through the plan when evidence exists.

```sh
/sdlc-loop
```

The loop is intentionally gate-driven. It should halt for unresolved SRS questions, missing design confirmation, external integration adequacy gaps, dependency approval, failed QA, malformed deploy reports, or unsafe operations.

## Supported Tracks

### Requirements Tracks

- Single-document SRS/PRD ingestion.
- Multi-document SRS + per-US/per-FR ingestion.
- External-source ingestion.
- Requirements-folder synthesis.
- Brownfield reverse engineering from source and archaeology reports.
- Augmentation and iteration planning for post-sign-off changes.

### Design Tracks

- `extract` - pre-BA Figma extraction into `docs/requirements/design-extracted/`, including screens, copy, flows, and Flow A design-guideline evidence such as palette, typography, spacing, radius, and component patterns.
- `map` - pre-sign-off Figma to SRS mapping.
- `create` - agent-authored Figma screens for approved Design-Flow B/C work.
- `import` - read existing pinned Figma nodes and produce kit handoff artifacts.
- `revise` - fix BA design-completeness findings.
- `incorporate` - absorb human edits made directly in Figma.

Design handoffs include a `Design Element Manifest` so FE Dev must implement every required Figma field, item, label, option, action, and state copy instead of matching only the rough layout.

### Frontend Tracks

FE Dev selects the right coding-standard skill from SRS `Frontend-Framework`, or from brownfield source detection:

- React Native
- ReactJS
- Flutter
- Vue.js
- Angular
- Next.js

### Backend Tracks

Backend work is split into:

- Backend web - request/response API surfaces.
- Backend service - microservice architecture, event-driven workflows, queues, data ownership, and service contracts.

Supported framework standards include:

- TypeScript with Express
- TypeScript with NestJS
- Python with FastAPI
- Java with Spring Boot
- .NET Core C#
- Pure Golang
- Java Core
- Golang with Gin
- Golang with Fiber
- Golang with Echo
- Golang with Kratos

### QA Tracks

- QA-Author `by-us` - functional test cases per User Story.
- QA-Author `by-task` - task-scoped API, structural, e2e, and rare task-functional cases.
- Visual-spec generation for UI tasks.
- QA-Exec runtime verification against the deployed local build, with reports and artifacts under `docs/qa-reports/`.

## Artifact Model

The kit relies on explicit documents rather than hidden state. Common outputs include:

- `docs/SRS.md`
- `docs/user-stories/`
- `docs/frs/`
- `docs/external-integrations/`
- `docs/architecture.md`
- `docs/decisions/`
- `docs/instrumentation-contract.md`
- `docs/uiux/`
- `docs/plan/`
- `docs/test-cases/`
- `docs/deploy-reports/`
- `docs/qa-reports/`
- `docs/open-issues.md`

Each role has ownership boundaries for these artifacts. The hooks and rules are designed to make accidental cross-role edits visible.

## Repository Contents

- `commands/` - Claude Code slash commands, including `/sdlc-loop` and `/sdlc-init`.
- `agents/` - SDLC role agents, non-SDLC helper agents, and templates.
- `skills/` - on-demand SDLC skills, Codex command shims (`sdlc-init`, `sdlc-loop`), and the `evo-devkit-contract` skill converted from the original `CLAUDE.md`.
- `hooks/` - runtime guardrails plus `hooks/hooks.json` wired with `${CLAUDE_PLUGIN_ROOT}`.
- `rules/` - operating rules and the original `CLAUDE.md` preserved as `rules/CLAUDE.md`.
- `settings/` - original project-local Claude settings used by `/sdlc-init`.
- `scripts/` - command helpers, including the idempotent `/sdlc-init` injector.
- `docs/` - static plugin documentation, including [the usage guide](docs/usage.html).
- `.claude-plugin/plugin.json` - Claude Code plugin manifest.
- `.claude-plugin/marketplace.json` - Claude Code marketplace catalog that makes the plugin discoverable and installable.
- `.codex-plugin/plugin.json` - Codex plugin manifest.
- `.agents/plugins/marketplace.json` - Codex marketplace catalog at the repository root.

## Marketplace Installation

This repository includes both Claude Code and Codex marketplace/plugin manifests.

### Claude Code

```text
.claude-plugin/marketplace.json
```

To register the GitHub repository as a marketplace:

```sh
claude plugin marketplace add https://github.com/evolplus/talos
```

After the marketplace is added, Claude Code can discover and install the `talos` plugin from that catalog.

Then open the target project in Claude Code and run:

```sh
/sdlc-init
/sdlc-loop
```

### Codex

Codex compatibility is provided by:

```text
.codex-plugin/plugin.json
.agents/plugins/marketplace.json
```

To register the GitHub repository as a Codex marketplace:

```sh
codex plugin marketplace add https://github.com/evolplus/talos --sparse .agents --sparse plugin
```

Then install the plugin from that marketplace:

```sh
codex plugin add talos@evo-talos
```

Start a new Codex thread after installing so Codex loads the plugin skills.

In that new Codex thread, use prompt-based entrypoints:

```text
Run sdlc-init
Start the SDLC loop
```

## Validate

Run validation before publishing or after changing commands, agents, skills, hooks, or rules:

```sh
claude plugin validate --strict plugin
bash plugin/hooks/tests/test-hooks.sh
bash plugin/hooks/tests/test-security-audit.sh
bash plugin/hooks/tests/test-dependency-verifier.sh
```

For Codex compatibility, run the `plugin-creator` validator against `plugin/` from the plugin-creator tooling checkout.

`test-dependency-verifier.sh` starts a local mock HTTP server on port `9472`. In restricted sandboxes, it may need permission to bind that local port.

## License

This plugin is licensed under Apache-2.0. Keep the license and copyright notices when redistributing copies or modified versions.
