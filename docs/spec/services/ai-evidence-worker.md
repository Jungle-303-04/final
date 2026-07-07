---
source_commit: 1616d295
status: synced
---

# evidence-worker — 클러스터 증거 수신 → Evidence 정규화

> 소스: `src/services/ai/evidence-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `cluster.evidence.received` 를 받아 [`EvidencePipeline`](ai-agent.md#pipelineevidencepy--evidencebuilder)으로
  `Evidence` 값 객체를 만들고, RCA 스토어에 저장한 뒤 `evidence.built` 를 발행한다.
- 장애 판정/원인 분석은 하지 않는다(→ [incident-worker](ai-incident-worker.md) 이후 단계).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `ClusterEvidenceReceivedBody`, `EvidenceBuiltBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `RcaStore` (ctx.db 타입) |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `EvidencePipeline` |
| 저장 | RCA 스토어(`RcaStore.save_evidence`) | [../../packages/contracts.md](../packages/contracts.md) | Evidence 영속화 |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/evidence-worker/app.py :: app` | `App("evidence-worker")` |
| `pipeline` | `src/services/ai/evidence-worker/app.py :: pipeline` | `EvidencePipeline()` (모듈 전역 인스턴스) |
| `on_cluster_evidence(evt, ctx)` | `src/services/ai/evidence-worker/app.py :: on_cluster_evidence` | 유일한 이벤트 핸들러 (`AsyncIterator[EventBody]`) |

## 이벤트 (Events)

스트림: NATS JetStream `SERVICE_EVENTS` — subject 가 곧 라우팅 키.

### 구독 (Consumes)

| 이벤트 | 라우팅 키(subject) | body |
|---|---|---|
| `ClusterEvidenceReceivedBody` | `cluster.evidence.received` | `cluster_id, kubernetes: JsonObject, metrics: JsonObject, logs: list[JsonObject], traces: JsonObject, workspace_id="default", agent_id?, source_id?, window_start?, evidence_key?` — [rca 도메인](../domains/rca.md) |

### 발행 (Publishes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `EvidenceBuiltBody` | `evidence.built` | `evidence: Evidence`(object_ref 중심 reference), `correlation_id`, `kind`, `payload_size`, `summary` |

## 동작 (Behavior)

1. `evidence = pipeline.build_evidence(evt, ctx.correlation_id)` —
   `object_ref = "object://evidence/{correlation_id}.json"` 부여, 나머지 필드 복사.
2. `await ctx.db.save_evidence(ctx.correlation_id, evidence.workspace_id, pipeline.kind, evidence.to_body())`
   — `kind` 는 `"rca_bundle"` (`EvidenceDefaults.kind`).
3. `yield compact_evidence_built_body(evidence, ctx.correlation_id, pipeline.kind)` — 런타임이 outbox 트랜잭션으로 발행
   (correlation_id 승계, causation=수신 event_id). full `Evidence` 원문은 DB 저장본만 사용하고 NATS에는 claim-check reference만 싣는다.

## 불변식·오류 (Invariants & Errors)

- correlation_id 가 이후 파이프라인의 `incident_id` 로 재사용된다(incident-worker 참조) —
  같은 수신 이벤트에서 파생된 전 단계가 correlation 으로 추적 가능.
- 저장 실패/핸들러 예외 시 런타임 재시도(`WORKER_MAX_ATTEMPTS`, 기본 3회) 후 DLQ(`dead_letter.created`).

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정(`packages/runtime/worker.py`, 상세는
[../../packages/runtime.md](../packages/runtime.md)):

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `WORKER_MAX_ATTEMPTS` | int | `3` | 핸들러 재시도 상한(소진 시 DLQ) |
| `WORKER_FETCH_BATCH_SIZE` | int | `1` | 루프당 subject별 fetch 개수 |
| `WORKER_HANDLER_TIMEOUT_SECONDS` | int | `30` | 핸들러 hang 상한(초) |
| `WORKER_RETRY_DELAY_SECONDS` | int | `2` | nak 재확인 지연(초) |
| `WORKER_FETCH_TIMEOUT_SECONDS` | int | `1` | fetch 대기 한도(초) |
| `WORKER_IDLE_SLEEP_SECONDS` | float | `0.25` | 유휴 sleep(초) |
| `WORKER_DEAD_LETTER_TIMEOUT_SECONDS` | int | `10` | DLQ 기록 대기 한도(초) |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness 하트비트 파일 경로 |
| `SERVICE_NAME` | str | `evidence-worker` | 로깅 서비스 이름(App.run 이 설정) |
