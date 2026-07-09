---
name: ssh-remote-operations
description: Run DevOps remote operations through project-root SSH configuration. Use when DevOps must execute commands, install software or packages, inspect a remote host, stage release artifacts, or prepare a non-local server through `.ssh/config` without exposing private keys, SSH config contents, passwords, or environment secrets to the model.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# SSH Remote Operations

## When to use

Use this skill when a DevOps task targets a remote VM or bare server and the project provides SSH connection configuration under project-root `.ssh/`. The SSH files are operator-owned credential material: DevOps may reference them in commands, but must not read, summarize, copy, or print their contents.

## Inputs and outputs

- **Inputs:** task ID, target environment, approved SSH host alias, project-root `.ssh/config`, architecture/deploy docs, package/software requirements, and any human approval required for non-dev environments.
- **Outputs:** remote preflight evidence, command/package-change summary, health-check evidence, rollback notes, and `docs/deploy-reports/<task-id>.md` or `docs/devops/<task-id>/` artifacts with secrets redacted.

## Procedure

1. **Resolve the target host alias.** Use only a named host alias from project-root `.ssh/config`. Do not read `.ssh/config`; ask the operator for the alias if the task does not name it. Use `ssh -F .ssh/config <alias> <command>` for remote execution.
2. **Gate the target environment.** Local/dev/test servers may proceed when the task explicitly names the target. Staging requires task approval evidence. Production requires a human-approved change record, a dry-run or written execution plan, and rollback instructions before any mutation.
3. **Run a safe preflight.** Verify connectivity with a non-secret command such as `ssh -F .ssh/config <alias> 'printf "%s\n" ok; uname -s; uname -m; id -un'`. Do not run `env`, `printenv`, `set`, `cat ~/.ssh/*`, or commands that dump service credentials.
4. **Detect the remote OS before installing packages.** Read non-secret OS metadata (`/etc/os-release`, `uname`) and choose the native package manager. Use non-interactive flags and exact package names from the task or architecture docs. If `sudo` prompts for a password, stop with `NEEDS_CONTEXT`; never ask the model to handle passwords.
5. **Install only declared software.** Package installation is allowed only when the task explicitly requires it. Record package names and versions in the report. Do not run broad upgrades (`apt upgrade`, `yum update`, `brew upgrade`) unless the task is specifically an OS maintenance task with approval.
6. **Stage artifacts without copying secrets.** Use `scp -F .ssh/config` or `rsync -e 'ssh -F .ssh/config'` only for build artifacts, compose files, manifests, or generated release bundles. Never copy `.env*`, `.ssh/`, `.k8s/` kubeconfigs, private keys, registry credentials, or raw secret manifests.
7. **Make commands reproducible.** Prefer checked-in scripts or task-scoped scripts under `docs/devops/<task-id>/` for multi-step remote work. Remote one-liners should use `set -euo pipefail` when run through `bash -lc`.
8. **Capture redacted evidence.** Store command summaries, package changes, remote host alias, target environment, health-check URLs, and rollback commands. Do not store host private IPs, usernames, tokens, key paths beyond the alias/config path, or raw command output that contains secrets.

## Hard rules

- Never read or print project-root `.ssh/` files, private keys, `~/.ssh/`, passwords, agent sockets, or known-host material.
- Never run remote secret-dumping commands (`env`, `printenv`, `set`, `cat ~/.ssh/*`, `cat .env*`, `kubectl config view --raw`) through SSH.
- Never install packages on staging or production without explicit task approval and rollback notes.
- Never pipe unaudited network downloads into a shell on the remote host.
- Never put credentials, SSH config contents, private hostnames, or secret environment values into deploy reports.

## References

- [`../docker-deployment/SKILL.md`](../docker-deployment/SKILL.md) - combine with SSH for remote Docker or Compose deployment.
- [`../kubernetes-deployment/SKILL.md`](../kubernetes-deployment/SKILL.md) - use kubeconfig by reference only; do not read credentials.
- [`../../hooks/privacy-check.cjs`](../../hooks/privacy-check.cjs) - runtime credential-path guard.
