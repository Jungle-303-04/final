# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-e81f20eec9e3d12f9f990fc8e187ded5`
- policy_decision_ref: `policy-decision:approval-e81f20eec9e3d12f9f990fc8e187ded5:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `4f1819b5eac5b833d2b130e5f9952452f4b203f6ade588a614ddfc2fa155d401`

## Approval

- approval_ref: `approval-e81f20eec9e3d12f9f990fc8e187ded5`
- policy_decision_ref: `policy-decision:approval-e81f20eec9e3d12f9f990fc8e187ded5:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
