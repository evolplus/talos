#!/usr/bin/env bash
# Tests for pre-install-dependency-verifier.cjs (PreToolUse, Bash).
# Offline-capable: runs a local stub simulating OSV.dev + deps.dev.
#
# Usage: bash .claude/hooks/tests/test-dependency-verifier.sh

set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/pre-install-dependency-verifier.cjs"
PASS=0; FAIL=0
R="$(mktemp -d)"
STUB_PORT=9472
trap 'kill $STUB_PID 2>/dev/null; rm -rf "$R"' EXIT

ok()  { printf "  PASS  %s\n" "$1"; PASS=$((PASS+1)); }
bad() { printf "  FAIL  %s\n" "$1"; FAIL=$((FAIL+1)); }

node -e '
const http=require("http");const NOW=Date.now();const day=864e5;
const pkgs={
  "lodash":{versions:[{v:"4.17.21",pub:NOW-1000*day,def:true}]},
  "evil-pkg":{versions:[{v:"1.0.0",pub:NOW-10*day,def:true}],vulns:["MAL-2026-0001"]},
  "oldvuln":{versions:[{v:"2.0.0",pub:NOW-500*day,def:true}],vulns:["GHSA-xxxx","CVE-2025-1"]},
  "fresh-squat":{versions:[{v:"0.0.1",pub:NOW-3*day,def:true}]},
  "requets":{versions:[{v:"1.0.0",pub:NOW-5*day,def:true}],vulns:["MAL-2026-0002"]},
};
http.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{
  res.setHeader("content-type","application/json");
  const m=req.url.match(/\/v3\/systems\/\w+\/packages\/(.+)$/);
  if(m){const p=pkgs[decodeURIComponent(m[1])];if(!p){res.statusCode=404;return res.end("{}")}
    return res.end(JSON.stringify({versions:p.versions.map(x=>({versionKey:{version:x.v},publishedAt:new Date(x.pub).toISOString(),isDefault:!!x.def}))}))}
  if(req.url==="/v1/querybatch"){const q=JSON.parse(b).queries[0];const p=pkgs[q.package.name];
    return res.end(JSON.stringify({results:[{vulns:(p&&p.vulns||[]).map(id=>({id}))}]}))}
  res.statusCode=404;res.end("{}")})}).listen(process.argv[1]);
' "$STUB_PORT" &
STUB_PID=$!
sleep 0.5

export CLAUDE_VERIFY_OSV_BASE="http://127.0.0.1:$STUB_PORT"
export CLAUDE_VERIFY_DEPSDEV_BASE="http://127.0.0.1:$STUB_PORT"
export CLAUDE_PROJECT_DIR="$R"

run() { echo "{\"tool_input\":{\"command\":\"$1\"}}" | node "$HOOK" >"$R/out" 2>"$R/err"; }

run "npm install lodash@4.17.21"
[ $? = 0 ] && [ ! -s "$R/out" ] && ok "clean package: allowed, silent" || bad "clean package"

run "npm install evil-pkg"
[ $? = 2 ] && grep -q "KNOWN MALWARE" "$R/err" && ok "npm malware: blocked (exit 2)" || bad "npm malware block"

run "pip install requets"
[ $? = 2 ] && ok "pypi malware: blocked" || bad "pypi malware block"

run "npx evil-pkg --yes"
[ $? = 2 ] && ok "npx immediate-exec: blocked" || bad "npx block"

run "cd app && npm install evil-pkg && npm test"
[ $? = 2 ] && ok "malware in chained command: blocked" || bad "chained block"

run "npm i oldvuln"
[ $? = 0 ] && grep -q "advisory(ies)" "$R/out" && ok "CVE-only: warn, allowed" || bad "CVE warn"

run "yarn add fresh-squat"
[ $? = 0 ] && grep -q "first published only" "$R/out" && ok "brand-new package: warn" || bad "new-package warn"

run "npm install git+https://github.com/x/y.git"
[ $? = 0 ] && grep -q "cannot be verified" "$R/out" && ok "git URL: unverifiable warn" || bad "unverifiable warn"

run "git status && ls"
[ $? = 0 ] && [ ! -s "$R/out" ] && ok "non-install: silent" || bad "non-install"

CLAUDE_SKIP_DEPENDENCY_VERIFY=1 run "npm install evil-pkg"
[ $? = 0 ] && ok "escape hatch: allowed" || bad "escape hatch"

[ -f "$R/.claude/hooks/.state/verify-cache.json" ] && ok "verdict cache written" || bad "cache"

kill $STUB_PID 2>/dev/null; wait $STUB_PID 2>/dev/null
rm -rf "$R/.claude"
run "npm install lodash@4.17.21"
[ $? = 0 ] && grep -q "partially skipped" "$R/out" && ok "source unreachable: fail-open with warning" || bad "fail-open"

echo 'not-json' | node "$HOOK" >/dev/null 2>&1
[ $? = 0 ] && ok "fail-open: garbage stdin" || bad "garbage stdin"

printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
