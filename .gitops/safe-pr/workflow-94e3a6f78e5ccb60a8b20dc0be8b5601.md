# Apply sandbox manifest

service/game-room-3: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-c1f807b4f8952dce01b5a93ac820d7f6`
- policy_decision_ref: `policy-decision:approval-c1f807b4f8952dce01b5a93ac820d7f6:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:ad9674a49e6c658bfec875713942e166edc563293ca5b6a339f603ff696d86fe`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-3-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `cf5322dff00898bd7671acb74cd1fbb3befed48b0b1e1b2896234c5afcb6aab8`

## Approval

- approval_ref: `approval-c1f807b4f8952dce01b5a93ac820d7f6`
- policy_decision_ref: `policy-decision:approval-c1f807b4f8952dce01b5a93ac820d7f6:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-3-base.yaml`: rollback manifest generated from live/previous values
