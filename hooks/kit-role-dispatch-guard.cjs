#!/usr/bin/env node
// .claude/hooks/kit-role-dispatch-guard.cjs
// PreToolUse hook: blocks `subagent_type: general-purpose` dispatches when the
// prompt content looks like kit-role work (BA Mode X, SA extract, TL phasing,
// QA-Author by-us / by-task, FE/BE Dev implementation, DevOps deploy, QA-Exec,
// UI/UX Designer create/import/revise/incorporate, non-SDLC paths B1-B5).
//
// Enforces CLAUDE.md §10 hard rule "Role-specialized dispatch required" and
// orchestrator-operating-rules.md §9 Step 4.5.
//
// Hook protocol:
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Escape hatch: CLAUDE_ALLOW_GENERAL_PURPOSE=1 in env permits general-purpose
// for the one-off cross-cutting case. Use sparingly; document rationale in
// SRS §10 Changelog.

'use strict';

// Patterns that strongly indicate kit-role work. Substring match (case-insensitive
// against the dispatch prompt). Conservative — covers common phrasings; doesn't
// catch every possible obfuscation, which is by design (prose rule is authoritative).
const KIT_ROLE_PATTERNS = [
  // BA modes
  /\bBA\s+Mode\s+[A-F]\b/i,
  /\bba\.md\b/i,
  /\bingest-from-(single-doc|multi-doc|external-source|requirements-folder)\b/i,
  /\baugment-existing\b/i,
  /\breverse-engineer-from-code\b/i,
  /\bSRS\s+(sign-off|ingestion|augmentation)\b/i,
  /\bbusiness\s+analyst\b/i,

  // SA
  /\bSA\s+(extract|design)\s+mode\b/i,
  /\bSA\s+dispatch\b/i,
  /\bsa\.md\b/i,
  /\bsolution\s+architect\b/i,
  /\barchitecture\.md\b/i,

  // TL
  /\bTL\s+(phasing|backfill|dispatch)\b/i,
  /\btl\.md\b/i,
  /\btech\s+lead\b/i,
  /\bmaster-plan-proposal\b/i,

  // QA-Author
  /\bQA-Author\b/i,
  /\bqa-author\.md\b/i,
  /\bby-us\s+mode\b/i,
  /\bby-task\s+mode\b/i,
  /\bvisual-specs\/\b/i,

  // Devs
  /\bBE\s+Dev\b/i,
  /\bFE\s+Dev\b/i,
  /\bbe-dev\.md\b/i,
  /\bfe-dev\.md\b/i,
  /\bapi-contracts\/\b/i,

  // DevOps
  /\bDevOps\b/i,
  /\bdevops\.md\b/i,
  /\bdeploy-reports\/\b/i,

  // QA-Exec
  /\bQA-Exec\b/i,
  /\bqa-exec\.md\b/i,
  /\bqa-reports\/\b/i,

  // UI/UX Designer
  /\bUI\/UX\s+Designer\b/i,
  /\bui-ux-designer\.md\b/i,
  /\bdesigner\s+(create|import|revise|incorporate)\s+mode\b/i,

  // Agent Generator
  /\bAgent\s+Generator\b/i,
  /\bagent-generator\.md\b/i,

  // Non-SDLC paths
  /\bPath\s+B[12345]\b/i,
  /\bResearcher\b/i,
  /\bresearcher\.md\b/i,
  /\bDebugger\b/i,
  /\bdebugger\.md\b/i,
  /\bCode\s+Reviewer\b/i,
  /\bcode-reviewer\.md\b/i,
  /\bOQ\s+Resolver\b/i,
  /\boq-resolver\.md\b/i,
  /\bCodebase\s+Archaeologist\b/i,
  /\bcodebase-archaeologist\.md\b/i,
  /\barchaeology-reports\/\b/i,

  // Kit-specific artifacts that always belong to a role
  /\bdocs\/user-stories\/US-\d+/i,
  /\bdocs\/frs\/FR-\d+/i,
  /\bdocs\/plan\/(master-plan|phase-)/i,
  /\bplan-update\.json\b/i,
];

// Roles → expected subagent_type, for the helpful error message
const ROLE_HINTS = [
  { pattern: /\bBA\b|business\s+analyst|ingest-from-|augment-existing|reverse-engineer-from-code|SRS\s+sign-off|SRS\s+ingestion/i, hint: 'ba' },
  { pattern: /\barchitecture[- ]validator\b|architecture-validation-reports|validate\s+(the\s+)?architecture/i, hint: 'architecture-validator' },
  { pattern: /\bSA\b|solution\s+architect|architecture\.md|SA\s+extract|SA\s+design/i, hint: 'sa' },
  { pattern: /\bTL\b|tech\s+lead|master-plan-proposal/i, hint: 'tl' },
  { pattern: /\bQA-Author\b|by-us\s+mode|by-task\s+mode|visual-specs/i, hint: 'qa-author' },
  { pattern: /\bQA-Exec\b|qa-reports/i, hint: 'qa-exec' },
  { pattern: /\bBE\s+Dev\b|api-contracts/i, hint: 'be-dev' },
  { pattern: /\bFE\s+Dev\b/i, hint: 'fe-dev' },
  { pattern: /\bDevOps\b|deploy-reports/i, hint: 'devops' },
  { pattern: /\bUI\/UX\s+Designer\b|designer\s+(create|import|revise|incorporate)/i, hint: 'ui-ux-designer' },
  { pattern: /\bAgent\s+Generator\b/i, hint: 'agent-generator' },
  { pattern: /\bResearcher\b/i, hint: 'researcher' },
  { pattern: /\bDebugger\b/i, hint: 'debugger' },
  { pattern: /\bCode\s+Reviewer\b/i, hint: 'code-reviewer' },
  { pattern: /\bOQ\s+Resolver\b/i, hint: 'oq-resolver' },
  { pattern: /\bCodebase\s+Archaeologist\b|archaeology-reports/i, hint: 'codebase-archaeologist' },
];

function looksLikeKitRoleWork(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) return null;
  for (const pat of KIT_ROLE_PATTERNS) {
    const m = prompt.match(pat);
    if (m) return m[0];
  }
  return null;
}

function suggestSubagentType(prompt) {
  for (const { pattern, hint } of ROLE_HINTS) {
    if (pattern.test(prompt)) return hint;
  }
  return '<role>';
}

async function main() {
  // Escape hatch — operator-explicit permission
  if (process.env.CLAUDE_ALLOW_GENERAL_PURPOSE === '1') {
    process.stderr.write(
      'kit-role-dispatch-guard: CLAUDE_ALLOW_GENERAL_PURPOSE=1 set — bypass active.\n'
    );
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
    process.stderr.write(
      `kit-role-dispatch-guard: malformed event JSON: ${e.message} — failing open\n`
    );
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  if (toolName !== 'Task') process.exit(0);

  const toolInput = event.tool_input || {};
  const subagentType = toolInput.subagent_type || '';
  if (subagentType !== 'general-purpose') process.exit(0);

  // It IS a general-purpose Task dispatch. Check if the prompt looks like kit-role work.
  const prompt = (toolInput.prompt || toolInput.description || '').toString();
  const matched = looksLikeKitRoleWork(prompt);
  if (!matched) {
    // No kit-role signal; allow
    process.exit(0);
  }

  const suggested = suggestSubagentType(prompt);
  process.stderr.write(
    `kit-role-dispatch-guard: BLOCKED — Task dispatch uses subagent_type: general-purpose\n` +
    `  but the prompt contains a kit-role signal: "${matched}".\n` +
    `  Per CLAUDE.md §10 hard rule "Role-specialized dispatch required":\n` +
    `    Use subagent_type: ${suggested} instead of general-purpose.\n` +
    `  General-purpose strips the kit's mode procedures, Hard Rules, no-invention\n` +
    `  invariant, conflict-detection discipline, and tool scope.\n\n` +
    `  If .claude/agents/${suggested}.md is missing, dispatch the Agent Generator first\n` +
    `  (subagent_type: agent-generator) per orchestrator-operating-rules.md §9 Step 4.5.\n\n` +
    `  Override (one-off cross-cutting work only): export CLAUDE_ALLOW_GENERAL_PURPOSE=1\n` +
    `  and document the rationale in SRS §10 Changelog.\n`
  );
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(
    `kit-role-dispatch-guard: unexpected error: ${err && err.stack || err} — failing open\n`
  );
  process.exit(0);
});
