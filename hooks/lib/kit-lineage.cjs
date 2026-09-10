#!/usr/bin/env node
// lib/kit-lineage.cjs
//
// Which integration model does the project under CLAUDE_PROJECT_DIR use?
//
// Two kit lineages exist with MUTUALLY EXCLUSIVE integration models:
//
//   branch-merge — code roles work on `agent/<role>/<task-id>`; the Orchestrator
//                  integrates with `git merge --no-ff` and verifies containment.
//   ingestion    — code roles work in a DETACHED worktree; the Orchestrator
//                  integrates by path-scoped file ingestion, and `git merge` /
//                  `cherry-pick` / `push` of agent history is forbidden outright.
//
// They cannot both be enforced in one project. An ingestion kit's
// `local-worktree-git-guard.cjs` blocks `git merge agent/...`, which is exactly
// the branch-merge kit's mandated closure step — so a co-installed pair leaves
// every code-role dispatch with no legal way to close. That is not a tidiness
// problem; it is an unexecutable pipeline.
//
// This helper lets a lineage-specific guard STAND DOWN when it is running
// against a project that declares the other lineage, rather than enforcing a
// model the project does not use. Guards that are lineage-neutral (privacy,
// source layout, plan schema) should ignore this entirely.
//
// Detection order:
//   1. CLAUDE_KIT_LINEAGE env var (operator override)
//   2. <project>/.claude/kit-lineage.json  → { "lineage": "..." }
//   3. <project>/kit-lineage.json          → { "lineage": "..." }
//   4. Structural inference: a `.claude/rules/worktree-isolation.md` that
//      mandates `git worktree add --detach` is ingestion; one that mandates
//      `git worktree add -b agent/` is branch-merge.
//   5. null — unknown. Callers MUST treat null as "enforce normally": an
//      unlabelled project is the common case and must not silently lose its
//      guards.

'use strict';

const fs = require('fs');
const path = require('path');

const LINEAGES = new Set(['branch-merge', 'ingestion']);

function projectDir() {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function declaredLineage(root) {
  const base = root || projectDir();

  const env = (process.env.CLAUDE_KIT_LINEAGE || '').trim();
  if (LINEAGES.has(env)) return env;

  for (const rel of [path.join('.claude', 'kit-lineage.json'), 'kit-lineage.json']) {
    const j = readJsonSafe(path.join(base, rel));
    if (j && LINEAGES.has(j.lineage)) return j.lineage;
  }

  for (const rel of [
    path.join('.claude', 'rules', 'worktree-isolation.md'),
    path.join('rules', 'worktree-isolation.md'),
  ]) {
    const txt = readTextSafe(path.join(base, rel));
    if (!txt) continue;
    if (/git worktree add\s+--detach/.test(txt)) return 'ingestion';
    if (/git worktree add\s+-b\s+agent\//.test(txt)) return 'branch-merge';
  }

  return null;
}

// True when a guard belonging to `ownLineage` should stay silent because the
// project explicitly declares the other model. Unknown (null) => enforce.
function shouldStandDown(ownLineage, root) {
  const found = declaredLineage(root);
  if (!found) return false;
  return found !== ownLineage;
}

function standDownNotice(ownLineage, hookName, root) {
  return (
    `${hookName}: standing down — this project declares the ` +
    `"${declaredLineage(root)}" integration lineage, but this guard enforces ` +
    `"${ownLineage}". The two models are mutually exclusive (one integrates by ` +
    `git merge of agent/<role>/<task-id>, the other forbids that and integrates ` +
    `by path-scoped ingestion), so enforcing both leaves a dispatch no legal way ` +
    `to close. Only the declared lineage's guards apply here. Override with ` +
    `CLAUDE_KIT_LINEAGE=<branch-merge|ingestion>.\n`
  );
}

module.exports = { LINEAGES, declaredLineage, projectDir, shouldStandDown, standDownNotice };
