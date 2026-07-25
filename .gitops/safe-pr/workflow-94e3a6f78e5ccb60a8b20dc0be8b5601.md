# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-06be827f1edf4316d93d8283008daef5`
- policy_decision_ref: `policy-decision:approval-06be827f1edf4316d93d8283008daef5:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `9c6442d7f917d3c35640e26cefc1ae753c88e150e9bbd1fcb41c59f00b51de6e`

## Approval

- approval_ref: `approval-06be827f1edf4316d93d8283008daef5`
- policy_decision_ref: `policy-decision:approval-06be827f1edf4316d93d8283008daef5:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
