# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-cdba741b94cc7394a3414f6cb178648a`
- policy_decision_ref: `policy-decision:approval-cdba741b94cc7394a3414f6cb178648a:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `b5e68bc108aeaee9c51da2bb7fca1a576f60dc234305ba27bb2d832828a56f99`

## Approval

- approval_ref: `approval-cdba741b94cc7394a3414f6cb178648a`
- policy_decision_ref: `policy-decision:approval-cdba741b94cc7394a3414f6cb178648a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
