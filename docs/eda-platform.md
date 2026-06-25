# EDA Platform Implementation

This is the runnable implementation scaffold for the project architecture.

External systems are still represented by fake adapters where needed, but the runtime shape is real:

- Management and target Kubernetes run as separate kind clusters.
- Management services communicate through NATS JetStream.
- Storage runs as separate Kubernetes workloads.
- Target Cluster Agent connects outbound to Management.
- OAuth provider tokens are represented by Token Vault records, not dashboard state.
- Dashboard and command APIs require a session issued by the Gateway OAuth flow.

## Service Layout

```text
 services/eda_platform
  + eda_platform/core.py          shared DB and NATS contracts
  + eda_platform/gateway.py       Management API Gateway, OAuth/session, dashboard APIs
  + eda_platform/workflows.py     GitOps, Command, RCA, Dashboard, Audit workers
  + eda_platform/target_agent.py  Target Cluster Agent and fake telemetry adapters
  + eda_platform/main.py          role-based service entrypoint

+ deploy/eda
  + kind                          two-cluster kind configs
  + management                    management Kubernetes manifests
  + target                        target Kubernetes manifests

+ scripts/eda-*.sh                local operations for both clusters
+ secrets/eda                     SOPS/age secret-sharing templates
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
bash scripts/eda-up.sh
bash scripts/eda-smoke.sh
```

Open:

- Gateway health: <http://localhost:18080/healthz>
- Dashboard query: <http://localhost:18080/dashboard/query>
- Session check: <http://localhost:18080/auth/session>

Scale a management worker:

```bash
bash scripts/eda-scale.sh rca-worker 3
```

Delete a pod and watch Kubernetes recover it:

```bash
bash scripts/eda-kill-pod.sh rca-worker
```

Tear down:

```bash
bash scripts/eda-down.sh
```

## Secret Sharing

Do not share `.env` files. For real provider credentials, use SOPS/age and commit only encrypted files under `secrets/eda/*.enc.yaml`.
