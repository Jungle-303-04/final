# Apply sandbox manifest

deployment/canary-validation-bot: unknown → ghcr.io/jungle-303-04/demo-game/bot-runner:stable

## GitOps Basis

- approval_ref: `approval-6b63364863c850048e6f23a840e36674`
- policy_decision_ref: `policy-decision:approval-6b63364863c850048e6f23a840e36674:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:fe2847ae232932a8d493bd34ae363d1e5910bcf43f33ea2483f5953cebb2b993`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-canary-validation-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `da2f309db38485d15177d83850d75fcf05e6de24f5f98868a5102a3bbc9c536a`

## Approval

- approval_ref: `approval-6b63364863c850048e6f23a840e36674`
- policy_decision_ref: `policy-decision:approval-6b63364863c850048e6f23a840e36674:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-canary-validation-bot-base.yaml`: rollback manifest generated from live/previous values
