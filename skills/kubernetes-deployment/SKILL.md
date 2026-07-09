---
name: kubernetes-deployment
description: Deploy services to a Kubernetes cluster for DevOps tasks. Use when manifests, Kustomize overlays, Helm charts, namespaces, rollout status, kubectl, or kubeconfig under project-root `.k8s/` are involved, while preventing kubeconfig tokens, client keys, Secret manifests, and cluster credentials from entering model context.
agents: [devops]
sdlc_phase: deploy
owner: Platform Eng
status: active
---

# Kubernetes Deployment

## When to use

Use this skill when a DevOps task deploys or verifies services on a Kubernetes cluster. Project-root `.k8s/` may contain manifests, overlays, or kubeconfig files. Kubeconfig and Secret material are operator-owned credentials: DevOps may reference them in `kubectl` or `helm` commands, but must not read, summarize, copy, or print their contents.

## Inputs and outputs

- **Inputs:** task ID, target environment, cluster/context/namespace, approved kubeconfig path or context, manifest/Kustomize/Helm path, image tag, environment contract, rollout and rollback expectations.
- **Outputs:** dry-run/diff evidence, applied resource summary, rollout status, service endpoint/health evidence, rollback command, and `docs/deploy-reports/<task-id>.md` with credential material redacted.

## Procedure

1. **Resolve cluster, namespace, and kubeconfig by reference.** Use explicit `--kubeconfig <path>` and `--namespace <name>` or an approved context from the task. Do not rely on an implicit current context. Do not run `kubectl config view`, especially with `--raw`.
2. **Separate manifests from secrets.** It is safe to read ordinary Deployment, Service, Ingress, ConfigMap, HPA, and Kustomize/Helm metadata. Do not read kubeconfig files, Kubernetes Secret manifests, sealed-secret private keys, service-account tokens, or files whose path implies secret material.
3. **Validate before mutation.** Run schema or server dry-run validation first:

   ```bash
   kubectl --kubeconfig .k8s/<config> --namespace <ns> apply --dry-run=server -f <manifest-or-overlay>
   kubectl --kubeconfig .k8s/<config> --namespace <ns> diff -f <manifest-or-overlay>
   ```

   If diff output contains secret values, stop and rerun with safer tooling or ask the operator for a redacted plan.
4. **Use explicit image and config inputs.** Apply manifests or Helm values that reference immutable image tags/digests. Non-secret ConfigMaps may be reviewed. Secrets must come from the cluster's approved secret manager, ExternalSecret, sealed-secret public workflow, or operator-managed injection path.
5. **Deploy with bounded blast radius.** Apply only the task-scoped namespace/resources. Avoid cluster-wide operations unless the task is explicitly a platform task with approval. Never run `kubectl delete` against broad selectors without a reviewed manifest list.
6. **Watch rollouts.** Use `kubectl rollout status deployment/<name> --timeout=<n>s`, pod readiness, service endpoints, and application health checks. Capture only resource names, statuses, events, and sanitized logs.
7. **Prepare rollback.** Record `kubectl rollout undo`, Helm rollback revision, or re-apply previous manifest/tag. For database migrations or irreversible changes, route back to SA/TL before production deployment.
8. **Write the deploy report.** Include cluster alias/context name, namespace, manifest path, image tag/digest, validation/diff result, rollout status, health evidence, and rollback command. Never include kubeconfig contents, tokens, cert data, or Secret values.

## Helm and Kustomize

- For Helm, prefer `helm upgrade --install --atomic --timeout <n> --namespace <ns> --kubeconfig .k8s/<config> ...` after `helm template` or `helm diff` where available. Do not print full values files if they contain secrets.
- For Kustomize, prefer `kubectl apply -k <overlay>` with explicit kubeconfig and namespace. Keep secret generators out of model-readable paths unless they generate from non-secret literals only.

## Hard rules

- Never read or print kubeconfig files, `.k8s/*config*`, `.kube/config`, service-account tokens, client key data, or Kubernetes Secret manifests.
- Never run `kubectl config view --raw` or paste kubeconfig output into an artifact.
- Never deploy to production without explicit human approval, a dry-run/diff plan, and rollback notes.
- Never rely on implicit current context or namespace.
- Never put Secret values, tokens, cert data, or private registry credentials into deploy reports.
- Never mark deploy successful until rollout and application health checks pass.

## References

- [`../ssh-remote-operations/SKILL.md`](../ssh-remote-operations/SKILL.md) - remote cluster admin host access when kubectl runs through SSH.
- [`../../hooks/privacy-check.cjs`](../../hooks/privacy-check.cjs) - path-level guard for kubeconfig and secret material.
- [`../../agents/_templates/devops.md`](../../agents/_templates/devops.md) - DevOps role contract and deploy-report schema.
