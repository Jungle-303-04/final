# Apply sandbox manifest

deployment/session-gateway: ghcr.io/jungle-303-04/demo-game/session-gateway:276977d3628e8cc5c7ce8c362add3b4111c7883e → ghcr.io/jungle-303-04/demo-game/session-gateway:stable

## GitOps Basis

- approval_ref: `approval-6d4a24e0ddd678884a09c8855523ef5f`
- policy_decision_ref: `policy-decision:approval-6d4a24e0ddd678884a09c8855523ef5f:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:8f60b2e836b46e64524bd0e248c66889a0bfbe02fc37930d3484c0285de2ebb1`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-session-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `891afc5d4d597608955a18dd6385f35859ed5c3c036e2555d39727d7321585ba`

## Approval

- approval_ref: `approval-6d4a24e0ddd678884a09c8855523ef5f`
- policy_decision_ref: `policy-decision:approval-6d4a24e0ddd678884a09c8855523ef5f:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-session-gateway-base.yaml`: rollback manifest generated from live/previous values
