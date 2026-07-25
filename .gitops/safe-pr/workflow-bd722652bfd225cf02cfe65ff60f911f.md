# Apply sandbox manifest

service/game-room-2: apply rendered manifest

## GitOps Basis

- approval_ref: `approval-142a682dfc5138f80160a446629e9684`
- policy_decision_ref: `policy-decision:approval-142a682dfc5138f80160a446629e9684:safe_pr`
- diff_status: `drift`
- diff_basis: `managed-field-3way`
- artifact_digest: `sha256:9850e7bcb77aa321e9ce21eff75c9a8d64267c809225773197e8f2ab48efae25`
- rollback_patch: `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-2-base.yaml`


- manifest_path: `deploy/k8s/base`
- pr_kind: `safe_pr_patch`
- workflow_run_id: `workflow-bd722652bfd225cf02cfe65ff60f911f`
- environment: `development`

## Evidence

- commit_sha: ``
- patch_sha256: `7fc5f209e0c1b743e27d5f8c584b5a3e5aea27de435e15779c42b76b519ef150`

## Approval

- approval_ref: `approval-142a682dfc5138f80160a446629e9684`
- policy_decision_ref: `policy-decision:approval-142a682dfc5138f80160a446629e9684:safe_pr`

## Files

- `deploy/k8s/base`: rendered Kubernetes manifest
- `.gitops/rollback/workflow-bd722652bfd225cf02cfe65ff60f911f/service-game-room-2-base.yaml`: rollback manifest generated from live/previous values
