# Apply sandbox manifest

deployment/api-server: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-efb1abf184d1154eda9af888fadb8e06`
- policy_decision_ref: `policy-decision:approval-efb1abf184d1154eda9af888fadb8e06:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:38589d55dbfc39728d6792f388986b6ee3a767d75a54a8db15dd4902da374b21`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-api-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `3a424f5d309cfa810ddce5a91628d3cfd7f689800b8e1f21522ce4b370e7f178`

## Approval

- approval_ref: `approval-efb1abf184d1154eda9af888fadb8e06`
- policy_decision_ref: `policy-decision:approval-efb1abf184d1154eda9af888fadb8e06:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-api-server-base.yaml`: rollback manifest generated from live/previous values
