# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-f14e6865279646391dd2930cac109081`
- policy_decision_ref: `policy-decision:approval-f14e6865279646391dd2930cac109081:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `fc52a748e5f46bd31aa2244415e5c20c0d8d60b82df4563d2f6e155adf7fe11f`

## Approval

- approval_ref: `approval-f14e6865279646391dd2930cac109081`
- policy_decision_ref: `policy-decision:approval-f14e6865279646391dd2930cac109081:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
