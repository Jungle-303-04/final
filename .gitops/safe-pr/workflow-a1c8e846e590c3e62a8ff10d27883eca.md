# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-554462b41be0dc32e39276c222a7b3cb`
- policy_decision_ref: `policy-decision:approval-554462b41be0dc32e39276c222a7b3cb:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `08260d709c1f00dfff0b55d41f7e72e291f754e326704b934e1872ea373584c3`

## Approval

- approval_ref: `approval-554462b41be0dc32e39276c222a7b3cb`
- policy_decision_ref: `policy-decision:approval-554462b41be0dc32e39276c222a7b3cb:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
