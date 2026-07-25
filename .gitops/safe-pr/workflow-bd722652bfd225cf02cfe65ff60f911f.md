# Apply sandbox manifest

service/game-room-canary: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-6cf14fe9ad778b1488a931667d014d49`
- policy_decision_ref: `policy-decision:approval-6cf14fe9ad778b1488a931667d014d49:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:73dd5d33398cdd18f75d5063314f9ed201073448e417c57e9c0b94d153daaf20`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-canary-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `e92f5c3b9c7a5c9cefea8e5d9dd59288ccdc38d46f77ee780d8d7f7adf2bdb4d`

## Approval

- approval_ref: `approval-6cf14fe9ad778b1488a931667d014d49`
- policy_decision_ref: `policy-decision:approval-6cf14fe9ad778b1488a931667d014d49:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-canary-base.yaml`: rollback manifest generated from live/previous values
