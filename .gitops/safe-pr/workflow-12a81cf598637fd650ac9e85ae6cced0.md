# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-045c8fc799f1f4cd68e749a2c16b0609`
- policy_decision_ref: `policy-decision:approval-045c8fc799f1f4cd68e749a2c16b0609:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `09272672301edad21219dc330266d7bf42e253323a64f7f558de723e81137d08`

## Approval

- approval_ref: `approval-045c8fc799f1f4cd68e749a2c16b0609`
- policy_decision_ref: `policy-decision:approval-045c8fc799f1f4cd68e749a2c16b0609:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
