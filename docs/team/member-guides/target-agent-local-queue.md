# Target Agent Local Queue / Spool 설계 노트

## 결론

Target Agent에는 운영 단계에서 로컬 큐가 필요하다. 다만 모든 모듈에 로컬 큐를 넣는 것은 아니다.

로컬 큐는 속도를 올리는 장치가 아니라, target cluster 안에서 명령 실행, telemetry 수집, Management Gateway 전송이 한 프로세스에 몰릴 때 망가지지 않게 하는 완충 장치다.

```text
cluster-agent
  command poll
  evidence collection
  Kubernetes API calls
  management API calls
```

현재 구조는 이 일을 `asyncio.gather()` 루프 몇 개로 처리한다. 데모에는 충분하지만, 운영에서는 명령 처리와 evidence 가공이 서로 밀어낼 수 있다.

## 왜 필요한가

Target Agent는 management worker와 다르다.

Management Plane의 worker들은 NATS JetStream, PostgreSQL outbox, event_processing ledger를 쓴다. 즉 이미 중앙 durable queue와 retry 경계가 있다.

Target Agent는 NATS에 직접 붙지 않고 Gateway HTTP API만 호출한다. target cluster 내부에서 생기는 작업은 agent 프로세스 안에서 스케줄링된다. 그래서 다음 문제가 생긴다.

- 명령 실행이 오래 걸리면 evidence loop와 result 전송이 밀릴 수 있다.
- metrics/logs 수집이 폭증하면 rollback, heartbeat, command result 같은 중요한 작업이 늦어질 수 있다.
- Management Gateway가 잠시 불안정하면 evidence/result 전송 실패를 흡수할 로컬 저장소가 부족하다.
- Agent가 재시작하면 메모리 안에 있던 처리 상태가 사라진다.

## 넣을 것

운영형 Target Agent의 최소 구조:

```text
cluster-agent process
  poller task
    -> command를 가져와 command_jobs에 넣음

  telemetry scheduler task
    -> telemetry_jobs에 수집 작업을 넣음

  command worker task
    -> command_jobs에서 꺼내 실행

  telemetry worker task
    -> telemetry_jobs에서 꺼내 수집/요약

  outbound sender task
    -> result/evidence 전송
    -> 실패하면 outbound_spool에 저장 후 재전송

  rate limiter
    -> Kubernetes API / Management API 호출 속도 제한
```

## 새 네이밍과 소유 경계

이 설계에서는 `event`라는 이름을 agent 내부 파일명에 쓰지 않는다. Management Plane의
NATS event와 헷갈리기 때문이다. Target Agent 내부는 `lane`, `queue`, `spool`,
`store`로 부른다.

| 이름 | 의미 | 주 담당 |
| --- | --- | --- |
| `command_lane` | command poll, 실행 요청, heartbeat, result 흐름 | 메인 흐름/이벤트 담당 |
| `telemetry_lane` | metrics/logs/traces 수집 window 생성과 evidence 흐름 | 메인 흐름/이벤트 담당 |
| `command_jobs` | command 실행 대기 로컬 큐 | 인프라 |
| `telemetry_jobs` | telemetry/evidence 수집 대기 로컬 큐 | 인프라 |
| `outbound_spool` | gateway 전송 실패 result/evidence 재전송 저장소 | 인프라 |
| `local_store` | pod-local SQLite DB 파일과 lease/retry/idempotency 계약 | 인프라 |

파일 경계:

```text
src/services/target/cluster-agent/
  agent.py              # 실행 조립만 담당. 큰 흐름 변경자는 여기 최소 수정.
  work_queue.py         # 큐 이름, 상태, payload 모델. 인프라 소유.
  store.py              # SQLite 기반 pod-local DB. 인프라 소유.
  command_lane.py       # 나중에 command 흐름 담당자가 추가.
  telemetry_lane.py     # 나중에 telemetry 흐름 담당자가 추가.
  outbound_spool.py     # 나중에 gateway 재전송 worker가 커지면 분리.
```

## poll_command 이후 흐름

현재 구현은 `poll_command`가 명령을 가져오면 같은 루프 안에서 바로 실행까지 이어진다.

```text
poll_command
  -> start_command
  -> execute_command_with_heartbeat
       -> heartbeat_command 반복
       -> execute_command
            -> apply_manifest_command 또는 rollout_restart_command
  -> complete_command
```

운영 설계에서는 `poll_command`가 가져온 명령을 바로 실행하지 않고, 먼저
`command_jobs`에 저장한다.

```text
poll_command
  -> LocalStore.enqueue_job(command_jobs)
  -> command_lane worker가 lease
  -> start_command
  -> execute_command_with_heartbeat
  -> LocalStore.enqueue_outbound(command_result)
  -> outbound sender가 complete_command 전송
```

이렇게 나누면 명령 수신, 명령 실행, 결과 전송이 서로 다른 실패 경계를 가진다. telemetry가
밀려도 command result와 heartbeat를 먼저 처리할 수 있고, agent pod가 재시작돼도 로컬 DB에
남은 작업을 복구할 수 있다.

pod를 늘릴 때의 기준:

```text
cluster-agent replicas = N
  각 pod는 자기 local_store(SQLite)를 가진다.
  command 중복 방지는 Management Gateway의 command lease가 맡는다.
  evidence 중복 방지는 source lease + evidence_key/window_start가 맡는다.
  local DB는 전역 source of truth가 아니라 pod-local 완충 장치다.
```

따라서 local DB를 공유 볼륨으로 묶어 여러 pod가 동시에 쓰는 방식은 기본 설계가 아니다.
pod 간 전역 조율은 Management Plane의 lease/idempotency 계약으로 해결하고, 각 pod의
local DB는 재시작 복구와 전송 실패 흡수에 집중한다.

큐 종류:

| 큐 | 성격 | 정책 |
| --- | --- | --- |
| `command_jobs` | 명령 실행 대기열 | bounded, 높은 우선순위, 낮은 concurrency |
| `telemetry_jobs` | telemetry/evidence 수집 대기열 | bounded, 낮은 우선순위, 샘플링/드롭 허용 |
| `outbound_spool` | 전송 실패한 result/evidence 저장 | local durable, 재시작 후 재전송 |

## Durable queue와 bounded queue

Durable queue:

```text
작업을 디스크/SQLite 같은 로컬 저장소에 먼저 기록
-> agent 재시작 후에도 남아 있음
-> result/evidence 재전송 가능
```

Bounded queue:

```text
큐 크기를 제한
-> 무한히 쌓아 메모리를 터뜨리지 않음
-> 가득 차면 기다림, 거절, 샘플링, 낮은 우선순위 드롭 같은 정책 적용
```

둘은 역할이 다르다. durable은 복구성, bounded는 과부하 보호다.

## 우선순위

Target Agent에서는 모든 일이 같은 중요도가 아니다.

```text
1. command heartbeat / command result
2. command execution
3. evidence shipment
4. telemetry collection
5. low-value periodic samples
```

장애 상황에서는 logs/metrics가 폭증할 수 있다. 이때 evidence를 전부 처리하려고 하면 정작 rollback 명령이나 command result가 늦어진다.

그래서 evidence는 샘플링하거나 버릴 수 있지만, command result와 heartbeat는 우선 처리해야 한다.

## 모든 모듈에 필요한가

아니다.

| 영역 | 로컬 큐 필요 여부 | 이유 |
| --- | --- | --- |
| Management worker | 보통 불필요 | NATS, outbox, ledger가 이미 durable queue 역할을 한다. |
| API Gateway | 보통 불필요 | HTTP ingress는 빠르게 검증하고 event/DB 경계로 넘겨야 한다. |
| Dashboard/projection worker | 보통 불필요 | 이벤트 재처리와 read model 갱신은 중앙 runtime이 담당한다. |
| GitOps render/diff worker | 보통 불필요 | 재시도는 event runtime과 outbox가 담당한다. Git cache는 별도 shared cache로 다룬다. |
| Target Agent | 필요 | target cluster 내부 작업, external API 호출, evidence/result 전송 실패를 로컬에서 흡수해야 한다. |
| Node Collector | 제한적으로 필요 | raw metric/log 수집은 작은 ring buffer나 bounded in-memory buffer면 충분하다. durable spool은 보통 agent 쪽이 맡는다. |

판단 기준:

```text
중앙 NATS/Postgres runtime 안에서 도는가?
  yes -> 로컬 큐를 먼저 넣지 않는다.

target cluster 내부에서 management plane과 끊겨도 잠깐 버텨야 하는가?
  yes -> local durable spool 후보.

작업 폭증 시 낮은 가치의 일을 버려도 되는가?
  yes -> bounded queue / sampling 후보.

작업 실행이 오래 걸려 다른 작업을 막을 수 있는가?
  yes -> priority queue / worker 분리 후보.
```

## 구현 순서

한 번에 큰 agent framework를 만들지 않는다.

1. `outbound_spool`부터 작게 만든다.
   - command result와 evidence 전송 실패를 로컬에 저장한다.
   - 재시작 후 재전송한다.
   - 오래된 항목 TTL과 최대 크기를 둔다.

2. `telemetry_jobs`를 bounded queue로 둔다.
   - 주기 evidence가 밀리면 최신 샘플 위주로 남긴다.
   - queue full이면 low-value sample을 drop한다.

3. `command_jobs`를 priority queue로 분리한다.
   - command 실행 concurrency를 낮게 둔다.
   - heartbeat/result sender는 command execution과 분리한다.

4. Kubernetes API와 Management API rate limiter를 붙인다.
   - API server와 Gateway를 보호한다.

5. 부하가 더 커지면 프로세스를 분리한다.

```text
cluster-command-agent
cluster-telemetry-agent
node-collector DaemonSet
```

## 주의할 점

- 로컬 큐에 secret, kubeconfig, service account token을 저장하지 않는다.
- 로컬 큐는 중앙 DB의 source of truth가 아니다. 복구용 완충 장치다.
- command는 idempotency key와 lease_id를 유지한다.
- evidence는 중복 전송될 수 있으므로 evidence_key/window_start로 dedupe한다.
- 큐가 가득 찼다는 사실 자체를 health/status로 보고해야 한다.
