# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-6088c82f2110ccc49c2304b9959260ff`
- policy_decision_ref: `policy-decision:approval-6088c82f2110ccc49c2304b9959260ff:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `125224e745b9116e0bf95b193b5fb570694aa6769c3d81f0ad203c77052529c6`

## Approval

- approval_ref: `approval-6088c82f2110ccc49c2304b9959260ff`
- policy_decision_ref: `policy-decision:approval-6088c82f2110ccc49c2304b9959260ff:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
