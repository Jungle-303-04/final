# Apply sandbox manifest

configmap/ops-policy: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-301efc819827fcdcbc8dc44720fc175a`
- policy_decision_ref: `policy-decision:approval-301efc819827fcdcbc8dc44720fc175a:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:d13fa488978bec673b368b664598fc04fc14431398722cb66faa7789e4fb7584`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/configmap-ops-policy-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `2ac4861b6dd577df5ac22de710e5910d010b7eeac6e5aa34479e988a8a5883f5`

## Approval

- approval_ref: `approval-301efc819827fcdcbc8dc44720fc175a`
- policy_decision_ref: `policy-decision:approval-301efc819827fcdcbc8dc44720fc175a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/configmap-ops-policy-base.yaml`: rollback manifest generated from live/previous values
