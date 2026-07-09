---
name: secrets-config-audit
description: Audit secret and runtime configuration readiness without exposing values. Use when DevOps must verify required env vars, config maps, secret injection, rotation status, registry/cloud credentials, SSH/Kubernetes credential references, safe templates, and redacted deploy-report config evidence.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Secrets Config Audit

## When to use

Use this skill before any deployment that depends on runtime configuration, secrets, environment files, registry credentials, cloud credentials, SSH, Kubernetes, or external service keys.

## Inputs and outputs

- **Inputs:** SRS environment contract, architecture config section, safe env templates, deploy mechanism, secret manager references, target environment, and required service integrations.
- **Outputs:** redacted config readiness verdict, missing key names, unsafe storage findings, rotation/owner notes, and deploy-report config fields.

## Procedure

1. **Collect declared keys.** Read SRS/architecture config contracts and safe templates (`.env.example`, `.env.template`, `.env.sample`) for key names, owners, required environments, and secret classification.
2. **Detect secret-bearing files by status only.** Check presence/path of `.env*`, `.ssh/`, `.k8s/*config*`, `.docker/config.json`, kubeconfigs, and credential files without reading contents.
3. **Verify injection path.** Confirm each secret has a source: secret manager, Kubernetes Secret/ExternalSecret, CI/CD variable, operator-managed env file, or documented runtime injection.
4. **Check non-secret config.** Verify public endpoints, feature flags, regions, log levels, and build/runtime config are represented in templates and deployment manifests.
5. **Look for unsafe patterns.** Flag secrets in committed manifests, plain values in docs, full `docker compose config` output, kubeconfig dumps, copied `.env`, or hardcoded credentials.
6. **Assess rotation/ownership.** Record owner and rotation expectation by secret name or category only. Do not ask the model to inspect values or token ages unless metadata is available without secrets.
7. **Emit verdict.** `pass`, `pass-with-warnings`, or `blocked`.

## Hard rules

- Never read, print, copy, summarize, or diff secret values.
- Never run commands that dump credential material, including full `docker compose config`, `kubectl config view --raw`, `env`, or `printenv` on remote hosts.
- Never create `.env*` or credential files for the operator.
- Never mark config ready when required key names are missing from templates/contracts or injection paths are unknown.
- Never place secret values in deploy reports; use key names and status only.

## References

- [`../local-deployment/SKILL.md`](../local-deployment/SKILL.md) - env-file discovery model.
- [`../ssh-remote-operations/SKILL.md`](../ssh-remote-operations/SKILL.md) - SSH credential handling.
- [`../kubernetes-deployment/SKILL.md`](../kubernetes-deployment/SKILL.md) - kubeconfig/Secret handling.
- [`../../hooks/privacy-check.cjs`](../../hooks/privacy-check.cjs) - runtime sensitive-path guard.
