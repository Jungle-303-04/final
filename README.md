# 서비스

Kubernetes 운영 자동화를 위한 이벤트 드리븐 마이크로서비스 구현입니다.

이 repository의 실행 기준은 `app/` 단일 FastAPI 앱이 아니라 `services/<service-name>`입니다. 처음부터 완전 분리 마이크로서비스로 만들며, Kubernetes Deployment/DaemonSet은 각 서비스 폴더의 entrypoint를 직접 실행해 서로 다른 서비스 인스턴스로 분리합니다.

단일 FastAPI 앱, role dispatcher, 서비스 간 직접 함수 호출로 회귀하지 않습니다. 한 서비스 pod가 죽어도 Kubernetes가 다시 생성하고, 다른 서비스는 event, DLQ, read model, queue/storage 계약을 기준으로 가능한 범위에서 계속 동작해야 합니다.

## 구조

```text
services
  api-gateway
  gitops-sync-worker
  command-worker
  rca-worker
  dashboard-projection-service
  audit-timeline-service
  target-cluster-agent
  node-collector
packages
  config                 env, runtime 기본값, 시간 helper
  contracts              gateway/event_bus/dashboard 계약과 Protocol port
    gateway              API Gateway 요청 schema
    event_bus            stream, subject, subscription, envelope, payload 계약
    dashboard            dashboard status 계약
  events                 event envelope, NATS JetStream, DLQ event sink
  storage                PostgreSQL 저장소와 schema 초기화
  runtime                FastAPI/worker/async service 실행 객체
deploy       management/target kind 클러스터 manifest
scripts      실행, 상태 확인, smoke, scale, pod 복구 script
secrets      SOPS/age 시크릿 템플릿
config/env   로컬 env 템플릿
tests        단위 테스트
```

## 처음 실행

```bash
make setup
make check
make up
make smoke
```

접속:

- Gateway health: <http://localhost:18080/healthz>
- Dashboard query: <http://localhost:18080/dashboard/query>

정리:

```bash
make down
```

## 서비스 역할

각 서비스는 독립 실행 프로세스와 Kubernetes workload를 가진다. 개발 편의를 위해 base layer를 공유할 수는 있지만, 실행 경계는 항상 `python services/<service-name>/runner.py`처럼 서비스별 entrypoint로 분리한다.

새 서비스 runner는 `packages/runtime/service.py`의 `FastApiService`, `WorkerService`, `AsyncService` 중 하나를 사용합니다. 서비스 폴더에서 `WorkerRuntime`, NATS client, PostgreSQL connection을 직접 조립하지 않습니다.
각 서비스가 직접 제어하는 설정은 `services/<service-name>/settings.py`에 둡니다. Worker 구독은 자기 서비스 `settings.py`의 `SUBSCRIPTION`에서 확인합니다. 여러 서비스가 공유하는 이벤트 subject, envelope, payload, stream 계약은 `packages/contracts/event_bus`에 둡니다.

```text
api-gateway                  관리 API Gateway
gitops-sync-worker           Git webhook -> manifest/diff/command
command-worker               command policy/dispatch/agent queue
rca-worker                   evidence -> RCA -> safe PR
dashboard-projection-service dashboard read model
audit-timeline-service       audit log
target-cluster-agent         대상 클러스터 outbound agent
fake-prometheus              fake metrics source
fake-loki                    fake logs source
fake-otel                    fake trace source
node-collector               선택형 DaemonSet collector
```

## 검증

```bash
make test
make status
make smoke
```

scale/recovery 확인:

```bash
make scale DEPLOYMENT=rca-worker REPLICAS=2
make kill-pod DEPLOYMENT=rca-worker
```

이 명령은 마이크로서비스 복구 기준 확인용이다. pod 삭제 뒤 Deployment가 다시 생성되어야 하며, retry/DLQ/read model이 남은 흐름을 복구할 수 있어야 한다.

## 문서

- [docs/architecture.md](docs/architecture.md)
- [docs/events.md](docs/events.md)
- [docs/operations-deployment.md](docs/operations-deployment.md)
- [docs/service-split-plan.md](docs/service-split-plan.md)
- [docs/secrets.md](docs/secrets.md)
- [docs/team-workflow.md](docs/team-workflow.md)
- [docs/team/conventions.md](docs/team/conventions.md)
- [docs/team/work-allocation.md](docs/team/work-allocation.md)
- [outputs/final-wbs-20260626/나만무_상세_WBS.xlsx](outputs/final-wbs-20260626/나만무_상세_WBS.xlsx)
