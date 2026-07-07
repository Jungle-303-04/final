---
source_commit: 664925a6
status: synced
---

# features/metrics — 실시간 메트릭·usage 시계열·온디맨드 PromQL

> 소스: `frontend/src/features/metrics/`

## 책임 (Responsibility)

- WS 스냅샷 히스토리 기반 실시간 시계열(재시작 추이·실행 팟)과 phase 스탯, 인벤토리 usage 롤업 시계열(스냅샷 추이) 카드, agent 경유 비동기 PromQL 쿼리 실행 UI.
- `api.ts` 는 명령 상태 폴링(`GET /commands/{command_id}`)과 텔레메트리 결과 요약을 담당한다 — 가짜 완료 표시(고정 타이머·하드코딩 결과) 금지.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get`, `post`), `@/shared/lib/live`(`liveStore`), `@/shared/ui`, `@/shared/ui/charts`(`TimeSeriesChart`, `Series`), `@/shared/motion` | [shared](shared.md) | 실시간·차트 |
| import | `@/features/cluster/api`(`useClusters`, `useClusterSummary`, `useClusterUsage`, `useWorkloads`) | [cluster](./cluster.md) | 클러스터 선택 셀렉트·인벤토리 폴백 스탯·usage 시계열 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 클러스터 없음 empty state 의 등록 CTA 표시 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| 백엔드 | POST `/agent/debug/query`, GET `/commands/:id` | [api-gateway](../services/gateway-api-gateway.md) | 온디맨드 PromQL(비동기 수락) + 명령 상태 폴링 |
| 백엔드 | GET `/clusters/:id/usage` (cluster 훅 경유) | [api-gateway](../services/gateway-api-gateway.md) | usage 롤업 시계열 |
| 실시간 | `liveStore.history`/`status`/`snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 시계열·연결 배너·phase 스탯 |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `CommandStatus` | `frontend/src/features/metrics/api.ts :: CommandStatus` | `{ command_id; cluster_id; correlation_id; action; status: 'queued'\|'leased'\|'running'\|'completed'\|'failed'\|string; result: Record<string,unknown>; completed_at: string \| null }` |
| `isTerminal` | `frontend/src/features/metrics/api.ts :: isTerminal` | `(s: string \| undefined) => boolean` — `TERMINAL = {'completed','failed'}` 포함 여부 |
| `useCommandStatus` | `frontend/src/features/metrics/api.ts :: useCommandStatus` | `(commandId: string \| undefined)` → GET `/commands/${commandId}`. 쿼리키 `['commands', id]`, `enabled: !!commandId`, **적응 폴링**: 터미널 상태면 중단, 아니면 2s |
| `QueryResultSummary` | `frontend/src/features/metrics/api.ts :: QueryResultSummary` | `{ series: number; points: number; avg: number \| null; max: number \| null }` |
| `summarizeTelemetryResult` | `frontend/src/features/metrics/api.ts :: summarizeTelemetryResult` | `(result: Record<string,unknown>) => QueryResultSummary \| null` — agent 가 올린 prometheus 결과(`result.result.results.<name>`)에서 실측 요약 계산. instant(`samples[]`)와 range(`series[].values[]`) 모두 지원, 숫자 값만 평균·최대에 반영. `results` 없으면 null |
| `commandResultMessage` | `frontend/src/features/metrics/api.ts :: commandResultMessage` | `(result) => string \| null` — `result.message` 가 비어있지 않은 문자열일 때만 반환 |

## 컴포넌트

### `frontend/src/features/metrics/MetricsView.tsx :: MetricsView` (default export)

- 라우트: `/metrics`. 쿼리스트링 `cluster` — `clusterId` 초기값(기본 `''` — 목록 로드 후 effect 가 첫 클러스터로 보정. 목록에 없는 id 도 첫 클러스터로 대체). 선택 셀렉트 변경 시 `cluster` search param도 replace 갱신한다.
- 쿼리스트링 `subject`, `name`, `namespace` — 클러스터 상세의 컨텍스트 액션에서 넘어온 리소스 범위를 배지/code 행으로만 표시한다. PromQL 자동 변경은 하지 않는다.
- 모듈 상수(비공개):
  - `PRESETS`(`{label, promql, unit: 'ratio'|'count'}` 6종 — 실측 계열만): 노드 CPU/메모리/파일시스템 사용률(ratio),
    팟 재시작율(5m, 네임스페이스별)·네임스페이스별 팟 수·sandbox 디플로이 레플리카(count).
    전체 카탈로그·근거는 [콘솔 메트릭·쿼리 카탈로그](../../frontend-metrics-queries.md).
  - `RANGES`: 5분/15분/1시간/6시간 → `range_seconds` 300/900/3600/21600.
  - `interface QueryCard { id: string; promql: string; unit: Unit; rangeSeconds: number; commandId?: string; submitFailed?: boolean }` — 실행 상태는 카드에 저장하지 않고 명령 폴링에서 파생.
- state: `clusterId`, `paused: boolean`, `promql`(초기 PRESETS[0]), `range`(초기 RANGES[0]=300), `cards: QueryCard[]`, `frozen`(일시정지 시점의 history 사본 — `paused` 아닐 때만 effect 로 최신 history 동기화).
- 데이터: `useClusters` + `useClusterSummary(clusterId)` + `useClusterUsage(clusterId)` + `useWorkloads(clusterId)` + `useIsAdmin()` + `liveStore(history/status/snapshot)`.
- 파생:
  - `phases`: 우선순위 — live 스냅샷 phase 카운트 → 인벤토리 summary `pod_phases` → workloads 집계(스트림 끊겨도 인벤토리로 스탯 유지).
  - `series`: `paused ? frozen : history` 마지막 120포인트 → `[{id:'재시작 합'}, {id:'실행 팟'}]`. history 가 비어 있으면 인벤토리 기반 1포인트(재시작 합·Running 수)로 대체.
  - `usageSeries`: `useClusterUsage` samples → `[{id:'실행 팟', y:usage.pod_running}, {id:'재시작 누적', y:usage.restart_total}, {id:'준비 노드', y:usage.node_ready}]`. 샘플이 없으면 카드 자체를 숨김.
- PromQL 실행 `execute(card?)` — 재시도 시 그 카드의 promql/unit/rangeSeconds 재사용:
  1. 랜덤 id 카드(`promql/unit/rangeSeconds` 포함)를 목록 맨 앞에 추가. unit 은 인자 → 프리셋 매칭 → 'count' 순으로 결정.
  2. `run.mutate({q, rangeSeconds})` → POST `/agent/debug/query` body `{cluster_id, query: {source:'prometheus', name:'console_promql', description:'Console PromQL query', query, range_seconds}}`.
  3. 성공: 카드에 `commandId` 기록(이후 상태는 `QueryCardRow` 가 폴링). 제출 실패: `submitFailed: true`.
- 결과 포맷: `fmtValue(v, unit)` — ratio 는 `%`(소수 1자리), count 는 100 이상 정수/미만 소수 2자리. 카드에 `range 5m` 등 범위 표기, 평균·최대 표시.
- 클러스터 목록이 비어 있으면 `PageHeader` 다음 `EmptyState` 만 렌더한다. admin 은 `pathFor('/clusters')` 등록 버튼을 보고, non-admin 은 접근 가능한 클러스터가 연결되면 표시된다는 안내만 본다.
- 트리:
  ```
  FadeSlideIn
  ├─ PageHeader('메트릭', actions=클러스터 select(useClusters)+⏸ 일시정지/▶ 재개 토글) — 빈 상태 분기와 동일 헤더
  ├─ subject/name/namespace search param 이 있으면 context 배지 행
  ├─ status !== 'open' → 경고 카드 '실시간 스트림 재연결 중 — 최신 인벤토리 스냅샷을 표시합니다'
  ├─ StatBox: Running(ok) / Pending(warn) / CrashLoop(>0 이면 danger) / 노드(summary.nodes.length, info)
  │   / snapshot.rollout 있으면 'rollout <name>'(progress, info)
  ├─ Card('실시간 — 재시작 추이 / 실행 팟') > TimeSeriesChart(series)
  ├─ usageSeries 있으면 Card('스냅샷 추이 — 인벤토리 실측 (usage rollup)') > TimeSeriesChart(usageSeries)
  └─ Card('PromQL')
     ├─ 입력줄: 프리셋 select + promql input(mono) + 실행 버튼
     └─ AnimatedList(cards).map(QueryCardRow)   (data-testid="query-card")
  ```

내부(비공개) 서브컴포넌트 `QueryCardRow { card: QueryCard; onRetry: () => void }`:

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
- 실시간 스트림이 끊겨도 화면은 비지 않는다 — phase 스탯·시계열 시드는 인벤토리(summary/workloads)로 폴백.
- 시계열은 최근 120포인트로 제한. usage 시계열은 최대 288샘플(`?limit=288`).
