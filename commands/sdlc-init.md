---
description: Initialize the current project with the Evo Talos SDLC AGENTS.md contract by default, or Claude Code project files when --target claude is supplied.
argument-hint: "[--target codex|claude|both] [--dry-run] [--force-hooks] [--skip-agents] [--skip-settings] [--skip-hooks]"
---

Initialize the current project with the Evo Talos SDLC devkit plugin content.

Arguments: `$ARGUMENTS`

Run the plugin initializer helper and pass `$ARGUMENTS` through exactly.

Preferred command:

```sh
node "$CLAUDE_PLUGIN_ROOT/scripts/sdlc-init.cjs" $ARGUMENTS
```

If `CLAUDE_PLUGIN_ROOT` is unavailable or the helper cannot be found there, locate this plugin directory by finding `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json` with `"name": "talos"`, then run:

```sh
node "<plugin-root>/scripts/sdlc-init.cjs" $ARGUMENTS
```

The helper performs these project-local changes:

1. By default, injects `rules/CLAUDE.md` into the project's `AGENTS.md` inside a managed block for Codex.
2. Warns when existing project instruction headings overlap with plugin sections.
3. Skips `.claude/settings.json` and `.claude/hooks` in the default Codex target.
4. When invoked with `--target claude`, injects `CLAUDE.md`, merges `settings/original-settings.json` into `.claude/settings.json`, and copies hook scripts into `.claude/hooks`.
5. When invoked with `--target both`, writes both `AGENTS.md` and `CLAUDE.md`, then applies the Claude settings/hooks.

After the helper finishes, summarize the changed files and relay every `WARN` and `ERROR` line. If the helper exits nonzero, stop and tell the user which file or conflict needs attention. Do not rerun with `--force-hooks` unless the user explicitly supplied that flag.
