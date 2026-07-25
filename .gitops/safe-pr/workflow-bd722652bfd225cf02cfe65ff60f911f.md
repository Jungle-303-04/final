# Apply sandbox manifest

service/game-room-1: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-e7c7ece36d03a50fa025aec427610f76`
- policy_decision_ref: `policy-decision:approval-e7c7ece36d03a50fa025aec427610f76:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:002bcabad75300a8915ab62b826e018bbad801b39e20b98bd9858101b0ac1184`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `8e39ce5eb3cd9c34ff0a490d15159670b07de722427098ccabfc883d6f951bad`

## Approval

- approval_ref: `approval-e7c7ece36d03a50fa025aec427610f76`
- policy_decision_ref: `policy-decision:approval-e7c7ece36d03a50fa025aec427610f76:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-1-base.yaml`: rollback manifest generated from live/previous values
