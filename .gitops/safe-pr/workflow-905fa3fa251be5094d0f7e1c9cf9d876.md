# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-f4a91768b3f40ab8186ab09ab86e7972`
- policy_decision_ref: `policy-decision:approval-f4a91768b3f40ab8186ab09ab86e7972:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `e8ad9ed9e13ec9d129e5be41df6aac1ec601e42a99c5898bdfd6d57b13d379f2`

## Approval

- approval_ref: `approval-f4a91768b3f40ab8186ab09ab86e7972`
- policy_decision_ref: `policy-decision:approval-f4a91768b3f40ab8186ab09ab86e7972:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
