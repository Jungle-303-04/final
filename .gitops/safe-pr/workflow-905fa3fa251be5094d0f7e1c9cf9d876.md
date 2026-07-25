# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-d3a6720507371c12532f4f10f367e184`
- policy_decision_ref: `policy-decision:approval-d3a6720507371c12532f4f10f367e184:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `bf3a9228b24217a4e47e495ca2a45140d9141845e238688fb221b2957cc6b087`

## Approval

- approval_ref: `approval-d3a6720507371c12532f4f10f367e184`
- policy_decision_ref: `policy-decision:approval-d3a6720507371c12532f4f10f367e184:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
