#!/usr/bin/env node
// .claude/hooks/session-init-summary.cjs
// SessionStart hook: prints a brief project-state summary to stdout.
// stdout is captured by Claude Code as additional session context, so the
// Orchestrator sees this on every session start, resume, clear, or compact.
//
// Pure read — never blocks. Best-effort parsing; explicit caveats where the
// kit doesn't pin docs/plan/master-plan.md format precisely.
//
// All file content is passed through strip-fences before regex matching so
// example/reference content inside ``` fenced blocks is ignored.
//
// Reads only the top docs/plan/master-plan.md — never traverses into phase
// or task files. The top file is the project shape; agents and the
// orchestrator load phase/task files on demand for the dispatch they're
// processing.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function readSafe(rel) {
  // Read file and strip fenced code blocks before returning. Every consumer
  // of this function parses kit-format markdown and should treat fenced
  // content as documentation, not data.
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  try {
    return stripFencedCodeBlocks(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function summarizeAgentDrift() {
  // Detect when SRS hash differs from agent files' Generated-From-SRS-Hash.
  // Operator sees at every session start whether agents are up-to-date with SRS.
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');

  const srsPath = path.join(ROOT, 'docs/SRS.md');
  if (!fs.existsSync(srsPath)) return null;  // No SRS, nothing to compare

  let srsHash;
  try {
    srsHash = crypto.createHash('sha256').update(fs.readFileSync(srsPath)).digest('hex').slice(0, 12);
  } catch {
    return null;
  }

  // Walk .claude/agents/<role>.md (top-level only — skip _meta, _non-sdlc, _templates)
  const agentsDir = path.join(ROOT, '.claude/agents');
  if (!fs.existsSync(agentsDir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const agentFiles = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => path.join(agentsDir, e.name));

  if (agentFiles.length === 0) {
    return 'Agent files: none yet — first dispatch will bootstrap';
  }

  // Read each agent file's Generated-From-SRS-Hash
  const hashes = [];
  for (const f of agentFiles) {
    try {
      const content = fs.readFileSync(f, 'utf8').slice(0, 2000);
      const m = content.match(/Generated-From-SRS-Hash:\s*(\S+)/);
      if (m) hashes.push({ file: path.basename(f), hash: m[1].slice(0, 12) });
    } catch {}
  }
  if (hashes.length === 0) {
    return 'Agent files: present but no Generated-From-SRS-Hash header found';
  }

  // Check drift: any agent file's hash != current SRS hash?
  const drifted = hashes.filter(h => h.hash !== srsHash && h.hash !== 'bootstrap');
  if (drifted.length === 0) {
    return `Agent files: in sync with SRS (${srsHash})`;
  }
  // Some agent files at the bootstrap hash — that's expected pre-first-signoff; not drift
  const bootstrapOnly = hashes.every(h => h.hash === 'bootstrap');
  if (bootstrapOnly) {
    return `Agent files: bootstrap state — first SRS sign-off will trigger initial generation`;
  }
  return `⚠ Agent files DRIFTED — ${drifted.length}/${hashes.length} reference an older SRS hash. Next dispatch will surface regen-confirmation gate (§9 Step 4.5)`;
}

function summarizeAgentNameDuplicates() {
  // Scan .claude/agents/**/*.md for duplicate `name:` frontmatter values.
  // Per Claude Code docs, duplicate names silently discard one of the pair
  // without warning. The kit's _template-<role> naming convention prevents
  // this at design time; this scan is fourth-layer defense (Hard Rule + agent
  // procedure + Agent Generator exit-criteria Step 6 + this scan).
  const fs = require('fs');
  const path = require('path');

  const agentsDir = path.join(ROOT, '.claude/agents');
  if (!fs.existsSync(agentsDir)) return null;

  // Walk recursively
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) files.push(full);
    }
  }
  walk(agentsDir);

  if (files.length === 0) return null;

  // Extract `name:` from each file's frontmatter (first --- block only).
  const nameCounts = new Map();  // name -> [file, file, ...]
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8').slice(0, 3000); } catch { continue; }
    // Frontmatter: between first `---` and next `---`
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const m = fm[1].match(/^name:\s*(\S+)/m);
    if (!m) continue;
    const name = m[1].trim();
    if (!nameCounts.has(name)) nameCounts.set(name, []);
    nameCounts.get(name).push(path.relative(ROOT, f));
  }

  // Find duplicates
  const dups = [...nameCounts.entries()].filter(([, files]) => files.length > 1);
  if (dups.length === 0) {
    return `Agent names: ${nameCounts.size} unique across ${files.length} agent files (no collisions)`;
  }

  // Build warning
  const lines = [`⚠ Agent name COLLISIONS detected — Claude Code silently discards one of each duplicate-named pair:`];
  for (const [name, paths] of dups) {
    lines.push(`  · "${name}" appears in: ${paths.join(', ')}`);
  }
  lines.push(`  Fix: rename one of the duplicates' \`name:\` frontmatter value, or move/delete one file. Per Agent Generator exit-criteria Step 6.`);
  return lines.join('\n');
}

function summarizeInterruptedDispatches() {
  // §14.3 detector — read-only, fail-open. Surfaces interrupted dispatches so
  // the Orchestrator runs §9 Step 0.6 reconciliation before any new dispatch.
  //
  // Two signals:
  //   (1) Surviving dispatch-journal entries (.claude/dispatch-journal/*.json).
  //       The journal is deleted by the Orchestrator at §9 Step 7 on clean
  //       return, so any entry present at session start = an interrupted
  //       dispatch (CLAUDE.md §14.2 invariant).
  //   (2) Orphan .worktrees/<role>-<task-id>/ dirs with no matching journal
  //       entry (residue from pre-journal sessions or escape-hatch overrides).
  //
  // Never mutates — clearing is the Orchestrator's job (Step 0.6).
  const fs = require('fs');
  const path = require('path');

  const journalDir = path.join(ROOT, '.claude/dispatch-journal');
  const worktreesDir = path.join(ROOT, '.worktrees');

  // --- (1) journal entries ---
  const journals = [];   // { taskId, role, worktreeName, dispatchedAt, hasPlanUpdate }
  const journaledWorktrees = new Set();
  if (fs.existsSync(journalDir)) {
    let entries = [];
    try { entries = fs.readdirSync(journalDir).filter(n => n.endsWith('.json')); } catch {}
    for (const name of entries) {
      let rec = {};
      try { rec = JSON.parse(fs.readFileSync(path.join(journalDir, name), 'utf8')); } catch { rec = {}; }
      const wtName = (rec.worktree || '').replace(/^\.worktrees\//, '').replace(/\/$/, '');
      if (wtName) journaledWorktrees.add(wtName);
      // A worktree carrying plan-update.json is a completed dispatch awaiting
      // ingestion (§14.4 edge case) — flag it differently so the Orchestrator
      // ingests rather than rolls back.
      let hasPlanUpdate = false;
      if (rec.worktree) {
        try { hasPlanUpdate = fs.existsSync(path.join(ROOT, rec.worktree, 'plan-update.json')); } catch {}
      }
      journals.push({
        taskId: rec.task_id || name.replace(/\.json$/, ''),
        role: rec.role || 'unknown',
        worktreeName: wtName,
        dispatchedAt: rec.dispatched_at || '?',
        hasPlanUpdate,
      });
    }
  }

  // --- (2) orphan worktrees (dir present, no journal entry) ---
  const orphanWorktrees = [];
  if (fs.existsSync(worktreesDir)) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(worktreesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {}
    for (const d of dirs) {
      if (!journaledWorktrees.has(d)) orphanWorktrees.push(d);
    }
  }

  if (journals.length === 0 && orphanWorktrees.length === 0) {
    return 'Dispatch reconciliation: clean — no interrupted dispatches, no orphan worktrees';
  }

  const lines = ['⚠ INTERRUPTED DISPATCHES detected — Orchestrator MUST run §9 Step 0.6 reconciliation before any new dispatch:'];
  for (const j of journals) {
    const tag = j.hasPlanUpdate
      ? 'has plan-update.json → INGEST (completed, not rolled back)'
      : 'no plan-update.json → ROLL BACK + restart';
    lines.push(`  · journal ${j.role}/${j.taskId} (dispatched ${j.dispatchedAt}) — ${tag}`);
  }
  for (const w of orphanWorktrees) {
    lines.push(`  · orphan worktree .worktrees/${w}/ — no journal entry; reconcile per §14.4 edge case`);
  }
  lines.push('  See CLAUDE.md §14 + orchestrator-operating-rules.md §9 Step 0.6.');
  return lines.join('\n');
}

function summarizeWorkloadTier() {
  // Read CLAUDE_WORKLOAD_TIER env, then SRS header field, then default to 'aggressive'.
  const envTier = (process.env.CLAUDE_WORKLOAD_TIER || '').toLowerCase().trim();
  if (envTier === 'aggressive' || envTier === 'standard' || envTier === 'conservative') {
    return `Workload tier: ${envTier} (via CLAUDE_WORKLOAD_TIER env)`;
  }
  // Try SRS header
  const srsContent = readSafe('docs/SRS.md');
  if (srsContent) {
    const { parseHeaderField } = require('./lib/parse-header.cjs');
    const fromHeader = (parseHeaderField(srsContent.slice(0, 4000), 'Workload-Tier') || '').toLowerCase().trim();
    if (fromHeader === 'aggressive' || fromHeader === 'standard' || fromHeader === 'conservative') {
      return `Workload tier: ${fromHeader} (via SRS header)`;
    }
  }
  return `Workload tier: aggressive (kit default)`;
}

function summarizeGit() {
  // Detect git repo state for the Pre-flight Step 0 audit.
  // Pure read — never blocks; reports state inline.
  const { execSync } = require('child_process');
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return 'Git: not a repository — Orchestrator will `git init` on first dispatch (§9 Step 0)';
  }
  let identity;
  try {
    const name = execSync('git config --get user.name', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const email = execSync('git config --get user.email', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    if (!name || !email) throw new Error('partial');
    identity = `${name} <${email}>`;
  } catch {
    return 'Git: repo present, BUT committer identity not configured — Orchestrator will halt on first dispatch (NEEDS_CONTEXT)';
  }
  let dirty = '';
  try {
    const out = execSync('git status --porcelain', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const lines = out.split('\n').filter(Boolean);
    if (lines.length > 0) dirty = ` / ${lines.length} uncommitted change(s) on main`;
  } catch {}
  return `Git: repo OK, identity: ${identity}${dirty}`;
}

function summarizeSrs() {
  const c = readSafe('docs/SRS.md');
  if (c === null) return 'SRS: docs/SRS.md not found';
  const head = c.slice(0, 4000);
  const status = parseHeaderField(head, 'Status') || '(missing Status header)';
  const lastUpdated = parseHeaderField(head, 'Last-Updated');
  const date = lastUpdated ? `, Last-Updated: ${lastUpdated}` : '';
  return `SRS: ${status}${date}`;
}

function summarizeOpenIssues() {
  const c = readSafe('docs/open-issues.md');
  if (c === null) return 'Open issues: docs/open-issues.md not found';
  const counts = { open: 0, resolved: 0, deferred: 0, promoted: 0 };
  const blocks = c.split(/\n(?=### ISSUE-)/);
  for (const b of blocks) {
    if (!/^### ISSUE-/m.test(b)) continue;
    const state = parseHeaderField(b, 'State');
    if (!state) continue;
    const s = state.toLowerCase();
    if (counts[s] !== undefined) counts[s]++;
  }
  const total = counts.open + counts.resolved + counts.deferred + counts.promoted;
  if (total === 0) return 'Open issues: file present, no entries parsed';
  const parts = [];
  parts.push(`${counts.open} OPEN${counts.open > 0 ? ' ⚠' : ''}`);
  if (counts.resolved > 0) parts.push(`${counts.resolved} resolved`);
  if (counts.deferred > 0) parts.push(`${counts.deferred} deferred`);
  if (counts.promoted > 0) parts.push(`${counts.promoted} promoted`);
  return `Open issues: ${parts.join(' / ')}`;
}

const PHASE_STATUSES = ['not-started', 'in-progress', 'done'];

function summarizeMasterPlan() {
  // Read ONLY the top-level docs/plan/master-plan.md. This is the project shape
  // (phase list + running-tasks summary). Phase and task files are loaded by
  // the orchestrator on demand for a specific dispatch — they're not part of
  // the session-start summary.
  const c = readSafe('docs/plan/master-plan.md');
  if (c === null) return 'Plan: docs/plan/master-plan.md not found';

  // Count phases by status — look for the Phases table rows.
  // Heuristic: lines starting with `|` that contain `phase-NN-` and a recognized
  // phase status. Best-effort — the kit prescribes a schema but tolerates
  // formatting variation.
  const phaseCounts = { 'not-started': 0, 'in-progress': 0, done: 0 };
  for (const status of PHASE_STATUSES) {
    const re = new RegExp('\\bphase-\\d+-[a-z0-9-]+/\\s*\\|\\s*' + status + '\\b', 'gi');
    phaseCounts[status] = (c.match(re) || []).length;
  }

  // Count running tasks — heuristic: look for the `## Running tasks` section
  // and count `T-\d+` task IDs in table rows below it (until the next `##`).
  let runningCount = 0;
  const runningMatch = c.match(/##\s*Running tasks[^]*?(?=\n##|$)/i);
  if (runningMatch) {
    const taskRows = runningMatch[0].match(/\|\s*T-\d+\s*\|/g) || [];
    runningCount = taskRows.length;
  }

  const totalPhases = phaseCounts['not-started'] + phaseCounts['in-progress'] + phaseCounts.done;
  if (totalPhases === 0 && runningCount === 0) {
    return 'Plan: file present, no phases or running tasks parsed';
  }

  const parts = [];
  if (totalPhases > 0) {
    const phaseBits = [];
    if (phaseCounts.done > 0) phaseBits.push(`${phaseCounts.done} done`);
    if (phaseCounts['in-progress'] > 0) phaseBits.push(`${phaseCounts['in-progress']} in-progress`);
    if (phaseCounts['not-started'] > 0) phaseBits.push(`${phaseCounts['not-started']} not-started`);
    parts.push(`${totalPhases} phase(s): ${phaseBits.join(', ')}`);
  }
  if (runningCount > 0) {
    parts.push(`${runningCount} running task(s)`);
  } else if (totalPhases > 0) {
    parts.push('0 running tasks');
  }
  return `Plan: ${parts.join('; ')}`;
}

async function main() {
  // Drain stdin (the SessionStart event JSON — we don't need to parse it).
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const lines = [
    `=== ClaudeProjectTemplate session state ===`,
    summarizeGit(),
    summarizeWorkloadTier(),
    summarizeAgentDrift(),
    summarizeAgentNameDuplicates(),
    summarizeInterruptedDispatches(),
    summarizeSrs(),
    summarizeOpenIssues(),
    summarizeMasterPlan(),
    `(Source files: docs/SRS.md, docs/open-issues.md, docs/plan/master-plan.md — read them directly for detail.)`,
    ``,
  ];
  process.stdout.write(lines.filter(l => l !== null && l !== undefined).join('\n'));
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`session-init-summary: error: ${err && err.stack || err}\n`);
  process.exit(0);
});
