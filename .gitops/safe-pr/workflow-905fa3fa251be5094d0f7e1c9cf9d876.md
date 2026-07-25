# Apply sandbox manifest

deployment/management-server: unknown → ghcr.io/jungle-303-04/demo-game/room-orchestrator:stable

## GitOps Basis

- approval_ref: `approval-80275d322d1b1a22903220858cdb51ab`
- policy_decision_ref: `policy-decision:approval-80275d322d1b1a22903220858cdb51ab:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:705c2d95933fd2dc94ed5bbb6622597e1dc0fe1a8e60917356894d2333cc2b6c`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-management-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `1c2809582d40f456f15d7a12f868c62e3c4897ac8e0049ac97c933e9b3b9d2c6`

## Approval

- approval_ref: `approval-80275d322d1b1a22903220858cdb51ab`
- policy_decision_ref: `policy-decision:approval-80275d322d1b1a22903220858cdb51ab:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-management-server-base.yaml`: rollback manifest generated from live/previous values
