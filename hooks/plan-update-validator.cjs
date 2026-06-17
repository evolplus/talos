#!/usr/bin/env node
// .claude/hooks/plan-update-validator.cjs
// PreToolUse hook: validates plan-update.json content against the schema in
// .claude/rules/worktree-isolation.md §5 before a sub-agent commits it.
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Only validates Write to a path ending in plan-update.json. Other tool calls pass through.

'use strict';

const REQUIRED_FIELDS = ['task_id', 'track', 'from_status', 'to_status', 'agent', 'timestamp'];
const OPTIONAL_FIELDS = ['design_sub_status', 'notes'];

// Tracks: master-plan tracks per CLAUDE.md §3.3 + pre-implementation phases (BA/SA/TL).
const VALID_TRACKS = new Set([
  'be', 'fe', 'be+fe', 'infra', 'qa',  // implementation tracks
  'ba', 'sa', 'tl',                     // pre-implementation phases
]);

const VALID_STATUSES = new Set([
  'not-started',
  'in-progress',
  'blocked',
  'contract-pending',
  'ready-for-deploy',
  'in-test',
  'failed',
  'done',
  'cancelled',         // task in-flight when its US/FR was deprecated by an iteration
  'done-deprecated',   // task completed; US/FR later deprecated; awaits cleanup task
]);

const VALID_DESIGN_SUB_STATUSES = new Set([
  'design-ready-for-review',
  'design-revision-needed',
  'design-pending-user-confirmation',
  'design-human-edited',
  'design-confirmed',
]);

const VALID_AGENTS = new Set([
  'ba', 'ui-ux-designer', 'sa', 'tl', 'qa-author',
  'be-dev', 'fe-dev', 'devops', 'qa-exec',
  'orchestrator', // Orchestrator-initiated transitions (cancel, iterate, etc.)
]);

// Legal state-machine transitions per master-plan-discipline.md §8.
// Key: from_status. Value: Set of legal to_status values.
// Any transition not in this table is illegal and will be blocked.
const LEGAL_TRANSITIONS = new Map([
  ['not-started', new Set(['in-progress', 'cancelled'])],
  ['in-progress', new Set(['ready-for-deploy', 'blocked', 'failed', 'cancelled'])],
  ['blocked', new Set(['in-progress', 'cancelled'])],
  ['contract-pending', new Set(['in-progress', 'cancelled'])],
  ['ready-for-deploy', new Set(['in-test', 'cancelled'])],
  ['in-test', new Set(['done', 'failed'])],
  ['failed', new Set(['in-progress'])],
  ['done', new Set(['done-deprecated'])],
  // Terminal states — no outgoing transitions
  ['done-deprecated', new Set()],
  ['cancelled', new Set()],
]);

// Reasonable ISO-8601 form: YYYY-MM-DDTHH:MM:SS(.fff)?(Z|±HH:MM|±HHMM)
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// Agent authority per transition (Bug 5 fix).
// Certain transitions may only be proposed by specific agents. This prevents
// the exact failure mode where be-dev claimed "in-test → done" without QA-Exec
// ever running — or devops claiming "in-progress → ready-for-deploy" without
// the dev's self-verification completing.
//
// Transitions NOT in STRICT_AUTHORITY and NOT covered by TO_STATUS_AUTHORITY
// have open authority (any valid agent may propose, subject to the
// state-machine transition check from Bug 1).
//
// Key format: "from_status→to_status". Value: Set of authorized agents.

const STRICT_AUTHORITY = new Map([
  // Dev completes self-verification — only the working dev
  ['in-progress→ready-for-deploy', new Set(['be-dev', 'fe-dev'])],
  // DevOps deploys the build — only devops
  ['ready-for-deploy→in-test', new Set(['devops'])],
  // QA-Exec passes QA — only qa-exec
  ['in-test→done', new Set(['qa-exec'])],
  // QA-Exec fails QA — only qa-exec
  ['in-test→failed', new Set(['qa-exec'])],
  // Re-dispatch after failure — orchestrator re-dispatches per §9 Step 8
  ['failed→in-progress', new Set(['orchestrator'])],
  // Re-dispatch after blocker resolved — orchestrator re-dispatches per §9 Step 8
  ['blocked→in-progress', new Set(['orchestrator'])],
  // Iteration deprecation — orchestrator only
  ['done→done-deprecated', new Set(['orchestrator'])],
]);

// Global authority overrides keyed by to_status (not transition).
// Covers "cancelled" which is reachable from multiple from_statuses but
// should always be orchestrator-only.
const TO_STATUS_AUTHORITY = new Map([
  ['cancelled', new Set(['orchestrator'])],
]);

const fs = require('fs');
const path = require('path');
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Find a task file by task_id (e.g. "T-017") by scanning docs/plan/phase-*/tasks/<id>.md
function findTaskFile(taskId) {
  const planDir = path.join(ROOT, 'docs', 'plan');
  if (!fs.existsSync(planDir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(planDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith('phase-')) continue;
    const candidate = path.join(planDir, ent.name, 'tasks', `${taskId}.md`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Parse the "## Linked artifacts" section of a task file, returning an array of
// paths extracted from lines like:
//   - Deploy report: docs/deploy-reports/T-017.md
//   - QA report: docs/qa-reports/T-017.md
function parseLinkedArtifacts(taskContent) {
  const artifacts = { deployReport: null, qaReport: null };
  const lines = taskContent.split('\n');
  let inArtifacts = false;
  for (const line of lines) {
    if (/^## Linked artifacts/i.test(line)) {
      inArtifacts = true;
      continue;
    }
    if (inArtifacts && /^## /i.test(line)) break; // next section
    if (!inArtifacts) continue;
    const trimmed = line.trim();
    // Match: - Deploy report: <path>  or  - QA report: <path>
    const deployMatch = trimmed.match(/^-\s+Deploy\s+report:\s*(\S+)/i);
    if (deployMatch) artifacts.deployReport = deployMatch[1];
    const qaMatch = trimmed.match(/^-\s+QA\s+report:\s*(\S+)/i);
    if (qaMatch) artifacts.qaReport = qaMatch[1];
  }
  return artifacts;
}

function isPlanUpdatePath(p) {
  return typeof p === 'string' && /(^|\/)plan-update\.json$/.test(p);
}

function validate(content) {
  const errors = [];
  let obj;
  try {
    obj = JSON.parse(content);
  } catch (e) {
    return [`not valid JSON: ${e.message}`];
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return ['root must be a JSON object'];
  }

  for (const f of REQUIRED_FIELDS) {
    if (!(f in obj)) {
      errors.push(`missing required field: ${f}`);
    } else if (typeof obj[f] !== 'string' || obj[f].length === 0) {
      errors.push(`field ${f} must be a non-empty string`);
    }
  }

  const known = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  for (const f of Object.keys(obj)) {
    if (!known.has(f)) errors.push(`unknown field: ${f}`);
  }

  if ('track' in obj && typeof obj.track === 'string' && !VALID_TRACKS.has(obj.track)) {
    errors.push(`invalid track: "${obj.track}" — allowed: ${[...VALID_TRACKS].join(', ')}`);
  }
  if ('from_status' in obj && typeof obj.from_status === 'string' && !VALID_STATUSES.has(obj.from_status)) {
    errors.push(`invalid from_status: "${obj.from_status}" — allowed: ${[...VALID_STATUSES].join(', ')}`);
  }
  if ('to_status' in obj && typeof obj.to_status === 'string' && !VALID_STATUSES.has(obj.to_status)) {
    errors.push(`invalid to_status: "${obj.to_status}" — allowed: ${[...VALID_STATUSES].join(', ')}`);
  }
  if ('design_sub_status' in obj && obj.design_sub_status !== undefined && obj.design_sub_status !== null) {
    if (typeof obj.design_sub_status !== 'string' || !VALID_DESIGN_SUB_STATUSES.has(obj.design_sub_status)) {
      errors.push(`invalid design_sub_status: "${obj.design_sub_status}" — allowed: ${[...VALID_DESIGN_SUB_STATUSES].join(', ')}`);
    }
  }
  // State-machine transition check — core enforcement of
  // master-plan-discipline.md §8 allowed task statuses + legal transitions.
  // Identity transitions (from === to) are allowed: they represent a
  // design_sub_status-only update with no status change.
  if ('from_status' in obj && 'to_status' in obj &&
      typeof obj.from_status === 'string' && typeof obj.to_status === 'string' &&
      VALID_STATUSES.has(obj.from_status) && VALID_STATUSES.has(obj.to_status) &&
      obj.from_status !== obj.to_status) {
    const legalDests = LEGAL_TRANSITIONS.get(obj.from_status);
    if (legalDests !== undefined) {
      // Known from_status — check the transition is in the legal set.
      if (!legalDests.has(obj.to_status)) {
        if (legalDests.size === 0) {
          errors.push(
            `illegal transition: "${obj.from_status}" → "${obj.to_status}" — ` +
            `"${obj.from_status}" is a terminal state with no outgoing transitions`
          );
        } else {
          errors.push(
            `illegal transition: "${obj.from_status}" → "${obj.to_status}" — ` +
            `legal from "${obj.from_status}": ${[...legalDests].join(', ')}`
          );
        }
      }
    }
    // Unknown from_status is already caught by the VALID_STATUSES check above.
  }

  // Agent authority check (Bug 5 fix).
  // Certain transitions may only be proposed by specific agents. This prevents
  // e.g. be-dev proposing "in-test → done" — claiming QA passed without QA-Exec
  // ever running, or devops claiming "in-progress → ready-for-deploy" — claiming
  // self-verification passed without the dev actually completing it.
  // Identity transitions (from === to) are exempt — they carry design_sub_status
  // updates only, not actual status changes.
  if ('from_status' in obj && 'to_status' in obj && 'agent' in obj &&
      typeof obj.from_status === 'string' && typeof obj.to_status === 'string' && typeof obj.agent === 'string' &&
      obj.from_status !== obj.to_status) {
    const transitionKey = `${obj.from_status}→${obj.to_status}`;
    // Check transition-level strict authority
    const authorizedAgents = STRICT_AUTHORITY.get(transitionKey);
    if (authorizedAgents !== undefined && !authorizedAgents.has(obj.agent)) {
      errors.push(
        `agent authority violation: "${obj.agent}" cannot propose "${obj.from_status}" → "${obj.to_status}" — ` +
        `authorized: ${[...authorizedAgents].join(', ')}. ` +
        `Per CLAUDE.md §3.5–§3.8, only the listed agent(s) may advance tasks through this transition.`
      );
    }
    // Check to_status-level global authority (e.g. "cancelled" is orchestrator-only)
    const globalAgents = TO_STATUS_AUTHORITY.get(obj.to_status);
    if (globalAgents !== undefined && !globalAgents.has(obj.agent)) {
      errors.push(
        `agent authority violation: "${obj.agent}" cannot propose transition to "${obj.to_status}" — ` +
        `only ${[...globalAgents].join(', ')} may move tasks to "${obj.to_status}". ` +
        `Per CLAUDE.md §9 + §10, cancellation and deprecation are Orchestrator-only operations.`
      );
    }
  }

  // Required-artifact gate before "done" (Bug 2 fix).
  // Per master-plan-discipline.md §8, the only path to "done" is "in-test" → "done".
  // A task reaching "done" must have its deploy report and QA report on disk.
  // This prevents the exact failure mode where tasks were marked done without
  // QA verification (the project discrepancy root cause).
  if ('to_status' in obj && obj.to_status === 'done' &&
      'task_id' in obj && typeof obj.task_id === 'string') {
    const taskFile = findTaskFile(obj.task_id);
    if (taskFile) {
      try {
        const content = fs.readFileSync(taskFile, 'utf8');
        const artifacts = parseLinkedArtifacts(content);
        const missing = [];
        if (artifacts.deployReport) {
          const resolved = path.resolve(ROOT, artifacts.deployReport);
          if (!fs.existsSync(resolved)) {
            missing.push(`deploy report: ${artifacts.deployReport}`);
          }
        }
        if (artifacts.qaReport) {
          const resolved = path.resolve(ROOT, artifacts.qaReport);
          if (!fs.existsSync(resolved)) {
            missing.push(`QA report: ${artifacts.qaReport}`);
          }
        }
        if (missing.length > 0) {
          errors.push(
            `required artifacts missing for "${obj.task_id}" → done: ` +
            `${missing.join('; ')} — ` +
            `master-plan-discipline.md §8: no task may reach "done" without deploy + QA reports`
          );
        }
      } catch {
        // Can't read task file — fail open; the prose rule is the authoritative control
      }
    }
  }

  if ('agent' in obj && typeof obj.agent === 'string' && !VALID_AGENTS.has(obj.agent)) {
    errors.push(`invalid agent: "${obj.agent}" — allowed: ${[...VALID_AGENTS].join(', ')}`);
  }
  if ('timestamp' in obj && typeof obj.timestamp === 'string' && !ISO_8601.test(obj.timestamp)) {
    errors.push(`timestamp not ISO-8601: "${obj.timestamp}" — example: 2026-05-10T08:00:00Z`);
  }
  if ('notes' in obj && obj.notes !== undefined && obj.notes !== null && typeof obj.notes !== 'string') {
    errors.push(`notes must be a string when present`);
  }

  return errors;
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`plan-update-validator: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};

  if (toolName !== 'Write') process.exit(0);
  if (!isPlanUpdatePath(toolInput.file_path)) process.exit(0);

  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  const errors = validate(content);
  if (errors.length === 0) process.exit(0);

  process.stderr.write(
    `plan-update-validator: ${toolInput.file_path} fails schema (.claude/rules/worktree-isolation.md §5):\n`
  );
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.stderr.write(
    `\n  Required: ${REQUIRED_FIELDS.join(', ')}\n  Optional: ${OPTIONAL_FIELDS.join(', ')}\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`plan-update-validator: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
