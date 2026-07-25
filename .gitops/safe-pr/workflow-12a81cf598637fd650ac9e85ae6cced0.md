# Apply sandbox manifest

deployment/api-server: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-985d8a9b8f32893db2eb708838ddcc3a`
- policy_decision_ref: `policy-decision:approval-985d8a9b8f32893db2eb708838ddcc3a:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b6b20ae1523daa5616cb3ae5d2d5bce5de04b73b37efc9fa245fe1d3be2a6252`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-api-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `cef2dc214354ad2b1624fa438db84b77e927c5f0a7663db4c1279d2e42ccd365`

## Approval

- approval_ref: `approval-985d8a9b8f32893db2eb708838ddcc3a`
- policy_decision_ref: `policy-decision:approval-985d8a9b8f32893db2eb708838ddcc3a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-api-server-base.yaml`: rollback manifest generated from live/previous values
