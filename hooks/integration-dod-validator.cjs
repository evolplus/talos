#!/usr/bin/env node
// .claude/hooks/integration-dod-validator.cjs
// PreToolUse hook: validates that task files under docs/plan/ have
// integration/e2e verification in their DoD when the task is either:
//   (1) track: be+fe — spans backend + frontend, must verify cross-track
//   (2) has >=4 dependencies — integration-glue pattern, must verify end-to-end
//
// Bug 6 root cause: integration-glue tasks could be marked done with only
// "unit tests pass" DoDs, missing cross-component verification. The worker
// pipeline never ran end-to-end despite the project claiming 100% done.
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Only validates Write to a path matching docs/plan/phase-*/tasks/T-NNN.md.
// Other tool calls pass through.

'use strict';

const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

// Integration/e2e verification language that must appear in a glue task's DoD.
// Any one match satisfies the check.
const INTEGRATION_DOD_RE = /\b(?:integration|e2e|end-to-end|cross-component|cross-track|smoke|contract\s+verif)/i;

// Minimum dependency count that triggers the glue-task check.
const GLUE_THRESHOLD = 4;

// Path pattern for task files under docs/plan/.
const TASK_FILE_RE = /(^|\/)docs\/plan\/phase-\d+-[^\/]+\/tasks\/T-\d+\.md$/;

function isTaskFilePath(p) {
  return typeof p === 'string' && TASK_FILE_RE.test(p);
}

// Extract the full DoD text, including multi-line continuation lines.
// Handles both "- DoD: ..." (single line) and "- DoD: ...\n  (1) ...\n  (2) ..."
// (multi-line with indented continuations).
function extractDoDText(content) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');
  let dodText = '';
  let inDoD = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is the DoD header line
    // Handles: "- DoD: ...", "- **DoD:** ..."
    const dodMatch = trimmed.match(/^-\s+\*{0,2}DoD:\s*\*{0,2}\s*(.*)/i);
    if (dodMatch) {
      // Strip remaining bold markers from the captured value
      dodText = dodMatch[1].replace(/\*{0,2}/g, '');
      inDoD = true;
      continue;
    }

    if (inDoD) {
      // Continuation lines: indented (2+ spaces) and not a new header field or section.
      // Markdown list continuations under DoD are typically indented with 2+ spaces.
      if (/^\s{2,}/.test(line) &&
          !trimmed.match(/^-\s+\*{0,2}(Track|Status|DoD|Phase|Dependencies|Linked|Notes):/i) &&
          !trimmed.match(/^##/)) {
        dodText += ' ' + trimmed;
      } else {
        // End of DoD — next field, section header, or unindented line
        break;
      }
    }
  }

  return dodText.trim();
}

// Parse the Dependencies field and count T-NNN task IDs.
// Handles: "- Dependencies: T-002, T-005, T-006, T-019 (desc)"
//          "- **Dependencies:** T-011, T-012 (desc)"
function countDependencies(content) {
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const depMatch = trimmed.match(/^-\s+\*{0,2}Dependencies:\s*\*{0,2}\s*(.*)/i);
    if (depMatch) {
      const depValue = depMatch[1].replace(/\*{0,2}/g, '');
      const taskIds = depValue.match(/T-\d+/g);
      return taskIds ? taskIds.length : 0;
    }
  }
  return 0;
}

function validate(content) {
  const errors = [];

  const track = parseHeaderField(content, 'Track');
  const trackValue = track ? track.toLowerCase() : null;
  const dodText = extractDoDText(content);
  const depCount = countDependencies(content);

  // If no DoD found, skip validation (fail open — the prose rule is authoritative)
  if (!dodText) return errors;

  // Check 1: be+fe track requires integration DoD language
  if (trackValue === 'be+fe') {
    if (!INTEGRATION_DOD_RE.test(dodText)) {
      errors.push(
        `track "be+fe" requires integration/e2e verification in DoD — found none. ` +
        `Per master-plan-discipline.md §8, tasks spanning backend + frontend must have ` +
        `cross-track verification (integration test, e2e, end-to-end, smoke, cross-component, ` +
        `or contract verification) in their Definition of Done.`
      );
    }
  }

  // Check 2: >=4 dependencies (glue pattern) requires integration DoD language
  if (depCount >= GLUE_THRESHOLD) {
    if (!INTEGRATION_DOD_RE.test(dodText)) {
      errors.push(
        `${depCount} dependencies (>=${GLUE_THRESHOLD}) — integration-glue pattern requires ` +
        `integration/e2e verification in DoD — found none. Per Bug 6 root cause, tasks that ` +
        `wire multiple components must verify end-to-end behavior, not just unit tests. Add ` +
        `"integration test", "e2e", "end-to-end", "smoke", "cross-component", or ` +
        `"contract verification" to the DoD.`
      );
    }
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
    process.stderr.write(`integration-dod-validator: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};

  if (toolName !== 'Write') process.exit(0);
  const filePath = toolInput.file_path || '';
  if (!isTaskFilePath(filePath)) process.exit(0);

  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  const errors = validate(content);
  if (errors.length === 0) process.exit(0);

  process.stderr.write(
    `integration-dod-validator: ${filePath} fails integration DoD check:\n`
  );
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.stderr.write(
    `\n  Integration patterns that satisfy the check: integration, e2e, end-to-end, ` +
    `cross-component, cross-track, smoke, contract verified/verification\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`integration-dod-validator: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});