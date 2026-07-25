# Apply sandbox manifest

service/login-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-3e046138cc19a77298c9b6dd2cf2f924`
- policy_decision_ref: `policy-decision:approval-3e046138cc19a77298c9b6dd2cf2f924:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2c96ad5755759459b8cc7d593125e843506787578d850f29632dc010eb89455e`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/service-login-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `8778ec235d93fe7296d283572f3f2d11af8e327f0bfc461296713fc707b3f740`

## Approval

- approval_ref: `approval-3e046138cc19a77298c9b6dd2cf2f924`
- policy_decision_ref: `policy-decision:approval-3e046138cc19a77298c9b6dd2cf2f924:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/service-login-gateway-base.yaml`: rollback manifest generated from live/previous values
