# RCA 프로덕션 온보딩 지도

이 문서는 팀원이 내게 다시 묻지 않고도 현재 코드 기준으로 흐름을 따라가며 구현하고 테스트할 수 있게 만든 온보딩 지도다.

기준은 아이디어가 아니라 지금 repository에서 실제로 돌아가는 코드다. 문서에 적은 route, event, handler, provider, table, test는 먼저 코드에서 확인했다. 대시보드는 현재 `dashboard-worker`, `RcaTimeline` read model, Gateway query API까지 구현되어 있고, frontend는 이 API를 기준으로 붙이면 된다.

## 읽는 순서

| 순서 | 문서 | 왜 먼저 보는가 |
| --- | --- | --- |
| 1 | [현재 실제 흐름](00-current-runtime-flow.md) | command, evidence, RCA, Safe PR이 실제 코드에서 어떻게 이어지는지 먼저 잡는다. |
| 2 | [민정: Command + Target + Evidence](01-minjeong-command-target-evidence.md) | target agent, command poll, evidence provider job을 구현하고 검증하는 순서다. |
| 3 | [가인: Evidence + RCA + Safe PR](02-gain-evidence-rca-safe-pr.md) | evidence를 incident, 후보, 원인, 복구 후보, PR 요청으로 바꾸는 순서다. |
| 4 | [찬빈: Frontend + Projection](03-chanbin-frontend-projection.md) | 지금 있는 backend 계약을 기준으로 read model, API, UI를 붙이는 순서다. |
| 5 | [RCA 데이터 스키마](04-rca-data-schema.md) | Google Sheet에 넣은 스키마와 같은 기준이다. 필드 단위로 왜 필요한지 적었다. |
| 6 | [Plural 비교와 프로덕션 보강 항목](05-plural-production-comparison.md) | Plural 코드를 보고 우리 프로젝트에 필요한 운영 객체를 비교한 결과다. |
| 7 | [찬빈: 권한 시스템과 대시보드 적용](06-chanbin-permission-dashboard.md) | frontend/dashboard가 실제 권한 시스템을 어떻게 써야 하는지 정리했다. |

## 역할 경계

| 팀원 | 담당 | 끝에서 넘기는 값 | 다음 사람이 받는 값 |
| --- | --- | --- | --- |
| 민정 | command, target agent, evidence provider, evidence job | `command.completed`, `cluster.evidence.received` | 가인이 `Evidence`, `IncidentRecord`, `EvidenceBundle`로 정규화한다. |
| 가인 | evidence 정규화, RCA rule, recovery, Safe PR 요청 | `rca.completed`, `recovery.action_selected`, `command.requested`, `safe_pr.requested` | 찬빈이 timeline/read model에서 상태를 보여준다. |
| 찬빈 | frontend, dashboard/read model, realtime 표시 | query response DTO, 화면 상태, user action payload | 민정/가인이 만든 event와 command/PR 상태를 사람이 볼 수 있게 만든다. |

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

## 데코레이터는 이렇게 이해하면 된다

| 데코레이터 | 쓰는 곳 | 왜 필요한가 |
| --- | --- | --- |
| `@event(EventSubject.X)` | `src/domains/*/events.py` | event subject와 body class를 한 번에 등록한다. 문서, 테스트, runtime이 같은 계약을 보게 만든다. |
| `@app.on(BodyType)` | `src/services/**/app.py` | worker가 어떤 event body를 소비하는지 선언한다. handler가 `yield`한 body는 다음 event로 이어진다. |
| `@app.on_any` | `audit-worker` 같은 projector | 모든 event envelope를 받아 timeline/read model로 투영할 때 쓴다. |
| `@telemetry.source(...)` | target agent provider class | provider source, evidence bucket, query value object를 한 곳에서 연결한다. |
| `@command.handler(...)` | target agent command handler | agent가 실행할 command action과 처리 함수를 연결한다. |
| `@command.k8s(...)` | target agent Kubernetes write command | action, Kubernetes resource, verb, payload model, policy 검증을 함께 묶는다. |
| `@rca.cause(...)` | RCA cause profile | symptom, 필요한 evidence source, 원인 후보를 rule catalog에 등록한다. |
| `@rca.recovery(...)` | recovery action profile | root cause별 복구 후보와 route를 등록한다. |

## 대시보드 현재 구현

| 구분 | 파일 | 왜 중요한가 |
| --- | --- | --- |
| read model table | `src/domains/dashboard/models.py` | `workspace_id + correlation_id` 기준으로 RCA 흐름을 한 row로 묶는다. |
| projection repository | `src/domains/dashboard/repository.py` | event subject를 dashboard status로 바꾸고 upsert/query를 책임진다. |
| projection worker | `src/services/projection/dashboard-worker/app.py` | `@app.on_any`로 RCA/command/PR event를 읽는다. |
| query router | `src/domains/dashboard/router.py` | session과 cluster read 권한을 적용한다. |
| response DTO | `src/packages/contracts/gateway/responses.py` | `RcaTimelineItem`, `RcaTimelineResponse`, `RcaIncidentResponse`가 frontend 계약이다. |
| tests | `tests/test_dashboard_projection.py`, `tests/test_dashboard_router.py` | event mapping, upsert, 권한 필터를 검증한다. |

## 반드시 지킬 기준

- 문서에 쓴 route는 `src/packages/contracts/gateway/routes.py`에 있어야 한다.
- 문서에 쓴 request/response DTO는 `src/packages/contracts/gateway/requests.py`, `responses.py`에 있어야 한다.
- 문서에 쓴 event subject는 `src/packages/contracts/event_bus/subjects.py`에 있어야 한다.
- 문서에 쓴 event body는 `src/domains/*/events.py`에 있어야 한다.
- 문서에 쓴 worker는 실제 `@app.on(...)` 또는 `@app.on_any`를 가져야 한다.
- 문서에 쓴 provider는 실제 `@telemetry.source(...)`를 가져야 한다.
- 문서에 쓴 command action은 action catalog와 target agent handler가 연결되어야 한다.
- 문서에 쓴 테스트는 실제 `tests/` 아래에 있어야 한다.

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
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
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
