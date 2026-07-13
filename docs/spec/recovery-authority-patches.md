---
source_commit: 9af57b639
status: synced
---

# Recovery authority patches

RCA recovery의 Safe PR 경로는 이벤트에 실린 manifest나 후보 `params`를 patch 근거로
신뢰하지 않는다. patch 생성 시점에 GitOps read model을 다시 읽고, SCM worker가 같은
exact base SHA의 원문을 가져와 허용된 scalar만 치환한다.

## 권위 조회 계약

`packages.contracts.gitops_authority.GitOpsAuthorityReadPort`는
`GitOpsAuthorityQuery`를 받아 `GitOpsAuthorityContext | None`을 반환한다.

- query: correlation/workspace/incident와 cluster/namespace/kind/name target
- context: repository/binding/application/workflow identity, environment, manifest path,
  repo/base branch/commit SHA, source type/digest, 승인 desired manifest, diff changes, RCA evidence
- 구현은 correlation의 `gitops_change_context`를 locator로만 사용하고 workflow run,
  diff step, active binding, application/repository, manifest provenance를 현재 DB에서 재조회한다.
- workspace·target·identity·base SHA·artifact digest·source provenance 중 하나라도 다르면
  context를 반환하지 않는다. source는 단일 파일 `raw-yaml`만 지원한다.

권위가 없으면 `gitops_authority_unavailable`, target이 다르면
`gitops_authority_mismatch`, 정책 안에서 patch할 수 없으면
`safe_pr_patch_unsupported`의 `rca.action_required`로 종료한다.

## 지원 action과 정책

| action type | 변경 | 제한 |
|---|---|---|
| `oom_memory` | 단일 container의 request/limit memory 증가 | 수치형 working set 근거, 1.25 headroom, 최대 4Gi |
| `image_rollback` | image scalar를 last approved 값으로 복원 | 승인 diff의 단일 container image change |
| `image_tag_fix` | 잘못된 image tag/digest를 승인값으로 복원 | image rollback과 같은 권위 조건 |
| `replica_scale` | `spec.replicas` +1 | 현재 1~9, 결과 최대 10 |
| `probe_fix` | probe path/port 승인값 복원 또는 timeout +2 | 단일 변경, port 1~65535, timeout 최대 30 |
| `selector_fix` | template label과 다른 단일 Deployment selector scalar 보정 | 단일 key만 |

`gitops_recovery_review`만 `.gitops/recovery/*.md` 검토 문서를 만든다. 이는 실제 복구
action과 별도이고 실제 patch 후보보다 score가 낮다. 그 밖의 action은 문서 PR로 위장하지
않고 `unsupported`로 수렴한다.

## Structured patch와 rollback

`GitOpsScalarPatch` v1alpha1은 다음을 포함한다.

- `actionType`, `sourceType`, `sourceManifestSha256`
- `expectedBaseSha`, `manifestPath`
- `replacements[]`: field path/current/desired scalar
- `rollbackReplacements[]`: forward의 exact inverse

SCM worker는 DB의 workflow/diff/provenance와 plan을 다시 대조한 뒤 GitHub에서
`expectedBaseSha`의 원문을 읽는다. YAML anchor/alias, 다중 문서, missing/duplicate target,
digest 불일치, allowlist 밖 field는 거부한다. YAML을 재직렬화하지 않고 node span만 바꾸므로
주석·개행·필드 순서를 보존한다. machine-readable forward/rollback plan은 PR 변경 문서에도
남는다.

## 재현

```bash
uv run python scripts/verify-recovery-patches.py
```

production generator와 materializer를 사용해 6개 action의 forward patch와 inverse rollback이
원문 byte를 정확히 복원하는지 채점한다. 성공 기준은 마지막 줄
`{"failed": 0, "passed": 6, "total": 6}`이다.

