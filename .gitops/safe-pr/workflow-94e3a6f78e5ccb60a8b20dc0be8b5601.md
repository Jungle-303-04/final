# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-3bb1282058a3ef7f05c9e1b5d06ba00a`
- policy_decision_ref: `policy-decision:approval-3bb1282058a3ef7f05c9e1b5d06ba00a:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `8d12943ddab93d523e567d8052304c02f0ec7f2ecf92e66797200c6cadf8b6fb`

## Approval

- approval_ref: `approval-3bb1282058a3ef7f05c9e1b5d06ba00a`
- policy_decision_ref: `policy-decision:approval-3bb1282058a3ef7f05c9e1b5d06ba00a:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
