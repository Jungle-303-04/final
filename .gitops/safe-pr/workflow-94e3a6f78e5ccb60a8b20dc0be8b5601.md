# Apply sandbox manifest

service/game-room-canary: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-4a2e9bff4b14ac1af4ab77409f7a7411`
- policy_decision_ref: `policy-decision:approval-4a2e9bff4b14ac1af4ab77409f7a7411:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:73dd5d33398cdd18f75d5063314f9ed201073448e417c57e9c0b94d153daaf20`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-canary-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `10d8e7dcc678989a8a190c55798b04ffd2637b92a1bea4aa65ffcc844728eb0f`

## Approval

- approval_ref: `approval-4a2e9bff4b14ac1af4ab77409f7a7411`
- policy_decision_ref: `policy-decision:approval-4a2e9bff4b14ac1af4ab77409f7a7411:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-canary-base.yaml`: rollback manifest generated from live/previous values
