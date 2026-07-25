# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-5f24e3c4a9fbcf3defa28a20f99d5af8`
- policy_decision_ref: `policy-decision:approval-5f24e3c4a9fbcf3defa28a20f99d5af8:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-12a81cf598637fd650ac9e85ae6cced0`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `01da30d301f782d51154235094fd8cc07ad8bc0b3aaf9425a946d711743484c8`

## Approval

- approval_ref: `approval-5f24e3c4a9fbcf3defa28a20f99d5af8`
- policy_decision_ref: `policy-decision:approval-5f24e3c4a9fbcf3defa28a20f99d5af8:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-12a81cf598637fd650ac9e85ae6cced0/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
