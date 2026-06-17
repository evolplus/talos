# `.gitignore` Template

Baseline `.gitignore` for any repo using this kit. Organized by category with rationale. Drop the contents of the code-fenced block at the bottom into your repo's `.gitignore`; per-stack additions go below the baseline.

## Why each category matters

### Secrets (must-exclude)

- `.env*` (with allowlist for `.env.example` / `.env.template` / `.env.sample`) — env files routinely contain API keys, DB credentials, signing secrets. Committing them = credential rotation incident.
- `*.pem`, `*.key`, `*.p12`, `*.pfx` — private keys for TLS, JWT signing, code signing. Committing = key rotation incident.
- `id_rsa*`, `id_ed25519*`, `id_ecdsa*` — SSH private keys. Should never be in any repo, ever.
- `*.crt`, `*.cer` — public certificates are generally safe but accumulate noise and confuse "is this committed by accident?" reviews. Exclude unless explicitly required.

### Local environment artifacts (must-exclude)

- `node_modules/`, `.venv/`, `venv/`, `.tox/` — reconstructable from lock files. Committing = repo bloat + slow clone + license-attribution mess.
- `__pycache__/`, `*.pyc`, `*.pyo` — Python bytecode caches. Regenerated on import.
- `.cache/`, `.parcel-cache/`, `.next/cache/` — tool caches.

### Build artifacts (must-exclude)

- `dist/`, `build/`, `target/`, `bin/`, `out/` — outputs of the build. Reconstructable from source.
- `*.log` — application logs. Often contain PII or transient debug state; never durable artifacts.
- `*.exe`, `*.dll`, `*.so`, `*.dylib`, `*.class` (Java) — compiled binaries. Reconstructable.

### IDE / editor artifacts

- `.vscode/`, `.idea/` — IDE-specific settings. Sometimes useful to share (commit a `.vscode/settings.json` if the team agrees on a baseline); usually local clutter. Default: exclude.
- `*.swp`, `*.swo`, `*~` (vim), `.#*` (emacs) — editor temp files.

### OS files

- `.DS_Store` (macOS) — Finder metadata. Always noise.
- `Thumbs.db`, `desktop.ini` (Windows) — same idea.
- `.directory` (KDE) — same.

### Kit staging files (this kit's specific need)

- `*.tmp` — the kit's awk staging files (we generate these during file edits and bash can't always delete them from the session sandbox).
- `CLAUDE.md.*.tmp` — specific staging pattern for root-level edits.
- `plan-proposal/` — TL's proposal tree lives in TL's worktree and is ingested into `docs/plan/` by the Orchestrator. It is **never git-merged to main**; if it ever does land at project root, that's a kit bug or an orchestrator-cleanup miss. Belt-and-suspenders against accidental commits.
- `plan-update*.json` — Transient handoff artifact emitted by sub-agents in their worktree (`.worktrees/<role>-<task-id>/plan-update.json`). The Orchestrator ingests its content into `docs/plan/` then cleans up the worktree per `.claude/rules/worktree-isolation.md` §5. Root-level stragglers are leakage; the `plan-update-location-guard.cjs` hook refuses new writes outside `.worktrees/`, and Orchestrator §9 Step 0.5 sweeps existing ones on every invocation. Gitignore is belt-and-suspenders against historical commits.

### Allowlist (always committable)

- `.env.example`, `.env.template`, `.env.sample` — documents required env keys without leaking values.
- Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, `composer.lock`) — reproducibility depends on these.
- `.gitkeep` — convention for committing empty directories.

## Baseline `.gitignore`

```gitignore
# ----- Secrets (NEVER commit) -----
.env
.env.*
!.env.example
!.env.template
!.env.sample
*.pem
*.key
*.p12
*.pfx
id_rsa*
id_ed25519*
id_ecdsa*
id_dsa*
.netrc
.ssh/
.aws/credentials
.config/gcloud/
.kube/config
*.crt
*.cer

# ----- Local environments -----
node_modules/
.venv/
venv/
ENV/
.tox/
.virtualenv/
__pycache__/
*.pyc
*.pyo
*.pyd
.cache/
.parcel-cache/
.next/cache/
.nuxt/
.turbo/

# ----- Build artifacts -----
dist/
build/
target/
bin/
out/
*.log
*.exe
*.dll
*.so
*.dylib
*.class
*.jar      # comment out if the project ships JARs
*.war

# ----- Coverage / test output -----
coverage/
.coverage
htmlcov/
.nyc_output/
junit.xml
test-results/

# ----- IDE / editor -----
.vscode/
.idea/
*.iml
*.swp
*.swo
*~
.#*
.\#*
*.sublime-workspace

# ----- OS -----
.DS_Store
Thumbs.db
desktop.ini
.directory

# ----- Kit staging (this kit's specific need) -----
*.tmp
CLAUDE.md.*.tmp
plan-proposal/         # TL's transient proposal tree — ingested into docs/plan/, never git-merged

# ----- Allowlist (force-include) -----
!.gitkeep
```

## Verifying the `.gitignore` works

```sh
# Test what's currently ignored:
git status --ignored

# Test a specific file (returns the rule that would ignore it, or nothing):
git check-ignore -v path/to/file

# Confirm a sensitive-looking path is ignored:
git check-ignore -v .env.local
# expected: .gitignore:N:.env.*	.env.local
```

## When the baseline isn't enough

If your project has stack-specific or product-specific exclusions (Unity caches, Xcode `.xcuserdata`, AndroidManifest signing config, etc.), add a section below the baseline marked with a header like:

```gitignore
# ----- Webshop (Next.js) -----
.next/
out/
```

Don't replace the baseline — add to it. The baseline encodes hard-won lessons about secrets and reproducibility that apply regardless of stack.

For per-stack templates beyond the baseline, gitignore.io is a useful starting point (https://www.toptal.com/developers/gitignore), but treat its output as a suggestion to merge in, not a replacement for this baseline.

## Already-committed sensitive files

If a secret has already been committed:

1. **Rotate the secret immediately** — assume it is compromised. Commits are mirrored, cached, indexed, scraped. Removing the file from `HEAD` does not undo the leak.
2. Remove the file from `HEAD` (`git rm --cached <file>` + commit).
3. Add the file to `.gitignore`.
4. Scrub history if the repo has not been widely shared yet — `git filter-repo` or `BFG Repo-Cleaner`. Document the scrub in the open-issues log.
5. If the repo has been pushed to a shared remote, rotation is the only real defense; history scrubbing helps but does not retroactively unleak.

The privacy-check hook (`.claude/hooks/privacy-check.cjs`) refuses reads against secret patterns at runtime — that's the prevention layer. The `.gitignore` is the static defense layer that catches what the hook misses (e.g., a file added via shell outside Claude's tool surface).
