# Platform Foundation Plan

This plan tracks the backend foundation for a Docker Desktop-like Kubernetes web app:
connect clusters, inspect inventory, control safe actions, deploy apps, and install catalog recipes.

## Scope

The backend remains Python/FastAPI with the current outbound cluster-agent model. Kubernetes CRDs can be added later as an optional native declaration surface, but the web app does not depend on CRDs for the first production path.

## Steps 1-8

1. Generalize permissions while keeping the current workspace/resource role model compatible.
2. Add cluster connection and agent status APIs for web UI connection state.
3. Add multi-cluster inventory snapshot ingestion and read models.
4. Add inventory query APIs for resources, workloads, services, events, and summary counts.
5. Add safe deployment control wrappers for scale/restart through the existing command pipeline.
6. Add application, deployment binding, and workflow run APIs using existing GitOps tables.
7. Add service catalog item/version/install-run backend for install wizard flows.
8. Add readiness documentation and OpenAPI route coverage tests.

## Current API Map

- `GET /clusters`, `GET /clusters/{cluster_id}`, `GET /clusters/{cluster_id}/connection-status`
- `POST /agent/inventory/snapshots`
- `GET /clusters/{cluster_id}/inventory/resources`
- `GET /clusters/{cluster_id}/inventory/summary`
- `GET /clusters/{cluster_id}/inventory/workloads`
- `GET /clusters/{cluster_id}/inventory/services`
- `GET /clusters/{cluster_id}/inventory/events`
- `POST /clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale`
- `POST /clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart`
- `GET /applications`, `POST /applications`, `GET /applications/{application_id}`
- `GET /applications/{application_id}/deployments`, `POST /applications/{application_id}/deployments`
- `GET /applications/{application_id}/runs`
- `GET /catalog/items`, `GET /catalog/items/{item_id}`, `POST /catalog/items/{item_id}/installs`

## Production Guardrails

- Cluster identity is authoritative from the per-cluster agent token, not request bodies.
- Inventory writes are append/read-model updates, so dashboards do not call target clusters directly.
- Safe controls are wrappers over command events, preserving approval, policy, queueing, lease, retry, and agent polling.
- Application APIs reuse existing GitOps tables instead of creating duplicate application/deployment concepts.
- Catalog installs create durable planned install runs; runner execution can be attached later without changing the install wizard API.
