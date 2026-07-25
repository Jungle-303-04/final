# Apply sandbox manifest

service/login-gateway: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-8fda47254c6d2fe9fa95d6538c96b26c`
- policy_decision_ref: `policy-decision:approval-8fda47254c6d2fe9fa95d6538c96b26c:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2c96ad5755759459b8cc7d593125e843506787578d850f29632dc010eb89455e`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/service-login-gateway-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `cb1bc9554c822020cc1e5eab779c23a2520926e115b4acb9e93b2d498347383a`

## Approval

- approval_ref: `approval-8fda47254c6d2fe9fa95d6538c96b26c`
- policy_decision_ref: `policy-decision:approval-8fda47254c6d2fe9fa95d6538c96b26c:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/service-login-gateway-base.yaml`: rollback manifest generated from live/previous values
