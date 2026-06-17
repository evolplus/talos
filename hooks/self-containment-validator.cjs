#!/usr/bin/env node
// .claude/hooks/self-containment-validator.cjs
// PreToolUse hook: enforces CLAUDE.md §10 self-containment invariant.
//
// Kit artifacts (SRS, US, FR, architecture, ADRs, test cases, UI/UX handoffs,
// visual specs) must be self-contained for engineering use. Body content
// referencing upstream input (docs/requirements/, docs/archaeology-reports/,
// external Confluence/Notion/Jira URLs, codebase paths) is forbidden.
//
// Allowed exceptions:
//   - Audit-annotation lines: **Synthesized-From:**, **Source:**, **Source-Hash:**,
//     **Source-Last-Pulled:**, **Figma-File-URL:**, **Figma-File-Version:**,
//     **Last-Confirmed:**
//   - Lateral kit refs: **Linked FRs:**, **Linked Component:**, **Linked SRS:**,
//     **Linked anchor:**, Refs: ADR-NNNN
//   - Lines inside §10 Changelog table
//   - Lines inside fenced code blocks (illustrative examples)
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message)
//
// Fail-open: internal errors allow the Write with a stderr warning.

'use strict';

const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');

// Kit artifact path patterns
const KIT_ARTIFACT_PATHS = [
  /(^|\/)docs\/SRS\.md$/i,
  /(^|\/)docs\/user-stories\/US-\d+\.md$/i,
  /(^|\/)docs\/frs\/FR-\d+\.md$/i,
  /(^|\/)docs\/architecture\.md$/i,
  /(^|\/)docs\/decisions\/ADR-\d+(-[\w-]+)?\.md$/i,
  /(^|\/)docs\/test-cases\/by-us\/US-\d+\/.+\.md$/i,
  /(^|\/)docs\/test-cases\/by-task\/T-\d+\/.+\.md$/i,
  /(^|\/)docs\/uiux\/handoffs\/.+\.md$/i,
  /(^|\/)docs\/uiux\/visual-specs\/.+\.md$/i,
  /(^|\/)docs\/external-integrations\/[\w-]+\.md$/i,
];

function isKitArtifact(p) {
  if (typeof p !== 'string') return false;
  return KIT_ARTIFACT_PATHS.some(rx => rx.test(p));
}

// Audit-annotation line patterns (allowed even when they contain upstream paths)
// These match the START of a line; the rest of the line is the annotation value.
const AUDIT_ANNOTATION_PATTERNS = [
  /^\s*-?\s*\*\*Synthesized-From:\*\*/i,
  /^\s*-?\s*\*\*Source:\*\*/i,
  /^\s*-?\s*\*\*Source-Hash:\*\*/i,
  /^\s*-?\s*\*\*Source-Last-Pulled:\*\*/i,
  /^\s*-?\s*\*\*Figma-File-URL:\*\*/i,
  /^\s*-?\s*\*\*Figma-File-Version:\*\*/i,
  /^\s*-?\s*\*\*Last-Confirmed:\*\*/i,
  /^\s*-?\s*\*\*Linked\s+(FRs|Component|SRS|anchor|US-IDs?|FR-IDs?|artifacts?):\*\*/i,
  /^\s*-?\s*\*\*Refs?:\*\*/i,
  /^\s*-?\s*Refs?:\s+ADR/i,
];

function isAuditAnnotationLine(line) {
  return AUDIT_ANNOTATION_PATTERNS.some(rx => rx.test(line));
}

// Forbidden upstream-back-reference patterns in body content.
// These match anywhere within the line.
const FORBIDDEN_PATTERNS = [
  // Substantive back-references to docs/requirements/
  { rx: /\b(see|refer to|details (in|at)|per)\s+docs\/requirements\//i, kind: 'docs/requirements/ back-reference' },
  { rx: /\bdocs\/requirements\/\S+\.(md|txt|docx|pdf|html)\s*(for|carries|describes|defines)/i, kind: 'docs/requirements/ content-load reference' },

  // Substantive back-references to docs/archaeology-reports/
  { rx: /\b(see|refer to|details (in|at)|per)\s+docs\/archaeology-reports\//i, kind: 'docs/archaeology-reports/ back-reference' },
  { rx: /\bdocs\/archaeology-reports\/\S+\.md\s*(for|carries|describes|defines)/i, kind: 'docs/archaeology-reports/ content-load reference' },

  // Substantive back-references to external sources (Confluence / Notion / Jira / SharePoint)
  { rx: /\b(see|refer to|details (in|at))\s+(Confluence\s+page|Notion\s+page|Jira\s+(epic|ticket)|SharePoint\s+doc)\b/i, kind: 'external-source back-reference' },
  { rx: /\b(see|refer to|details (in|at))\s+(confluence|notion|jira-epic|sharepoint):\/\//i, kind: 'external-source URL back-reference' },

  // Code-path back-references in body (allowed inside fenced blocks; those are stripped before parsing)
  { rx: /\b(see|refer to|details (in|at))\s+(services|src|lib|app)\/\S+\.(go|ts|tsx|js|jsx|py|java|rs|cs|swift|kt|dart)\b/i, kind: 'code-path back-reference' },
];

function findViolations(content) {
  const violations = [];
  // First strip fenced blocks (forbidden refs inside code fences are fine — illustrative)
  const stripped = stripFencedCodeBlocks(content);
  const lines = stripped.split('\n');

  // Detect whether we're inside the §10 Changelog table region — those lines may
  // legitimately mention upstream paths as historical record.
  let inChangelogSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track changelog section entry/exit
    if (/^##\s+10\.\s+\[?Changelog/i.test(line) || /^##\s+Changelog\b/i.test(line)) {
      inChangelogSection = true;
      continue;
    }
    if (/^##\s+/.test(line) && inChangelogSection) {
      // Next ## section starts — exit changelog
      inChangelogSection = false;
    }
    if (inChangelogSection) continue;

    // Audit-annotation lines are allowed
    if (isAuditAnnotationLine(line)) continue;

    // Check forbidden patterns
    for (const { rx, kind } of FORBIDDEN_PATTERNS) {
      const m = line.match(rx);
      if (m) {
        violations.push({
          lineNo: i + 1,
          line: line.trim().substring(0, 160),
          kind,
          matched: m[0],
        });
        break; // one violation per line
      }
    }
  }
  return violations;
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
      `self-containment-validator: malformed event JSON: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  if (toolName !== 'Write') process.exit(0);

  const filePath = toolInput.file_path || '';
  if (!isKitArtifact(filePath)) process.exit(0);

  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  const violations = findViolations(content);
  if (violations.length === 0) process.exit(0);

  process.stderr.write(
    `self-containment-validator: BLOCKED — ${filePath} contains substantive back-references to upstream input.\n` +
    `  Per CLAUDE.md §10 self-containment invariant: kit artifacts are self-contained for engineering use;\n` +
    `  body content must not reference upstream sources (downstream agents read kit artifacts only).\n\n` +
    `  Violations (${violations.length}):\n`
  );
  for (const v of violations.slice(0, 10)) {
    process.stderr.write(
      `    line ${v.lineNo}: [${v.kind}]\n` +
      `      "${v.line}"\n` +
      `      matched: "${v.matched}"\n`
    );
  }
  if (violations.length > 10) {
    process.stderr.write(`    ... and ${violations.length - 10} more.\n`);
  }
  process.stderr.write(
    `\n  Fix: inline the referenced content directly into the kit artifact.\n` +
    `  If the upstream source doesn't have the content, leave a TODO marker + raise an OQ\n` +
    `  in SRS §8 (no-invention invariant); do NOT replace with an upstream reference.\n\n` +
    `  Allowed (won't block):\n` +
    `    - Audit annotations: **Synthesized-From:** / **Source:** / **Source-Hash:** / etc.\n` +
    `    - Lateral kit refs: **Linked FRs:** / **Linked Component:** / **Refs: ADR-NNNN**\n` +
    `    - §10 Changelog table entries\n` +
    `    - Lines inside fenced code blocks (illustrative examples)\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `self-containment-validator: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
