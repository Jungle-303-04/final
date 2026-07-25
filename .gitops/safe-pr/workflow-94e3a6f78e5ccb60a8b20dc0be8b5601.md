# Apply sandbox manifest

service/session-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-ac70c3adc6333ef0ae0f03a014771e46`
- policy_decision_ref: `policy-decision:approval-ac70c3adc6333ef0ae0f03a014771e46:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:4492ba48c302227bd9867ce39b43c08450e82756500bf7889806ad2c14715ae8`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `92e418a999e1053240209d9eba90d4fa36ce807d66425cd8b7086253e5fbdaa4`

## Approval

- approval_ref: `approval-ac70c3adc6333ef0ae0f03a014771e46`
- policy_decision_ref: `policy-decision:approval-ac70c3adc6333ef0ae0f03a014771e46:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-session-gateway-base.yaml`: rollback manifest generated from live/previous values
