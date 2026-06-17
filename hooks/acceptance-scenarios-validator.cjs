#!/usr/bin/env node
// .claude/hooks/acceptance-scenarios-validator.cjs
// PreToolUse hook: enforces that every US file under docs/user-stories/
// and every FR file under docs/frs/ carries a `## Acceptance Scenarios`
// section with at least one Given/When/Then triple before the Write/Edit
// completes.
//
// This is the deterministic "point 1" of the 5-point cross-consistency
// check in BA Phase 2 (per ba.md). Points 2-5 are LLM-level and
// performed procedurally by BA at sign-off time.
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Fail-open: any internal error allows the write with a warning to
// stderr. The prose rule in user-story-author / ba.md is the
// authoritative control; this hook catches the common case.

'use strict';

const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');

// Markdown header recognition (## Acceptance Scenarios)
const ACCEPTANCE_HEADER = /^##\s+Acceptance\s+Scenarios\s*$/im;

// Given/When/Then triple — must have all three keywords as bold list items
// in close proximity. Conservative match: looks for `**Given`, `**When`, `**Then`
// within a window of ~25 lines after the section header.
function hasAtLeastOneGWT(body) {
  const lines = body.split('\n');
  // Find the section start
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ACCEPTANCE_HEADER.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return false;

  // Look ahead through the next section (until next `## ` heading) for a triple
  let hasGiven = false, hasWhen = false, hasThen = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break; // next section
    if (/\*\*Given\b/i.test(lines[i])) hasGiven = true;
    if (/\*\*When\b/i.test(lines[i])) hasWhen = true;
    if (/\*\*Then\b/i.test(lines[i])) hasThen = true;
    if (hasGiven && hasWhen && hasThen) return true;
  }
  return false;
}

function isUSorFRpath(p) {
  if (typeof p !== 'string') return null;
  // Match docs/user-stories/US-NNN.md
  if (/(^|\/)docs\/user-stories\/US-\d+\.md$/i.test(p)) return 'US';
  // Match docs/frs/FR-NNN.md
  if (/(^|\/)docs\/frs\/FR-\d+\.md$/i.test(p)) return 'FR';
  return null;
}

function extractIdFromPath(p) {
  const m = p.match(/\/(US-\d+|FR-\d+)\.md$/i);
  return m ? m[1] : null;
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
    process.stderr.write(
      `acceptance-scenarios-validator: malformed event JSON: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  if (toolName !== 'Write') process.exit(0);

  const filePath = toolInput.file_path || '';
  const fileKind = isUSorFRpath(filePath);
  if (!fileKind) process.exit(0);

  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  // Strip fenced code blocks (consistent with other markdown-parsing hooks)
  const stripped = stripFencedCodeBlocks(content);

  if (hasAtLeastOneGWT(stripped)) {
    process.exit(0);
  }

  const id = extractIdFromPath(filePath) || 'NNN';
  process.stderr.write(
    `acceptance-scenarios-validator: BLOCKED — ${filePath} does not satisfy the mandatory Acceptance Scenarios rule.\n` +
    `  Per ba.md Phase 2 cross-consistency check + user-story-author skill:\n` +
    `    Every ${fileKind === 'US' ? 'User Story' : 'FR'} file MUST contain a "## Acceptance Scenarios" section\n` +
    `    with at least one happy-path scenario in Given/When/Then form.\n\n` +
    `  Expected structure (per ${fileKind === 'US' ? 'user-story-template.md' : 'frs-template.md'}):\n\n` +
    `    ## Acceptance Scenarios\n\n` +
    `    ### Scenario 1: <Happy path title>\n` +
    `    - **Given** <preconditions>\n` +
    `    - **When** <trigger action>\n` +
    `    - **Then** <expected outcome>\n\n` +
    `  Negative scenarios are REQUIRED when this ${id} involves auth, payments, external\n` +
    `  integrations, retries, or background jobs.\n\n` +
    `  This hook enforces point 1 of the 5-point cross-consistency check. Points 2-5\n` +
    `  (Main Flow ↔ Scenario coverage, Business Rules contradictions, etc.) are\n` +
    `  LLM-level checks BA performs at Phase 2 sign-off time.\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `acceptance-scenarios-validator: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
