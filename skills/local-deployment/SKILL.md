---
name: local-deployment
description: How DevOps composes the local environment using Docker so QA-Exec can run end-to-end tests AND the operator can manually trial features in a browser. Probes available host ports instead of hardcoding, discovers project .env/template/env_file requirements without exposing secrets, never edits the project's compose file directly, and produces a deploy report with QA test-environment fields and human-friendly trial URLs.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Local Deployment

## When to use

You are DevOps, dispatched against a task in status `ready-for-deploy`. Your job is to bring the local environment up — typically FE + BE + datastores composed via Docker — so two consumers can work against it:

1. **QA-Exec** runs the test runner against `base_url` / `api_base_url` per the kit's QA-Exec Run Contract.
2. **The operator** (PM, designer, eng lead) opens the running app in a browser to manually trial the feature before sign-off — confirming the feature looks and behaves right against intent, not just against test assertions.

The skill covers Docker-based composition, port discovery (probe-then-bind, never hardcode), and deploy-report population. For non-Docker stacks (rare in modern projects), consult `docs/architecture.md` for the project's documented run mode.

## Project-scoped container discipline (safety rule)

The kit dispatches DevOps inside an operator's environment that almost always has unrelated containers running — the operator's personal Postgres, another project's Redis, a sibling repo's docker-compose stack. A careless `docker compose down -v` would nuke them all. DevOps's blast radius is **scoped to the current project's containers only**.

### Project slug — single source of truth

Determine the project slug (the Compose project name) once at deploy start; thread it through every subsequent docker command. Lookup priority:

1. **`COMPOSE_PROJECT_NAME` environment variable** if set (most explicit; respects the operator's intent).
2. **SRS header's project name field** if Phase 0 read SRS successfully — sanitize: `lowercase(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`. Example: `"Stats Overflow"` → `stats-overflow`.
3. **Working-directory basename** as a fallback when neither of the above is available. Same sanitization.

Record the chosen slug at the top of the deploy report (`## Test Environment` block adds `project_slug: <slug>` field) so QA-Exec and the operator can verify.

### Every command takes the slug

Apply the slug to every docker invocation:

```bash
slug="stats-overflow"  # from lookup above

# Compose: pass -p explicitly
docker compose -p "$slug" -f docker-compose.yml -f docker-compose.override.yml up -d --wait
docker compose -p "$slug" down                          # tear-down
docker compose -p "$slug" logs --tail=200 api           # inspection

# Plain docker ps: filter by Compose-project label
docker ps --filter "label=com.docker.compose.project=$slug"
docker ps --filter "name=^${slug}-"                     # if not using Compose labels

# Container operations: name MUST start with the slug
container_name="${slug}-api-1"
docker inspect "$container_name"
docker logs "$container_name"
```

### Out-of-scope reads — explicitly allowed (for conflict detection only)

Conflict detection legitimately requires reading what ELSE is running on the host. The following READ operations are permitted on out-of-scope containers / system state:

| Operation | Why allowed |
|---|---|
| `docker ps` (no filter) | Conflict detection — what ports are in use, what's running |
| `docker ps -a` | Same — including stopped containers |
| `docker inspect <any container>` | Read-only inspection for conflict resolution |
| `docker logs <any container>` | Read-only diagnostics if a port owner is identified |
| `docker port <any container>` | Read which ports a container is publishing |
| `docker stats --no-stream` | Resource visibility |
| `docker version` / `docker info` | System info |
| `docker network ls` / `docker network inspect` | Network state visibility (read-only) |
| `docker volume ls` / `docker volume inspect` | Volume state visibility (read-only) |

These are HOW DevOps probes ports + detects conflicts. They never mutate state.

### Out-of-scope mutations — explicitly forbidden

DevOps MUST NOT run any of the following:

| Operation | Why forbidden |
|---|---|
| `docker stop <name>` where `<name>` doesn't start with `<slug>` | Could stop the operator's personal services |
| `docker rm <name>` where `<name>` doesn't start with `<slug>` | Same |
| `docker kill <name>` where `<name>` doesn't start with `<slug>` | Same |
| `docker restart <name>` where `<name>` doesn't start with `<slug>` | Same |
| `docker pause` / `unpause <name>` outside slug | Same |
| `docker compose -p <other-slug>` ANY mutation | Operates on another project entirely |
| `docker compose down` without `-p <slug>` | Defaults to cwd basename → might match wrong project if cwd is non-standard |
| `docker system prune` | Nukes ALL unused containers / networks / volumes across all projects |
| `docker volume prune` | Nukes unused volumes globally |
| `docker network prune` | Nukes unused networks globally |
| `docker container prune` | Nukes all stopped containers globally |
| `docker image prune` | Nukes unused images globally — affects other projects' rebuild times |
| `docker rm -f $(docker ps -q)` (and variants with `$(docker ps ...)`) | Force-removes ALL running containers |
| `docker stop $(docker ps -q)` | Stops ALL running containers |
| `docker volume rm <name>` outside slug | Could destroy operator's data |
| `docker network rm <name>` outside slug | Could break other projects' networking |
| `docker image rm <name>` | Affects every project that uses the image |

The `docker-scope-guard.cjs` hook enforces these at runtime — DevOps will be refused before the command runs.

### Conflict resolution — non-mutating recourse

When an out-of-scope container holds a port the kit project needs:

1. **Probe and report** — DevOps notes "port 5432 occupied by `mysite-postgres-1` (not in scope)" in the deploy report.
2. **Pick a different port** — port-probe algorithm finds a free one (see Step 4 above).
3. **Surface to the operator if no port is available** — write the conflict into `docs/open-issues.md` with category `local-port-exhaustion`, halt the dispatch, return NEEDS_CONTEXT asking the operator to manually free a port (their decision; they own those containers).

NEVER auto-resolve by stopping the other container.

## Inputs and outputs

- **Inputs:** the project's existing `docker-compose.yml` (or equivalent); project env templates and compose `env_file:` references; `docs/architecture.md` C2 Containers section (to know what services to expect); the task ID; SRS §3.4 Technical Constraints if it pins ports.
- **Outputs:** a running local environment (containers up + health-checked); `docs/deploy-reports/<task-id>.md` with the standard Test Environment block + a new `## Human Trial URLs` section both QA and the operator consume.

## Procedure

### Step 1 — Verify Docker

Run two checks:

```bash
docker info > /dev/null 2>&1 || { echo "docker daemon not running"; exit 1; }
docker compose version > /dev/null 2>&1 || { echo "docker compose v2 not available"; exit 1; }
```

If either fails, halt with `NEEDS_CONTEXT`:

```
Status: NEEDS_CONTEXT
Reason: Docker prerequisite missing.
Question: docker daemon not running OR docker compose v2 not installed. The local-deployment skill requires both.
Suggested resolution: Start Docker Desktop / colima / podman; verify with `docker info` then `docker compose version`.
```

Do NOT attempt to install Docker yourself — that's an operator decision.

### Step 1.5 — Detect host architecture + compute target platform

Docker images are architecture-specific. The kit's most common failure mode here is silently shipping `amd64` images on Apple Silicon (arm64 Darwin) — they technically run via Rosetta emulation but at 30–60% performance penalty, occasional binary incompatibilities (e.g., native `node-gyp` modules), slow startup, and confusing error messages. Detect host arch BEFORE bringing the env up; match images deliberately.

```bash
host_os=$(uname -s)       # Darwin / Linux
host_arch=$(uname -m)     # x86_64 / arm64 / aarch64

# Normalize to Docker platform notation
case "$host_arch" in
  x86_64|amd64)         target_platform="linux/amd64" ;;
  arm64|aarch64)        target_platform="linux/arm64" ;;
  *)                    echo "Unknown arch: $host_arch"; exit 1 ;;
esac

echo "Host: $host_os $host_arch → target_platform=$target_platform"
```

**Host → target-platform mapping:**

| Host | uname -m | target_platform | Notes |
|---|---|---|---|
| Apple Silicon Mac (M1/M2/M3/M4) | `arm64` | `linux/arm64` | Native; preferred |
| Intel Mac | `x86_64` | `linux/amd64` | Native |
| Linux x86_64 (most servers / cloud VMs) | `x86_64` | `linux/amd64` | Native |
| Linux ARM64 (AWS Graviton, Ampere, RPi) | `aarch64` | `linux/arm64` | Native |
| Windows (WSL2) | per WSL distro | per arch | Same rules apply inside WSL |

**Inspect compose file for explicit platform pins.** Many projects pin services to `linux/amd64` for historical reasons (image vendor only published amd64, team standardized on Intel laptops, etc.). Walk the compose file's `services.*.platform` field:

```bash
# Pseudo: extract platform pins
yq '.services[] | select(.platform != null) | .platform' docker-compose.yml
```

For each pinned service, classify against the host:

| Compose platform | Host target | Action |
|---|---|---|
| Not pinned | any | Pass `--platform=$target_platform` to docker compose; Docker selects native image if available, falls back to multi-arch manifest |
| `linux/amd64` | `linux/amd64` host | Native; proceed |
| `linux/amd64` | `linux/arm64` host (Apple Silicon!) | **Emulation warning** — image runs via Rosetta/QEMU at ~50% performance. Flag in deploy report; consider asking SA for a multi-arch base image migration. |
| `linux/arm64` | `linux/arm64` host | Native; proceed |
| `linux/arm64` | `linux/amd64` host | **Emulation warning** (rare; usually means compose was authored on Apple Silicon and never re-tested on Intel CI) |
| Multi-arch image (no platform pin, image manifest lists both) | any | Docker picks native automatically; preferred |

**Apply the platform to every relevant command.** Pass `--platform=$target_platform` to:

- `docker compose -p <slug> up -d --wait` → if compose-file `platform:` fields aren't explicit, this overrides; if they ARE explicit, this gets ignored per-service (compose-file wins).
- `docker build --platform=$target_platform -t <tag> .` (and `buildx` invocations) — when building from local Dockerfiles.
- `docker run --platform=$target_platform <image>` — when running standalone containers.

**For projects shipping amd64-only images to mixed-arch teams:** the right answer is a multi-arch base image (build with `docker buildx build --platform=linux/amd64,linux/arm64`). Surface this as an open-issue with category `multi-arch-base-needed` and let SA pick up the migration.

### Step 2 — Discover the project's compose definition

Look for, in order:

1. `docker-compose.yml` at project root (most common).
2. `compose.yml` (Compose v2 convention).
3. `infra/docker-compose.yml`, `deploy/docker-compose.yml` (per kit's "project-owned reusable infra" pattern).
4. A multi-file split: `docker-compose.yml` + `docker-compose.local.yml` (project's `local` overlay).

If NONE exists, halt:

```
Status: NEEDS_CONTEXT
Reason: No compose file found at project root or under infra/ / deploy/.
Question: The kit cannot author a compose file inline (per the DevOps template's "project-owned reusable infra" rule). Either:
  [a] The project doesn't have local-deploy machinery yet — needs an architecture decision (escalate to SA / TL via open-issue with category `infra-decision-pending`).
  [b] The compose file lives elsewhere — name the path.
```

### Step 2.5 — Discover environment files and validate env readiness

Do this before port probing or `docker compose up`. Many local deploy failures are really env-loading failures: Compose was run from the wrong directory, the root `.env` was not loaded, a service-level `env_file:` was missing, or QA ran with defaults that differ from the operator's intended local setup.

Classify env files:

- **Operator-owned secret env files:** `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.<service>`, and any file named by compose `env_file:` unless it is an allowlisted template. Detect existence and usage, but never read or print values.
- **Safe templates:** `.env.example`, `.env.template`, `.env.sample`, including service-specific variants. These may be read to collect required key names and comments.

Procedure:

1. Inspect the selected compose files and project run docs for:
   - `env_file:` entries per service;
   - `${VAR}` / `${VAR:-default}` / `${VAR:?required}` interpolation placeholders;
   - documented local env-file order, for example `.env` then `.env.local`.
2. Read safe templates only. Extract key names, defaults, and comments; do not treat template placeholder values as deploy secrets.
3. Detect whether operator-owned env files exist and whether every compose-referenced `env_file:` path exists. Do not copy env files into the worktree and do not create missing files.
4. Build a `compose_env_args` list for every later Compose command:
   - run from the project root or pass `--project-directory <project-root>` so root `.env` participates in interpolation;
   - include explicit `--env-file <path>` only when the project docs/scripts/compose setup declare that file order;
   - preserve service-level `env_file:` entries in compose instead of copying them into the generated override.
5. Validate the selected compose/env files before port probing:

   ```bash
   # Use the same -p, -f, --project-directory, and --env-file arguments that the final deploy will use,
   # but do not include the generated override yet because Step 5 has not created it.
   docker compose --project-directory "$project_root" "${compose_env_args[@]}" -p "$slug" -f docker-compose.yml config --quiet
   ```

   Use `config --quiet`, not full `docker compose config`, because full config output can print resolved secret values.
6. If validation fails because a required env var or env file is missing, halt with `NEEDS_CONTEXT`. Ask the operator to create/update the project-local env file manually. Do not write `.env` yourself.
7. If privacy hooks block key-only inspection of operator-owned env files, record `key_status: not inspected (privacy guard)` in the deploy report. Do not bypass privacy just to count keys.

The deploy report must include an env summary with file names and statuses only:

```markdown
### Env File Awareness

| Item | Status | Notes |
|---|---|---|
| `.env` | present | operator-owned; values not read or printed |
| `.env.local` | absent | not declared by project docs |
| `api/.env` via compose `env_file` | present | service-level env file |
| `.env.example` | read | 18 documented keys |

- compose_config_quiet: pass
- missing_required_env: none
- secret_values_redacted: true
```

### Step 3 — Determine preferred port ranges

Consult, in priority order:

1. **SRS §3.4 Technical Constraints** if it names port preferences for the project.
2. **`.claude/skills/solution-defaults/references/defaults-table.md`** if it lists project port defaults.
3. **The compose file's published ports** (`ports:` lists; treat as preferences, not mandates — they may conflict on the host).
4. **Kit defaults** (table below) when none of the above apply.

| Service type | Preferred range | Container-internal default |
|---|---|---|
| Web FE (Next.js / Vite / CRA) | 3000–3010 | 3000 |
| Backend HTTP API | 4000–4010 OR 8080–8090 | varies |
| Admin / internal | 4100–4110 | varies |
| WebSocket gateway | 4200–4210 | varies |
| Postgres | 5432–5442 | 5432 |
| MySQL | 3306–3316 | 3306 |
| Redis | 6379–6389 | 6379 |
| Elasticsearch | 9200–9210 | 9200 |
| Kafka broker | 9092–9102 | 9092 |
| RabbitMQ | 5672–5682 | 5672 |
| MinIO / S3-compat | 9000–9010 + 9100–9110 (console) | 9000 / 9001 |

The preferred range gives predictability for the operator (no random ports each run) while leaving headroom when the defaults are occupied.

### Step 4 — Probe ports

For each service, walk its preferred range and find the first host port not in LISTEN state:

```bash
probe_port() {
  local start=$1 end=$2
  for port in $(seq "$start" "$end"); do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -t > /dev/null 2>&1; then
      echo "$port"; return 0
    fi
  done
  return 1  # entire range occupied
}

# Example: FE
fe_port=$(probe_port 3000 3010) || fe_port=$(probe_port 13000 13010) || fe_port=0  # ephemeral fallback
```

**Probe semantics:**

- `lsof -iTCP:<port> -sTCP:LISTEN` reports whether any process is LISTENING on that host port. Exit code 0 = occupied; non-zero = free.
- If `lsof` is unavailable, fall back to `ss -ltn '( sport = :<port> )'` (Linux) or `netstat -an | grep <port>` (broadly compatible).
- If the **entire preferred range** is occupied, try a fallback range (typically `+10000` to the preferred — e.g., 13000–13010 if 3000–3010 are full).
- If even the fallback is full, use **ephemeral port assignment**: bind the container port to host port `0` and ask Docker which port it chose:

  ```bash
  docker compose up -d <service>
  host_port=$(docker compose port <service> <container_internal_port> | sed 's/.*://')
  ```

  The OS picks an unused high port; you read it back. Always log the chosen port in the deploy report regardless of which path got you there.

### Step 5 — Generate the override in your worktree

DO NOT edit the project's `docker-compose.yml` directly — it's project-owned reusable infra (per DevOps template Tool Scope rule 2). Instead, create `docker-compose.override.yml` in your worktree at task scope:

```yaml
# .worktrees/devops-T-001/docker-compose.override.yml
# Auto-generated by DevOps for task T-001. Maps probed host ports to container internals.
# Do NOT commit this file to main — it's worktree-local.
services:
  web:
    ports:
      - "${PROBED_FE_PORT}:3000"
  api:
    ports:
      - "${PROBED_API_PORT}:4000"
  postgres:
    ports:
      - "${PROBED_PG_PORT}:5432"
```

Compose merges override files automatically when you use `-f`:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

Or set `COMPOSE_FILE` env var. The override file lives in the worktree alongside the deploy report; it is **not** intended for main-branch commit (the kit's `.gitignore` already excludes `.worktrees/`).

After generating the override and setting any probed-port variables it references, run final Compose validation with the override included:

```bash
docker compose --project-directory "$project_root" "${compose_env_args[@]}" -p "$slug" -f docker-compose.yml -f docker-compose.override.yml config --quiet
```

This final validation catches env/override interpolation mistakes without dumping resolved secret values.

### Step 6 — Bring the environment up

```bash
# target_platform from Step 1.5, compose_env_args/project_root from Step 2.5
docker compose --project-directory "$project_root" "${compose_env_args[@]}" -p "$slug" -f docker-compose.yml -f docker-compose.override.yml up -d --wait
# When images are built locally from a Dockerfile:
#   docker compose --project-directory "$project_root" "${compose_env_args[@]}" -p "$slug" -f docker-compose.yml -f docker-compose.override.yml build --build-arg TARGETPLATFORM="$target_platform"
# When pulling pre-built images that don't have a manifest list, set DOCKER_DEFAULT_PLATFORM:
#   DOCKER_DEFAULT_PLATFORM=$target_platform docker compose --project-directory "$project_root" "${compose_env_args[@]}" -p "$slug" up -d --wait
```

The `--wait` flag (Compose v2.17+) blocks until every service with a healthcheck reports `healthy`. If your compose file lacks healthchecks for some services, fall back to the polling loop in Step 7.

### Step 7 — Health-check loop (when --wait isn't sufficient)

For services with NO declared healthcheck in the compose file:

```bash
wait_for_http() {
  local url=$1 timeout_seconds=${2:-60}
  local elapsed=0
  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    if curl -sf -o /dev/null --max-time 3 "$url"; then return 0; fi
    sleep 2; elapsed=$((elapsed + 2))
  done
  return 1
}

# Examples:
wait_for_http "http://localhost:${fe_port}/" 90 || { echo "FE never came healthy"; exit 1; }
wait_for_http "http://localhost:${api_port}/healthz" 60 || { echo "API never came healthy"; exit 1; }
```

If any service stays unhealthy past timeout, gather logs (`docker compose logs --tail=200 <service>`) and report as a deploy failure (see DevOps template § Failure Handling). Do NOT proceed to QA-Exec dispatch — that signals a successful deploy.

### Step 7.5 — UI-rendering smoke probe (UI-bearing tasks only)

When the task being deployed has any UI surface (task file shows `track: fe` / `be+fe`, OR `Linked Surface:` non-null, OR the linked FRs in SRS §3.3 reference a UI surface), the API-level health checks above are necessary but NOT sufficient. The 2026-06-04 FR-022 batch-UI silent-drop incident demonstrated the failure mode: every API endpoint returned 200, every smoke `curl` against `/api/...` PASSed, QA-Exec ran by-task TCs that asserted on the API layer, and the missing UI surface went undetected through to operator discovery weeks later.

The fix is a per-surface bundle-grep + rendering probe. For each linked UI surface:

```bash
# 1. Bundle testID coverage probe
#    For each contract-declared testID family for the surface, grep the deployed
#    JS bundle for at least one occurrence. Zero matches = bundle-coverage-fail.
declared_testids() {
  # Read docs/instrumentation-contract.md for the surface section and emit
  # each declared testID one per line. Implementation depends on the contract's
  # markup convention — typically a bullet list under `### <surface-name>`.
  awk -v surf="$1" '
    $0 ~ "^### " surf { in_block=1; next }
    /^### / { in_block=0 }
    in_block && /^[*-] `[^`]+`/ {
      match($0, /`[^`]+`/); print substr($0, RSTART+1, RLENGTH-2)
    }
  ' docs/instrumentation-contract.md
}

probe_bundle() {
  local surface="$1" base="$2"
  local bundle_url=$(curl -sf "$base" | grep -oE 'src="[^"]+\.js"' | head -1 | sed 's/src="//; s/"$//')
  [ -z "$bundle_url" ] && { echo "no bundle src found at $base"; return 1; }
  local bundle_full
  case "$bundle_url" in /*) bundle_full="${base%/}$bundle_url" ;; *) bundle_full="$base/$bundle_url" ;; esac
  local bundle=$(curl -sf "$bundle_full")
  [ -z "$bundle" ] && { echo "bundle empty at $bundle_full"; return 1; }
  local missing=()
  while IFS= read -r tid; do
    [ -z "$tid" ] && continue
    if ! printf "%s" "$bundle" | grep -qF "$tid"; then missing+=("$tid"); fi
  done < <(declared_testids "$surface")
  if [ ${#missing[@]} -gt 0 ]; then
    printf "bundle-coverage-fail: %d testID(s) declared but absent from bundle:
" "${#missing[@]}"
    printf "  - %s
" "${missing[@]}"
    return 2
  fi
}

# Example invocation for the per-task UI surface
probe_bundle "RepositoryVisibilityAdminPage" "http://localhost:${fe_port}"   || { echo "DEPLOY FAILED: UI bundle missing testIDs"; exit 1; }
```

```bash
# 2. Page-load probe (optional but recommended for tasks with rendering risk)
#    Use a headless browser if available (puppeteer / playwright in Docker
#    sidecar OR the host's playwright binary if DevOps has it). Verify the
#    rendered DOM contains at least one element per testID family.
#
#    When no headless browser is available, the bundle-grep above is the
#    fallback signal. Bundle-grep is necessary; rendering probe is sufficient.
```

The deploy report (Step 8 below) gains a new sub-section `### UI Smoke Probe`:

```markdown
### UI Smoke Probe (UI tasks only)

Per-surface bundle-grep + rendering probe results. Verifies that contract-declared
testIDs ship in the deployed bundle. A bundle-coverage-fail blocks QA-Exec dispatch
because the failure mode is implementation-incomplete, not test-incomplete.

| Surface | Bundle path probed | testIDs declared | testIDs found | Result |
|---|---|---|---|---|
| RepositoryVisibilityAdminPage | /assets/index-CJbtSFzX.js | 8 | 8 | pass |
| GroupVisibilityAdminPage | /assets/index-CJbtSFzX.js | 6 | 6 | pass |

If Result is `bundle-coverage-fail`, the deploy report's overall verdict MUST be `failed`; the Orchestrator routes back to FE Dev with the missing-testID list (NOT to QA-Exec — the implementation is the gap, not the tests).
```

Hard rule: **bundle-coverage-fail is a deploy failure, not a QA failure.** When testIDs are declared in the instrumentation contract but absent from the deployed bundle, FE Dev's implementation is incomplete. QA-Exec running against a deployed bundle that lacks the testIDs would either fail (selector-not-found) or pass vacuously (no selector asserted because no UI TC was authored against the missing element). The bundle-grep at deploy time catches the gap one step earlier, before QA-Exec wastes a run.

### Step 8 — Populate the deploy report

Write `docs/deploy-reports/<task-id>.md` per the DevOps template's schema. Two sections both matter:

#### Test Environment (for QA-Exec)

Standard schema per the DevOps template — `base_url`, `api_base_url`, `admin_base_url`, etc. Use the **probed ports**, not the compose-file defaults. Example:

```markdown
## Test Environment

- base_url: http://localhost:3007            (FE — port 3007 chosen; 3000-3006 were in use)
- api_base_url: http://localhost:4002        (API — port 4002 chosen)
- admin_base_url: http://localhost:4101      (admin — port 4101 chosen)
- test_user_fixtures: e2e/fixtures/users.ts
- env_vars_for_tests:
  - REGION=VN
  - FEATURE_FLAG_SPECTATOR=on
- browser_targets: chromium, firefox, webkit
- viewport_baseline: 1280x800
- host_architecture: darwin/arm64           (uname -s / uname -m at deploy time)
- target_platform: linux/arm64              (computed in Step 1.5; passed to docker compose/build/run)
- compose_platforms:                        (per-service platform pin observed in compose file; `native` = no pin)
  - api: native
  - fe: native
  - payments-legacy: linux/amd64            (vendor image; amd64-only)
- emulation_warnings:                       (services where compose_platforms != target_platform -- running under emulation)
  - payments-legacy: amd64 image on arm64 host (Rosetta/QEMU); expect slower cold-start + occasional native-syscall flake
- env_files:                                (file names/status only; never values)
  - .env: present; operator-owned; values not read or printed
  - api/.env via env_file: present; service-level
  - .env.local: absent; not declared by project docs
- env_templates:
  - .env.example: read; documented_keys=18
- env_validation:
  - compose_config_quiet: pass
  - missing_required_env: none
  - secret_values_redacted: true
```

The `host_architecture` / `target_platform` / `compose_platforms` / `emulation_warnings` fields surface platform mismatches explicitly in the deploy report -- QA-Exec sees them before running tests, and the debugger correlates "this test is flaky" with "this service runs under emulation" without re-deriving the host arch.

#### Read by Debugger on every dispatch

The debugger agent (`.claude/agents/_non-sdlc/debugger.md`) reads this deploy report as **Step 0 of its Procedure**, MANDATORY before any other diagnostic work. The fields it relies on:

- `project_slug` — for `docker logs <slug>-<service>-N` and `docker exec` scoping
- `base_url` / `api_base_url` / `admin_base_url` — for reproducing the symptom against the actual deployed surface
- `env_files` / `env_validation` — to identify local-env gaps without exposing secret values
- Container names (typically `<project_slug>-<service>-<replica>`) — for log inspection
- `## Human Trial URLs` — the same URLs operators trial; debugger uses to reproduce

A missing or malformed deploy report = debugger halts with NEEDS_CONTEXT requesting DevOps redeploy. The debugger NEVER builds or runs on the host (`npm install`, `docker build`, etc.) — the deployed env is the source of truth.

#### Human Trial URLs (for the operator)

A second list ALSO populated with chosen ports, but tuned for human consumption — what each surface does, what the operator should try, what credentials to use:

```markdown
## Human Trial URLs

For manual feature trial (operator / PM / designer / eng lead). Open in a browser; log in
with the test fixture below; walk through the user flows the task implements.

| Surface | URL | What to try | Test login |
|---|---|---|---|
| Spectator Live Match View | http://localhost:3007/spectate/M-DEMO | Open the demo match; verify Join button is visible; tap Join; confirm match state streams in <1s | viewer@example.test / dev-only-password |
| Tournament Admin Panel | http://localhost:3007/admin | Toggle a match's spectatability flag; verify the spectator side reflects within 5s | admin@example.test / dev-only-password |
| API healthcheck | http://localhost:4002/healthz | Should return `{"status":"ok"}` | n/a |

**Common dev-only credentials** are seeded by `db-seed.sql` (committed under `e2e/fixtures/`). These are NOT real users; do NOT use these patterns in staging or prod.

**Reset state** between trials: use the scoped `## Tear-down` command below with volume reset, then re-run the deploy command. Do not omit `-p <slug>`, `--project-directory`, or the env-file args.
```

The Human Trial URLs section is what makes the deploy useful beyond just QA-Exec. The operator can click through and verify the feature matches SRS intent (the "looks right" judgment that QA-Exec's structural tests can't replicate).

### Step 9 — Tear-down + Recovery

Document the tear-down command in the report:

```markdown
## Tear-down

- Standard: `docker compose --project-directory <project-root> <same --env-file args> -p <slug> -f docker-compose.yml -f docker-compose.override.yml down`
- With volume reset: `docker compose ... down -v` (drops Postgres data, reseeds on next up)
- Override file location (worktree-local; auto-cleaned on dispatch close): .worktrees/devops-T-001/docker-compose.override.yml
```

For dispatch close, the kit's worktree-isolation pattern cleans up the worktree (and its override file) automatically. No additional action needed.

## Common pitfalls

- **Deploying `linux/amd64` images on Apple Silicon (`darwin/arm64`) hosts without realising.** The compose file is silent about platform; Docker Desktop dutifully runs the amd64 image under Rosetta/QEMU emulation; tests pass but are 3-10x slower, cold-start times balloon, and occasional native-syscall paths flake. Run Step 1.5 at every deploy; pass `--platform=$target_platform`; surface `emulation_warnings` in the deploy report for any service whose `compose_platforms` entry doesn't match `target_platform`. If a vendor image is amd64-only (legacy SDK, proprietary binary), document the emulation in the deploy report so QA-Exec + the debugger know to expect it -- don't hide it.
- **Hardcoding port 3000** — every example online uses 3000. Don't. Probe; pick what's free; log the chosen port; tell the operator. The user's frustration with port-3000 conflicts is THE motivation for this skill.
- **Editing the project's `docker-compose.yml`** to "fix" port conflicts. Don't — that's project-owned reusable infra (DevOps template Tool Scope rule 2). Generate an override file in your worktree.
- **Running Compose from the worktree and accidentally skipping the project root `.env`.** Use `--project-directory <project-root>` or run from the project root, and record the env-file status in the deploy report.
- **Dumping `docker compose config` to logs.** Full config output can include resolved secret values. Use `docker compose config --quiet` for validation.
- **Creating or editing `.env` to make deploy pass.** Env files are operator-owned. Halt with `NEEDS_CONTEXT` and list missing file/key names without values.
- **`sleep 30` instead of a health-check loop.** Times out cleanly; produces flaky deploys when services are slow to start. Always poll readiness, never sleep blind.
- **Reporting only the chosen FE port and leaving the operator to discover the API port.** Both go in the deploy report. The operator opens one tab and hits the FE; QA-Exec opens many tabs and hits the API.
- **Forgetting to bring volumes down between dispatches.** A `down` without `-v` keeps the Postgres data — fine for some tests, broken for others. Document the recovery command in the deploy report so the operator can reset state without asking.

## Hard rules

- **Always detect host architecture + match deliberately.** Run Step 1.5 at deploy start. Pass `--platform=$target_platform` to docker compose / build / run. When a service in the compose file pins `linux/amd64` and the host is `linux/arm64` (or vice-versa), surface an `emulation_warning` in the deploy report. Never silently emulate.
- **Always run env-file discovery and validation before deployment.** Step 2.5 is mandatory. Do not deploy until compose env readiness is recorded in the deploy report.
- **Never read, print, copy, create, or edit operator-owned `.env*` values.** Read only allowlisted templates (`.env.example`, `.env.template`, `.env.sample`). Missing required env files or keys are `NEEDS_CONTEXT` for the operator, not something DevOps silently patches.
- **Never run full `docker compose config` in a way that prints resolved secrets.** Use `config --quiet` and record pass/fail only.
- **Never hardcode port 3000 (or any single port) in deploy logic.** Always probe. Always log the chosen port in the deploy report.
- **Never edit the project's `docker-compose.yml` directly.** Generate `docker-compose.override.yml` in your worktree.
- **Health checks must be green** before the deploy is declared successful. `--wait` flag or explicit polling loop; never blind `sleep`.
- **Both deploy-report sections (`## Test Environment` + `## Human Trial URLs`) are mandatory** for tasks with a UI surface. Backend-only tasks may omit Human Trial URLs (no UI to trial); the deploy report still names the API healthcheck URL the operator can `curl`.
- **Tear-down command is mandatory** in the deploy report. The operator and QA-Exec both need a single command to reset state.
- **Never start the environment with Docker images pulled from untrusted registries.** Use the project's pinned image tags or build from the project's Dockerfile.

## References

- [`.claude/agents/_templates/devops.md`](../../agents/_templates/devops.md) — dispatching role + deploy-report schema this skill produces.
- [`.claude/skills/qa-execution-runner/`](../qa-execution-runner/SKILL.md) — consumer of the `## Test Environment` block.
- [`.claude/skills/solution-defaults/references/defaults-table.md`](../solution-defaults/references/defaults-table.md) — org-level dependency defaults (port preferences may live here per project).
- [`docs/architecture.md`](../../../docs/architecture.md) §2 Containers — names every service the deploy must bring up.
- [`docs/deploy-reports/<task-id>.md`](../../../docs/deploy-reports/) — the deploy report this skill populates.
