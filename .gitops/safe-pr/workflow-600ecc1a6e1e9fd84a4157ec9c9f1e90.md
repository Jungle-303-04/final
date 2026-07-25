# Apply sandbox manifest

service/game-room-3: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-a5602244eceb447f7523a552afa586bc`
- policy_decision_ref: `policy-decision:approval-a5602244eceb447f7523a552afa586bc:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:ad9674a49e6c658bfec875713942e166edc563293ca5b6a339f603ff696d86fe`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `c6805bc63e036fa6f83b46210adbe696b1bed6cece12eb2c13a791a352ecab2a`

## Approval

- approval_ref: `approval-a5602244eceb447f7523a552afa586bc`
- policy_decision_ref: `policy-decision:approval-a5602244eceb447f7523a552afa586bc:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-3-base.yaml`: rollback manifest generated from live/previous values
