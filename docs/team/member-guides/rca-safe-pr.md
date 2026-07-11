# 멤버 가이드: RCA / Safe PR

## 미션

Target Agent가 보낸 evidence를 사람이 이해할 수 있는 원인 분석으로 정리하고, 안전한 GitHub PR 제안까지 연결한다. Audit Timeline은 command, RCA, PR 흐름을 나중에 추적할 수 있게 기록한다.

이 담당자는 이벤트 버스의 내부 ack/nak/DLQ를 몰라도 된다. worker는 event를 받아 본문(body)을 읽고, 검증된 결과 body를 `yield`로 발행한다(체이닝).

```text
Gateway
  -> cluster.evidence.received

evidence-worker
  -> evidence.built

incident-worker
  -> incident.detected
  -> evidence.bundle.built

plan-worker
  -> rca.candidates.planned

analyze-worker
  -> rca.candidates.evaluated

rca-worker
  -> rca.completed 또는 rca.action_required

recovery-worker / select-worker / dispatch-worker
  -> recovery.planned
  -> recovery.action_selected
  -> command.requested 또는 safe_pr.requested

safe-pr-worker
  -> safe_pr.patch_prepared

ai-diff-worker
  -> diff.explained
  -> safe_pr.ready_for_creation

scm-worker / GithubScmProvider
  -> safe_pr.created 또는 safe_pr.failed

Audit Timeline Service
  -> 모든 event 관찰
  -> audit_log 저장
```

## 담당 영역

- `src/services/ai/evidence-worker`
- `src/services/ai/incident-worker`
- `src/services/ai/plan-worker`
- `src/services/ai/analyze-worker`
- `src/services/ai/rca-worker`
- `src/services/ai/recovery-worker`
- `src/services/ai/select-worker`
- `src/services/ai/dispatch-worker`
- `src/services/gitops/scm-worker`
- `src/services/projection/audit-worker`
- Evidence Builder logic
- AI RCA Service logic
- Safe PR request/proposal logic
- RCA/audit 관련 worker test
- GitHub PR adapter 경계. 실제 PR 발급은 `scm-worker` 중심으로 두고, 테스트는 주입 가능한 transport/provider로 격리한다.

## 한 작업씩 따라가는 문서

실제 구현을 시작할 때는 이 큰 문서를 다시 해석하지 말고, [RCA / Safe PR 선형 작업 가이드](../rca-safe-pr-tasks/README.md)를 0번부터 순서대로 따른다.

처음 합류한 팀원은 먼저 [역할별 실습 가이드](../role-practice-guide.md)의 가인 섹션에서 현재 흐름과 테스트를 한 번 따라간 뒤, 이 문서와 선형 작업 가이드로 들어간다.

각 페이지는 한 PR 또는 한 작업 단위로 끝나도록 작성되어 있으며, `완료 기준`을 만족해야 다음 페이지로 넘어간다.

팀 간 입력/출력, event envelope, 테스트 선택 기준은 [팀 간 구현 연결과 테스트 가이드](../cross-role-implementation-test-guide.md)를 함께 따른다.

## 현재 책임

- RCA 계열 worker는 직접 PR을 생성하지 않고 `safe_pr.requested`까지만 만든다.
- `safe-pr-worker`가 `safe_pr.requested`를 받아 `safe_pr.patch_prepared`를 발행하고, `ai-diff-worker`가 통과한 요청만 `safe_pr.ready_for_creation`으로 넘긴다.
- `scm-worker`는 `safe_pr.ready_for_creation`을 받아 `GithubScmProvider`로 GitHub branch/commit/PR을 처리하고, 자격 증명/설정 누락은 `safe_pr.failed`로 남긴다.
- RCA 결과는 evidence 기반으로만 생성한다.
- Safe PR side effect는 token/ref 확인과 feature flag로 보호한다.
- audit timeline이 command, RCA, PR 상태를 추적하게 한다.
- provider token을 event에 넣지 않고 credential/token reference만 사용한다.

## 이벤트 시스템을 몰라도 되는 작업 규칙

- `evidence-worker`는 `@app.on(ClusterEvidenceReceivedBody)`로 `cluster.evidence.received`를 구독한다.
- 이후 worker는 `EvidenceBuiltBody`, `EvidenceBundleBuiltBody`, `RcaCandidatesPlannedBody`, `RcaCandidatesEvaluatedBody`, `RcaCompletedBody`, `RecoveryPlannedBody`, `RecoveryActionSelectedBody`, `SafePrRequestedBody`를 순서대로 소비한다.
- handler 입력은 타입이 있는 body 객체이며, 원본 envelope의 transport 필드는 `EventEnvelope.payload`다.
- 새로운 사실을 만들면 body DTO로 감싸서 `yield`로 발행한다.
- GitHub PR을 실제로 만들 때도 event에는 PR URL, branch, commit SHA, credential_ref 같은 reference만 남긴다.
- 실패가 일시적이면 exception을 던져 runtime retry를 사용한다.
- 정책/검증 실패처럼 정상적으로 거절할 일은 실패 event나 명확한 result로 끝낸다.

모르는 상태에서 작업할 때의 기준:

- “증거에서 확인된 내용”과 “AI가 추론한 내용”을 분리한다.
- “외부에 쓰는 작업”은 feature flag, policy, token ref가 모두 있어야 실행한다.
- “감사에 남겨야 하는 상태 변화”는 audit timeline이 읽을 수 있게 event body에 식별자를 남긴다.

## 코드 규칙

- 한 서비스는 한 파일 `app.py`다. worker 구독은 `@app.on(BodyType)`으로 선언한다.
- `App.run()`이 내부적으로 worker 런타임을 조립한다. 서비스가 `WorkerService.from_subscription(...)`을 직접 호출하지 않는다.
- Worker는 다음 이벤트 body를 `yield`로 발행한다(체이닝).
- Handler는 타입 body를 받고, 필요하면 원본 envelope의 `evt.payload`(transport)도 읽는다.
- 발행 body는 `src/packages/contracts/event_bus/bodies/`의 dataclass를 사용한다(base class `EventBody`).
- `correlation_id`를 유지한다.
- RCA output은 근거 없는 추론보다 확인된 evidence를 우선한다.
- GitHub PR 생성에는 provider token을 event에 넣지 말고 Token Broker/credential reference를 사용한다.
- 외부 write는 feature flag와 project action 권한을 모두 확인한다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | Evidence 입력 계약 정리 | RCA가 무엇을 받아야 하는지 고정한다. |
| 2 | Evidence Builder | raw evidence를 분석 가능한 구조로 정리한다. |
| 3 | RCA Result DTO와 rule-first analyzer | AI fallback 없이도 downstream을 개발할 수 있다. |
| 4 | RCA completed event | dashboard/audit이 원인 분석 결과를 볼 수 있다. |
| 5 | Safe PR proposal DTO | 실제 GitHub write 전에 제안 형태를 고정한다. |
| 6 | guarded GitHub PR adapter | 외부 write를 안전하게 분리한다. |
| 7 | Audit Timeline projection | 전체 흐름 추적을 보장한다. |
| 8 | RCA/Safe PR chain test | evidence에서 PR 제안까지 연결 검증한다. |
| 9 | AI fallback 연결 | rule 미매칭 incident를 실제 LLM/tool pipeline 또는 명시적 action-required로 보낸다. |
| 10 | Tool schema/authorization | JSON-only loop를 schema, 권한, 비용 한도가 있는 tool protocol로 보강한다. |
| 11 | Manifest patch PR body | Safe PR 설명에 evidence, diff basis, rollback, 실제 patch ref를 포함한다. |
| 12 | RCA eval set | 장애 profile별 expected label과 top-k hit rate를 기록한다. |

## 하드닝 Phase 기준

Phase 9 이후는 [production-readiness](../../production-readiness.md)의 AI/RCA와 Safe PR release gate를 따른다.

완료 기준:

- AI fallback worker는 단순 로그 sink가 아니라 RCA pipeline에 연결되거나, 제품 설명에서 fallback claim을 제거한다.
- ToolSpec은 input schema, output schema, authorization requirement, cost class를 가진다.
- malformed model reply, invalid tool output, unauthorized tool call, budget exceeded가 테스트된다.
- RCA 결과는 evidence_ref와 supporting/missing evidence를 포함하고, insufficient evidence를 확정 원인처럼 표시하지 않는다.
- Safe PR body는 실제 manifest patch/rollback patch와 evidence/diff basis를 연결한다.

## Phase 1. Evidence 입력 계약 정리

목표:

```text
evidence/RCA worker 체인이 어떤 evidence를 입력으로 받는지 명확히 한다.
```

왜 해야 하는가:

- Target/Telemetry 담당자가 어떤 필드를 보내야 하는지 알아야 한다.
- RCA가 입력을 추측하면 분석 품질이 흔들린다.
- evidence 계약이 안정되어야 레거시 데이터 evidence로 병렬 작업이 가능하다.

구현할 것:

- `cluster.evidence.received` payload 확인.
- evidence kind 목록 정리: `pod`, `metric`, `log`, `trace`, `node`.
- 필수 필드: cluster_id, timestamp, kind, payload.
- `docs/events.md`에 evidence 예시 추가.

생각할 것:

- evidence payload가 너무 크지 않은가?
- log snippet에 secret이 들어갈 수 있는가?
- timestamp timezone은 통일되어 있는가?

하지 말 것:

- raw kubeconfig, token, 환경변수를 evidence에 넣지 않는다.
- 모든 provider raw response를 그대로 저장하지 않는다.

테스트:

- 정상 evidence payload 파싱.
- 필수 field 누락 거부.
- secret-like value 마스킹 또는 거부.

## Phase 2. Evidence Builder

목표:

```text
raw evidence를 RCA가 읽기 쉬운 Evidence 모델로 정리한다.
```

왜 해야 하는가:

- RCA는 raw log/metric을 직접 읽는 것보다 정규화된 evidence를 받아야 안정적이다.
- dashboard와 audit도 같은 evidence summary를 사용할 수 있다.
- 나중에 Prometheus/Loki가 붙어도 RCA core는 바뀌지 않는다.

구현할 것:

- `EvidenceBuilder` Protocol.
- `Evidence` DTO.
- severity, affected_resource, symptoms, observed_at.
- `evidence.built` event 발행.

생각할 것:

- 같은 correlation에서 여러 evidence를 합칠지, 하나씩 처리할지.
- severity 기준은 어디에 둘지.
- evidence가 부족하면 RCA를 실행할지, insufficient evidence로 끝낼지.

하지 말 것:

- Builder에서 GitHub PR을 만들지 않는다.
- Builder에서 AI 호출을 하지 않는다.

테스트:

- pod crash evidence -> normalized evidence.
- metric spike evidence -> normalized evidence.
- unknown evidence kind 처리.

## Phase 3. RCA Result DTO와 rule-first analyzer

목표:

```text
AI 모델 없이도 RCA 결과 형태를 만들 수 있게 한다.
```

왜 해야 하는가:

- 외부 AI/API가 준비되지 않아도 dashboard, audit, Safe PR 흐름을 개발할 수 있다.
- RCA output 계약이 먼저 있어야 prompt/model 교체가 쉬워진다.
- 근거와 결론을 분리할 수 있다.

구현할 것:

- `src/services/ai/agent/causes/catalog/*.yaml` rule.
- `CauseCandidate`, `CauseEvaluation`, `RcaCompletedBody` DTO.
- fields: root_cause, action, confidence, evidence_ref, supporting_evidence, missing_evidence.

생각할 것:

- confidence는 사람이 오해하지 않도록 범위와 의미를 정한다.
- evidence_refs 없이 root_cause를 만들지 않는다.
- recommended_fix는 command로 바로 실행하지 않는다.

하지 말 것:

- AI 응답 raw text를 그대로 event payload에 넣지 않는다.
- 근거 없는 결론을 높은 confidence로 표시하지 않는다.

테스트:

- 같은 레거시 데이터 evidence는 deterministic result를 만든다.
- evidence_refs가 비어 있으면 실패 또는 낮은 confidence.

## Phase 4. RCA completed event

목표:

```text
분석 결과를 `rca.completed` event로 발행한다.
```

왜 해야 하는가:

- Dashboard Projection이 RCA 결과를 표시할 수 있다.
- Audit Timeline이 분석 결과를 기록할 수 있다.
- Safe PR 단계가 RCA 결과를 입력으로 받을 수 있다.

구현할 것:

- `RcaCompletedBody`.
- `rca.completed` 발행.
- correlation_id 유지.
- failure/insufficient evidence 상태 표현.

생각할 것:

- RCA 실패는 retry 대상인가? 외부 AI 장애면 retry, evidence 부족이면 정상 상태다.
- 결과가 너무 길면 summary와 detail_ref로 분리할지.

하지 말 것:

- token, provider raw response를 넣지 않는다.
- dashboard 전용 필드를 RCA event에 과하게 섞지 않는다.

테스트:

- evidence.built -> evidence.bundle.built -> rca.candidates.planned -> rca.candidates.evaluated -> rca.completed.
- insufficient evidence result.
- correlation_id 유지.

## Phase 5. Safe PR proposal DTO

목표:

```text
실제 GitHub write 전에 어떤 branch/file/diff를 만들지 제안 payload로 고정한다.
```

왜 해야 하는가:

- RCA 결과를 바로 외부 write로 연결하면 위험하다.
- PR 제안과 실제 PR 생성은 분리되어야 feature flag/policy로 보호할 수 있다.
- GitHub adapter 없이도 downstream event와 audit을 테스트할 수 있다.

구현할 것:

- `SafePrProposal`.
- target repo/ref.
- branch name.
- file changes.
- rationale.
- `safe_pr.requested`와 `safe_pr.created` 분리 정책 정리.

생각할 것:

- 제안만 만든 상태와 실제 PR 생성 완료 상태를 같은 event로 볼지 분리할지.
- branch 이름이 충돌할 수 있는가?
- file change가 너무 큰가?

하지 말 것:

- feature flag 없이 실제 PR을 만들지 않는다.
- provider token을 proposal payload에 넣지 않는다.

테스트:

- RCA result -> safe PR proposal.
- no recommended_fix -> no proposal.
- file change shape 검증.

## Phase 6. Guarded GitHub PR adapter

목표:

```text
SCM provider 경계를 두고, 실제 PR 생성은 GithubScmProvider와 token vault 경계 뒤에 둔다.
```

왜 해야 하는가:

- 외부 write는 프로젝트에서 가장 위험한 side effect 중 하나다.
- provider를 분리해야 테스트에서 GitHub를 호출하지 않는다.
- token은 event가 아니라 `GITHUB_TOKEN_REF`/vault 또는 로컬 env 경계로 받아야 한다.

구현할 것:

- `ScmProvider` Protocol.
- `GithubScmProvider`.
- `SCM_PROVIDER`, `SCM_REPO`, `GITHUB_TOKEN_REF`/`GITHUB_TOKEN` 설정.
- 자격 증명 누락 시 worker 부팅 실패가 아니라 `safe_pr.failed`.
- PR URL과 provider mode만 result event에 남김.

생각할 것:

- create_pr 권한이 project role과 credential binding을 모두 통과하는가?
- PR 생성 실패가 retry 가능한가?
- 같은 proposal을 두 번 처리하면 중복 PR이 생기지 않는가?

하지 말 것:

- PAT를 설정 파일이나 event payload에 넣지 않는다.
- 테스트에서 실제 GitHub repo에 PR을 만들지 않는다.

테스트:

- provider mismatch -> `safe_pr.failed`.
- missing `SCM_REPO` 또는 token -> `safe_pr.failed`.
- injected HTTP transport -> 실제 GitHub 호출 없이 `safe_pr.created`.

## Phase 7. Audit Timeline projection

목표:

```text
event 흐름을 audit_log로 기록해서 나중에 추적 가능하게 한다.
```

왜 해야 하는가:

- command 실행, RCA, PR 생성은 나중에 “왜 이렇게 됐는가”를 설명해야 한다.
- Audit은 workflow를 막는 서비스가 아니라 관찰자다.
- 모든 event를 읽되 secret을 기록하지 않아야 한다.

구현할 것:

- `audit-worker` 구독 확인.
- event subject, source, correlation_id, causation_id, created_at 저장.
- payload는 안전한 subset 또는 redaction.
- command/RCA/PR subject별 사람이 읽는 message.

생각할 것:

- audit이 실패하면 원본 workflow를 막아야 하는가? 기본은 아니다.
- payload 전체 저장이 안전한가? credential 관련 event는 redaction 필요.
- correlation_id별 timeline query가 가능한가?

하지 말 것:

- token, password, kubeconfig를 audit log에 저장하지 않는다.
- audit service에서 새 workflow event를 남발하지 않는다.

테스트:

- sample event -> audit log row.
- secret-like value redaction.
- duplicate event id 처리.

## Phase 8. RCA/Safe PR chain test

목표:

```text
evidence input에서 RCA 결과와 Safe PR 요청/결과 이벤트까지 테스트 provider로 연결한다.
```

왜 해야 하는가:

- 개별 worker가 맞아도 payload 이름이 틀리면 전체 흐름이 끊긴다.
- 운영 검증 전에 RCA 시나리오가 최소 한 줄로 흐르는지 확인해야 한다.
- 외부 AI/GitHub 없이도 회귀를 잡을 수 있다.

테스트:

- `cluster.evidence.received`.
- `evidence.built`.
- `rca.completed`.
- `safe_pr.requested`.
- `scm-worker` 테스트 provider/transport의 `safe_pr.created` 또는 `safe_pr.failed`.
- audit log append.

## PR 체크리스트

- 새 event subject가 `src/packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 있음
- 새/변경 event body가 `src/packages/contracts/event_bus/bodies/`에 있음
- RCA/Safe PR 동작 테스트 존재
- handler가 `@app.on` body DTO 흐름을 유지함
- raw NATS 사용 없음
- 실제 GitHub write는 feature flag 또는 policy guard로 보호
- audit/dashboard 영향이 문서화됨
- provider token이 event/response/log/audit에 없음

## 처음 읽을 파일

1. `src/services/ai/rca-worker`
2. `src/services/gitops/scm-worker`
3. `src/services/projection/audit-worker`
4. `src/packages/contracts/event_bus/subjects.py`
5. `src/packages/contracts/event_bus/bodies/`
6. `src/packages/runtime/worker.py`
7. `docs/events.md`
8. 권한과 secret 경계: `docs/rca-production-onboarding/06-chanbin-permission-dashboard.md`, `docs/secrets.md`

## Codex 지시문

이 영역을 작업할 때는 `src/services/ai/rca-worker`, `src/services/gitops/scm-worker`, `src/services/projection/audit-worker`, `src/packages/runtime/worker.py`, `src/packages/runtime/service.py`, `docs/events.md`를 먼저 읽어라. 외부 write는 항상 안전장치를 먼저 확인하라.
