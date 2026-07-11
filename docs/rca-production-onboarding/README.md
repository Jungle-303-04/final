# RCA 프로덕션 온보딩 지도

이 문서는 팀원이 내게 다시 묻지 않고도 현재 코드 기준으로 흐름을 따라가며 구현하고 테스트할 수 있게 만든 온보딩 지도다.

기준은 아이디어가 아니라 지금 repository에서 실제로 돌아가는 코드다.
문서에 적은 route, event, handler, provider, table, test는 먼저 코드에서 확인한다.
대시보드는 현재 `dashboard-worker`, `RcaTimeline` read model, Gateway query API까지 구현되어 있고, frontend는 이 API를 기준으로 붙이면 된다.

프로덕션 완료의 최소 범위는 외부 기준 저장소에서 확인한 기능 도메인 전체다.
즉 account/RBAC/OIDC, fleet cluster, GitOps, IaC, upgrade/rollout/test, incident/AI/Safe PR, notification, DNS, shell, marketplace, billing/license, realtime 기능을 우리 구조에서 담당자/스키마/API/event/test로 설명하지 못하면 완료가 아니다.
전체 기준은 [벤치마크 최소선 기준 프로덕션 완성 설계](05-production-completion-scope.md)를 따른다.

## 1단계. 현재 실제 흐름을 먼저 본다

[현재 실제 흐름](00-current-runtime-flow.md)을 연다.

여기서 한 가지만 잡는다.

```text
command
  -> target evidence
  -> RCA
  -> recovery
  -> command 또는 Safe PR
  -> dashboard
```

내가 맡은 역할이 이 흐름의 어느 부분인지 표시한다.

## 2단계. 자기 역할 문서를 연다

민정은 [민정: Command + Target + Evidence](01-minjeong-command-target-evidence.md)를 본다.
target agent, command poll, evidence provider job을 구현하고 검증하는 순서다.

가인은 [가인: Evidence + RCA + Safe PR](02-gain-evidence-rca-safe-pr.md)를 본다.
evidence를 incident, 후보, 원인, 복구 후보, PR 요청으로 바꾸는 순서다.

찬빈은 [찬빈: Frontend + Projection](03-chanbin-frontend-projection.md)를 본다.
backend 계약을 기준으로 read model, API, UI를 붙이는 순서다.

## 3단계. 데이터 스키마를 확인한다

[RCA 데이터 스키마](04-rca-data-schema.md)를 연다.

이 문서는 Google Sheet에 넣은 스키마와 같은 기준이다.
필드 단위로 왜 필요한지 적었다.

schema를 볼 때는 “어떤 값이 필요한가”보다 “왜 필요한가”를 먼저 본다.
필드 이유를 설명할 수 없으면 event나 dashboard에 넣지 않는다.

## 4단계. 프로덕션 완료 범위를 확인한다

[벤치마크 최소선 기준 프로덕션 완성 설계](05-production-completion-scope.md)를 연다.

이 문서는 production scope의 최저선을 정한다.
작업을 줄이기 위한 문서가 아니라 빠진 기능을 놓치지 않기 위한 문서다.

역할별로 내가 맡은 기능 도메인을 표시하고, 한 번에 하나씩 작업으로 쪼갠다.

## 5단계. 찬빈은 권한 문서를 같이 본다

찬빈은 [찬빈: 권한 시스템과 대시보드 적용](06-chanbin-permission-dashboard.md)을 같이 본다.

dashboard는 단순 조회 화면이 아니다.
workspace, organization, group, resource role 기준으로 row가 필터링되어야 한다.

frontend에서 숨기는 것은 UX일 뿐이다.
최종 필터는 backend router와 repository가 한다.

## 6단계. 막히면 찾는 순서를 따른다

구현 위치를 모르겠으면 [찾아보고 구현하는 방법](07-how-to-find-and-implement.md)을 연다.

찾는 순서는 항상 같다.

1. route를 찾는다.
2. request/response DTO를 찾는다.
3. event subject를 찾는다.
4. event body를 찾는다.
5. worker decorator를 찾는다.
6. repository나 provider를 찾는다.
7. 테스트를 찾는다.
8. Bruno 요청을 찾는다.

## 7단계. RCA rule catalog를 추가할 때 본다

RCA rule을 추가할 때는 [RCA Rule Catalog Guide](09-rca-rule-catalog-guide.md)를 연다.

스프레드시트의 증상/후보 자료는 설계 기준이고, 실제 plan-worker가 읽는 실행 계약은
`src/services/ai/agent/causes/catalog/*.yaml`이다.
새 rule은 `symptoms`, `required_sources`, `candidates`, `expected_evidence`, `checks`, `signals`
구조를 맞춰 추가한다.

## 역할 경계

민정은 command, target agent, evidence provider, evidence job을 맡는다.
끝에서 넘기는 값은 `command.completed`와 `cluster.evidence.received`다.
가인은 이 값을 `Evidence`, `IncidentRecord`, `EvidenceBundle`로 정규화한다.

가인은 evidence 정규화, RCA rule, recovery, Safe PR 요청을 맡는다.
끝에서 넘기는 값은 `rca.completed`, `recovery.action_selected`, `command.requested`, `safe_pr.requested`다.
찬빈은 이 값을 timeline과 read model에서 상태로 보여준다.

찬빈은 frontend, dashboard/read model, realtime 표시를 맡는다.
끝에서 만드는 것은 query response DTO, 화면 상태, user action payload다.
민정과 가인이 만든 event와 command/PR 상태를 사람이 볼 수 있게 만든다.

## 현재 실제로 동작하는 큰 흐름

```text
Target Agent
  -> evidence job schedule/poll/result
  -> cluster.evidence.received
  -> evidence-worker
  -> incident-worker
  -> plan-worker
  -> analyze-worker
  -> rca-worker
  -> recovery-worker
  -> select-worker
  -> dispatch-worker
  -> command.requested 또는 safe_pr.requested
  -> command-worker 또는 scm-worker
  -> dashboard-worker
  -> /dashboard/rca/timeline 조회 API
```

## 데코레이터는 이렇게 읽는다

`@event(EventSubject.X)`는 event subject와 body class를 연결한다.
이 데코레이터가 있어야 문서, 테스트, runtime이 같은 event 계약을 본다.

`@app.on(BodyType)`은 worker가 어떤 event body를 소비하는지 선언한다.
handler가 `yield`한 body는 runtime을 통해 다음 event로 이어진다.

`@app.on_any`는 모든 event envelope를 받는 projector에서 쓴다.
audit worker나 dashboard worker처럼 전체 흐름을 read model로 만들 때 필요하다.

`@telemetry.source(...)`는 target agent provider class에 붙인다.
provider source, evidence bucket, query value object를 한 곳에서 연결한다.

`@command.handler(...)`는 target agent가 실행할 command action과 처리 함수를 연결한다.

`@command.k8s(...)`는 Kubernetes write command에서 action, resource, verb, payload model, policy 검증을 묶는다.

RCA cause YAML catalog는 symptom, 필요한 evidence source, 원인 후보를 등록한다.

`@rca.recovery(...)`는 root cause별 복구 후보와 route를 등록한다.

## 대시보드 현재 구현

read model table은 `src/domains/dashboard/models.py`의 `RcaTimeline`이다.

projection repository는 `src/domains/dashboard/repository.py`의 `DashboardRepository`다.

projection worker는 `src/services/projection/dashboard-worker/app.py`다.

query router는 `src/domains/dashboard/router.py`다.

response DTO는 `src/packages/contracts/gateway/responses.py`의 `RcaTimelineItem`, `RcaTimelineResponse`, `RcaIncidentResponse`다.

검증 테스트는 `tests/test_dashboard_projection.py`와 `tests/test_dashboard_router.py`다.

## 반드시 지킬 기준

문서에 쓴 route는 `src/packages/contracts/gateway/routes.py`에 있어야 한다.

문서에 쓴 request/response DTO는 `src/packages/contracts/gateway/requests.py`, `responses.py`에 있어야 한다.

문서에 쓴 event subject는 `src/packages/contracts/event_bus/subjects.py`에 있어야 한다.

문서에 쓴 event body는 `src/domains/*/events.py`에 있어야 한다.

문서에 쓴 worker는 실제 `@app.on(...)` 또는 `@app.on_any`를 가져야 한다.

문서에 쓴 provider는 실제 `@telemetry.source(...)`를 가져야 한다.

문서에 쓴 command action은 action catalog와 target agent handler가 연결되어야 한다.

문서에 쓴 테스트는 실제 `tests/` 아래에 있어야 한다.

## 바로 돌릴 전체 검증

처음 온보딩할 때는 전체 테스트를 다 보기보다 흐름별로 나눠 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  tests/test_target_evidence_jobs.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_telemetry_registry.py \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_repo_gateway_worker.py \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  -q
```

이 명령이 통과하면 지금 문서에서 설명하는 command, target evidence, RCA, Safe PR, audit/realtime 계약의 기본 흐름은 살아 있다고 보면 된다.

서비스를 실제로 띄워 확인할 때는 AWS EKS smoke를 본다.

```bash
make smoke
```

이 명령은 현재 환경변수로 배포된 서비스와 내부 workflow를 직접 검증한다.
통과 기준과 AWS 변수는 [AWS 테스트 실행 기준](../aws-testing-runbook.md)을 본다.
