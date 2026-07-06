---
source_commit: 96ba52c8
status: synced
---

# features/metrics — 실시간 메트릭·온디맨드 PromQL

> 소스: `frontend/src/features/metrics/`

## 책임 (Responsibility)

- WS 스냅샷 히스토리 기반 실시간 시계열(재시작 추이·실행 팟)과 phase 스탯, agent 경유 비동기 PromQL 쿼리 실행 UI.
- 자체 `api.ts` 없음 — 뷰 파일 안에서 `useMutation` + `post` 직접 구성(단, fetch 는 여전히 shared api 경유).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`post`), `@/shared/lib/live`(`liveStore`), `@/shared/ui`, `@/shared/ui/charts`(`TimeSeriesChart`, `Series`), `@/shared/motion` | [shared](shared.md) | 실시간·차트 |
| import | `@/features/cluster/api`(`useClusters`) | [cluster](./cluster.md) | 클러스터 선택 셀렉트 |
| 백엔드 | POST `/agent/debug/query` | [api-gateway](../services/gateway-api-gateway.md) | 온디맨드 PromQL(비동기 수락) |
| 실시간 | `liveStore.history`/`status`/`snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 시계열·연결 배너·phase 스탯 |

## 공개 인터페이스 (Public API)

### `frontend/src/features/metrics/MetricsView.tsx :: MetricsView` (default export)

- 라우트: `/metrics`. 쿼리스트링 `cluster` — `clusterId` 초기값(기본 `'target'`).
- 모듈 상수(비공개):
  - `PRESETS`: `[{label:'팟 재시작 (5m)', promql:'sum(rate(kube_pod_container_status_restarts_total[5m]))'}, {label:'노드 CPU', promql:'sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (node)'}, {label:'네임스페이스 메모리', promql:'sum(container_memory_working_set_bytes) by (namespace)'}]`
  - `interface QueryCard { id: string; promql: string; state: 'queued'|'running'|'done'|'failed'; commandId?: string }`
- state: `clusterId`, `paused: boolean`, `promql`(초기 PRESETS[0]), `cards: QueryCard[]`.
- 실시간 파생:
  - `frozen`: `useMemo(..., [paused ? null : history])` — ⏸ 일시정지 시 수집은 계속하되 **렌더만 고정**(의존성 트릭).
  - `series`: frozen 마지막 120포인트 → `[{id:'재시작 합', data:(x=i, y=restarts)}, {id:'실행 팟', data:(x=i, y=running)}]`.
  - `phases`: snapshot 전체 pods 의 phase 카운트.
- PromQL 실행 `execute()`:
  1. 랜덤 id 카드(`state:'queued'`)를 목록 맨 앞에 추가.
  2. `run.mutate(promql)` → POST `/agent/debug/query` body `{cluster_id: clusterId, promql}`.
  3. 성공: 카드 `running` + `commandId` 기록 후 **3.5s setTimeout 으로 `done` 전이**(결과 스트림 미연동 데모 처치). 실패: `failed`(재시도 버튼).
- 트리:
  ```
  FadeSlideIn
  ├─ 헤더: h1 '메트릭' · 클러스터 select(useClusters) · ⏸ 일시정지/▶ 재개 토글
  ├─ status !== 'open' → 경고 카드 '⚠ 실시간 스트림 끊김 — 재연결 중 (데이터는 유지됩니다)'
  ├─ StatBox: Running(ok) / Pending(warn) / CrashLoop(>0 이면 danger) / snapshot.rollout 있으면 'rollout <name>'(progress, info)
  ├─ Card('실시간 — 재시작 추이 / 실행 팟') > TimeSeriesChart(series)
  └─ Card('온디맨드 PromQL (비동기 — agent 경유)')
     ├─ 입력줄: 프리셋 select + promql input(mono) + 실행 버튼
     └─ cards.map: Badge(state) + code(promql) + commandId + done 시 '결과 3 series · 평균 0.42'(데모 고정 문자열)
        + failed 시 재시도 버튼   (data-testid="query-card")
  ```

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/metrics` | `MetricsView` | `RequireSession`+`AppShell` | `?cluster=` 로 초기 클러스터 지정([cluster 상세](./cluster.md)의 "메트릭 보기" 링크) |

## 불변식·오류 (Invariants & Errors)

- 일시정지는 렌더 고정일 뿐 history 수집(liveStore)은 멈추지 않는다.
- PromQL 실행은 비동기 수락 모델 — 응답의 `command_id` 만 표시하고, done 전이는 현재 데모 타이머(3.5s)다. 실제 결과 채널 연동 시 이 부분만 교체한다.
- 시계열은 최근 120포인트로 제한.
