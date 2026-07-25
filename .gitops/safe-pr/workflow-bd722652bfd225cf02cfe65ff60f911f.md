# Apply sandbox manifest

service/login-gateway-management: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-74a6744e771c312456146c0996380e12`
- policy_decision_ref: `policy-decision:approval-74a6744e771c312456146c0996380e12:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fa95c73135b5958cb5863d58f3927a15881dcdd9ee115d68284bd8d64e57d168`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-login-gateway-management-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `bf23ce0b2b1b6be0e0940ffa89f08bfdf1f7423784b6386112a522c7dc251fc3`

## Approval

- approval_ref: `approval-74a6744e771c312456146c0996380e12`
- policy_decision_ref: `policy-decision:approval-74a6744e771c312456146c0996380e12:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-login-gateway-management-base.yaml`: rollback manifest generated from live/previous values
