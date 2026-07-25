# Apply sandbox manifest

service/game-room-0: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-fc247f197d58098cf6bd97b5c0ae650d`
- policy_decision_ref: `policy-decision:approval-fc247f197d58098cf6bd97b5c0ae650d:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:e49f3c183cac3fa6b61766ceab5b3eaf819b9543e479ec425dfe742922663407`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `88a0f4c243c7502e7a4c3dcbf8adde2fba5d19a19381fa8fe04ffcf2564b4ed4`

## Approval

- approval_ref: `approval-fc247f197d58098cf6bd97b5c0ae650d`
- policy_decision_ref: `policy-decision:approval-fc247f197d58098cf6bd97b5c0ae650d:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-0-base.yaml`: rollback manifest generated from live/previous values
