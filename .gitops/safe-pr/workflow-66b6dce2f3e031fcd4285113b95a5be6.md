# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-7310a05c0e4d48d79e0f1c60f39382f7`
- policy_decision_ref: `policy-decision:approval-7310a05c0e4d48d79e0f1c60f39382f7:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `d4bf202b36c3b92b51e23e2b73b87de83d08c58249556c2796923b1ba75209a1`

## Approval

- approval_ref: `approval-7310a05c0e4d48d79e0f1c60f39382f7`
- policy_decision_ref: `policy-decision:approval-7310a05c0e4d48d79e0f1c60f39382f7:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
