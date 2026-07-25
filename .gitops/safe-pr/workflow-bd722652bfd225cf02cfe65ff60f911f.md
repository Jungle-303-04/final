# Apply sandbox manifest

deployment/game-room-1: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-87418c64b6a50f6df4750eebbb67497b`
- policy_decision_ref: `policy-decision:approval-87418c64b6a50f6df4750eebbb67497b:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:0a913106998539af2bfd72b1ce18b7a642e5e9d212c7951533bd0a7437e4bc2c`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `525613570a0ebe14efefa87d2ad4e99f03ca683a9d3de8f1fc5edaa5da0bd7f6`

## Approval

- approval_ref: `approval-87418c64b6a50f6df4750eebbb67497b`
- policy_decision_ref: `policy-decision:approval-87418c64b6a50f6df4750eebbb67497b:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-1-base.yaml`: rollback manifest generated from live/previous values
