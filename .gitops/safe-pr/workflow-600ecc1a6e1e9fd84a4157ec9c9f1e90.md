# Apply sandbox manifest

service/game-room-4: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-b8b3f493a5bfa0055f36468cec109750`
- policy_decision_ref: `policy-decision:approval-b8b3f493a5bfa0055f36468cec109750:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:211ce75e3d67b69541153aa2bc42f1b043743443d9f3376647fcc55f8b448b9e`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `1d1e3077bdf1f1fdec82a4da2e9981aa345e4a1abb3642db24b36207d076579d`

## Approval

- approval_ref: `approval-b8b3f493a5bfa0055f36468cec109750`
- policy_decision_ref: `policy-decision:approval-b8b3f493a5bfa0055f36468cec109750:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-4-base.yaml`: rollback manifest generated from live/previous values
