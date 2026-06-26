# Member Guide: Target / Telemetry

## Mission

Own target cluster integration, Kubernetes evidence, telemetry adapters, RBAC, and node/runtime collection.

## Owned Areas

- `services/target-cluster-agent`
- `services/node-collector`
- `deploy/target`
- fake and real Prometheus/Loki/OTel adapters
- ServiceAccount/RBAC manifests

## Current Responsibilities

- Add real Prometheus query adapter.
- Add real Loki query adapter.
- Decide how Node Collector metrics/logs reach management storage.
- Keep target agent outbound-only by default.

## Coding Rules

- Target agent calls Management Gateway, not NATS.
- Keep writes limited to `sandbox` namespace.
- RBAC must be least-privilege.
- Fake telemetry remains as fallback.
- Node Collector must expose `/metrics` and structured stdout logs without secrets.

## PR Checklist

- Target manifests render with dry-run.
- RBAC scope is explained in PR.
- `make up`, `make smoke`, `make status` are checked before demo.
- Telemetry evidence schema changes are coordinated with Workflow/RCA and Dashboard.
- No kubeconfig or token is committed.

## Codex Instruction

When working in this lane, read `deploy/target/target.yaml`, `services/target-cluster-agent/agent.py`, `services/node-collector/node_collector.py`, and `docs/events.md` first.

