# Apply sandbox manifest

service/game-room-0: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-a7c417f13522931c0fbc84cec4828750`
- policy_decision_ref: `policy-decision:approval-a7c417f13522931c0fbc84cec4828750:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:e49f3c183cac3fa6b61766ceab5b3eaf819b9543e479ec425dfe742922663407`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `3a6f0642b23436264acdc72e99c917c32d05c10d42f2fb24badf816371d4a31f`

## Approval

- approval_ref: `approval-a7c417f13522931c0fbc84cec4828750`
- policy_decision_ref: `policy-decision:approval-a7c417f13522931c0fbc84cec4828750:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-0-base.yaml`: rollback manifest generated from live/previous values
