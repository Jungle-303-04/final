# Apply sandbox manifest

service/game-room-4: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-e959dfd0661d6ee1f3b3e32a6744567f`
- policy_decision_ref: `policy-decision:approval-e959dfd0661d6ee1f3b3e32a6744567f:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:211ce75e3d67b69541153aa2bc42f1b043743443d9f3376647fcc55f8b448b9e`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `bfc38f80c4010bb9f24179f457ca997254bc949e8d11fcc78f13b829e4c1cfe6`

## Approval

- approval_ref: `approval-e959dfd0661d6ee1f3b3e32a6744567f`
- policy_decision_ref: `policy-decision:approval-e959dfd0661d6ee1f3b3e32a6744567f:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-4-base.yaml`: rollback manifest generated from live/previous values
