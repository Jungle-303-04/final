# Apply sandbox manifest

service/game-room-canary-bot: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-18be16efd71f863a563db8d41109751c`
- policy_decision_ref: `policy-decision:approval-18be16efd71f863a563db8d41109751c:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:f98d3e13870e552a919ad5ad34937007aa0d8a2684d3c837c2c01ee334233255`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-canary-bot-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `c59e2813aaee7840498a3a52790aa44c2f9ee7d96991b5747bb1a0b017a9e32c`

## Approval

- approval_ref: `approval-18be16efd71f863a563db8d41109751c`
- policy_decision_ref: `policy-decision:approval-18be16efd71f863a563db8d41109751c:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-canary-bot-base.yaml`: rollback manifest generated from live/previous values
