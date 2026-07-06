# 뷰: 메트릭

[← 지도](../README.md) · 요구사항 [R8](../01-requirements.md#r8-그래프-메트릭-뷰) · 갭 [G6·G7](../06-api-map.md#갭-상태-표)

백엔드 제약이 UX 를 결정한다: **동기 range query API 가 없다**(G7).
따라서 1) 실시간 스트림(WS), 2) 비동기 온디맨드 쿼리(debug query) 두 모드로 설계.

## 레이아웃 — MetricsView (/metrics)

```text
┌ 컨텍스트 바: 클러스터 Select · 윈도(5m/15m/1h) · Live ⏸/▶ ┐
├ 실시간 보드 (liveStore 기반) ─────────────────────────────┤
│ TimeSeriesChart: 핫 팟 restart 추이 │ rollout 진행         │
│ StatBox 스트립: 팟 phase 분포 (CountUp)                    │
├ 온디맨드 쿼리 패널 ────────────────────────────────────────┤
│ PromQL 입력(SearchInput+mono) [실행]  프리셋 Select        │
│ 결과 카드 스택 (각각 상태머신 표시)                         │
└────────────────────────────────────────────────────────────┘
```

## 실시간 보드

- 소스: `WS /live/browser` → liveStore. 슬라이딩 윈도 버퍼(최대 900포인트)는
  `features/metrics/buffer.ts` 한 곳 — 차트는 selector 로만 읽음
- 일시정지(⏸): 버퍼 수집은 계속, 렌더만 고정(놓친 구간 없음)
- WS 단절: 차트 위 warn 배너 "실시간 끊김 — 재연결 중", 데이터는 유지

## 온디맨드 쿼리 (비동기 UX — 이 화면의 핵심 설계)

흐름: `POST /agent/debug/query` → `{command_id}` → cluster-agent 폴링 실행 → 결과는 command 완료로 수렴.

결과 카드 상태머신(카드마다 독립):

```text
queued(요청 접수, command_id 표시)
  → running(agent 실행 중 — 3s 폴링)
  → done(차트 렌더) | failed(사유 + [재시도]) | timeout(60s 초과 안내)
```

결과 조회 경로: run 완료 이벤트가 대시보드 timeline 에 투영되기 전까지는
command 상태 확인 수단이 제한적 — **초기 구현은 3s 간격 재-enqueue 없이
timeline 폴링으로 완료 감지**하고, 지연이 크면 G7(동기 프록시) 도입을 트리거한다.
이 절충은 [01 §R8 갭](../01-requirements.md#r8-그래프-메트릭-뷰)과 일치.

- 프리셋(Select): "노드 CPU", "팟 재시작 5m", "네임스페이스 메모리" — PromQL 은
  `features/metrics/presets.ts` 상수(백엔드 telemetry registry 쿼리와 정렬)
- 결과 렌더: instant vector → StatBox 그리드, range → TimeSeriesChart
- 권한: debug query 는 cluster read 필요 — 가드 RequirePermission

## 다른 화면과의 관계 (중복 금지)

- [cluster-detail](cluster-detail.md) 헤더 [메트릭 보기] → /metrics?cluster= 프리셋 진입
- [fleet-heatmap](fleet-heatmap.md) 사이드 패널 Sparkline 은 liveStore 재사용(이 문서의 버퍼)
- 인시던트의 evidence 차트는 [ai-chat](ai-chat.md) 범위(대화 맥락 내 표시)

## AC

- [ ] WS 15분 연속 수신에서 메모리 증가 없음(버퍼 상한 동작)
- [ ] 쿼리 카드 5개 동시 실행 시 각 상태 독립 표시
- [ ] 실패 카드 [재시도]가 동일 PromQL 로 새 command 발행
- [ ] 프리셋 실행이 입력창에 PromQL 을 노출(학습 가능한 UI)
- [ ] ⏸ 후 ▶ 시 공백 없이 이어짐
