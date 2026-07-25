# Apply sandbox manifest

service/game-room-1: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-ec38738c616724efdcbdda785516d637`
- policy_decision_ref: `policy-decision:approval-ec38738c616724efdcbdda785516d637:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:002bcabad75300a8915ab62b826e018bbad801b39e20b98bd9858101b0ac1184`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `b9c3a742315259d60575ff4285297684217d9f4128757113a9a9841024494c35`

## Approval

- approval_ref: `approval-ec38738c616724efdcbdda785516d637`
- policy_decision_ref: `policy-decision:approval-ec38738c616724efdcbdda785516d637:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-1-base.yaml`: rollback manifest generated from live/previous values
