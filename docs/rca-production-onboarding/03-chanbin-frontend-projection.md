# 찬빈: Frontend + Projection 프로덕션 흐름

찬빈 파트의 목표는 command, evidence, RCA, PR 상태를 사람이 이해할 수 있는 화면으로 만드는 것이다.

바로 화면부터 만들면 backend 상태와 이름이 어긋난다.
그래서 먼저 실제 event를 `dashboard-worker`가 읽고, `rca_timeline` read model에 저장하고, Gateway가 권한 필터를 적용해 `/dashboard/rca/...` API로 내려주는 구조를 기준으로 잡는다.

권한 시스템은 [찬빈: 권한 시스템과 대시보드 적용](06-chanbin-permission-dashboard.md)을 먼저 읽는다.

## 1단계. Event subject를 확인한다

이 파일을 연다.

```text
src/packages/contracts/event_bus/subjects.py
```

화면 상태 이름은 event subject와 맞아야 한다.
frontend에서 임의 상태 이름을 만들면 backend와 불일치가 생긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_body_contracts.py -q
```

## 2단계. RCA, command, SCM event body를 확인한다

아래 파일을 순서대로 연다.

```text
src/domains/rca/events.py
src/domains/command/events.py
src/domains/scm/events.py
```

RCA 카드에는 root cause, confidence, supporting evidence, missing evidence가 필요하다.

command 카드에는 command_id, action, status, agent_id, result가 필요하다.

Safe PR 카드에는 requested, patch_prepared, created, failed 상태가 필요하다.
PR URL은 `safe_pr.created`에서만 생긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_body_contracts.py -q
```

## 3단계. Projection 패턴을 확인한다

이 파일을 연다.

```text
src/services/projection/audit-worker/app.py
```

`@app.on_any` 패턴을 본다.
dashboard projection worker도 같은 방식으로 전체 event envelope를 받아 read model로 만든다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_projection.py -q
```

## 4단계. Dashboard route와 DTO를 확인한다

아래 파일을 순서대로 연다.

```text
src/packages/contracts/gateway/routes.py
src/packages/contracts/gateway/responses.py
```

현재 route는 아래다.

```text
GET /dashboard/rca/timeline
GET /dashboard/rca/incidents/{incident_id}
```

현재 DTO는 아래다.

```text
RcaTimelineItem
RcaTimelineResponse
RcaIncidentResponse
```

frontend는 raw event payload가 아니라 이 DTO만 렌더링한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py -q
```

## 5단계. Identity 권한 경계를 확인한다

아래 파일을 순서대로 연다.

```text
src/domains/identity/dependencies.py
src/domains/identity/repository.py
```

찾을 함수는 `require_session`, `require_cluster_access`, `accessible_resource_ids`다.

dashboard는 목록 화면이라 단건 권한 검사만으로 부족하다.
query API가 workspace와 cluster 권한으로 row를 줄여야 한다.

browser는 session cookie를 쓴다.
`x-agent-token`은 browser로 내려주지 않는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_identity_repository.py tests/test_dashboard_router.py -q
```

## 6단계. Dashboard read model을 확인한다

아래 파일을 순서대로 연다.

```text
src/domains/dashboard/models.py
src/domains/dashboard/repository.py
```

`RcaTimeline`은 `workspace_id + correlation_id` unique 제약으로 같은 흐름을 한 row로 묶는다.

`DashboardRepository.upsert_rca_timeline()`은 같은 event가 다시 처리되어도 같은 row를 갱신한다.

query는 `workspace_id`를 먼저 필터링하고, 필요하면 `cluster_id in allowed_cluster_ids`를 추가한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

## 7단계. Dashboard projection worker를 확인한다

이 파일을 연다.

```text
src/services/projection/dashboard-worker/app.py
```

패턴은 아래다.

```python
app = App("dashboard-worker")

@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext[DashboardStore]) -> None:
    update = timeline_update_from_event(evt)
    if update is not None:
        await ctx.db.upsert_rca_timeline(update)
```

event 흐름과 화면 read model을 분리하기 위해 필요하다.
worker가 재실행되어도 idempotent하게 같은 row를 갱신해야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

## 8단계. Dashboard query router를 확인한다

이 파일을 연다.

```text
src/domains/dashboard/router.py
```

현재 API는 아래다.

```text
GET /dashboard/rca/timeline
GET /dashboard/rca/timeline?cluster_id=<cluster_id>
GET /dashboard/rca/incidents/{incident_id}
GET /dashboard/rca/incidents/{incident_id}?cluster_id=<cluster_id>
```

`cluster_id` query가 없으면 `accessible_resource_ids(..., "cluster", "rca.read")` 결과로 목록을 필터링한다.

`cluster_id` query가 있으면 `require_cluster_access(..., Permission.RCA_READ.value)`를 먼저 통과해야 한다.

session의 `workspace_id`만 사용한다.
브라우저가 보낸 workspace 값으로 tenant를 바꾸지 않는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py -q
```

## 9단계. 화면 상태를 event 기준으로 나눈다

화면에서 꼭 구분해야 하는 상태는 아래다.

```text
cluster.evidence.received
evidence.built
incident.detected
evidence.bundle.built
rca.candidates.planned
rca.candidates.evaluated
rca.completed
rca.action_required
recovery.planned
recovery.selection_requested
recovery.action_selected
command.requested
command.dispatched
command.queued_for_agent
command.completed
safe_pr.requested
safe_pr.patch_prepared
diff.explained
safe_pr.created
safe_pr.failed
```

`rca.completed`와 `rca.action_required`는 다르다.

`command.queued_for_agent`와 `command.completed`는 다르다.

`safe_pr.requested`와 `safe_pr.created`는 다르다.

이 셋을 섞으면 운영자가 실제 상태를 잘못 이해한다.

## 10단계. Frontend 구현 순서를 잡는다

frontend 작업은 backend DTO와 query API가 통과한 다음 시작한다.

첫 화면은 RCA timeline list다.

두 번째 화면은 incident detail이다.

세 번째는 evidence provider status다.

네 번째는 root cause와 missing evidence다.

다섯 번째는 recovery candidates다.

여섯 번째는 command result다.

일곱 번째는 PR requested, created, failed state다.

마지막으로 realtime live summary를 붙인다.

## 11단계. Realtime 경계를 확인한다

아래 경로를 연다.

```text
src/packages/contracts/realtime
src/services/realtime/realtime-gateway
```

realtime은 화면을 빠르게 갱신하기 위한 경로다.
권한 없는 데이터를 밀어주면 안 된다.
payload는 bounded 형태여야 한다.
provider raw payload 전체를 websocket으로 보내면 안 된다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_realtime_contracts.py tests/test_realtime_gateway.py -q
```

## 12단계. 변경할 때 같이 고칠 곳을 확인한다

response DTO를 바꾸면 가인 RCA output과 민정 evidence bucket을 같이 본다.

route path를 바꾸면 `routes.py`, Gateway router include, frontend fetch code, Bruno request를 같이 본다.

projection table을 바꾸면 idempotency test와 audit/realtime 계약을 같이 본다.

realtime payload를 바꾸면 payload 크기 제한과 연결 끊김 표시를 같이 본다.

화면 상태명을 바꾸면 event subject와 실제 backend 상태를 같이 본다.

## 13단계. 찬빈 전체 검증을 돌린다

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  tests/test_realtime_gateway.py \
  tests/test_identity_repository.py \
  -q
```

## 14단계. Bruno로 확인한다

Bruno는 `docs/api`를 collection root로 연다.

찬빈은 `00-health-auth`, `05-rca-dashboard`, `08-ops-dlq`를 확인한다.
