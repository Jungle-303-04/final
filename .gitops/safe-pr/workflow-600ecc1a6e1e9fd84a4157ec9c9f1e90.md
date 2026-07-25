# Apply sandbox manifest

configmap/ops-policy: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-9e3c98117ff5d014f85e6214569dd170`
- policy_decision_ref: `policy-decision:approval-9e3c98117ff5d014f85e6214569dd170:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:d13fa488978bec673b368b664598fc04fc14431398722cb66faa7789e4fb7584`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/configmap-ops-policy-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `94aa58d2530a925a05f64005f39040e8d66365e2a37a23d5672865d3c25a0d81`

## Approval

- approval_ref: `approval-9e3c98117ff5d014f85e6214569dd170`
- policy_decision_ref: `policy-decision:approval-9e3c98117ff5d014f85e6214569dd170:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/configmap-ops-policy-base.yaml`: rollback manifest generated from live/previous values
