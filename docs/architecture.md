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
 service
  + gateway                  Management API Gateway, OAuth/session, dashboard APIs
  + workers
    + gitops.py              Git webhook -> manifest/diff/command
    + command.py             command policy -> target agent queue
    + rca.py                 evidence -> RCA -> safe PR event
    + dashboard.py           dashboard read model projection
    + audit.py               immutable audit timeline
    + runtime.py             common JetStream worker runtime
    + registry.py            role -> subject -> handler mapping
  + target                   Target Cluster Agent and fake telemetry adapters
  + shared                   DB, NATS, schemas, shared contracts
  + main.py                  role-based service entrypoint

+ deploy
  + kind                          two-cluster kind configs
  + management                    management Kubernetes manifests
  + target                        target Kubernetes manifests

+ scripts/*.sh                local operations for both clusters
+ secrets                     SOPS/age secret-sharing templates
```

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
