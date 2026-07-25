# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-8e1b03d7fbb668311550fcdefd3f7864`
- policy_decision_ref: `policy-decision:approval-8e1b03d7fbb668311550fcdefd3f7864:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `a8b9de9285e5028361072dff5dfcdd70a8758b3abe2302cb26e951f07739b23b`

## Approval

- approval_ref: `approval-8e1b03d7fbb668311550fcdefd3f7864`
- policy_decision_ref: `policy-decision:approval-8e1b03d7fbb668311550fcdefd3f7864:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
