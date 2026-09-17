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
      partialcontent)
        # THE DANGEROUS CASE the gate exists for, and the one that pins the
        # shared-doc fallback as NARROW: the promotion commit DOES write the
        # role-owned artifact, but with content that is not the worktree's -- a
        # truncated or wrong ingestion. "The commit touched the path" is true
        # here, so a fallback applied to every path would pass this. It must not.
        write_pu
        mkdir -p backend/src docs/api-contracts
        cp "$WT/backend/src/handler.js" backend/src/handler.js
        printf 'openapi: 3.1.0\n# WRONG CONTENT - not what the worktree produced\n' > docs/api-contracts/join-v1.yaml
        git add -A && git commit -qm "feat(be): promote T-042 (contract ingested wrongly)"
        SHA="$(git rev-parse HEAD)"
        write_journal finalized "$SHA" ;;
      shareddoc)
        # docs/open-issues.md is append-only for ALL roles (CLAUDE.md §6). The
        # Orchestrator triages it at closure, IN the promotion commit, so the
        # worktree copy is byte-identical to main at no commit ever. The promotion
        # is real and the commit does modify the path.
        mkdir -p "$WT/docs"
        printf '# Open Issues\n\n### ISSUE-900 filed by the agent\n- State: open\n' > "$WT/docs/open-issues.md"
        cat > "$WT/plan-update.json" <<JSON
{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["backend/src/handler.js","docs/open-issues.md"],"timestamp":"2026-09-09T10:30:00Z"}
JSON
        mkdir -p backend/src docs
        cp "$WT/backend/src/handler.js" backend/src/handler.js
        # ingested AND triaged in the same commit, as the Orchestrator does
        printf '# Open Issues\n\n### ISSUE-900 filed by the agent\n- State: deferred\n- Owner: QA-Author\n' > docs/open-issues.md
        git add -A && git commit -qm "feat(be): promote T-042 + triage the filed issue"
        SHA="$(git rev-parse HEAD)"
        write_journal finalized "$SHA" ;;
      shareddocuntouched)
        # The shared-doc fallback must not become a blanket pass: here the
        # promotion commit does NOT modify docs/open-issues.md, so the claim that
        # it was promoted is unsupported and must still block.
        mkdir -p "$WT/docs"
        printf '# Open Issues\n\n### ISSUE-901 filed by the agent\n- State: open\n' > "$WT/docs/open-issues.md"
        printf '# Open Issues\n\n(untouched by the promotion)\n' > docs/open-issues.md
        git add -A && git commit -qm "chore: pre-existing open-issues"
        cat > "$WT/plan-update.json" <<JSON
{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["backend/src/handler.js","docs/open-issues.md"],"timestamp":"2026-09-09T10:30:00Z"}
JSON
        SHA="$(promote backend/src/handler.js)"
        write_journal finalized "$SHA" ;;
      postpromotion)
        # Correctly and completely promoted -- then main advanced past the
        # promotion commit, exactly as it does when the Orchestrator triages
        # docs/open-issues.md after closing a dispatch. The worktree copy is now
        # stale relative to HEAD while the promotion itself is intact.
        write_pu
        SHA="$(promote backend/src/handler.js docs/api-contracts/join-v1.yaml)"
        printf 'openapi: 3.1.0\n# amended on main AFTER the promotion commit\n' > docs/api-contracts/join-v1.yaml
        git add -A && git commit -qm "docs: triage after promotion (main moves forward)"
        write_journal finalized "$SHA" ;;
      bigblob)
        # Fully and correctly promoted, but one artifact is larger than Node's
        # 1 MiB execFileSync default. `git show HEAD:<path>` must still be read.
        #
        # Generated with awk, not `head -c /dev/zero | tr`: tr's NUL handling is
        # not portable, and the earlier form silently emitted a 3 MB run of NUL
        # bytes -- a BINARY blob. The test still passed, but for the wrong reason
        # (it proved the buffer limit against something no dispatch promotes).
        # A promoted artifact is text, so the fixture is text.
        mkdir -p "$WT/docs/api-contracts"
        awk 'BEGIN {
          printf "openapi: 3.1.0\n";
          line = "  # padding so this artifact exceeds the 1 MiB execFileSync default read buffer\n";
          for (i = 0; i < 40000; i++) printf "%s", line;
        }' > "$WT/docs/api-contracts/big-v1.yaml"
        cat > "$WT/plan-update.json" <<JSON
{"task_id":"T-042","track":"be","from_status":"in-progress","to_status":"ready-for-deploy","agent":"be-dev","artifacts":["backend/src/handler.js","docs/api-contracts/big-v1.yaml"],"timestamp":"2026-09-09T10:30:00Z"}
JSON
        SHA="$(promote backend/src/handler.js docs/api-contracts/big-v1.yaml)"
        write_journal finalized "$SHA" ;;
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

run_contains_not() {  # name, hook, payload, pdir, needle, [stream]
  local name="$1" hook="$2" payload="$3" pdir="$4" needle="$5" stream="${6:-stderr}"
  printf '%s' "$payload" | (cd "$pdir" && CLAUDE_PROJECT_DIR="$pdir" node "$hook") >"$OUT" 2>"$ERR"
  local f="$ERR"; [ "$stream" = stdout ] && f="$OUT"
  if grep -qF "$needle" "$f"; then
    printf "  FAIL  %s (must NOT contain %q in %s)\n" "$name" "$needle" "$stream"
    sed 's/^/        /' "$f"
    FAIL=$((FAIL+1))
  else
    printf "  PASS  %s\n" "$name"
    PASS=$((PASS+1))
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
R_BIGBLOB="$(make_repo bigblob bigblob)"
R_POSTPROMO="$(make_repo postpromo postpromotion)"
R_PARTIALCONTENT="$(make_repo partialcontent partialcontent)"
R_SHARED="$(make_repo shareddoc shareddoc)"
R_SHARED_UNTOUCHED="$(make_repo shareduntouched shareddocuntouched)"

RM_WT='git worktree remove --force .worktrees/be-dev-T-042'
RM_DIR='rm -rf -- .worktrees/be-dev-T-042/'

echo "worktree-promotion-guard.cjs — teardown before a verified promotion"
run_exit "blocks git worktree remove (ready-to-finalize)" 2 "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"
run_exit "blocks rm -rf (ready-to-finalize)"              2 "$GUARD" "$(bash_event "$RM_DIR")" "$R_READY"
run_exit "blocks PARTIAL promotion"                       2 "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"
run_exit "blocks when no artifacts manifest"              2 "$GUARD" "$(bash_event "$RM_WT")" "$R_UNVERIF"
run_exit "blocks chained teardown"                        2 "$GUARD" "$(bash_event "cd /tmp && $RM_WT && echo ok")" "$R_READY"
run_exit "escape hatch allows"                            0 "$GUARD" "$(bash_event "$RM_WT")" "$R_READY" "CLAUDE_ALLOW_UNPROMOTED_CLEANUP=1"
run_contains "partial names the dropped path"      "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"  "ABSENT at the promotion commit AND at HEAD: docs/api-contracts/join-v1.yaml"
run_contains "partial explains the green signals"  "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"  "PARTIAL promotion"
run_contains "unverifiable asks for the manifest"  "$GUARD" "$(bash_event "$RM_WT")" "$R_UNVERIF"  'add "artifacts"'
run_contains "block warns detached = no recovery"  "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"    "leaves no branch and no ref"
run_contains "block does NOT suggest git merge"    "$GUARD" "$(bash_event "$RM_WT")" "$R_READY"    "NOT git merge/cherry-pick"

echo "worktree-promotion-guard.cjs — states that must NOT be blocked"
run_exit "allows teardown after verified promotion" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_PROMOTED"

# A promotion is an EVENT, not a current state. Comparing the manifest against
# HEAD only asks "does main look like the worktree right now?", which any
# post-promotion edit on main answers no -- so a finished dispatch was classified
# partially-promoted and its teardown blocked. The block is sticky: the journal
# entry survives into every later session (ISSUE-224). The content is checked at
# finalization.main_commit as well as HEAD; matching either is promoted.
run_exit "allows teardown when main advanced past the promotion" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_POSTPROMO"
run_contains_not "post-promotion edit is not reported as differing" "$GUARD" "$(bash_event "$RM_WT")" "$R_POSTPROMO" "MATCHES NEITHER"
# The gate is not weakened: content that was never on main matches NEITHER the
# promotion commit nor HEAD, and is still blocked and still named.
run_exit "still blocks a genuinely unpromoted path"             2 "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIAL"

# A shared-doc (CLAUDE.md §6, append-only for all roles) can never match the
# worktree byte-for-byte: the Orchestrator triages it at closure, inside the
# promotion commit. For those paths only, the proof is that the promotion commit
# MODIFIED the path. Narrow by construction -- role-owned artifacts keep strict
# content equality, which is what the case above still proves.
run_exit "allows teardown when a shared-doc was triaged at promotion" 0 "$GUARD" "$(bash_event "$RM_WT")" "$R_SHARED"
run_contains "the weaker shared-doc check is stated, never silent" "$GUARD" "$(bash_event "$RM_WT")" "$R_SHARED" "verified by promotion-commit modification, not content equality"
# The fallback is not a blanket pass: if the promotion commit never touched the
# shared-doc, the claim is unsupported and the block stands.
run_exit "blocks a shared-doc the promotion commit never touched"     2 "$GUARD" "$(bash_event "$RM_WT")" "$R_SHARED_UNTOUCHED"
# And the fallback must not reach role-owned artifacts at all. Here the promotion
# commit DID write the contract -- with the wrong content. "The commit touched the
# path" is true, so a fallback not restricted to shared-doc paths would pass this
# silently; that is the partially-promoted state the gate calls the dangerous one.
run_exit "blocks a role-owned artifact ingested with wrong content"   2 "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIALCONTENT"
run_contains "wrong-content ingestion names the contract" "$GUARD" "$(bash_event "$RM_WT")" "$R_PARTIALCONTENT" "MATCHES NEITHER the promotion commit nor HEAD: docs/api-contracts/join-v1.yaml"



# A promoted artifact larger than Node's 1 MiB execFileSync default must not read
# as missing. Before GIT_MAX_BUFFER, `git show HEAD:<path>` overflowed, the catch
# returned null, and null means "not on HEAD" — so the gate refused teardown of a
# dispatch that HAD promoted everything, and said the file was missing while it
# sat in HEAD. Fail-closed, so nothing was lost; but the stated cause was wrong.
# The two cases below only mean anything if the fixture really exceeds 1 MiB.
# Assert that as its own counted case: a shrunken fixture must fail loudly rather
# than turn them green for nothing. (make_repo cannot do this itself -- its body
# runs in a subshell whose stdout and stderr are discarded.)
BIGBLOB_BYTES="$(wc -c < "$R_BIGBLOB/.worktrees/be-dev-T-042/docs/api-contracts/big-v1.yaml" | tr -d ' ')"
if [ "$BIGBLOB_BYTES" -gt 1048576 ]; then
  printf "  PASS  %s\n" "bigblob fixture exceeds the 1 MiB default ($BIGBLOB_BYTES bytes)"
  PASS=$((PASS+1))
else
  printf "  FAIL  %s\n" "bigblob fixture is only $BIGBLOB_BYTES bytes - the two cases below would pass vacuously"
  FAIL=$((FAIL+1))
fi
run_exit "allows teardown with a >1MiB promoted artifact"  0 "$GUARD" "$(bash_event "$RM_WT")" "$R_BIGBLOB"
run_contains_not "large artifact is not reported missing" "$GUARD" "$(bash_event "$RM_WT")" "$R_BIGBLOB" "MISSING on HEAD"

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
