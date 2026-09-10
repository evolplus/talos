#!/usr/bin/env bash
# Tests for the promotion gate: worktree-promotion-guard.cjs +
# unpromoted-dispatch-audit.cjs + the plan-update.json artifacts manifest.
#
# Builds a throwaway git repo per scenario so every classification
# (promoted / in-flight / ready-to-finalize / partially-promoted /
#  unverifiable / orphaned) is exercised against real git + journal state.
#
# Also asserts the guard does not collide with local-worktree-git-guard.cjs:
# the two must stay complements (one forbids git-promotion, the other forbids
# pre-promotion destruction), never duplicates.
#
# Usage:  bash hooks/tests/test-promotion-gate.sh

set -u
HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$HOOKS_DIR/worktree-promotion-guard.cjs"
AUDIT="$HOOKS_DIR/unpromoted-dispatch-audit.cjs"
VALIDATOR="$HOOKS_DIR/plan-update-validator.cjs"
GITGUARD="$HOOKS_DIR/local-worktree-git-guard.cjs"

PASS=0
FAIL=0
OUT="$(mktemp)"
ERR="$(mktemp)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$OUT" "$ERR" "$SANDBOX"' EXIT

json_str() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }

# make_repo <name> <mode>
#   mode: promoted | ready | partial | unverifiable | inflight | orphaned
make_repo() {
  local name="$1" mode="$2"
  local repo="$SANDBOX/$name"
  mkdir -p "$repo"
  (
    cd "$repo" || exit 1
    git init -q -b main
    git config user.email test@example.com
    git config user.name "Test"
    git config commit.gpgsign false
    mkdir -p docs .claude/dispatch-journal
    echo seed > docs/seed.md
    git add -A && git commit -qm "chore: seed"

    WT=".worktrees/be-dev-T-042"
    J=".claude/dispatch-journal/be-dev-T-042.json"
    mkdir -p "$WT/backend/src" "$WT/docs/api-contracts"
    printf 'export const handler = () => 1;\n' > "$WT/backend/src/handler.js"
    printf 'openapi: 3.1.0\n' > "$WT/docs/api-contracts/join-v1.yaml"

    write_pu() {
      cat > "$WT/plan-update.json" <<JSON
{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["backend/src/handler.js","docs/api-contracts/join-v1.yaml"],"timestamp":"2026-09-09T10:30:00Z"}
JSON
    }
    write_journal() {  # $1 = state, $2 = sha
      printf '{"role":"be-dev","task_id":"T-042","finalization":{"state":"%s","main_commit":%s}}\n' \
        "$1" "$([ -n "${2:-}" ] && printf '"%s"' "$2" || printf 'null')" > "$J"
    }
    promote() {  # $@ = paths to actually ingest
      mkdir -p backend/src docs/api-contracts
      for p in "$@"; do mkdir -p "$(dirname "$p")"; cp "$WT/$p" "$p"; done
      git add -A && git commit -qm "feat(be): promote T-042 artifacts"
      git rev-parse HEAD
    }

    case "$mode" in
      promoted)
        write_pu
        SHA="$(promote backend/src/handler.js docs/api-contracts/join-v1.yaml)"
        write_journal finalized "$SHA" ;;
      ready)
        write_pu
        write_journal ready-to-finalize "" ;;
      partial)
        write_pu
        SHA="$(promote backend/src/handler.js)"   # yaml deliberately dropped
        write_journal finalized "$SHA" ;;
      unverifiable)
        cat > "$WT/plan-update.json" <<JSON
{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","timestamp":"2026-09-09T10:30:00Z"}
JSON
        write_journal ready-to-finalize "" ;;
      inflight)
        write_journal dispatched "" ;;   # no plan-update.json
      orphaned)
        rm -rf "$WT"
        write_journal ready-to-finalize "" ;;
    esac
  ) >/dev/null 2>&1
  echo "$repo"
}

bash_event() { printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(json_str "$1")"; }

run_exit() {  # name, expected, hook, payload, pdir, [env]
  local name="$1" expected="$2" hook="$3" payload="$4" pdir="$5" extra="${6:-}"
  local actual
  if [ -n "$extra" ]; then
    printf '%s' "$payload" | env -u CLAUDE_ALLOW_UNPROMOTED_CLEANUP -u CLAUDE_DISCARD_INTERRUPTED_DISPATCH \
      -u CLAUDE_SKIP_PROMOTION_AUDIT "CLAUDE_PROJECT_DIR=$pdir" $extra node "$hook" >"$OUT" 2>"$ERR"
  else
    printf '%s' "$payload" | env -u CLAUDE_ALLOW_UNPROMOTED_CLEANUP -u CLAUDE_DISCARD_INTERRUPTED_DISPATCH \
      -u CLAUDE_SKIP_PROMOTION_AUDIT "CLAUDE_PROJECT_DIR=$pdir" node "$hook" >"$OUT" 2>"$ERR"
  fi
  actual=$?
  if [ "$actual" = "$expected" ]; then
    printf "  PASS  %s\n" "$name"; PASS=$((PASS+1))
  else
    printf "  FAIL  %s (expected exit %s, got %s)\n" "$name" "$expected" "$actual"
    sed 's/^/        stdout: /' "$OUT"; sed 's/^/        stderr: /' "$ERR"
    FAIL=$((FAIL+1))
  fi
}

run_contains() {  # name, hook, payload, pdir, needle, [stream]
  local name="$1" hook="$2" payload="$3" pdir="$4" needle="$5" stream="${6:-err}"
  printf '%s' "$payload" | env "CLAUDE_PROJECT_DIR=$pdir" node "$hook" >"$OUT" 2>"$ERR"
  local file="$ERR"; [ "$stream" = "out" ] && file="$OUT"
  if grep -qF -- "$needle" "$file"; then
    printf "  PASS  %s\n" "$name"; PASS=$((PASS+1))
  else
    printf "  FAIL  %s (missing %q in %s)\n" "$name" "$needle" "$stream"
    sed 's/^/        /' "$file"; FAIL=$((FAIL+1))
  fi
}

R_PROMOTED="$(make_repo promoted promoted)"
R_READY="$(make_repo ready ready)"
R_PARTIAL="$(make_repo partial partial)"
R_UNVERIF="$(make_repo unverif unverifiable)"
R_INFLIGHT="$(make_repo inflight inflight)"
R_ORPHAN="$(make_repo orphan orphaned)"

RM_WT='git worktree remove --force .worktrees/be-dev-T-042'
RM_DIR='rm -rf -- .worktrees/be-dev-T-042/'

echo "worktree-promotion-guard.cjs — teardown before a verified promotion"
run_exit "blocks git worktree remove (ready-to-finalize)" 2 "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"
run_exit "blocks rm -rf (ready-to-finalize)"              2 "$GUARD" "$(bash_event "$RM_DIR")" "$R_READY"
run_exit "blocks PARTIAL promotion"                       2 "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"
run_exit "blocks when no artifacts manifest"              2 "$GUARD" "$(bash_event "$RM_WT")" "$R_UNVERIF"
run_exit "blocks chained teardown"                        2 "$GUARD" "$(bash_event "cd /tmp && $RM_WT && echo ok")" "$R_READY"
run_exit "escape hatch allows"                            0 "$GUARD" "$(bash_event "$RM_WT")" "$R_READY" "CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1"
run_contains "partial names the dropped path"      "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"  "MISSING on HEAD:   docs/api-contracts/join-v1.yaml"
run_contains "partial explains the green signals"  "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"  "PARTIAL promotion"
run_contains "unverifiable asks for the manifest"  "$GUARD" "$(bash_event "$RM_WT")" "$R_UNVERIF"  'add "artifacts"'
run_contains "block warns detached = no recovery"  "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"    "leaves no branch and no ref"
run_contains "block does NOT suggest git merge"    "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"    "NOT git merge/cherry-pick"

echo "worktree-promotion-guard.cjs — states that must NOT be blocked"
run_exit "allows teardown after verified promotion" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_PROMOTED"
run_exit "allows crash-recovery discard (in-flight)" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_INFLIGHT"
run_exit "allows discard with the discard flag"     0 "$GUARD" "$(bash_event "$RM_WT")" "$R_READY" "CLAUDE_DISCARD_INTERRUPTED_DISPATCH=1"
run_exit "unrelated bash passes"                    0 "$GUARD" "$(bash_event 'npm run build')" "$R_READY"
run_exit "journal rm alone passes"                  0 "$GUARD" "$(bash_event 'rm -- .claude/dispatch-journal/be-dev-T-042.json')" "$R_READY"
run_exit "non-dispatch rm passes"                   0 "$GUARD" "$(bash_event 'rm -rf build/')" "$R_READY"
run_exit "non-Bash tool passes"                     0 "$GUARD" '{"tool_name":"Write","tool_input":{"file_path":"x"}}' "$R_READY"
run_exit "malformed JSON fails open"                0 "$GUARD" 'not json' "$R_READY"
run_exit "empty stdin fails open"                   0 "$GUARD" '' "$R_READY"
run_exit "non-repo fails open"                      0 "$GUARD" "$(bash_event "$RM_WT")" "$SANDBOX"

echo "no collision with local-worktree-git-guard.cjs (they must be complements)"
run_exit "git-guard ignores the teardown command"   0 "$GITGUARD" "$(bash_event "$RM_WT")" "$R_READY"
run_exit "git-guard still blocks worktree merge"    2 "$GITGUARD" "$(bash_event 'git -C .worktrees/be-dev-T-042 merge main')" "$R_READY"
run_exit "promotion-guard ignores a merge command"  0 "$GUARD"    "$(bash_event 'git -C .worktrees/be-dev-T-042 merge main')" "$R_READY"

echo "unpromoted-dispatch-audit.cjs"
run_exit "Stop blocks on ready-to-finalize"    2 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_READY"
run_exit "Stop blocks on partial promotion"    2 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_PARTIAL"
run_exit "Stop blocks when manifest is absent" 2 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_UNVERIF"
run_exit "Stop silent when promoted"           0 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_PROMOTED"
run_exit "Stop silent while in flight"         0 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_INFLIGHT"
run_exit "Stop reports orphan without blocking" 0 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_ORPHAN"
run_exit "stop_hook_active does not re-block"  0 "$AUDIT" '{"hook_event_name":"Stop","stop_hook_active":true}' "$R_READY"
run_exit "SessionStart reports without blocking" 0 "$AUDIT" '{"hook_event_name":"SessionStart"}' "$R_READY"
run_contains "SessionStart names the dispatch" "$AUDIT" '{"hook_event_name":"SessionStart"}' "$R_READY" "be-dev/T-042" out
run_exit "escape hatch silences the audit"     0 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_READY" "CLAUDE_SKIP_PROMOTION_AUDIT=1"
run_exit "non-repo fails open"                 0 "$AUDIT" '{"hook_event_name":"Stop"}' "$SANDBOX"

echo "the fix loop actually clears the gate"
R_FIX="$(make_repo fixloop partial)"
(
  cd "$R_FIX" || exit 1
  mkdir -p docs/api-contracts
  cp .worktrees/be-dev-T-042/docs/api-contracts/join-v1.yaml docs/api-contracts/join-v1.yaml
  git add -A && git commit -qm "fix(be): promote the dropped contract"
  printf '{"role":"be-dev","task_id":"T-042","finalization":{"state":"finalized","main_commit":"%s"}}\n' \
    "$(git rev-parse HEAD)" > .claude/dispatch-journal/be-dev-T-042.json
) >/dev/null 2>&1
run_exit "passes once the dropped path is promoted" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_FIX"
run_exit "Stop silent after the fix"                0 "$AUDIT" '{"hook_event_name":"Stop"}' "$R_FIX"

echo "plan-update-validator.cjs — artifacts promotion manifest"
ev() { printf '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-042/plan-update.json","content":%s}}' "$(json_str "$1")"; }
PU_OK='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["backend/src/handler.js"],"timestamp":"2026-09-09T10:30:00Z"}'
PU_NONE='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","timestamp":"2026-09-09T10:30:00Z"}'
PU_EMPTY='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":[],"timestamp":"2026-09-09T10:30:00Z"}'
PU_ABS='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["/etc/passwd"],"timestamp":"2026-09-09T10:30:00Z"}'
PU_DOTDOT='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["../outside.js"],"timestamp":"2026-09-09T10:30:00Z"}'
PU_WTPREFIX='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":[".worktrees/be-dev-T-042/backend/src/handler.js"],"timestamp":"2026-09-09T10:30:00Z"}'
PU_NOTARRAY='{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":"backend/src/handler.js","timestamp":"2026-09-09T10:30:00Z"}'
PU_DOC='{"task_id":"T-042","track":"sa","from_status":"not-started","to_status":"in-progress","agent":"sa","timestamp":"2026-09-09T10:30:00Z"}'
run_exit "code role WITH manifest passes"        0 "$VALIDATOR" "$(ev "$PU_OK")" "$SANDBOX"
# Changed 2026-09-10: an absent/empty manifest WARNS, it does not block. Blocking
# the ready-to-finalize signal made the field required in a distributed contract
# whose other copies reject it as `unknown field`, leaving no writable payload.
# The gate lives at teardown (worktree-promotion-guard classifies this dispatch
# `unverifiable` and refuses removal), so nothing is lost by letting it through.
run_exit "code role without manifest allowed"    0 "$VALIDATOR" "$(ev "$PU_NONE")" "$SANDBOX"
run_exit "empty manifest allowed"                0 "$VALIDATOR" "$(ev "$PU_EMPTY")" "$SANDBOX"
run_contains "absent manifest warns" "$VALIDATOR" "$(ev "$PU_NONE")" "$SANDBOX" "no promotion manifest declared"
run_contains "empty manifest warns"  "$VALIDATOR" "$(ev "$PU_EMPTY")" "$SANDBOX" "no promotion manifest declared"
run_exit "absolute path rejected"                2 "$VALIDATOR" "$(ev "$PU_ABS")" "$SANDBOX"
run_exit "traversal path rejected"               2 "$VALIDATOR" "$(ev "$PU_DOTDOT")" "$SANDBOX"
run_exit "worktree-prefixed path rejected"       2 "$VALIDATOR" "$(ev "$PU_WTPREFIX")" "$SANDBOX"
run_exit "non-array artifacts rejected"          2 "$VALIDATOR" "$(ev "$PU_NOTARRAY")" "$SANDBOX"
run_exit "doc role without manifest passes"      0 "$VALIDATOR" "$(ev "$PU_DOC")" "$SANDBOX"

printf "\n  %s passed, %s failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
