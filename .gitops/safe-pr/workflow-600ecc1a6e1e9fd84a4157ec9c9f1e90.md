# Apply sandbox manifest

service/login-gateway-api: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-bcf55633602043d60baf97b95eabccf8`
- policy_decision_ref: `policy-decision:approval-bcf55633602043d60baf97b95eabccf8:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:dfaac4755b0810331e3a96e059cb744205fc6707042ac7e0fc67a29eee0e2aee`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-login-gateway-api-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `f66b682e4dc4abce71f5018538c2292a354107ceba6ff34c563c6fa6b1c7f357`

## Approval

- approval_ref: `approval-bcf55633602043d60baf97b95eabccf8`
- policy_decision_ref: `policy-decision:approval-bcf55633602043d60baf97b95eabccf8:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-login-gateway-api-base.yaml`: rollback manifest generated from live/previous values
