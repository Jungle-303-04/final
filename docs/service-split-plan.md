# 서비스 분리 계획

현재 코드는 하나의 monorepo에서 시작하지만, 실행 단위는 `src/services/<service-name>` 마이크로서비스 인스턴스로 완전히 분리한다.
Kubernetes에서는 중앙 role dispatcher를 사용하지 않고 각 Deployment/DaemonSet이 서비스 entrypoint를 직접 실행한다.

단일 FastAPI 앱 안의 모듈식 모놀리식은 금지한다. 서비스가 죽으면 Kubernetes가 다시 생성하고, 남은 흐름은 event retry, DLQ, queue/storage 계약으로 복구되어야 한다.

## 현재 폴더 매핑

```text
src/services/gateway/api-gateway
  API Gateway
  OAuth/session
  command/dashboard/agent HTTP 경계
  app.py: route limit, session, polling, error policy

src/services/gitops/git-pull-worker
  Git target polling / Git changed event
  app.py: repo polling 기본값, @app.on(GitWebhookReceivedBody)

src/services/gitops/workflow-controller
  Application / WorkflowRun / Approval 상태 관리
  app.py: GitOps, approval, command lifecycle 이벤트를 관찰해 workflow.* / approval.* projection 발행

src/services/gitops/manifest-render-worker
  Manifest render
  app.py: manifest render 기본값, @app.on(GitChangedBody)

src/services/gitops/diff-worker
  Desired state diff
  app.py: diff 정책, @app.on(ManifestRenderedBody)

src/services/gitops/diff-analyze-worker
  Diff analysis / Safe PR request decision
  app.py: analysis 기본값, @app.on(DiffDetectedBody)

src/services/gitops/scm-worker
  유일한 outbound GitHub PR 생성자 (safe_pr.requested -> safe_pr.created/failed)
  app.py: repo write feature flag, @app.on(SafePrRequestedBody)

src/services/command/command-worker
  Command / Control
  app.py: command policy, queue status, @app.on(CommandRequestedBody)

src/services/ai/evidence-worker
  Raw evidence 정규화
  app.py: @app.on(ClusterEvidenceReceivedBody) -> EvidenceBuiltBody

src/services/ai/incident-worker
  Evidence에서 incident/evidence bundle 생성
  app.py: @app.on(EvidenceBuiltBody) -> IncidentDetectedBody / EvidenceBundleBuiltBody

src/services/ai/plan-worker
  Symptom 기준 RCA 후보 생성
  app.py: @app.on(EvidenceBundleBuiltBody) -> RcaCandidatesPlannedBody

src/services/ai/analyze-worker
  후보별 evidence check와 score 계산
  app.py: @app.on(RcaCandidatesPlannedBody) -> RcaCandidatesEvaluatedBody

src/services/ai/rca-worker
  후보 평가 결과에서 최종 root cause/action 판단
  app.py: @app.on(RcaCandidatesEvaluatedBody) -> RcaCompletedBody / RcaActionRequiredBody

src/services/ai/recovery-worker
  RCA 결과에서 복구 후보 계획 생성
  app.py: @app.on(RcaCompletedBody) -> RecoveryPlannedBody

src/services/ai/select-worker
  복구 후보 자동 선택 또는 사람 선택 요청
  app.py: @app.on(RecoveryPlannedBody) -> RecoveryActionSelectedBody / RecoverySelectionRequestedBody

src/services/ai/dispatch-worker
  선택된 복구 후보를 command 또는 Safe PR 요청으로 라우팅
  app.py: @app.on(RecoveryActionSelectedBody) -> CommandRequestedBody / SafePrRequestedBody

src/services/ai/safe-pr-worker
  Safe PR patch 초안 준비
  app.py: @app.on(SafePrRequestedBody) -> SafePrPatchPreparedBody

src/services/ai/backlog-worker
  RCA rule 보강 backlog 처리
  app.py: @app.on(RcaBacklogItemCreatedBody)

src/services/ai/rca-fallback-worker
  rule 미매칭 RCA fallback 요청 처리
  app.py: @app.on(RcaAiFallbackRequestedBody)

src/services/projection/audit-worker
  Audit Timeline
  app.py: @app.on_any (모든 이벤트 >)

src/services/projection/dashboard-worker
  dashboard read model/UI를 시작할 때 App 기반 @app.on_any 서비스로 추가한다.

src/services/target/cluster-agent
  Target Cluster Agent
  telemetry adapter
  command receiver
  app.py: agent 연결, policy sync, evidence job scheduler, provider adapter, command polling

src/services/target/node-collector
  선택형 DaemonSet collector
  node/runtime metrics endpoint
  Loki 스타일 collector를 위한 stdout log sample
  app.py: node sample, scrape port, collect interval

src/packages/config
  env, 상수, 시간 helper

src/packages/contracts
  gateway/event_bus 계약
  Protocol port

src/packages/contracts/gateway
  API Gateway 요청 schema

src/packages/contracts/event_bus
  stream subject
  worker subscription
  publish/consume port

dashboard projection/read model
  공유 계약이 필요해지는 시점에 src/packages/contracts 아래에 계약과 테스트를 함께 추가

src/packages/events
  NATS JetStream adapter
  event envelope
  recorded publish / DLQ event sink

src/packages/storage
  PostgreSQL access
  schema 초기화
  event_processing / dead letter / 업무 저장소

src/packages/runtime
  App (worker 서비스 진입점) / FastApiService / WorkerService(내부) / AsyncService 실행 객체
  outbound.py: deliver(call, ok, fail) outbound gateway helper
  worker retry / event_processing / DLQ 정책

deploy
  management cluster manifest
  target cluster manifest

secrets
  SOPS/age template
  provider token 공유 정책
```

## 현재 실행 매핑

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
safe-pr-worker                -> python src/services/ai/safe-pr-worker/app.py
backlog-worker                -> python src/services/ai/backlog-worker/app.py
rca-fallback-worker           -> python src/services/ai/rca-fallback-worker/app.py
audit-worker        -> python src/services/projection/audit-worker/app.py
alert-worker        -> python src/services/alert/alert-worker/app.py
mail-worker         -> python src/services/mail/mail-worker/app.py
cluster-agent          -> python src/services/target/cluster-agent/app.py
optional-node-collector       -> python src/services/target/node-collector/app.py
target-prometheus             -> deploy/target/prometheus.yaml
target-loki                   -> deploy/target/loki.yaml
target-otel-collector         -> deploy/target/opentelemetry.yaml
target-tempo                  -> deploy/target/tempo.yaml
```

## 추가 분리 순서

1. `src/services/gateway/api-gateway` 내부 route를 `auth`, `agent`, `commands`, `dashboard`, `github`으로 나눈다.
2. `workflow-controller`가 만든 `applications`, `workflow_runs`, `workflow_run_steps`, `approvals`를 Gateway query API와 콘솔 UI의 1급 객체로 노출한다.
3. 각 service의 DB query를 repository 객체로 분리한다.
4. dashboard 트래픽이 커지면 `Dashboard Query API`와 `Realtime Gateway`를 별도 service folder로 분리한다.
5. 실제 GitHub PR 생성은 먼저 `src/services/gitops/scm-worker`의 guarded adapter로 두고, 책임이 커지면 별도 Safe PR service로 분리한다.
6. 실제 Prometheus/Loki/OTel 연동이 들어가면 `src/services/target/cluster-agent` adapter를 provider별 파일로 분리하고, node-level 수집은 `src/services/target/node-collector`에서 확장한다.
7. 배포 운영이 무거워지면 현재 entrypoint를 유지한 채 공통 base layer 위에서 서비스별 image로 나눈다.

## 규칙

- 먼저 service/process 경계를 유지하고, 파일은 책임별로 나눈다.
- 서비스 workflow는 `src/packages/contracts` 포트에 의존하고 concrete adapter는 runtime/composition 경계에서 주입한다.
- worker 서비스는 한 파일 `app.py`에서 `src/packages/runtime/app.py`의 `App`을 사용한다. `App.run()`이 내부적으로 `FastApiService`/`WorkerService`/`AsyncService`를 조립한다.
- 서비스별 설정(상수)은 별도 `settings.py`가 아니라 `src/services/<service-name>/app.py` 안에 둔다.
- worker 구독은 각 worker `app.py`의 `@app.on(BodyType)`(cross-cutting projector는 `@app.on_any`)으로 선언한다.
- event subject, body, stream, subscription 타입은 `src/packages/contracts/event_bus`에서 관리한다.
- 여러 서비스가 공유하는 runtime/env 기본값만 `src/packages/config`로 승격한다.
- 이벤트 작성과 DLQ 운영 기준은 `docs/events.md`를 source of truth로 둔다.
- DB schema는 공유 PostgreSQL에서 시작하되 schema/table ownership을 문서화한다.
- 외부 write 권한은 gateway/auth/policy를 지나게 한다.
- target cluster는 outbound 연결을 기본값으로 둔다.
- production write는 기본 금지하고 `sandbox` namespace부터 허용한다.
- 새 서비스는 `app.py` entrypoint, Deployment/DaemonSet, health/restart 검증, 소유 WBS/이슈를 함께 추가한다.
- PR에서 서비스 경계를 합치거나 role dispatcher로 회귀하면 merge하지 않는다.
- 운영 배포 기준은 `docs/operations-deployment.md`와 `deploy/eks/README.md`를 따른다.
- Fargate 전제 workload와 managed node group 전제 workload를 섞어서 설명하지 않는다.
