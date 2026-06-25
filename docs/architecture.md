# Service Implementation

This is the runnable baseline implementation for the project architecture.

External systems that are not available locally are represented by replaceable adapters, but the runtime shape is real:

- Management and target Kubernetes run as separate kind clusters.
- Management services communicate through NATS JetStream.
- Storage runs as separate Kubernetes workloads.
- Target Cluster Agent connects outbound to Management.
- OAuth provider tokens are represented by Token Vault records, not dashboard state.
- Dashboard and command APIs require a session issued by the Gateway OAuth flow.

## Service Layout

```text
 services
  + management-api-gateway       HTTP boundary, OAuth/session, dashboard APIs
  + gitops-sync-worker           Git webhook -> manifest/diff/command
  + command-worker               command policy -> target agent queue
  + rca-worker                   evidence -> RCA -> safe PR event
  + dashboard-projection-service dashboard read model projection
  + audit-timeline-service       immutable audit timeline
  + target-cluster-agent         Target Cluster Agent and telemetry adapters
  + registry.py                  role -> service folder -> runner mapping
  + main.py                      role-based process entrypoint

+ packages
  + shared                       DB, NATS, schemas, roles
  + worker_runtime               common JetStream worker runtime

+ deploy
  + kind                          two-cluster kind configs
  + management                    management Kubernetes manifests
  + target                        target Kubernetes manifests

+ scripts/*.sh                local operations for both clusters
+ secrets                     SOPS/age secret-sharing templates
```

## Ports And Adapters

공통 인터페이스는 `packages/shared/contracts.py`에 둡니다. 서비스 코드는 가능한 한
PostgreSQL, NATS, httpx 같은 구현체가 아니라 아래 포트에 의존합니다.

- `EventPublisher`, `EventRecorder`, `EventConsumerBus`: NATS JetStream 교체 가능 경계
- `RepoChangeStore`, `AgentCommandQueue`, `RcaStore`, `DashboardReadModel`, `AuditLogStore`: PostgreSQL 저장소 경계
- `OAuthAccountStore`, `SessionStore`: OAuth/token/session 저장 경계
- `ManagementPlaneClient`: Target Agent가 Management API와 통신하는 transport 경계

현재 concrete adapter는 `packages/shared/core.py`의 `Database`, `EventBus`와
`services/target-cluster-agent/agent.py`의 `HttpManagementPlaneClient`입니다.

## Minimal Running Services

Management cluster:

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

Target cluster:

- `target-cluster-agent`
- `fake-prometheus`
- `fake-loki`
- `fake-otel`
- `optional-node-collector`
- Kubernetes `ServiceAccount/RBAC`

## Event Cycle

```text
GitHub webhook
-> Management API Gateway
-> NATS git.webhook.received
-> GitOps Sync Worker
-> NATS command.requested
-> Command Worker
-> queued command for Target Agent
-> Target Cluster Agent polls and completes command
-> NATS command.completed

Target Cluster Agent
-> Management API Gateway /agent/evidence
-> NATS cluster.evidence.received
-> RCA Worker
-> evidence.built -> rca.completed -> safe_pr.created

Every event
-> Dashboard Projection Service
-> Dashboard read model
-> Dashboard query/stream from Gateway
```

## OAuth Flow

```text
UI
-> /auth/oauth/{provider}/start
-> OAuth provider redirect
-> /auth/oauth/{provider}/callback
-> Gateway stores provider token in Token Vault
-> Gateway stores user/provider metadata in PostgreSQL
-> Gateway stores session in Redis
-> Gateway publishes oauth.connected
```

The current implementation uses fake token exchange. Real Google/GitHub OAuth can replace only the provider adapter while keeping the same internal storage and event flow. UI calls should pass the returned session token as `Authorization: Bearer <token>`.

## Run

```bash
bash scripts/up.sh
bash scripts/smoke.sh
```

Open:

- Gateway health: <http://localhost:18080/healthz>
- Dashboard query: <http://localhost:18080/dashboard/query>
- Session check: <http://localhost:18080/auth/session>

Scale a management worker:

```bash
bash scripts/scale.sh rca-worker 3
```

Delete a pod and watch Kubernetes recover it:

```bash
bash scripts/kill-pod.sh rca-worker
```

Tear down:

```bash
bash scripts/down.sh
```

## Secret Sharing

Do not share `.env` files. For real provider credentials, use SOPS/age and commit only encrypted files under `secrets/*.enc.yaml`.
