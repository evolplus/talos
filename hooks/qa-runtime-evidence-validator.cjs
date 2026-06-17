#!/usr/bin/env node
// .claude/hooks/qa-runtime-evidence-validator.cjs
// PreToolUse hook: validates QA reports for be/be+fe tasks contain runtime
// execution evidence, not just "unit tests pass" or "code exists" assertions.
//
// Bug 4 fix: T-052's smoke tests were all API-level curl checks. The worker
// pipeline (T-012..T-018) was never exercised end-to-end. FRs were verified
// by "Code: <path>, unit tests pass" — which doesn't catch placeholder stubs
// that return zeros. No hook caught this.
//
// For be/be+fe tasks, the QA report must contain at least one line of runtime
// execution evidence per FR verification row — evidence that the code was
// actually RUN, not just that it exists or its unit tests pass.
//
// Signals of runtime evidence (at least one required per FR row):
//   - "smoke test PASS" / "smoke PASS" / "smoke verified"
//   - "curl" / "HTTP" / "request" / "response"
//   - "executed" / "invoked" / "triggered" / "ran"
//   - "npm run" / "tsx" / "node" (command execution)
//   - "docker" / "container" (runtime execution)
//   - "output:" / "result:" / "returned:" (observed output)
//   - "verified via" / "verified against" (runtime verification)
//   - "playwright" / "e2e" / "integration test" / "spec" (test execution)
//   - "PASS" or "FAIL" following a test description (test result)
//
// Anti-patterns (NOT runtime evidence — these signal "code exists" only):
//   - "Code: <path>" without a runtime verb
//   - "unit tests pass" alone
//   - "implementation exists"
//   - "code present"
//   - "schema verified" without runtime context
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow (evidence sufficient or not a QA report for be/be+fe)
//   - exit 2: block (missing runtime evidence for be/be+fe task)
//
// Fail-open on internal errors — the prose rule is the authoritative control.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Match docs/qa-reports/T-NNN.md
const QA_REPORT_RE = /(^|\/)docs\/qa-reports\/(T-\d+)\.md$/i;

// Phrases that indicate actual runtime execution.
const RUNTIME_EVIDENCE_PATTERNS = [
  /\bsmoke\s+(test\s+)?PASS\b/i,
  /\bsmoke\s+verified\b/i,
  /\bcurl\b/i,
  /\bHTTP\b/,
  /\brequest\b/i,
  /\bresponse\b/i,
  /\bexecuted\b/i,
  /\binvoked\b/i,
  /\btriggered\b/i,
  /\bran\b/i,
  /\bnpm\s+run\b/i,
  /\btsx\b/,
  /\bnode\s+/,
  /\bdocker\b/i,
  /\bcontainer\b/i,
  /\boutput:\s/i,
  /\bresult:\s/i,
  /\breturned:\s/i,
  /\bverified\s+via\b/i,
  /\bverified\s+against\b/i,
  /\bplaywright\b/i,
  /\be2e\b/i,
  /\bintegration\s+test\b/i,
  /\bspec\b.*(?:PASS|FAIL)/i,
  /\bPASS\b.*\b(spec|test|check|verify)/i,
  /\bAPI\b.*\b(?:200|201|401|403|404)\b/,
  /\bendpoint\b.*\b(?:respond|return|status)\b/i,
];

// Phrases that indicate "code exists only" — NOT runtime evidence.
const CODE_EXISTS_ONLY_PATTERNS = [
  /\bCode:\s/i,
  /\bcode\s+(?:exists|present|at|in)\b/i,
  /\bimplementation\s+exists\b/i,
  /\bunit\s+tests?\s+pass\b/i,
];

// Check if a single line of evidence contains runtime execution signals.
function hasRuntimeEvidence(line) {
  const hasCodeExistsOnly = CODE_EXISTS_ONLY_PATTERNS.some(p => p.test(line));
  const hasRuntime = RUNTIME_EVIDENCE_PATTERNS.some(p => p.test(line));
  // If the line has "Code: <path>, unit tests pass" AND no runtime verb,
  // it's code-exists-only. But if it ALSO has a runtime verb, it passes.
  if (hasCodeExistsOnly && !hasRuntime) return false;
  if (hasRuntime) return true;
  // Lines without either pattern are neutral (don't count as evidence either way)
  return null; // unknown — not evidence, not anti-pattern
}

// Find the task file for a task ID.
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

// Read the Track field from a task file.
function readTaskTrack(taskFilePath) {
  try {
    const content = fs.readFileSync(taskFilePath, 'utf8');
    const stripped = stripFencedCodeBlocks(content);
    const head = stripped.slice(0, 4000);
    const track = parseHeaderField(head, 'Track');
    return track ? track.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Validate a QA report for runtime evidence.
// Returns array of error strings (empty = pass).
function validateQaReport(content, taskId) {
  const errors = [];

  // Check if this is a be or be+fe task
  const taskFile = findTaskFile(taskId);
  if (!taskFile) return errors; // Can't find task file — fail open

  const track = readTaskTrack(taskFile);
  if (track !== 'be' && track !== 'be+fe') return errors; // Only gate be/be+fe

  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');

  // Find FR verification rows — lines matching the DoD table pattern like:
  //   | FR-001 implemented | Repository Sync | Code: server/src/..., unit tests pass | PASS |
  // Also check smoke/test result rows like:
  //   | TC-XXX | Test description | PASS | Evidence |
  let frRowsMissingRuntime = [];
  let foundFrTable = false;
  let totalFrRows = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for FR verification rows: | FR-NNN ... | ... | evidence | PASS |
    const frMatch = trimmed.match(/^\|\s*FR-\d+/);
    if (frMatch) {
      foundFrTable = true;
      totalFrRows++;
      // Extract the evidence cell(s) — everything between pipes after FR-ID
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
      if (cells.length >= 3) {
        // The evidence column(s) — typically the 3rd or 4th cell
        const evidenceText = cells.slice(2, -1).join(' ');
        if (evidenceText) {
          const result = hasRuntimeEvidence(evidenceText);
          if (result === false) {
            // Extract the FR ID for the error message
            const frId = cells[0].trim();
            frRowsMissingRuntime.push(frId);
          }
        }
      }
    }
  }

  // Also check the overall report for any runtime execution section.
  // If the report has a "Smoke" or "Integration" section with runtime results,
  // that provides blanket coverage even if individual FR rows are thin.
  const hasSmokeSection = /\b(?:smoke|integration|e2e)\s+(?:test|result|execution)/i.test(stripped);
  const hasSuccessfulRuntime = /\b(?:PASS|verified)\b[\s\S]*\b(?:smoke|curl|endpoint|runtime|execution)\b/i.test(stripped) ||
                              /\b(?:smoke|curl|endpoint|runtime|execution)\b[\s\S]*\b(?:PASS|verified)\b/i.test(stripped);

  // If there's a successful smoke/integration section, allow thin FR rows
  // (the smoke section provides the runtime evidence the FR table lacks).
  if (hasSmokeSection && hasSuccessfulRuntime) {
    return errors; // Runtime evidence exists at the report level
  }

  // If FR rows exist but none have runtime evidence, block.
  if (foundFrTable && totalFrRows > 0 && frRowsMissingRuntime.length === totalFrRows) {
    errors.push(
      `QA report for ${taskId} (track: ${track}) has ${totalFrRows} FR verification rows ` +
      `but NONE contain runtime execution evidence. Every row shows "Code: ... unit tests pass" ` +
      `or equivalent — this does not verify the code actually runs. ` +
      `Per Bug 4 fix: be/be+fe QA reports must contain at least one runtime execution signal ` +
      `(smoke test, curl, endpoint response, command execution, integration test run, etc.) ` +
      `or a Smoke/Integration section with PASS results. ` +
      `Missing runtime evidence for: ${frRowsMissingRuntime.slice(0, 5).join(', ')}${frRowsMissingRuntime.length > 5 ? ` (+${frRowsMissingRuntime.length - 5} more)` : ''}`
    );
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
    process.stderr.write(`qa-runtime-evidence-validator: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const filePath = toolInput.file_path || '';

  if (toolName !== 'Write') process.exit(0);

  const match = filePath.match(QA_REPORT_RE);
  if (!match) process.exit(0);

  const taskId = match[2];
  const content = typeof toolInput.content === 'string' ? toolInput.content : '';

  const errors = validateQaReport(content, taskId);
  if (errors.length === 0) process.exit(0);

  process.stderr.write(
    `qa-runtime-evidence-validator: BLOCKED — ${filePath} fails runtime evidence check:\n`
  );
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.stderr.write(
    `\n  Per Bug 4 fix: QA-Exec must exercise be/be+fe code end-to-end, not just\n` +
    `  verify "code exists + unit tests pass". Placeholder stubs that return zeros\n` +
    `  pass unit tests but fail at runtime. Add a smoke/integration section with\n` +
    `  actual command execution or API invocation evidence.\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`qa-runtime-evidence-validator: unexpected error: ${err && err.stack || err} — failing open\n`);
  process.exit(0);
});
