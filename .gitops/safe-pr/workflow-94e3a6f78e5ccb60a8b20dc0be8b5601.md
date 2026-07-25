# Apply sandbox manifest

service/cache: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-f9329f5b4d201ae3eb884e54fa721679`
- policy_decision_ref: `policy-decision:approval-f9329f5b4d201ae3eb884e54fa721679:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:7647669d112955dd3da076da0a0983d9e9ad198995760cceafe2126d548ee0c5`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-cache-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `f9da8ae1afa31672987f7c9103cca2d852527010df46a7a318b9a74925ea951f`

## Approval

- approval_ref: `approval-f9329f5b4d201ae3eb884e54fa721679`
- policy_decision_ref: `policy-decision:approval-f9329f5b4d201ae3eb884e54fa721679:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-cache-base.yaml`: rollback manifest generated from live/previous values
