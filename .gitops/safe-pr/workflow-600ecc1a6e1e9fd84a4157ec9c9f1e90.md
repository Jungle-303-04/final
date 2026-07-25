# Apply sandbox manifest

service/login-gateway-management: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-1dd7a917e3c69e3f23cf3233ee6eec23`
- policy_decision_ref: `policy-decision:approval-1dd7a917e3c69e3f23cf3233ee6eec23:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fa95c73135b5958cb5863d58f3927a15881dcdd9ee115d68284bd8d64e57d168`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-login-gateway-management-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `ffab9b0c5b5e577cde2c80436c256bac4be3bc1757c6f88e5b7a5c082dbd02e7`

## Approval

- approval_ref: `approval-1dd7a917e3c69e3f23cf3233ee6eec23`
- policy_decision_ref: `policy-decision:approval-1dd7a917e3c69e3f23cf3233ee6eec23:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-login-gateway-management-base.yaml`: rollback manifest generated from live/previous values
