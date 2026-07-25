# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-cf4960bfb9f557460a38fa968bc3102f`
- policy_decision_ref: `policy-decision:approval-cf4960bfb9f557460a38fa968bc3102f:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `88e34e78c257f41ce295c082c7fe0ba3867b6f51ff10614d46eaa6a2f1a135ad`

## Approval

- approval_ref: `approval-cf4960bfb9f557460a38fa968bc3102f`
- policy_decision_ref: `policy-decision:approval-cf4960bfb9f557460a38fa968bc3102f:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
