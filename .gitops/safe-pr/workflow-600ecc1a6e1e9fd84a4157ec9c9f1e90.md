# Apply sandbox manifest

service/game-room-2: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-7aaf7bf654591a0867a5e5e6acca8c78`
- policy_decision_ref: `policy-decision:approval-7aaf7bf654591a0867a5e5e6acca8c78:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9850e7bcb77aa321e9ce21eff75c9a8d64267c809225773197e8f2ab48efae25`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `65f4c4dfd04b1430bf90dd35eecc8c61ebe121184ccd3f8534d8f9890eb5f4eb`

## Approval

- approval_ref: `approval-7aaf7bf654591a0867a5e5e6acca8c78`
- policy_decision_ref: `policy-decision:approval-7aaf7bf654591a0867a5e5e6acca8c78:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-2-base.yaml`: rollback manifest generated from live/previous values
