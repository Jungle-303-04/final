# Apply sandbox manifest

service/game-room-canary-bot: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-5bac6e8e5d1ae59aa9091456c410c0ea`
- policy_decision_ref: `policy-decision:approval-5bac6e8e5d1ae59aa9091456c410c0ea:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:f98d3e13870e552a919ad5ad34937007aa0d8a2684d3c837c2c01ee334233255`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-canary-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `1412fae6bfb645f0af152f9310ca63b3e15cf137557809831b392019a5b65a03`

## Approval

- approval_ref: `approval-5bac6e8e5d1ae59aa9091456c410c0ea`
- policy_decision_ref: `policy-decision:approval-5bac6e8e5d1ae59aa9091456c410c0ea:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-canary-bot-base.yaml`: rollback manifest generated from live/previous values
