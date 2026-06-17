'use strict';

// hooks/lib/source-layout.cjs
// Single source of truth for "where may shipping application source live?"
//
// The kit fixes two top-level source roots — `frontend/` (all FE Dev source)
// and `backend/` (all BE Dev source) — declared per project in SRS §3.4.5
// Source Layout. A sub-agent's source write (measured from its worktree root,
// i.e. the worktree-relative path per lib/worktree-scope.cjs) MUST fall under
// one of the allowed roots. `source-code-write-guard.cjs` consumes this lib.
//
// Allowed roots (union):
//   1. Kit defaults: `frontend`, `backend`.
//   2. Extra roots declared in SRS §3.4.5 via `<tier> root: <path>` lines
//      (e.g. a `shared root: packages/` row for monorepo shared code).
//   3. Extra roots from the `CLAUDE_SOURCE_CODE_DIRS` env var (comma-separated
//      top-level prefixes — same var source-code-write-guard already honors).
//
// Test code is NOT governed here: e2e specs and other test dirs are QA-owned
// and the caller excludes them before consulting this lib.
//
// Fail-open: if docs/SRS.md is absent or unparseable, fall back to the two kit
// defaults so the gate never hard-fails a project that simply hasn't authored
// §3.4.5 yet. The defaults already enforce the frontend/backend split the kit
// mandates; §3.4.5 only *adds* extra roots.

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOTS = ['frontend', 'backend'];

// Reduce any declared path/prefix to its leading directory segment.
// `frontend/`, `frontend/web/`, `./frontend` → `frontend`.
function topSegment(p) {
  if (typeof p !== 'string') return '';
  return p
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')   // strip quotes/backticks
    .replace(/^\.\//, '')              // strip leading ./
    .replace(/^\/+/, '')               // strip leading /
    .split('/')[0]
    .trim();
}

function fromEnv() {
  const raw = process.env.CLAUDE_SOURCE_CODE_DIRS || '';
  return raw.split(',').map(topSegment).filter(Boolean);
}

// Parse SRS §3.4.5 for extra declared roots. We look only at the §3.4.5 block
// (from the heading to the next `#### ` / `### ` / `## ` heading) and collect
// the leading segment of any `... root: <path>` line. `frontend root:` /
// `backend root:` just re-affirm the defaults; any other (e.g. `shared root:`)
// adds a root. Robust + cheap; never throws.
function fromSrs(repoRoot) {
  try {
    const srsPath = path.join(repoRoot, 'docs', 'SRS.md');
    const txt = fs.readFileSync(srsPath, 'utf8');
    const startRe = /^#{3,4}\s*3\.4\.5\b.*$/m;
    const m = startRe.exec(txt);
    if (!m) return [];
    const after = txt.slice(m.index + m[0].length);
    const endRe = /^#{2,4}\s+\S/m;
    const e = endRe.exec(after);
    const block = e ? after.slice(0, e.index) : after;
    const roots = [];
    const rootLineRe = /(\w[\w-]*)\s+root:\s*([^\s|<#]+)/gi;
    let r;
    while ((r = rootLineRe.exec(block)) !== null) {
      const seg = topSegment(r[2]);
      if (seg && !/^n\/?a$/i.test(seg)) roots.push(seg);
    }
    return roots;
  } catch (_e) {
    return [];
  }
}

let _cache = null;
function getAllowedSourceRoots(repoRoot) {
  if (_cache) return _cache;
  const root = repoRoot || process.cwd();
  const set = new Set(DEFAULT_ROOTS);
  for (const r of fromSrs(root)) set.add(r);
  for (const r of fromEnv()) set.add(r);
  _cache = Array.from(set);
  return _cache;
}

// True when a worktree-relative path's leading directory segment is one of the
// allowed roots. `rel` must already be worktree-relative (prefix stripped).
function isUnderAllowedRoot(rel, roots) {
  const seg = topSegment(rel);
  return seg !== '' && roots.includes(seg);
}

module.exports = {
  DEFAULT_ROOTS,
  topSegment,
  getAllowedSourceRoots,
  isUnderAllowedRoot,
};
