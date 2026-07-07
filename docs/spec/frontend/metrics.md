---
source_commit: dfd9c4fb
status: synced
---

# features/metrics — 실시간 메트릭·usage 시계열·온디맨드 PromQL

> 소스: `frontend/src/features/metrics/`

## 책임 (Responsibility)

- WS 스냅샷 히스토리 기반 실시간 시계열(재시작 추이·실행 팟)과 phase 스탯, 인벤토리 usage 롤업 시계열(스냅샷 추이) 카드, agent 경유 비동기 PromQL 쿼리 실행 UI.
- 저장형 metric query preset과 widget 정의를 조회·저장·삭제하고, 저장 쿼리 실행은 agent command 경로로 위임한다. 결과값은 프론트나 저장 API가 만들지 않는다.
- `api.ts` 는 명령 상태 폴링(`GET /commands/{command_id}`), 저장형 metric query/widget API 훅, 텔레메트리 결과 요약을 담당한다 — 가짜 완료 표시(고정 타이머·하드코딩 결과) 금지.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get`, `post`, `del`), `@/shared/lib/live`(`liveStore`), `@/shared/lib/types`(`MetricQueryPreset`, `MetricWidget`, `Tone`), `@/shared/lib/ui-store`, `@/shared/ui`, `@/shared/ui/charts`(`TimeSeriesChart`, `Series`), `@/shared/motion` | [shared](shared.md) | 실시간·차트·저장형 query/widget |
| import | `@/features/cluster/api`(`useClusters`, `useClusterSummary`, `useClusterUsage`, `usePods`) | [cluster](./cluster.md) | 클러스터 선택 셀렉트·인벤토리 폴백 스탯·usage 시계열 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 클러스터 없음 empty state 의 등록 CTA 표시 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| 백엔드 | POST `/agent/debug/query`, GET `/commands/:id` | [api-gateway](../services/gateway-api-gateway.md) | 직접 PromQL 실행(비동기 수락) + 명령 상태 폴링 |
| 백엔드 | `/clusters/:id/metric-query-presets`, `/clusters/:id/metric-widgets` | [dashboard](../domains/dashboard.md) | 저장형 PromQL 정의·위젯 정의 CRUD, 저장 쿼리 실행 |
| 백엔드 | GET `/clusters/:id/usage` (cluster 훅 경유) | [api-gateway](../services/gateway-api-gateway.md) | usage 롤업 시계열 |
| 실시간 | `liveStore.history`/`status`/`snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 시계열·연결 배너·phase 스탯 |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `CommandStatus` | `frontend/src/features/metrics/api.ts :: CommandStatus` | `{ command_id; cluster_id; correlation_id; action; status: 'queued'\|'leased'\|'running'\|'completed'\|'failed'\|string; result: Record<string,unknown>; completed_at: string \| null }` |
| `isTerminal` | `frontend/src/features/metrics/api.ts :: isTerminal` | `(s: string \| undefined) => boolean` — `TERMINAL = {'completed','failed'}` 포함 여부 |
| `useCommandStatus` | `frontend/src/features/metrics/api.ts :: useCommandStatus` | `(commandId: string \| undefined)` → GET `/commands/${commandId}`. 쿼리키 `['commands', id]`, `enabled: !!commandId`, **적응 폴링**: 터미널 상태면 중단, 아니면 2s |
| `metricKeys` | `frontend/src/features/metrics/api.ts :: metricKeys` | `queryPresets(clusterId)`, `widgets(clusterId)` query key factory |
| `MetricQueryPresetPayload` | `frontend/src/features/metrics/api.ts :: MetricQueryPresetPayload` | `{preset_id?, name, description?, source?, query, range_seconds?, step_seconds?, unit?, metadata?}` |
| `MetricWidgetPayload` | `frontend/src/features/metrics/api.ts :: MetricWidgetPayload` | `{widget_id?, query_preset_id, title, kind?, position?, settings?}` |
| `CommandAcceptedResponse` | `frontend/src/features/metrics/api.ts :: CommandAcceptedResponse` | `{accepted?, command_id, correlation_id?}` |
| `useMetricQueryPresets` | `frontend/src/features/metrics/api.ts :: useMetricQueryPresets` | GET `/clusters/${clusterId}/metric-query-presets` → `MetricQueryPreset[]`, enabled `!!clusterId` |
| `useMetricWidgets` | `frontend/src/features/metrics/api.ts :: useMetricWidgets` | GET `/clusters/${clusterId}/metric-widgets` → `MetricWidget[]`, enabled `!!clusterId` |
| `useUpsertMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useUpsertMetricQueryPreset` | POST `/clusters/${clusterId}/metric-query-presets`, 성공 시 query preset invalidate + ok toast |
| `useDeleteMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useDeleteMetricQueryPreset` | DELETE `/clusters/${clusterId}/metric-query-presets/${presetId}`, 성공 시 query preset/widget invalidate + ok toast |
| `useRunMetricQueryPreset` | `frontend/src/features/metrics/api.ts :: useRunMetricQueryPreset` | POST `/clusters/${clusterId}/metric-query-presets/${presetId}/run` → `CommandAcceptedResponse`; 결과는 `useCommandStatus`로 폴링 |
| `useUpsertMetricWidget` | `frontend/src/features/metrics/api.ts :: useUpsertMetricWidget` | POST `/clusters/${clusterId}/metric-widgets`, 성공 시 widget invalidate + ok toast |
| `useDeleteMetricWidget` | `frontend/src/features/metrics/api.ts :: useDeleteMetricWidget` | DELETE `/clusters/${clusterId}/metric-widgets/${widgetId}`, 성공 시 widget invalidate + ok toast |
| `QueryResultSummary` | `frontend/src/features/metrics/api.ts :: QueryResultSummary` | `{ series: number; points: number; avg: number \| null; max: number \| null }` |
| `summarizeTelemetryResult` | `frontend/src/features/metrics/api.ts :: summarizeTelemetryResult` | `(result: Record<string,unknown>) => QueryResultSummary \| null` — agent 가 올린 prometheus 결과(`result.result.results.<name>`)에서 실측 요약 계산. instant(`samples[]`)와 range(`series[].values[]`) 모두 지원, 숫자 값만 평균·최대에 반영. `results` 없으면 null |
| `commandResultMessage` | `frontend/src/features/metrics/api.ts :: commandResultMessage` | `(result) => string \| null` — `result.message` 가 비어있지 않은 문자열일 때만 반환 |

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
- state: `clusterId`, `paused: boolean`, `promql`, `presetName`, `selectedPresetId`, `widgetTitle`, `range`(초기 RANGES[0]=300), `cards: QueryCard[]`, `frozen`(일시정지 시점의 history 사본 — `paused` 아닐 때만 effect 로 최신 history 동기화).
- 데이터: `useClusters` + `useClusterSummary(clusterId)` + `useClusterUsage(clusterId)` + `usePods(clusterId)` + `useIsAdmin()` + `useMetricQueryPresets(clusterId)` + `useMetricWidgets(clusterId)` + 저장/삭제/실행 mutations + `liveStore(history/status/snapshot)`.
- 파생:
  - `phases`: 우선순위 — live 스냅샷 phase 카운트 → 인벤토리 summary `pod_phases` → workloads 집계(스트림 끊겨도 인벤토리로 스탯 유지).
  - `clusterKnown`: 현재 `clusterId`가 `useClusters()` 목록에 있는지 확인한다. 알 수 없는 `cluster` query 값이나 목록 로딩 중에는 select에 임시 option을 넣어 controlled select 상태를 유지한다.
  - `statPending`: `!clusterId || summaryQ.isPending || workloadsQ.isPending`. 이 동안 Running/Pending/CrashLoop/노드 값은 0이 아니라 `MetricStatBox`의 `—`로 표시해 아직 모르는 값을 0처럼 보이지 않게 한다.
  - `series`: `paused ? frozen : history` 마지막 120포인트 → `[{id:'재시작 합'}, {id:'실행 팟'}]`. history 가 비어 있으면 인벤토리 기반 1포인트(재시작 합·Running 수)로 대체.
  - `usageSeries`: `useClusterUsage` samples → `[{id:'실행 팟', y:usage.pod_running}, {id:'재시작 누적', y:usage.restart_total}, {id:'준비 노드', y:usage.node_ready}]`. 카드는 항상 렌더하고 `usageQ.isPending`이면 스켈레톤, 오류면 재시도 empty state, 샘플이 없으면 "아직 수집된 스냅샷 시계열이 없습니다" empty state를 표시한다.
- 저장 쿼리/위젯:
  - `selectPreset(presetId)`: 저장 query를 선택해 `promql`, `presetName`, `range`, `widgetTitle`을 채운다.
  - `saveCurrentPreset()`: `metricPresetPayload()`로 `{name, source:'prometheus', query, range_seconds, step_seconds, unit, metadata.context?}`를 만들고 `useUpsertMetricQueryPreset`으로 저장한다. 결과 payload는 저장하지 않는다.
  - `saveCurrentWidget()`: 선택된 preset만 widget으로 저장한다. widget은 query preset id, title, kind, settings만 보관한다.
  - 저장 위젯 카드의 "실행"은 연결된 query preset을 `/metric-query-presets/{preset_id}/run`으로 실행한다.
- PromQL 실행 `execute(card?)` — 재시도 시 그 카드의 promql/unit/rangeSeconds/presetId를 재사용:
  1. 랜덤 id 카드(`promql/unit/rangeSeconds` 포함)를 목록 맨 앞에 추가. unit 은 인자 → 프리셋 매칭 → 'count' 순으로 결정.
  2. `presetId`가 있으면 `useRunMetricQueryPreset`으로 POST `/clusters/${clusterId}/metric-query-presets/${presetId}/run`. 없으면 `run.mutate({q, rangeSeconds})` → POST `/agent/debug/query` body `{cluster_id, query: {source:'prometheus', name:'console_promql', description:'Console PromQL query', query, range_seconds}}`.
  3. 성공: 카드에 `commandId` 기록(이후 상태는 `QueryCardRow` 가 폴링). 제출 실패: `submitFailed: true`.
- 결과 포맷: `fmtValue(v, unit)` — ratio 는 `%`(소수 1자리), count 는 100 이상 정수/미만 소수 2자리. 카드에 `range 5m` 등 범위 표기, 평균·최대 표시.
- 클러스터 목록이 비어 있으면 `PageHeader` 다음 `EmptyState` 만 렌더한다. admin 은 `pathFor('/clusters')` 등록 버튼을 보고, non-admin 은 접근 가능한 클러스터가 연결되면 표시된다는 안내만 본다.
- 트리:
  ```
  FadeSlideIn
  ├─ PageHeader('메트릭', actions=클러스터 select(useClusters)+⏸ 일시정지/▶ 재개 토글) — 빈 상태 분기와 동일 헤더
  ├─ subject/name/namespace search param 이 있으면 context 배지 행
  ├─ status !== 'open' → 경고 카드 '실시간 스트림 재연결 중 — 최신 인벤토리 스냅샷을 표시합니다'
  ├─ MetricStatBox: Running(ok) / Pending(warn) / CrashLoop(>0 이면 danger) / 노드(summary.nodes.length, info)
  │   / statPending 이면 값 대신 `—` 표시
  │   / snapshot.rollout 있으면 'rollout <name>'(progress, info)
  ├─ Card('실시간 — 재시작 추이 / 실행 팟') > TimeSeriesChart(series)
  ├─ Card('스냅샷 추이 — 인벤토리 실측 (usage rollup)') > Skeleton | EmptyState(error/empty) | TimeSeriesChart(usageSeries)
  ├─ Card('저장 위젯') > GET `/metric-widgets`; 각 widget은 연결 preset 이름, 실행, 삭제 버튼
  └─ Card('PromQL')
     ├─ 입력줄: 저장 쿼리 select + presetName + promql input(mono) + range + 저장/위젯/실행 버튼
     ├─ query preset 로딩 오류 행과 선택된 saved preset metadata/delete 행
     └─ AnimatedList(cards).map(QueryCardRow)   (data-testid="query-card")
  ```

내부(비공개) 서브컴포넌트:

`MetricStatBox { label: string; value: number; tone?: Tone; loading: boolean }`:

- `loading === true`면 `StatBox`를 쓰지 않고 `.statbox` 안에 `—`와 label만 표시한다. 메트릭/워크로드를 아직 불러오는 동안 0을 실측값처럼 보이지 않게 하는 장치다.

`QueryCardRow { card: QueryCard; onRetry: () => void }`:

- `useCommandStatus(card.commandId)` 로 명령 상태 폴링. 표시 status: `submitFailed` 면 'failed', 아니면 서버 status(기본 'queued'). Badge 매핑: completed→'done', leased→'running', 그 외 그대로.
- completed: `summarizeTelemetryResult(result)` 요약(`N series · N pts · 평균 x.xx`), 요약 불가면 `commandResultMessage ?? '완료'`.
- failed(서버): `commandResultMessage(result)` 를 danger 로 표시 + 재시도 버튼. 비터미널 + commandId 있음: `'agent 실행 대기·수행 중'` 안내.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/metrics` | `MetricsView` | `RequireSession`+`ConsoleLayout` | `?cluster=` 로 초기 클러스터 지정. `subject`/`name`/`namespace`는 [cluster 상세](./cluster.md)의 ContextActions에서 넘긴 컨텍스트 표시용 |

## 불변식·오류 (Invariants & Errors)

- 일시정지는 렌더 고정일 뿐 history 수집(liveStore)은 멈추지 않는다(재개 시 최신으로 복귀).
- PromQL 결과는 **실측만** 표시 — `GET /commands/:id` 폴링(2s, 터미널이면 중단)으로 agent 가 올린 result 를 요약한다. 고정 타이머·하드코딩 결과 금지.
- 저장형 query/widget API는 정의만 저장한다. 실행 결과는 저장하지 않고 command result 폴링으로만 표시한다.
- 실시간 스트림이 끊겨도 화면은 비지 않는다 — phase 스탯·시계열 시드는 인벤토리(summary/workloads)로 폴백.
- summary/workload 로딩 중 스탯 값은 0으로 표시하지 않고 `—`로 표시한다. 0은 실제 응답 후 값이 0일 때만 표시된다.
- 시계열은 최근 120포인트로 제한. usage 시계열은 최대 288샘플(`?limit=288`).
