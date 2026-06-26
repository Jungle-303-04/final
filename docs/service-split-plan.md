# 서비스 분리 계획

현재 코드는 하나의 monorepo에서 시작하지만, 실행 단위는 `services/<service-name>` 마이크로서비스 인스턴스로 분리한다.
Kubernetes에서는 중앙 role dispatcher를 사용하지 않고 각 Deployment/DaemonSet이 서비스 entrypoint를 직접 실행한다.

## 현재 폴더 매핑

```text
services/management-api-gateway
  Management API Gateway
  OAuth/session
  command/dashboard/agent HTTP 경계

services/gitops-sync-worker
  GitOps / Desired State

services/command-worker
  Command / Control

services/rca-worker
  RCA / Evidence

services/dashboard-projection-service
  Read Model / Dashboard Projection

services/audit-timeline-service
  Audit Timeline

services/target-cluster-agent
  Target Cluster Agent
  telemetry adapter
  command receiver

services/node-collector
  선택형 DaemonSet collector
  node/runtime metrics endpoint
  Loki 스타일 collector를 위한 stdout log sample

packages/shared
  NATS JetStream contract
  PostgreSQL access
  request/command/event schema
  Protocol port
  service bootstrap

packages/worker_runtime
  공통 JetStream worker runtime
  EventHandlerSpec subscription 경계
  retry / event_processing / DLQ 정책

deploy
  management cluster manifest
  target cluster manifest

secrets
  SOPS/age template
  provider token 공유 정책
```

## 현재 실행 매핑

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

## 추가 분리 순서

1. `services/management-api-gateway` 내부 route를 `auth`, `agent`, `commands`, `dashboard`, `github`으로 나눈다.
2. 각 service의 DB query를 repository 객체로 분리한다.
3. dashboard 트래픽이 커지면 `Dashboard Query API`와 `Realtime Gateway`를 별도 service folder로 분리한다.
4. 실제 GitHub PR 생성이 들어가면 `Safe PR`을 `services/safe-pr-service`로 분리한다.
5. 실제 Prometheus/Loki/OTel 연동이 들어가면 `services/target-cluster-agent` adapter를 provider별 파일로 분리하고, node-level 수집은 `services/node-collector`에서 확장한다.
6. 배포 운영이 무거워지면 현재 entrypoint를 유지한 채 하나의 image를 서비스별 image로 나눈다.

## 규칙

- 먼저 service/process 경계를 유지하고, 파일은 책임별로 나눈다.
- 서비스 workflow는 `packages/shared/contracts.py` 포트에 의존하고 concrete adapter는 runner/composition 경계에서 주입한다.
- 이벤트 작성과 DLQ 운영 기준은 `docs/events.md`를 source of truth로 둔다.
- DB schema는 공유 PostgreSQL에서 시작하되 schema/table ownership을 문서화한다.
- 외부 write 권한은 gateway/auth/policy를 지나게 한다.
- target cluster는 outbound 연결을 기본값으로 둔다.
- production write는 기본 금지하고 `sandbox` namespace부터 허용한다.
