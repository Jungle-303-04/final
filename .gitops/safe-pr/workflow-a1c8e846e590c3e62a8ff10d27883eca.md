# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-45f4ba41d6a57cd3588cddb2b851d292`
- policy_decision_ref: `policy-decision:approval-45f4ba41d6a57cd3588cddb2b851d292:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `5668d996fbafc284584780cda572b12faa28f990ec01b0342068d7a8d0eec515`

## Approval

- approval_ref: `approval-45f4ba41d6a57cd3588cddb2b851d292`
- policy_decision_ref: `policy-decision:approval-45f4ba41d6a57cd3588cddb2b851d292:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
