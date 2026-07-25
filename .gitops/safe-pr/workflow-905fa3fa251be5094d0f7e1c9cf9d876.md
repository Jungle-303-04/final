# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-ea28f74d747c47497d30d3a607eff488`
- policy_decision_ref: `policy-decision:approval-ea28f74d747c47497d30d3a607eff488:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `a060b7146a47ef1ecd472a67fde2899c4bf08dfe3d34f11f9282136a15c6994b`

## Approval

- approval_ref: `approval-ea28f74d747c47497d30d3a607eff488`
- policy_decision_ref: `policy-decision:approval-ea28f74d747c47497d30d3a607eff488:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
