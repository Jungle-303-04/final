# Apply sandbox manifest

service/game-room-headless: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-23b294aff4e1e56f76e5dc9c56a04ad0`
- policy_decision_ref: `policy-decision:approval-23b294aff4e1e56f76e5dc9c56a04ad0:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:866514406745937727e059e187b2203fce33a2d4dd2d00cd01e93a3ad8f80af9`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-headless-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `d165500e18a9580fd94595e58d14be1366d5f67f9135283edd94aec00640ad2b`

## Approval

- approval_ref: `approval-23b294aff4e1e56f76e5dc9c56a04ad0`
- policy_decision_ref: `policy-decision:approval-23b294aff4e1e56f76e5dc9c56a04ad0:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-headless-base.yaml`: rollback manifest generated from live/previous values
