# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-57c7f216b7cfacdeaaf3e040af8ddda9`
- policy_decision_ref: `policy-decision:approval-57c7f216b7cfacdeaaf3e040af8ddda9:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `53482d9969c61954020832b0278a168c97edba48d77c96049c819f2514b8a8ab`

## Approval

- approval_ref: `approval-57c7f216b7cfacdeaaf3e040af8ddda9`
- policy_decision_ref: `policy-decision:approval-57c7f216b7cfacdeaaf3e040af8ddda9:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
