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
| VP-004 | 인시던트 상세 "최근 변경" 섹션 — 성공 배포의 절대 시각·workload·image·commit·workflow·허용 PR 링크 표시 | BQ-005 완료 | `RCA_RECENT_CHANGES_PATH` = `GET /api/rca/incidents/{incident_id}/recent-changes?limit=` · `RecentChangeListResponse` · 앵커 `81969f23e46cb40743af08ffbc1affe556bd5c5e` (`origin/dev` ancestor exit 0, progress·route·Bruno 실물 확인) | 직결 | `RCA-002 IncidentWorkspace`에 독립 섹션 추가. 서버가 incident event-time 이전 성공 배포만 반환하므로 클라이언트 상관 필터·재정렬 금지. 변경 없으면 섹션 미렌더(빈 카드 금지). 응답에 incident 발생 시각·구조화 PR 번호가 없으므로 "N분 전"·"PR #x"를 추측하지 않는다 | `API 완성: getIncidentRecentChanges (4f602cc86660a7f8a12583cffc44a53e220d9dbf)` · UI RED `f9a982f4f` → GREEN `78668b322` |
| VP-005 | 승격 게이트 표시 — release flow에서 네 가지 판정 조건과 현재 승격 가능 여부 표시 | BQ-006 | workflow run의 optional `promotion_gate: PromotionGateResponse \| null` · 앵커 `8cd0b18e96f1266873d1632486472d0d22c18477` (`origin/dev` ancestor exit 0) | 직결 | Applications release flow + `UI-020 StatusMark`. `eligible`은 승격 실행 완료가 아니라 현재 조건 판정이다 | `API 완성: listApplicationRuns (429fb1d91)` · UI blocked — cluster-scoped Applications 계약 필요 |
| VP-006 | revert PR 상태 — 검증 실패로 생성된 revert PR을 인시던트·release 화면에 표시 | BQ-007 착륙 | auto-revert worker·권위 patch canonical merge `6d68325bf1cc47f55810e5dc2189e51a6fe916c0` (`origin/dev` ancestor exit 0). 공개 projection은 generic Safe PR lifecycle만 제공하며 auto-revert discriminator를 누락한다 | BE-Gap | 공용 revert PR status card. structured auto-revert event가 없으면 제목·카드·empty state까지 전부 미렌더 | blocked — stable `trigger_kind=auto_revert`와 incident/run exact scope 계약 필요 |
| VP-007 | 클러스터-최상위 IA — 전역 Cluster selector가 URL 단일 권위로 전 화면 스코프 결정 + 연결된 Cluster 목록(이름·environment·connection·provider) | BQ-017 완료 | 기존 `CLUSTERS_PATH` + optional `provider` enum · 백엔드 코드 `db4798d4e`, canonical merge `d507ca6d4` (`origin/dev` ancestor exit 0) | 어댑터 | 셸 단일 `ClusterScopeProvider` + `UI-004 ScopePicker` + 단일 `ClusterProviderIcon`; 페이지별 목록 요청·selector 제거. provider는 표시 metadata로만 사용하고 화면·동작 분기 금지 | selector `2c4487d7b`; ProviderIcon `b4d1af3cd` |
| VP-008 | 클러스터 연결 위자드 고도화 — provider 선택→사전 명령→설치 원커맨드(연결 윈도우 카운트다운)→연결 단계 실시간(token_issued→…→ready)→완료 | BQ-017 완료 | `GET /providers/catalog`, `GET /providers/cluster-discovery`, `POST /targets/preflight`, `POST /targets`, `GET /clusters/{cluster_id}/connection-status` · wizard 기반 `65a71c7c`, timeout/bootstrap `101bc4a2`, one-line installer `98efb993`, preflight `26b9e2a9`, BQ-017 merge `d507ca6d4`(전부 `origin/dev` ancestor exit 0) | 어댑터 · 완성형 UI는 §1f 계약 갭으로 주차 | provider catalog의 `config_fields`와 discovery flow를 key로 결합하고 서버 명령만 표시한다. 등록 receipt의 token·manifest·commands는 메모리에만 보유한다. 5초 polling은 서버 stage를 권위로 사용하며 stage 회귀를 허용한다 | API 4함수 `8678d63b0` · 기존 `getClusterConnectionStatus` 앵커 `3d99514d6` · UI blocked (§1f) |
| VP-009 | provider 표시 일관화 — fleet heatmap·홈 카드·인시던트의 클러스터 표기에 동일 ProviderIcon 재사용 | BQ-017 완료 | VP-007의 optional `ClusterSummary.provider` 소비 | 어댑터 · Fleet BE-Gap (§1g) | 단일 `ClusterProviderIcon` 재사용. 전역 selector가 route scope를 1회 표시하고 Home 카드만 문맥 아이콘 1개를 추가한다. `unknown`은 일반 Kubernetes glyph이며 provider별 화면 분기 금지 | Home RED `a0e124b92`·`4a0937c54` → GREEN `3fe308f95`; Issues는 전역 selector `b4d1af3cd`; Fleet blocked (§1g) |
| VP-010 | workspace-only scope + 공통 다중 filter(Cluster·Namespace·Application·Label) + surface filter + Resources 표/graph + 점진 위자드 | 계약별 분할 필요 | `vp-010-unified-filter-ia.md`가 interaction·URL·BE-Gap 정본. VP-007의 single Cluster selection authority만 대체하고 catalog/provider/connection 자산은 재사용 | engine codec GREEN · surface 적용은 GAP-001~010별 주차 | 공용 `UnifiedFilterBar`와 pure URL codec/provider. 유한 구조 축은 tree/dropdown, 발견형 Label은 검색 popover다. 같은 구조 축 내부 OR, Label 내부 AND, 축 사이 AND. 상세는 filter 미적용·chip dim·filter 밖 고지 | codec RED→GREEN `a61e01990` · DNS segment 회귀 `99ebe7850` · 11 tests · GAP-004 전 Label UI/count 미렌더 |

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

## 1d. VP-005 화면 release blocker (2026-07-13)

- `listApplicationRuns`의 strict transport 계약은 완료됐다. 응답 외피는 strict, 개별 run은
  additive 필드를 보존하고 `promotion_gate`만 9필드 strict object로 검증한다.
- 전역 Cluster selector는 모든 화면 scope의 단일 권위다. 하지만 현재 application 목록과 run
  목록은 `cluster_id` query 및 cursor를 제공하지 않는다. 최대 500개를 받은 뒤 프론트에서
  재필터링하면 선택 Cluster의 전체 항목임을 증명할 수 없으므로 해당 표면을 release하지 않는다.
- 재개 조건은 두 목록의 서버측 `cluster_id` 필터와 opaque cursor(`next_cursor` 또는 동등한
  `has_more` 증거) 착륙이다. provider 이름 분기, N+1 deployment 조회, partial 목록을 complete로
  표시하는 우회는 금지한다.

## 1e. VP-006 auto-revert 식별 blocker (2026-07-13)

- BQ-007은 flag off에서 이벤트를 발행하지 않고, flag on에서도 일반 `safe_pr.requested`를
  발행한다. 현재 RCA timeline은 `current_subject`, `status`, `action_route`, `pr_url`,
  `error_reason`으로 generic Safe PR lifecycle을 표현하지만 요청의 origin을 projection하지 않는다.
- auto-revert worker의 `[auto-revert]` title prefix는 내부 구현 세부다. 제목 문자열, provider 이름,
  patch 경로를 파싱해 auto-revert를 추측하지 않는다. 일반 Safe PR을 revert PR로 잘못 표시하는
  것보다 표면을 미렌더하는 것이 정직하다.
- 최소 additive 계약은 stable discriminator(`trigger_kind: "auto_revert" | ...`)와
  correlation 또는 workflow run exact scope, stable event ID·event type·created time·nullable
  PR URL·실패 reason이다. nested status object는 strict close하고 title/body는 식별 근거로 쓰지 않는다.
- 별도 flag 조회가 없어도 structured auto-revert event가 0개면 섹션 전체를 미렌더해 flag-off UX를
  만족할 수 있다. 위 계약의 canonical anchor 전에는 APIQ·adapter·UI를 만들지 않는다.

## 1f. VP-008 연결 위자드 release blocker (2026-07-13)

- catalog의 `config_fields`와 discovery flow를 결합하면 provider 이름 분기 없이 입력 폼을 만들 수
  있고, preflight·등록·연결 stage polling의 기본 전송 계약도 착륙했다.
- 그러나 preflight는 등록 route의 provider bootstrap config 검사를 실행하지 않아 EKS/GKE/AKS의
  필수 config 누락을 `valid=true`로 통과시킬 수 있다. 프론트 metadata 검증은 보조 검증일 뿐 서버
  권위를 대체하지 않는다.
- token 발급 전 exact bootstrap command preview가 없고, 발급 뒤 브라우저 새로고침으로 1회성
  receipt를 잃었을 때 안전하게 재발급·재개하는 endpoint도 없다. 같은 ID를 다시 등록해 토큰을
  회전시키는 동작을 재시도 계약으로 추측하지 않는다.
- `connection_stage=error`는 구조화 reason·recovery action을 제공하지 않으며 preflight의
  errors/warnings도 locale-neutral code가 아닌 원문이다. 따라서 APIQ-033 transport는 완성하되
  비복구형·비재개형 마법사를 제품 표면에 release하지 않는다. 재개 조건은 preflight와 register의
  동일 validation, token 발급 전 command preview 또는 순서 변경 정본, 명시적 resume/reissue,
  structured stage reason/error code 계약이다.
- `connect_expires_at`은 agent credential 만료가 아니라 연결 대기 윈도우 종료 시각이다. UI에서
  "토큰 만료"로 번역하거나 자동 삭제·인증 폐기를 추측하지 않는다.

## 1g. VP-009 provider 표시 판정 (2026-07-13)

- Home은 선택된 `HomeClusterChoice.provider`를 상태 카드 헤더의 단일
  `ClusterProviderIcon`으로 표시한다. cluster가 없으면 아이콘도 렌더하지 않으며 provider를
  이름·environment·클러스터 ID에서 추측하지 않는다. `unknown`은 브랜드가 아닌 일반
  Kubernetes glyph다.
- Issues를 포함한 released route의 클러스터 문맥은 셸 상단의 전역 `ClusterScopePicker`가
  단일 권위로 이미 표시한다. 같은 provider를 Issues 목록·행·상세에 반복하면 위치 라벨 1회와
  텍스트 밀도 규칙을 위반하므로 로컬 아이콘을 중복 추가하지 않는다.
- 현재 제품 composition에는 Fleet surface나 fleet heatmap이 없고 `FleetClusterSummaryItem`에도
  provider가 없다. `/clusters`의 제한 목록을 fleet 응답에 클라이언트 join하면 전체 fleet의
  완전성을 증명할 수 없으므로 해당 부분은 BE-Gap이다. 재개 조건은 Fleet IA의 명시적 복원과
  `FleetClusterSummaryItem.provider` additive 계약 또는 completeness가 증명되는 서버 결합 응답이다.
- Fleet blocker를 Home·Issues 완료로 위장하지 않는다. surface·계약이 착륙하기 전에는 빈 카드,
  disabled placeholder, provider 추론, synthetic join을 만들지 않는다.

## 1h. VP-010이 VP-007을 대체하는 범위 (2026-07-13)

- VP-010은 VP-007의 **단일 Cluster 선택이 전 화면 scope의 유일한 권위**라는 의미만
  대체한다. workspace가 isolation scope이고 Cluster·Namespace·Application·Label은
  다중 filter다. filter 0개를 첫 Cluster로 자동 보정하지 않는다.
- VP-007의 cluster collection, `provider`, connection stage, `ClusterProviderIcon`, polling과
  failure isolation은 폐기하지 않는다. selection 책임을 filter engine으로 옮긴 뒤 facet
  catalog/presentation 자산으로 재사용한다.
- 기존 `cluster` URL과 Resources detail의 `kind` URL은 VP-010 §2.4의 dual-read,
  canonical-write 규칙으로 이행한다. migration 중에도 한 surface에 두 selection authority를
  동시에 표시하지 않는다.
- multi-cluster/namespace/application/label을 서버가 완전하게 적용할 계약이 없는 surface는
  client fan-out이나 truncated page post-filter로 흉내 내지 않는다. codec·RED suite만 선행하고
  VP-010 §9의 해당 GAP을 유지한다.
- Label facet은 현재 page나 inventory collection을 client에서 전수 집계하지 않는다.
  GAP-004가 착륙하기 전에는 URL codec·AND algebra만 구현하고 `[Labels]` 버튼·facet 목록·count는
  렌더하지 않는다. URL의 syntactically valid Label은 보존한다.

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
- VP-010 engine codec은 canonical URL round-trip·legacy migration·Label AND·화면 이동 보존
  RED/GREEN suite를 통과해야 한다. surface는 해당 GAP 계약과 앵커가 있는 항목만 완료로 판정한다.
- Label UI 완료는 GAP-004의 server facet/count/snapshot/completeness 계약, client 집계 0건,
  같은 key의 상충 value AND=0 검증을 모두 요구한다.
- 신규 화면 전부 `npm run check` 통과
- reference-contract-map.md 완료 게이트(§8) 위반 0건
