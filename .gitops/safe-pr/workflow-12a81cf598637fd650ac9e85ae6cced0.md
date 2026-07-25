# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-f4da50511e0fa59fb8519a8fc02d4dee`
- policy_decision_ref: `policy-decision:approval-f4da50511e0fa59fb8519a8fc02d4dee:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `83d42a16411402bd6cccdbd24655935dca2abc667190b13081b77e9535ef68ba`

## Approval

- approval_ref: `approval-f4da50511e0fa59fb8519a8fc02d4dee`
- policy_decision_ref: `policy-decision:approval-f4da50511e0fa59fb8519a8fc02d4dee:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
