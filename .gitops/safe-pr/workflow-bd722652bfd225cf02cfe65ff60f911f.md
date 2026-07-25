# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-f9825d2b9f14dfc6f6f55fe0cae2aef6`
- policy_decision_ref: `policy-decision:approval-f9825d2b9f14dfc6f6f55fe0cae2aef6:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `82e95b6bdcacb1c992b0b413635a6f73924636b6d2729b87d309e09855ae3fc4`

## Approval

- approval_ref: `approval-f9825d2b9f14dfc6f6f55fe0cae2aef6`
- policy_decision_ref: `policy-decision:approval-f9825d2b9f14dfc6f6f55fe0cae2aef6:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
