# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-18bf5c475d39e94a35878a60685b0b95`
- policy_decision_ref: `policy-decision:approval-18bf5c475d39e94a35878a60685b0b95:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `527cdd7ffdad82686699ab767a125fe3c1729e95fe013f8e57f818bd405945aa`

## Approval

- approval_ref: `approval-18bf5c475d39e94a35878a60685b0b95`
- policy_decision_ref: `policy-decision:approval-18bf5c475d39e94a35878a60685b0b95:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
