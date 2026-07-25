# Apply sandbox manifest

service/login-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-77c26cdc562f818acaaa6277105b710f`
- policy_decision_ref: `policy-decision:approval-77c26cdc562f818acaaa6277105b710f:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2c96ad5755759459b8cc7d593125e843506787578d850f29632dc010eb89455e`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/service-login-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `b01a37a81d1de0d0f26e100e0fac8c9800e4a5a0cd7dae06a32223e440efc4d7`

## Approval

- approval_ref: `approval-77c26cdc562f818acaaa6277105b710f`
- policy_decision_ref: `policy-decision:approval-77c26cdc562f818acaaa6277105b710f:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/service-login-gateway-base.yaml`: rollback manifest generated from live/previous values
