# Apply sandbox manifest

service/game-room-0: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-695c1152f3a0927ab2955e24c9a564d0`
- policy_decision_ref: `policy-decision:approval-695c1152f3a0927ab2955e24c9a564d0:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:e49f3c183cac3fa6b61766ceab5b3eaf819b9543e479ec425dfe742922663407`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `dd72910796309414670369a4788a09d19c80d748ae49941cb99180f40be910a4`

## Approval

- approval_ref: `approval-695c1152f3a0927ab2955e24c9a564d0`
- policy_decision_ref: `policy-decision:approval-695c1152f3a0927ab2955e24c9a564d0:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-0-base.yaml`: rollback manifest generated from live/previous values
