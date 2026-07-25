# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-9e81f17bca2d5d770fad28b0a3d84eae`
- policy_decision_ref: `policy-decision:approval-9e81f17bca2d5d770fad28b0a3d84eae:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `fd8742f67544b8b5482d1904ab4e6cbd8b2c1d6d118d5e5c43f69b22a46859ce`

## Approval

- approval_ref: `approval-9e81f17bca2d5d770fad28b0a3d84eae`
- policy_decision_ref: `policy-decision:approval-9e81f17bca2d5d770fad28b0a3d84eae:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
