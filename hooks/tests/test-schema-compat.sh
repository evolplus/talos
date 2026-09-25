#!/usr/bin/env bash
# Regression tests for the two cross-cutting failure modes found 2026-09-10.
# Mirror of the branch-merge lineage's suite, with this kit's polarity:
# this kit is the INGESTION lineage, so its guards stand down in a
# branch-merge project and enforce when the lineage is unknown.
#
#   1. SCHEMA INCOMPATIBILITY. plan-update.json is a distributed contract —
#      registered from a project's .claude/settings.json AND from this plugin's
#      hooks.json, at possibly different versions. A key one copy REQUIRES while
#      another rejects as `unknown field` leaves no writable payload at all.
#   2. LINEAGE EXCLUSIVITY. This kit forbids `git merge` of agent history; the
#      branch-merge kit mandates it. Enforcing both leaves no legal closure.
#
# Usage:  bash hooks/tests/test-schema-compat.sh

set -u
HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VALIDATOR="$HOOKS_DIR/plan-update-validator.cjs"
PROMO_GUARD="$HOOKS_DIR/worktree-promotion-guard.cjs"
AUDIT="$HOOKS_DIR/unpromoted-dispatch-audit.cjs"

PASS=0; FAIL=0
OUT="$(mktemp)"; ERR="$(mktemp)"; S="$(mktemp -d)"
trap 'rm -rf "$OUT" "$ERR" "$S"' EXIT

json_str() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
pu_event() { printf '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-042/plan-update.json","content":%s}}' "$(json_str "$1")"; }
bash_event() { printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(json_str "$1")"; }

check() { local name="$1" exp="$2" hook="$3" pl="$4" pdir="$5"; local rc
  printf '%s' "$pl" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$pdir" node "$hook" >"$OUT" 2>"$ERR"; rc=$?
  if [ "$rc" = "$exp" ]; then printf "  PASS  %s\n" "$name"; PASS=$((PASS+1))
  else printf "  FAIL  %s (expected %s, got %s)\n" "$name" "$exp" "$rc"; sed 's/^/        /' "$ERR"; FAIL=$((FAIL+1)); fi
}
check_err() { local name="$1" hook="$2" pl="$3" pdir="$4" needle="$5" extra="${6:-}"
  if [ -n "$extra" ]; then printf '%s' "$pl" | env "CLAUDE_PROJECT_DIR=$pdir" $extra node "$hook" >"$OUT" 2>"$ERR"
  else printf '%s' "$pl" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$pdir" node "$hook" >"$OUT" 2>"$ERR"; fi
  if grep -qF -- "$needle" "$ERR"; then printf "  PASS  %s\n" "$name"; PASS=$((PASS+1))
  else printf "  FAIL  %s (missing %q)\n" "$name" "$needle"; sed 's/^/        /' "$ERR"; FAIL=$((FAIL+1)); fi
}
check_no_err() { local name="$1" hook="$2" pl="$3" pdir="$4" needle="$5"
  printf '%s' "$pl" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$pdir" node "$hook" >"$OUT" 2>"$ERR"
  if grep -qF -- "$needle" "$ERR"; then printf "  FAIL  %s (unexpected %q)\n" "$name" "$needle"; sed 's/^/        /' "$ERR"; FAIL=$((FAIL+1))
  else printf "  PASS  %s\n" "$name"; PASS=$((PASS+1)); fi
}

BASE='"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","timestamp":"2026-09-10T10:00:00Z"'
P_MIN="{$BASE}"
P_NOTES="{$BASE,\"notes\":\"commit 9f2c1ab; files: backend/src/handler.js\"}"
P_INGEST="{$BASE,\"artifacts\":[\"backend/src/handler.js\"]}"
P_MERGE="{$BASE,\"branch\":\"agent/be-dev/T-042\",\"head_sha\":\"9f2c1ab\"}"
P_BOTH="{$BASE,\"branch\":\"agent/be-dev/T-042\",\"head_sha\":\"9f2c1ab\",\"artifacts\":[\"backend/src/handler.js\"]}"

echo "cross-lineage schema tolerance — every shape must be WRITABLE"
check "bare minimum (the shape old caches accept)" 0 "$VALIDATOR" "$(pu_event "$P_MIN")"    "$S"
check "minimum + notes carrying the sha"           0 "$VALIDATOR" "$(pu_event "$P_NOTES")"  "$S"
check "this lineage's shape (artifacts)"           0 "$VALIDATOR" "$(pu_event "$P_INGEST")" "$S"
check "OTHER lineage's shape (branch + head_sha)"  0 "$VALIDATOR" "$(pu_event "$P_MERGE")"  "$S"
check "both lineages' fields at once"              0 "$VALIDATOR" "$(pu_event "$P_BOTH")"   "$S"

echo "absent evidence warns, never blocks"
check_err "missing manifest warns"                    "$VALIDATOR" "$(pu_event "$P_MIN")" "$S" "WARNING"
check_err "warning names the absent manifest"         "$VALIDATOR" "$(pu_event "$P_MIN")" "$S" "artifacts absent or empty"
check_err "warning says teardown is still guarded"    "$VALIDATOR" "$(pu_event "$P_MIN")" "$S" "still refuses teardown"
check_no_err "declared shape emits no warning"        "$VALIDATOR" "$(pu_event "$P_INGEST")" "$S" "WARNING"

echo "malformed values are still hard errors"
check "absolute manifest path rejected"   2 "$VALIDATOR" "$(pu_event "{$BASE,\"artifacts\":[\"/etc/passwd\"]}")" "$S"
check "traversal manifest path rejected"  2 "$VALIDATOR" "$(pu_event "{$BASE,\"artifacts\":[\"../x.js\"]}")" "$S"
check "worktree-prefixed path rejected"   2 "$VALIDATOR" "$(pu_event "{$BASE,\"artifacts\":[\".worktrees/be-dev-T-042/x.js\"]}")" "$S"
check "non-array artifacts rejected"      2 "$VALIDATOR" "$(pu_event "{$BASE,\"artifacts\":\"x.js\"}")" "$S"
check "genuinely unknown key rejected"    2 "$VALIDATOR" "$(pu_event "{$BASE,\"commit\":\"9f2c1ab\"}")" "$S"
check_err "unknown-key message explains the stale-copy case" "$VALIDATOR" "$(pu_event "{$BASE,\"commit\":\"x\"}")" "$S" "one of them is stale"

echo "lineage exclusivity — stand down for the other model, enforce when unknown"
mkdir -p "$S/branchy/.claude" "$S/ingest/.claude" "$S/blank"
printf '{"lineage":"branch-merge"}\n' > "$S/branchy/.claude/kit-lineage.json"
printf '{"lineage":"ingestion"}\n'    > "$S/ingest/.claude/kit-lineage.json"
TEARDOWN="$(bash_event 'git worktree remove --force .worktrees/be-dev-T-042')"
check_err "promotion-guard stands down in a branch-merge project" "$PROMO_GUARD" "$TEARDOWN" "$S/branchy" "standing down"
check_err "audit stands down in a branch-merge project"           "$AUDIT" '{"hook_event_name":"Stop"}' "$S/branchy" "standing down"
check "stand-down exits 0" 0 "$PROMO_GUARD" "$TEARDOWN" "$S/branchy"
if printf '%s' "$TEARDOWN" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$S/ingest" node "$PROMO_GUARD" 2>&1 | grep -q "standing down"; then
  printf "  FAIL  promotion-guard must NOT stand down in its own lineage\n"; FAIL=$((FAIL+1))
else printf "  PASS  promotion-guard does not stand down in its own lineage\n"; PASS=$((PASS+1)); fi
if printf '%s' "$TEARDOWN" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$S/blank" node "$PROMO_GUARD" 2>&1 | grep -q "standing down"; then
  printf "  FAIL  unlabelled project must NOT silently disable the guard\n"; FAIL=$((FAIL+1))
else printf "  PASS  unlabelled project keeps the guard active\n"; PASS=$((PASS+1)); fi
check_err "env override forces stand-down" "$PROMO_GUARD" "$TEARDOWN" "$S/ingest" "standing down" "CLAUDE_KIT_LINEAGE=branch-merge"

# ISSUE-209 — a role the kit ships must be able to write the signal its own
# template tells it to write. The validator roles were refused twice over:
# `invalid agent` AND `unknown field: verdict/report_path/next_action`. Checked
# as a CLASS, not per role: every plan-update.json example in every agent
# template is fed to the validator, and every dispatchable subagent_type in the
# registry must be an accepted agent. A new role added without updating the
# hook fails here instead of in a live dispatch.
echo "every agent template's own plan-update.json example validates (ISSUE-209)"
KIT_ROOT="$(cd "$HOOKS_DIR/.." && pwd)"
TPL_DIR=""
for d in "$KIT_ROOT/agents/_templates" "$KIT_ROOT/agents"; do [ -d "$d" ] && { TPL_DIR="$d"; break; }; done
mkdir -p "$S/tpl"
N_TPL=0
if [ -n "$TPL_DIR" ]; then
  while IFS= read -r f; do
    node -e '
      const fs = require("fs");
      const src = fs.readFileSync(process.argv[1], "utf8");
      const re = /```json\s*\n([\s\S]*?)```/g; let m, out = null;
      while ((m = re.exec(src))) if (/"agent"\s*:/.test(m[1]) && /"to_status"\s*:/.test(m[1])) { out = m[1]; break; }
      if (!out) process.exit(3);
      const fill = out
        .replace(/"<ISO-8601>"/g, "\"2026-09-14T10:00:00Z\"")
        .replace(/"([^"\n]*?)\s\|\s[^"\n]*"/g, (_, first) => JSON.stringify(first.trim()))
        .replace(/"[^"\n]*<[^>"\n]+>[^"\n]*"/g, "\"T-900\"")
        .replace(/"\.\.\."/g, "\"n\"");
      process.stdout.write(fill);
    ' "$f" > "$S/tpl/pu.json" 2>/dev/null || continue
    N_TPL=$((N_TPL+1))
    check "template example validates: $(basename "$f" .md)" 0 "$VALIDATOR" "$(pu_event "$(cat "$S/tpl/pu.json")")" "$S/blank"
  done < <(grep -l 'plan-update.json' "$TPL_DIR"/*.md 2>/dev/null)
fi
if [ "$N_TPL" -ge 4 ]; then printf "  PASS  %s\n" "found $N_TPL template examples (validator roles included)"; PASS=$((PASS+1))
else printf "  FAIL  %s\n" "only $N_TPL template examples found - the checks above ran vacuously"; FAIL=$((FAIL+1)); fi

REG="$KIT_ROOT/rules/sub-agent-registry.md"
if [ -f "$REG" ]; then
  # Roles whose registry tool-scope says they write plan-update.json.
  WRITERS="$(node -e '
    const reg = require("fs").readFileSync(process.argv[1], "utf8");
    const rows = [...reg.matchAll(/^\|[^|\n]*\|[^|\n]*\|\s*`([a-z0-9-]+)`\s*\|([^\n]*)$/gm)];
    console.log(rows.filter(m => /plan-update\.json/.test(m[2])).map(m => m[1]).join(" "));
  ' "$REG")"
  MISSING=""; NW=0
  for r in $WRITERS; do
    NW=$((NW+1))
    PL="{\"task_id\":\"T-900\",\"track\":\"qa\",\"from_status\":\"in-progress\",\"to_status\":\"blocked\",\"agent\":\"$r\",\"timestamp\":\"2026-09-14T10:00:00Z\"}"
    printf '%s' "$(pu_event "$PL")" | env -u CLAUDE_KIT_LINEAGE "CLAUDE_PROJECT_DIR=$S/blank" node "$VALIDATOR" >/dev/null 2>"$ERR"
    grep -q "invalid agent" "$ERR" && MISSING="$MISSING $r"
  done
  if [ "$NW" -lt 8 ]; then printf "  FAIL  %s\n" "registry parse found only $NW plan-update writers"; FAIL=$((FAIL+1))
  elif [ -z "$MISSING" ]; then printf "  PASS  %s\n" "all $NW plan-update-writing registry roles are accepted agents"; PASS=$((PASS+1))
  else printf "  FAIL  %s\n" "registry roles refused as invalid agent:$MISSING"; FAIL=$((FAIL+1)); fi
fi

echo "this kit declares its own lineage"
if node -e "
const L=require('$HOOKS_DIR/lib/kit-lineage.cjs');
process.exit(L.declaredLineage('$(cd "$HOOKS_DIR/.." && pwd)')==='ingestion'?0:1)"; then
  printf "  PASS  kit declares ingestion\n"; PASS=$((PASS+1))
else printf "  FAIL  kit lineage not detected as ingestion\n"; FAIL=$((FAIL+1)); fi

printf "\n  %s passed, %s failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
