# Apply sandbox manifest

deployment/game-room-0: unknown → ghcr.io/jungle-303-04/demo-game/game-server:stable

## GitOps Basis

- approval_ref: `approval-3e3ef60906516dbcdf373037dc7b7e11`
- policy_decision_ref: `policy-decision:approval-3e3ef60906516dbcdf373037dc7b7e11:safe_pr`
- diff_status: `intended_change`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:81e5842c998ade4883d71abefa13d3e18aaf269e02520e3c3ee73d0261dd2f6f`
- rollback_patch: `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-0-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-905fa3fa251be5094d0f7e1c9cf9d876`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `07c84164d7de951500c16897b559c40f782e2b416d76618ec367126f5746bb88`

## Approval

- approval_ref: `approval-3e3ef60906516dbcdf373037dc7b7e11`
- policy_decision_ref: `policy-decision:approval-3e3ef60906516dbcdf373037dc7b7e11:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-905fa3fa251be5094d0f7e1c9cf9d876/deployment-game-room-0-base.yaml`: rollback manifest generated from live/previous values
