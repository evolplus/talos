#!/usr/bin/env bash
# Tests for hooks/lib/artifact-ids.cjs and the guards that consume it.
#
# REGRESSION: ISSUE-179 (2026-09-13)
# Guards hard-coded /\bCMP-(?:\d+|NONE)\b/i — prefix then digits. A contract's
# Approver-confirmed composition IDs were CMP-GW-001..011; the -GW- qualifier
# infix meant the pattern could never match, so a document with eleven valid
# composition rows read to the guard as having none.
#
# Both escape routes required asserting a falsehood: renaming to CMP-NNN would
# contradict the Approver-confirmed handoff, and CMP-NONE would declare eleven
# real regions absent. The FE Dev refused both and escalated, correctly. These
# tests exist so the guard can never again be satisfiable only by a lie.
#
# Also covered: the AST "blocked" REJECT pattern used the same narrow body, so a
# blocked asset with a qualified ID silently passed the gate meant to catch it.
#
# Usage:  bash hooks/tests/test-artifact-id-grammar.sh

set -u
HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
S="$(mktemp -d)"; trap 'rm -rf "$S"' EXIT
ok()  { printf "  PASS  %s\n" "$1"; PASS=$((PASS+1)); }
bad() { printf "  FAIL  %s\n" "$1"; shift; [ $# -gt 0 ] && printf "        %s\n" "$*"; FAIL=$((FAIL+1)); }

node_t() { node -e "$1" "$HOOKS_DIR" 2>&1; }

echo "grammar: qualified IDs match, prefixes stay isolated"
out=$(node_t '
const A=require(process.argv[1]+"/lib/artifact-ids.cjs");
const cmp=A.idOrNonePattern("CMP"), ast=A.idOrNonePattern("AST"), dem=A.idPattern("DEM");
const must=[["CMP-001",cmp],["CMP-GW-001",cmp],["CMP-GW-011",cmp],["CMP-NONE",cmp],
            ["AST-ICON-12",ast],["AST-NONE",ast],["DEM-07",dem],["DEM-A1-B2-07",dem]];
const mustNot=[["CMPX-001",cmp],["XCMP-001",cmp],["CMP_001",cmp],["CMP-BLOCKED",cmp],["CMP-",cmp],["DEM-NONE",dem]];
const bad=[];
for(const [s,re] of must) if(!re.test(s)) bad.push("should match: "+s);
for(const [s,re] of mustNot) if(re.test(s)) bad.push("should NOT match: "+s);
console.log(bad.length?bad.join("; "):"OK");')
[ "$out" = "OK" ] && ok "grammar accepts qualified IDs and rejects near-misses" || bad "grammar wrong" "$out"

echo "the exact ISSUE-179 document now passes"
CONTRACT="$S/T-217.md"
cat > "$CONTRACT" <<'DOC'
# Design Contract — T-217
Status: Frozen
Design System Source: tokens.json @ v3 (token evidence: color/space/type scales)

## Reference Render
Figma Node ID: 412:88 — SHA-256 3f9a1c7e55b2

## Visual Composition Contract
viewport 1440x900; root layout grid; layer order background -> scrim -> panel; constraints pinned

## Design Element Manifest
| DEM-001 | grace banner | implemented |
| DEM-002 | countdown | implemented |

## Asset Export Manifest
| AST-GW-001 | clock icon | exported |

## Asset Implementation Trace Matrix
| AST-GW-001 | src/icons/Clock.tsx | exported |

## Composition Implementation Trace Matrix
| CMP-GW-001 | grace window hero | src/GraceHero.tsx | structural: 60/40 split |
| CMP-GW-002 | countdown strip | src/Countdown.tsx | visual: token spacing |
| CMP-GW-011 | footer legal | src/Footer.tsx | structural: stacked |

## Implementation Trace Matrix
| DEM-001 | src/GraceBanner.tsx | implemented |
| DEM-002 | src/Countdown.tsx | implemented |
DOC
cat > "$S/check-doc.cjs" <<'JS'
const fs = require('fs');
const A = require(process.argv[2] + '/lib/artifact-ids.cjs');
const doc = fs.readFileSync(process.argv[3], 'utf8');

// Same section slicing the guards use: from "## <heading>" to the next "## ".
function section(content, heading) {
  const re = new RegExp('^##\\s+' + heading + '\\s*$', 'im');
  const m = re.exec(content);
  if (!m) return '';
  const rest = content.slice(m.index + m[0].length);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const fails = [];
const req = [
  ['CMP', 'Composition Implementation Trace Matrix', A.idOrNonePattern('CMP')],
  ['AST', 'Asset Export Manifest', A.idOrNonePattern('AST')],
  ['AST', 'Asset Implementation Trace Matrix', A.idOrNonePattern('AST')],
  ['DEM', 'Design Element Manifest', A.idPattern('DEM')],
  ['DEM', 'Implementation Trace Matrix', A.idPattern('DEM')],
];
for (const [prefix, heading, re] of req) {
  const sec = section(doc, heading);
  if (!sec.trim()) { fails.push(`section missing: ${heading}`); continue; }
  if (!re.test(sec)) fails.push(`${prefix} rejected in "${heading}"`);
}
if (A.rowPattern('AST', '\\bblocked\\b').test(section(doc, 'Asset Export Manifest'))) {
  fails.push('false blocked-asset positive');
}
console.log(fails.length ? fails.join('; ') : 'OK');
JS
out=$(node "$S/check-doc.cjs" "$HOOKS_DIR" "$CONTRACT" 2>&1)
[ "$out" = "OK" ] && ok "CMP-GW-001..011 contract accepted by every rule" || bad "ISSUE-179 doc still rejected" "$out"

echo "the reject pattern still catches blocked assets — including qualified IDs"
out=$(node_t '
const A=require(process.argv[1]+"/lib/artifact-ids.cjs");
const re=A.rowPattern("AST","\\bblocked\\b");
const bad=[];
if(!re.test("| AST-001 | icon | blocked |")) bad.push("missed unqualified blocked row");
if(!re.test("| AST-GW-003 | icon | blocked |")) bad.push("missed QUALIFIED blocked row (the silent-miss bug)");
if(re.test("| AST-GW-003 | icon | exported |")) bad.push("false positive on a clean row");
console.log(bad.length?bad.join("; "):"OK");')
[ "$out" = "OK" ] && ok "blocked-asset detection covers qualified IDs" || bad "reject pattern wrong" "$out"

echo "diagnostics point at the pattern, not the document"
out=$(node_t '
const A=require(process.argv[1]+"/lib/artifact-ids.cjs");
const m=A.describeMismatch("CMP","| CMP-GW-A | hero |","Composition Implementation Trace Matrix");
const bad=[];
if(!/CMP-GW-A/.test(m)) bad.push("does not show the offending token");
if(!/ID-SHAPE mismatch/.test(m)) bad.push("does not name it a shape mismatch");
if(!/do NOT rename/i.test(m)) bad.push("does not forbid renaming");
if(!/do NOT write CMP-NONE/i.test(m)) bad.push("does not forbid the false NONE");
if(!/raise it as an open issue/i.test(m)) bad.push("does not offer the truthful escalation path");
console.log(bad.length?bad.join("; "):"OK");')
[ "$out" = "OK" ] && ok "shape-mismatch message forbids both falsehoods and offers escalation" || bad "diagnostic inadequate" "$out"

out=$(node_t '
const A=require(process.argv[1]+"/lib/artifact-ids.cjs");
const m=A.describeMismatch("CMP","| id | region |\n|---|---|","Composition Implementation Trace Matrix");
const bad=[];
if(!/has no CMP-\* rows/.test(m)) bad.push("empty case should say no rows");
if(/ID-SHAPE mismatch/.test(m)) bad.push("empty case must not claim a shape mismatch");
if(!/CMP-NONE if there genuinely are none/.test(m)) bad.push("empty case should mention NONE as the truthful option");
console.log(bad.length?bad.join("; "):"OK");')
[ "$out" = "OK" ] && ok "genuinely-empty message stays distinct from shape mismatch" || bad "empty diagnostic wrong" "$out"

echo "no guard hard-codes an artifact-ID shape any more"
if grep -rn 'CMP-(?:\|AST-(?:\|DEM-\\d\|AST-\\d' "$HOOKS_DIR"/*.cjs 2>/dev/null | grep -v artifact-ids >/dev/null; then
  bad "a guard still hard-codes an ID pattern" "$(grep -rn 'CMP-(?:\|AST-(?:\|DEM-\\d\|AST-\\d' "$HOOKS_DIR"/*.cjs | grep -v artifact-ids)"
else ok "all ID patterns come from lib/artifact-ids.cjs"; fi

printf "\n  %s passed, %s failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
