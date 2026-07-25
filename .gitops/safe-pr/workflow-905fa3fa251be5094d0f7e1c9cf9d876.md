# Apply sandbox manifest

deployment/game-room-3: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-0558b21f19c7e73763c1acd87e4cb170`
- policy_decision_ref: `policy-decision:approval-0558b21f19c7e73763c1acd87e4cb170:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:df52eef78a3f398547e29405bc1f2858ee7dbfe1d0cafcb3fb65f0ceaca4e8b4`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `d414dff1ac8e38856558666a44e6a78cd0c9b2d6c898d2493caea3f867992627`

## Approval

- approval_ref: `approval-0558b21f19c7e73763c1acd87e4cb170`
- policy_decision_ref: `policy-decision:approval-0558b21f19c7e73763c1acd87e4cb170:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-3-base.yaml`: rollback manifest generated from live/previous values
