#!/usr/bin/env node
// .claude/hooks/external-integration-adequacy-validator.cjs
// PreToolUse hook: enforces CLAUDE.md §10 strict gate
// "External-integration adequacy gate."
//
// SRS Status MUST NOT flip to `Signed-off` while any file under
// docs/external-integrations/<system-slug>.md carries `Adequacy:` that is
// neither `adequate` nor `deprecated` (or missing the field entirely).
//
// Pass-through states (do NOT block sign-off):
//   - `adequate`   - every Operation has full interface detail (active integration).
//   - `deprecated` - integration retired but the file is retained for audit per
//                    SRS 3.5. The adequacy gate exists to guarantee a downstream
//                    dev can safely build against an ACTIVE integration; a deprecated
//                    one has no active consumer, so the gate does not apply to it.
//                    Provenance guard (BA Phase 2 step 3, not this hook): a deprecated
//                    file must be cross-referenced as deprecated in the SRS 3.5 index,
//                    so this state cannot skip adequacy work on a live system.
// Blocking states: `inadequate`, `deferred`, and missing-field all still block.
//
// Trigger:
//   - tool_name == 'Write' OR 'Edit'
//   - tool_input.file_path resolves to docs/SRS.md
//   - the post-write content carries `Status: Signed-off`
//
// Action:
//   - exit 0: allow (gate open OR no integrations to validate)
//   - exit 2: block (stderr message names the offending file(s))
//
// Fail-open: any internal error allows the write with a stderr warning.
// The prose rule in CLAUDE.md §10 + BA Phase 2 step 3 are the authoritative
// controls; this hook catches the common forget-to-validate case.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripFencedCodeBlocks } = require('./lib/strip-fences.cjs');
const { parseHeaderField } = require('./lib/parse-header.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SRS_PATH_PATTERN = /(^|\/)docs\/SRS\.md$/i;
const INTEGRATIONS_DIR = path.join(ROOT, 'docs/external-integrations');

function isSrsPath(p) {
  return typeof p === 'string' && SRS_PATH_PATTERN.test(p);
}

// Parse Status: header value from SRS content (uses first 4000 chars; header
// region only — Status mentions in changelog body don't shadow). Uses the
// shared parseHeaderField helper so all hooks recognize the same markdown
// variants the kit templates emit (**Status:** Signed-off, etc.).
function parseSrsStatus(content) {
  const stripped = stripFencedCodeBlocks(content);
  const head = stripped.slice(0, 4000);
  return parseHeaderField(head, 'Status');
}

// Compute the post-write SRS content for both Write and Edit ops.
function computeFinalContent(toolName, toolInput) {
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    const filePath = toolInput.file_path;
    if (!filePath || !fs.existsSync(filePath)) return null; // Can't compute
    let current;
    try {
      current = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
    const oldStr = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newStr = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    if (!oldStr) return current;
    if (toolInput.replace_all) {
      return current.split(oldStr).join(newStr);
    }
    // Single replace — only if old_string occurs exactly once (matches Edit semantics)
    const idx = current.indexOf(oldStr);
    if (idx === -1) return current; // edit will fail at exec time; let it
    return current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
  }
  return null;
}

// Scan docs/external-integrations/ for every *.md file. Returns:
//   { exists: bool, files: [{ path, name, adequacy }] }
// adequacy is one of 'adequate' | 'deprecated' | 'inadequate' | 'deferred' | 'missing'
function scanIntegrations() {
  if (!fs.existsSync(INTEGRATIONS_DIR)) {
    return { exists: false, files: [] };
  }
  let entries;
  try {
    entries = fs.readdirSync(INTEGRATIONS_DIR, { withFileTypes: true });
  } catch (e) {
    throw new Error(`cannot read ${INTEGRATIONS_DIR}: ${e.message}`);
  }
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.md')) continue;
    const filePath = path.join(INTEGRATIONS_DIR, ent.name);
    let content;
    try {
      content = stripFencedCodeBlocks(fs.readFileSync(filePath, 'utf8'));
    } catch {
      // Treat unreadable as missing-field (conservative)
      files.push({ path: filePath, name: ent.name, adequacy: 'missing' });
      continue;
    }
    const head = content.slice(0, 4000);
    // Uses shared parseHeaderField so this tolerates **Adequacy:**,
    // - **Adequacy:**, Adequacy:, etc. uniformly with srs-status-guard.
    const raw = (parseHeaderField(head, 'Adequacy') || '').toLowerCase();
    let adequacy;
    if (raw === 'adequate') adequacy = 'adequate';
    else if (raw === 'deprecated') adequacy = 'deprecated';
    else if (raw === 'inadequate') adequacy = 'inadequate';
    else if (raw === 'deferred') adequacy = 'deferred';
    else adequacy = 'missing';
    files.push({ path: filePath, name: ent.name, adequacy });
  }
  return { exists: true, files };
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
      `external-integration-adequacy-validator: malformed event JSON: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = toolInput.file_path || '';
  if (!isSrsPath(filePath)) process.exit(0);

  const finalContent = computeFinalContent(toolName, toolInput);
  if (finalContent === null) process.exit(0); // Can't compute; let downstream tools error

  const newStatus = parseSrsStatus(finalContent);
  if (newStatus !== 'Signed-off') process.exit(0); // Gate fires only on Signed-off transition

  // SRS is being set to Signed-off. Scan integrations.
  let scan;
  try {
    scan = scanIntegrations();
  } catch (e) {
    process.stderr.write(
      `external-integration-adequacy-validator: scan error: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  if (!scan.exists) process.exit(0); // No directory → no integrations to validate (BA Phase 2 pairing check catches SRS §3.5 vs missing files)

  // Pass-through states do not block sign-off: 'adequate' (active, fully specified)
  // and 'deprecated' (retired, retained for audit per SRS 3.5 - no active consumer).
  const PASS_THROUGH = new Set(['adequate', 'deprecated']);
  const nonAdequate = scan.files.filter(f => !PASS_THROUGH.has(f.adequacy));
  if (nonAdequate.length === 0) process.exit(0); // All good

  // Block with helpful error
  process.stderr.write(
    `external-integration-adequacy-validator: BLOCKED — SRS Status flip to Signed-off refused.\n` +
    `  Per CLAUDE.md §10 External-integration adequacy gate (strict):\n` +
    `    Every docs/external-integrations/<system-slug>.md must carry Adequacy: adequate\n` +
    `    before BA may sign off the SRS. The following ${nonAdequate.length} file(s) fail the gate:\n\n`
  );
  for (const f of nonAdequate.slice(0, 20)) {
    const label = f.adequacy === 'missing' ? 'Adequacy field MISSING' : `Adequacy: ${f.adequacy}`;
    process.stderr.write(`    - docs/external-integrations/${f.name}  [${label}]\n`);
  }
  if (nonAdequate.length > 20) {
    process.stderr.write(`    ... and ${nonAdequate.length - 20} more.\n`);
  }
  process.stderr.write(
    `\n  Fix: dispatch SA in external-integration-adequacy mode against the listed files.\n` +
    `  SA fills §2 Operations / §3 Auth / §4 NFR / §5 Failure Modes / §7 Open Adequacy Issues,\n` +
    `  then sets Adequacy: adequate when §7 is empty AND every §2 operation is complete.\n\n` +
    `  SA is the ONLY agent permitted to flip Adequacy to adequate (CLAUDE.md §10 hard rule).\n` +
    `  BA's Phase 2 step 3 also runs this check as a final audit before sign-off.\n` +
    `  If a system is genuinely deferred per Approver decision, that's recorded as a SRS §8 OQ,\n` +
    `  NOT by setting Adequacy: deferred (the strict gate does not accept deferred).\n` +
    `  If a system is RETIRED and the file is retained only for audit, set Adequacy: deprecated\n` +
    `  AND mark it deprecated in the SRS §3.5 index — deprecated passes the gate (no active consumer).\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `external-integration-adequacy-validator: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
