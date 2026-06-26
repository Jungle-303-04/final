# 서비스

Kubernetes 운영 자동화를 위한 이벤트 드리븐 마이크로서비스 구현입니다.

이 repository의 실행 기준은 `app/` 단일 FastAPI 앱이 아니라 `services/<service-name>`입니다. 하나의 monorepo에서 시작하지만 Kubernetes Deployment/DaemonSet은 각 서비스 폴더의 entrypoint를 직접 실행해 서로 다른 서비스 인스턴스로 분리합니다.

## 구조

```text
services
  management-api-gateway
  gitops-sync-worker
  command-worker
  rca-worker
  dashboard-projection-service
  audit-timeline-service
  target-cluster-agent
  node-collector
packages
  shared                 DB, NATS, schema, service bootstrap
  worker_runtime         JetStream worker runtime
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

각 서비스는 같은 base image를 공유할 수 있지만 실행 프로세스는 분리합니다. Kubernetes workload는 role 문자열을 넘기지 않고 `python services/<service-name>/runner.py`처럼 각 서비스 entrypoint를 직접 실행합니다.

```text
management-api-gateway        관리 API Gateway
gitops-sync-worker            Git webhook -> manifest/diff/command
command-worker                command policy/dispatch/agent queue
rca-worker                    evidence -> RCA -> safe PR
dashboard-projection-service  dashboard read model
audit-timeline-service        audit log
target-cluster-agent          대상 클러스터 outbound agent
fake-prometheus               fake metrics source
fake-loki                     fake logs source
fake-otel                     fake trace source
node-collector                선택형 DaemonSet collector
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

## 문서

- [docs/architecture.md](docs/architecture.md)
- [docs/events.md](docs/events.md)
- [docs/service-split-plan.md](docs/service-split-plan.md)
- [docs/secrets.md](docs/secrets.md)
- [docs/team-workflow.md](docs/team-workflow.md)
- [docs/team/conventions.md](docs/team/conventions.md)
- [docs/team/work-allocation.md](docs/team/work-allocation.md)
- [outputs/final-wbs-20260626/나만무_상세_WBS.xlsx](outputs/final-wbs-20260626/나만무_상세_WBS.xlsx)
