# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-a949662457cddc07397de13c237f26f6`
- policy_decision_ref: `policy-decision:approval-a949662457cddc07397de13c237f26f6:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `2e4a553638f67e1f0678e261ad382ef3de5b27a737d3e6e4916f30a3f5472d44`

## Approval

- approval_ref: `approval-a949662457cddc07397de13c237f26f6`
- policy_decision_ref: `policy-decision:approval-a949662457cddc07397de13c237f26f6:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
