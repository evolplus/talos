#!/usr/bin/env node
// .claude/hooks/docker-scope-guard.cjs
// PreToolUse hook: blocks docker mutations outside the project's scope.
// Enforces the kit's "DevOps only touches its own containers" safety rule.
//
// Scope determination (lookup priority):
//   1. CLAUDE_PROJECT_SLUG env var (operator-explicit)
//   2. COMPOSE_PROJECT_NAME env var (docker-compose-native)
//   3. cwd basename, sanitized to lowercase + alphanumeric + dashes
//
// Refuses (exit 2) the following catastrophic patterns:
//   - `docker {system,volume,network,container,image} prune ...`
//   - `docker rm/stop/kill -f? $(docker ps ...)` and similar shell-substitution patterns
//   - `docker compose -p <other-slug> {down,up,run,restart,rm,kill}`
//   - `docker compose down/up/run/restart` without explicit `-p <slug>` when cwd-basename ≠ slug
//   - `docker stop/rm/kill/restart/pause/unpause <name>` where <name> doesn't start with <slug>-
//   - `docker {volume,network,image} rm <name>` outside slug
//
// Allows (exit 0):
//   - Read operations: ps, inspect, logs, port, stats, top, version, info,
//     network ls / network inspect, volume ls / volume inspect, image ls / image inspect
//   - Mutations scoped to <slug>: `docker compose -p <slug> ...`, `docker stop <slug>-anything`, etc.
//   - Non-docker commands (the hook only inspects when `docker` is in the cmd)
//
// Escape hatch: CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1 permits anything (use sparingly).
// Fail-open: any internal error allows the command with a stderr warning.

'use strict';

const path = require('path');

function sanitizeSlug(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function determineSlug() {
  // 1. Operator-explicit
  if (process.env.CLAUDE_PROJECT_SLUG) {
    return sanitizeSlug(process.env.CLAUDE_PROJECT_SLUG);
  }
  // 2. Compose-native
  if (process.env.COMPOSE_PROJECT_NAME) {
    return sanitizeSlug(process.env.COMPOSE_PROJECT_NAME);
  }
  // 3. cwd basename
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return sanitizeSlug(path.basename(root));
}

// Tokenize a bash-ish command into argv-style tokens. Handles simple quoting;
// does NOT execute the shell. Defensive against pathological inputs.
function tokenize(cmd) {
  if (typeof cmd !== 'string') return [];
  // Strip leading `sudo` / `time` etc. wrappers — they don't change the semantics
  // for our purposes (and shouldn't be present anyway; permissions deny sudo).
  // Naive split on whitespace, respecting single + double quotes.
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (/\s/.test(c)) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// True read-only docker subcommands (after `docker`).
const READ_ONLY_SUBCMDS = new Set([
  'ps', 'inspect', 'logs', 'port', 'top', 'stats', 'version', 'info', 'events',
  'history', 'diff', 'wait', 'search', 'context', 'login', 'logout',
]);
// Read-only second-level subcommands per resource (e.g., `docker network ls`).
const READ_ONLY_BY_RESOURCE = {
  network: new Set(['ls', 'list', 'inspect']),
  volume:  new Set(['ls', 'list', 'inspect']),
  image:   new Set(['ls', 'list', 'inspect', 'history', 'pull', 'tag', 'save']),
  container: new Set(['ls', 'list', 'inspect', 'logs', 'port', 'top', 'stats', 'diff', 'wait', 'export']),
  system:  new Set(['info', 'df', 'events']),
  builder: new Set(['ls']),
  context: new Set(['ls', 'inspect', 'show']),
};
// Catastrophic patterns — refused unconditionally.
const CATASTROPHIC = [
  /\bdocker\s+system\s+prune\b/i,
  /\bdocker\s+volume\s+prune\b/i,
  /\bdocker\s+network\s+prune\b/i,
  /\bdocker\s+container\s+prune\b/i,
  /\bdocker\s+image\s+prune\b/i,
  /\bdocker\s+(rm|stop|kill|restart|pause|unpause)\b[^$]*\$\(\s*docker\s+ps\b/i,
  /\bdocker\s+(rm|stop|kill|restart)\b.*--all\b/i,
  /\bdocker\s+(rm|stop|kill|restart)\b.*-a\b(?!\s*$)/i, // -a flag — affects all
];
// Mutation verbs (single-arg form: docker stop NAME)
const MUTATION_VERBS = new Set([
  'stop', 'kill', 'rm', 'restart', 'pause', 'unpause', 'rename', 'update', 'commit',
  'cp', 'exec', 'attach', 'start',  // start is technically idempotent but still a mutation
]);
// Resource-level mutations: docker {network,volume,image} rm NAME
const RESOURCE_MUTATIONS = {
  network: new Set(['rm', 'remove', 'create', 'connect', 'disconnect']),
  volume:  new Set(['rm', 'remove', 'create']),
  image:   new Set(['rm', 'rmi', 'remove', 'push', 'tag']),
  container: new Set(['rm', 'stop', 'kill', 'restart', 'pause', 'unpause', 'rename', 'update', 'exec', 'create', 'start']),
};
// Compose mutation verbs
const COMPOSE_MUTATION_VERBS = new Set([
  'up', 'down', 'run', 'restart', 'stop', 'kill', 'rm', 'pause', 'unpause',
  'build', 'pull', 'push', 'start', 'create', 'cp', 'exec',
]);

function checkDockerCommand(cmd, slug) {
  // Quick path: catastrophic regexes
  for (const rx of CATASTROPHIC) {
    if (rx.test(cmd)) {
      return { allow: false, reason: `catastrophic-pattern`, detail: `Matches ${rx.source}` };
    }
  }

  // Tokenize for finer analysis
  const tokens = tokenize(cmd);
  // Find the position of `docker` (commands may be prefixed by env var assignments like FOO=bar docker ...)
  let dockerIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'docker') { dockerIdx = i; break; }
  }
  if (dockerIdx === -1) return { allow: true }; // Not actually invoking docker — pass

  const args = tokens.slice(dockerIdx + 1);
  if (args.length === 0) return { allow: true };  // bare `docker` — show help, harmless
  if (args[0].startsWith('-')) {
    // global flags before subcommand — skip them
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) i++;
    args.splice(0, i);
    if (args.length === 0) return { allow: true };
  }

  const sub = args[0];

  // `docker compose ...`
  if (sub === 'compose') {
    return checkCompose(args.slice(1), slug);
  }

  // Read-only top-level subcommands
  if (READ_ONLY_SUBCMDS.has(sub)) return { allow: true };

  // Resource-prefixed forms: `docker network ls`, `docker volume rm X`
  if (args.length >= 2 && READ_ONLY_BY_RESOURCE[sub] && READ_ONLY_BY_RESOURCE[sub].has(args[1])) {
    return { allow: true };
  }
  if (RESOURCE_MUTATIONS[sub] && RESOURCE_MUTATIONS[sub].has(args[1])) {
    // e.g., docker volume rm foo — check target name(s) against slug
    return checkResourceMutation(sub, args.slice(1), slug);
  }

  // Single-verb mutation: docker stop foo, docker rm bar, etc.
  if (MUTATION_VERBS.has(sub)) {
    return checkMutationTargets(sub, args.slice(1), slug);
  }

  // Build / load / save / push / pull — let through (writes to local image cache, not running containers)
  if (['build', 'buildx', 'load', 'save', 'pull', 'push', 'tag'].includes(sub)) {
    return { allow: true };
  }

  // Unknown — be permissive (hook is opinionated about the dangerous cases, not gatekeeping all of docker)
  return { allow: true };
}

function checkCompose(args, slug) {
  // Look for `-p <slug>` or `--project-name=<slug>`
  let projectName = null;
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-p' || a === '--project-name') {
      projectName = args[i + 1] || null;
      i += 2; continue;
    }
    if (a.startsWith('--project-name=')) {
      projectName = a.slice('--project-name='.length);
      i++; continue;
    }
    if (a.startsWith('-p=')) {
      projectName = a.slice('-p='.length);
      i++; continue;
    }
    // Subcommand or other arg — stop scanning flags
    if (!a.startsWith('-')) break;
    i++;
  }

  // Find the compose subcommand (first non-flag after flag-scan)
  let composeSub = null;
  for (let j = i; j < args.length; j++) {
    if (!args[j].startsWith('-')) { composeSub = args[j]; break; }
  }

  if (!composeSub) return { allow: true }; // bare `docker compose` — help

  // Reads through compose
  if (composeSub === 'ps' || composeSub === 'logs' || composeSub === 'top' ||
      composeSub === 'port' || composeSub === 'config' || composeSub === 'images' ||
      composeSub === 'version' || composeSub === 'ls') {
    return { allow: true };
  }

  if (!COMPOSE_MUTATION_VERBS.has(composeSub)) {
    // Unknown compose subcommand — be permissive
    return { allow: true };
  }

  // Mutation. Project must be the kit's slug.
  const effectiveProject = sanitizeSlug(projectName || ''); // empty = compose will default to cwd basename
  if (!projectName) {
    return {
      allow: false,
      reason: 'compose-mutation-without-explicit-project',
      detail: `\`docker compose ${composeSub}\` without explicit -p flag. The kit requires \`-p ${slug}\` to scope mutations to the project's containers. Defaulting to cwd basename is risky — if the operator runs the kit from a parent directory, the wrong project name is inferred.`,
    };
  }
  if (effectiveProject !== slug) {
    return {
      allow: false,
      reason: 'compose-mutation-on-other-project',
      detail: `\`docker compose -p ${projectName} ${composeSub}\` targets project "${effectiveProject}" but the kit's project slug is "${slug}". Mutating another project is forbidden.`,
    };
  }
  return { allow: true };
}

function checkMutationTargets(verb, restArgs, slug) {
  // Filter out flags; keep positional container names/IDs.
  const targets = [];
  let i = 0;
  while (i < restArgs.length) {
    const a = restArgs[i];
    if (a.startsWith('--')) {
      // long flag, possibly with value via space — peek
      if (!a.includes('=') && i + 1 < restArgs.length && !restArgs[i + 1].startsWith('-')) {
        i += 2; continue;
      }
      i++; continue;
    }
    if (a.startsWith('-')) {
      // short flag; treat as boolean
      i++; continue;
    }
    targets.push(a);
    i++;
  }

  if (targets.length === 0) {
    // e.g., `docker stop` with no targets — invalid anyway, but not our concern
    return { allow: true };
  }

  // Allow if EVERY target starts with `${slug}-` (Compose default naming)
  // or if EVERY target is a container ID prefix (12-hex). Hex-only is permissive
  // — a sub-agent that obtains a container ID could in theory target anything,
  // but the kit's discipline (Hard Rule) covers that; runtime hook focuses on
  // the obvious naming-based cases.
  const isHex = /^[0-9a-f]{6,64}$/i;
  const violators = targets.filter(t => !t.startsWith(`${slug}-`) && !isHex.test(t));
  if (violators.length > 0) {
    return {
      allow: false,
      reason: 'mutation-on-non-scoped-container',
      detail: `\`docker ${verb} ${violators.join(' ')}\` — these container name(s) don't start with the project slug "${slug}-". Out-of-scope mutations are forbidden.`,
    };
  }
  return { allow: true };
}

function checkResourceMutation(resource, restArgs, slug) {
  // restArgs[0] is the verb (rm, create, etc.); rest are names + flags
  const verb = restArgs[0];
  const tail = restArgs.slice(1);

  // For `create` — allowed; the kit creates project-scoped volumes/networks
  // (with `-p <slug>` via compose). Standalone create is OK.
  if (verb === 'create' || verb === 'connect' || verb === 'disconnect') return { allow: true };

  // rm / remove — check names
  if (verb === 'rm' || verb === 'remove' || verb === 'rmi') {
    const targets = tail.filter(t => !t.startsWith('-'));
    if (targets.length === 0) return { allow: true };
    const violators = targets.filter(t => !t.startsWith(`${slug}_`) && !t.startsWith(`${slug}-`));
    if (violators.length > 0) {
      return {
        allow: false,
        reason: 'resource-mutation-on-non-scoped',
        detail: `\`docker ${resource} ${verb} ${violators.join(' ')}\` — name(s) don't start with project slug "${slug}". Out-of-scope ${resource} mutations are forbidden.`,
      };
    }
  }
  return { allow: true };
}

async function main() {
  // Escape hatch
  if (process.env.CLAUDE_SKIP_DOCKER_SCOPE_CHECK === '1') {
    process.stderr.write('docker-scope-guard: CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1 — bypass active.\n');
    process.exit(0);
  }

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`docker-scope-guard: malformed event JSON: ${e.message} — failing open\n`);
    process.exit(0);
  }

  if ((event.tool_name || '') !== 'Bash') process.exit(0);

  const cmd = (event.tool_input && event.tool_input.command) || '';
  if (!/\bdocker\b/.test(cmd)) process.exit(0);

  const slug = determineSlug();
  if (!slug) {
    process.stderr.write(
      'docker-scope-guard: could not determine project slug ' +
      '(CLAUDE_PROJECT_SLUG / COMPOSE_PROJECT_NAME / cwd basename all empty). Failing open.\n'
    );
    process.exit(0);
  }

  const result = checkDockerCommand(cmd, slug);
  if (result.allow) process.exit(0);

  process.stderr.write(
    `docker-scope-guard: BLOCKED — ${result.reason}\n` +
    `  Command: ${cmd.length > 200 ? cmd.slice(0, 200) + '...' : cmd}\n` +
    `  Project slug: ${slug}\n` +
    `  Detail: ${result.detail}\n\n` +
    `  Per CLAUDE.md §10 + .claude/skills/local-deployment/SKILL.md §Project-scoped\n` +
    `  container discipline: DevOps mutations are scoped to the project's containers.\n` +
    `  Out-of-scope mutations + globally-destructive ops (system/volume/network/image\n` +
    `  prune, $(docker ps -q) variants) are unconditionally forbidden.\n\n` +
    `  If you need to inspect / read state of another project's containers (port-conflict\n` +
    `  detection, etc.), use read-only ops: \`docker ps\`, \`docker inspect <name>\`,\n` +
    `  \`docker logs <name>\`, \`docker port <name>\`, \`docker network ls\`, etc.\n\n` +
    `  If a port conflict is the issue: pick a different port via the local-deployment\n` +
    `  skill's probe procedure — never stop the other project's container.\n\n` +
    `  Escape hatch (operator override; document rationale):\n` +
    `    export CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `docker-scope-guard: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
