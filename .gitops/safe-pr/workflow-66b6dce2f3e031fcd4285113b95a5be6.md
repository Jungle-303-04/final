# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-b6ab6a13be1165cb96898965f078ae21`
- policy_decision_ref: `policy-decision:approval-b6ab6a13be1165cb96898965f078ae21:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `03d35e34c9a346ba66ea7eb109eb7c4e52049242dd02130f2bd9fcf7c5292e13`

## Approval

- approval_ref: `approval-b6ab6a13be1165cb96898965f078ae21`
- policy_decision_ref: `policy-decision:approval-b6ab6a13be1165cb96898965f078ae21:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
