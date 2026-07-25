# Apply sandbox manifest

deployment/game-room-3: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-8b84fa81dd1e4650695c16257cc615e3`
- policy_decision_ref: `policy-decision:approval-8b84fa81dd1e4650695c16257cc615e3:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:df52eef78a3f398547e29405bc1f2858ee7dbfe1d0cafcb3fb65f0ceaca4e8b4`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `6663b7e595894e3eeaabf382e4fd814916efbb04da2a9c375ea9128911dbf6f5`

## Approval

- approval_ref: `approval-8b84fa81dd1e4650695c16257cc615e3`
- policy_decision_ref: `policy-decision:approval-8b84fa81dd1e4650695c16257cc615e3:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-3-base.yaml`: rollback manifest generated from live/previous values
