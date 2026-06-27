# 멤버 가이드: GitOps / Command

## 미션

Git webhook 입력을 받아 Kubernetes manifest 변화로 해석하고, 안전한 command plan으로 바꿔 Target Agent가 가져갈 수 있는 queue까지 연결한다.

이 담당자는 이벤트 시스템 내부 구현을 모두 알 필요는 없다. 다만 worker는 이벤트를 받아서 처리하고, 다음 이벤트를 발행한다는 규칙을 지켜야 한다.

```text
Gateway
  -> git.webhook.received

GitOps Sync Worker
  -> git.changed
  -> manifest.rendered
  -> desired.diff.detected
  -> command.requested

Command Worker
  -> command.dispatch.ready
  -> command.dispatched
  -> agent command queue 저장
  -> command.queued_for_agent

Target Agent
  -> Gateway에서 command poll
```

## 담당 영역

- `services/gitops-sync-worker`
- `services/command-worker`
- manifest render
- desired state diff
- command 생성과 dispatch 준비
- command policy
- command planner/dispatcher
- 관련 worker test

## 현재 책임

- Git webhook event를 `git.changed`, `manifest.rendered`, `desired.diff.detected` 흐름으로 정리한다.
- diff 결과가 안전한 command payload로 변환되게 만든다.
- command는 production write가 아니라 `sandbox` 또는 demo namespace 기준으로 제한한다.
- command 생성과 dispatch 준비 event에 대한 테스트를 추가한다.
- command worker는 agent를 직접 호출하지 않고 agent command queue에 저장한다.

## 이벤트 시스템을 몰라도 되는 작업 규칙

Worker 담당자가 꼭 알아야 할 것:

- handler는 `EventEnvelope`를 받는다.
- 입력 본문은 `evt.payload`에서 읽는다.
- 새 이벤트를 발행할 때는 `EventClient`를 쓴다.
- `correlation_id`는 runtime/client가 이어가므로 직접 새로 만들지 않는다.
- ack/nak/retry/DLQ는 `packages/runtime/worker.py` 책임이다. workflow 코드에서 직접 처리하지 않는다.
- subject를 새로 만들면 `packages/contracts/event_bus/subjects.py`, payload DTO를 새로 만들면 `packages/contracts/event_bus/payloads.py`, 설명은 `docs/events.md`에 같이 반영한다.

모르는 상태에서 작업할 때의 기준:

- “다음 서비스가 알았으면 하는 사실”은 event로 발행한다.
- “Agent가 나중에 가져가야 하는 일”은 DB agent command queue에 저장한다.
- “이미 처리한 event인지”는 runtime ledger가 처리하므로 handler에서 중복 ack를 다루지 않는다.

## 코드 규칙

- Worker 구독은 각 서비스 `settings.py`의 `SUBSCRIPTION`에 선언한다.
- Worker runner는 `WorkerService.from_subscription(...)`으로 실행한다.
- Worker는 `EventClient`로 발행한다.
- Handler는 `EventEnvelope`를 받고 `evt.payload`로 입력을 읽는다.
- 발행 payload는 `packages/contracts/event_bus/payloads.py`의 dataclass를 사용한다.
- `correlation_id`를 유지한다.
- handler write는 idempotent하거나 conflict-safe해야 한다.
- workflow code에서 직접 ack/nak하지 않는다.
- command policy, planner, dispatcher는 분리한다.
- secret/token은 command payload에 넣지 않는다. 필요하면 `credential_ref`만 넣는다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | GitOps worker 입력/출력 계약 정리 | event 흐름의 첫 단추를 고정한다. |
| 2 | Webhook payload -> GitChanged 변환 | Git 입력을 내부 표준 event로 바꾼다. |
| 3 | Manifest render DTO와 fake renderer | 실제 Git/Kustomize 없이 다음 담당자가 작업 가능하다. |
| 4 | Desired diff DTO와 diff detector | command 생성 전에 변경 내용을 구조화한다. |
| 5 | CommandRequested payload 생성 | Gateway/Command Worker 연결점을 만든다. |
| 6 | Command policy rule 구조 | namespace/action 제한을 범용 rule로 검사한다. |
| 7 | Planner/Dispatcher/Queue 연결 | command를 Agent가 poll할 수 있는 상태로 만든다. |
| 8 | E2E worker chain test | subject/payload 연결이 끊기지 않았는지 검증한다. |

## Phase 1. GitOps worker 입력/출력 계약 정리

목표:

```text
GitOps Sync Worker가 어떤 event를 받고 어떤 event를 발행하는지 계약을 고정한다.
```

왜 해야 하는가:

- 이벤트 시스템을 모르는 팀원도 subject 이름과 payload DTO만 보고 작업할 수 있다.
- subject/payload가 흔들리면 Gateway, Dashboard, Audit, Command Worker가 모두 깨진다.
- 구현 전에 계약을 먼저 고정하면 테스트를 작게 쓸 수 있다.

구현할 것:

- `EventSubject.GIT_WEBHOOK_RECEIVED` 구독 확인.
- `GitChangedPayload`, `RenderedManifestPayload`, `DesiredDiffDetectedPayload`, `CommandRequestedPayload` 확인 또는 보강.
- 각 payload의 필수 필드 정리.
- `docs/events.md`에 입력/출력 흐름 표 추가.

생각할 것:

- payload에 원본 webhook 전체를 넣을 필요가 있는가?
- repo, commit_sha, branch, installation_id 같은 추적 필드가 있는가?
- secret이나 webhook signature가 event에 들어가지 않는가?

하지 말 것:

- subject 문자열을 서비스 코드에 직접 하드코딩하지 않는다.
- payload dict를 아무 곳에서나 자유롭게 만들지 않는다.

테스트:

- payload DTO `to_payload()` 결과가 기대 field를 가진다.
- worker settings의 subscription subject가 문서와 일치한다.

## Phase 2. Webhook payload -> GitChanged 변환

목표:

```text
Gateway가 발행한 webhook event를 내부 GitChanged event로 변환한다.
```

왜 해야 하는가:

- 외부 GitHub webhook 형식을 내부 서비스 전체에 퍼뜨리면 나중에 GitLab을 붙이기 어렵다.
- 내부 worker들은 `GitChangedPayload`만 알면 된다.
- correlation 흐름을 시작점부터 유지해야 dashboard/audit이 한 요청으로 묶인다.

구현할 것:

- `GitWebhookReceived` 입력 검증.
- repository, branch, commit_sha 추출.
- `git.changed` 발행.
- 잘못된 webhook payload는 명확한 실패 처리.

생각할 것:

- push event만 지원할지, PR event도 지원할지.
- branch filter가 필요한지.
- 같은 commit event가 중복 들어오면 안전한지.

하지 말 것:

- GitHub raw payload 전체를 다른 event에 그대로 복사하지 않는다.
- provider token을 event에 넣지 않는다.

테스트:

- 정상 webhook -> `git.changed` 발행.
- 필수 field 누락 -> 실패.
- correlation_id 유지.

## Phase 3. Manifest render DTO와 fake renderer

목표:

```text
Git 변경을 Kubernetes manifest 형태로 렌더링한 결과를 event로 만든다.
```

왜 해야 하는가:

- 실제 Kustomize/Helm/Git checkout 없이도 command 흐름을 먼저 연결할 수 있다.
- renderer를 interface로 두면 fake -> real renderer 교체가 쉽다.
- manifest render 결과는 diff의 입력이므로 구조가 명확해야 한다.

구현할 것:

- `ManifestRenderer` Protocol.
- `FakeManifestRenderer`.
- `RenderedManifest` DTO.
- `manifest.rendered` 발행.

생각할 것:

- manifest가 너무 크면 event payload에 다 넣을지, DB/ref로 뺄지.
- apiVersion/kind/namespace/name은 diff에 필요한 최소 키다.
- render 실패는 retry 가능한가? Git/network 문제면 가능하다.

하지 말 것:

- render 단계에서 Kubernetes cluster에 apply하지 않는다.
- manifest 문자열을 ad-hoc parsing하지 않는다. 가능하면 structured object로 둔다.

테스트:

- fake renderer 결과가 `manifest.rendered` payload로 변환된다.
- render 실패 시 handler 예외가 runtime retry로 이어질 수 있다.

## Phase 4. Desired diff DTO와 diff detector

목표:

```text
현재 원하는 상태와 이전 상태의 차이를 구조화한다.
```

왜 해야 하는가:

- command는 diff를 근거로 만들어져야 한다.
- diff가 구조화되어야 policy가 어떤 namespace/action인지 검사할 수 있다.
- RCA/Safe PR도 diff를 근거로 설명할 수 있다.

구현할 것:

- `DiffDetector` Protocol.
- fake diff detector.
- diff item schema: kind, namespace, name, action, before, after.
- `desired.diff.detected` 발행.

생각할 것:

- create/update/delete 중 어떤 action을 command로 허용할 것인가.
- namespace가 없는 cluster-scoped resource는 어떻게 제한할 것인가.
- diff가 없으면 command를 만들지 말아야 하는가? 맞다.

하지 말 것:

- diff가 비어도 command를 발행하지 않는다.
- production namespace 변경을 통과시키지 않는다.

테스트:

- diff 있음 -> `desired.diff.detected`.
- diff 없음 -> command 요청 없음.
- namespace/action 필드 포함.

## Phase 5. CommandRequested payload 생성

목표:

```text
diff를 Command Worker가 이해할 수 있는 command.requested event로 변환한다.
```

왜 해야 하는가:

- GitOps Sync Worker는 command를 직접 queue에 넣지 않는다.
- command policy/dispatch 책임은 Command Worker가 가진다.
- 두 worker 사이 계약이 명확해야 테스트와 디버깅이 쉽다.

구현할 것:

- command requested payload DTO.
- command action 결정.
- target cluster id 결정.
- namespace 포함.
- `command.requested` 발행.

생각할 것:

- action 기본값을 설정에서 받을지, diff에서 결정할지.
- target cluster id가 없으면 기본값을 둘지 거부할지.
- command payload에 사람이 읽을 수 있는 reason/summary가 있는지.

하지 말 것:

- Agent command queue에 직접 저장하지 않는다.
- Target Agent를 직접 호출하지 않는다.

테스트:

- diff -> command.requested 발행.
- non-sandbox namespace는 command policy에서 거부될 수 있도록 namespace를 보존.
- command payload에 secret 없음.

## Phase 6. Command policy rule 구조

목표:

```text
Command Worker가 command.requested를 받아 범용 policy rule로 허용/거부를 결정한다.
```

왜 해야 하는가:

- 처음 정책은 sandbox namespace 하나지만 앞으로 action, cluster, requester, environment 조건이 늘어난다.
- 정책을 if문으로 흩뿌리면 새 조건을 추가할 때 핵심 workflow를 계속 수정하게 된다.
- 실패 reason을 명확히 남겨야 dashboard/audit에서 설명할 수 있다.

구현할 것:

- `Payload` wrapper.
- `Rule` Protocol.
- `EqualsRule` 같은 기본 rule.
- `Policy.evaluate(payload)`.
- 실패 시 `command.rejected` 발행.

생각할 것:

- 첫 실패만 반환할지, 모든 실패를 모을지. 현재는 첫 실패가 단순하다.
- default 값을 rule config에 둘지, payload wrapper에 둘지.
- policy 실패는 retry 대상이 아니다. 정상 거절 event로 끝난다.

하지 말 것:

- policy 실패를 exception으로 던져 DLQ로 보내지 않는다.
- namespace 비교를 workflow 본문에 계속 추가하지 않는다.

테스트:

- sandbox namespace 허용.
- non-sandbox namespace 거부.
- 거부 payload에 reason과 requested 포함.

## Phase 7. Planner/Dispatcher/Queue 연결

목표:

```text
허용된 command를 실행 plan으로 만들고 agent command queue에 저장한다.
```

왜 해야 하는가:

- plan은 command_id, cluster_id, action, namespace, steps를 가진 실행 계획이다.
- dispatcher는 이벤트로 상태를 알리고, queue에 저장해 Agent가 poll할 수 있게 한다.
- Agent 호출은 이 단계에서 하지 않는다.

구현할 것:

- `Planner` Protocol.
- `Plan` DTO.
- `Dispatcher`.
- `command.dispatch.ready` 발행.
- `command.dispatched` 발행.
- `queue_agent_command`.
- `command.queued_for_agent` 발행.

생각할 것:

- plan.data가 Agent가 실행하기 충분한가?
- queue 저장 실패 시 앞선 event와 불일치가 생길 수 있다. outbox는 플랫폼 담당과 논의한다.
- command_id는 어디서 생성하고 추적하는가?

하지 말 것:

- Dispatcher에서 Kubernetes API를 호출하지 않는다.
- DB queue 저장 없이 queued event만 발행하지 않는다.

테스트:

- policy 통과 -> ready/dispatched/queued event 순서.
- queue_agent_command 호출 검증.
- correlation_id 유지.

## Phase 8. E2E worker chain test

목표:

```text
Webhook에서 command queued까지 fake bus/fake db로 한 줄 흐름을 검증한다.
```

왜 해야 하는가:

- 각 worker 단위 테스트가 통과해도 subject/payload 이름이 어긋나면 전체 흐름은 끊긴다.
- 팀원들이 이벤트 시스템을 몰라도 회귀를 잡을 수 있다.
- demo 전에 가장 싼 안전장치다.

구현할 것:

- fake EventClient.
- fake command queue.
- webhook input fixture.
- expected subjects list.

테스트:

- `git.changed`.
- `manifest.rendered`.
- `desired.diff.detected`.
- `command.requested`.
- `command.dispatch.ready`.
- `command.dispatched`.
- `command.queued_for_agent`.

## PR 체크리스트

- 새 event subject가 `packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 있음
- 새/변경 event payload가 `packages/contracts/event_bus/payloads.py`에 있음
- manifest/diff/command 흐름 테스트 존재
- handler가 `EventEnvelope`와 payload DTO 흐름을 유지함
- raw NATS 사용 없음
- command payload 변경 시 Gateway/Auth와 Target/Telemetry에 공유
- audit/dashboard 영향이 있으면 문서화
- policy 실패는 DLQ가 아니라 command.rejected로 끝나는지 확인

## 처음 읽을 파일

1. `docs/events.md`
2. `packages/contracts/event_bus/subjects.py`
3. `packages/contracts/event_bus/payloads.py`
4. `packages/runtime/worker.py`
5. `packages/runtime/service.py`
6. `services/gitops-sync-worker`
7. `services/command-worker`

## Codex 지시문

이 영역을 작업할 때는 `docs/events.md`, `packages/runtime/worker.py`, `packages/runtime/service.py`, `services/gitops-sync-worker`, `services/command-worker`를 먼저 읽어라. handler는 작게 유지하고 event contract를 깨지 마라.
