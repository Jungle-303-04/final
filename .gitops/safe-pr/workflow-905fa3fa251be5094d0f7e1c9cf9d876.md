# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-8775ee6ce4d51f876f0aee941e3a0003`
- policy_decision_ref: `policy-decision:approval-8775ee6ce4d51f876f0aee941e3a0003:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `346a20486bd463a727fea80fdfbbb73543d3371fb2c658e22e1414c8d77fdcf4`

## Approval

- approval_ref: `approval-8775ee6ce4d51f876f0aee941e3a0003`
- policy_decision_ref: `policy-decision:approval-8775ee6ce4d51f876f0aee941e3a0003:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
