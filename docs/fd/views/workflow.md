# 뷰: 워크플로우 노드 그래프

[← 지도](../README.md) · 요구사항 [R9](../01-requirements.md#r9-워크플로우-생성-노드뷰) · 참조: Argo Workflows DAG, Plural Pipelines([02](../02-reference-map.md))

**범위 정의(모순 방지)**: 백엔드 실행 모델은 고정 파이프라인(이벤트 체인)이다.
따라서 "생성" = [레포 연결 위저드](resources.md#레포-연결-위저드)이고, 이 뷰는
run 의 **시각화·개입(승인/재시도)** 을 담당한다. 임의 DAG 편집은 범위 외([01 §R9](../01-requirements.md#r9-워크플로우-생성-노드뷰)).

## 목록 — WorkflowListView (/workflows)

전체 앱의 runs 합성: `GET /applications` → 각 `GET /applications/{id}/runs` (활성 우선 정렬).
ResourceTable: 앱, commit, 상태 Badge, 현재 단계, 시작, 경과. 필터: 상태·앱.
행 클릭 → 그래프 뷰.

## 그래프 — WorkflowGraphView (/workflows/:runId)

@xyflow/react + frontend-demo 의 WorkflowNode/SignalEdge 이식([02 § 이식](../02-reference-map.md#frontend-demo-이식-대상-자기-코드--제약-없음)).

고정 파이프라인 노드 9개(가로 배치, elkjs 불필요 — 순서 고정):

```text
STARTED → RENDERING → DIFFING → POLICY_CHECKING → WAITING_FOR_APPROVAL
        → APPLYING → ROLLOUT_WAITING → SUCCEEDED
                                     ↘ FAILED (어느 단계에서든 분기 — 점선 엣지)
```

노드 상태(색은 status.ts):

| 노드 상태 | 표현 |
|---|---|
| 완료 단계 | ok 채움 + ✓ |
| 현재 단계 | info 펄스(모션: opacity 0.6↔1, 유일하게 허용된 루프 — 진행 중 의미) |
| 미도달 | neutral 윤곽 |
| FAILED 도달 | danger + 실패 지점에서 분기 엣지 강조 |
| WAITING_FOR_APPROVAL 현재 | warn + 노드에 [승인]/[거절] 버튼 임베드 |

## 노드 클릭 → 사이드 패널

| 단계 | 패널 내용 |
|---|---|
| RENDERING/DIFFING | manifest/diff 산출물 — DiffView, CodeBlock |
| POLICY_CHECKING | 정책 판정 결과 KeyValue |
| WAITING_FOR_APPROVAL | 승인 카드: diff 요약 + grant/reject (`POST /approvals/{approval_id}/grant\|reject`, deploy 권한) — [repo runs 탭](repo.md#runs-탭)과 동일 카드 컴포넌트 `ApprovalCard` 공유 |
| APPLYING/ROLLOUT_WAITING | command 상태, 대상 클러스터 링크 |
| FAILED | 오류 payload CodeBlock + [AI 분석] → [ai-chat](ai-chat.md) 프리필 |

## 데이터·갱신

run 데이터: `GET /applications/{id}/runs` 중 해당 run (5s 폴링 — 종결 상태면 중지).
단계 데이터는 run 응답의 steps(WorkflowRunStep). runId → applicationId 역참조는
목록 진입 시 캐시, 직접 딥링크 시 앱 전체 runs 검색 1회.

상태 회귀 없음이 보장됨(백엔드 rank 가드) — 프론트는 단조 진행 가정 가능.

## AC

- [ ] 종결(SUCCEEDED/FAILED) run 은 폴링 중지
- [ ] 승인 노드 버튼과 repo 탭 승인 카드가 같은 컴포넌트(중복 구현 금지)
- [ ] 그래프가 창 크기 변화에 fitView 유지
- [ ] 실패 run 딥링크 진입 시 실패 노드 자동 포커스
