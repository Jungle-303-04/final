# 서비스 구현 구조

이 문서는 현재 프로젝트 아키텍처를 실제 실행 가능한 코드 기준으로 설명한다.

로컬에서 바로 붙일 수 없는 외부 시스템은 교체 가능한 어댑터로 표현하지만, 실행 구조 자체는 실제 운영 구조를 따른다.

- 관리 영역과 대상 Kubernetes는 별도 kind 클러스터로 실행한다.
- 관리 영역의 서비스들은 NATS JetStream을 통해 비동기로 통신한다.
- 저장소는 Kubernetes workload로 분리해 실행한다.
- 대상 클러스터 Agent는 관리 영역으로 outbound 연결만 맺는다.
- OAuth provider token은 Dashboard 상태가 아니라 Token Vault record로 관리한다.
- Dashboard와 command API는 Gateway OAuth flow가 발급한 session을 요구한다.

## 서비스 배치

```text
services
  + management-api-gateway       HTTP 경계, OAuth/session, dashboard API
  + gitops-sync-worker           Git webhook -> manifest/diff/command
  + command-worker               command policy -> target agent queue
  + rca-worker                   evidence -> RCA -> safe PR event
  + dashboard-projection-service dashboard read model projection
  + audit-timeline-service       변경 불가능한 audit timeline
  + target-cluster-agent         Target Cluster Agent와 telemetry adapter
  + node-collector               선택형 DaemonSet node/runtime metrics source

packages
  + config                       env, 상수, 시간 helper
  + contracts                    Protocol port와 Pydantic request schema
  + events                       event envelope, NATS JetStream, DLQ event sink
  + storage                      PostgreSQL 저장소와 schema 초기화
  + runtime                      FastAPI/worker/async service 실행 객체

deploy
  + kind                         두 개의 kind cluster 설정
  + management                   관리 클러스터 Kubernetes manifest
  + target                       대상 클러스터 Kubernetes manifest

scripts/*.sh                    양쪽 클러스터 로컬 운영 스크립트
secrets                         SOPS/age 기반 secret 공유 템플릿
```

## 실행 단위

각 Kubernetes workload는 중앙 dispatcher에 role 문자열을 넘기지 않는다. Deployment/DaemonSet이 각 서비스 entrypoint를 직접 실행한다.

```text
management-api-gateway        -> python services/management-api-gateway/runner.py
gitops-sync-worker            -> python services/gitops-sync-worker/runner.py
command-worker                -> python services/command-worker/runner.py
rca-worker                    -> python services/rca-worker/runner.py
dashboard-projection-service  -> python services/dashboard-projection-service/runner.py
audit-timeline-service        -> python services/audit-timeline-service/runner.py
target-cluster-agent          -> python services/target-cluster-agent/runner.py
optional-node-collector       -> python services/node-collector/runner.py
fake-prometheus               -> python services/target-cluster-agent/fake_prometheus.py
fake-loki                     -> python services/target-cluster-agent/fake_loki.py
fake-otel                     -> python services/target-cluster-agent/fake_otel.py
```

현재는 Docker image를 하나만 빌드하지만, 실행 파일 경계가 이미 서비스별로 갈라져 있다. 이후 운영 부담이 커지면 같은 entrypoint를 유지한 채 서비스별 Dockerfile/image로 분리한다.

## 포트와 어댑터

공통 인터페이스는 `packages/contracts/interfaces.py`에 둔다. 서비스 코드는 가능한 한 PostgreSQL, NATS, `httpx` 같은 구현체가 아니라 아래 포트에 의존한다.

- `EventPublisher`, `EventRecorder`, `EventConsumerBus`: NATS JetStream을 교체할 수 있는 경계
- `EventClient`: 서비스 코드가 사용하는 publish 경계
- `RepoChangeStore`, `AgentCommandQueue`, `RcaStore`, `DashboardReadModel`, `AuditLogStore`: PostgreSQL 저장소 경계
- `OAuthAccountStore`, `SessionStore`: OAuth/token/session 저장 경계
- `ManagementPlaneClient`: Target Agent가 Management API와 통신하는 transport 경계

현재 concrete adapter는 `packages/storage/database.py`의 `Database`, `packages/events/bus.py`의 `EventBus`, `services/target-cluster-agent/agent.py`의 `HttpManagementPlaneClient`다.

각 service runner는 `packages/runtime/service.py`의 실행 객체만 사용한다.

- `FastApiService`: HTTP API process
- `WorkerService`: JetStream subject 구독 worker process
- `AsyncService`: agent, collector처럼 직접 async loop를 가진 process

서비스 폴더에서 `EventHandlerSpec`, `WorkerRuntime`, NATS client를 직접 조립하지 않는다. 새 worker는 `WorkerService(service_name, subject, handler_factory).run()` 형태로 추가한다.

이벤트 작성, 구독, retry, DLQ, replay 기준은 `docs/events.md`를 따른다.

## 최소 실행 서비스

관리 클러스터:

- `management-api-gateway`
- `gitops-sync-worker`
- `command-worker`
- `rca-worker`
- `dashboard-projection-service`
- `audit-timeline-service`
- `nats`
- `postgresql`
- `redis`
- `minio`

대상 클러스터:

- `target-cluster-agent`
- `node-collector`: `optional-node-collector` DaemonSet으로 실행
- `fake-prometheus`
- `fake-loki`
- `fake-otel`
- Kubernetes `ServiceAccount/RBAC`

## 이벤트 흐름

```text
GitHub webhook
-> Management API Gateway
-> NATS git.webhook.received
-> GitOps Sync Worker
-> NATS command.requested
-> Command Worker
-> Target Agent용 command queue 저장
-> Target Cluster Agent가 polling 후 command 완료
-> NATS command.completed

Target Cluster Agent
-> Management API Gateway /agent/evidence
-> NATS cluster.evidence.received
-> RCA Worker
-> evidence.built -> rca.completed -> safe_pr.created

모든 event
-> Dashboard Projection Service
-> Dashboard read model
-> Gateway의 dashboard query/stream
```

실패한 event 처리:

```text
packages/runtime/worker.py
-> event_processing retrying
-> NATS nak
-> max attempts 초과
-> event_dead_letters
-> dead_letter.created
-> Gateway /dead-letters replay
```

## OAuth 흐름

```text
UI
-> /auth/oauth/{provider}/start
-> OAuth provider redirect
-> /auth/oauth/{provider}/callback
-> Gateway가 provider token을 Token Vault에 저장
-> Gateway가 user/provider metadata를 PostgreSQL에 저장
-> Gateway가 session을 Redis에 저장
-> Gateway가 oauth.connected 발행
```

현재 구현은 fake token exchange를 사용한다. 실제 Google/GitHub OAuth를 붙일 때는 provider adapter만 교체하고 내부 저장 구조와 event flow는 유지한다. UI 호출은 반환된 session token을 `Authorization: Bearer <token>`으로 전달해야 한다.

## 실행

```bash
bash scripts/up.sh
bash scripts/smoke.sh
```

접속:

- Gateway health: <http://localhost:18080/healthz>
- Dashboard query: <http://localhost:18080/dashboard/query>
- Session check: <http://localhost:18080/auth/session>

관리 worker scale:

```bash
bash scripts/scale.sh rca-worker 3
```

pod 삭제 후 Kubernetes 복구 확인:

```bash
bash scripts/kill-pod.sh rca-worker
```

정리:

```bash
bash scripts/down.sh
```

## 시크릿 공유

`.env` 파일은 공유하지 않는다. 실제 provider credential은 SOPS/age를 사용하고, `secrets/*.enc.yaml` 아래에는 암호화된 파일만 commit한다.
