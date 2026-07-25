# Apply sandbox manifest

service/game-room-headless: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-8c86cc71759173f29ae053dc38934d82`
- policy_decision_ref: `policy-decision:approval-8c86cc71759173f29ae053dc38934d82:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:866514406745937727e059e187b2203fce33a2d4dd2d00cd01e93a3ad8f80af9`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-headless-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `e756c6b4c6385eb3c1664a76bbe4d0a6edd08278af6af6ea63b7ab987d94f4b9`

## Approval

- approval_ref: `approval-8c86cc71759173f29ae053dc38934d82`
- policy_decision_ref: `policy-decision:approval-8c86cc71759173f29ae053dc38934d82:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-headless-base.yaml`: rollback manifest generated from live/previous values
