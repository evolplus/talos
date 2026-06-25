---
name: sdlc-init
description: Codex-native initializer for Evo Talos. Use when the user asks for /sdlc-init, sdlc-init, initialize the SDLC kit, install the kit into the current project, or update the project's AGENTS.md from the plugin. Runs the plugin script, which auto-detects the active agent tool and chooses Codex or Claude project files.
agents: [orchestrator]
sdlc_phase: bootstrap
owner: Platform Eng
status: active
---

# SDLC Init

## Purpose

Codex plugins do not expose Claude-style slash commands from `commands/`.
This skill is the Codex command shim for `/sdlc-init`.

Use it when the operator asks to initialize or refresh a project with the Evo
Talos kit.

## Invocation

1. Treat the user's message after `sdlc-init` or `/sdlc-init` as arguments.
2. Resolve the plugin root from this skill directory:
   - this file lives at `skills/sdlc-init/SKILL.md`;
   - the plugin root is two directories up.
3. Run the helper:

```sh
node <plugin-root>/scripts/sdlc-init.cjs <arguments>
```

Do not rely on `CLAUDE_PLUGIN_ROOT` in Codex. That variable is for Claude Code
slash commands and may not exist in Codex.

## Supported Arguments

- `--target codex` - override auto-detection and inject `AGENTS.md` only.
- `--target claude` - override auto-detection and write `CLAUDE.md`, `.claude/settings.json`, and `.claude/hooks`.
- `--target both` - override auto-detection and write both Codex and Claude instruction targets.
- `--dry-run` - prints planned changes without writing files.
- `--force-hooks` - allows replacing conflicting Claude hook files.
- `--skip-agents` - skip instruction injection.
- `--skip-settings` - skip Claude settings merge.
- `--skip-hooks` - skip Claude hook copy.
- `--project <path>` - initialize a project root other than the current working directory.

## Behavior

The helper performs project-local changes only:

1. Detects the active agent tool from environment signals first, then project
   markers if needed.
2. In Codex, injects the plugin contract from `rules/CLAUDE.md` into the
   project's `AGENTS.md` inside a managed block.
3. In Claude Code, injects `CLAUDE.md`, merges `.claude/settings.json`, and
   copies `.claude/hooks`.
4. Warns when existing project instruction headings overlap with plugin
   sections.
5. Uses `--target` only as an explicit override for unusual migration or
   dual-tool setups.

After the helper exits:

1. Summarize changed, unchanged, and skipped files.
2. Relay every `WARN` and `ERROR` line.
3. If the helper exits nonzero, stop and tell the operator which file or
   conflict needs attention.
4. Do not rerun with `--force-hooks` unless the operator explicitly supplied
   that flag.

## Recommended Codex Phrases

Operators can invoke this in Codex with natural prompts such as:

- `Run sdlc-init`
- `Run sdlc-init --dry-run`
- `Initialize this project with Evo Talos`
- `Refresh AGENTS.md from the Talos plugin`
