# Apply sandbox manifest

configmap/ops-policy: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-b0a0b2d02e53068c6fe2612f7dfdae83`
- policy_decision_ref: `policy-decision:approval-b0a0b2d02e53068c6fe2612f7dfdae83:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:d13fa488978bec673b368b664598fc04fc14431398722cb66faa7789e4fb7584`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/configmap-ops-policy-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `021b13f429d551f43c7b19ed15583d618b7a2625384c74f1fae10dfe0c97de67`

## Approval

- approval_ref: `approval-b0a0b2d02e53068c6fe2612f7dfdae83`
- policy_decision_ref: `policy-decision:approval-b0a0b2d02e53068c6fe2612f7dfdae83:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/configmap-ops-policy-base.yaml`: rollback manifest generated from live/previous values
