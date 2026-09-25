#!/usr/bin/env node
// .claude/hooks/privacy-check.cjs
// PreToolUse hook: blocks tool calls that read or expose sensitive paths
// (env files, secrets, private keys, SSH/AWS/GCloud creds, kubeconfig, netrc).
//
// Hook protocol (Claude Code):
//   - stdin: JSON event { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message is shown to the agent)
//   - any other non-zero: non-blocking warning
//
// Override for current session: CLAUDE_PRIVACY_OK=1 (set in the env Claude Code is LAUNCHED with; an inline prefix or a Bash-call export never reaches hooks)
// Allowlist: .env.example, .env.template, .env.sample.
// Bash may reference project-root .ssh/.k8s config files as command inputs
// (ssh -F .ssh/config, kubectl --kubeconfig .k8s/config) without reading them.
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
  /(^|\/)\.ssh($|\/)/,                        // project/home .ssh contents
  /(^|\/)\.aws\/credentials/,                 // AWS creds
  /(^|\/)\.config\/gcloud\//,                 // GCP creds
  /(^|\/)\.kube\/config/,                     // kubeconfig (contains tokens)
  /(^|\/)\.k8s\/(?:config|kubeconfig(?:[._-][^\/]+)?|.*kubeconfig.*)$/i,
  /(^|\/)\.k8s\/.*(?:secret|token|credential|client-key|client-certificate).*$/i,
  /(^|\/)(?:kubeconfig|kube-config)(?:[._-][^\/]+)?(?:\.(?:ya?ml|json))?$/i,
  /(^|\/)secrets?\.(?:ya?ml|yaml|json|env)$/i,
  /(^|\/)\.docker\/config\.json$/,            // Docker registry auth
  /(^|\/)\.netrc(\.|$)/,                      // netrc
];

const ALLOWLIST = [
  /(^|\/)\.env\.example$/,
  /(^|\/)\.env\.template$/,
  /(^|\/)\.env\.sample$/,
];

const BARE_RELATIVE_SENSITIVE_PATTERNS = [
  /^\.env(?:\.|$)/,
  /^secrets?\//,
  /^credentials?\//,
  /^private\//,
  /^\.ssh(?:\/|$)/,
  /^\.k8s\/(?:config|kubeconfig(?:[._-][^\/]+)?|.*kubeconfig.*)$/i,
  /^\.k8s\/.*(?:secret|token|credential|client-key|client-certificate).*$/i,
  /^\.docker\/config\.json$/,
  /^secrets?\.(?:ya?ml|yaml|json|env)$/i,
  /^(?:kubeconfig|kube-config)(?:[._-][^\/]+)?(?:\.(?:ya?ml|json))?$/i,
];

function isSensitive(s) {
  if (typeof s !== 'string' || !s) return false;
  for (const re of ALLOWLIST) if (re.test(s)) return false;
  for (const re of SENSITIVE_PATTERNS) if (re.test(s)) return true;
  return false;
}

function isSensitiveShellToken(token) {
  if (typeof token !== 'string' || !token) return false;
  const cleaned = token.replace(/^[`'"]+/, '').replace(/[`'",;:]+$/, '');
  if (!cleaned) return false;
  if (isSensitive(cleaned)) return true;
  for (const re of BARE_RELATIVE_SENSITIVE_PATTERNS) {
    if (re.test(cleaned)) return true;
  }
  return false;
}

function stripAllowedOperationalRefs(command) {
  let sanitized = command;
  // Allow operational use of project-root SSH/K8s config by reference. The
  // credential files still cannot be read through file tools or shell readers.
  sanitized = sanitized.replace(
    /(^|\s)-F\s+(?:"[^"]*\.ssh\/config"|'[^']*\.ssh\/config'|\S*\.ssh\/config)(?=\s|["']|$)/g,
    '$1-F <ssh-config>'
  );
  sanitized = sanitized.replace(
    /(^|\s)--kubeconfig(?:=|\s+)(?:"[^"]*\.k8s\/[^"]+"|'[^']*\.k8s\/[^']+'|\S*\.k8s\/\S+)(?=\s|["']|$)/g,
    '$1--kubeconfig <kubeconfig>'
  );
  sanitized = sanitized.replace(
    /(^|\s)KUBECONFIG=(?:"[^"]*\.k8s\/[^"]+"|'[^']*\.k8s\/[^']+'|\S*\.k8s\/\S+)(?=\s|["']|$)/g,
    '$1KUBECONFIG=<kubeconfig>'
  );
  return sanitized;
}

function isSensitiveBashCommand(command) {
  if (typeof command !== 'string' || !command) return false;

  // These commands print credential material even when the credential path is
  // referenced only as a kubectl input flag.
  if (/\bkubectl\b[\s\S]*\bconfig\s+view\b/i.test(command)) return true;
  if (/\bssh\b[\s\S]*\b(?:env|printenv|set)\b/i.test(command)) return true;

  const sanitized = stripAllowedOperationalRefs(command);
  if (isSensitive(sanitized)) return true;
  return sanitized.split(/\s+/).some(isSensitiveShellToken);
}

function extractCandidates(toolName, toolInput) {
  // Returns array of { kind, value } candidates to scan for sensitive patterns.
  if (!toolInput || typeof toolInput !== 'object') return [];
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return [toolInput.file_path, toolInput.notebook_path].filter(Boolean).map(value => ({ kind: 'path', value }));
    case 'Glob':
    case 'Grep':
      return [toolInput.path, toolInput.pattern].filter(Boolean).map(value => ({ kind: 'path', value }));
    case 'Bash':
      return [toolInput.command].filter(Boolean).map(value => ({ kind: 'bash', value }));
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

  for (const candidate of candidates) {
    const c = candidate.value;
    const blocked = candidate.kind === 'bash' ? isSensitiveBashCommand(c) : isSensitive(c);
    if (blocked) {
      const display = c.length > 200 ? c.slice(0, 200) + '…' : c;
      process.stderr.write(
        `privacy-check: refusing ${toolName} on sensitive path/command: ${display}\n` +
        `  Sensitive patterns: .env*, secrets/, *.pem/.key, .ssh/, .k8s kubeconfig/secret files, ~/.aws/credentials, ~/.kube/config, .docker/config.json, .netrc\n` +
        `  Allowlisted: .env.example, .env.template, .env.sample\n` +
        `  Operational references allowed: ssh -F .ssh/config, kubectl/helm --kubeconfig .k8s/<config>\n` +
        `  To override for this session: CLAUDE_PRIVACY_OK=1 (set in the env Claude Code is LAUNCHED with; an inline prefix or a Bash-call export never reaches hooks)\n`
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
