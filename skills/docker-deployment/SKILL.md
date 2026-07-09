---
name: docker-deployment
description: Deploy Dockerfile or docker-compose based services for DevOps tasks. Use for local Docker deploys, remote Docker hosts reached through ssh-remote-operations, image build/pull/tag checks, docker compose release directories, health checks, rollback notes, and deploy reports while keeping `.env`, registry credentials, SSH credentials, and compose-resolved secrets out of model context.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Docker Deployment

## When to use

Use this skill when a DevOps task deploys a Dockerfile, a Docker image, or a Docker Compose stack. For the existing local QA environment flow, keep using `local-deployment`; use this skill when the task is broader than local QA, especially remote servers, staging-like hosts, image promotion, or compose-based releases.

## Inputs and outputs

- **Inputs:** task ID, target environment, Dockerfile or compose path, image tag or build source, environment contract, safe env templates, target host or SSH alias for remote deploys, and rollback expectation.
- **Outputs:** built or pulled image evidence, compose validation result, running service health checks, rollback command, and `docs/deploy-reports/<task-id>.md` with redacted environment evidence.

## Procedure

1. **Classify the target.** If the target is local QA, follow `local-deployment`. If the target is a remote VM or server, first follow `ssh-remote-operations` for connectivity, approval, and remote command discipline. If the target is Kubernetes, use `kubernetes-deployment` instead.
2. **Find project-owned Docker assets.** Use the task and architecture docs to identify `Dockerfile`, `compose.yml`, `docker-compose.yml`, or project-owned files under `infra/` or `deploy/`. Do not create a new reusable infra layout unless the task explicitly asks for it.
3. **Validate environment inputs without secrets.** Read safe templates (`.env.example`, `.env.template`, `.env.sample`) for key names only. Detect `.env*` presence by path/status only. Use `docker compose config --quiet`; never print full `docker compose config` because it can expand secrets.
4. **Use deterministic image references.** Prefer immutable tags or digests. If building from a Dockerfile, record source commit, build target, platform, and final image tag. Do not deploy `latest` to a non-dev environment unless the architecture explicitly allows it.
5. **Scope Compose mutations.** Always pass `-p <project-slug>` for compose mutations. Use a project-specific release directory on remote hosts, for example `/opt/<project-slug>/releases/<task-id-or-version>`. Never run global prune commands.
6. **Deploy with a reversible sequence.** Pull/build, validate config, start/update services, wait for health checks, then capture logs only when needed and with redaction. Keep the previous image tag or release directory available for rollback.
7. **Health-check the actual surface.** Use declared HTTP health endpoints, container health status, or application smoke probes. "Container is running" is not enough.
8. **Write the deploy report.** Include target environment, host alias (not credentials), compose files, image references, platform, env-file status, health-check results, rollback command, and known limitations. Use names/statuses only for secret-bearing files.

## Remote Docker pattern

Use SSH by reference:

```bash
ssh -F .ssh/config <host-alias> 'docker version'
ssh -F .ssh/config <host-alias> 'docker compose -p <project-slug> -f /opt/<project-slug>/current/compose.yml config --quiet'
ssh -F .ssh/config <host-alias> 'docker compose -p <project-slug> -f /opt/<project-slug>/current/compose.yml up -d --wait'
```

Do not inline private keys, passwords, registry tokens, or env values. If the remote host lacks Docker, install it only through `ssh-remote-operations` and only when the task approves software installation.

## Hard rules

- Never read, print, copy, or create `.env*` secret files. Safe templates are the only env files DevOps may read.
- Never run full `docker compose config` in model-visible output; use `config --quiet`.
- Never deploy unpinned images to staging or production unless an approved project policy allows it.
- Never run `docker system prune`, `docker volume prune`, or cross-project container cleanup on local or remote hosts.
- Never copy SSH, Kubernetes, registry, or cloud credentials as part of Docker artifact staging.
- Never declare success until health checks pass and rollback instructions are recorded.

## References

- [`../local-deployment/SKILL.md`](../local-deployment/SKILL.md) - local QA environment composition.
- [`../ssh-remote-operations/SKILL.md`](../ssh-remote-operations/SKILL.md) - remote command execution and package install rules.
- [`../../agents/_templates/devops.md`](../../agents/_templates/devops.md) - DevOps role contract and deploy-report schema.
