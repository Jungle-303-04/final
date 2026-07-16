# 서비스 구현 구조

이 문서는 현재 프로젝트 아키텍처를 실제 실행 가능한 코드 기준으로 설명한다.

로컬에서 바로 붙일 수 없는 외부 시스템은 교체 가능한 어댑터로 표현하지만, 실행 구조 자체는 실제 운영 구조를 따른다.

- 처음부터 완전 분리된 마이크로서비스로 구현한다.
- 단일 FastAPI 앱, role dispatcher, 모듈식 모놀리식 구조는 금지한다.
- 관리 영역과 대상 Kubernetes는 별도 Kubernetes cluster로 실행한다. 팀 통합 테스트 기준은 AWS EKS다.
- 관리 영역의 서비스들은 NATS JetStream을 통해 비동기로 통신한다.
- 저장소는 Kubernetes workload로 분리해 실행한다.
- 대상 클러스터 Agent는 관리 영역으로 outbound 연결만 맺는다.
- 외부 provider credential은 UI 상태가 아니라 credential_ref/Token Broker 경계로 관리한다.
- command API는 Gateway 내부 로그인(email/password)이 발급한 Redis session을 요구한다.
- dashboard query API와 dashboard projection worker는 현재 backend 계약을 기준으로 구현되어 있다. UI는 이 query API를 읽는다.

## 운영 배포 기준

운영 배포 기준은 [operations-deployment.md](operations-deployment.md)를 따른다.

현재 제품 구조는 그대로 유지한다. EKS 발표자료에서 흡수할 부분은 제품 내부 흐름이 아니라 배포 substrate, node type, 권한, 관측성 기준이다.

| 항목 | 기준 |
| --- | --- |
| 관리 클러스터 | EKS managed node group 중심으로 검토 |
| Fargate | stateless API/worker 일부만 후보 |
| node-collector | DaemonSet이므로 Fargate-only 배치 금지 |
| stateful store | 운영 후보는 RDS, ElastiCache, S3 같은 managed service |
| target 연결 | cluster-agent outbound 연결 유지 |
| 권한 | 내부 session, 외부 credential, AWS IAM/IRSA, Kubernetes ServiceAccount/RBAC를 분리 |
| 관측성 | CloudWatch, Prometheus, Loki, OTel을 provider adapter로 수용 |

## 서비스 배치

```text
services
  + api-gateway       HTTP 경계, 내부 로그인/session, dashboard API
  + gitops            Git 변경 -> workflow state -> manifest/diff/analyze/repo write split workers
  + command-worker               command policy -> target agent queue
  + target/reconcile-worker      target desired state -> reconcile result
  + ai split workers             evidence -> incident -> plan -> analyze -> RCA -> recovery -> dispatch
  + projection/audit-worker       변경 불가능한 audit timeline
  + projection/dashboard-worker   RCA/command/Safe PR event -> dashboard read model
  + alert-worker                  알림 provider boundary
  + mail-worker                   이메일 인증 발송/log boundary
  + target/cluster-agent             Target Cluster Agent와 telemetry adapter
  + target/node-collector                   선택형 DaemonSet node/runtime metrics source

packages
  + config                       env, 상수, 시간 helper
  + contracts                    gateway/event_bus/auth/store 계약과 Protocol port
    - gateway                    API Gateway 요청 Pydantic schema
    - event_bus                  stream, subject, subscription, envelope, body 계약
  + events                       event envelope, NATS JetStream, DLQ event sink
  + storage                      PostgreSQL 저장소와 schema 초기화
  + runtime                      FastAPI/worker/async service 실행 객체

deploy
  + management                   관리 클러스터 Kubernetes manifest
  + target                       대상 클러스터 Kubernetes manifest

scripts/*.sh                    AWS context 기준 운영/검증 스크립트
secrets                         SOPS/age 기반 secret 공유 템플릿
```

## 실행 단위

각 Kubernetes workload는 중앙 dispatcher에 role 문자열을 넘기지 않는다. Deployment/DaemonSet이 각 서비스 entrypoint를 직접 실행한다.

```text
api-gateway        -> python src/services/gateway/api-gateway/app.py
git-pull-worker               -> python src/services/gitops/git-pull-worker/app.py
workflow-controller           -> python src/services/gitops/workflow-controller/app.py
manifest-render-worker        -> python src/services/gitops/manifest-render-worker/app.py
diff-worker                   -> python src/services/gitops/diff-worker/app.py
diff-analyze-worker           -> python src/services/gitops/diff-analyze-worker/app.py
scm-worker           -> python src/services/gitops/scm-worker/app.py
command-worker                -> python src/services/command/command-worker/app.py
target-reconcile-worker       -> python src/services/target/reconcile-worker/app.py
evidence-worker               -> python src/services/ai/evidence-worker/app.py
incident-worker               -> python src/services/ai/incident-worker/app.py
plan-worker                   -> python src/services/ai/plan-worker/app.py
analyze-worker                -> python src/services/ai/analyze-worker/app.py
rca-worker                    -> python src/services/ai/rca-worker/app.py
recovery-worker               -> python src/services/ai/recovery-worker/app.py
select-worker                 -> python src/services/ai/select-worker/app.py
dispatch-worker               -> python src/services/ai/dispatch-worker/app.py
ai-diff-worker                -> python src/services/ai/diff-worker/app.py
backlog-worker                -> python src/services/ai/backlog-worker/app.py
rca-feedback-worker           -> python src/services/ai/rca-feedback-worker/app.py
audit-worker        -> python src/services/projection/audit-worker/app.py
dashboard-worker    -> python src/services/projection/dashboard-worker/app.py
alert-worker        -> python src/services/alert/alert-worker/app.py
mail-worker         -> python src/services/mail/mail-worker/app.py
cluster-agent          -> python src/services/target/cluster-agent/app.py
optional-node-collector       -> python src/services/target/node-collector/app.py
target-prometheus             -> deploy/target/prometheus.yaml
target-loki                   -> deploy/target/loki.yaml
target-otel-collector         -> deploy/target/opentelemetry.yaml
target-tempo                  -> deploy/target/tempo.yaml
```

서비스는 Kubernetes workload와 entrypoint 기준으로 분리한다. base image나 공통 Dockerfile을 임시로 공유하더라도 서비스별 `app.py` entrypoint, command, health, restart 경계는 합치지 않는다. 운영 부담과 배포 요구가 커지면 같은 entrypoint를 유지한 채 서비스별 Dockerfile/image로 나눈다.

## 복구와 장애 격리

각 서비스는 독립적으로 죽고 다시 떠야 한다. 특정 worker pod가 죽어도 Kubernetes Deployment가 다시 생성하고, NATS retry/DLQ, PostgreSQL read model, command queue를 통해 남은 흐름을 복구한다.

| 기준 | 설명 |
| --- | --- |
| health | HTTP 서비스는 `/healthz`, worker/agent는 `app.py` entrypoint 생존과 log/event 처리 상태로 확인한다. |
| restart | `scripts/kill-pod.sh <deployment>` 뒤 Deployment가 새 pod를 만든다. |
| retry | worker handler 실패는 `event_processing` retry 상태를 거쳐 DLQ로 이동한다. |
| isolation | 한 서비스 장애가 다른 서비스 process를 같이 죽이면 안 된다. |
| state | session, event, command, audit, read model은 외부 store에 둔다. |

## 포트와 어댑터

공통 인터페이스는 `src/packages/contracts` 하위 계약 폴더에 둔다. 서비스 코드는 가능한 한 PostgreSQL, NATS, `httpx` 같은 구현체가 아니라 아래 포트에 의존한다.

- `src/packages/contracts/event_bus`: stream, subject, worker subscription, envelope, body, event publish/consume 경계
- `EventPublisher`, `EventRecorder`, `EventConsumerBus`: NATS JetStream을 교체할 수 있는 경계
- `EventClient`: 서비스 코드가 사용하는 publish 경계
- `EventEnvelope`: workflow handler가 받는 이벤트 객체. transport/wire 필드는 소문자 `payload`이며, 서비스 코드는 `evt["payload"]` 대신 `evt.payload`처럼 속성 접근을 사용한다.
- `src/packages/contracts/event_bus/bodies/`: 서비스가 발행하는 event body dataclass 계약(base class `EventBody`). wire key 별칭이 필요하면 body class에서만 관리한다.
- `src/packages/contracts/gateway`: API Gateway HTTP 요청 schema
- `WorkflowStore`, `DashboardReadModel`, `AuditLogStore`: PostgreSQL 저장소 경계
- `OAuthAccountStore`, `SessionStore`: OAuth/token/session 저장 경계
- `ManagementPlaneClient`: Target Agent가 Management API와 통신하는 transport 경계
- `TargetReconcileStore`: target desired-state와 reconcile 결과 저장 경계
- `ActualStateReader`: 운영 구현에서 Kubernetes watch/cache 또는 agent 보고를 연결할 actual-state 조회 경계

현재 concrete adapter는 `src/packages/storage/database.py`의 `Database`, `src/packages/events/bus.py`의 `NatsEventBus`, `src/services/target/cluster-agent/agent.py`의 `HttpManagementPlaneClient`다.

한 서비스는 한 파일 `app.py`다. worker 서비스는 `src/packages/runtime/app.py`의 `App`을 사용한다.

```python
app = App("evidence-worker")

@app.on(ClusterEvidenceReceivedBody)  # 한 body 타입 구독
async def on_evidence(evt, ctx):
    yield EvidenceBuiltBody(...)        # 체이닝 = 다음 body를 yield

if __name__ == "__main__":
    app.run()
```

`App.run()`은 내부적으로 `src/packages/runtime/service.py`의 실행 객체와 `WorkerRuntime`을 조립한다. 즉 `WorkerService`/`WorkerRuntime`은 런타임 내부 구현이며 서비스 작성자는 직접 다루지 않는다. 실행 객체 종류:

- `FastApiService`: HTTP API process
- `WorkerService`: JetStream subject 구독 worker process(내부용)
- `AsyncService`: agent, collector처럼 직접 async loop를 가진 process

audit/dashboard 같은 cross-cutting projector는 `@app.on_any`로 모든 이벤트(`>`)를 구독하고,
본문 대신 전체 `EventEnvelope`를 받는다.

```python
@app.on_any
async def on_event(evt: EventEnvelope, ctx):
    ctx.db.append_audit_log(evt)
```

dashboard projector는 같은 패턴으로 `timeline_update_from_event(evt)`를 호출하고,
필요한 event만 `rca_timeline` read model에 upsert한다.

서비스 설정(상수)은 별도 `settings.py`가 아니라 `app.py` 안에 둔다. 더 이상 `WorkerSubscription` 모델을 선언하거나 `WorkerService.from_subscription(...)`을 직접 호출하지 않는다. 팀원이 자기 담당 서비스를 수정할 때는 해당 `app.py`를 확인한다. 구독 subject는 각 worker `app.py`의 `@app.on(...)`에서 확인한다. 여러 서비스가 공유하는 event subject, body, stream 계약은 `src/packages/contracts/event_bus`에 둔다.

이벤트 작성, 구독, retry, DLQ, replay 기준은 `docs/events.md`를 따른다.

## 최소 실행 서비스

관리 클러스터:

- `api-gateway`
- `git-pull-worker`
- `workflow-controller`
- `manifest-render-worker`
- `diff-worker`
- `diff-analyze-worker`
- `scm-worker`
- `command-worker`
- `target-reconcile-worker`
- `evidence-worker`
- `incident-worker`
- `plan-worker`
- `analyze-worker`
- `rca-worker`
- `recovery-worker`
- `select-worker`
- `dispatch-worker`
- `audit-worker`
- `dashboard-worker`
- `alert-worker`
- `mail-worker`
- `nats`
- `postgresql`
- `redis`
- `minio`

대상 클러스터:

- `cluster-agent`
- `node-collector`: `optional-node-collector` DaemonSet으로 실행
- Kubernetes `ServiceAccount/RBAC`

## 이벤트 흐름

```text
GitHub webhook
-> API Gateway
-> NATS git.webhook.received
-> Workflow Controller가 Application/WorkflowRun 시작
-> GitOps split workers
-> NATS workflow.step.recorded / approval.requested 또는 approval.granted
-> NATS command.requested
-> Command Worker
-> Target Agent용 command queue 저장
-> Workflow Controller가 apply 단계와 command_id 연결
-> Target Cluster Agent가 polling 후 command 완료
-> NATS command.completed
-> NATS workflow.run.completed 또는 workflow.run.failed

Target Cluster Agent
-> API Gateway /agent/evidence
-> NATS cluster.evidence.received
-> evidence-worker: evidence.built
-> incident-worker: incident.detected / evidence.bundle.built
-> plan-worker: rca.candidates.planned
-> analyze-worker: rca.candidates.evaluated
-> rca-worker: rca.completed 또는 rca.action_required
-> recovery-worker: recovery.planned
-> select-worker: recovery.action_selected 또는 recovery.selection_requested
-> dispatch-worker: command.requested 또는 safe_pr.requested
-> safe-pr-worker: safe_pr.patch_prepared
-> ai-diff-worker: diff.explained / safe_pr.ready_for_creation
-> scm-worker: safe_pr.created 또는 safe_pr.failed

Target 등록 / desired-state
-> API Gateway /targets
-> target_desired_states 저장
-> NATS cluster.desired_state.changed
-> Target Reconcile Worker
-> cluster.reconcile.requested
-> cluster.reconcile.completed

모든 event
-> Audit Worker
-> audit log

RCA/command/Safe PR event
-> Dashboard Worker
-> rca_timeline read model
-> Gateway /dashboard/rca/timeline, /dashboard/rca/incidents/{incident_id}
```

실패한 event 처리:

```text
src/packages/runtime/worker.py
-> event_processing retrying
-> NATS nak
-> max attempts 초과
-> event_dead_letters
-> dead_letter.created
-> Gateway /dead-letters replay
```

## 내부 로그인 흐름

```text
UI
-> /auth/signup
-> mail.email_verification.requested
-> /auth/verify-email
-> /auth/login
-> Gateway가 session을 Redis에 저장
-> Gateway가 httpOnly session cookie 발급
```

현재 구현은 OAuth를 로그인으로 사용하지 않는다. 실제 Google/GitHub 같은 외부 연결은 integration target/credential_ref/Token Broker 흐름으로 별도 추가한다. UI 호출은 httpOnly session cookie로 인증한다.

## 실행

```bash
bash scripts/up.sh
bash scripts/smoke.sh
```

접속:

- Gateway health: <http://localhost:18080/healthz>
- Session check: <http://localhost:18080/auth/session>

관리 worker scale:

```bash
bash scripts/scale.sh rca-worker 3
```

pod 삭제 후 Kubernetes 복구 확인:

```bash
bash scripts/kill-pod.sh rca-worker
```

정리:

```bash
bash scripts/down.sh
```

## 시크릿 공유

`.env` 파일은 공유하지 않는다. 실제 provider credential은 SOPS/age를 사용하고, `secrets/*.enc.yaml` 아래에는 암호화된 파일만 commit한다.
