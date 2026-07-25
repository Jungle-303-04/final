# Apply sandbox manifest

deployment/game-room-3: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-6e0f083640bb40d7706cf8670c50e857`
- policy_decision_ref: `policy-decision:approval-6e0f083640bb40d7706cf8670c50e857:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:df52eef78a3f398547e29405bc1f2858ee7dbfe1d0cafcb3fb65f0ceaca4e8b4`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `518ac0de3cf61b094082cc09a5cd35d10d02d79f316dd3f1abcaefe980449fac`

## Approval

- approval_ref: `approval-6e0f083640bb40d7706cf8670c50e857`
- policy_decision_ref: `policy-decision:approval-6e0f083640bb40d7706cf8670c50e857:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-3-base.yaml`: rollback manifest generated from live/previous values
