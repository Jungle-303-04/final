# Apply sandbox manifest

deployment/game-room-3: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-df61f367adc182127de168aca1e9150c`
- policy_decision_ref: `policy-decision:approval-df61f367adc182127de168aca1e9150c:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:df52eef78a3f398547e29405bc1f2858ee7dbfe1d0cafcb3fb65f0ceaca4e8b4`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `f5a121229f10987ed1472d882b7229bb02510470fbe9056ded6a54972eaf5d84`

## Approval

- approval_ref: `approval-df61f367adc182127de168aca1e9150c`
- policy_decision_ref: `policy-decision:approval-df61f367adc182127de168aca1e9150c:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-3-base.yaml`: rollback manifest generated from live/previous values
