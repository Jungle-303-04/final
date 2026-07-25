# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-ca3eb345b57302bb98ac0684f7641d56`
- policy_decision_ref: `policy-decision:approval-ca3eb345b57302bb98ac0684f7641d56:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `4b1cf37481843b1a8667f484ecc9309e1150b24b525aa61a197d4e23b0daca24`

## Approval

- approval_ref: `approval-ca3eb345b57302bb98ac0684f7641d56`
- policy_decision_ref: `policy-decision:approval-ca3eb345b57302bb98ac0684f7641d56:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
