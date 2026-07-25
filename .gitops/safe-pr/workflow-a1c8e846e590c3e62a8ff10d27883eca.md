# Apply sandbox manifest

deployment/game-room-4: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-060bc5b8c7c925980d8cd4c8caaef2a3`
- policy_decision_ref: `policy-decision:approval-060bc5b8c7c925980d8cd4c8caaef2a3:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:433347341dc2066cbb914c269fb960c6572758b77f610af8fb166d27cb5d9317`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-4-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `3ade763cd7f3fb24ca33319cef76e81234a0eff6b7ee341c6ee70bb591eb6268`

## Approval

- approval_ref: `approval-060bc5b8c7c925980d8cd4c8caaef2a3`
- policy_decision_ref: `policy-decision:approval-060bc5b8c7c925980d8cd4c8caaef2a3:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-game-room-4-base.yaml`: rollback manifest generated from live/previous values
