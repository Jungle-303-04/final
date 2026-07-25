# Apply sandbox manifest

service/game-room-metrics: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-4071cb0573ca0e4cfc975b9e9548ebc3`
- policy_decision_ref: `policy-decision:approval-4071cb0573ca0e4cfc975b9e9548ebc3:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9165d969d534a6430631ed828f4f2efe601997b583fdb0ce07e10691264b53b0`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-metrics-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `04317eb1e9cecf33b02c5b1c2cd7902c8a697f989808a198fbaedc0b0f2f2e8f`

## Approval

- approval_ref: `approval-4071cb0573ca0e4cfc975b9e9548ebc3`
- policy_decision_ref: `policy-decision:approval-4071cb0573ca0e4cfc975b9e9548ebc3:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-metrics-base.yaml`: rollback manifest generated from live/previous values
