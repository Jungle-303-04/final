# Apply sandbox manifest

service/game-room-canary-bot: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-a5b6af05e693da3b8d711bd66c7e60e0`
- policy_decision_ref: `policy-decision:approval-a5b6af05e693da3b8d711bd66c7e60e0:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:f98d3e13870e552a919ad5ad34937007aa0d8a2684d3c837c2c01ee334233255`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-canary-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `e39844cfe4aee6c8b80cec27851cd6d60e8416f109a3f7640c1790863610115b`

## Approval

- approval_ref: `approval-a5b6af05e693da3b8d711bd66c7e60e0`
- policy_decision_ref: `policy-decision:approval-a5b6af05e693da3b8d711bd66c7e60e0:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-canary-bot-base.yaml`: rollback manifest generated from live/previous values
