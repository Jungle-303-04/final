# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-cf7f96ba30de2cabaddd7a15b534ccf1`
- policy_decision_ref: `policy-decision:approval-cf7f96ba30de2cabaddd7a15b534ccf1:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `7a28e47b38aff5a515f7eea4cf6de3b8d7de5af84a13e929de3ce6bea7a9c041`

## Approval

- approval_ref: `approval-cf7f96ba30de2cabaddd7a15b534ccf1`
- policy_decision_ref: `policy-decision:approval-cf7f96ba30de2cabaddd7a15b534ccf1:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
