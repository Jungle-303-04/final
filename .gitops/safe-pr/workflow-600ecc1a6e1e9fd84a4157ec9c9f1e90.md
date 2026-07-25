# Apply sandbox manifest

service/cache: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-4da238ac9cd752d3c1c8fc70507f845a`
- policy_decision_ref: `policy-decision:approval-4da238ac9cd752d3c1c8fc70507f845a:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:7647669d112955dd3da076da0a0983d9e9ad198995760cceafe2126d548ee0c5`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-cache-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `cbdf37e4f4da3800431691a315503f8bcf7b4adf4003bdf6890dabaae550baa3`

## Approval

- approval_ref: `approval-4da238ac9cd752d3c1c8fc70507f845a`
- policy_decision_ref: `policy-decision:approval-4da238ac9cd752d3c1c8fc70507f845a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-cache-base.yaml`: rollback manifest generated from live/previous values
