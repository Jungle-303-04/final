# 멤버 가이드: Target / Telemetry

## 미션

대상 클러스터 연동, Kubernetes evidence, telemetry adapter, RBAC, node/runtime 수집을 담당한다.

## 담당 영역

- `services/target-cluster-agent`
- `services/node-collector`
- `deploy/target`
- fake/real Prometheus, Loki, OTel adapter
- ServiceAccount/RBAC manifest

## 현재 책임

- 실제 Prometheus query adapter를 추가한다.
- 실제 Loki query adapter를 추가한다.
- Node Collector metrics/logs가 management storage로 전달되는 방식을 확정한다.
- Target Agent는 기본적으로 outbound-only 구조를 유지한다.

## 코드 규칙

- Target Agent는 NATS가 아니라 Management Gateway를 호출한다.
- write 권한은 `sandbox` namespace로 제한한다.
- RBAC는 최소 권한 원칙을 따른다.
- fake telemetry는 fallback으로 유지한다.
- Node Collector는 secret 없이 `/metrics`와 structured stdout log를 제공한다.

## PR 체크리스트

- target manifest dry-run 통과
- PR에 RBAC 범위 설명 포함
- demo 전 `make up`, `make smoke`, `make status` 확인
- telemetry evidence schema 변경 시 RCA/Safe PR 담당자와 조율
- kubeconfig나 token commit 없음

## Codex 지시문

이 영역을 작업할 때는 `deploy/target/target.yaml`, `services/target-cluster-agent/agent.py`, `services/node-collector/node_collector.py`, `docs/events.md`를 먼저 읽어라.
