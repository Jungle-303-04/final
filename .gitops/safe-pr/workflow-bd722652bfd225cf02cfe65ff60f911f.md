# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-7fed2767876628ee4e3416e88a6cccfc`
- policy_decision_ref: `policy-decision:approval-7fed2767876628ee4e3416e88a6cccfc:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `4f8685801b530b718ffaae7dacb1a32f65493911fd35dd1ae56d67466fc83fe7`

## Approval

- approval_ref: `approval-7fed2767876628ee4e3416e88a6cccfc`
- policy_decision_ref: `policy-decision:approval-7fed2767876628ee4e3416e88a6cccfc:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
