# Apply sandbox manifest

service/game-room-headless: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-720326190ac4f5401773e140aaadcfa3`
- policy_decision_ref: `policy-decision:approval-720326190ac4f5401773e140aaadcfa3:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:866514406745937727e059e187b2203fce33a2d4dd2d00cd01e93a3ad8f80af9`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-headless-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `d5bfd194b4f63fe93fd64f0ec71f5c243f987ea1bb280f96e6502335160f5d59`

## Approval

- approval_ref: `approval-720326190ac4f5401773e140aaadcfa3`
- policy_decision_ref: `policy-decision:approval-720326190ac4f5401773e140aaadcfa3:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-headless-base.yaml`: rollback manifest generated from live/previous values
