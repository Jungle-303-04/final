# Apply sandbox manifest

service/session-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-b31641360a0118ce79c174bf3fa4d35b`
- policy_decision_ref: `policy-decision:approval-b31641360a0118ce79c174bf3fa4d35b:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:4492ba48c302227bd9867ce39b43c08450e82756500bf7889806ad2c14715ae8`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `b936786f4f6cbb50c9dcaf18bba9ff1c64efb4783a6894fb85b8267e102ec1a7`

## Approval

- approval_ref: `approval-b31641360a0118ce79c174bf3fa4d35b`
- policy_decision_ref: `policy-decision:approval-b31641360a0118ce79c174bf3fa4d35b:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-session-gateway-base.yaml`: rollback manifest generated from live/previous values
