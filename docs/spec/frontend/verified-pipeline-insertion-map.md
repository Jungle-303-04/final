---
title: 검증 파이프라인 삽입점 매핑 (P2 부록)
status: p2-addendum
date: 2026-07-13
governing: reference-contract-map.md §5 (선례·판정 규율), (dev repo) docs/f-coordination-plan.md (공통 불변식)
backend_queue: (dev repo) docs/backend-f-workqueue.md
---

# 검증 파이프라인 삽입점 매핑

reference-contract-map.md의 "제품 고유 RCA 삽입점 5개"와 동일한 규율로 운영하는 부록이다.
**REF-API-001~136 행은 동결이며 이 문서는 그 표를 수정하지 않는다.**

판정 규칙은 원본 §1과 동일: `직결`/`어댑터`/`BE-Gap`. 단 이 문서의 행은 backend가
`계약 완성:` 앵커를 기록하기 전까지 전부 `backend 선행`이며, **앵커 확인 전에는
api-needs.md에 APIQ 행을 추가하지 않고 화면도 렌더하지 않는다** (BE-Gap 규율 그대로).

## 1. 삽입점 매핑

| ID | 삽입점 | 백엔드 큐 | 우리 계약 (백엔드 앵커로 확정) | 판정 | UI 매핑 (기존 자산 재사용) | API 함수 상태 |
|---|---|---|---|---|---|---|
| VP-001 | 인시던트 상세의 RemediationBundle 뷰 — 증거·진단·patch·rollback·검증 조건을 단일 문서로 표시, 다운로드 제공 | BQ-003 | `RCA_BUNDLE_PATH` (예정) | backend 선행 | `RCA-004 RecoveryPlanSection`·`RCA-005 EvidenceTrail` 패턴 조합 + Port `Card`/`Collapsible`. supporting/missing 축소 금지 | 미요청 |
| VP-002 | correlation 감사 타임라인 — 인시던트의 전체 이벤트 체인을 시간순 표시 | BQ-002+004 | `AUDIT_TIMELINE_PATH` (예정) | backend 선행 | `UI-021 Item`·`Collapsible`·`Badge`, 커서 페이지네이션 | 미요청 |
| VP-003 | 이벤트 여정 뷰 — VP-002 데이터를 워커 흐름(alert→evidence→rca→recovery→PR)으로 렌더 | BQ-004 | VP-002와 동일 route 소비 | backend 선행 | `UI-056 TimelineSwimlane` 선례의 custom. causation_id 있으면 트리, 없으면 시간순으로 강등 표시 | 미요청 |
| VP-004 | 인시던트 상세 "최근 변경" 섹션 — "이 장애 N분 전 PR #x로 image y 배포됨" | BQ-005 | `RCA_RECENT_CHANGES_PATH` (예정) | backend 선행 | `RCA-002 IncidentWorkspace`에 섹션 추가. 변경 없으면 섹션 미렌더(빈 카드 금지) | 미요청 |
| VP-005 | 승격 게이트 표시 — release flow에서 "rollout health 통과로 승격됨" 근거 표시 | BQ-006 | 기존 workflow run 응답의 `promotion_gate` 필드(additive) | backend 선행 | 기존 release(flow) 화면 + `UI-020 StatusMark` | 미요청 |
| VP-006 | revert PR 상태 — 검증 실패로 자동 생성된 revert PR을 인시던트·release 화면에 표시 | BQ-007 | 기존 safe_pr 이벤트/조회 재사용 (신규 route 없음) | backend 선행 | 기존 repo approval card 패턴. **flag off 환경에서는 이 표면 전체 미렌더** | 미요청 |

## 2. 작업 절차 (행 단위)

1. 백엔드 progress에서 해당 BQ의 `계약 완성:` 앵커 확인.
2. 이 표의 행을 갱신: 계약 상수·response model을 실제 값으로 채우고 판정을 `직결`/`어댑터`로 변경.
3. api-needs.md에 APIQ 행 추가 (기존 형식·claim 규칙 그대로).
4. `API 완성:` 앵커 후 화면/adapter 구현. custom component는 VP-003 하나뿐이며
   나머지는 기존 primitive 조합을 우선한다.
5. 완료 시 이 표의 "API 함수 상태"에 앵커를 기록한다.

## 3. 금지 사항

- 앵커 없는 행의 선행 구현, synthetic 데이터, disabled placeholder UI.
- REF-API 136행 표 수정, reference 원본 문서 수정.
- backend 계약이 부족할 때 직접 endpoint를 만들거나 추측하는 것 — api-needs가 아니라
  **backend-f-workqueue.md의 blocked 절차**로 백엔드 세션에 요청한다(신규 계약은 백엔드 소유).

## 4. 완료 게이트

- VP-001~VP-006 판정에 `backend 선행` 0개 (단, VP-006은 flag on 환경 존재 시에만)
- 신규 화면 전부 `npm run check` 통과
- reference-contract-map.md 완료 게이트(§8) 위반 0건
