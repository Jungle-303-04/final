# 멤버 가이드: RCA / Safe PR

## 미션

Target Agent가 보낸 evidence를 사람이 이해할 수 있는 원인 분석으로 정리하고, 안전한 GitHub PR 제안까지 연결한다. Audit Timeline은 command, RCA, PR 흐름을 나중에 추적할 수 있게 기록한다.

이 담당자는 이벤트 버스의 내부 ack/nak/DLQ를 몰라도 된다. worker는 event를 받아 본문(body)을 읽고, 검증된 결과 body를 `yield`로 발행한다(체이닝).

```text
Gateway
  -> cluster.evidence.received

RCA Worker
  -> evidence.built
  -> rca.completed
  -> safe_pr.requested

Repo Gateway Worker
  -> safe_pr.created

Audit Timeline Service
  -> 모든 event 관찰
  -> audit_log 저장
```

## 담당 영역

- `services/rca-worker`
- `services/gitops/repo-gateway-worker`
- `services/projection/audit-timeline-service`
- Evidence Builder logic
- AI RCA Service logic
- Safe PR request/proposal logic
- RCA/audit 관련 worker test
- GitHub PR adapter 또는 fake adapter. 실제 PR 발급은 repo-gateway 중심으로 둔다.

## 현재 책임

- RCA Worker는 직접 PR을 생성하지 않고 `safe_pr.requested`를 만든다.
- repo-gateway가 `safe_pr.requested`를 받아 GitHub branch/commit/PR client 또는 fake adapter로 처리한다.
- RCA 결과는 evidence 기반으로만 생성한다.
- Safe PR side effect는 token/ref 확인과 feature flag로 보호한다.
- audit timeline이 command, RCA, PR 상태를 추적하게 한다.
- provider token을 event에 넣지 않고 credential/token reference만 사용한다.

## 이벤트 시스템을 몰라도 되는 작업 규칙

- RCA Worker는 `@app.sub(ClusterEvidenceReceived)`로 `cluster.evidence.received`를 구독한다.
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

- 한 서비스는 한 파일 `app.py`다. worker 구독은 `@app.sub(BodyType)`으로 선언한다.
- `App.run()`이 내부적으로 worker 런타임을 조립한다. 서비스가 `WorkerService.from_subscription(...)`을 직접 호출하지 않는다.
- Worker는 다음 이벤트 body를 `yield`로 발행한다(체이닝).
- Handler는 타입 body를 받고, 필요하면 원본 envelope의 `evt.payload`(transport)도 읽는다.
- 발행 body는 `packages/contracts/event_bus/bodies/`의 dataclass를 사용한다(base class `EventBody`).
- `correlation_id`를 유지한다.
- RCA output은 근거 없는 추론보다 확인된 evidence를 우선한다.
- GitHub PR 생성에는 provider token을 event에 넣지 말고 Token Broker/credential reference를 사용한다.
- 외부 write는 feature flag와 project action 권한을 모두 확인한다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | Evidence 입력 계약 정리 | RCA가 무엇을 받아야 하는지 고정한다. |
| 2 | Evidence Builder | raw evidence를 분석 가능한 구조로 정리한다. |
| 3 | RCA Result DTO와 fake analyzer | AI 없이도 downstream을 개발할 수 있다. |
| 4 | RCA completed event | dashboard/audit이 원인 분석 결과를 볼 수 있다. |
| 5 | Safe PR proposal DTO | 실제 GitHub write 전에 제안 형태를 고정한다. |
| 6 | GitHub PR adapter fake -> guarded real | 외부 write를 안전하게 분리한다. |
| 7 | Audit Timeline projection | 전체 흐름 추적을 보장한다. |
| 8 | RCA/Safe PR chain test | evidence에서 PR 제안까지 연결 검증한다. |

## Phase 1. Evidence 입력 계약 정리

목표:

```text
RCA Worker가 어떤 evidence를 입력으로 받는지 명확히 한다.
```

왜 해야 하는가:

- Target/Telemetry 담당자가 어떤 필드를 보내야 하는지 알아야 한다.
- RCA가 입력을 추측하면 분석 품질이 흔들린다.
- evidence 계약이 안정되어야 fake evidence로 병렬 작업이 가능하다.

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

## Phase 3. RCA Result DTO와 fake analyzer

목표:

```text
AI 모델 없이도 RCA 결과 형태를 만들 수 있게 한다.
```

왜 해야 하는가:

- 외부 AI/API가 준비되지 않아도 dashboard, audit, Safe PR 흐름을 개발할 수 있다.
- RCA output 계약이 먼저 있어야 prompt/model 교체가 쉬워진다.
- 근거와 결론을 분리할 수 있다.

구현할 것:

- `RcaAnalyzer` Protocol.
- `FakeRcaAnalyzer`.
- `RcaResult` DTO.
- fields: summary, root_cause, confidence, evidence_refs, recommended_fix.

생각할 것:

- confidence는 사람이 오해하지 않도록 범위와 의미를 정한다.
- evidence_refs 없이 root_cause를 만들지 않는다.
- recommended_fix는 command로 바로 실행하지 않는다.

하지 말 것:

- AI 응답 raw text를 그대로 event payload에 넣지 않는다.
- 근거 없는 결론을 높은 confidence로 표시하지 않는다.

테스트:

- fake analyzer가 deterministic result를 만든다.
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

- evidence.built -> rca.completed.
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

## Phase 6. GitHub PR adapter fake -> guarded real

목표:

```text
Fake GitHub adapter를 먼저 두고, 실제 PR 생성은 feature flag와 Token Broker 뒤에 둔다.
```

왜 해야 하는가:

- 외부 write는 프로젝트에서 가장 위험한 side effect 중 하나다.
- adapter를 분리해야 테스트에서 GitHub를 호출하지 않는다.
- token은 event가 아니라 Token Broker/credential ref로 받아야 한다.

구현할 것:

- `PullRequestClient` Protocol.
- `FakePullRequestClient`.
- real client skeleton.
- feature flag: `SAFE_PR_WRITE_ENABLED`.
- `TokenBroker.issue(..., action=create_pr)`.
- PR URL, branch, commit SHA만 event에 남김.

생각할 것:

- create_pr 권한이 project role과 credential binding을 모두 통과하는가?
- PR 생성 실패가 retry 가능한가?
- 같은 proposal을 두 번 처리하면 중복 PR이 생기지 않는가?

하지 말 것:

- PAT를 설정 파일이나 event payload에 넣지 않는다.
- 테스트에서 실제 GitHub repo에 PR을 만들지 않는다.

테스트:

- feature flag off -> proposal only 또는 write skipped.
- feature flag on + fake token -> fake PR 생성.
- 권한 실패 시 vault/token read 없음.

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

- `audit-timeline-service` 구독 확인.
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
evidence input에서 RCA 결과와 PR 제안까지 fake adapter로 연결한다.
```

왜 해야 하는가:

- 개별 worker가 맞아도 payload 이름이 틀리면 전체 흐름이 끊긴다.
- demo 전에 RCA 시나리오가 최소 한 줄로 흐르는지 확인해야 한다.
- 외부 AI/GitHub 없이도 회귀를 잡을 수 있다.

테스트:

- `cluster.evidence.received`.
- `evidence.built`.
- `rca.completed`.
- `safe_pr.requested`.
- repo-gateway fake adapter의 `safe_pr.created`.
- audit log append.

## PR 체크리스트

- 새 event subject가 `packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 있음
- 새/변경 event body가 `packages/contracts/event_bus/bodies/`에 있음
- RCA/Safe PR 동작 테스트 존재
- handler가 `@app.sub` body DTO 흐름을 유지함
- raw NATS 사용 없음
- 실제 GitHub write는 feature flag 또는 policy guard로 보호
- audit/dashboard 영향이 문서화됨
- provider token이 event/response/log/audit에 없음

## 처음 읽을 파일

1. `services/rca-worker`
2. `services/gitops/repo-gateway-worker`
3. `services/projection/audit-timeline-service`
4. `packages/contracts/event_bus/subjects.py`
5. `packages/contracts/event_bus/bodies/`
6. `packages/runtime/worker.py`
7. `docs/events.md`
8. Gateway/Auth Token Broker 설계: `docs/team/member-guides/gateway-auth.md`

## Codex 지시문

이 영역을 작업할 때는 `services/rca-worker`, `services/gitops/repo-gateway-worker`, `services/projection/audit-timeline-service`, `packages/runtime/worker.py`, `packages/runtime/service.py`, `docs/events.md`를 먼저 읽어라. 외부 write는 항상 안전장치를 먼저 확인하라.
