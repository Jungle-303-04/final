---
source_commit: 1616d295
status: synced
---

# incident-worker — Evidence → 장애 판정 + 근거 번들

> 소스: `src/services/ai/incident-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `evidence.built` 를 받아 [`IncidentPipeline`](ai-agent.md#pipelineincidentpy--incidentdetector--evidencebundler)으로
  장애 판정(`incident.detected`)과 다음 단계 body(근거 번들 또는 사람 조치 요청)를 **동시에** 발행한다.
- DB 저장 없음(ctx.db 미사용 — `EventContext[object]`).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `EvidenceBuiltBody` (+ 발행 body들) |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `IncidentPipeline` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/incident-worker/app.py :: app` | `App("incident-worker")` |
| `pipeline` | `src/services/ai/incident-worker/app.py :: pipeline` | `IncidentPipeline()` |
| `on_evidence_built(evt, ctx)` | `src/services/ai/incident-worker/app.py :: on_evidence_built` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `EvidenceBuiltBody` | `evidence.built` | `evidence: Evidence` |

### 발행 (Publishes)

핸들러 1회 호출당 항상 **2개** body를 순서대로 yield 한다.

| 순서 | 이벤트 | 라우팅 키 | 조건 |
|---|---|---|---|
| 1 | `IncidentDetectedBody` | `incident.detected` | 항상. `detected = bool(logs or kubernetes["pods"] or metrics)` |
| 2a | `EvidenceBundleBuiltBody` | `evidence.bundle.built` | `detected=True` 이고 evidence/incident 존재 |
| 2b | `RcaActionRequiredBody` | `rca.action_required` | `detected=False`(reason=`"incident flag was not set"`) 또는 컨텍스트 누락(reason=`"incident context is missing"`) |

body 스키마는 [rca 도메인](../domains/rca.md) 참조. `IncidentDetectedBody` 에는
`severity`(kubernetes.severity, 기본 `"medium"`), `affected`(단일 리소스 요약 리스트),
`evidence`, `incident`(=`IncidentRecord`, `incident_id=ctx.correlation_id`) 가 실린다.

## 동작 (Behavior)

1. `bodies = pipeline.build_bodies(evt.evidence, ctx.correlation_id)`
   - `IncidentDetector.detect_body` → 장애 판정·분류(`IncidentRecord` 생성, correlation_id = incident_id).
   - `EvidenceBundler.build_body(detected)` → 분기(위 발행 표).
   - 번들 생성 시 [`build_incident_evidence_bundle`](ai-agent.md#pipelineevidence_bundlepy--근거-번들-빌더-모듈-함수)
     이 required_sources(증상별 플레이북) 대비 수집 현황으로 `EvidenceBundle` 을 구성.
2. `yield bodies.detected_body` → `yield bodies.next_body`.

## 불변식·오류 (Invariants & Errors)

- `incident.detected` 는 항상 발행된다(미탐지여도 사실 기록).
- 미탐지·컨텍스트 누락은 예외가 아니라 `rca.action_required` 로 수렴 —
  [rca-feedback-worker](ai-rca-feedback-worker.md) 가 후속 조치 이벤트로 정규화.
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=incident-worker`).
