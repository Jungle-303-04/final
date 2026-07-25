# Apply sandbox manifest

deployment/canary-room: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-8c0322dab01a7636aa26b57b3fdd20bf`
- policy_decision_ref: `policy-decision:approval-8c0322dab01a7636aa26b57b3fdd20bf:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:2b4070970ff06f2aeb538f3848ea3c45043a58da5cd580842f4e09ac05574690`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-canary-room-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `496e707e2ff18ab3100679ca17733fb9de8d4938f4799941c466045dddac8e8c`

## Approval

- approval_ref: `approval-8c0322dab01a7636aa26b57b3fdd20bf`
- policy_decision_ref: `policy-decision:approval-8c0322dab01a7636aa26b57b3fdd20bf:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-canary-room-base.yaml`: rollback manifest generated from live/previous values
