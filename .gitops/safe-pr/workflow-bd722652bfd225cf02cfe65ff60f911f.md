# Apply sandbox manifest

deployment/game-room-2: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-5b17fa3c0c6a0b1ddfb46c3add44e3fd`
- policy_decision_ref: `policy-decision:approval-5b17fa3c0c6a0b1ddfb46c3add44e3fd:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:b00973563fea8e510ffd1f6e98f7b55ff2c616b02356b775d232c7f13a20380a`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `2493993b7251bf4eb48559bcc940520620d0c1bfef68be56aab8161101ecbb81`

## Approval

- approval_ref: `approval-5b17fa3c0c6a0b1ddfb46c3add44e3fd`
- policy_decision_ref: `policy-decision:approval-5b17fa3c0c6a0b1ddfb46c3add44e3fd:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/deployment-game-room-2-base.yaml`: rollback manifest generated from live/previous values
