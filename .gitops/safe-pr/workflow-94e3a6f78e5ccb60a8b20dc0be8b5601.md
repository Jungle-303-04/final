# Apply sandbox manifest

deployment/game-room-3: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-74f3e44ac65f3c78d769b3686ed47395`
- policy_decision_ref: `policy-decision:approval-74f3e44ac65f3c78d769b3686ed47395:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:df52eef78a3f398547e29405bc1f2858ee7dbfe1d0cafcb3fb65f0ceaca4e8b4`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `c7fbf7c3f46618b18f5615e675f7d956c5e22d06bbb60565f3a3d821b4f73a36`

## Approval

- approval_ref: `approval-74f3e44ac65f3c78d769b3686ed47395`
- policy_decision_ref: `policy-decision:approval-74f3e44ac65f3c78d769b3686ed47395:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-3-base.yaml`: rollback manifest generated from live/previous values
