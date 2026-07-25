# Apply sandbox manifest

service/game-room-metrics: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-72f8f66cd56c41fc136780f31e97b4c3`
- policy_decision_ref: `policy-decision:approval-72f8f66cd56c41fc136780f31e97b4c3:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9165d969d534a6430631ed828f4f2efe601997b583fdb0ce07e10691264b53b0`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-metrics-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `7c91814df1d140ad6c161178b80121ce70df5cef74cba980e58472e1e79f500a`

## Approval

- approval_ref: `approval-72f8f66cd56c41fc136780f31e97b4c3`
- policy_decision_ref: `policy-decision:approval-72f8f66cd56c41fc136780f31e97b4c3:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-metrics-base.yaml`: rollback manifest generated from live/previous values
