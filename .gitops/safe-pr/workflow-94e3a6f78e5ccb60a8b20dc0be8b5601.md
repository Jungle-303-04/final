# Apply sandbox manifest

service/game-room-2: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-bda0f8b4a950dda4e8ea4c7836463097`
- policy_decision_ref: `policy-decision:approval-bda0f8b4a950dda4e8ea4c7836463097:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9850e7bcb77aa321e9ce21eff75c9a8d64267c809225773197e8f2ab48efae25`
- rollback_patch: `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-94e3a6f78e5ccb60a8b20dc0be8b5601`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `753d536060147f85b882d12809dceb56286ab8d08625962cb2b3c77e917561f3`

## Approval

- approval_ref: `approval-bda0f8b4a950dda4e8ea4c7836463097`
- policy_decision_ref: `policy-decision:approval-bda0f8b4a950dda4e8ea4c7836463097:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-94e3a6f78e5ccb60a8b20dc0be8b5601/service-game-room-2-base.yaml`: rollback manifest generated from live/previous values
