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
| VP-001 | 인시던트 상세의 RemediationBundle 뷰 — 증거·진단·patch·rollback·검증 조건을 단일 문서로 표시, 다운로드 제공 | BQ-003 | `RCA_BUNDLE_PATH` = `GET /api/rca/bundles/{correlation_id}` · `RemediationBundleResponse` 3계층 meta/diagnosis/remediation · 앵커 `44f35234e` (`origin/dev` ancestor exit 0, progress·router 실물 확인) | 직결 | `RCA-004 RecoveryPlanSection`·`RCA-005 EvidenceTrail` 패턴 조합 + Port `Card`/`Collapsible`. supporting/missing 축소 금지 | `API 완성: getRemediationBundle (97c862da1)` |
| VP-002 | correlation 감사 타임라인 — 인시던트의 전체 이벤트 체인을 시간순 표시 | BQ-002+004 완료 | `AUDIT_TIMELINE_PATH` = `GET /api/audit/timeline?correlation_id=&cursor=&limit=` · `AuditTimelineResponse` · 앵커 `66cbe8dec7cb478f5b0774bb5e7bbaab5f616894` (`origin/dev` ancestor exit 0, progress·route·response 실물 확인) | 직결 | `UI-021 Item`·`Collapsible`·`Badge`, 불투명 cursor 페이지네이션. 서버 순서·workspace 판정을 신뢰하며 클라이언트 재필터 금지 | `API 완성: getAuditTimeline (4c2598c4a)` · UI RED `003a9563a` → GREEN `fdc921c3d` · 책임 분리 `9bedcdfa5` |
| VP-003 | 이벤트 여정 뷰 — VP-002 데이터를 워커 흐름(alert→evidence→rca→recovery→PR)으로 렌더 | BQ-004 착륙, 소비 계약 불완전 | 현재 `AuditTimelineItem`은 부모를 가리키는 `causation_id`만 반환하고 자기 `event_id`를 반환하지 않는다. backend workqueue가 인계 대상으로 명시한 subject 분류 목록도 canonical progress/API에 없다 | BE-Gap | `UI-056 TimelineSwimlane`은 inventory 선언만 있고 구현 선례는 없다. additive `event_id`와 subject→journey stage 정본 착륙 전에는 합성 key·prefix 추측·가짜 인과선 금지. 계약 착륙 뒤 causation_id가 연결되면 트리, null/미해결이면 서버 시간순으로 정직 강등하고 키보드 event list를 병행한다 | blocked — `AuditTimelineItem.event_id` + subject 분류 계약·앵커 필요 |
| VP-004 | 인시던트 상세 "최근 변경" 섹션 — "이 장애 N분 전 PR #x로 image y 배포됨" | BQ-005 | `RCA_RECENT_CHANGES_PATH` (예정) | backend 선행 | `RCA-002 IncidentWorkspace`에 섹션 추가. 변경 없으면 섹션 미렌더(빈 카드 금지) | 미요청 |
| VP-005 | 승격 게이트 표시 — release flow에서 "rollout health 통과로 승격됨" 근거 표시 | BQ-006 | workflow run의 optional `promotion_gate: PromotionGateResponse \| null` · 앵커 `8cd0b18e96f1266873d1632486472d0d22c18477` (`origin/dev` ancestor exit 0) | 직결 | 기존 release(flow) 화면 + `UI-020 StatusMark` | 미요청 |
| VP-006 | revert PR 상태 — 검증 실패로 자동 생성된 revert PR을 인시던트·release 화면에 표시 | BQ-007 | 기존 safe_pr 이벤트/조회 재사용 (신규 route 없음) | backend 선행 | 기존 repo approval card 패턴. **flag off 환경에서는 이 표면 전체 미렌더** | 미요청 |
| VP-007 | 클러스터-최상위 IA — 전역 Cluster selector가 URL 단일 권위로 전 화면 스코프 결정 + 연결된 Cluster 목록(이름·environment·connection·provider) | BQ-017 완료 | 기존 `CLUSTERS_PATH` + optional `provider` enum · 백엔드 코드 `db4798d4e`, canonical merge `d507ca6d4` (`origin/dev` ancestor exit 0) | 어댑터 | 셸 단일 `ClusterScopeProvider` + `UI-004 ScopePicker` + 단일 `ClusterProviderIcon`; 페이지별 목록 요청·selector 제거. provider는 표시 metadata로만 사용하고 화면·동작 분기 금지 | selector `2c4487d7b`; ProviderIcon `b4d1af3cd` |
| VP-008 | 클러스터 연결 위자드 고도화 — provider 선택→사전 명령→설치 원커맨드(만료 카운트다운)→연결 단계 실시간(token_issued→…→ready)→완료 | BQ-017 | 기존 install 토큰·위자드 경로 + providers catalog + BQ-017 `connection_stage`(대기) | backend 선행(단계 표시) / 그 외 기존 계약 | 기존 resources cluster wizard 확장. `UI-057 Custom wizard` 선례 + `Progress`·`Steps`. 미지원 provider는 generic으로 정직 표기 | 미요청 |
| VP-009 | provider 표시 일관화 — fleet heatmap·홈 카드·인시던트의 클러스터 표기에 동일 ProviderIcon 재사용 | BQ-017 | VP-007과 동일 필드 소비 | backend 선행 | 단일 컴포넌트 재사용, 중복 구현 금지 | 미요청 |

## 1b. VP-001 판정 비고 (2026-07-13, 검토자 확정)

> **착륙 확정 (2026-07-13 origin 재검증)**: BQ-003 앵커 `44f35234e`는
> `origin/dev`의 ancestor이며 `docs/backend-f-progress.md`와
> `src/domains/rca_bundle/router.py`도 canonical 실물로 확인했다. 이미 작성된 zod 스키마는
> 착륙본과 diff 대조하고 이상이 없을 때만 완료 절차를 밟는다.

- **zod 경계**: meta/diagnosis/remediation 전 계층을 strictObject로 엄격히 닫는다. 유일한
  open record는 `draft.params`(action_type별 가변)뿐이다. 엄격 close는 결합 완화 장치가
  아니라 **계약 드리프트 조기 탐지** 장치다 — candidate payload 구조가 바뀌면 백엔드
  serializer가 먼저 깨지고 zod는 그 다음이다. 결합의 실제 방어는 백엔드 측
  ("recovery candidate payload 구조 변경 = Bundle 계약 breaking change" 통지)이다.
- **zod 검증 실패 시 동작**: 계약 드리프트로 검증이 실패하면 fallback·부분 렌더·mock으로
  메우지 않는다. 명시적 오류/unavailable 상태로 표시한다(BE-Gap 규율 그대로).
- **`remediation: null`**: recovery plan 미생성의 정상 상태이며 HTTP 200이다.
  "복구 계획 없음"으로 정직 표시하고 가짜 값으로 채우지 않는다.
- **계층 분리**: `diagnosis.selected_candidate_id`(RCA 진단 후보 선택)와
  `remediation.selected_action_id`(복구 실행 후보 선택)는 서로 다른 계층이다.
  병합·상호 대체 금지.

## 1c. VP-005 `promotion_gate` 인계 비고 (2026-07-13, PROMOTE 후 이식)

- `promotion_gate`는 workflow run의 optional 구조화 read model이며, 값이 없으면 프론트가
  승격 가능 여부를 추측하거나 다른 필드로 보정하지 않는다.
- `PromotionGateResponse`는 `eligible`, `command_status`, `command_completed`, `applied`,
  `applied_not_false`, `failed_resources`, `failed_resource_count`, `rollout_ready`,
  `rollout_ready_not_false`를 제공한다.
- 백엔드의 단일 판정 원천 `promotion_gate_from_command_result`와 동일하게
  `command_completed=true`, `applied_not_false=true`, `failed_resource_count=0`,
  `rollout_ready_not_false=true`를 모두 만족할 때만 `eligible=true`다. 관측 윈도우는 이
  판정에 포함하지 않는다.
- 기존 `repo.md` 인계의 조회 규칙을 보존한다. run 목록은 재시도 없이 조회하고, 원본 run의
  동적 필드를 축소하지 않은 채 `promotion_gate`만 구조화해 소비한다. 활성 run이 하나라도
  있으면 10초, 그 외에는 60초 간격으로 폴링한다.

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
