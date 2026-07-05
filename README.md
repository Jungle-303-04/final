# 서비스

Kubernetes 운영 자동화를 위한 이벤트 드리븐 마이크로서비스 구현입니다.

이 repository의 실행 기준은 `app/` 단일 FastAPI 앱이 아니라 `src/services/<service-name>`입니다. 처음부터 완전 분리 마이크로서비스로 만들며, Kubernetes Deployment/DaemonSet은 각 서비스 폴더의 entrypoint를 직접 실행해 서로 다른 서비스 인스턴스로 분리합니다.

단일 FastAPI 앱, role dispatcher, 서비스 간 직접 함수 호출로 회귀하지 않습니다. 한 서비스 pod가 죽어도 Kubernetes가 다시 생성하고, 다른 서비스는 event, DLQ, read model, queue/storage 계약을 기준으로 가능한 범위에서 계속 동작해야 합니다.

## 구조

```text
src/services
  api-gateway
  alert-worker
  gitops/git-pull-worker
  gitops/github-poll-worker
  gitops/workflow-controller
  gitops/manifest-render-worker
  gitops/diff-worker
  gitops/diff-analyze-worker
  gitops/scm-worker
  command-worker
  rca-worker
  projection/audit-worker
  target/cluster-agent
  target/node-collector
src/domains
  identity, gitops, command, rca, scm, audit, alert, target
src/packages
  config                 env, runtime 기본값, 시간 helper
  contracts              gateway/event_bus/auth/store 계약과 Protocol port
    gateway              API Gateway 요청 schema
    event_bus            stream, subject, subscription, envelope, body 계약
  events                 event envelope, NATS JetStream, DLQ event sink
  storage                PostgreSQL 저장소와 schema 초기화
  runtime                FastAPI/worker/async service 실행 객체
deploy       management/target Kubernetes manifest
docs/api     Bruno API 수동 테스트 collection
scripts      검증, AWS 배포, 상태 확인, smoke, scale, pod 복구 script
secrets      SOPS/age 시크릿 템플릿
config/env   로컬 env 템플릿
tests        단위 테스트
```

## 처음 실행

```bash
make setup
bash scripts/test.sh
make manifest-check
make aws-smoke
```

로컬에서는 코드/manifest 검증까지만 하고, 실제 서비스 smoke는 AWS EKS에서 확인한다.
자세한 기준은 [docs/aws-testing-runbook.md](docs/aws-testing-runbook.md)를 본다.
API를 사람이 직접 눌러 확인할 때는 [docs/api/README.md](docs/api/README.md)를 열고 Bruno collection을 사용한다.

## 서비스 역할

각 서비스는 독립 실행 프로세스와 Kubernetes workload를 가진다. 개발 편의를 위해 base layer를 공유할 수는 있지만, 실행 경계는 항상 `python src/services/<service-name>/app.py`처럼 서비스별 entrypoint로 분리한다.

한 서비스는 한 파일 `app.py`입니다. worker 서비스는 `src/packages/runtime/app.py`의 `App`을 사용합니다. `@app.on(BodyType)`으로 한 body 타입을 구독하고, 다음 이벤트는 `yield`로 흘려보냅니다(체이닝). audit 같은 cross-cutting projector는 `@app.on_any`로 모든 이벤트(`>`)를 구독하고 전체 `EventEnvelope`를 받습니다. `App.run()`이 내부적으로 `WorkerService`/`WorkerRuntime`, NATS client, PostgreSQL connection을 조립하므로 서비스 폴더에서 직접 조립하지 않습니다.
서비스 설정(상수)은 별도 `settings.py`가 아니라 `app.py` 안에 둡니다. 여러 서비스가 공유하는 이벤트 subject, envelope, body, stream 계약은 `src/packages/contracts/event_bus`에 둡니다.

```text
api-gateway                  관리 API Gateway
git-pull-worker              Git webhook/polling -> git.changed
workflow-controller          GitOps/approval/command 이벤트 -> workflow_runs/approvals
manifest-render-worker       git.changed -> manifest.rendered
diff-worker                  manifest.rendered -> desired.diff.detected
diff-analyze-worker          desired.diff.detected -> diff.analyzed (안전 시 safe_pr.requested)
scm-worker                   safe_pr.requested -> safe_pr.created/safe_pr.failed (유일한 PR 생성자)
command-worker               command policy/dispatch/agent queue
rca-worker                   evidence -> RCA -> safe_pr.requested
audit-worker                 audit log
alert-worker                 alarm/notification event boundary
cluster-agent                대상 클러스터 outbound agent, command receiver, evidence job scheduler
node-collector               선택형 DaemonSet collector
```

## 검증

```bash
make test
make manifest-check
make aws-smoke
```

scale/recovery 확인:

```bash
make scale DEPLOYMENT=rca-worker REPLICAS=2
make kill-pod DEPLOYMENT=rca-worker
```

이 명령은 마이크로서비스 복구 기준 확인용이다. pod 삭제 뒤 Deployment가 다시 생성되어야 하며, retry/DLQ/read model이 남은 흐름을 복구할 수 있어야 한다.

## 문서

- [docs/onboarding/README.md](docs/onboarding/README.md)
- [docs/onboarding/minjeong-command-target-evidence.md](docs/onboarding/minjeong-command-target-evidence.md)
- [docs/onboarding/gain-evidence-rca.md](docs/onboarding/gain-evidence-rca.md)
- [docs/onboarding/chanbin-frontend.md](docs/onboarding/chanbin-frontend.md)
- [docs/README.md](docs/README.md)
- [docs/team/role-practice-guide.md](docs/team/role-practice-guide.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/events.md](docs/events.md)
- [docs/team/member-guides/target-agent-command-evidence-flow.md](docs/team/member-guides/target-agent-command-evidence-flow.md)
- [docs/operations-deployment.md](docs/operations-deployment.md)
- [docs/aws-testing-runbook.md](docs/aws-testing-runbook.md)
- [docs/api/README.md](docs/api/README.md)
- [docs/secrets.md](docs/secrets.md)
- [docs/team/conventions.md](docs/team/conventions.md)
