# Apply sandbox manifest

service/cache: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-fddf9bb192c594a18f544ba571060371`
- policy_decision_ref: `policy-decision:approval-fddf9bb192c594a18f544ba571060371:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:7647669d112955dd3da076da0a0983d9e9ad198995760cceafe2126d548ee0c5`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-cache-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `8cf0598b6bad8261d75aa6c3db1abb379406b3a47ca7a532797dcd925ac25271`

## Approval

- approval_ref: `approval-fddf9bb192c594a18f544ba571060371`
- policy_decision_ref: `policy-decision:approval-fddf9bb192c594a18f544ba571060371:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-cache-base.yaml`: rollback manifest generated from live/previous values
