# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-8b695fec9d351784acf747a99180683d`
- policy_decision_ref: `policy-decision:approval-8b695fec9d351784acf747a99180683d:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `3fc7b9814580c085bd3c8d4ccd1a880c245b7c1eb516c13ede652a2ab074f461`

## Approval

- approval_ref: `approval-8b695fec9d351784acf747a99180683d`
- policy_decision_ref: `policy-decision:approval-8b695fec9d351784acf747a99180683d:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
