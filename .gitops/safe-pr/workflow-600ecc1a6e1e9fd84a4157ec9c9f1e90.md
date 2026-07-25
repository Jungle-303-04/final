# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-4b52b6a9e94b75b971fef164e141ec5f`
- policy_decision_ref: `policy-decision:approval-4b52b6a9e94b75b971fef164e141ec5f:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `6f1a4bb802e4bd0a76188411f2863c53f7c65f168a87b115e9ac7ab4b9267def`

## Approval

- approval_ref: `approval-4b52b6a9e94b75b971fef164e141ec5f`
- policy_decision_ref: `policy-decision:approval-4b52b6a9e94b75b971fef164e141ec5f:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
