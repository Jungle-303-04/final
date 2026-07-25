# Apply sandbox manifest

service/game-room-metrics: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-5acd15555f241d17d3ba6c3e0ac62f50`
- policy_decision_ref: `policy-decision:approval-5acd15555f241d17d3ba6c3e0ac62f50:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9165d969d534a6430631ed828f4f2efe601997b583fdb0ce07e10691264b53b0`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-metrics-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `dbc209b8a3a510af48deaea896d20c6f130b90cd23c9543f3cc87d9f555d665f`

## Approval

- approval_ref: `approval-5acd15555f241d17d3ba6c3e0ac62f50`
- policy_decision_ref: `policy-decision:approval-5acd15555f241d17d3ba6c3e0ac62f50:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-metrics-base.yaml`: rollback manifest generated from live/previous values
