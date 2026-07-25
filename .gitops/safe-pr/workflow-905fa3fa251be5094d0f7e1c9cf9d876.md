# Apply sandbox manifest

deployment/api-server: ghcr.io/jungle-303-04/demo-game/api-server:63f728c2c1a4c3345a24f91c40c922ff3941c344 → ghcr.io/jungle-303-04/demo-game/api-server:stable

## GitOps Basis

- approval_ref: `approval-ce4123e8a9d2d44993b838862a514260`
- policy_decision_ref: `policy-decision:approval-ce4123e8a9d2d44993b838862a514260:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:38589d55dbfc39728d6792f388986b6ee3a767d75a54a8db15dd4902da374b21`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-api-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `06197323da786a11308825971c49a1d30ea45215a5264a3348888b98689b845c`

## Approval

- approval_ref: `approval-ce4123e8a9d2d44993b838862a514260`
- policy_decision_ref: `policy-decision:approval-ce4123e8a9d2d44993b838862a514260:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-api-server-base.yaml`: rollback manifest generated from live/previous values
