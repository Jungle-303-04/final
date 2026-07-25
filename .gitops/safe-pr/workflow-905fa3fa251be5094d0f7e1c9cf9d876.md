# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-546098bdc0def24e85c35fc7fecab059`
- policy_decision_ref: `policy-decision:approval-546098bdc0def24e85c35fc7fecab059:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `df7edb1671f727c59cfaf04fe4db7b9fa0b5ba90067b59ba6b879ed9385d09eb`

## Approval

- approval_ref: `approval-546098bdc0def24e85c35fc7fecab059`
- policy_decision_ref: `policy-decision:approval-546098bdc0def24e85c35fc7fecab059:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
