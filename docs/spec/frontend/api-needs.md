---
title: 프론트 API 요청 큐
status: active-coordination-queue
date: 2026-07-13
owners: Codex 요청 / API 연결 작업자 claim·처리 / F 트랙 행(APIQ-029)·계약 갱신(APIQ-012)은 검토자 기록
workorder: api-integration-workorder-20260711.md
snapshot: 16행·30함수 / requested 15 / in_progress 1 / blocked 0 / valid completion anchors 20
---

# 프론트 API 요청 큐

이 파일은 goalmode §6b의 단일 작업 큐다. API 작업자는 이 표에서 원자적으로 claim한 함수군만
`references/ui-layer-lab/src/product/api/**`에 구현·검증한다. Codex는 progress 파일에 정확한
`API 완성: <함수명> (<코드 커밋 hash>)` 앵커가 생긴 함수만 소비한다.

상세한 경로, 소유권, schema, test, mutation 안전, 2커밋 완료 절차는
`api-integration-workorder-20260711.md`가 정본이다.

> **다음 claim 고정 순서:** `APIQ-029` → `APIQ-012` → `APIQ-027`.
> 이미 원격에서 유효하게 `in_progress`인 행의 lease를 우선하고, 각 행의 완료 앵커와 조율
> 커밋이 원격에 반영된 뒤에만 다음 행을 claim한다.

## 1. 상태와 claim 규칙

1. 상태는 `requested`, `in_progress`, `blocked`만 쓴다.
2. claim 전 최신 원격의 queue와 progress를 확인한다.
3. `requested` 행 하나를 `in_progress`로 바꾸고 `담당/브랜치`, `claim·heartbeat`를 채운 조율
   커밋을 먼저 push한다.
4. 전체 queue에서 `in_progress`는 동시에 한 행만 허용한다. 이것이 모든 행이 공유하는 `index.ts`와
   일부 공용 schema·test 파일의 file lock이다. 한 행의 일부 함수만 claim하지 않는다.
5. `in_progress`의 마지막 heartbeat가 24시간 지나기 전에는 다른 작업자나 Codex가 인수하지
   않는다. 회수 커밋이 원격에 반영된 뒤에만 재claim할 수 있다.
6. blocker가 생기면 상태를 `blocked`로 바꾸고 원인·재현·선행 작업·재개 조건을 비고에 적는다.
7. 코드 커밋 A가 `origin/woonyong/ui-layer-lab`에 push되고 full gate가 통과한 뒤 progress EOF에
   함수별 exact 앵커를 추가한다. 앵커 hash는 canonical branch의 ancestor여야 한다.
8. 함수군의 모든 앵커가 확인된 뒤에만 행을 제거한다. 완료 전 일부 함수 export를 제품이 소비하지
   않는다.
9. `client.ts`, `url.ts`, 화면, adapter, backend는 이 큐의 수정 권한 밖이다.
10. canonical branch force-push 금지. feature branch를 썼다면 merge/cherry-pick 후의 최종 hash만
    앵커로 기록하고, squash/rebase로 이미 기록한 hash를 제거하지 않는다.
11. 24시간 대행도 `in_progress` 1행 lock과 코드·조율 2커밋 절차를 그대로 지킨다. `APIQ-001`,
    `APIQ-002`, `APIQ-003`, `APIQ-004`, `APIQ-007`, `APIQ-008`, `APIQ-022`, `APIQ-023`, `APIQ-024`, `APIQ-025`, `APIQ-026`은 완료 앵커가 있으므로
    다음 대행은 queue의 P0·P1·P2 순서를 따른다. 원 요청 시각·대행
    시작 시각·경과 시간·사유를 progress EOF에 남긴다.
12. API 작업자가 복귀하면 대행자가 이미 claim한 행만 완료하고 다음 행부터 양보한다.
13. `index.ts` 병목은 임의 barrel 분리의 근거가 아니다. progress에 도메인별 barrel 제안서를 먼저
    올리고 검토자 승인을 받은 뒤에만 구조를 변경한다.

queue coordinator와 행 분할·회수·unblock 승인 주체는 현재 primary Codex 작업(`/root`)이다.
`claim·heartbeat`는 queue 시각 갱신 커밋이 canonical branch에 push된 경우에만 유효하다. 대상 파일의
`test` 표기는 첫 endpoint 파일과 같은 stem의 `<domain>.test.ts`다.

시각 형식:

```text
담당/브랜치: <작업자 식별자>@<branch>
claim·heartbeat: YYYY-MM-DD HH:mm KST
```

## 2. 신규 endpoint 함수·schema

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
| `APIQ-005` | P2 | `listRcaTimeline` | `DASHBOARD_RCA_TIMELINE_PATH` | `rca-list.ts`, `rca-list-schemas.ts`, test | Issues / Timeline / resource detail | 2026-07-11 16:19 KST | requested | — | — | `cluster_id?`, `limit=50`(1..100), signal; teaser 함수와 분리 |
| `APIQ-006` | P2 | `listApplications`, `getApplication`, `listApplicationDeployments`, `listApplicationRuns` | `APPLICATIONS_PATH`, `APPLICATION_PATH`, `APPLICATION_DEPLOYMENTS_PATH`, `APPLICATION_RUNS_PATH` | `applications.ts`, `applications-schemas.ts`, test | Applications / GitOps / history | 2026-07-11 16:19 KST | requested | — | — | list limit 1..500; 내부 JsonMap 보존; cursor/filter 발명 금지 |
| `APIQ-009` | P2 | `getClusterResourceUsageSeries` | `CLUSTER_USAGE_PATH` | `usage-series.ts`, `usage-series-schemas.ts`, test | Pod·Node history / top metrics | 2026-07-11 16:19 KST | requested | — | — | limit 1..2000; `samples[].usage` JsonMap 보존; rollup으로 대체 금지 |
| `APIQ-010` | P2 | `listMetricQueryPresets`, `runMetricQueryPreset` | `CLUSTER_METRIC_QUERY_PRESETS_PATH`, `CLUSTER_METRIC_QUERY_PRESET_RUN_PATH` | `metric-presets.ts`, `metric-presets-schemas.ts`, test | resource·PVC Metrics | 2026-07-11 16:19 KST | requested | — | — | run body 없음; `AgentDebugQueryResponse`, HTTP 200 receipt |
| `APIQ-011` | P2 | `runTelemetryQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | `telemetry.ts`, `telemetry-schemas.ts`, test | Pod log snapshot | 2026-07-11 16:19 KST | requested | — | — | `APIQ-027` 완료 앵커 의존; 완료 전 claim 금지. 명시적 AGENT_* browser 예외; POST 1회; source literal 보존 |
| `APIQ-012` | P3 | `submitCommand` | `COMMANDS_PATH` | `commands.ts`, `commands-schemas.ts`, test | Resources apply / remediation | 2026-07-11 16:19 KST | requested | — | — | `AcceptedResponse` 200 + `command_id: string \| null` (BQ-001 앵커 `4e6216052` — **canonical dev 착륙 여부는 §4b 절차로 공유 worktree progress에서 확인 후 착수**, `Cross-Gap-001` 해소). non-null=승인 불필요 경로 → `GET /commands/{id}` 상태 추적. null=승인 필요 경로(백엔드가 제출 시점에 구조적으로 파생 불가) — **프론트에서 command_id 계산·추측 금지, null이면 null**. null 분기의 폴링·"추적 지연" 표시는 adapter 소유(Codex), 이 함수는 receipt 반환까지만. optimistic 완료 표시 금지 |
| `APIQ-013` | P2 | `grantApproval`, `rejectApproval` | `APPROVAL_GRANT_PATH`, `APPROVAL_REJECT_PATH` | `approvals.ts`, `approvals-schemas.ts`, test | Applications / GitOps approval | 2026-07-11 17:17 KST | requested | — | — | body absent/null/`{}` 허용; reason nullable; 404/409; POST 재전송 금지 |
| `APIQ-014` | P3 | `restartDeployment`, `scaleDeployment` | `CLUSTER_DEPLOYMENT_RESTART_PATH`, `CLUSTER_DEPLOYMENT_SCALE_PATH` | `deployments.ts`, `deployments-schemas.ts`, test | Resources workload actions | 2026-07-11 16:19 KST | requested | — | — | body·path strict; accepted 200에 command_id 없음; live mutation 승인 필요 |
| `APIQ-015` | P3 | `listCatalogItems`, `getCatalogItem` | `CATALOG_ITEMS_PATH`, `CATALOG_ITEM_PATH` | `catalog.ts`, `catalog-schemas.ts`, test | provider-neutral Catalog | 2026-07-11 16:19 KST | requested | — | — | item JsonMap 보존; pagination/filter 발명 금지; install 제외 |
| `APIQ-016` | P2 | `getRcaIncident` | `DASHBOARD_RCA_INCIDENT_PATH` | `rca-detail.ts`, `rca-detail-schemas.ts`, test | Issues incident 상세 | 2026-07-11 16:19 KST | requested | — | — | incident path + `cluster_id?`; stable incident id가 있을 때만 호출 |
| `APIQ-017` | P2 | `getRecoveryPlanByCorrelation`, `selectRecoveryAction` | `RCA_RECOVERY_PLAN_BY_CORRELATION_PATH`, `RCA_RECOVERY_ACTION_SELECT_PATH` | `recovery.ts`, `recovery-schemas.ts`, test | incident 상세 복구 조치 | 2026-07-11 16:19 KST | requested | — | — | selection body 필수·`{}` 허용; receipt 200; 409 후 plan 재조회는 adapter 소유 |
| `APIQ-018` | P2 | `listEvidence`, `listRcaReports` | `EVIDENCE_QUERY_PATH`, `RCA_REPORTS_PATH` | `evidence.ts`, `evidence-schemas.ts`, test | evidence trail / AI 분석 | 2026-07-11 16:19 KST | requested | — | — | ISO time, limit/offset/cursor, next_cursor 보존; correlation 없으면 호출 안 함 |
| `APIQ-019` | P2 | `listAiConversations`, `getAiConversation`, `createAiConversation`, `appendAiMessage` | `AI_CONVERSATIONS_PATH`, `AI_CONVERSATION_PATH`, `AI_CONVERSATION_MESSAGES_PATH` | `conversations.ts`, `conversations-schemas.ts`, test | global AI conversation drawer | 2026-07-11 16:19 KST | requested | — | — | 내부 JsonMap·status string 보존; create/append 200 receipt; POST 재전송 금지 |
| `APIQ-020` | P1 | `deleteAiConversation` | `AI_CONVERSATION_PATH` | `conversations.ts`, `conversations-schemas.ts`, test | AI conversation 삭제 | 2026-07-11 21:55 KST | requested | — | — | `BLOCK-204-001` 해소: `af03639ee`. raw body가 정확히 빈 204/205만 `apiRequestNoContent`로 처리; 직접 fetch·가짜 JSON 금지 |
| `APIQ-029` | P2 | `getRemediationBundle` | `RCA_BUNDLE_PATH` | `rca-bundle.ts`, `rca-bundle-schemas.ts`, test | incident 상세 RemediationBundle 뷰 (VP-001) | 2026-07-13 | in_progress **(동결 — 착륙 대기)** | `Codex-API@woonyong/ui-layer-lab` | 2026-07-13 03:59 KST | **[착륙 대기 — 앵커 미유효]** BQ-003 앵커 `44f35234e`는 canonical dev 미착륙(f-coordination-plan §4b — 앵커 확인은 공유 dev worktree `docs/backend-f-progress.md` 단일 수단). 작성한 스키마·함수는 폐기하지 않되 동결: **완료 앵커 기록 금지, 화면·adapter 소비 금지.** merge 착륙 + 백엔드 ancestor 재증명 후 착륙본과 diff 대조, 이상 없을 때만 완료 절차 재개. 3계층 meta/diagnosis/remediation 전부 strictObject close — 유일한 open record는 `draft.params`(action_type별 가변). `remediation: null` = plan 미생성 정상 상태(HTTP 200), 가짜 값 대체 금지. `diagnosis.selected_candidate_id`와 `remediation.selected_action_id`는 다른 계층 — 병합·상호 대체 금지. zod 검증 실패 시 fallback·부분 렌더 금지(오류 그대로 반환, 표시 정책은 adapter/화면 소유). 필드 정본: dev repo `docs/backend-f-progress.md` BQ-003 프론트 인계 절 + `docs/spec/remediation-bundle.schema.json` + Bruno `docs/api/05-rca-dashboard/13-remediation-bundle.bru` |

## 3. 기존 구현 검증·승인

아래 함수는 이미 존재하지만 exact 완료 앵커가 없다. claim한 작업자는 실응답·schema·URL·오류·
AbortSignal contract test를 추가하고, 필요한 경우 claim 범위 안에서만 구현을 보정한다. 코드 변경이
없어도 test commit hash가 완료 앵커의 코드 hash가 된다.

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
| `APIQ-027` | P2 | `submitPrometheusQuery`, `getCommandStatus`, `pollCommand`, `runPrometheusQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | `metrics.ts`, `metrics-schemas.ts`, `metrics.test.ts` | Metrics / operation progress | 2026-07-11 16:19 KST | requested | — | — | possibly-sent POST 재전송 0, polling GET만, terminal/timeout/abort, API-owned fixture |

## 4. 큐 밖 Backend gap과 realtime

- route 자체가 없는 `BE-Gap-*`은 이 큐에 넣지 않는다. backend semantic contract가 먼저다.
- repo/provider/target/org/alert/dead-letter 함수는 현재 필요한 화면이 확정되지 않아 아직 요청하지
  않았다. routes가 있다는 이유만으로 만들지 않는다.
- WebSocket `/api/live/browser`는 HTTP queue와 분리한다. connection·handshake·resume·sequence gap
  contract test와 `API 완성: connectRealtime (<hash>)` 앵커 전에는 제품에서 소비하지 않는다.
- `client.ts`는 `af03639ee`의 no-content 계약 이후 다시 동결됐다. transport 변경이 다시 필요하면
  해당 행을 새 blocker ID로 `blocked` 처리하고 coordinator 승인을 기다린다.
