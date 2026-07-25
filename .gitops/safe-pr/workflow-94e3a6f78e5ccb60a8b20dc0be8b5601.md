# Apply sandbox manifest

service/login-gateway-management: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-16720d7b5af67e76c850b6f7ef8cffea`
- policy_decision_ref: `policy-decision:approval-16720d7b5af67e76c850b6f7ef8cffea:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fa95c73135b5958cb5863d58f3927a15881dcdd9ee115d68284bd8d64e57d168`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-login-gateway-management-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `23ce59cb8bcb16c6e389f322409f15f3660fb17424621ec79acaa1baf044866e`

## Approval

- approval_ref: `approval-16720d7b5af67e76c850b6f7ef8cffea`
- policy_decision_ref: `policy-decision:approval-16720d7b5af67e76c850b6f7ef8cffea:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-login-gateway-management-base.yaml`: rollback manifest generated from live/previous values
