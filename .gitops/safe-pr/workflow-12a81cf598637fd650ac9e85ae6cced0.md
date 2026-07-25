# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-142ca36ecbef1ee80fc5dc508074ca59`
- policy_decision_ref: `policy-decision:approval-142ca36ecbef1ee80fc5dc508074ca59:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `4e2e4efe9eef5df0881ae0d862d741befca695dd6a9409535dd7a0f4e2127df1`

## Approval

- approval_ref: `approval-142ca36ecbef1ee80fc5dc508074ca59`
- policy_decision_ref: `policy-decision:approval-142ca36ecbef1ee80fc5dc508074ca59:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
