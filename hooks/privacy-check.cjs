#!/usr/bin/env node
// .claude/hooks/privacy-check.cjs
// PreToolUse hook: blocks tool calls that touch sensitive paths
// (env files, secrets, private keys, SSH/AWS/GCloud creds, kubeconfig, netrc).
//
// Hook protocol (Claude Code):
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message is shown to the agent)
//   - any other non-zero: non-blocking warning
//
// Override for current session: export CLAUDE_PRIVACY_OK=1
// Allowlist: .env.example, .env.template, .env.sample
//
// Patterns are at the top of the file — extend there.

'use strict';

const SENSITIVE_PATTERNS = [
  /(^|\/)\.env(\.|$)/,                       // .env, .env.local, .env.production, .env.<anything>
  /(^|\/)secrets?\//,                         // secrets/, secret/
  /(^|\/)credentials?\//,                     // credentials/, credential/
  /(^|\/)private\//,                          // private/
  /\.(pem|key|p12|pfx)$/,                     // private key files
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,   // common SSH key filenames
  /(^|\/)\.ssh\//,                            // ~/.ssh contents
  /(^|\/)\.aws\/credentials/,                 // AWS creds
  /(^|\/)\.config\/gcloud\//,                 // GCP creds
  /(^|\/)\.kube\/config/,                     // kubeconfig (contains tokens)
  /(^|\/)\.netrc(\.|$)/,                      // netrc
];

const ALLOWLIST = [
  /(^|\/)\.env\.example$/,
  /(^|\/)\.env\.template$/,
  /(^|\/)\.env\.sample$/,
];

function isSensitive(s) {
  if (typeof s !== 'string' || !s) return false;
  for (const re of ALLOWLIST) if (re.test(s)) return false;
  for (const re of SENSITIVE_PATTERNS) if (re.test(s)) return true;
  return false;
}

function extractCandidates(toolName, toolInput) {
  // Returns array of strings to scan for sensitive patterns.
  if (!toolInput || typeof toolInput !== 'object') return [];
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return [toolInput.file_path, toolInput.notebook_path].filter(Boolean);
    case 'Glob':
    case 'Grep':
      return [toolInput.path, toolInput.pattern].filter(Boolean);
    case 'Bash':
      return [toolInput.command].filter(Boolean);
    default:
      return [];
  }
}

async function main() {
  // Honor explicit override before anything else.
  if (process.env.CLAUDE_PRIVACY_OK === '1') process.exit(0);

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`privacy-check: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const candidates = extractCandidates(toolName, toolInput);

  for (const c of candidates) {
    if (isSensitive(c)) {
      const display = c.length > 200 ? c.slice(0, 200) + '…' : c;
      process.stderr.write(
        `privacy-check: refusing ${toolName} on sensitive path/command: ${display}\n` +
        `  Sensitive patterns: .env*, secrets/, *.pem/.key, ~/.ssh, ~/.aws/credentials, ~/.kube/config, .netrc\n` +
        `  Allowlisted: .env.example, .env.template, .env.sample\n` +
        `  To override for this session: export CLAUDE_PRIVACY_OK=1\n`
      );
      process.exit(2);
    }
  }
  process.exit(0);
}

main().catch(err => {
  // Never block on hook bugs — surface to stderr and allow.
  process.stderr.write(`privacy-check: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});
