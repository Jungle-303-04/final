# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-6968cc49dee81b91352fbdd343a27fe6`
- policy_decision_ref: `policy-decision:approval-6968cc49dee81b91352fbdd343a27fe6:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-66b6dce2f3e031fcd4285113b95a5be6`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `16e49ee4e0fcccdddf9ba8541038bd445e87dbfa67e7a48a059f816417aa5967`

## Approval

- approval_ref: `approval-6968cc49dee81b91352fbdd343a27fe6`
- policy_decision_ref: `policy-decision:approval-6968cc49dee81b91352fbdd343a27fe6:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-66b6dce2f3e031fcd4285113b95a5be6/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
