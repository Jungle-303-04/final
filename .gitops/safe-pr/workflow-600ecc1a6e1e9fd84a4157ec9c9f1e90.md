# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-417dcb2a97ef2b4ea692c62080a8721b`
- policy_decision_ref: `policy-decision:approval-417dcb2a97ef2b4ea692c62080a8721b:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `9e5dcdc5e4d2983005e84f599a5c1f67855cd494e7f3c44886282734db498301`

## Approval

- approval_ref: `approval-417dcb2a97ef2b4ea692c62080a8721b`
- policy_decision_ref: `policy-decision:approval-417dcb2a97ef2b4ea692c62080a8721b:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
