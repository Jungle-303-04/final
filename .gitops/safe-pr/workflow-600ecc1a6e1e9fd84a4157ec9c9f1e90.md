# Apply sandbox manifest

service/game-room-canary: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-6698259f3af90c4b8a84c98a44b3c729`
- policy_decision_ref: `policy-decision:approval-6698259f3af90c4b8a84c98a44b3c729:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:73dd5d33398cdd18f75d5063314f9ed201073448e417c57e9c0b94d153daaf20`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-canary-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `07cdd27b6757c919761329c816fb77cde41d29c39ef59b49405de0ca7a04177b`

## Approval

- approval_ref: `approval-6698259f3af90c4b8a84c98a44b3c729`
- policy_decision_ref: `policy-decision:approval-6698259f3af90c4b8a84c98a44b3c729:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-canary-base.yaml`: rollback manifest generated from live/previous values
