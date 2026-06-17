#!/usr/bin/env node
// .claude/hooks/pre-install-dependency-verifier.cjs
// PreToolUse hook (Bash): verifies the safety of packages BEFORE they are
// downloaded and installed, by querying trusted sources. The companion
// post-bash-security-audit.cjs detects what an install DID; this hook stops
// known-bad packages from ever executing.
//
// Trusted sources:
//   1. OSV.dev (https://osv.dev) — Google's open vulnerability database,
//      aggregating GitHub Security Advisories, the malicious-packages repo
//      (MAL-* advisories), PyPA, RustSec, etc. Queried via /v1/querybatch.
//   2. deps.dev (https://deps.dev) — Google's package-metadata service.
//      Used to resolve unpinned installs to the concrete version that WOULD
//      be installed, and for publish-date heuristics.
//
// Tiered enforcement (per operator decision 2026-06-12):
//   BLOCK (exit 2)  — any OSV advisory with a MAL- id (known malware) for
//                     the version being installed (or for the package, when
//                     the version cannot be resolved).
//   WARN  (exit 0)  — non-malware advisories (CVE / GHSA / PYSEC / RUSTSEC),
//                     version published <7 days ago, package first published
//                     <30 days ago, unverifiable specs (git+ / URL installs).
//                     Warnings are injected via additionalContext + stderr.
//   FAIL-OPEN       — network unreachable / timeout / unknown ecosystem:
//                     allow with a "verification skipped" warning. Matches
//                     the kit's fail-open hook convention.
//
// Covered commands: npm/yarn/pnpm/bun install|add, npx / yarn dlx / pnpm dlx
// / bunx (immediate-execution installs), pip/pip3/python -m pip install,
// poetry add, uv add / uv pip install, pipx install|run, uvx, cargo
// add|install, go get|install, gem install, composer require.
//
// Cache: verdicts cached 24h at .claude/hooks/.state/verify-cache.json so
// repeated installs of the same spec don't re-query.
//
// Env:
//   CLAUDE_SKIP_DEPENDENCY_VERIFY=1   escape hatch (use sparingly; document)
//   CLAUDE_VERIFY_OSV_BASE            override OSV base URL (tests)
//   CLAUDE_VERIFY_DEPSDEV_BASE        override deps.dev base URL (tests)
//   CLAUDE_VERIFY_TIMEOUT_MS          per-request timeout (default 4000)
//
// Fail-open: any internal error allows the command with a stderr warning.

'use strict';

const fs = require('fs');
const path = require('path');

const OSV_BASE = process.env.CLAUDE_VERIFY_OSV_BASE || 'https://api.osv.dev';
const DEPSDEV_BASE = process.env.CLAUDE_VERIFY_DEPSDEV_BASE || 'https://api.deps.dev';
const TIMEOUT_MS = parseInt(process.env.CLAUDE_VERIFY_TIMEOUT_MS || '4000', 10);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEW_VERSION_DAYS = 7;   // version published more recently => warn
const NEW_PACKAGE_DAYS = 30;  // package first published more recently => warn
const MAX_SPECS = 30;

// ---------------------------------------------------------------------------
// Command parsing — extract {ecosystem, name, version|null, raw} specs
// ---------------------------------------------------------------------------

// OSV ecosystem names + deps.dev system names per package manager family.
const ECO = {
  npm: { osv: 'npm', depsdev: 'npm' },
  pypi: { osv: 'PyPI', depsdev: 'pypi' },
  cargo: { osv: 'crates.io', depsdev: 'cargo' },
  go: { osv: 'Go', depsdev: 'go' },
  rubygems: { osv: 'RubyGems', depsdev: null },
  packagist: { osv: 'Packagist', depsdev: null },
};

function splitSegments(command) {
  // Split a shell command on common separators; good enough for matching.
  return String(command).split(/(?:&&|\|\||;|\||\n)/);
}

function tokens(segment) {
  return segment.trim().split(/\s+/).filter(Boolean);
}

// Flags whose VALUE follows as the next token (so we skip it too).
const VALUE_FLAGS = new Set([
  '--registry', '--prefix', '-C', '--dir', '--cwd', '--filter', '-w',
  '--workspace', '--index-url', '-i', '--extra-index-url', '-r',
  '--requirement', '--python', '-p', '--tag',
]);

function collectArgs(toks, startIdx) {
  const out = [];
  for (let i = startIdx; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith('-')) {
      if (VALUE_FLAGS.has(t)) i++; // skip flag value
      continue;
    }
    out.push(t);
  }
  return out;
}

function parseNpmSpec(raw) {
  // name | name@version | @scope/name | @scope/name@version | tarball/git/url
  if (/^(?:git\+|https?:\/\/|git:\/\/|file:|\.{0,2}\/)/.test(raw)) {
    return { name: raw, version: null, unverifiable: true };
  }
  const m = raw.match(/^(@[^/@]+\/[^@]+|[^@]+)(?:@(.+))?$/);
  if (!m) return null;
  let version = m[2] || null;
  // Ranges and dist-tags are not exact versions — treat as unpinned.
  if (version && !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) version = null;
  return { name: m[1], version };
}

function parsePipSpec(raw) {
  if (/^(?:git\+|https?:\/\/|\.{0,2}\/|-e$)/.test(raw)) {
    return { name: raw, version: null, unverifiable: true };
  }
  const m = raw.match(/^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?(?:==([\w.!+-]+))?/);
  if (!m || !m[1]) return null;
  return { name: m[1].toLowerCase(), version: m[2] || null };
}

function parseGenericAtSpec(raw) {
  // cargo/go style: name@version (go uses module paths)
  if (/^(?:https?:\/\/|\.{0,2}\/)/.test(raw)) {
    return { name: raw, version: null, unverifiable: true };
  }
  const at = raw.lastIndexOf('@');
  if (at > 0) {
    const v = raw.slice(at + 1).replace(/^v/, '');
    if (/^\d+\.\d+(\.\d+)?/.test(v)) return { name: raw.slice(0, at), version: v };
  }
  return { name: raw, version: null };
}

function extractSpecs(command) {
  const specs = [];
  const push = (eco, parsed) => {
    if (parsed && parsed.name) specs.push({ eco, ...parsed, raw: parsed.name + (parsed.version ? `@${parsed.version}` : '') });
  };
  for (const seg of splitSegments(command)) {
    const t = tokens(seg);
    if (t.length === 0) continue;
    // strip leading env assignments / sudo / time
    let s = 0;
    while (s < t.length && (/^[A-Z_][A-Z0-9_]*=/.test(t[s]) || t[s] === 'sudo' || t[s] === 'time' || t[s] === 'env')) s++;
    const cmd = t[s];
    const rest = t.slice(s);
    if (!cmd) continue;

    // --- npm family ---
    if (/^(npm|pnpm|yarn|bun)$/.test(cmd)) {
      const sub = rest[1];
      if (/^(install|i|add|update|up|upgrade)$/.test(sub || '')) {
        for (const a of collectArgs(rest, 2)) push('npm', parseNpmSpec(a));
      } else if (sub === 'dlx' || (cmd === 'npm' && sub === 'exec')) {
        const args = collectArgs(rest, 2);
        if (args[0]) push('npm', parseNpmSpec(args[0]));
      }
    } else if (cmd === 'npx' || cmd === 'bunx') {
      const args = collectArgs(rest, 1);
      if (args[0]) push('npm', parseNpmSpec(args[0]));
    }

    // --- Python family ---
    else if (/^pip3?$/.test(cmd)) {
      if (rest[1] === 'install') for (const a of collectArgs(rest, 2)) push('pypi', parsePipSpec(a));
    } else if (/^python3?$/.test(cmd)) {
      if (rest[1] === '-m' && rest[2] === 'pip' && rest[3] === 'install') {
        for (const a of collectArgs(rest, 4)) push('pypi', parsePipSpec(a));
      }
    } else if (cmd === 'poetry') {
      if (rest[1] === 'add') for (const a of collectArgs(rest, 2)) push('pypi', parsePipSpec(a));
    } else if (cmd === 'uv') {
      if (rest[1] === 'add') for (const a of collectArgs(rest, 2)) push('pypi', parsePipSpec(a));
      else if (rest[1] === 'pip' && rest[2] === 'install') for (const a of collectArgs(rest, 3)) push('pypi', parsePipSpec(a));
    } else if (cmd === 'pipx') {
      if (/^(install|run)$/.test(rest[1] || '')) {
        const args = collectArgs(rest, 2);
        if (args[0]) push('pypi', parsePipSpec(args[0]));
      }
    } else if (cmd === 'uvx') {
      const args = collectArgs(rest, 1);
      if (args[0]) push('pypi', parsePipSpec(args[0]));
    }

    // --- other ecosystems (OSV-only depth) ---
    else if (cmd === 'cargo') {
      if (/^(add|install)$/.test(rest[1] || '')) for (const a of collectArgs(rest, 2)) push('cargo', parseGenericAtSpec(a));
    } else if (cmd === 'go') {
      if (/^(get|install)$/.test(rest[1] || '')) for (const a of collectArgs(rest, 2)) push('go', parseGenericAtSpec(a));
    } else if (cmd === 'gem') {
      if (rest[1] === 'install') for (const a of collectArgs(rest, 2)) push('rubygems', { name: a, version: null });
    } else if (cmd === 'composer') {
      if (/^(require|global)$/.test(rest[1] || '')) {
        for (const a of collectArgs(rest, rest[1] === 'global' ? 3 : 2)) {
          const m = a.match(/^([^:]+\/[^:]+)(?::(.+))?$/);
          if (m) push('packagist', { name: m[1], version: m[2] && /^\d/.test(m[2]) ? m[2] : null });
        }
      }
    }
  }
  return specs.slice(0, MAX_SPECS);
}

// ---------------------------------------------------------------------------
// Trusted-source clients (fetch-based; fail-open on any error)
// ---------------------------------------------------------------------------

async function httpJson(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { data: await res.json() };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

// deps.dev: resolve the default (would-be-installed) version + publish dates.
async function fetchMetadata(spec) {
  const system = ECO[spec.eco].depsdev;
  if (!system) return { skipped: true };
  const url = `${DEPSDEV_BASE}/v3/systems/${system}/packages/${encodeURIComponent(spec.name)}`;
  const { data, error } = await httpJson(url);
  if (error) return { error };
  const versions = (data && data.versions) || [];
  let resolved = spec.version;
  let resolvedPublishedAt = null;
  let firstPublishedAt = null;
  for (const v of versions) {
    const ver = v.versionKey && v.versionKey.version;
    const pub = v.publishedAt ? Date.parse(v.publishedAt) : null;
    if (pub && (firstPublishedAt === null || pub < firstPublishedAt)) firstPublishedAt = pub;
    if (!spec.version && v.isDefault) { resolved = ver; resolvedPublishedAt = pub; }
    if (spec.version && ver === spec.version) resolvedPublishedAt = pub;
  }
  return { resolved, resolvedPublishedAt, firstPublishedAt };
}

// OSV: advisories for the (resolved) version, or package-level when unknown.
async function fetchAdvisories(spec, resolvedVersion) {
  const q = { package: { name: spec.name, ecosystem: ECO[spec.eco].osv } };
  if (resolvedVersion) q.version = resolvedVersion;
  const { data, error } = await httpJson(`${OSV_BASE}/v1/querybatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries: [q] }),
  });
  if (error) return { error };
  const vulns = (data && data.results && data.results[0] && data.results[0].vulns) || [];
  return { ids: vulns.map((v) => v.id) };
}

// ---------------------------------------------------------------------------
// Verdict cache
// ---------------------------------------------------------------------------

function cachePath() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(root, '.claude', 'hooks', '.state', 'verify-cache.json');
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(cachePath(), 'utf8')); } catch { return {}; }
}

function saveCache(cache) {
  try {
    const p = cachePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n');
  } catch { /* fail-open */ }
}

// ---------------------------------------------------------------------------
// Per-spec verification
// ---------------------------------------------------------------------------

async function verifySpec(spec, cache) {
  const key = `${spec.eco}:${spec.name}@${spec.version || 'unpinned'}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { ...hit.result, cached: true };

  const result = { blocks: [], warns: [], skips: [] };

  if (spec.unverifiable) {
    result.warns.push(`"${spec.raw}" installs from a URL / git / local path — cannot be verified against advisory databases. Prefer a registry-published, pinned version.`);
    cache[key] = { ts: Date.now(), result };
    return result;
  }

  // 1. Resolve version + publish-date heuristics (deps.dev).
  const meta = await fetchMetadata(spec);
  let resolved = spec.version;
  if (meta.error) {
    result.skips.push(`metadata lookup failed for ${spec.name} (${meta.error})`);
  } else if (!meta.skipped) {
    resolved = meta.resolved || spec.version;
    const now = Date.now();
    if (meta.firstPublishedAt && now - meta.firstPublishedAt < NEW_PACKAGE_DAYS * 864e5) {
      const days = Math.floor((now - meta.firstPublishedAt) / 864e5);
      result.warns.push(`"${spec.name}" was first published only ${days} day(s) ago — brand-new packages are the primary typosquat/malware window. Verify the name and publisher before trusting it.`);
    } else if (meta.resolvedPublishedAt && now - meta.resolvedPublishedAt < NEW_VERSION_DAYS * 864e5) {
      const days = Math.floor((now - meta.resolvedPublishedAt) / 864e5);
      result.warns.push(`"${spec.name}@${resolved}" was published ${days} day(s) ago — too new for advisory coverage. Consider pinning the previous stable version.`);
    }
    if (!spec.version && resolved) {
      result.notes = [`unpinned — resolves to ${resolved}`];
    }
  }

  // 2. Advisory lookup (OSV).
  const adv = await fetchAdvisories(spec, resolved);
  if (adv.error) {
    result.skips.push(`advisory lookup failed for ${spec.name} (${adv.error})`);
  } else if (adv.ids.length > 0) {
    const mal = adv.ids.filter((id) => id.startsWith('MAL-'));
    const rest = adv.ids.filter((id) => !id.startsWith('MAL-'));
    if (mal.length > 0) {
      result.blocks.push(`"${spec.name}${resolved ? '@' + resolved : ''}" is flagged as KNOWN MALWARE by OSV: ${mal.slice(0, 5).join(', ')} (https://osv.dev/vulnerability/${mal[0]}). Do NOT install.`);
    }
    if (rest.length > 0) {
      result.warns.push(`"${spec.name}${resolved ? '@' + resolved : ''}" has ${rest.length} known advisory(ies): ${rest.slice(0, 5).join(', ')}${rest.length > 5 ? ', …' : ''} — review at https://osv.dev/list?q=${encodeURIComponent(spec.name)} and prefer a patched version.`);
    }
  }

  // Don't cache results that came from partial lookups (skips) — retry next time.
  if (result.skips.length === 0) cache[key] = { ts: Date.now(), result };
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function readEvent() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
}

async function main() {
  if (process.env.CLAUDE_SKIP_DEPENDENCY_VERIFY === '1') return 0;
  if (typeof fetch !== 'function') {
    process.stderr.write('[pre-install-dependency-verifier] global fetch unavailable (node <18) — verification skipped (fail-open)\n');
    return 0;
  }

  const event = readEvent();
  const command = (event && event.tool_input && event.tool_input.command) || '';
  if (!command) return 0;

  const specs = extractSpecs(command);
  if (specs.length === 0) return 0;

  const cache = loadCache();
  const blocks = [], warns = [], skips = [];
  // Verify sequentially-batched (small N; keeps total time bounded).
  const results = await Promise.all(specs.map((s) => verifySpec(s, cache).catch((e) => ({ blocks: [], warns: [], skips: [`internal: ${e && e.message}`] }))));
  for (const r of results) {
    blocks.push(...r.blocks); warns.push(...r.warns); skips.push(...r.skips);
  }
  saveCache(cache);

  if (blocks.length > 0) {
    process.stderr.write(
      'BLOCKED by pre-install-dependency-verifier (trusted-source check):\n' +
      blocks.map((b) => `  - ${b}`).join('\n') + '\n' +
      (warns.length ? 'Additional warnings:\n' + warns.map((w) => `  - ${w}`).join('\n') + '\n' : '') +
      'This package matches a known-malware advisory. Choose a different package or version. ' +
      'Operator override (NOT recommended): CLAUDE_SKIP_DEPENDENCY_VERIFY=1 with rationale documented in SRS §10 Changelog.\n'
    );
    return 2; // PreToolUse block
  }

  const messages = [];
  if (warns.length > 0) messages.push('DEPENDENCY VERIFICATION WARNINGS (install allowed):\n' + warns.map((w) => `- ${w}`).join('\n'));
  if (skips.length > 0) messages.push('Verification partially skipped (fail-open): ' + skips.join('; '));

  if (messages.length > 0) {
    const text = messages.join('\n');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },
    }));
    process.stderr.write(`[pre-install-dependency-verifier]\n${text}\n`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`[pre-install-dependency-verifier] internal error (fail-open): ${e && e.message}\n`);
    process.exit(0);
  }
);
