# Apply sandbox manifest

service/game-room-1: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-6f32f58048a08a537ae57446c61d10c1`
- policy_decision_ref: `policy-decision:approval-6f32f58048a08a537ae57446c61d10c1:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:002bcabad75300a8915ab62b826e018bbad801b39e20b98bd9858101b0ac1184`
- rollback_patch: `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-1-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `882fb6421660c3f786c43189038d728e2cb74c02a411853f5b90b1efe314db3f`

## Approval

- approval_ref: `approval-6f32f58048a08a537ae57446c61d10c1`
- policy_decision_ref: `policy-decision:approval-6f32f58048a08a537ae57446c61d10c1:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-600ecc1a6e1e9fd84a4157ec9c9f1e90/service-game-room-1-base.yaml`: rollback manifest generated from live/previous values
