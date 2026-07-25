# Apply sandbox manifest

service/login-gateway-api: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-a265347dbd959513ac2bebae3405b949`
- policy_decision_ref: `policy-decision:approval-a265347dbd959513ac2bebae3405b949:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:dfaac4755b0810331e3a96e059cb744205fc6707042ac7e0fc67a29eee0e2aee`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-login-gateway-api-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `235d3c4f72d1080223b2936ca50ce1217491901fe8893be59e7274f05210b754`

## Approval

- approval_ref: `approval-a265347dbd959513ac2bebae3405b949`
- policy_decision_ref: `policy-decision:approval-a265347dbd959513ac2bebae3405b949:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-login-gateway-api-base.yaml`: rollback manifest generated from live/previous values
