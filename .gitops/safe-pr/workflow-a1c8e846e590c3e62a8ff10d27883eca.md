# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-e348063ddbbff646dac07b99102a90f9`
- policy_decision_ref: `policy-decision:approval-e348063ddbbff646dac07b99102a90f9:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `34aab399e2e32eebd83ddc8e02df051c6e3439958443b3d91d554818049de0b0`

## Approval

- approval_ref: `approval-e348063ddbbff646dac07b99102a90f9`
- policy_decision_ref: `policy-decision:approval-e348063ddbbff646dac07b99102a90f9:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
