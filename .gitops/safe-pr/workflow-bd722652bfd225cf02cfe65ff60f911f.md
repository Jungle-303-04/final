# Apply sandbox manifest

service/game-room-3: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-820bb40c2f40c2ce13b95c39777739f0`
- policy_decision_ref: `policy-decision:approval-820bb40c2f40c2ce13b95c39777739f0:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:ad9674a49e6c658bfec875713942e166edc563293ca5b6a339f603ff696d86fe`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `35013c281caeab7747c9db24a5f254b6a8b1b5e9d8902e5320979ea7a22bd4ae`

## Approval

- approval_ref: `approval-820bb40c2f40c2ce13b95c39777739f0`
- policy_decision_ref: `policy-decision:approval-820bb40c2f40c2ce13b95c39777739f0:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-3-base.yaml`: rollback manifest generated from live/previous values
