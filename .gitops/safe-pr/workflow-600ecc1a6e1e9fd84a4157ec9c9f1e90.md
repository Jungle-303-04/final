# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-fbaf8fc89e31228344afd0c150fd2aff`
- policy_decision_ref: `policy-decision:approval-fbaf8fc89e31228344afd0c150fd2aff:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `bab45db9857a71c8ce2a900f04a81c424bd5f51c4e6584af8325818cbba96798`

## Approval

- approval_ref: `approval-fbaf8fc89e31228344afd0c150fd2aff`
- policy_decision_ref: `policy-decision:approval-fbaf8fc89e31228344afd0c150fd2aff:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
