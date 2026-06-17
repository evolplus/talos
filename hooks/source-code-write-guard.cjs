#!/usr/bin/env node
// .claude/hooks/source-code-write-guard.cjs
// PreToolUse hook: blocks Write/Edit/MultiEdit/NotebookEdit on source code paths
// by DEFAULT. Sub-agents (which operate inside `.worktrees/<role>-<task-id>/`)
// are allowed because their paths fall under the `.worktrees/` exclusion segment.
// The Orchestrator — which operates at repo root — is blocked unless the
// `CLAUDE_ALLOW_ORCHESTRATOR_CODE=1` escape hatch is set.
//
// This hook now enforces TWO things:
//   1. Orchestrator-direct block — source writes OUTSIDE any worktree are blocked
//      (the original behavior; "Orchestrator does not write source code directly").
//   2. Source-layout gate — source writes INSIDE a worktree (the sub-agent case)
//      must land under a declared source root. The kit fixes `frontend/` (FE Dev)
//      and `backend/` (BE Dev) per SRS §3.4.5 Source Layout; lib/source-layout.cjs
//      resolves the allowed-root set (defaults + SRS §3.4.5 + CLAUDE_SOURCE_CODE_DIRS).
//      Escape hatch: CLAUDE_SKIP_SOURCE_LAYOUT_CHECK=1.
//
// Per CLAUDE.md §10 Hard Rules: "Orchestrator does not write source code directly."
// The Orchestrator coordinates; source-code changes go through the SDLC pipeline:
//   BA → SA → TL → BE Dev / FE Dev → DevOps → QA-Exec
//
// Gate semantics (block-by-default, inverted from kit v0.2 first draft):
//   - Default (no env var set):                           BLOCK source-code paths
//   - Path inside `.worktrees/<*>/` (sub-agent context):  ALLOW
//   - CLAUDE_ALLOW_ORCHESTRATOR_CODE=1 (escape hatch):    ALLOW with warning
//
// The previous version gated on CLAUDE_ORCHESTRATOR=1, but nothing in the kit
// reliably set that var, so the hook silently no-op'd in real sessions. Block
// is now the default; sub-agent context is identified by the worktree-path
// segment (which `.claude/rules/worktree-isolation.md` §5 already enforces).
//
// Source code detection (generic, project-agnostic):
//   1. Any path containing a `/src/` segment (at any nesting depth) with a
//      source-code file extension, excluding vendor/build/worktree directories.
//      Covers: server/src/**, web/src/**, src/**, packages/*/src/**, etc.
//   2. E2E test specs (e2e/**/*.spec.ts, e2e/**/*.test.ts, e2e/**/*.spec.js,
//      etc.) — these are also shipping code authored by QA-Author / Dev.
//   3. Custom directories via CLAUDE_SOURCE_CODE_DIRS env var (comma-separated
//      path prefixes, e.g. "worker/src,api/src" for non-standard layouts).
//
// Excluded (never blocked):
//   - .worktrees/<role>-<task-id>/** (well-formed sub-agent worktrees per
//     worktree-isolation.md §5; traversal escapes out of the worktree are blocked)
//   - node_modules/** (vendor deps — shouldn't be edited anyway)
//   - dist/**, build/**, out/**, .output/** (build artifacts)
//   - .claude/** (kit internals — Orchestrator legitimately writes here)
//   - docs/** (documentation — protected by other hooks)
//   - Files without source-code extensions under /src/ (e.g. JSON configs,
//     SQL migration files, YAML manifests)
//
// Hook protocol:
//   - stdin: { tool_name, tool_input, ... }
//   - exit 0: allow
//   - exit 2: block (stderr message shown to agent)
//
// Note: this hook does not parse Bash commands. A Bash redirect like
//   `echo ... > src/routes/new-route.ts` would still get through. That's an
//   explicit trade-off — Bash command parsing is brittle and the prose rule
//   (CLAUDE.md §10) is the authoritative control. The hook catches the
//   common-case file-tool path.

'use strict';

const { wellFormedWorktreePath, worktreeRelativePath } = require('./lib/worktree-scope.cjs');
const { getAllowedSourceRoots, isUnderAllowedRoot } = require('./lib/source-layout.cjs');

// ─── Source code file extensions ───
// Covers mainstream languages. Only files with these extensions under a source
// directory are protected — config files (JSON, YAML, SQL, etc.) are not blocked.
const SOURCE_CODE_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyi',
  // Go
  '.go',
  // Java / Kotlin
  '.java', '.kt', '.kts',
  // C / C++
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  // Rust
  '.rs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Swift / Objective-C
  '.swift', '.m', '.mm',
  // C#
  '.cs',
  // Dart / Flutter
  '.dart',
  // Scala
  '.scala',
  // Shell (shipping scripts, not one-off utilities)
  '.sh',
  // Vue / Svelte
  '.vue', '.svelte',
  // CSS / SCSS / LESS (when inside src/, these are component styles)
  '.css', '.scss', '.less',
  // HTML templates inside src/
  '.html',
]);

// ─── Excluded path segments ───
// Path segments that indicate vendor/build/doc directories — never treated as
// project source code regardless of nesting depth. Matched as /segment/ to
// avoid false positives (e.g. "distillery" won't match "dist").
const EXCLUDED_SEGMENTS = [
  'node_modules',
  'dist',
  'build',
  'out',
  '.output',
  '.claude',
  'docs',
  '.git',
  // NOTE: '.worktrees' is intentionally NOT a blanket exclusion. Worktree paths
  // are allowed via wellFormedWorktreePath() in isSourceCodePath() below, which
  // resolves `..` first so a traversal escape out of the worktree is still blocked.
];

// ─── E2E spec pattern ───
// E2E test specs are shipping code — authored by QA-Author and Dev.
const E2E_SPEC_RE = /(^|\/)e2e\/.*\.(spec|test)\.(ts|tsx|js|jsx|py|go|java|kt|rs|rb|php|cs|dart|swift)$/;

// ─── Source directory detection ───
// Any path containing a `/src/` segment at any depth, with a source-code extension.
// E.g. server/src/routes/foo.ts, web/src/pages/Foo.tsx, packages/lib/src/index.ts,
// just src/main.go (single-service project).
const SRC_SEGMENT_RE = /(^|\/)src\//;

function isExcluded(p) {
  // Match excluded directory names as path segments at any depth.
  // E.g. /any/project/node_modules/foo/src/index.ts → excluded because
  // "node_modules" appears as a /segment/ in the path.
  for (const seg of EXCLUDED_SEGMENTS) {
    if (p.includes('/' + seg + '/')) return true;
  }
  // Also check if the path itself starts with a segment (top-level dirs)
  const norm = p.replace(/^\/+/, '').replace(/^\.\//, '');
  for (const seg of EXCLUDED_SEGMENTS) {
    if (norm === seg || norm.startsWith(seg + '/')) return true;
  }
  return false;
}

function hasSourceExtension(p) {
  const lastDot = p.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = p.slice(lastDot).toLowerCase();
  return SOURCE_CODE_EXTENSIONS.has(ext);
}

function isSrcDirPath(p) {
  return typeof p === 'string' && SRC_SEGMENT_RE.test(p) && hasSourceExtension(p);
}

function isE2ESpecPath(p) {
  return typeof p === 'string' && E2E_SPEC_RE.test(p);
}

// ─── Custom directories from env var ───
// CLAUDE_SOURCE_CODE_DIRS: comma-separated path prefixes for non-standard layouts.
// E.g. "worker/src,api/src" → also protects worker/src/**/*.ts, api/src/**/*.py.
// These are parsed once at startup.
function getCustomDirs() {
  const raw = process.env.CLAUDE_SOURCE_CODE_DIRS || '';
  if (!raw) return [];
  return raw.split(',').map(d => d.trim()).filter(Boolean);
}

const CUSTOM_DIR_PATTERNS = getCustomDirs().map(d => {
  // Build a regex that matches paths starting with this prefix segment
  const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|\\/)' + escaped + '(\\/|$)');
});

function isCustomDirPath(p) {
  if (CUSTOM_DIR_PATTERNS.length === 0) return false;
  return typeof p === 'string' && hasSourceExtension(p) &&
    CUSTOM_DIR_PATTERNS.some(re => re.test(p));
}

function isSourceCodePath(p) {
  if (isExcluded(p)) return false;
  // A write INTO a well-formed `.worktrees/<role>-<task-id>/...` path is a
  // legitimate sub-agent source write — allow it. `..` is resolved first, so a
  // traversal escape (`.worktrees/<slug>/../../src/x.ts`) that lands back on the
  // shared root tree is NOT treated as worktree-scoped and falls through to the
  // source-code block below.
  if (wellFormedWorktreePath(p)) return false;
  return isSrcDirPath(p) || isE2ESpecPath(p) || isCustomDirPath(p);
}

// ─── Source-layout enforcement (sub-agent writes) ───
// A sub-agent's source write lands INSIDE its worktree, so it is exempt from the
// Orchestrator block above. But the kit fixes two source roots — `frontend/` and
// `backend/` (plus any extra roots declared in SRS §3.4.5 / CLAUDE_SOURCE_CODE_DIRS).
// This catches a worktree source write whose worktree-relative path does NOT fall
// under a declared root. Returns the offending relative path, or null if compliant.
// Test code (e2e specs) is QA-owned and exempt. Only `/src/` source files are
// governed — configs / migrations / manifests under the worktree are untouched.
function layoutViolation(p, roots) {
  const rel = worktreeRelativePath(p);
  if (rel === null) return null;          // not a worktree write — handled elsewhere
  if (isExcluded(rel)) return null;       // node_modules/dist/etc. inside the worktree
  if (isE2ESpecPath(rel)) return null;    // test code lives outside frontend/backend
  if (!isSrcDirPath(rel)) return null;    // not a /src/ source file
  if (isUnderAllowedRoot(rel, roots)) return null;
  return rel;
}

// ─── Path extraction from tool input ───
function extractPaths(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return [toolInput.file_path, toolInput.notebook_path].filter(Boolean);
    default:
      return [];
  }
}

async function main() {
  // Escape hatch — operator-explicit permission for trivial Path D fixes or
  // legitimate Orchestrator-direct work (kit dogfooding, one-liner typos).
  // Document rationale in SRS §10 Changelog.
  if (process.env.CLAUDE_ALLOW_ORCHESTRATOR_CODE === '1') {
    process.stderr.write(
      'source-code-write-guard: CLAUDE_ALLOW_ORCHESTRATOR_CODE=1 set — bypass active.\n' +
      '  This should only be used for trivial Path D fixes (one-liner typos, etc.)\n' +
      '  per .claude/rules/task-type-routing.md §11. Document rationale in SRS §10 Changelog.\n'
    );
    process.exit(0);
  }

  // Block source-code writes by DEFAULT. Sub-agents are allowed because their
  // paths fall under the `.worktrees/` exclusion segment (see EXCLUDED_SEGMENTS
  // above). Anything outside a worktree is treated as Orchestrator context.
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) process.exit(0);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`source-code-write-guard: malformed event JSON: ${e.message}\n`);
    process.exit(0);
  }

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const candidates = extractPaths(toolName, toolInput);

  const skipLayout = process.env.CLAUDE_SKIP_SOURCE_LAYOUT_CHECK === '1';
  const allowedRoots = getAllowedSourceRoots(event.cwd || process.cwd());

  for (const p of candidates) {
    // (a) Source-layout gate — sub-agent source writes must land under a
    //     declared root (frontend/ or backend/ by default; SRS §3.4.5 may add
    //     more). Checked before the Orchestrator block because worktree paths
    //     are exempt from (b) by design.
    if (!skipLayout) {
      const rel = layoutViolation(p, allowedRoots);
      if (rel) {
        process.stderr.write(
          `source-code-write-guard: BLOCKED — ${toolName} on ${p}.\n` +
          `  Source path \`${rel}\` is not under a declared source root.\n` +
          `  Kit convention (SRS §3.4.5 Source Layout): all shipping source lives under\n` +
          `  one of the fixed roots — \`frontend/\` (FE Dev) or \`backend/\` (BE Dev).\n` +
          `    Single app/service per tier:  frontend/src/**          backend/src/**\n` +
          `    Multiple apps/services:       frontend/<app>/**        backend/<service>/**\n\n` +
          `  Allowed roots for this project: ${allowedRoots.join(', ')}\n` +
          `  Test code (e2e specs, etc.) is QA-owned and exempt.\n\n` +
          `  Correct approach:\n` +
          `    - FE Dev: write UI/client source under \`frontend/\` (or frontend/<app>/).\n` +
          `    - BE Dev: write server/data/job source under \`backend/\` (or backend/<service>/).\n` +
          `    - Need a non-FE/BE root (shared lib, codegen)? Declare it in SRS §3.4.5\n` +
          `      (a \`shared root: <path>\` line) or pass CLAUDE_SOURCE_CODE_DIRS=<prefix>.\n` +
          `  Override (operator-explicit; document rationale in SRS §10 Changelog):\n` +
          `    export CLAUDE_SKIP_SOURCE_LAYOUT_CHECK=1\n`
        );
        process.exit(2);
      }
    }

    // (b) Orchestrator-direct source-write block (path outside any worktree).
    if (isSourceCodePath(p)) {
      process.stderr.write(
        `source-code-write-guard: BLOCKED — ${toolName} on source-code path ${p}.\n` +
        `  CLAUDE.md §10 Hard Rule: "Orchestrator does not write source code directly."\n` +
        `  This write is outside any \`.worktrees/<role>-<task-id>/\` directory, so the\n` +
        `  guard treats it as Orchestrator context (sub-agents operate inside worktrees).\n\n` +
        `  Source-code changes must go through the SDLC pipeline:\n` +
        `    BA → SA → TL → BE Dev / FE Dev → DevOps → QA-Exec\n` +
        `  (.claude/rules/orchestrator-operating-rules.md §9, .claude/rules/task-type-routing.md §11).\n\n` +
        `  Correct approach:\n` +
        `    1. Classify the request per §11 task-type-routing:\n` +
        `         Path A (SDLC) for feature work; Path B2 (debugger) for bug triage.\n` +
        `    2. Dispatch the appropriate sub-agent (BE Dev / FE Dev / debugger / etc.).\n` +
        `       The sub-agent writes inside its own worktree; the guard allows it.\n` +
        `    3. For trivial Path D fixes (one-liner typos, kit dogfooding):\n` +
        `       export CLAUDE_ALLOW_ORCHESTRATOR_CODE=1\n` +
        `       and document rationale in SRS §10 Changelog.\n\n` +
        `  Protected: any */src/ path with source-code extensions, e2e specs,\n` +
        `  and CLAUDE_SOURCE_CODE_DIRS custom directories — when outside .worktrees/.\n` +
        `  Override (trivial Path D fixes only): export CLAUDE_ALLOW_ORCHESTRATOR_CODE=1\n`
      );
      process.exit(2);
    }
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`source-code-write-guard: unexpected error: ${err && err.stack || err}\n`);
  process.exit(0);
});