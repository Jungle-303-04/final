# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-b26410b782aa91e492ea49023bca431a`
- policy_decision_ref: `policy-decision:approval-b26410b782aa91e492ea49023bca431a:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `f1aa5963099513510011001764c9ac4363abd443f3ad1bdd12a4a6ea5dffebd8`

## Approval

- approval_ref: `approval-b26410b782aa91e492ea49023bca431a`
- policy_decision_ref: `policy-decision:approval-b26410b782aa91e492ea49023bca431a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
