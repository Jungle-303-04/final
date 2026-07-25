# Apply sandbox manifest

service/login-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-949072a791ddf953ca7d0e7720109259`
- policy_decision_ref: `policy-decision:approval-949072a791ddf953ca7d0e7720109259:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2c96ad5755759459b8cc7d593125e843506787578d850f29632dc010eb89455e`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/service-login-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `6e12cd4ba88c17ffe0f4d5d120c39d778a390b785a1fa902f864939a7af1add8`

## Approval

- approval_ref: `approval-949072a791ddf953ca7d0e7720109259`
- policy_decision_ref: `policy-decision:approval-949072a791ddf953ca7d0e7720109259:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/service-login-gateway-base.yaml`: rollback manifest generated from live/previous values
