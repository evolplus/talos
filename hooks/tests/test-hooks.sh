#!/usr/bin/env bash
# Tests for all hooks in .claude/hooks/.
# Pipes synthetic Claude Code events through each hook and asserts exit codes
# plus stdout/stderr content where relevant.
#
# Usage:  bash .claude/hooks/tests/test-hooks.sh

set -u
HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PRIVACY="$HOOKS_DIR/privacy-check.cjs"
VALIDATOR="$HOOKS_DIR/plan-update-validator.cjs"
SRS_GUARD="$HOOKS_DIR/srs-status-guard.cjs"
OI_GATE="$HOOKS_DIR/open-issues-triage-gate.cjs"
MP_GUARD="$HOOKS_DIR/master-plan-write-guard.cjs"
SESSION_INIT="$HOOKS_DIR/session-init-summary.cjs"
ROLE_GUARD="$HOOKS_DIR/kit-role-dispatch-guard.cjs"
SCENARIOS_VALIDATOR="$HOOKS_DIR/acceptance-scenarios-validator.cjs"
SELF_CONTAINMENT="$HOOKS_DIR/self-containment-validator.cjs"
EXT_ADEQUACY="$HOOKS_DIR/external-integration-adequacy-validator.cjs"
PLAN_CONSISTENCY="$HOOKS_DIR/plan-consistency-validator.cjs"
ORCH_WRITE_GUARD="$HOOKS_DIR/orchestrator-write-guard.cjs"
ORCH_BASH_GUARD="$HOOKS_DIR/orchestrator-bash-guard.cjs"
PLAN_UPDATE_LOCATION_GUARD="$HOOKS_DIR/plan-update-location-guard.cjs"
QA_EVIDENCE="$HOOKS_DIR/qa-runtime-evidence-validator.cjs"
INT_DOD="$HOOKS_DIR/integration-dod-validator.cjs"
COMMIT_CHECK="$HOOKS_DIR/task-completion-commit-check.cjs"
DOCKER_GUARD="$HOOKS_DIR/docker-scope-guard.cjs"
SRC_GUARD="$HOOKS_DIR/source-code-write-guard.cjs"

PASS=0
FAIL=0
STDOUT_TMP="$(mktemp)"
STDERR_TMP="$(mktemp)"
FIX_ROOT="$(mktemp -d)"
trap 'rm -rf "$STDOUT_TMP" "$STDERR_TMP" "$FIX_ROOT"' EXIT

run_exit() {
  # name, expected_exit, hook, payload, [extra-env]
  local name="$1" expected="$2" hook="$3" payload="$4" extraenv="${5:-}"
  unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
  local actual
  if [ -n "$extraenv" ]; then
    printf '%s' "$payload" | env $extraenv node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  else
    printf '%s' "$payload" | node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  fi
  actual=$?
  if [ "$actual" = "$expected" ]; then
    printf "  PASS  %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %s (expected exit %s, got %s)\n" "$name" "$expected" "$actual"
    sed 's/^/        stdout: /' "$STDOUT_TMP"
    sed 's/^/        stderr: /' "$STDERR_TMP"
    FAIL=$((FAIL+1))
  fi
}

run_stdout_contains() {
  # name, hook, payload, expected_substring, [extra-env]
  local name="$1" hook="$2" payload="$3" needle="$4" extraenv="${5:-}"
  unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
  if [ -n "$extraenv" ]; then
    printf '%s' "$payload" | env $extraenv node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  else
    printf '%s' "$payload" | node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  fi
  if grep -qF "$needle" "$STDOUT_TMP"; then
    printf "  PASS  %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %s (stdout missing: %s)\n" "$name" "$needle"
    sed 's/^/        stdout: /' "$STDOUT_TMP"
    FAIL=$((FAIL+1))
  fi
}

run_stdout_silent() {
  # name, hook, payload, [extra-env]
  local name="$1" hook="$2" payload="$3" extraenv="${4:-}"
  unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
  if [ -n "$extraenv" ]; then
    printf '%s' "$payload" | env $extraenv node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  else
    printf '%s' "$payload" | node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  fi
  if [ ! -s "$STDOUT_TMP" ]; then
    printf "  PASS  %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %s (expected silent stdout, got:)\n" "$name"
    sed 's/^/        stdout: /' "$STDOUT_TMP"
    FAIL=$((FAIL+1))
  fi
}

run_stderr_contains() {
  # name, hook, payload, expected_substring, [extra-env]
  local name="$1" hook="$2" payload="$3" needle="$4" extraenv="${5:-}"
  unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
  if [ -n "$extraenv" ]; then
    printf '%s' "$payload" | env $extraenv node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  else
    printf '%s' "$payload" | node "$hook" >"$STDOUT_TMP" 2>"$STDERR_TMP"
  fi
  if grep -qF "$needle" "$STDERR_TMP"; then
    printf "  PASS  %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  FAIL  %s (stderr missing: %s)\n" "$name" "$needle"
    sed 's/^/        stderr: /' "$STDERR_TMP"
    FAIL=$((FAIL+1))
  fi
}

# ---------------- privacy-check.cjs ----------------
echo "privacy-check.cjs:"
run_exit "allows Read on SRS.md"            0 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"docs/SRS.md"}}'
run_exit "blocks Read on .env"              2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"./.env"}}'
run_exit "blocks Read on .env.local"        2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"./.env.local"}}'
run_exit "blocks Read on .env.production"   2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"app/.env.production"}}'
run_exit "allows Read on .env.example"      0 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"./.env.example"}}'
run_exit "allows Read on .env.template"     0 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"./.env.template"}}'
run_exit "blocks Glob on secrets/"          2 "$PRIVACY" '{"tool_name":"Glob","tool_input":{"path":"secrets/","pattern":"*.json"}}'
run_exit "blocks Read on .pem"              2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"keys/server.pem"}}'
run_exit "blocks Read on private/.../*.key" 2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"private/customer.key"}}'
run_exit "blocks Bash cat ~/.ssh/id_rsa"    2 "$PRIVACY" '{"tool_name":"Bash","tool_input":{"command":"cat ~/.ssh/id_rsa"}}'
run_exit "blocks Bash cat .netrc"           2 "$PRIVACY" '{"tool_name":"Bash","tool_input":{"command":"cat ~/.netrc"}}'
run_exit "blocks Read on ~/.kube/config"    2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"/Users/x/.kube/config"}}'
run_exit "blocks Read on .aws/credentials"  2 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"/Users/x/.aws/credentials"}}'
run_exit "allows Bash git status"           0 "$PRIVACY" '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
run_exit "allows MultiEdit on src/foo.ts"   0 "$PRIVACY" '{"tool_name":"MultiEdit","tool_input":{"file_path":"src/foo.ts"}}'
run_exit "ignores empty stdin"              0 "$PRIVACY" ''
run_exit "ignores malformed event JSON"     0 "$PRIVACY" 'not json at all'
run_exit "override CLAUDE_PRIVACY_OK=1"     0 "$PRIVACY" '{"tool_name":"Read","tool_input":{"file_path":"./.env"}}' "CLAUDE_PRIVACY_OK=1"

# ---------------- plan-update-validator.cjs ----------------
echo
echo "plan-update-validator.cjs:"

VALID='{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-042/plan-update.json","content":"{\"task_id\":\"T-042\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "valid be-dev update"              0 "$VALIDATOR" "$VALID"
VALID_NOTES='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-042\",\"track\":\"be+fe\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"fe-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"notes\":\"contract frozen\"}"}}'
run_exit "valid with notes"                 0 "$VALIDATOR" "$VALID_NOTES"
run_exit "ignores Read tool"                0 "$VALIDATOR" '{"tool_name":"Read","tool_input":{"file_path":"plan-update.json"}}'
run_exit "ignores writes to other files"    0 "$VALIDATOR" '{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"hello"}}'
BAD_TRACK='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"backend\",\"from_status\":\"in-progress\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "rejects unknown track"            2 "$VALIDATOR" "$BAD_TRACK"
MISSING='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\"}"}}'
run_exit "rejects missing required fields"  2 "$VALIDATOR" "$MISSING"
BAD_STATUS='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"queued\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "rejects unknown from_status"      2 "$VALIDATOR" "$BAD_STATUS"
BAD_AGENT='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"done\",\"agent\":\"backend-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "rejects unknown agent"            2 "$VALIDATOR" "$BAD_AGENT"
UNKNOWN_FIELD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"foo\":\"bar\"}"}}'
run_exit "rejects unknown field"            2 "$VALIDATOR" "$UNKNOWN_FIELD"
BAD_TS='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"yesterday\"}"}}'
run_exit "rejects malformed timestamp"      2 "$VALIDATOR" "$BAD_TS"
BAD_JSON='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{this is not json}"}}'
run_exit "rejects non-JSON content"         2 "$VALIDATOR" "$BAD_JSON"
DESIGN_OK='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"not-started\",\"to_status\":\"not-started\",\"agent\":\"ui-ux-designer\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"design_sub_status\":\"design-ready-for-review\"}"}}'
run_exit "accepts design_sub_status"        0 "$VALIDATOR" "$DESIGN_OK"
DESIGN_BAD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"not-started\",\"to_status\":\"not-started\",\"agent\":\"ui-ux-designer\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"design_sub_status\":\"design-pending\"}"}}'
run_exit "rejects bad design_sub_status"    2 "$VALIDATOR" "$DESIGN_BAD"
run_exit "ignores empty stdin"              0 "$VALIDATOR" ''
run_exit "ignores malformed event JSON"     0 "$VALIDATOR" 'not json'

# --- state-machine transition enforcement (Bug 1 fix) ---
# Legal transitions
TRANS_RDY_DEPLOY='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"ready-for-deploy\",\"to_status\":\"in-test\",\"agent\":\"devops\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: ready-for-deploy → in-test"          0 "$VALIDATOR" "$TRANS_RDY_DEPLOY"
TRANS_IN_TEST_DONE='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: in-test → done"                       0 "$VALIDATOR" "$TRANS_IN_TEST_DONE"
TRANS_NOTSTARTED_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"not-started\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: not-started → in-progress"            0 "$VALIDATOR" "$TRANS_NOTSTARTED_IP"
TRANS_FAILED_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"failed\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: failed → in-progress (orchestrator re-dispatch)" 0 "$VALIDATOR" "$TRANS_FAILED_IP"
TRANS_BLOCKED_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"blocked\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: blocked → in-progress (orchestrator re-dispatch)" 0 "$VALIDATOR" "$TRANS_BLOCKED_IP"
TRANS_DONE_DEPR='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"done\",\"to_status\":\"done-deprecated\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "legal: done → done-deprecated"               0 "$VALIDATOR" "$TRANS_DONE_DEPR"
# Identity transition (design_sub_status-only update)
TRANS_IDENTITY='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"in-progress\",\"to_status\":\"in-progress\",\"agent\":\"ui-ux-designer\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"design_sub_status\":\"design-ready-for-review\"}"}}'
run_exit "legal: identity transition (in-progress → in-progress)" 0 "$VALIDATOR" "$TRANS_IDENTITY"

# Illegal transitions — the core of Bug 1
ILLEGAL_RFD_DONE='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"ready-for-deploy\",\"to_status\":\"done\",\"agent\":\"devops\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: ready-for-deploy → done (skip in-test)"  2 "$VALIDATOR" "$ILLEGAL_RFD_DONE"
ILLEGAL_IP_DONE='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: in-progress → done (skip ready-for-deploy)" 2 "$VALIDATOR" "$ILLEGAL_IP_DONE"
ILLEGAL_DONE_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"done\",\"to_status\":\"in-progress\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: done → in-progress (reverse)"         2 "$VALIDATOR" "$ILLEGAL_DONE_IP"
ILLEGAL_IP_INTEST='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"in-test\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: in-progress → in-test (skip ready-for-deploy)" 2 "$VALIDATOR" "$ILLEGAL_IP_INTEST"
# Terminal states
ILLEGAL_DEPR_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"done-deprecated\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: done-deprecated → in-progress (terminal)" 2 "$VALIDATOR" "$ILLEGAL_DEPR_IP"
ILLEGAL_CANCEL_IP='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"cancelled\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "blocks: cancelled → in-progress (terminal)"   2 "$VALIDATOR" "$ILLEGAL_CANCEL_IP"

# --- agent authority check (Bug 5 fix) ---
# Authorized transitions: correct agent for the correct transition

# be-dev can propose in-progress → ready-for-deploy (dev completes work)
AUTH_BEDEV_RFD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: be-dev proposes in-progress → ready-for-deploy (allowed)" 0 "$VALIDATOR" "$AUTH_BEDEV_RFD"

# fe-dev can also propose in-progress → ready-for-deploy
AUTH_FEDEV_RFD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"fe-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: fe-dev proposes in-progress → ready-for-deploy (allowed)" 0 "$VALIDATOR" "$AUTH_FEDEV_RFD"

# devops can propose ready-for-deploy → in-test (deployment)
AUTH_DEVOPS_IT='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"ready-for-deploy\",\"to_status\":\"in-test\",\"agent\":\"devops\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: devops proposes ready-for-deploy → in-test (allowed)" 0 "$VALIDATOR" "$AUTH_DEVOPS_IT"

# qa-exec can propose in-test → done (QA pass)
AUTH_QA_DONE='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: qa-exec proposes in-test → done (allowed)" 0 "$VALIDATOR" "$AUTH_QA_DONE" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-gate"

# qa-exec can propose in-test → failed (QA fail)
AUTH_QA_FAILED='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"failed\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: qa-exec proposes in-test → failed (allowed)" 0 "$VALIDATOR" "$AUTH_QA_FAILED"

# orchestrator can propose done → done-deprecated (iteration deprecation)
AUTH_ORCH_DEPR='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"done\",\"to_status\":\"done-deprecated\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: orchestrator proposes done → done-deprecated (allowed)" 0 "$VALIDATOR" "$AUTH_ORCH_DEPR"

# orchestrator can propose not-started → cancelled
AUTH_ORCH_CANCEL='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"not-started\",\"to_status\":\"cancelled\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: orchestrator proposes not-started → cancelled (allowed)" 0 "$VALIDATOR" "$AUTH_ORCH_CANCEL"

# orchestrator can propose blocked → in-progress (re-dispatch after blocker)
AUTH_ORCH_UNBLOCK='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"blocked\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: orchestrator proposes blocked → in-progress (allowed)" 0 "$VALIDATOR" "$AUTH_ORCH_UNBLOCK"

# orchestrator can propose failed → in-progress (re-dispatch after failure)
AUTH_ORCH_REDISPATCH='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"failed\",\"to_status\":\"in-progress\",\"agent\":\"orchestrator\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: orchestrator proposes failed → in-progress (allowed)" 0 "$VALIDATOR" "$AUTH_ORCH_REDISPATCH"

# --- Unauthorized transitions: wrong agent for the transition ---

# be-dev cannot propose in-test → done (that's QA-Exec's authority)
AUTH_BEDEV_DONE='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing in-test → done" 2 "$VALIDATOR" "$AUTH_BEDEV_DONE" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-gate"

# be-dev cannot propose ready-for-deploy → in-test (that's DevOps's authority)
AUTH_BEDEV_INTEST='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"ready-for-deploy\",\"to_status\":\"in-test\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing ready-for-deploy → in-test" 2 "$VALIDATOR" "$AUTH_BEDEV_INTEST"

# be-dev cannot propose in-test → failed (that's QA-Exec's authority)
AUTH_BEDEV_FAIL='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"failed\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing in-test → failed" 2 "$VALIDATOR" "$AUTH_BEDEV_FAIL"

# be-dev cannot propose done → done-deprecated (that's Orchestrator's authority)
AUTH_BEDEV_DEPR='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"done\",\"to_status\":\"done-deprecated\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing done → done-deprecated" 2 "$VALIDATOR" "$AUTH_BEDEV_DEPR"

# be-dev cannot propose not-started → cancelled (only Orchestrator can cancel)
AUTH_BEDEV_CANCEL='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"not-started\",\"to_status\":\"cancelled\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing not-started → cancelled" 2 "$VALIDATOR" "$AUTH_BEDEV_CANCEL"

# be-dev cannot propose blocked → in-progress (re-dispatch is Orchestrator-only)
AUTH_BEDEV_UNBLOCK='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"blocked\",\"to_status\":\"in-progress\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: blocks be-dev proposing blocked → in-progress" 2 "$VALIDATOR" "$AUTH_BEDEV_UNBLOCK"

# fe-dev cannot propose in-progress → ready-for-deploy on a be track (track mismatch is not Bug 5's scope, but authority is)
AUTH_FEDEV_BE_RFD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"fe-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: fe-dev proposing in-progress → ready-for-deploy is allowed (authority is role-based, not track-based)" 0 "$VALIDATOR" "$AUTH_FEDEV_BE_RFD"

# Identity transition (from === to) bypasses authority check — design_sub_status update
AUTH_DESIGN_IDENTITY='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"fe\",\"from_status\":\"in-progress\",\"to_status\":\"in-progress\",\"agent\":\"ui-ux-designer\",\"timestamp\":\"2026-05-10T08:00:00Z\",\"design_sub_status\":\"design-ready-for-review\"}"}}'
run_exit "authority: identity transition bypasses authority check" 0 "$VALIDATOR" "$AUTH_DESIGN_IDENTITY"

# Open-authority transition: any agent can propose not-started → in-progress
AUTH_BA_START='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-1\",\"track\":\"be\",\"from_status\":\"not-started\",\"to_status\":\"in-progress\",\"agent\":\"ba\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "authority: ba can propose not-started → in-progress (open authority)" 0 "$VALIDATOR" "$AUTH_BA_START"

# --- required-artifact gate before "done" (Bug 2 fix) ---
# Set up fixture: task file with linked artifacts + deploy/QA reports on disk
mkdir -p "$FIX_ROOT/artifact-gate/docs/plan/phase-01-test/tasks"
mkdir -p "$FIX_ROOT/artifact-gate/docs/deploy-reports"
mkdir -p "$FIX_ROOT/artifact-gate/docs/qa-reports"
cat > "$FIX_ROOT/artifact-gate/docs/plan/phase-01-test/tasks/T-900.md" <<'EOF'
# T-900 — Test task for artifact gate

- Phase: phase-01-test/
- Track: be
- Status: in-test
- DoD: Works

## Status history

| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |

## Linked artifacts

- Deploy report: docs/deploy-reports/T-900.md
- QA report: docs/qa-reports/T-900.md
EOF
cat > "$FIX_ROOT/artifact-gate/docs/deploy-reports/T-900.md" <<'EOF'
# Deploy Report T-900
EOF
cat > "$FIX_ROOT/artifact-gate/docs/qa-reports/T-900.md" <<'EOF'
# QA Report T-900
EOF

# Task file with artifacts but QA report missing
mkdir -p "$FIX_ROOT/artifact-missing-qa/docs/plan/phase-01-test/tasks"
mkdir -p "$FIX_ROOT/artifact-missing-qa/docs/deploy-reports"
cp "$FIX_ROOT/artifact-gate/docs/plan/phase-01-test/tasks/T-900.md" \
   "$FIX_ROOT/artifact-missing-qa/docs/plan/phase-01-test/tasks/T-900.md"
cp "$FIX_ROOT/artifact-gate/docs/deploy-reports/T-900.md" \
   "$FIX_ROOT/artifact-missing-qa/docs/deploy-reports/T-900.md"
# No qa-reports/T-900.md — intentionally missing

# Task file with artifacts but deploy report missing
mkdir -p "$FIX_ROOT/artifact-missing-deploy/docs/plan/phase-01-test/tasks"
mkdir -p "$FIX_ROOT/artifact-missing-deploy/docs/qa-reports"
cp "$FIX_ROOT/artifact-gate/docs/plan/phase-01-test/tasks/T-900.md" \
   "$FIX_ROOT/artifact-missing-deploy/docs/plan/phase-01-test/tasks/T-900.md"
cp "$FIX_ROOT/artifact-gate/docs/qa-reports/T-900.md" \
   "$FIX_ROOT/artifact-missing-deploy/docs/qa-reports/T-900.md"
# No deploy-reports/T-900.md — intentionally missing

# Both artifacts missing
mkdir -p "$FIX_ROOT/artifact-missing-both/docs/plan/phase-01-test/tasks"
cp "$FIX_ROOT/artifact-gate/docs/plan/phase-01-test/tasks/T-900.md" \
   "$FIX_ROOT/artifact-missing-both/docs/plan/phase-01-test/tasks/T-900.md"
# No deploy-reports or qa-reports at all

# Task file with no Linked artifacts section (edge case — no reports declared)
mkdir -p "$FIX_ROOT/artifact-no-section/docs/plan/phase-01-test/tasks"
cat > "$FIX_ROOT/artifact-no-section/docs/plan/phase-01-test/tasks/T-900.md" <<'EOF'
# T-900 — No artifacts section

- Phase: phase-01-test/
- Track: be
- Status: in-test

## Status history

| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
EOF

# Task file with "(when ready)" suffix — still a valid path reference
mkdir -p "$FIX_ROOT/artifact-when-ready/docs/plan/phase-01-test/tasks"
mkdir -p "$FIX_ROOT/artifact-when-ready/docs/deploy-reports"
mkdir -p "$FIX_ROOT/artifact-when-ready/docs/qa-reports"
cat > "$FIX_ROOT/artifact-when-ready/docs/plan/phase-01-test/tasks/T-900.md" <<'EOF'
# T-900 — When-ready suffix

- Phase: phase-01-test/
- Track: be
- Status: in-test

## Status history

| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |

## Linked artifacts

- Deploy report: docs/deploy-reports/T-900.md (when ready)
- QA report: docs/qa-reports/T-900.md (when ready)
EOF
cat > "$FIX_ROOT/artifact-when-ready/docs/deploy-reports/T-900.md" <<'EOF'
# Deploy Report T-900
EOF
cat > "$FIX_ROOT/artifact-when-ready/docs/qa-reports/T-900.md" <<'EOF'
# QA Report T-900
EOF

DONE_BOTH_PRESENT='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
DONE_QA_MISSING='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
DONE_DEPLOY_MISSING='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
DONE_BOTH_MISSING='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
# Non-done transitions should not trigger artifact check
IP_TO_RFD='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-900\",\"track\":\"be\",\"from_status\":\"in-progress\",\"to_status\":\"ready-for-deploy\",\"agent\":\"be-dev\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'

run_exit "artifact gate: allows done when both reports exist" \
    0 "$VALIDATOR" "$DONE_BOTH_PRESENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-gate"
run_exit "artifact gate: blocks done when QA report missing" \
    2 "$VALIDATOR" "$DONE_QA_MISSING" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-missing-qa"
run_exit "artifact gate: blocks done when deploy report missing" \
    2 "$VALIDATOR" "$DONE_DEPLOY_MISSING" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-missing-deploy"
run_exit "artifact gate: blocks done when both reports missing" \
    2 "$VALIDATOR" "$DONE_BOTH_MISSING" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-missing-both"
# Non-done transitions skip artifact check entirely (even if reports are missing)
run_exit "artifact gate: non-done transition skips artifact check" \
    0 "$VALIDATOR" "$IP_TO_RFD" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-missing-both"
# No Linked artifacts section — no reports declared, so gate passes (fail-open for absent declarations)
run_exit "artifact gate: passes when task has no Linked artifacts section" \
    0 "$VALIDATOR" "$DONE_BOTH_PRESENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-no-section"
# "(when ready)" suffix — path still extracted, files present
run_exit "artifact gate: allows done with (when ready) suffix when files exist" \
    0 "$VALIDATOR" "$DONE_BOTH_PRESENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-when-ready"
# Unknown task_id — no task file found, fail-open
DONE_UNKNOWN='{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{\"task_id\":\"T-999\",\"track\":\"be\",\"from_status\":\"in-test\",\"to_status\":\"done\",\"agent\":\"qa-exec\",\"timestamp\":\"2026-05-10T08:00:00Z\"}"}}'
run_exit "artifact gate: fail-open when task file not found" \
    0 "$VALIDATOR" "$DONE_UNKNOWN" "CLAUDE_PROJECT_DIR=$FIX_ROOT/artifact-missing-both"

# ---------------- srs-status-guard.cjs ----------------
echo
echo "srs-status-guard.cjs:"
mkdir -p "$FIX_ROOT/srs-signed/docs" "$FIX_ROOT/srs-review/docs" "$FIX_ROOT/srs-draft/docs" "$FIX_ROOT/srs-missing"
cat > "$FIX_ROOT/srs-signed/docs/SRS.md" <<EOF
Status: Signed-off
Last-Updated: 2026-04-15
Signed-off-by: BA

# SRS body...
EOF
cat > "$FIX_ROOT/srs-review/docs/SRS.md" <<EOF
Status: In-Review
Last-Updated: 2026-05-01
Signed-off-by:

# SRS body...
EOF
cat > "$FIX_ROOT/srs-draft/docs/SRS.md" <<EOF
Status: Draft
Last-Updated: 2026-05-08
EOF

run_stdout_silent "silent when Signed-off" "$SRS_GUARD" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/srs-signed"
run_stdout_contains "warns on In-Review"   "$SRS_GUARD" '{}' "SRS Status: In-Review" "CLAUDE_PROJECT_DIR=$FIX_ROOT/srs-review"
run_stdout_contains "warns on Draft"       "$SRS_GUARD" '{}' "SRS Status: Draft"     "CLAUDE_PROJECT_DIR=$FIX_ROOT/srs-draft"
run_stdout_contains "warns when missing"   "$SRS_GUARD" '{}' "docs/SRS.md not found" "CLAUDE_PROJECT_DIR=$FIX_ROOT/srs-missing"
run_exit "always exits 0 (UserPromptSubmit)" 0 "$SRS_GUARD" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/srs-review"

# ---------------- open-issues-triage-gate.cjs ----------------
echo
echo "open-issues-triage-gate.cjs:"
mkdir -p "$FIX_ROOT/oi-clean/docs" "$FIX_ROOT/oi-open/docs" "$FIX_ROOT/oi-resolved/docs" "$FIX_ROOT/oi-missing"

cat > "$FIX_ROOT/oi-clean/docs/open-issues.md" <<EOF
# Open Issues
EOF

cat > "$FIX_ROOT/oi-open/docs/open-issues.md" <<EOF
# Open Issues

### ISSUE-001 — Missing API design for /payments
- Date: 2026-05-08T10:00:00Z
- Raised by: tl
- Track: be
- Severity: medium
- State: open

### ISSUE-002 — Figma version drift
- Date: 2026-05-09T11:00:00Z
- Raised by: fe-dev
- Track: fe
- Severity: high
- State: open

### ISSUE-003 — Old typo
- Date: 2026-05-01T10:00:00Z
- State: resolved
EOF

cat > "$FIX_ROOT/oi-resolved/docs/open-issues.md" <<EOF
# Open Issues

### ISSUE-001 — Old issue
- State: resolved

### ISSUE-002 — Another
- State: deferred
EOF

run_stdout_silent  "silent when no open"     "$OI_GATE" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-clean"
run_stdout_contains "lists open issue IDs"   "$OI_GATE" '{}' "ISSUE-001, ISSUE-002"  "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-open"
run_stdout_contains "cites §6 rule"          "$OI_GATE" '{}' "Per CLAUDE.md §6"      "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-open"
run_stdout_silent  "silent when all triaged" "$OI_GATE" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-resolved"
run_stdout_silent  "silent when file missing" "$OI_GATE" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-missing"
run_exit "always exits 0 (UserPromptSubmit)" 0 "$OI_GATE" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/oi-open"

# ---------------- master-plan-write-guard.cjs ----------------
echo
echo "master-plan-write-guard.cjs:"

# New semantics (path-based detection):
#   - docs/plan/ from main repo (no .worktrees/ segment) → Orchestrator context → ALLOW
#   - docs/plan/ inside .worktrees/<role>-<task-id>/      → sub-agent context   → BLOCK
#   - CLAUDE_ALLOW_PLAN_WRITE=1                           → escape hatch        → ALLOW
# The legacy CLAUDE_ORCHESTRATOR=1 env var no longer affects this hook.

# === Allow cases (Orchestrator context = default, no env, main-repo docs/plan/) ===
run_exit "allows Orchestrator Write on docs/plan/master-plan.md"  0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"x"}}'
run_exit "allows Orchestrator Write on phase.md"                  0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-01-foundation/phase.md","content":"x"}}'
run_exit "allows Orchestrator Write on task file"                 0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-01-foundation/tasks/T-001.md","content":"x"}}'
run_exit "allows Orchestrator Write on absolute main-repo path"   0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"/repo/docs/plan/master-plan.md","content":"x"}}'
run_exit "allows Orchestrator Edit on docs/plan/master-plan.md"   0 "$MP_GUARD" '{"tool_name":"Edit","tool_input":{"file_path":"docs/plan/master-plan.md","old_string":"a","new_string":"b"}}'
run_exit "allows Orchestrator MultiEdit"                          0 "$MP_GUARD" '{"tool_name":"MultiEdit","tool_input":{"file_path":"docs/plan/master-plan.md"}}'

# === Block cases (sub-agent attempting to write docs/plan/ inside its worktree) ===
run_exit "blocks sub-agent Write to .worktrees/ docs/plan/master-plan.md"  2 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-001/docs/plan/master-plan.md","content":"x"}}'
run_exit "blocks sub-agent Write to .worktrees/ phase.md"                  2 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/tl-T-002/docs/plan/phase-01-foundation/phase.md","content":"x"}}'
run_exit "blocks sub-agent Write to .worktrees/ task file"                 2 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-003/docs/plan/phase-01-foundation/tasks/T-001.md","content":"x"}}'
run_exit "blocks sub-agent Edit in worktree"                               2 "$MP_GUARD" '{"tool_name":"Edit","tool_input":{"file_path":".worktrees/fe-dev-T-004/docs/plan/master-plan.md","old_string":"a","new_string":"b"}}'
run_exit "blocks sub-agent absolute worktree path"                         2 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"/repo/.worktrees/be-dev-T-005/docs/plan/master-plan.md","content":"x"}}'

# === Non-plan-file writes always pass through ===
run_exit "allows Write on other docs"                       0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"x"}}'
run_exit "allows Write on docs/test-cases"                  0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/test-cases/by-us/US-001/functional.md","content":"x"}}'
run_exit "allows Write on plan-update.json"                 0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"plan-update.json","content":"{}"}}'
run_exit "allows Write on .worktrees/ plan-update.json"     0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-001/plan-update.json","content":"{}"}}'
run_exit "ignores Read tool"                                0 "$MP_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"docs/plan/master-plan.md"}}'

# === Escape hatch ===
run_exit "escape hatch CLAUDE_ALLOW_PLAN_WRITE=1 unblocks sub-agent"  0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-001/docs/plan/master-plan.md","content":"x"}}' "CLAUDE_ALLOW_PLAN_WRITE=1"

# === Legacy env var no longer enables/disables this hook ===
run_exit "legacy CLAUDE_ORCHESTRATOR=1 does NOT unblock sub-agent"    2 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-001/docs/plan/master-plan.md","content":"x"}}' ""
run_exit "legacy CLAUDE_ORCHESTRATOR not-set: main-repo still allowed" 0 "$MP_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"x"}}'

# === Robustness ===
run_exit "ignores empty stdin"                              0 "$MP_GUARD" ''
run_exit "ignores malformed event JSON"                     0 "$MP_GUARD" 'nope'

# ---------------- plan-consistency-validator.cjs ----------------
echo
echo "plan-consistency-validator.cjs:"

# --- Fixtures for master-plan ↔ phase.md consistency ---

# Consistent: master-plan says done 2/2, phase.md has 2 done tasks
mkdir -p "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks"
cat > "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/phase.md" <<'EOF'
# Phase 01 — Foundation

- Status: done
- Phase folder: phase-01-foundation/

## Tasks

| Task | Track | Status | DoD link | Design sub-status |
|---|---|---|---|---|
| T-001 | be | done | tasks/T-001.md | — |
| T-002 | be | done | tasks/T-002.md | — |
EOF
cat > "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks/T-001.md" <<'EOF'
# T-001 — Task one

- Status: done

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
| 2026-05-10T09:00:00Z | not-started | done | qa-exec | Done |
EOF
cat > "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks/T-002.md" <<'EOF'
# T-002 — Task two

- Status: done

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
| 2026-05-10T09:00:00Z | not-started | done | qa-exec | Done |
EOF

MP_CONSISTENT='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"# Master Plan\n\n## Phases\n\n| Phase | Folder | Status | Tasks | Notes |\n|---|---|---|---|---|\n| 01 — Foundation | phase-01-foundation/ | done | 2/2 done | — |\n"}}'

# Inconsistent: master-plan says done 2/2, but phase.md has 1 done + 1 ready-for-deploy
mkdir -p "$FIX_ROOT/pc-inconsistent-status/docs/plan/phase-01-foundation/tasks"
cp "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks/T-001.md" \
   "$FIX_ROOT/pc-inconsistent-status/docs/plan/phase-01-foundation/tasks/T-001.md"
cat > "$FIX_ROOT/pc-inconsistent-status/docs/plan/phase-01-foundation/tasks/T-002.md" <<'EOF'
# T-002 — Task two

- Status: ready-for-deploy

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
| 2026-05-10T09:00:00Z | not-started | ready-for-deploy | be-dev | Ready |
EOF
cat > "$FIX_ROOT/pc-inconsistent-status/docs/plan/phase-01-foundation/phase.md" <<'EOF'
# Phase 01 — Foundation

- Status: in-progress
- Phase folder: phase-01-foundation/

## Tasks

| Task | Track | Status | DoD link | Design sub-status |
|---|---|---|---|---|
| T-001 | be | done | tasks/T-001.md | — |
| T-002 | be | ready-for-deploy | tasks/T-002.md | — |
EOF

MP_INCONSISTENT_STATUS='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"# Master Plan\n\n## Phases\n\n| Phase | Folder | Status | Tasks | Notes |\n|---|---|---|---|---|\n| 01 — Foundation | phase-01-foundation/ | done | 2/2 done | — |\n"}}'

# Inconsistent: master-plan says 2/2 done, but phase.md has 2 not-started tasks
mkdir -p "$FIX_ROOT/pc-inconsistent-count/docs/plan/phase-01-foundation/tasks"
cat > "$FIX_ROOT/pc-inconsistent-count/docs/plan/phase-01-foundation/tasks/T-001.md" <<'EOF'
# T-001 — Task one

- Status: not-started

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
EOF
cat > "$FIX_ROOT/pc-inconsistent-count/docs/plan/phase-01-foundation/tasks/T-002.md" <<'EOF'
# T-002 — Task two

- Status: not-started

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
EOF
cat > "$FIX_ROOT/pc-inconsistent-count/docs/plan/phase-01-foundation/phase.md" <<'EOF'
# Phase 01 — Foundation

- Status: not-started
- Phase folder: phase-01-foundation/

## Tasks

| Task | Track | Status | DoD link | Design sub-status |
|---|---|---|---|---|
| T-001 | be | not-started | tasks/T-001.md | — |
| T-002 | be | not-started | tasks/T-002.md | — |
EOF

MP_INCONSISTENT_COUNT='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"# Master Plan\n\n## Phases\n\n| Phase | Folder | Status | Tasks | Notes |\n|---|---|---|---|---|\n| 01 — Foundation | phase-01-foundation/ | done | 2/2 done | — |\n"}}'

# --- Fixtures for phase.md ↔ T-NNN.md consistency ---

# Consistent phase write: phase.md says T-001 done, T-001.md says done
PHASE_CONSISTENT='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-01-foundation/phase.md","content":"# Phase 01 — Foundation\n\n- Status: done\n\n## Tasks\n\n| Task | Track | Status | DoD link |\n|---|---|---|---|\n| T-001 | be | done | tasks/T-001.md |\n"}}'

# Inconsistent phase write: phase.md says T-001 done, but T-001.md says in-progress
mkdir -p "$FIX_ROOT/pc-phase-task-mismatch/docs/plan/phase-01-foundation/tasks"
cat > "$FIX_ROOT/pc-phase-task-mismatch/docs/plan/phase-01-foundation/tasks/T-001.md" <<'EOF'
# T-001 — Task one

- Status: in-progress

## Status history
| Timestamp | From | To | Agent | Notes |
|---|---|---|---|---|
| 2026-05-10T08:00:00Z | — | not-started | tl | Created |
| 2026-05-10T09:00:00Z | not-started | in-progress | be-dev | Started |
EOF

PHASE_INCONSISTENT='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-01-foundation/phase.md","content":"# Phase 01 — Foundation\n\n- Status: done\n\n## Tasks\n\n| Task | Track | Status | DoD link |\n|---|---|---|---|\n| T-001 | be | done | tasks/T-001.md |\n"}}'

# Sub-agent context (path inside .worktrees/) — validator skips; write-guard handles separately.
run_exit "consistency: skips sub-agent worktree writes (write-guard handles separately)" \
    0 "$PLAN_CONSISTENCY" '{"tool_name":"Write","tool_input":{"file_path":".worktrees/be-dev-T-001/docs/plan/master-plan.md","content":"x"}}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"

# Master-plan consistency tests (path-based detection — no env var needed)
run_exit "consistency: allows master-plan when consistent with phase" \
    0 "$PLAN_CONSISTENCY" "$MP_CONSISTENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"
run_exit "consistency: blocks master-plan when phase status disagrees" \
    2 "$PLAN_CONSISTENCY" "$MP_INCONSISTENT_STATUS" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-inconsistent-status"
run_exit "consistency: blocks master-plan when task count disagrees" \
    2 "$PLAN_CONSISTENCY" "$MP_INCONSISTENT_COUNT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-inconsistent-count"

# Phase ↔ task consistency tests
run_exit "consistency: allows phase.md when task statuses match" \
    0 "$PLAN_CONSISTENCY" "$PHASE_CONSISTENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"
run_exit "consistency: blocks phase.md when task file status disagrees" \
    2 "$PLAN_CONSISTENCY" "$PHASE_INCONSISTENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-phase-task-mismatch"

# Non-plan-file writes pass through
run_exit "consistency: ignores writes to non-plan files" \
    0 "$PLAN_CONSISTENCY" '{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"hello"}}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"
run_exit "consistency: ignores Read tool" \
    0 "$PLAN_CONSISTENCY" '{"tool_name":"Read","tool_input":{"file_path":"docs/plan/master-plan.md"}}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"

# Robustness
run_exit "consistency: ignores empty stdin" \
    0 "$PLAN_CONSISTENCY" '' ""
run_exit "consistency: ignores malformed event JSON" \
    0 "$PLAN_CONSISTENCY" 'not json' ""

# Edit tool: compute final content from existing file on disk
mkdir -p "$FIX_ROOT/pc-edit-consistent/docs/plan/phase-01-foundation/tasks"
cp "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/phase.md" \
   "$FIX_ROOT/pc-edit-consistent/docs/plan/phase-01-foundation/phase.md"
cp "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks/T-001.md" \
   "$FIX_ROOT/pc-edit-consistent/docs/plan/phase-01-foundation/tasks/T-001.md"
cp "$FIX_ROOT/pc-consistent/docs/plan/phase-01-foundation/tasks/T-002.md" \
   "$FIX_ROOT/pc-edit-consistent/docs/plan/phase-01-foundation/tasks/T-002.md"

EDIT_CONSISTENT=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/docs/plan/phase-01-foundation/phase.md","old_string":"- Status: done","new_string":"- Status: done"}}' "$FIX_ROOT/pc-edit-consistent")
run_exit "consistency: allows Edit on consistent phase" \
    0 "$PLAN_CONSISTENCY" "$EDIT_CONSISTENT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-edit-consistent"

# Missing phase folder — fail-open (phase may not exist yet)
MP_MISSING_PHASE='{"tool_name":"Write","tool_input":{"file_path":"docs/plan/master-plan.md","content":"# Master Plan\n\n## Phases\n\n| Phase | Folder | Status | Tasks | Notes |\n|---|---|---|---|---|\n| 01 — New | phase-01-new/ | not-started | 0/0 done | — |\n"}}'
run_exit "consistency: fail-open when phase folder missing" \
    0 "$PLAN_CONSISTENCY" "$MP_MISSING_PHASE" "CLAUDE_PROJECT_DIR=$FIX_ROOT/pc-consistent"

# ---------------- session-init-summary.cjs ----------------
echo
echo "session-init-summary.cjs:"
mkdir -p "$FIX_ROOT/session-empty"
mkdir -p "$FIX_ROOT/session-rich/docs"

cat > "$FIX_ROOT/session-rich/docs/SRS.md" <<EOF
Status: Signed-off
Last-Updated: 2026-04-15
Signed-off-by: BA
EOF

cat > "$FIX_ROOT/session-rich/docs/open-issues.md" <<EOF
### ISSUE-001
- State: open
### ISSUE-002
- State: resolved
### ISSUE-003
- State: resolved
EOF

mkdir -p "$FIX_ROOT/session-rich/docs/plan"
cat > "$FIX_ROOT/session-rich/docs/plan/master-plan.md" <<EOF
# Master Plan

- SRS: docs/SRS.md (Status: Signed-off, Last-Updated: 2026-04-15)
- Project shape: 3 phases, 5 tasks total

## Phases

| Phase | Folder | Status | Tasks | Notes |
|---|---|---|---|---|
| 01 — Foundation | phase-01-foundation/ | done | 2/2 done | — |
| 02 — Auth | phase-02-auth/ | in-progress | 1/2 done, 1 in-progress | — |
| 03 — Profile | phase-03-profile/ | not-started | 0/1 done | — |

## Running tasks

| Task | Phase | Track | Status | Design sub-status |
|---|---|---|---|---|
| T-003 | 02 | be | in-progress | — |

## Phase-level changelog

| Date | Phase | Change |
|---|---|---|
| 2026-05-12 | 02 | started |
EOF

run_stdout_contains "shows SRS Signed-off"    "$SESSION_INIT" '{}' "SRS: Signed-off"          "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"
run_stdout_contains "shows open issues count" "$SESSION_INIT" '{}' "1 OPEN"                   "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"
run_stdout_contains "shows plan with 3 phases"     "$SESSION_INIT" '{}' "3 phase(s)"                  "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"
run_stdout_contains "shows phase done count"       "$SESSION_INIT" '{}' "1 done"                       "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"
run_stdout_contains "shows running task count"     "$SESSION_INIT" '{}' "1 running task(s)"            "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"
run_stdout_contains "handles missing files"   "$SESSION_INIT" '{}' "docs/SRS.md not found"    "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-empty"
run_exit "always exits 0"                     0 "$SESSION_INIT" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/session-rich"

# ---------------- kit-role-dispatch-guard.cjs ----------------
echo
echo "kit-role-dispatch-guard.cjs:"
# Allows non-Task tool calls untouched
run_exit "ignores non-Task tool (Read)"                  0 "$ROLE_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"docs/SRS.md"}}'
run_exit "ignores Task with specialized subagent_type"   0 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"ba","prompt":"Run BA Mode F on docs/requirements/"}}'
run_exit "ignores Task with sa subagent_type"            0 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"sa","prompt":"Run SA extract mode against the archaeology report"}}'
run_exit "allows general-purpose for non-kit-role work"  0 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Summarize the recent commits"}}'

# BLOCK: general-purpose dispatch with kit-role signals in the prompt
run_exit "blocks general-purpose with BA Mode F prompt"   2 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Run BA Mode F to synthesize SRS from docs/requirements/"}}'
run_exit "blocks general-purpose with SA extract prompt"  2 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Run SA extract mode against the codebase archaeology report"}}'
run_exit "blocks general-purpose with QA-Author prompt"   2 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Run QA-Author by-us mode for US-001"}}'
run_exit "blocks general-purpose with kit artifact path"  2 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Update docs/user-stories/US-005 with new Business Rules"}}'
run_exit "blocks general-purpose with archaeologist sig"  2 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Run Codebase Archaeologist on services/webshop"}}'

# Escape hatch: CLAUDE_ALLOW_GENERAL_PURPOSE=1
run_exit "escape hatch CLAUDE_ALLOW_GENERAL_PURPOSE=1"    0 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","prompt":"Run BA Mode F to synthesize SRS"}}' "CLAUDE_ALLOW_GENERAL_PURPOSE=1"

# Robustness
run_exit "ignores empty stdin"                            0 "$ROLE_GUARD" ''
run_exit "ignores malformed event JSON"                   0 "$ROLE_GUARD" 'not json'
run_exit "ignores Task with no prompt"                    0 "$ROLE_GUARD" '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose"}}'

# ---------------- acceptance-scenarios-validator.cjs ----------------
echo
echo "acceptance-scenarios-validator.cjs:"
# Build US/FR content fixtures (escaped for JSON)
US_GOOD='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-001.md","content":"# US-001\n\n## Acceptance Scenarios\n\n### Scenario 1: Happy path\n- **Given** state X\n- **When** action Y\n- **Then** outcome Z\n"}}'
US_NO_SECTION='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-002.md","content":"# US-002\n\n## Description\nNo Acceptance Scenarios section.\n"}}'
US_SECTION_NO_GWT='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-003.md","content":"# US-003\n\n## Acceptance Scenarios\n\n### Scenario 1: empty\nNo Given/When/Then here.\n"}}'
US_PARTIAL_GWT='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-004.md","content":"# US-004\n\n## Acceptance Scenarios\n\n### Scenario 1: half done\n- **Given** state X\n- **When** action Y\n(no Then)\n"}}'
FR_GOOD='{"tool_name":"Write","tool_input":{"file_path":"docs/frs/FR-001.md","content":"# FR-001\n\n## Acceptance Scenarios\n\n### Scenario 1: success\n- **Given** preconditions\n- **When** request\n- **Then** 200 response\n"}}'
FR_NO_SECTION='{"tool_name":"Write","tool_input":{"file_path":"docs/frs/FR-002.md","content":"# FR-002\n\n## Description\nNo Acceptance Scenarios.\n"}}'

run_exit "allows US with valid G/W/T triple"           0 "$SCENARIOS_VALIDATOR" "$US_GOOD"
run_exit "blocks US without Acceptance Scenarios"      2 "$SCENARIOS_VALIDATOR" "$US_NO_SECTION"
run_exit "blocks US with section but no G/W/T"         2 "$SCENARIOS_VALIDATOR" "$US_SECTION_NO_GWT"
run_exit "blocks US with partial G/W/T (no Then)"      2 "$SCENARIOS_VALIDATOR" "$US_PARTIAL_GWT"
run_exit "allows FR with valid G/W/T triple"           0 "$SCENARIOS_VALIDATOR" "$FR_GOOD"
run_exit "blocks FR without Acceptance Scenarios"      2 "$SCENARIOS_VALIDATOR" "$FR_NO_SECTION"

# Non-US/FR paths pass through
run_exit "ignores SRS.md"                              0 "$SCENARIOS_VALIDATOR" '{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\nNo Acceptance Scenarios.\n"}}'
run_exit "ignores non-Write tool"                      0 "$SCENARIOS_VALIDATOR" '{"tool_name":"Read","tool_input":{"file_path":"docs/user-stories/US-001.md"}}'
run_exit "ignores empty stdin"                         0 "$SCENARIOS_VALIDATOR" ''
run_exit "ignores malformed event JSON"                0 "$SCENARIOS_VALIDATOR" 'not json'

# Fenced code blocks inside the file body don't fake out the parser
US_FENCED='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-005.md","content":"# US-005\n\n## Description\n\n\u0060\u0060\u0060\n## Acceptance Scenarios\n- **Given** fake\n- **When** fake\n- **Then** fake\n\u0060\u0060\u0060\n"}}'
run_exit "blocks US with fenced-only Acceptance Scenarios"  2 "$SCENARIOS_VALIDATOR" "$US_FENCED"

# ---------------- self-containment-validator.cjs ----------------
echo
echo "self-containment-validator.cjs:"

# Build content fixtures
# Self-contained US (only audit annotations + lateral refs)
US_OK='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-001.md","content":"# US-001\n\n- **Synthesized-From:** docs/requirements/spec.md\n- **Linked FRs:** FR-001\n\n## Pre-conditions\n\nUser is authenticated.\n"}}'
# US with body-content back-reference to docs/requirements/
US_BAD_REQ='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-002.md","content":"# US-002\n\n## Pre-conditions\n\nSee docs/requirements/api-spec.md for the full schema.\n"}}'
# US with archaeology-report back-reference
US_BAD_ARCH='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-003.md","content":"# US-003\n\n## Business Rules\n\nDetails in docs/archaeology-reports/webshop.md for the full rule.\n"}}'
# SRS with body-content Confluence reference
SRS_BAD_EXT='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\n## Security\n\nSee Confluence page X for the security policy.\n"}}'
# Architecture.md with code-path reference
ARCH_BAD_CODE='{"tool_name":"Write","tool_input":{"file_path":"docs/architecture.md","content":"# Architecture\n\n## Components\n\nSee services/cart/handler.ts for the implementation.\n"}}'
# FR file with audit annotation only (allowed)
FR_OK='{"tool_name":"Write","tool_input":{"file_path":"docs/frs/FR-001.md","content":"# FR-001\n\n- **Source:** confluence://wiki.example.com/spaces/PROD/pages/12345\n- **Linked Component:** Join Handler\n\n## Description\n\nThe handler processes incoming join requests.\n"}}'

run_exit "allows US with only audit annotations"        0 "$SELF_CONTAINMENT" "$US_OK"
run_exit "blocks US body refs to docs/requirements/"    2 "$SELF_CONTAINMENT" "$US_BAD_REQ"
run_exit "blocks US body refs to docs/archaeology-reports/" 2 "$SELF_CONTAINMENT" "$US_BAD_ARCH"
run_exit "blocks SRS body refs to Confluence"           2 "$SELF_CONTAINMENT" "$SRS_BAD_EXT"
run_exit "blocks architecture.md refs to code paths"    2 "$SELF_CONTAINMENT" "$ARCH_BAD_CODE"
run_exit "allows FR with audit annotation only"         0 "$SELF_CONTAINMENT" "$FR_OK"

# Changelog mentions of upstream paths are allowed
SRS_CHANGELOG_OK='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\n## 10. Changelog\n\n| Date | Change |\n| 2026-05-20 | BA Mode F ingested 6 fragments from docs/requirements/ | BA |\n"}}'
run_exit "allows changelog mentions of upstream paths"  0 "$SELF_CONTAINMENT" "$SRS_CHANGELOG_OK"

# Fenced code blocks containing back-references are allowed (illustrative)
US_FENCED_REF='{"tool_name":"Write","tool_input":{"file_path":"docs/user-stories/US-004.md","content":"# US-004\n\n## Description\n\nSee example below.\n\n\u0060\u0060\u0060\nsee docs/requirements/example.md\n\u0060\u0060\u0060\n"}}'
run_exit "allows back-refs inside fenced code blocks"   0 "$SELF_CONTAINMENT" "$US_FENCED_REF"

# Non-kit-artifact paths pass through
run_exit "ignores non-kit-artifact paths"               0 "$SELF_CONTAINMENT" '{"tool_name":"Write","tool_input":{"file_path":"docs/open-issues.md","content":"See docs/requirements/notes.md for details."}}'
run_exit "ignores non-Write tool"                       0 "$SELF_CONTAINMENT" '{"tool_name":"Read","tool_input":{"file_path":"docs/SRS.md"}}'
run_exit "ignores empty stdin"                          0 "$SELF_CONTAINMENT" ''
run_exit "ignores malformed event JSON"                 0 "$SELF_CONTAINMENT" 'not json'

# Test case + UI handoff coverage
TC_BAD='{"tool_name":"Write","tool_input":{"file_path":"docs/test-cases/by-us/US-001/functional.md","content":"# TCs\n\nDetails in docs/requirements/test-plan.md\n"}}'
HANDOFF_BAD='{"tool_name":"Write","tool_input":{"file_path":"docs/uiux/handoffs/T-001.md","content":"# Handoff\n\nSee Confluence page for color palette.\n"}}'
run_exit "blocks test-case body refs to upstream"       2 "$SELF_CONTAINMENT" "$TC_BAD"
run_exit "blocks UI handoff body refs to upstream"      2 "$SELF_CONTAINMENT" "$HANDOFF_BAD"

# ---------------- external-integration-adequacy-validator.cjs ----------------
echo
echo "external-integration-adequacy-validator.cjs:"

# Set up fixture filesystems for hook to scan
mkdir -p "$FIX_ROOT/ext-allow/docs/external-integrations"
cat > "$FIX_ROOT/ext-allow/docs/external-integrations/passport.md" <<'EOF'
# External Integration — Account/Passport
- **Adequacy:** adequate
EOF
cat > "$FIX_ROOT/ext-allow/docs/external-integrations/kafka.md" <<'EOF'
# External Integration — Kafka
- **Adequacy:** adequate
EOF

mkdir -p "$FIX_ROOT/ext-bad-inadequate/docs/external-integrations"
cat > "$FIX_ROOT/ext-bad-inadequate/docs/external-integrations/passport.md" <<'EOF'
# External Integration — Account/Passport
- **Adequacy:** adequate
EOF
cat > "$FIX_ROOT/ext-bad-inadequate/docs/external-integrations/stripe.md" <<'EOF'
# External Integration — Stripe
- **Adequacy:** inadequate
EOF

mkdir -p "$FIX_ROOT/ext-bad-deferred/docs/external-integrations"
cat > "$FIX_ROOT/ext-bad-deferred/docs/external-integrations/analytics.md" <<'EOF'
# External Integration — Analytics
- **Adequacy:** deferred
EOF

mkdir -p "$FIX_ROOT/ext-bad-missing/docs/external-integrations"
cat > "$FIX_ROOT/ext-bad-missing/docs/external-integrations/kafka.md" <<'EOF'
# External Integration — Kafka
- **Owner team:** Platform Eng
EOF

mkdir -p "$FIX_ROOT/ext-empty/docs"
# No docs/external-integrations/ folder at all (self-contained product)

# Payloads — Write a SRS with Status: Signed-off (note: backslash-n is LITERAL in JSON)
SRS_SIGNED='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\nStatus: Signed-off\nLast-Updated: 2026-05-21\nSigned-off-by: BA\n"}}'
SRS_DRAFT='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\nStatus: Draft\nLast-Updated: 2026-05-21\n"}}'
SRS_IN_REVIEW='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\nStatus: In-Review\nLast-Updated: 2026-05-21\n"}}'

# Allow cases
run_exit "allows Signed-off when all integrations are adequate" 0 "$EXT_ADEQUACY" "$SRS_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-allow"
run_exit "allows Signed-off when no integrations folder exists" 0 "$EXT_ADEQUACY" "$SRS_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-empty"
run_exit "allows Status: Draft (gate fires only on Signed-off)" 0 "$EXT_ADEQUACY" "$SRS_DRAFT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-inadequate"
run_exit "allows Status: In-Review (gate fires only on Signed-off)" 0 "$EXT_ADEQUACY" "$SRS_IN_REVIEW" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-inadequate"

# Block cases
run_exit "blocks Signed-off when one integration is inadequate" 2 "$EXT_ADEQUACY" "$SRS_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-inadequate"
run_exit "blocks Signed-off when one integration is deferred (strict gate)" 2 "$EXT_ADEQUACY" "$SRS_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-deferred"
run_exit "blocks Signed-off when an integration is missing Adequacy field" 2 "$EXT_ADEQUACY" "$SRS_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-missing"

# Edit-tool fixture — existing SRS on disk, edit flips Status to Signed-off
mkdir -p "$FIX_ROOT/ext-edit-allow/docs/external-integrations"
cat > "$FIX_ROOT/ext-edit-allow/docs/external-integrations/passport.md" <<'EOF'
# External Integration — Account/Passport
- **Adequacy:** adequate
EOF
cat > "$FIX_ROOT/ext-edit-allow/docs/SRS.md" <<'EOF'
# SRS

Status: In-Review
Last-Updated: 2026-05-20
EOF
mkdir -p "$FIX_ROOT/ext-edit-block/docs/external-integrations"
cat > "$FIX_ROOT/ext-edit-block/docs/external-integrations/stripe.md" <<'EOF'
# External Integration — Stripe
- **Adequacy:** inadequate
EOF
cat > "$FIX_ROOT/ext-edit-block/docs/SRS.md" <<'EOF'
# SRS

Status: In-Review
Last-Updated: 2026-05-20
EOF

# Use ABSOLUTE file_path for Edit (hook needs to read actual file)
SRS_EDIT_ALLOW=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/docs/SRS.md","old_string":"Status: In-Review","new_string":"Status: Signed-off"}}' "$FIX_ROOT/ext-edit-allow")
SRS_EDIT_BLOCK=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/docs/SRS.md","old_string":"Status: In-Review","new_string":"Status: Signed-off"}}' "$FIX_ROOT/ext-edit-block")
run_exit "allows Edit flipping to Signed-off when all adequate" 0 "$EXT_ADEQUACY" "$SRS_EDIT_ALLOW" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-edit-allow"
run_exit "blocks Edit flipping to Signed-off when inadequate" 2 "$EXT_ADEQUACY" "$SRS_EDIT_BLOCK" "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-edit-block"

# Non-trigger cases
run_exit "ignores non-SRS file_path (other docs)"             0 "$EXT_ADEQUACY" '{"tool_name":"Write","tool_input":{"file_path":"docs/open-issues.md","content":"Status: Signed-off"}}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/ext-bad-inadequate"
run_exit "ignores non-Write/Edit tool"                        0 "$EXT_ADEQUACY" '{"tool_name":"Read","tool_input":{"file_path":"docs/SRS.md"}}'
run_exit "ignores empty stdin (ext-adequacy)"                 0 "$EXT_ADEQUACY" ''
run_exit "ignores malformed event JSON (ext-adequacy)"        0 "$EXT_ADEQUACY" 'not json'

# ---------------- qa-runtime-evidence-validator.cjs ----------------
echo
echo "qa-runtime-evidence-validator.cjs:"

# --- Fixtures ---

# be task file (track: be) — hook should gate this
mkdir -p "$FIX_ROOT/qa-be/docs/plan/phase-01-worker/tasks"
cat > "$FIX_ROOT/qa-be/docs/plan/phase-01-worker/tasks/T-052.md" <<'EOF'
# T-052 — Worker pipeline smoke

- Phase: phase-01-worker/
- Track: be
- Status: in-test
- DoD: Pipeline runs end-to-end
EOF

# fe task file (track: fe) — hook should skip (only gates be/be+fe)
mkdir -p "$FIX_ROOT/qa-fe/docs/plan/phase-02-ui/tasks"
cat > "$FIX_ROOT/qa-fe/docs/plan/phase-02-ui/tasks/T-060.md" <<'EOF'
# T-060 — UI dashboard

- Phase: phase-02-ui/
- Track: fe
- Status: in-test
- DoD: Dashboard renders
EOF

# be+fe task file
mkdir -p "$FIX_ROOT/qa-befe/docs/plan/phase-03-api-ui/tasks"
cat > "$FIX_ROOT/qa-befe/docs/plan/phase-03-api-ui/tasks/T-070.md" <<'EOF'
# T-070 — API + UI combined

- Phase: phase-03-api-ui/
- Track: be+fe
- Status: in-test
- DoD: API serves, UI displays
EOF

# Task file with **Track:** (bold variant)
mkdir -p "$FIX_ROOT/qa-be-bold/docs/plan/phase-01-worker/tasks"
cat > "$FIX_ROOT/qa-be-bold/docs/plan/phase-01-worker/tasks/T-052.md" <<'EOF'
# T-052 — Worker pipeline smoke

- Phase: phase-01-worker/
- **Track:** be
- Status: in-test
- DoD: Pipeline runs end-to-end
EOF

# --- QA report payloads ---

# BE task: QA report with runtime evidence (smoke test PASS)
QA_RUNTIME_GOOD='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-052.md","content":"# QA Report T-052\n\n| FR-001 | Repository Sync | smoke test PASS, curl /api/sync returned 200 | PASS |\n| FR-002 | Worker Trigger | curl /api/trigger executed successfully | PASS |\n"}}'

# BE task: QA report with only "Code: ..., unit tests pass" (Bug 4 pattern)
QA_CODE_EXISTS_ONLY='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-052.md","content":"# QA Report T-052\n\n| FR-001 | Repository Sync | Code: server/src/sync.ts, unit tests pass | PASS |\n| FR-002 | Worker Trigger | Code: server/src/trigger.ts, implementation exists | PASS |\n"}}'

# BE task: QA report with Smoke section + PASS (blanket coverage even if FR rows are thin)
QA_SMOKE_SECTION='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-052.md","content":"# QA Report T-052\n\n| FR-001 | Repository Sync | Code: server/src/sync.ts, unit tests pass | PASS |\n\n## Smoke test results\n\nExecuted smoke test suite against local deployment. All endpoints responded correctly.\n\n- curl /api/sync → 200 OK (verified)\n- curl /api/trigger → 202 Accepted (verified)\n\nSmoke PASS.\n"}}'

# FE task: QA report with code-exists-only (should be SKIPPED — only gates be/be+fe)
QA_FE_CODE_EXISTS='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-060.md","content":"# QA Report T-060\n\n| FR-010 | Dashboard | Code: src/Dashboard.tsx, unit tests pass | PASS |\n"}}'

# be+fe task: QA report with runtime evidence
QA_BEFE_RUNTIME='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-070.md","content":"# QA Report T-070\n\n| FR-020 | API + UI | curl /api/data returned 200, Playwright e2e PASS | PASS |\n"}}'

# be+fe task: QA report with code-exists-only
QA_BEFE_CODE_EXISTS='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-070.md","content":"# QA Report T-070\n\n| FR-020 | API + UI | Code: src/api.ts, unit tests pass | PASS |\n"}}'

# Unknown task ID (no task file found — fail-open)
QA_UNKNOWN_TASK='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-999.md","content":"# QA Report T-999\n\n| FR-001 | Something | Code: src/x.ts, unit tests pass | PASS |\n"}}'

# Non-QA-report write (should pass through)
QA_NON_REPORT='{"tool_name":"Write","tool_input":{"file_path":"docs/deploy-reports/T-052.md","content":"Deployed successfully."}}'

# Read tool (should pass through)
QA_READ='{"tool_name":"Read","tool_input":{"file_path":"docs/qa-reports/T-052.md"}}'

# BE task with mixed evidence: some FR rows have runtime, some don't (should PASS — at least one has runtime)
QA_MIXED='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-052.md","content":"# QA Report T-052\n\n| FR-001 | Repository Sync | Code: server/src/sync.ts, unit tests pass | PASS |\n| FR-002 | Worker Trigger | curl /api/trigger returned 202 | PASS |\n"}}'

# Integration test section with PASS results
QA_INTEGRATION_SECTION='{"tool_name":"Write","tool_input":{"file_path":"docs/qa-reports/T-052.md","content":"# QA Report T-052\n\n| FR-001 | Repository Sync | Code: server/src/sync.ts, unit tests pass | PASS |\n\n## Integration test execution\n\nIntegration test suite ran against staging. All API contracts verified.\n\nIntegration test PASS.\n"}}'

# --- Tests ---

# Core Bug 4 fix: BE task QA report must have runtime evidence
run_exit "qa-evidence: allows be task report with runtime evidence" \
    0 "$QA_EVIDENCE" "$QA_RUNTIME_GOOD" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: blocks be task report with code-exists-only" \
    2 "$QA_EVIDENCE" "$QA_CODE_EXISTS_ONLY" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: allows be task report with Smoke section + PASS" \
    0 "$QA_EVIDENCE" "$QA_SMOKE_SECTION" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: allows be task report with mixed evidence (some runtime)" \
    0 "$QA_EVIDENCE" "$QA_MIXED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: allows be task report with Integration section + PASS" \
    0 "$QA_EVIDENCE" "$QA_INTEGRATION_SECTION" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"

# FE task — hook skips (only gates be/be+fe)
run_exit "qa-evidence: skips fe task report with code-exists-only" \
    0 "$QA_EVIDENCE" "$QA_FE_CODE_EXISTS" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-fe"

# be+fe task — hook gates this too
run_exit "qa-evidence: allows be+fe task report with runtime evidence" \
    0 "$QA_EVIDENCE" "$QA_BEFE_RUNTIME" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-befe"
run_exit "qa-evidence: blocks be+fe task report with code-exists-only" \
    2 "$QA_EVIDENCE" "$QA_BEFE_CODE_EXISTS" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-befe"

# Fail-open cases
run_exit "qa-evidence: fail-open when task file not found" \
    0 "$QA_EVIDENCE" "$QA_UNKNOWN_TASK" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: ignores non-QA-report writes" \
    0 "$QA_EVIDENCE" "$QA_NON_REPORT" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: ignores Read tool" \
    0 "$QA_EVIDENCE" "$QA_READ" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"

# Bold **Track:** variant
run_exit "qa-evidence: handles bold **Track:** be variant" \
    2 "$QA_EVIDENCE" "$QA_CODE_EXISTS_ONLY" "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be-bold"

# Robustness
run_exit "qa-evidence: ignores empty stdin" \
    0 "$QA_EVIDENCE" '' "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"
run_exit "qa-evidence: ignores malformed event JSON" \
    0 "$QA_EVIDENCE" 'not json' "CLAUDE_PROJECT_DIR=$FIX_ROOT/qa-be"

# ---------------- messy fixtures (fence-stripping regression tests) ----------------
# Each kit-format markdown file may contain a fenced "for reference, here's the format"
# block at the top, copied from CLAUDE.md or the ingestion checklist. Hooks must ignore
# such fenced content and parse only real entries.
echo
echo "messy fixtures (fence-stripping regression):"

# SRS with fenced header reference + real header
mkdir -p "$FIX_ROOT/messy-srs/docs"
cat > "$FIX_ROOT/messy-srs/docs/SRS.md" <<'EOF'
# SRS

Format reference — every SRS has this header. The values shown are placeholders:

```
Status: Draft | In-Review | Signed-off
Last-Updated: <ISO-8601>
Signed-off-by: BA
Designated Design Approver: <name | TBD>
```

Status: Signed-off
Last-Updated: 2026-05-10
Signed-off-by: BA
Designated Design Approver: Viet Phan

# US-001 — example user story
EOF

run_stdout_silent "srs-status-guard ignores fenced example, sees real Signed-off" \
    "$SRS_GUARD" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-srs"
run_stdout_contains "session-init reports real SRS: Signed-off" \
    "$SESSION_INIT" '{}' "SRS: Signed-off" "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-srs"

# open-issues.md with fenced template + real entries (one open, one resolved)
mkdir -p "$FIX_ROOT/messy-oi/docs"
cat > "$FIX_ROOT/messy-oi/docs/open-issues.md" <<'EOF'
# Open Issues

Format reference — copy this when adding a new entry:

```
### ISSUE-EXAMPLE — Template only
- Date: <ISO-8601>
- Raised by: <agent>
- Track: be | fe | be+fe | infra | qa | cross-cutting
- Severity: low | medium | high
- State: open
```

### ISSUE-001 — Real open issue
- Date: 2026-05-10T08:00:00Z
- Raised by: ba
- State: open

### ISSUE-002 — Real resolved issue
- Date: 2026-05-09T10:00:00Z
- State: resolved
EOF

run_stdout_contains "oi-gate ignores fenced ISSUE-EXAMPLE, only reports ISSUE-001" \
    "$OI_GATE" '{}' "1 open issue(s)" "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-oi"
run_stdout_contains "oi-gate lists only ISSUE-001 not ISSUE-EXAMPLE" \
    "$OI_GATE" '{}' "ISSUE-001" "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-oi"
# Assert the example ID does NOT appear in stdout
unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
printf '{}' | CLAUDE_PROJECT_DIR="$FIX_ROOT/messy-oi" node "$OI_GATE" >"$STDOUT_TMP" 2>"$STDERR_TMP"
if grep -qF "ISSUE-EXAMPLE" "$STDOUT_TMP"; then
  printf "  FAIL  oi-gate must NOT include fenced ISSUE-EXAMPLE in output\n"
  sed 's/^/        stdout: /' "$STDOUT_TMP"
  FAIL=$((FAIL+1))
else
  printf "  PASS  oi-gate omits fenced ISSUE-EXAMPLE\n"
  PASS=$((PASS+1))
fi

run_stdout_contains "session-init counts only real entries (1 OPEN / 1 resolved)" \
    "$SESSION_INIT" '{}' "1 OPEN" "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-oi"

# master-plan.md with fenced format reference + real task entries
mkdir -p "$FIX_ROOT/messy-mp/docs"
mkdir -p "$FIX_ROOT/messy-mp/docs/plan"
cat > "$FIX_ROOT/messy-mp/docs/plan/master-plan.md" <<'EOF'
# Master Plan

Phase format reference (do not parse the example phase row):

```
| 99 — Example phase | phase-99-example/ | not-started | 0/3 done | — |
```

## Phases

| Phase | Folder | Status | Tasks | Notes |
|---|---|---|---|---|
| 01 — Real phase one | phase-01-real-one/ | done | 2/2 done | — |
| 02 — Real phase two | phase-02-real-two/ | in-progress | 1/3 done, 1 in-progress | — |

## Running tasks

| Task | Phase | Track | Status |
|---|---|---|---|
| T-003 | 02 | be | in-progress |
EOF

# Expectations: 2 unique task IDs (T-001, T-002), not 3 (T-XXX from fence should be ignored)
run_stdout_contains "session-init counts real phases only (2)" \
    "$SESSION_INIT" '{}' "2 phase(s)" "CLAUDE_PROJECT_DIR=$FIX_ROOT/messy-mp"
# Status mentions: the fenced "99 — Example phase" row should NOT be counted.
# Real phases: 1 done + 1 in-progress; the fenced not-started example must be ignored.
unset CLAUDE_PRIVACY_OK CLAUDE_ORCHESTRATOR CLAUDE_PROJECT_DIR
printf '{}' | CLAUDE_PROJECT_DIR="$FIX_ROOT/messy-mp" node "$SESSION_INIT" >"$STDOUT_TMP" 2>"$STDERR_TMP"
if grep -qE "1 not-started" "$STDOUT_TMP"; then
  printf "  FAIL  session-init must NOT count fenced not-started phase example\n"
  sed 's/^/        stdout: /' "$STDOUT_TMP"
  FAIL=$((FAIL+1))
else
  printf "  PASS  session-init omits fenced not-started phase example\n"
  PASS=$((PASS+1))
fi

# ---------------- markdown-wrapped header parsing (regression tests) ----------------
# The SRS template renders header fields bold: `**Status:** Draft`, `**Last-Updated:** ...`.
# Older hooks rigidly matched `^Status:` and silently missed the bold variant.
# The shared lib/parse-header.cjs helper now powers all header parsing; these tests
# exercise template-style content end-to-end.
echo
echo "markdown-wrapped header parsing:"

# srs-status-guard: bold **Status:** Signed-off → silent (gate open)
mkdir -p "$FIX_ROOT/md-srs-signed/docs"
cat > "$FIX_ROOT/md-srs-signed/docs/SRS.md" <<'EOF'
# [Project Name]: [Feature Title]

**Version:** 1.0
**Domain:** Spectator
**Status:** Signed-off
**Last-Updated:** 2026-05-21
**Signed-off-by:** BA
EOF
run_stdout_silent "srs-status-guard: silent on bold **Status:** Signed-off" \
    "$SRS_GUARD" '{}' "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-srs-signed"

# srs-status-guard: bold **Status:** Draft → emits reminder with parsed status
mkdir -p "$FIX_ROOT/md-srs-draft/docs"
cat > "$FIX_ROOT/md-srs-draft/docs/SRS.md" <<'EOF'
# [Project Name]: [Feature Title]

**Version:** 1.0
**Status:** Draft <!-- Draft | In-Review | Signed-off -->
**Last-Updated:** 2026-05-20
EOF
run_stdout_contains "srs-status-guard: emits parsed bold **Status:** Draft" \
    "$SRS_GUARD" '{}' "SRS Status: Draft" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-srs-draft"
run_stdout_contains "srs-status-guard: parses bold **Last-Updated:** value" \
    "$SRS_GUARD" '{}' "Last-Updated: 2026-05-20" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-srs-draft"

# session-init-summary: bold **Status:** + bold **Last-Updated:** in SRS
run_stdout_contains "session-init: reports bold **Status:** Signed-off" \
    "$SESSION_INIT" '{}' "SRS: Signed-off" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-srs-signed"
run_stdout_contains "session-init: reports bold **Last-Updated:** alongside" \
    "$SESSION_INIT" '{}' "Last-Updated: 2026-05-21" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-srs-signed"

# open-issues-triage-gate: bold - **State:** open variant
mkdir -p "$FIX_ROOT/md-oi/docs"
cat > "$FIX_ROOT/md-oi/docs/open-issues.md" <<'EOF'
# Open Issues

### ISSUE-001 — Bolded state variant
- Date: 2026-05-21T08:00:00Z
- Raised by: ba
- **State:** open

### ISSUE-002 — Unbolded state variant
- Date: 2026-05-21T08:05:00Z
- State: resolved
EOF
run_stdout_contains "oi-gate: detects bold - **State:** open" \
    "$OI_GATE" '{}' "1 open issue(s)" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-oi"
run_stdout_contains "session-init: counts bold + plain State variants" \
    "$SESSION_INIT" '{}' "1 OPEN" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-oi"

# external-integration-adequacy: SRS with bold **Status:** Signed-off should fire gate
mkdir -p "$FIX_ROOT/md-ext-block/docs/external-integrations"
cat > "$FIX_ROOT/md-ext-block/docs/external-integrations/stripe.md" <<'EOF'
# External Integration — Stripe
- **Adequacy:** inadequate
EOF
SRS_MD_SIGNED='{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"# SRS\n\n**Status:** Signed-off\n**Last-Updated:** 2026-05-21\n"}}'
run_exit "ext-adequacy: blocks bold **Status:** Signed-off when inadequate" 2 \
    "$EXT_ADEQUACY" "$SRS_MD_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-ext-block"

# external-integration-adequacy: bold **Adequacy:** adequate honored
mkdir -p "$FIX_ROOT/md-ext-allow/docs/external-integrations"
cat > "$FIX_ROOT/md-ext-allow/docs/external-integrations/passport.md" <<'EOF'
# External Integration — Account/Passport
- **Adequacy:** adequate
EOF
run_exit "ext-adequacy: allows bold **Status:** Signed-off when all adequate" 0 \
    "$EXT_ADEQUACY" "$SRS_MD_SIGNED" "CLAUDE_PROJECT_DIR=$FIX_ROOT/md-ext-allow"

# ============== Bug 6: integration-dod-validator ==============
INT_DOD_FIX="$(mktemp -d)"
INT_DOD_TP="docs/plan/phase-02-worker-core/tasks/T-100.md"

# 1. be+fe task with integration DoD → PASS
run_exit "int-dod: be+fe with integration DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track auth\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: Login round-trip verified by integration test; API contract Frozen; FE renders per handoff\n- Dependencies: T-005, T-006, T-010, T-019\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 2. be+fe task WITHOUT integration DoD → BLOCK
run_exit "int-dod: be+fe without integration DoD blocks" 2 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track auth\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: Unit tests pass; API contract Frozen; FE renders per handoff\n- Dependencies: T-005, T-006, T-010, T-019\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 3. be task with >=4 deps and integration DoD → PASS
run_exit "int-dod: >=4 deps with integration DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Worker pool\n\n- Phase: phase-02-worker-core/\n- Track: be\n- DoD: Integration test: with WORKER_CONCURRENCY=4 and 20-repo fixture; all 19 successful repos land in repository_sync_logs\n- Dependencies: T-011, T-012, T-013, T-014, T-015, T-016, T-017\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 4. be task with >=4 deps and NO integration DoD → BLOCK
run_exit "int-dod: >=4 deps without integration DoD blocks" 2 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Worker pool\n\n- Phase: phase-02-worker-core/\n- Track: be\n- DoD: All retry/error paths covered by unit tests with fetch mocking\n- Dependencies: T-011, T-012, T-013, T-014, T-015, T-016, T-017\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 5. be task with <4 deps and no integration DoD → PASS (not glue)
run_exit "int-dod: <4 deps be task without integration DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — GitLab client\n\n- Phase: phase-02-worker-core/\n- Track: be\n- DoD: All retry/error paths covered by unit tests with fetch mocking\n- Dependencies: T-002\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 6. fe task with <4 deps and no integration DoD → PASS
run_exit "int-dod: fe task without integration DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Login page\n\n- Phase: phase-04-frontend-foundation/\n- Track: fe\n- DoD: Renders per handoff; unit tests pass; accessibility audit clean\n- Dependencies: T-033\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 7. infra task with >=4 deps and integration DoD → PASS
run_exit "int-dod: infra >=4 deps with smoke DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — CI pipeline\n\n- Phase: phase-01-foundation-infra/\n- Track: infra\n- DoD: Smoke test verifies pipeline end-to-end from commit to deploy\n- Dependencies: T-001, T-002, T-003, T-004\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 8. infra task with >=4 deps and no integration DoD → BLOCK
run_exit "int-dod: infra >=4 deps without integration DoD blocks" 2 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — CI pipeline\n\n- Phase: phase-01-foundation-infra/\n- Track: infra\n- DoD: Unit tests pass; lint clean; no console errors\n- Dependencies: T-001, T-002, T-003, T-004\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 9. qa task (no deps, no integration DoD) → PASS
run_exit "int-dod: qa task without integration DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Final QA sweep\n\n- Phase: phase-06-qa-and-hardening/\n- Track: qa\n- DoD: All by-us TCs pass; coverage gap report clean\n- Dependencies: none\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 10. Write to non-task-file path → PASS
run_exit "int-dod: non-task-file path passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/SRS.md","content":"Status: Signed-off"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 11. Read tool → PASS
run_exit "int-dod: Read tool passes" 0 \
    "$INT_DOD" '{"tool_name":"Read","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 12. Empty stdin → PASS
run_exit "int-dod: empty stdin passes" 0 "$INT_DOD" '' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 13. Malformed JSON → PASS (fail open)
run_exit "int-dod: malformed JSON passes (fail open)" 0 "$INT_DOD" 'not-json' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 14. be+fe task with bold **Track:** → BLOCK (bold variant)
run_exit "int-dod: bold **Track:** be+fe without integration DoD blocks" 2 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track feature\n\n- Phase: phase-02-worker-core/\n- **Track:** be+fe\n- **DoD:** Unit tests pass; API contract Frozen; FE renders per handoff\n- Dependencies: T-005, T-006\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 15. Multi-line DoD with integration on continuation line → PASS
run_exit "int-dod: multi-line DoD with integration on continuation passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Worker pool\n\n- Phase: phase-02-worker-core/\n- Track: be\n- DoD: A WorkerPool module implements FR-006.\n  (1) Per-repo error isolation.\n  (2) Integration test: 4 concurrent repos verified end-to-end.\n- Dependencies: T-011, T-012, T-013, T-014\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 16. Task with no DoD field → PASS (fail open)
run_exit "int-dod: no DoD field passes (fail open)" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Minimal task\n\n- Phase: phase-02-worker-core/\n- Track: be\n- Dependencies: T-002, T-005, T-006, T-010\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 17. be+fe with "e2e" in DoD → PASS (e2e pattern)
run_exit "int-dod: be+fe with e2e in DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track auth\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: e2e login round-trip verified; contract Frozen\n- Dependencies: T-005, T-006\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 18. be+fe with "smoke" in DoD → PASS (smoke pattern)
run_exit "int-dod: be+fe with smoke in DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track auth\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: Smoke test verifies full auth flow end-to-end\n- Dependencies: T-005, T-006\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 19. >=4 deps with "cross-component" → PASS
run_exit "int-dod: >=4 deps with cross-component in DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Worker pipeline\n\n- Phase: phase-02-worker-core/\n- Track: be\n- DoD: Cross-component verification: worker pipeline runs from env to migrations to scoring\n- Dependencies: T-002, T-005, T-006, T-010\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 20. >=4 deps with "contract verified" → PASS
run_exit "int-dod: >=4 deps with contract verified in DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — API backend\n\n- Phase: phase-03-api-ui-backend/\n- Track: be\n- DoD: API contract verified against FE consumption; unit tests pass\n- Dependencies: T-021, T-022, T-023, T-024\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 21. be+fe with "end-to-end" → PASS
run_exit "int-dod: be+fe with end-to-end in DoD passes" 0 \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Cross-track feature\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: End-to-end verification: login + render round-trip complete\n- Dependencies: T-005, T-006\n"}}' "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# 22. be+fe with only "unit tests" in DoD → BLOCK (stderr mentions integration patterns)
run_stderr_contains "int-dod: be+fe block stderr mentions integration patterns" \
    "$INT_DOD" '{"tool_name":"Write","tool_input":{"file_path":"docs/plan/phase-02-worker-core/tasks/T-100.md","content":"# T-100 — Feature\n\n- Phase: phase-02-worker-core/\n- Track: be+fe\n- DoD: Unit tests pass; lint clean\n- Dependencies: T-005, T-006\n"}}' "integration" "CLAUDE_PROJECT_DIR=$INT_DOD_FIX"

# ---------------- docker-scope-guard.cjs ----------------
echo
echo "docker-scope-guard.cjs:"

PSLUG="CLAUDE_PROJECT_SLUG=stats-overflow"

db() {
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"
}

# Allow cases
run_exit "allows docker ps (read)" 0 "$DOCKER_GUARD" "$(db 'docker ps')" "$PSLUG"
run_exit "allows docker inspect arbitrary container (read)" 0 "$DOCKER_GUARD" "$(db 'docker inspect some-other-redis')" "$PSLUG"
run_exit "allows docker logs arbitrary container (read)" 0 "$DOCKER_GUARD" "$(db 'docker logs my-mate-postgres')" "$PSLUG"
run_exit "allows docker network ls (read)" 0 "$DOCKER_GUARD" "$(db 'docker network ls')" "$PSLUG"
run_exit "allows docker volume inspect (read)" 0 "$DOCKER_GUARD" "$(db 'docker volume inspect somevol')" "$PSLUG"
run_exit "allows compose up with -p slug" 0 "$DOCKER_GUARD" "$(db 'docker compose -p stats-overflow up -d')" "$PSLUG"
run_exit "allows compose down with -p slug" 0 "$DOCKER_GUARD" "$(db 'docker compose -p stats-overflow down')" "$PSLUG"
run_exit "allows docker stop of scoped container" 0 "$DOCKER_GUARD" "$(db 'docker stop stats-overflow-api-1')" "$PSLUG"
run_exit "allows docker rm of scoped container" 0 "$DOCKER_GUARD" "$(db 'docker rm stats-overflow-db-1')" "$PSLUG"
run_exit "allows non-docker command" 0 "$DOCKER_GUARD" "$(db 'ls -la')" "$PSLUG"
run_exit "allows docker build (local image cache only)" 0 "$DOCKER_GUARD" "$(db 'docker build -t foo .')" "$PSLUG"

# Block cases
run_exit "blocks docker system prune" 2 "$DOCKER_GUARD" "$(db 'docker system prune -f')" "$PSLUG"
run_exit "blocks docker volume prune" 2 "$DOCKER_GUARD" "$(db 'docker volume prune -f')" "$PSLUG"
run_exit "blocks docker network prune" 2 "$DOCKER_GUARD" "$(db 'docker network prune -f')" "$PSLUG"
run_exit "blocks docker container prune" 2 "$DOCKER_GUARD" "$(db 'docker container prune')" "$PSLUG"
run_exit "blocks docker image prune" 2 "$DOCKER_GUARD" "$(db 'docker image prune -a')" "$PSLUG"
run_exit "blocks docker rm -f \\$(docker ps -q)" 2 "$DOCKER_GUARD" "$(db 'docker rm -f $(docker ps -q)')" "$PSLUG"
run_exit "blocks docker stop \\$(docker ps -q)" 2 "$DOCKER_GUARD" "$(db 'docker stop $(docker ps -q)')" "$PSLUG"
run_exit "blocks compose down on other project" 2 "$DOCKER_GUARD" "$(db 'docker compose -p somebody-elses-thing down')" "$PSLUG"
run_exit "blocks compose down without -p" 2 "$DOCKER_GUARD" "$(db 'docker compose down')" "$PSLUG"
run_exit "blocks compose up without -p" 2 "$DOCKER_GUARD" "$(db 'docker compose up -d')" "$PSLUG"
run_exit "blocks docker stop of unscoped container" 2 "$DOCKER_GUARD" "$(db 'docker stop my-personal-postgres')" "$PSLUG"
run_exit "blocks docker rm of unscoped container" 2 "$DOCKER_GUARD" "$(db 'docker rm someone-else-redis-1')" "$PSLUG"
run_exit "blocks docker volume rm unscoped" 2 "$DOCKER_GUARD" "$(db 'docker volume rm someones-data')" "$PSLUG"

# Escape hatch
run_exit "allows when CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1" 0 "$DOCKER_GUARD" "$(db 'docker system prune -f')" "CLAUDE_SKIP_DOCKER_SCOPE_CHECK=1"

# Non-trigger
run_exit "ignores non-Bash tool (docker-guard)" 0 "$DOCKER_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"x","content":""}}' "$PSLUG"
run_exit "ignores empty stdin (docker-guard)" 0 "$DOCKER_GUARD" ''
run_exit "ignores malformed JSON (docker-guard)" 0 "$DOCKER_GUARD" 'not json'

# ---------------- source-code-write-guard.cjs ----------------
echo
echo "source-code-write-guard.cjs:"

# New semantics (block-by-default, inverted from kit v0.2 first draft):
#   - Default (no env): source-code paths → BLOCK; everything else → ALLOW
#   - Path inside .worktrees/<*>/ (sub-agent context) → ALLOW
#   - CLAUDE_ALLOW_ORCHESTRATOR_CODE=1 (escape hatch) → ALLOW with warning
# The legacy CLAUDE_ORCHESTRATOR=1 env var has no effect on this hook; it's
# preserved only for master-plan-write-guard + plan-consistency-validator
# (different vouched-writer semantics).

w() {
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$1"
}
e() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"a","new_string":"b"}}' "$1"
}

# === Block cases (Orchestrator context = default, no env, main-repo source paths) ===
run_exit "blocks Write to src/ TS file (default)"           2 "$SRC_GUARD" "$(w 'src/api/handler.ts')"
run_exit "blocks Edit to src/ TS file (default)"            2 "$SRC_GUARD" "$(e 'src/api/handler.ts')"
run_exit "blocks Write to nested */src/ path"               2 "$SRC_GUARD" "$(w 'server/src/routes/auth.ts')"
run_exit "blocks Write to packages/*/src/ path"             2 "$SRC_GUARD" "$(w 'packages/lib/src/index.ts')"
run_exit "blocks Write to Python src/ file"                 2 "$SRC_GUARD" "$(w 'src/workers/sync.py')"
run_exit "blocks Write to Go src/ file"                     2 "$SRC_GUARD" "$(w 'src/main.go')"
run_exit "blocks Write to Java src/ file"                   2 "$SRC_GUARD" "$(w 'app/src/main/java/com/example/App.java')"
run_exit "blocks Write to React component"                  2 "$SRC_GUARD" "$(w 'web/src/components/Button.tsx')"
run_exit "blocks Write to e2e spec"                         2 "$SRC_GUARD" "$(w 'e2e/spectator-join.spec.ts')"
run_exit "blocks Write to Rust src/ file"                   2 "$SRC_GUARD" "$(w 'crates/api/src/lib.rs')"
run_exit "blocks absolute main-repo path"                   2 "$SRC_GUARD" "$(w '/Users/viet/repo/src/api/handler.ts')"

# === Allow cases (non-source paths anywhere) ===
run_exit "allows Write to docs/"                            0 "$SRC_GUARD" "$(w 'docs/SRS.md')"
run_exit "allows Write to docs/plan/"                       0 "$SRC_GUARD" "$(w 'docs/plan/master-plan.md')"
run_exit "allows Write to .claude/"                         0 "$SRC_GUARD" "$(w '.claude/agents/ba.md')"
run_exit "allows Write to node_modules/"                    0 "$SRC_GUARD" "$(w 'node_modules/foo/src/index.ts')"
run_exit "allows Write to dist/"                            0 "$SRC_GUARD" "$(w 'dist/bundle.js')"
run_exit "allows Write to build/"                           0 "$SRC_GUARD" "$(w 'build/main.go')"
run_exit "allows Write to migration SQL"                    0 "$SRC_GUARD" "$(w 'db/migrations/001-init.sql')"
run_exit "allows Write to root config JSON"                 0 "$SRC_GUARD" "$(w 'package.json')"
run_exit "allows Write to src/ non-code (JSON)"             0 "$SRC_GUARD" "$(w 'src/config/defaults.json')"

# === Sub-agent context — paths inside .worktrees/<role>-<task-id>/ ===
run_exit "allows sub-agent Write to .worktrees/ backend src" 0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-001/backend/src/api/handler.ts')"
run_exit "allows sub-agent Edit to .worktrees/ e2e spec"    0 "$SRC_GUARD" "$(e '.worktrees/fe-dev-T-002/e2e/foo.spec.ts')"
run_exit "allows sub-agent Write to .worktrees/ Java file"  0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-003/backend/src/main/java/A.java')"
run_exit "allows sub-agent Write to .worktrees/ nested src" 0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-004/backend/service/src/routes/auth.ts')"
run_exit "allows absolute worktree path"                    0 "$SRC_GUARD" "$(w '/Users/viet/repo/.worktrees/be-dev-T-001/backend/src/api/handler.ts')"

# === Escape hatch ===
run_exit "allows when CLAUDE_ALLOW_ORCHESTRATOR_CODE=1"     0 "$SRC_GUARD" "$(w 'src/api/handler.ts')" "CLAUDE_ALLOW_ORCHESTRATOR_CODE=1"
run_exit "escape hatch overrides everything"                0 "$SRC_GUARD" "$(w 'src/main.go')" "CLAUDE_ALLOW_ORCHESTRATOR_CODE=1"

# === Custom dirs via env ===
run_exit "blocks Write to custom dir worker/"               2 "$SRC_GUARD" "$(w 'worker/lib/main.ts')" "CLAUDE_SOURCE_CODE_DIRS=worker/lib"
run_exit "allows non-source ext under custom dir"           0 "$SRC_GUARD" "$(w 'worker/lib/config.json')" "CLAUDE_SOURCE_CODE_DIRS=worker/lib"
run_exit "allows custom dir inside worktree"                0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-001/worker/lib/main.ts')" "CLAUDE_SOURCE_CODE_DIRS=worker/lib"

# === Legacy env var has no effect on this hook ===
run_exit "CLAUDE_ORCHESTRATOR=1 does NOT enable bypass"     2 "$SRC_GUARD" "$(w 'src/api/handler.ts')" ""
run_exit "CLAUDE_ORCHESTRATOR not-set still blocks src/"    2 "$SRC_GUARD" "$(w 'src/api/handler.ts')"

# === Non-trigger cases ===
run_exit "ignores non-Write/Edit tool"                      0 "$SRC_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"src/api/handler.ts"}}'
run_exit "ignores non-Write tool (Bash)"                    0 "$SRC_GUARD" '{"tool_name":"Bash","tool_input":{"command":"echo > src/foo.ts"}}'
run_exit "ignores empty stdin (src-guard)"                  0 "$SRC_GUARD" ''
run_exit "ignores malformed JSON (src-guard)"               0 "$SRC_GUARD" 'not json'

# === Worktree well-formedness (tightened) ===
run_exit "blocks worktree traversal escape to root src"     2 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-001/../../src/x.ts')"
run_exit "blocks traversal escape (abs worktree)"           2 "$SRC_GUARD" "$(w '/repo/.worktrees/be-dev-T-001/../../../src/x.ts')"
run_exit "allows deep well-formed worktree src write"       0 "$SRC_GUARD" "$(w '.worktrees/fe-dev-T-009/frontend/web/src/pages/Home.tsx')"

# === Source-layout enforcement (frontend/ + backend/ roots; SRS §3.4.5) ===
run_exit "layout: allows frontend/ single-app root"        0 "$SRC_GUARD" "$(w '.worktrees/fe-dev-T-1/frontend/src/App.tsx')"
run_exit "layout: allows backend/ single-service root"     0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-1/backend/src/main.go')"
run_exit "layout: allows frontend/<app>/ multi-app"        0 "$SRC_GUARD" "$(w '.worktrees/fe-dev-T-1/frontend/admin/src/App.tsx')"
run_exit "layout: blocks legacy web/src in worktree"       2 "$SRC_GUARD" "$(w '.worktrees/fe-dev-T-1/web/src/App.tsx')"
run_exit "layout: blocks legacy server/src in worktree"    2 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-1/server/src/x.ts')"
run_exit "layout: blocks repo-root src/ in worktree"       2 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-1/src/index.ts')"
run_exit "layout: allows e2e spec (test, exempt)"          0 "$SRC_GUARD" "$(e '.worktrees/qa-exec-T-1/e2e/specs/a.spec.ts')"
run_exit "layout: allows sql config under backend/"        0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-1/backend/migrations/001.sql')"
run_exit "layout: skip-check allows non-root src"          0 "$SRC_GUARD" "$(w '.worktrees/fe-dev-T-1/web/src/App.tsx')" "CLAUDE_SKIP_SOURCE_LAYOUT_CHECK=1"
run_exit "layout: env-declared extra root allowed"         0 "$SRC_GUARD" "$(w '.worktrees/be-dev-T-1/packages/lib/src/i.ts')" "CLAUDE_SOURCE_CODE_DIRS=packages"

# ---------------- orchestrator-write-guard.cjs ----------------
echo
echo "orchestrator-write-guard.cjs:"

# Helpers reuse w() / e() defined above for source-code-write-guard.

# === Allow-list: Orchestrator-legitimate writes (default, no env) ===
run_exit "orch-write: allows docs/plan/master-plan.md"        0 "$ORCH_WRITE_GUARD" "$(w 'docs/plan/master-plan.md')"
run_exit "orch-write: allows docs/plan/phase-01/phase.md"     0 "$ORCH_WRITE_GUARD" "$(w 'docs/plan/phase-01-foundation/phase.md')"
run_exit "orch-write: allows docs/plan/.../tasks/T-001.md"    0 "$ORCH_WRITE_GUARD" "$(w 'docs/plan/phase-01-foundation/tasks/T-001.md')"
run_exit "orch-write: allows docs/open-issues.md"             0 "$ORCH_WRITE_GUARD" "$(w 'docs/open-issues.md')"
run_exit "orch-write: allows docs/iteration-plan/v3.md"       0 "$ORCH_WRITE_GUARD" "$(w 'docs/iteration-plan/v3.md')"
run_exit "orch-write: allows .claude/agents/ba.md"            0 "$ORCH_WRITE_GUARD" "$(w '.claude/agents/ba.md')"
run_exit "orch-write: allows .claude/rules/foo.md"            0 "$ORCH_WRITE_GUARD" "$(w '.claude/rules/foo.md')"
run_exit "orch-write: allows .claude/hooks/bar.cjs"           0 "$ORCH_WRITE_GUARD" "$(w '.claude/hooks/bar.cjs')"
run_exit "orch-write: allows CLAUDE.md"                       0 "$ORCH_WRITE_GUARD" "$(w 'CLAUDE.md')"
run_exit "orch-write: allows RELEASE-NOTES.md"                0 "$ORCH_WRITE_GUARD" "$(w 'RELEASE-NOTES.md')"
run_exit "orch-write: allows RELEASE-NOTES-v0.3.md"           0 "$ORCH_WRITE_GUARD" "$(w 'RELEASE-NOTES-v0.3.md')"
run_exit "orch-write: allows .gitignore"                      0 "$ORCH_WRITE_GUARD" "$(w '.gitignore')"
run_exit "orch-write: allows absolute docs/plan/ path"        0 "$ORCH_WRITE_GUARD" "$(w '/Users/viet/repo/docs/plan/master-plan.md')"
run_exit "orch-write: allows absolute .claude/ path"          0 "$ORCH_WRITE_GUARD" "$(w '/Users/viet/repo/.claude/agents/ba.md')"

# === Block: role-owned docs/ artifacts (Orchestrator overreach) ===
run_exit "orch-write: allows docs/SRS.md (BA-owned)"           0 "$ORCH_WRITE_GUARD" "$(w 'docs/SRS.md')"
run_exit "orch-write: allows docs/user-stories/US-001.md (BA-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/user-stories/US-001.md')"
run_exit "orch-write: allows docs/frs/FR-001.md (BA-owned)"         0 "$ORCH_WRITE_GUARD" "$(w 'docs/frs/FR-001.md')"
run_exit "orch-write: allows docs/architecture.md (SA-owned)"       0 "$ORCH_WRITE_GUARD" "$(w 'docs/architecture.md')"
run_exit "orch-write: allows docs/decisions/ADR-0001.md (SA-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/decisions/ADR-0001.md')"
run_exit "orch-write: allows docs/api-contracts/auth.md (BE Dev-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/api-contracts/auth-login.md')"
run_exit "orch-write: allows docs/test-cases/by-us/... (QA-Author-owned)"      0 "$ORCH_WRITE_GUARD" "$(w 'docs/test-cases/by-us/US-001/functional.md')"
run_exit "orch-write: allows docs/qa-reports/T-001.md (QA-Exec-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/qa-reports/T-001.md')"
run_exit "orch-write: allows docs/deploy-reports/T-001.md (DevOps-owned)"    0 "$ORCH_WRITE_GUARD" "$(w 'docs/deploy-reports/T-001.md')"
run_exit "orch-write: allows docs/uiux/handoffs/T-001.md (Designer-owned)"     0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/handoffs/T-001.md')"
run_exit "orch-write: allows docs/instrumentation-contract.md (SA-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/instrumentation-contract.md')"
run_exit "orch-write: allows docs/external-integrations/foo.md (BA+SA-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/external-integrations/account-passport.md')"
run_exit "orch-write: allows docs/research-reports/foo.md (Researcher-owned)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/research-reports/event-loop.md')"
run_exit "orch-write: allows docs/debug-reports/foo.md (Debugger-owned)"  0 "$ORCH_WRITE_GUARD" "$(w 'docs/debug-reports/api-500.md')"
run_exit "orch-write: allows docs/code-reviews/foo.md (Code Reviewer-owned)"   0 "$ORCH_WRITE_GUARD" "$(w 'docs/code-reviews/T-001.md')"

# === Block: project root files (DevOps / Dev territory) ===
run_exit "orch-write: allows package.json (BE/FE Dev-owned project-root-config)"            0 "$ORCH_WRITE_GUARD" "$(w 'package.json')"
run_exit "orch-write: allows Dockerfile (DevOps-owned project-root-config)"             0 "$ORCH_WRITE_GUARD" "$(w 'Dockerfile')"
run_exit "orch-write: allows docker-compose.yml (DevOps-owned)"     0 "$ORCH_WRITE_GUARD" "$(w 'docker-compose.yml')"
run_exit "orch-write: blocks .env"                            2 "$ORCH_WRITE_GUARD" "$(w '.env')"
run_exit "orch-write: allows tsconfig.json (FE/BE Dev-owned)"                   0 "$ORCH_WRITE_GUARD" "$(w 'tsconfig.json')"
run_exit "orch-write: allows Cargo.toml (BE Dev-owned)"                      0 "$ORCH_WRITE_GUARD" "$(w 'Cargo.toml')"

# === Sub-agent context (path inside .worktrees/) — always allow ===
run_exit "orch-write: allows .worktrees/ba-T-001/docs/SRS.md"      0 "$ORCH_WRITE_GUARD" "$(w '.worktrees/ba-T-001/docs/SRS.md')"
run_exit "orch-write: allows .worktrees/sa-T-002/docs/architecture.md" 0 "$ORCH_WRITE_GUARD" "$(w '.worktrees/sa-T-002/docs/architecture.md')"
run_exit "orch-write: allows .worktrees/be-dev-T-003/package.json" 0 "$ORCH_WRITE_GUARD" "$(w '.worktrees/be-dev-T-003/package.json')"
run_exit "orch-write: allows .worktrees/devops-T-004/Dockerfile"   0 "$ORCH_WRITE_GUARD" "$(w '.worktrees/devops-T-004/Dockerfile')"

# === Escape hatch ===
run_exit "orch-write: escape hatch allows docs/SRS.md write"  0 "$ORCH_WRITE_GUARD" "$(w 'docs/SRS.md')" "CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1"
run_exit "orch-write: escape hatch allows package.json"       0 "$ORCH_WRITE_GUARD" "$(w 'package.json')" "CLAUDE_ALLOW_ORCHESTRATOR_WRITE=1"

# === Logical-ownership-first model (v0.3.2) — role-owned docs allow from any cwd ===
# These verify the fix to the cwd-detection problem (sub-agents now write directly
# to their owned paths without physical worktree isolation).
run_exit "orch-write: allows docs/uiux/refs/T-168.md (FE Dev-owned)"           0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/refs/T-168.md')"
run_exit "orch-write: allows docs/uiux/visual-specs/T-168.md (QA-Author)"      0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/visual-specs/T-168.md')"
run_exit "orch-write: allows docs/uiux/completeness-reports/T-168.md (BA)"     0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/completeness-reports/T-168.md')"
run_exit "orch-write: allows docs/uiux/post-implementation-reports/T-168.md"   0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/post-implementation-reports/T-168.md')"
run_exit "orch-write: allows docs/uiux/figma-mappings/v29.md (Designer)"       0 "$ORCH_WRITE_GUARD" "$(w 'docs/uiux/figma-mappings/v29.md')"
run_exit "orch-write: allows docs/test-cases/by-task/T-168/api.md"             0 "$ORCH_WRITE_GUARD" "$(w 'docs/test-cases/by-task/T-168/api.md')"
run_exit "orch-write: allows docs/srs-diffs/v29-to-v30.md (BA iteration)"      0 "$ORCH_WRITE_GUARD" "$(w 'docs/srs-diffs/v29-to-v30.md')"
run_exit "orch-write: allows docs/brownfield-confirmation/auth.md (BA Mode E)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/brownfield-confirmation/auth.md')"
run_exit "orch-write: allows docs/oq-resolutions/OQ-005.md (OQ Resolver)"      0 "$ORCH_WRITE_GUARD" "$(w 'docs/oq-resolutions/OQ-005.md')"
run_exit "orch-write: allows docs/archaeology-reports/auth.md (Archaeologist)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/archaeology-reports/auth.md')"

# srs-validator additions (v0.3.3 — two-step sign-off + conversational additions)
run_exit "orch-write: allows docs/srs-validation-reports/v1.0.md (srs-source-validator, first gate)"   0 "$ORCH_WRITE_GUARD" "$(w 'docs/srs-validation-reports/v1.0.md')"
run_exit "orch-write: allows docs/srs-feasibility-reports/v1.0.md (srs-feasibility-validator, second gate)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/srs-feasibility-reports/v1.0.md')"
run_exit "orch-write: allows docs/requirements/conversational-additions/X.md (BA)"  0 "$ORCH_WRITE_GUARD" "$(w 'docs/requirements/conversational-additions/2026-06-04-add-batch-rbac.md')"
run_exit "orch-write: allows docs/requirements/design-extracted/X.md (UI/UX Designer extract)" 0 "$ORCH_WRITE_GUARD" "$(w 'docs/requirements/design-extracted/abc123-2026-06-04.md')"
run_exit "orch-write: allows docs/requirements/initial-prd.md (upstream-input)"     0 "$ORCH_WRITE_GUARD" "$(w 'docs/requirements/initial-prd.md')"

# === Orchestrator-only paths still allowed only by Orchestrator (existing semantic) ===
run_exit "orch-write: allows docs/plan/master-plan.md (Orchestrator)"          0 "$ORCH_WRITE_GUARD" "$(w 'docs/plan/master-plan.md')"
run_exit "orch-write: allows docs/iteration-plan/v30.md (Orchestrator)"        0 "$ORCH_WRITE_GUARD" "$(w 'docs/iteration-plan/v30.md')"
run_exit "orch-write: allows docs/open-issues.md (shared)"                     0 "$ORCH_WRITE_GUARD" "$(w 'docs/open-issues.md')"

# === Unknown-doc paths under docs/ still BLOCK (force operator classification) ===
run_exit "orch-write: blocks docs/randomthing.md (unknown-doc)"                2 "$ORCH_WRITE_GUARD" "$(w 'docs/randomthing.md')"
run_exit "orch-write: blocks docs/subdir/foo.md (unknown-doc)"                 2 "$ORCH_WRITE_GUARD" "$(w 'docs/subdir/foo.md')"

# === Unknown paths anywhere still BLOCK ===
run_exit "orch-write: blocks root-level random.txt"                            2 "$ORCH_WRITE_GUARD" "$(w 'random.txt')"
run_exit "orch-write: blocks scripts/migrate.sh (no role ownership declared)"  2 "$ORCH_WRITE_GUARD" "$(w 'scripts/migrate.sh')"

# === Operator-only (.env family) always blocks even from main cwd ===
run_exit "orch-write: blocks .env.local"                                       2 "$ORCH_WRITE_GUARD" "$(w '.env.local')"
run_exit "orch-write: blocks .env.production"                                  2 "$ORCH_WRITE_GUARD" "$(w '.env.production')"

# === Non-trigger ===
run_exit "orch-write: ignores Read tool"                      0 "$ORCH_WRITE_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"docs/SRS.md"}}'
run_exit "orch-write: ignores Bash tool"                      0 "$ORCH_WRITE_GUARD" '{"tool_name":"Bash","tool_input":{"command":"echo > docs/SRS.md"}}'
run_exit "orch-write: ignores empty stdin"                    0 "$ORCH_WRITE_GUARD" ''
run_exit "orch-write: ignores malformed JSON"                 0 "$ORCH_WRITE_GUARD" 'not json'

# ---------------- orchestrator-bash-guard.cjs ----------------
echo
echo "orchestrator-bash-guard.cjs:"

# Helper: build Bash event with cwd field.
bc() {
  # bc <command> [cwd]
  local cmd="$1"
  local cwd="${2:-/repo}"
  printf '{"tool_name":"Bash","tool_input":{"command":%s},"cwd":"%s"}' "$(printf '%s' "$cmd" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')" "$cwd"
}

# === Read-only / inspection — allow (cwd = main repo) ===
run_exit "orch-bash: allows ls"                  0 "$ORCH_BASH_GUARD" "$(bc 'ls -la docs/')"
run_exit "orch-bash: allows grep"                0 "$ORCH_BASH_GUARD" "$(bc 'grep -r foo docs/')"
run_exit "orch-bash: allows find"                0 "$ORCH_BASH_GUARD" "$(bc 'find . -name *.md')"
run_exit "orch-bash: allows cat"                 0 "$ORCH_BASH_GUARD" "$(bc 'cat docs/SRS.md')"
run_exit "orch-bash: allows git status"          0 "$ORCH_BASH_GUARD" "$(bc 'git status -s')"
run_exit "orch-bash: allows git log"             0 "$ORCH_BASH_GUARD" "$(bc 'git log --oneline -10')"
run_exit "orch-bash: allows git diff"            0 "$ORCH_BASH_GUARD" "$(bc 'git diff HEAD')"
run_exit "orch-bash: allows git commit"          0 "$ORCH_BASH_GUARD" "$(bc 'git commit -m feat:plan-update')"
run_exit "orch-bash: allows git add"             0 "$ORCH_BASH_GUARD" "$(bc 'git add docs/plan/')"
run_exit "orch-bash: allows git init"            0 "$ORCH_BASH_GUARD" "$(bc 'git init --initial-branch=main')"
run_exit "orch-bash: allows git worktree add"    0 "$ORCH_BASH_GUARD" "$(bc 'git worktree add .worktrees/be-dev-T-001 main')"
run_exit "orch-bash: allows docker ps"           0 "$ORCH_BASH_GUARD" "$(bc 'docker ps -a')"
run_exit "orch-bash: allows docker inspect"      0 "$ORCH_BASH_GUARD" "$(bc 'docker inspect statoverflow-api-1')"
run_exit "orch-bash: allows docker logs"         0 "$ORCH_BASH_GUARD" "$(bc 'docker logs statoverflow-api-1')"
run_exit "orch-bash: allows node -c (syntax)"    0 "$ORCH_BASH_GUARD" "$(bc 'node -c .claude/hooks/foo.cjs')"

# === Mutating — block (cwd = main repo) ===
run_exit "orch-bash: blocks npm install"          2 "$ORCH_BASH_GUARD" "$(bc 'npm install lodash')"
run_exit "orch-bash: blocks pip install"          2 "$ORCH_BASH_GUARD" "$(bc 'pip install requests')"
run_exit "orch-bash: blocks pnpm add"             2 "$ORCH_BASH_GUARD" "$(bc 'pnpm add react')"
run_exit "orch-bash: blocks cargo add"            2 "$ORCH_BASH_GUARD" "$(bc 'cargo add tokio')"
run_exit "orch-bash: blocks docker compose up"    2 "$ORCH_BASH_GUARD" "$(bc 'docker compose up -d --wait')"
run_exit "orch-bash: blocks docker compose down"  2 "$ORCH_BASH_GUARD" "$(bc 'docker compose down -v')"
run_exit "orch-bash: blocks docker run"           2 "$ORCH_BASH_GUARD" "$(bc 'docker run -d nginx')"
run_exit "orch-bash: blocks docker exec"          2 "$ORCH_BASH_GUARD" "$(bc 'docker exec foo bash')"
run_exit "orch-bash: blocks docker build"         2 "$ORCH_BASH_GUARD" "$(bc 'docker build -t myimg .')"
run_exit "orch-bash: blocks kubectl apply"        2 "$ORCH_BASH_GUARD" "$(bc 'kubectl apply -f deploy.yaml')"
PSQL_INSERT_PAYLOAD=$(python3 -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"psql -c \"INSERT INTO users VALUES (1)\""},"cwd":"/repo"}))')
run_exit "orch-bash: blocks psql INSERT"          2 "$ORCH_BASH_GUARD" "$PSQL_INSERT_PAYLOAD"
run_exit "orch-bash: blocks psql -f script"       2 "$ORCH_BASH_GUARD" "$(bc 'psql -f migrate.sql')"
run_exit "orch-bash: blocks redis SET"            2 "$ORCH_BASH_GUARD" "$(bc 'redis-cli SET foo bar')"
run_exit "orch-bash: blocks curl -X POST"         2 "$ORCH_BASH_GUARD" "$(bc 'curl -X POST http://localhost:3000/api/u')"
run_exit "orch-bash: blocks curl --data"          2 "$ORCH_BASH_GUARD" "$(bc 'curl --data name=foo http://localhost:3000/api')"
run_exit "orch-bash: blocks wget --post-data"     2 "$ORCH_BASH_GUARD" "$(bc 'wget --post-data=x http://localhost:3000')"
run_exit "orch-bash: blocks rm -rf"               2 "$ORCH_BASH_GUARD" "$(bc 'rm -rf docs/old/')"
run_exit "orch-bash: blocks rm -f"                2 "$ORCH_BASH_GUARD" "$(bc 'rm -f docs/old.md')"
run_exit "orch-bash: blocks mv"                   2 "$ORCH_BASH_GUARD" "$(bc 'mv docs/old.md docs/new.md')"
run_exit "orch-bash: blocks sed -i"               2 "$ORCH_BASH_GUARD" "$(bc 'sed -i s/foo/bar/g src/api/handler.ts')"
run_exit "orch-bash: blocks perl -i"              2 "$ORCH_BASH_GUARD" "$(bc 'perl -i.bak -pe s/foo/bar/ src/foo.ts')"
run_exit "orch-bash: blocks redirect to src"      2 "$ORCH_BASH_GUARD" "$(bc 'echo \"export default function\" > src/foo.ts')"
run_exit "orch-bash: blocks redirect to docs/SRS" 2 "$ORCH_BASH_GUARD" "$(bc 'echo \"# SRS\" > docs/SRS.md')"
run_exit "orch-bash: blocks redirect to .env"     2 "$ORCH_BASH_GUARD" "$(bc 'echo KEY=val > .env')"
run_exit "orch-bash: blocks tee to package.json"  2 "$ORCH_BASH_GUARD" "$(bc 'cat config | tee package.json')"
run_exit "orch-bash: blocks git push"             2 "$ORCH_BASH_GUARD" "$(bc 'git push origin main')"
run_exit "orch-bash: blocks git reset --hard"     2 "$ORCH_BASH_GUARD" "$(bc 'git reset --hard HEAD~1')"
run_exit "orch-bash: blocks git rebase -i"        2 "$ORCH_BASH_GUARD" "$(bc 'git rebase -i HEAD~3')"
run_exit "orch-bash: blocks git checkout --"      2 "$ORCH_BASH_GUARD" "$(bc 'git checkout -- src/foo.ts')"
run_exit "orch-bash: blocks git clean -fd"        2 "$ORCH_BASH_GUARD" "$(bc 'git clean -fd')"
run_exit "orch-bash: blocks chmod"                2 "$ORCH_BASH_GUARD" "$(bc 'chmod +x deploy.sh')"
run_exit "orch-bash: blocks chown"                2 "$ORCH_BASH_GUARD" "$(bc 'chown viet:viet docs/')"
run_exit "orch-bash: blocks npm run build"        2 "$ORCH_BASH_GUARD" "$(bc 'npm run build')"
run_exit "orch-bash: blocks cargo build"          2 "$ORCH_BASH_GUARD" "$(bc 'cargo build --release')"
run_exit "orch-bash: blocks go build"             2 "$ORCH_BASH_GUARD" "$(bc 'go build ./...')"
run_exit "orch-bash: blocks make"                 2 "$ORCH_BASH_GUARD" "$(bc 'make all')"
run_exit "orch-bash: blocks systemctl restart"    2 "$ORCH_BASH_GUARD" "$(bc 'systemctl restart nginx')"
run_exit "orch-bash: blocks docker system prune"  2 "$ORCH_BASH_GUARD" "$(bc 'docker system prune -af')"

# === Sub-agent context (cwd inside .worktrees/) — all allow ===
run_exit "orch-bash: sub-agent allows npm install"     0 "$ORCH_BASH_GUARD" "$(bc 'npm install lodash' '/repo/.worktrees/be-dev-T-001')"
run_exit "orch-bash: sub-agent allows docker compose"  0 "$ORCH_BASH_GUARD" "$(bc 'docker compose up -d' '/repo/.worktrees/devops-T-002')"
run_exit "orch-bash: sub-agent allows sed -i"          0 "$ORCH_BASH_GUARD" "$(bc 'sed -i s/foo/bar/ src/foo.ts' '/repo/.worktrees/be-dev-T-003')"
run_exit "orch-bash: sub-agent allows git push"        0 "$ORCH_BASH_GUARD" "$(bc 'git push origin feature' '/repo/.worktrees/be-dev-T-004')"
run_exit "orch-bash: sub-agent allows redirect to src" 0 "$ORCH_BASH_GUARD" "$(bc 'echo x > src/foo.ts' '/repo/.worktrees/be-dev-T-001')"
run_exit "orch-bash: deep nested worktree path"        0 "$ORCH_BASH_GUARD" "$(bc 'npm install' '/repo/.worktrees/be-dev-T-001/server')"

# === Command-scoped worktree (cwd = root) — allow ===
run_exit "orch-bash: cd worktree && build allowed"     0 "$ORCH_BASH_GUARD" "$(bc 'cd .worktrees/fe-dev-T-042 && npm run build')"
run_exit "orch-bash: cd abs worktree && install"       0 "$ORCH_BASH_GUARD" "$(bc 'cd /repo/.worktrees/be-dev-T-001/server && npm install')"
run_exit "orch-bash: git -C worktree push allowed"     0 "$ORCH_BASH_GUARD" "$(bc 'git -C .worktrees/be-dev-T-001 push origin feat')"
run_exit "orch-bash: make -C worktree allowed"         0 "$ORCH_BASH_GUARD" "$(bc 'make -C .worktrees/be-dev-T-001 build')"
run_exit "orch-bash: --prefix worktree allowed"        0 "$ORCH_BASH_GUARD" "$(bc 'npm --prefix .worktrees/fe-dev-T-001 run build')"
run_exit "orch-bash: pushd worktree allowed"           0 "$ORCH_BASH_GUARD" "$(bc 'pushd .worktrees/be-dev-T-001 && cargo build')"

# === Non-worktree scope must still block (cwd = root) ===
run_exit "orch-bash: cd src && build still blocked"    2 "$ORCH_BASH_GUARD" "$(bc 'cd src && npm run build')"
run_exit "orch-bash: worktree mention is not scope"    2 "$ORCH_BASH_GUARD" "$(bc 'echo .worktrees/foo > src/x.ts')"

# === Escape hatch ===
run_exit "orch-bash: escape hatch allows npm install"  0 "$ORCH_BASH_GUARD" "$(bc 'npm install lodash')" "CLAUDE_ALLOW_ORCHESTRATOR_BASH=1"
run_exit "orch-bash: escape hatch allows docker compose" 0 "$ORCH_BASH_GUARD" "$(bc 'docker compose up')" "CLAUDE_ALLOW_ORCHESTRATOR_BASH=1"

# === Non-trigger ===
run_exit "orch-bash: ignores non-Bash tool (Write)"    0 "$ORCH_BASH_GUARD" '{"tool_name":"Write","tool_input":{"file_path":"src/foo.ts","content":"x"}}'
run_exit "orch-bash: ignores empty stdin"              0 "$ORCH_BASH_GUARD" ''
run_exit "orch-bash: ignores malformed JSON"           0 "$ORCH_BASH_GUARD" 'not json'

# ---------------- plan-update-location-guard.cjs ----------------
echo
echo "plan-update-location-guard.cjs:"

# Helpers reuse w() / e() from earlier blocks.

# === Block cases (plan-update*.json outside .worktrees/) ===
run_exit "plan-update-loc: blocks plan-update.json at root"            2 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'plan-update.json')"
run_exit "plan-update-loc: blocks plan-update-T-001.json at root"      2 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'plan-update-T-001.json')"
run_exit "plan-update-loc: blocks plan-update-2026-05-31.json at root" 2 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'plan-update-2026-05-31.json')"
run_exit "plan-update-loc: blocks Edit on root plan-update.json"        2 "$PLAN_UPDATE_LOCATION_GUARD" "$(e 'plan-update.json')"
run_exit "plan-update-loc: blocks absolute root path"                   2 "$PLAN_UPDATE_LOCATION_GUARD" "$(w '/Users/viet/repo/plan-update.json')"
run_exit "plan-update-loc: blocks docs/ subdir"                         2 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'docs/plan-update.json')"

# === Allow cases (inside .worktrees/) ===
run_exit "plan-update-loc: allows .worktrees/be-dev-T-001/plan-update.json"  0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w '.worktrees/be-dev-T-001/plan-update.json')"
run_exit "plan-update-loc: allows .worktrees/sa-T-002/plan-update.json"      0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w '.worktrees/sa-T-002/plan-update.json')"
run_exit "plan-update-loc: allows .worktrees/qa-author-T-003/plan-update.json" 0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w '.worktrees/qa-author-T-003/plan-update.json')"
run_exit "plan-update-loc: allows absolute worktree path"                    0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w '/Users/viet/repo/.worktrees/be-dev-T-001/plan-update.json')"

# === Non-plan-update files always allowed ===
run_exit "plan-update-loc: ignores docs/SRS.md"                  0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'docs/SRS.md')"
run_exit "plan-update-loc: ignores package.json"                 0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'package.json')"
run_exit "plan-update-loc: ignores docs/plan/master-plan.md"     0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'docs/plan/master-plan.md')"
run_exit "plan-update-loc: ignores plan-summary.json (different prefix)" 0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'plan-summary.json')"

# === Escape hatch ===
run_exit "plan-update-loc: escape hatch allows root write"       0 "$PLAN_UPDATE_LOCATION_GUARD" "$(w 'plan-update.json')" "CLAUDE_ALLOW_PLAN_UPDATE_ROOT=1"

# === Non-trigger tools ===
run_exit "plan-update-loc: ignores Bash tool"                    0 "$PLAN_UPDATE_LOCATION_GUARD" '{"tool_name":"Bash","tool_input":{"command":"cat plan-update.json"}}'
run_exit "plan-update-loc: ignores Read tool"                    0 "$PLAN_UPDATE_LOCATION_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"plan-update.json"}}'
run_exit "plan-update-loc: ignores empty stdin"                  0 "$PLAN_UPDATE_LOCATION_GUARD" ''
run_exit "plan-update-loc: ignores malformed JSON"               0 "$PLAN_UPDATE_LOCATION_GUARD" 'not json'


# ---------------- fe-dev-design-contract-guard.cjs ----------------
echo
echo "fe-dev-design-contract-guard.cjs:"

FE_GUARD="$HOOKS_DIR/fe-dev-design-contract-guard.cjs"

# Build a fixture project with a Frozen design contract for T-100, no contract for T-200.
FE_FIX="$(mktemp -d)"
mkdir -p "$FE_FIX/.claude" "$FE_FIX/docs/uiux/refs"
printf '%s\n' '# Design contract — T-100' '- Status: Frozen' '- Figma-File-Version: abc' > "$FE_FIX/docs/uiux/refs/T-100.md"
printf '%s\n' '# Design contract — T-300' '- Status: Draft' > "$FE_FIX/docs/uiux/refs/T-300.md"

fe_w() {
  # $1 = absolute file_path, $2 = cwd
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"},"cwd":"%s"}' "$1" "$2"
}
fe_e() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"a","new_string":"b"},"cwd":"%s"}' "$1" "$2"
}

# === Non-fe-dev contexts always pass ===
run_exit "fe-design: non-fe-dev cwd (Orchestrator) passes" 0 "$FE_GUARD" "$(fe_w "$FE_FIX/web/src/Foo.tsx" "$FE_FIX")"
run_exit "fe-design: be-dev worktree passes"               0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/be-dev-T-100/web/src/Foo.tsx" "$FE_FIX/.worktrees/be-dev-T-100")"

# === FE Dev worktree with Frozen design contract passes ===
run_exit "fe-design: Frozen contract allows .tsx write"    0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-100/web/src/Foo.tsx" "$FE_FIX/.worktrees/fe-dev-T-100")"
run_exit "fe-design: Frozen contract allows e2e spec"      0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-100/e2e/login.spec.ts" "$FE_FIX/.worktrees/fe-dev-T-100")"
run_exit "fe-design: Frozen contract allows Edit"          0 "$FE_GUARD" "$(fe_e "$FE_FIX/.worktrees/fe-dev-T-100/web/src/Foo.tsx" "$FE_FIX/.worktrees/fe-dev-T-100")"

# === FE Dev worktree, no design contract — BLOCK ===
run_exit "fe-design: no contract blocks .tsx write"        2 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/web/src/Foo.tsx" "$FE_FIX/.worktrees/fe-dev-T-200")"
run_exit "fe-design: no contract blocks .ts write"         2 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/src/lib/util.ts" "$FE_FIX/.worktrees/fe-dev-T-200")"
run_exit "fe-design: no contract blocks .css write"        2 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/src/styles/main.css" "$FE_FIX/.worktrees/fe-dev-T-200")"

# === FE Dev worktree, contract exists but Draft — BLOCK ===
run_exit "fe-design: Draft contract blocks write"          2 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-300/web/src/Foo.tsx" "$FE_FIX/.worktrees/fe-dev-T-300")"

# === FE Dev worktree, writing non-FE-source — ALLOW ===
run_exit "fe-design: docs/ write passes (no contract needed)" 0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/docs/uiux/refs/T-200.md" "$FE_FIX/.worktrees/fe-dev-T-200")"
run_exit "fe-design: JSON config passes"                   0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/package.json" "$FE_FIX/.worktrees/fe-dev-T-200")"
run_exit "fe-design: .md write passes"                     0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/README.md" "$FE_FIX/.worktrees/fe-dev-T-200")"

# === Escape hatch ===
run_exit "fe-design: escape hatch allows write"            0 "$FE_GUARD" "$(fe_w "$FE_FIX/.worktrees/fe-dev-T-200/web/src/Foo.tsx" "$FE_FIX/.worktrees/fe-dev-T-200")" "CLAUDE_SKIP_DESIGN_CONTRACT_CHECK=1"

# === Non-trigger tools ===
run_exit "fe-design: Bash tool ignored"                    0 "$FE_GUARD" '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
run_exit "fe-design: Read tool ignored"                    0 "$FE_GUARD" '{"tool_name":"Read","tool_input":{"file_path":"x"}}'
run_exit "fe-design: empty stdin ignored"                  0 "$FE_GUARD" ''
run_exit "fe-design: malformed JSON ignored"               0 "$FE_GUARD" 'not json'

rm -rf "$FE_FIX"

# ---------------- ui-task-readiness-guard.cjs ----------------
echo
echo "ui-task-readiness-guard.cjs:"

UI_READY="$HOOKS_DIR/ui-task-readiness-guard.cjs"

# Fixture project: UI task T-168 (no artifacts), UI task T-180 (all artifacts), BE task T-200.
UI_FIX="$(mktemp -d)"
mkdir -p "$UI_FIX/.claude" "$UI_FIX/docs/plan/phase-22/tasks"
printf '%s\n' '# T-168 — Batch UI' '- Phase: phase-22' '- Track: fe' '- Status: in-progress' '- Design sub-status: design-confirmed' > "$UI_FIX/docs/plan/phase-22/tasks/T-168.md"
printf '%s\n' '# T-180 — Group UI' '- Phase: phase-22' '- Track: fe' '- Status: in-progress' '- Design sub-status: design-confirmed' > "$UI_FIX/docs/plan/phase-22/tasks/T-180.md"
printf '%s\n' '# T-200 — BE only' '- Phase: phase-22' '- Track: be' '- Status: in-progress' > "$UI_FIX/docs/plan/phase-22/tasks/T-200.md"
# ISSUE-024 regression: non-UI infra tasks whose Linked Surface is N/A with a
# clarifying parenthetical must NOT be treated as UI-bearing.
printf '%s\n' '# T-067 — Schema migration' '- Phase: phase-22' '- Track: be' '- Status: in-progress' '- Linked Surface: N/A (schema-only)' > "$UI_FIX/docs/plan/phase-22/tasks/T-067.md"
printf '%s\n' '# T-066 — Auth middleware' '- Phase: phase-22' '- Track: be' '- Status: in-progress' '- Linked Surface: N/A (server middleware behavior change)' > "$UI_FIX/docs/plan/phase-22/tasks/T-066.md"
# Counter-case: a REAL surface that happens to carry a parenthetical platform
# tag must STILL be detected as UI-bearing (the fix must not over-strip).
printf '%s\n' '# T-300 — Live view' '- Phase: phase-22' '- Track: be' '- Status: in-progress' '- Linked Surface: Spectator Live View (web)' > "$UI_FIX/docs/plan/phase-22/tasks/T-300.md"
mkdir -p "$UI_FIX/docs/uiux/refs" "$UI_FIX/docs/uiux/visual-specs" "$UI_FIX/docs/test-cases/by-task/T-180"
echo "# T-180" > "$UI_FIX/docs/uiux/refs/T-180.md"
echo "# T-180" > "$UI_FIX/docs/uiux/visual-specs/T-180.md"
echo "# api" > "$UI_FIX/docs/test-cases/by-task/T-180/api.md"

# Helper: build plan-update.json Write event
ui_pu() {
  # $1 task_id, $2 to_status, $3 cwd, $4 track (optional, default fe)
  local tid="$1" tos="$2" cwd="$3" trk="${4:-fe}"
  local content='{"task_id":"'"$tid"'","track":"'"$trk"'","from_status":"in-progress","to_status":"'"$tos"'","agent":"fe-dev","timestamp":"2026-06-04T00:00:00Z"}'
  python3 -c "
import json, sys
print(json.dumps({
  'tool_name':'Write',
  'tool_input':{'file_path':'$cwd/plan-update.json','content':'$content'},
  'cwd':'$cwd'
}))"
}

# === Block: UI task, all 3 artifacts missing ===
run_exit "ui-ready: T-168 no artifacts blocks ready-for-deploy" 2 "$UI_READY" "$(ui_pu T-168 ready-for-deploy "$UI_FIX/.worktrees/fe-dev-T-168")"

# === Allow: UI task with all 3 artifacts ===
run_exit "ui-ready: T-180 with all artifacts allows" 0 "$UI_READY" "$(ui_pu T-180 ready-for-deploy "$UI_FIX/.worktrees/fe-dev-T-180")"

# === Allow: BE-only task even without artifacts ===
run_exit "ui-ready: T-200 (be track) allows without artifacts" 0 "$UI_READY" "$(ui_pu T-200 ready-for-deploy "$UI_FIX/.worktrees/be-dev-T-200" be)"

# === ISSUE-024: Linked Surface "N/A (parenthetical)" is non-UI → allow ===
run_exit "ui-ready: T-067 N/A(schema-only) allows"        0 "$UI_READY" "$(ui_pu T-067 ready-for-deploy "$UI_FIX/.worktrees/be-dev-T-067" be)"
run_exit "ui-ready: T-066 N/A(middleware) allows"         0 "$UI_READY" "$(ui_pu T-066 ready-for-deploy "$UI_FIX/.worktrees/be-dev-T-066" be)"
# === Counter-case: real surface with a parenthetical is STILL UI → block ===
run_exit "ui-ready: T-300 real surface w/ paren blocks"   2 "$UI_READY" "$(ui_pu T-300 ready-for-deploy "$UI_FIX/.worktrees/be-dev-T-300" be)"

# === Allow: to_status != ready-for-deploy ===
run_exit "ui-ready: to_status=in-progress always allows"  0 "$UI_READY" "$(ui_pu T-168 in-progress "$UI_FIX/.worktrees/fe-dev-T-168")"
run_exit "ui-ready: to_status=done always allows"         0 "$UI_READY" "$(ui_pu T-168 done "$UI_FIX/.worktrees/fe-dev-T-168")"

# === Allow: non-plan-update.json file ===
run_exit "ui-ready: non-plan-update.json passes" 0 "$UI_READY" "$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.worktrees/fe-dev-T-168/docs/SRS.md","content":"x"},"cwd":"%s/.worktrees/fe-dev-T-168"}' "$UI_FIX" "$UI_FIX")"

# === Allow: Non-trigger tools ===
run_exit "ui-ready: Edit tool ignored"  0 "$UI_READY" '{"tool_name":"Edit","tool_input":{"file_path":"x","old_string":"a","new_string":"b"}}'
run_exit "ui-ready: Bash tool ignored"  0 "$UI_READY" '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
run_exit "ui-ready: empty stdin"        0 "$UI_READY" ''
run_exit "ui-ready: malformed JSON"     0 "$UI_READY" 'not json'

# === Escape hatch ===
run_exit "ui-ready: escape hatch allows missing artifacts" 0 "$UI_READY" "$(ui_pu T-168 ready-for-deploy "$UI_FIX/.worktrees/fe-dev-T-168")" "CLAUDE_SKIP_UI_READINESS_CHECK=1"

rm -rf "$UI_FIX"

# ---------------- summary ----------------
echo
echo "Total: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
