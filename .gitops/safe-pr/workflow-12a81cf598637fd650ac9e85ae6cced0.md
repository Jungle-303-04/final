# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-c8ea50335a069c2a1096ff3cc68b27ea`
- policy_decision_ref: `policy-decision:approval-c8ea50335a069c2a1096ff3cc68b27ea:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `5ca95bf59187f10e8c2f173d54aa1ecf474a36a551e9e27caacc05dba05e03d2`

## Approval

- approval_ref: `approval-c8ea50335a069c2a1096ff3cc68b27ea`
- policy_decision_ref: `policy-decision:approval-c8ea50335a069c2a1096ff3cc68b27ea:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
