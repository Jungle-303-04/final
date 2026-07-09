---
source_commit: 1960ed83
status: synced
---

# features/metrics — 스트림 메트릭·usage 시계열·온디맨드 PromQL

> 소스: `frontend/src/features/metrics/`

## 책임 (Responsibility)

- WS 스냅샷 히스토리 기반 실시간 시계열(재시작 추이·실행 팟)과 phase 스탯, 인벤토리 usage 롤업 시계열(사용량 추이) 카드, agent 경유 비동기 PromQL 쿼리 실행 UI.
- 저장형 metric query preset과 widget 정의를 조회·저장·삭제하고, 저장 쿼리 실행은 agent command 경로로 위임한다. 결과값은 프론트나 저장 API가 만들지 않는다.
- `api.ts` 는 PromQL dry-run 검증(`POST /metrics/validate`), 명령 상태 폴링(`GET /commands/{command_id}`), 저장형 metric query/widget API 훅, 텔레메트리 결과 요약을 담당한다 — 임의 완료 표시(고정 타이머·고정값 사용 결과) 금지.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get`, `post`, `del`), `@/shared/lib/live`(`liveStore`), `@/shared/lib/types`(`MetricQueryPreset`, `MetricWidget`), `@/shared/lib/ui-store` | [shared](shared.md) | 스트림·저장형 query/widget·toast |
| import | `@/ui`(`PageHeader`, `Card`, `Field`, `Input`, `Select`, `Textarea`, `StatCard`, `StatusChip`, `Skeleton`, `EmptyState`), `@/ui/charts`(`TimeSeriesChart`, `Series`), `@/ui/motion`(`AnimatePresence`, `listStagger`, `listItem`) | [shared](shared.md) | 디자인 시스템 프리미티브·Nivo 토큰 차트·Motion 프리셋 |
| import | `@/features/cluster/api`(`useClusters`, `useClusterSummary`, `useClusterUsage`, `usePods`), `@/features/metrics/usageSeries`(`buildUsageSeries`) | [cluster](./cluster.md) | 클러스터 선택 셀렉트·인벤토리 폴백 스탯·usage 시계열 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 클러스터 없음 empty state 의 등록 CTA 표시 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| 백엔드 | POST `/agent/debug/query`, GET `/commands/:id` | [api-gateway](../services/gateway-api-gateway.md) | 직접 PromQL 실행(비동기 수락) + 명령 상태 폴링 |
| 백엔드 | `/clusters/:id/metric-query-presets`, `/clusters/:id/metric-widgets` | [dashboard](../domains/dashboard.md) | 저장형 PromQL 정의·위젯 정의 CRUD, 저장 쿼리 실행 |
| 백엔드 | GET `/clusters/:id/usage` (cluster 훅 경유) | [api-gateway](../services/gateway-api-gateway.md) | usage 롤업 시계열 |
| 실시간 | `liveStore.history`/`status`/`snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 스트림 시계열·연결 배너·phase 스탯 |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `CommandStatus` | `frontend/src/features/metrics/api.ts :: CommandStatus` | `{ command_id; cluster_id; correlation_id; action; status: 'queued'\|'leased'\|'running'\|'completed'\|'failed'\|string; result: Record<string,unknown>; completed_at: string \| null }` |
| `isTerminal` | `frontend/src/features/metrics/api.ts :: isTerminal` | `(s: string \| undefined) => boolean` — `TERMINAL = {'completed','failed'}` 포함 여부 |
| `METRIC_QUERY_TIMEOUT_MS` | `frontend/src/features/metrics/api.ts :: METRIC_QUERY_TIMEOUT_MS` | `8_000` — 명령 상태와 저장형 query/widget 조회에만 적용 |
| `useCommandStatus` | `frontend/src/features/metrics/api.ts :: useCommandStatus` | `(commandId: string \| undefined)` → GET `/commands/${commandId}` with `{timeoutMs: 8_000}`. 쿼리키 `['commands', id]`, `enabled: !!commandId`, `retry:false`, **적응 폴링**: 터미널 상태면 중단, 아니면 2s |
| `metricKeys` | `frontend/src/features/metrics/api.ts :: metricKeys` | `queryPresets(clusterId)`, `widgets(clusterId)` query key factory |
| `MetricQueryPresetPayload` | `frontend/src/features/metrics/api.ts :: MetricQueryPresetPayload` | `{preset_id?, name, description?, source?, query, range_seconds?, step_seconds?, unit?, metadata?}` |
| `MetricWidgetPayload` | `frontend/src/features/metrics/api.ts :: MetricWidgetPayload` | `{widget_id?, query_preset_id, title, kind?, position?, settings?}` |
| `CommandAcceptedResponse` | `frontend/src/features/metrics/api.ts :: CommandAcceptedResponse` | `{accepted?, command_id, correlation_id?}` |
| `MetricValidationInput` | `frontend/src/features/metrics/api.ts :: MetricValidationInput` | `{query; rangeSeconds}` — UI range 가 1시간을 초과해도 dry-run API 계약에 맞춰 검증 range 는 최대 3600초로 cap |
| `MetricValidationResponse` | `frontend/src/features/metrics/api.ts :: MetricValidationResponse` | `{valid; code; detail; result_type?}` |
| `validateMetricQuery` | `frontend/src/features/metrics/api.ts :: validateMetricQuery` | POST `/metrics/validate` body `{source:'prometheus', query, range_seconds, step_seconds}` with `{timeoutMs: 8_000}` |
| `useMetricValidation` | `frontend/src/features/metrics/api.ts :: useMetricValidation` | debounce 된 query/range를 React Query로 dry-run 검증한다. 쿼리키 `['metric-query-validation', query, cappedRange]`, `retry:false`, `staleTime:30s` |
| `useMetricQueryPresets` | `frontend/src/features/metrics/api.ts :: useMetricQueryPresets` | GET `/clusters/${clusterId}/metric-query-presets` with `{timeoutMs: 8_000}` → `MetricQueryPreset[]`, enabled `!!clusterId`, `retry:false` |
| `useMetricWidgets` | `frontend/src/features/metrics/api.ts :: useMetricWidgets` | GET `/clusters/${clusterId}/metric-widgets` with `{timeoutMs: 8_000}` → `MetricWidget[]`, enabled `!!clusterId`, `retry:false` |
| `useUpsertMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useUpsertMetricQueryPreset` | POST `/clusters/${clusterId}/metric-query-presets`, 성공 시 query preset invalidate + ok toast |
| `useDeleteMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useDeleteMetricQueryPreset` | DELETE `/clusters/${clusterId}/metric-query-presets/${presetId}`, 성공 시 query preset/widget invalidate + ok toast |
| `useRunMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useRunMetricQueryPreset` | POST `/clusters/${clusterId}/metric-query-presets/${presetId}/run` → `CommandAcceptedResponse`; 결과는 `useCommandStatus`로 폴링 |
| `useUpsertMetricWidget` | `frontend/src/features/metrics/api.ts :: useUpsertMetricWidget` | POST `/clusters/${clusterId}/metric-widgets`, 성공 시 widget invalidate + ok toast |
| `useDeleteMetricWidget` | `frontend/src/features/metrics/api.ts :: useDeleteMetricWidget` | DELETE `/clusters/${clusterId}/metric-widgets/${widgetId}`, 성공 시 widget invalidate + ok toast |
| `QueryResultSummary` | `frontend/src/features/metrics/api.ts :: QueryResultSummary` | `{ series: number; points: number; avg: number \| null; max: number \| null }` |
| `summarizeTelemetryResult` | `frontend/src/features/metrics/api.ts :: summarizeTelemetryResult` | `(result: Record<string,unknown>) => QueryResultSummary \| null` — agent 가 올린 prometheus 결과(`result.result.results.<name>`)에서 실측 요약 계산. instant(`samples[]`)와 range(`series[].values[]`) 모두 지원, 숫자 값만 평균·최대에 반영. `results` 없으면 null |
| `commandResultMessage` | `frontend/src/features/metrics/api.ts :: commandResultMessage` | `(result) => string \| null` — `result.message` 가 비어있지 않은 문자열일 때만 반환 |
| `buildUsageSeries` | `frontend/src/features/metrics/usageSeries.ts :: buildUsageSeries` | `(samples: UsageSample[]) => Series[]` — `pod_running`은 `실행 팟`, `node_ready`는 `준비 노드`, `restart_total`은 샘플 간 `Math.max(0, current - previous)` 증가분으로 `재시작 증가` 시리즈를 만든다. `sampled_at`은 epoch ms, 파싱 실패는 1부터 시작하는 index |

## 컴포넌트

### `frontend/src/features/metrics/MetricsView.tsx :: MetricsView` (default export)

- 라우트: `/metrics`. 쿼리스트링 `cluster` — `clusterId` 초기값(기본 `''` — 목록 로드 후 effect 가 첫 클러스터로 보정. 목록에 없는 id 도 첫 클러스터로 대체). 선택 셀렉트 변경 시 `cluster` search param도 replace 갱신한다.
- 쿼리스트링 `subject`, `name`, `namespace` — 클러스터 상세의 컨텍스트 액션에서 넘어온 리소스 범위를 배지/code 행으로 표시하고 `buildContextPreset()`으로 리소스별 PromQL 초안을 채운다. 자동 실행은 하지 않는다.
- 모듈 상수(비공개):
  - 기본 쿼리 프리셋(`{label, promql, unit}` 6종 — 실측 계열만): 노드 CPU/메모리/파일시스템 사용률(ratio),
    팟 재시작율(5m, 네임스페이스별)·네임스페이스별 팟 수·sandbox 디플로이 레플리카(count).
    전체 카탈로그·근거는 [콘솔 메트릭·쿼리 카탈로그](../../frontend-metrics-queries.md).
  - `RANGES`: 5분/15분/1시간/6시간 → `range_seconds` 300/900/3600/21600.
  - `interface QueryCard { id: string; promql: string; unit: Unit; rangeSeconds: number; presetId?: string; commandId?: string; submitFailed?: boolean }` — 실행 상태는 카드에 저장하지 않고 명령 폴링에서 파생.
- state: `clusterId`, `paused: boolean`, `promql`, `presetName`, `selectedPresetId`, `widgetTitle`, `range`(초기 RANGES[0]=300), `cards: QueryCard[]`, `queryNotice`, `frozen`(일시정지 시점의 history 사본 — `paused` 아닐 때만 effect 로 최신 history 동기화), debounce 된 `promql`.
- 데이터: `useClusters` + `useClusterSummary(clusterId)` + `useClusterUsage(clusterId)` + `usePods(clusterId)` + `useIsAdmin()` + `useMetricQueryPresets(clusterId)` + `useMetricWidgets(clusterId)` + `useMetricValidation({query, rangeSeconds})` + 저장/삭제/실행/dry-run mutations + `liveStore(history/status/snapshot)`.
- 파생:
  - `phases`: 우선순위 — live 스냅샷 phase 카운트 → 인벤토리 summary `pod_phases` → workloads 집계(스트림 끊겨도 인벤토리로 스탯 유지).
  - `clusterKnown`: 현재 `clusterId`가 `useClusters()` 목록에 있는지 확인한다. 알 수 없는 `cluster` query 값이나 목록 로딩 중에는 select에 임시 option을 넣어 controlled select 상태를 유지한다.
  - `statPending`: `!clusterId || summaryQ.isPending || workloadsQ.isPending`. 이 동안 Running/Pending/CrashLoop/노드 값은 0이 아니라 `MetricStatCard`의 `확인 중`으로 표시해 아직 모르는 값을 0처럼 보이지 않게 한다.
  - `series`: `paused ? frozen : history` 중 `clusterId`가 비어 있거나 선택 `clusterId`와 같은 포인트만 필터링한 뒤 마지막 120포인트 → 숫자 x값(`at`)을 유지한 `[{id:'재시작'}, {id:'실행 팟'}]`. history 가 비어 있으면 차트 empty state 를 그대로 표시하고 인벤토리 기반 포인트를 만들지 않는다.
  - `usageSeries`: `buildUsageSeries(useClusterUsage samples)` 결과. `sampled_at`을 `Date.parse()` 숫자 x값(파싱 실패 시 1부터 시작하는 index)으로 유지하고, 시리즈는 `실행 팟(pod_running)`, `준비 노드(node_ready)`, `재시작 증가(restart_total 샘플 간 증가분)` 순서다. 카드는 항상 렌더하고 `usageQ.isPending`이면 스켈레톤, 오류면 재시도 empty state, 샘플이 없으면 "수집된 사용량 추이가 없습니다" empty state를 표시한다.
- 저장 쿼리/위젯:
  - `selectPreset(presetId)`: 저장 query를 선택해 `promql`, `presetName`, `range`, `widgetTitle`을 채운다.
  - `saveCurrentPreset()`: `metricPresetPayload()`로 `{name, source:'prometheus', query, range_seconds, step_seconds, unit, metadata.context?}`를 만들고 `useUpsertMetricQueryPreset`으로 저장한다. 결과 payload는 저장하지 않는다.
  - `saveCurrentWidget()`: 선택된 preset만 widget으로 저장한다. widget은 query preset id, title, kind, settings만 보관한다.
  - 저장 위젯 카드의 "실행"은 연결된 query preset을 `/metric-query-presets/{preset_id}/run`으로 실행한다.
- PromQL 실행 `execute(card?)` — 재시도 시 그 카드의 promql/unit/rangeSeconds/presetId를 재사용:
  1. 클릭 시점에 `POST /metrics/validate`를 다시 호출한다. `valid=false` 또는 API 오류면 카드 생성 없이 `queryNotice`/필드 오류로 사유를 표시한다.
  2. dry-run 통과 후 랜덤 id 카드(`promql/unit/rangeSeconds` 포함)를 목록 맨 앞에 추가. unit 은 인자 → 프리셋 매칭 → 'count' 순으로 결정.
  3. `presetId`가 있으면 `useRunMetricQueryPreset`으로 POST `/clusters/${clusterId}/metric-query-presets/${presetId}/run`. 없으면 `run.mutate({q, rangeSeconds})` → POST `/agent/debug/query` body `{cluster_id, query: {source:'prometheus', name:'console_promql', description:'Console PromQL query', query, range_seconds}}`.
  4. 성공: 카드에 `commandId` 기록(이후 상태는 `QueryCardRow` 가 폴링) + 성공 toast. 제출 실패: `submitFailed: true`와 인라인 사유.
- 결과 포맷: `fmtValue(v, unit)` — ratio 는 `%`(소수 1자리), count 는 100 이상 정수/미만 소수 2자리. 카드에 `범위 5m` 등 범위 표기, 평균·최대 표시.
- 클러스터 목록이 비어 있으면 `PageHeader` 다음 `EmptyState('등록된 클러스터가 없습니다')` 만 렌더한다. admin 은 `pathFor('/clusters')` 등록 버튼을 본다.
- 트리:
  ```
  section
  ├─ PageHeader('메트릭', actions=클러스터 Select(useClusters)+일시정지/재개 토글) — 빈 상태 분기와 동일 헤더
  ├─ subject/name/namespace search param 이 있으면 context 배지 행
  ├─ clustersQ.isError → Card > EmptyState(error message, 다시 시도)
  ├─ status !== 'open' → 경고 카드 '수집 지연'
  ├─ StatCard: 실행(success) / 대기(warning) / 재시작 오류(>0 이면 danger) / 노드(info)
  │   / statPending 이면 값 대신 `확인 중` 표시
  │   / snapshot.rollout 있으면 'rollout <name>'(progress, info)
  ├─ Card('실시간 추이') > TimeSeriesChart(series)
  ├─ Card('사용량 추이') > Skeleton | EmptyState(error/empty) | TimeSeriesChart(usageSeries)
  ├─ Card('저장 위젯') > GET `/metric-widgets`; 각 widget은 연결 preset 이름, 실행, 삭제 버튼
  └─ Card('PromQL 실행')
     ├─ 저장 쿼리 Select + 쿼리 이름 Input + 조회 범위 Select
     ├─ PromQL Textarea + debounce dry-run 검증 help/error
     ├─ 위젯 제목 Input + 저장/위젯 저장/실행 버튼(valid 일 때만 활성)
     ├─ query preset 로딩 오류 행과 선택된 saved preset metadata/delete 행
     └─ AnimatePresence(cards).map(QueryCardRow)   (data-testid="query-card")
  ```

내부(비공개) 서브컴포넌트:

`MetricStatCard { label: string; value: number; tone: StatTone; loading: boolean }`:

- `StatCard` 프리미티브만 사용한다. `loading === true`면 값에 `확인 중`을 표시해 아직 모르는 값을 0처럼 보이지 않게 한다.

`QueryCardRow { card: QueryCard; onRetry: () => void; onExpandRange: (rangeSeconds) => void }`:

- `useCommandStatus(card.commandId)` 로 명령 상태 폴링. 표시 status: `submitFailed` 면 'failed', 아니면 서버 status(기본 'queued'). `StatusChip` 매핑은 completed→healthy/완료, leased·running→running/실행 중, failed→failed/실패, 그 외 pending/대기다.
- completed: `summarizeTelemetryResult(result)` 요약(`N series · N pts · 평균 x.xx`), 요약 불가면 `commandResultMessage ?? '완료'`. points가 0이면 "결과 0건"과 "시간범위 넓히기" CTA를 표시한다.
- failed(서버): `commandResultMessage(result)` 를 danger 로 표시 + 재시도 버튼. 비터미널 + commandId 있음: `'실행 대기·수행 중'` 안내.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/metrics` | `MetricsView` | `RequireSession`+`ConsoleLayout` | `?cluster=` 로 초기 클러스터 지정. `subject`/`name`/`namespace`는 [cluster 상세](./cluster.md)의 ContextActions에서 넘긴 컨텍스트 표시용 |

## 불변식·오류 (Invariants & Errors)

- 일시정지는 렌더 고정일 뿐 history 수집(liveStore)은 멈추지 않는다(재개 시 최신으로 복귀).
- PromQL 결과는 **실측만** 표시 — `GET /commands/:id` 폴링(2s, 터미널이면 중단)으로 agent 가 올린 result 를 요약한다. 고정 타이머·고정값 사용 결과 금지.
- 저장형 query/widget API는 정의만 저장한다. 실행 결과는 저장하지 않고 command result 폴링으로만 표시한다.
- `restart_total`은 누적 카운터이므로 사용량 추이 카드에서는 누적값이 아니라 샘플 간 증가분으로 표시한다. 카운터 리셋처럼 현재값이 이전값보다 작아지면 증가분은 0으로 클램프한다.
- 스트림이 끊겨도 화면은 비지 않는다 — phase 스탯은 인벤토리(summary/workloads)로 폴백한다. 스트림 시계열은 history 가 없으면 합성 포인트 없이 차트 empty state 를 표시한다.
- summary/workload 로딩 중 스탯 값은 0으로 표시하지 않고 `—`로 표시한다. 0은 실제 응답 후 값이 0일 때만 표시된다.
- 시계열은 최근 120포인트로 제한. usage 시계열은 최대 288샘플(`?limit=288`).
