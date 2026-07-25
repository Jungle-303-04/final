# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-196c7a1c3cbb0436dfeb252f3b196cb2`
- policy_decision_ref: `policy-decision:approval-196c7a1c3cbb0436dfeb252f3b196cb2:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `35ceb80c3ad8fa8056cf2fb17c43564616214804c740d52bf3fb9395cb27a901`

## Approval

- approval_ref: `approval-196c7a1c3cbb0436dfeb252f3b196cb2`
- policy_decision_ref: `policy-decision:approval-196c7a1c3cbb0436dfeb252f3b196cb2:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
