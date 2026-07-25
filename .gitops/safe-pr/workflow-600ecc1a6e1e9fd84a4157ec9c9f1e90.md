# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-7a32af20160781da752068378758c16a`
- policy_decision_ref: `policy-decision:approval-7a32af20160781da752068378758c16a:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `28534b971e17fea140540b8d42ae0270eef2d3a1ca225271052eb05adcec1e67`

## Approval

- approval_ref: `approval-7a32af20160781da752068378758c16a`
- policy_decision_ref: `policy-decision:approval-7a32af20160781da752068378758c16a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
