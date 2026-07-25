# Apply sandbox manifest

deployment/api-server: ghcr.io/jungle-303-04/demo-game/api-server:63f728c2c1a4c3345a24f91c40c922ff3941c344 → ghcr.io/jungle-303-04/demo-game/api-server:stable

## GitOps Basis

- approval_ref: `approval-ee37b40db827e8811d17b3938f26169d`
- policy_decision_ref: `policy-decision:approval-ee37b40db827e8811d17b3938f26169d:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b6b20ae1523daa5616cb3ae5d2d5bce5de04b73b37efc9fa245fe1d3be2a6252`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-api-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `3be8d2363db3292b754a36156ac193e204874973f72ae2347a75847f3350b844`

## Approval

- approval_ref: `approval-ee37b40db827e8811d17b3938f26169d`
- policy_decision_ref: `policy-decision:approval-ee37b40db827e8811d17b3938f26169d:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-api-server-base.yaml`: rollback manifest generated from live/previous values
