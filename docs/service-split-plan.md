# Service Split Plan

현재 코드는 하나의 monorepo와 하나의 Docker image를 사용하지만, 폴더는 실행될 마이크로서비스 기준으로 나눕니다.
Kubernetes에서는 같은 image를 role 인자로 다르게 실행해서 `services/<service-name>` 인스턴스를 분리합니다.

## Current Folder Mapping

```text
services/management-api-gateway
  Management API Gateway
  OAuth/session
  command/dashboard/agent HTTP boundary

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
  telemetry adapters
  command receiver

packages/shared
  NATS JetStream contract
  PostgreSQL access
  request/command/event schemas
  Protocol ports

packages/worker_runtime
  shared JetStream worker runtime

deploy
  management cluster manifests
  target cluster manifests

secrets
  SOPS/age templates
  provider token sharing policy
```

## Split Order

1. `services/management-api-gateway` 내부 route를 `auth`, `agent`, `commands`, `dashboard`, `github`로 나눕니다.
2. 각 service의 DB query를 repository 객체로 분리합니다.
3. `dashboard` 트래픽이 커지면 `Dashboard Query API`와 `Realtime Gateway`를 별도 service folder로 분리합니다.
4. 실제 GitHub PR 생성이 들어가면 `Safe PR`을 `services/safe-pr-service`로 분리합니다.
5. 실제 Prometheus/Loki/OTel 연동이 들어가면 `services/target-cluster-agent` adapter를 provider별 파일로 분리합니다.
6. 배포 운영이 무거워지면 하나의 image를 서비스별 image로 나눕니다.

## Rules

- 먼저 role/process 경계를 유지하고, 파일만 책임별로 나눕니다.
- 서비스 workflow는 `packages/shared/contracts.py` 포트에 의존하고 concrete adapter는 runner/composition 경계에서 주입합니다.
- DB schema는 공유 PostgreSQL에서 시작하되 schema/table ownership을 문서화합니다.
- 외부 write 권한은 gateway/auth/policy를 지나게 합니다.
- target cluster는 outbound 연결만 기본값으로 둡니다.
- production write는 기본 금지하고 sandbox namespace부터 허용합니다.
