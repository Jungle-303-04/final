# Apply sandbox manifest

deployment/management-server: unknown → ghcr.io/jungle-303-04/demo-game/room-orchestrator:stable

## GitOps Basis

- approval_ref: `approval-94d58ba0fad8d7c11b3440eb9bd22f13`
- policy_decision_ref: `policy-decision:approval-94d58ba0fad8d7c11b3440eb9bd22f13:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:705c2d95933fd2dc94ed5bbb6622597e1dc0fe1a8e60917356894d2333cc2b6c`
- rollback_patch: `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-management-server-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-a1c8e846e590c3e62a8ff10d27883eca`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `f65bc3d5d119669eb6c864ccd4a22c77df1ba8491015d307df5955f5e9737647`

## Approval

- approval_ref: `approval-94d58ba0fad8d7c11b3440eb9bd22f13`
- policy_decision_ref: `policy-decision:approval-94d58ba0fad8d7c11b3440eb9bd22f13:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-a1c8e846e590c3e62a8ff10d27883eca/deployment-management-server-base.yaml`: rollback manifest generated from live/previous values
