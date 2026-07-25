# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-e5ea507de7b29c9c5ce4729a529e5a26`
- policy_decision_ref: `policy-decision:approval-e5ea507de7b29c9c5ce4729a529e5a26:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `b0d893395128768ce0e5ce61c4eeca067f5c5c8c50c670b69e98f78c413b106a`

## Approval

- approval_ref: `approval-e5ea507de7b29c9c5ce4729a529e5a26`
- policy_decision_ref: `policy-decision:approval-e5ea507de7b29c9c5ce4729a529e5a26:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
