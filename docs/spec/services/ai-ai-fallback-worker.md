---
source_commit: 76dc3cdf
status: spec-ahead
---

# ai-fallback-worker — rule 미매칭 incident 의 LLM 원인 후보 생성

> 소스: `src/services/ai/ai-fallback-worker/app.py` · 테스트: `tests/test_ai_fallback_worker.py`

## 책임 (Responsibility)

- plan-worker 가 rule 미매칭 시 발행하는 `rca.ai_fallback.requested` 를 구독해,
  LLM(`packages.ai.llm`)에게 incident 증상 + evidence bundle 요약을 주고 원인 후보를 받는다.
- LLM 은 실제 catalog `cause_id`만 hypothesis로 제안한다. title/description,
  expected evidence, checks, 내용 기반 signals는 catalog에서 복원한 뒤
  `CauseCandidate(source="ai_fallback")` 로 변환해 plan-worker 와 동일한
  `rca.candidates.planned` 를 발행한다 — 이후 analyze-worker(평가) → rca-worker(확정)의
  기존 근거 기반 경로를 그대로 지난다.
- **확정 root cause 를 직접 만들지 않는다.** LLM 미설정/호출 실패/JSON 비정형/유효 후보 0건이면
  로그만 남기고 아무 이벤트도 발행하지 않는다(rule 개선 backlog 는 plan-worker 가 이미
  `rca.backlog.created` 로 남김).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../domains/rca.md](../domains/rca.md) | `RcaAiFallbackRequestedBody` |
| import | `packages.ai.llm` | [../packages/ai.md](../packages/ai.md) | `build_llm_client` |
| import | `packages.config.logs` | [../packages/config.md](../packages/config.md) | `get_logger`, `CONTEXT_KEY` |
| import | `packages.runtime.app` | [../packages/runtime.md](../packages/runtime.md) | `App` |
| import | `services.ai.agent.pipeline` | [ai-agent.md](ai-agent.md) | `AiFallbackPlanner` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/ai-fallback-worker/app.py :: app` | `App("ai-fallback-worker")` |
| `llm_client` | `src/services/ai/ai-fallback-worker/app.py :: llm_client` | `build_llm_client()` — 모듈 전역(테스트가 테스트용 LLM 으로 교체) |
| `planner` | `src/services/ai/ai-fallback-worker/app.py :: planner` | `AiFallbackPlanner()` |
| `on_ai_fallback_requested(evt)` | `src/services/ai/ai-fallback-worker/app.py :: on_ai_fallback_requested` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RcaAiFallbackRequestedBody` | `rca.ai_fallback.requested` | `reason, evidence_ref, incident, evidence_bundle, missing_evidence, workspace_id, evidence` |

### 발행 (Publishes)

| 케이스 | 발행 |
|---|---|
| LLM 이 signal 계약을 가진 catalog cause ID ≥1건 반환 | `rca.candidates.planned` (`RcaCandidatesPlannedBody`) 1건 — catalog 계약으로 복원된 `candidates[].source="ai_fallback"`, `rule_missing=None`, `evidence/incident/evidence_bundle` 은 입력 body 를 그대로 전달 |
| LLM 미설정(ValueError)·호출 실패·JSON 파싱 실패 | 없음(warning 로그 `ai_fallback_llm_failed`) |
| 유효 후보 0건(비정형/빈 응답/catalog 밖 ID/signal 없는 ID) | 없음(info 로그 `ai_fallback_no_candidates`) |

## 동작 (Behavior)

1. `planner.plan_body(evt, llm_client)` 호출 —
   [`AiFallbackPlanner`](ai-agent.md#공개-인터페이스-public-api) 가 프롬프트 구성 →
   catalog ID 목록을 제시한 `complete_json` → catalog 계약 복원 → confidence 내림차순
   상위 5개 선정을 수행.
2. 예외는 전부 잡아 warning 로그 후 종료(재시도로 확정 실패를 증폭하지 않음 — LLM 은 보조 경로).
3. 결과가 `None` 이면 info 로그 후 종료, body 면 yield.

## 불변식·오류 (Invariants & Errors)

- 이 워커는 `rca.completed` 를 직접 발행하지 않는다. LLM 작성 title/evidence/check는
  신뢰하지 않고 catalog 계약을 사용하며, catalog 내용 signal이 검증되지 않은 hypothesis는
  `insufficient_evidence` 로 blocked 된다.
- 프롬프트에는 evidence item 의 `summary` 문자열만 싣고 원문 `value` 는 싣지 않는다
  (secret 원문 유출 방지 + 프롬프트 크기 제한).
- 핸들러는 예외를 밖으로 던지지 않는다(자체 no-op 수렴).

## 설정 (Settings)

LLM 설정은 [packages/ai](../packages/ai.md) 의 `LLM_PROVIDER`/`LLM_API_KEY` 등 공통 env 를 그대로 사용.
서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일(`SERVICE_NAME=ai-fallback-worker`).

배포: `deploy/management/ai-workers.yaml` 의 `ai-fallback-worker` Deployment —
다른 ai 워커와 같은 `management-runtime-config`/`management-runtime-secret` envFrom 을 사용.
