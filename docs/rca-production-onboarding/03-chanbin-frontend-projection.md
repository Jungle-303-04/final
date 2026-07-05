# 찬빈: Frontend + Projection

찬빈 파트의 목표는 command, evidence, RCA, PR 상태를 사람이 이해할 수 있는 화면으로 만드는 것이다.

바로 화면부터 만들면 backend 상태와 이름이 어긋난다. 그래서 지금은 먼저 실제 event를 `dashboard-worker`가 읽고, `rca_timeline` read model에 저장하고, Gateway가 권한 필터를 적용해 `/dashboard/rca/...` API로 내려주는 구조까지 구현했다.

권한 시스템은 별도 문서로 더 자세히 정리했다. 화면 작업을 시작하기 전에 [찬빈: 권한 시스템과 대시보드 적용](06-chanbin-permission-dashboard.md)을 먼저 읽는다.

## 먼저 열 파일 순서

| 순서 | 파일 | 무엇을 봐야 하는가 | 왜 먼저 보는가 |
| --- | --- | --- | --- |
| 1 | `src/packages/contracts/event_bus/subjects.py` | 화면에 표시할 event subject 목록 | 화면 상태 이름은 event subject와 맞아야 한다. |
| 2 | `src/domains/rca/events.py` | RCA/Recovery/Safe PR body | RCA 카드에 어떤 필드가 있는지 확인한다. |
| 3 | `src/domains/command/events.py` | command plan/result body | command 상태 카드에 어떤 값이 필요한지 본다. |
| 4 | `src/domains/scm/events.py` | Safe PR request/created/failed body | PR URL이 언제 생기는지 구분한다. |
| 5 | `src/services/projection/audit-worker/app.py` | `@app.on_any` projector 패턴 | dashboard projection worker도 같은 방식으로 시작한다. |
| 6 | `src/domains/audit/models.py` | `audit_log` table | 최소 timeline을 이미 저장하는 구조다. |
| 7 | `src/packages/contracts/realtime` | realtime message contract | 화면에 보낼 payload 크기와 타입 제한이다. |
| 8 | `src/services/realtime/realtime-gateway` | websocket fan-out 구조 | live summary 화면을 붙일 때 쓰는 backend 경계다. |
| 9 | `src/packages/contracts/gateway/routes.py` | route 상수 추가 위치 | dashboard API 경로를 한 곳에서 관리한다. |
| 10 | `src/packages/contracts/gateway/responses.py` | response DTO 추가 위치 | frontend가 받을 shape를 고정한다. |
| 11 | `src/domains/identity/dependencies.py` | `require_session`, `require_cluster_access` | dashboard API에서 backend 권한 차단을 적용한다. |
| 12 | `src/domains/identity/repository.py` | `accessible_resource_ids` | 목록 query에서 권한 없는 cluster row를 제외한다. |
| 13 | `src/domains/dashboard/models.py` | `RcaTimeline` table | 화면용 read model 컬럼을 확인한다. |
| 14 | `src/domains/dashboard/repository.py` | event -> timeline row mapping, upsert, query | projection과 API가 같은 저장소를 쓴다. |
| 15 | `src/services/projection/dashboard-worker/app.py` | `@app.on_any` dashboard projector | 모든 관련 event를 받아 timeline으로 투영한다. |
| 16 | `src/domains/dashboard/router.py` | dashboard query API | session과 cluster read 권한 필터가 실제 적용되는 곳이다. |
| 17 | `tests/test_dashboard_projection.py` | event mapping/upsert 테스트 | 상태 mapping이 깨지면 바로 잡는다. |
| 18 | `tests/test_dashboard_router.py` | 권한 필터/API DTO 테스트 | 권한 없는 cluster row가 노출되지 않는지 본다. |

## 화면에서 꼭 구분해야 하는 상태

| 상태 | event | 왜 구분해야 하는가 |
| --- | --- | --- |
| evidence window 수신 | `cluster.evidence.received` | target agent가 provider 결과를 모아 RCA 입력으로 넘긴 시점이다. |
| evidence 정규화 | `evidence.built` | RCA가 읽는 공통 evidence 객체가 만들어진 시점이다. |
| incident 감지 | `incident.detected` | 실제 장애로 판단했는지와 severity를 보여준다. |
| evidence bundle 생성 | `evidence.bundle.built` | supporting/missing evidence 판단의 출발점이다. |
| 후보 생성 | `rca.candidates.planned` | 어떤 원인 후보를 평가할지 보여준다. |
| 후보 평가 | `rca.candidates.evaluated` | 후보별 score와 missing evidence를 보여준다. |
| RCA 완료 | `rca.completed` | root cause와 action을 보여준다. |
| 사람 조치 필요 | `rca.action_required` | 자동 결론/자동 조치가 막힌 이유를 보여준다. |
| recovery 계획 | `recovery.planned` | 사람이 고를 수 있는 조치 후보 목록이다. |
| 선택 필요 | `recovery.selection_requested` | 자동 선택이 안 되어 사람이 골라야 하는 상태다. |
| 조치 선택 | `recovery.action_selected` | 어떤 route로 넘어갔는지 보여준다. |
| command 요청 | `command.requested` | 복구 후보가 실제 command 요청으로 넘어간 상태다. |
| command 계획 | `command.dispatch.ready` | command-worker가 agent 실행 계획을 만든 상태다. |
| command 라우팅 | `command.dispatched` | 어떤 agent route로 보낼지 결정한 상태다. |
| command queue | `command.queued_for_agent` | agent가 가져가기 전 queue 적재 상태다. |
| command 완료 | `command.completed` | target agent 실행 결과다. |
| PR 요청 | `safe_pr.requested` | PR을 만들라는 요청이다. URL은 `safe_pr.created`에서 생긴다. |
| PR patch 준비 | `safe_pr.patch_prepared` | PR에 들어갈 patch/body 초안이 준비된 상태다. |
| PR diff 설명 | `diff.explained` | patch diff와 위험 설명이 만들어진 상태다. |
| PR 생성 | `safe_pr.created` | 실제 PR URL이 생긴 상태다. |
| PR 실패 | `safe_pr.failed` | provider 설정, token, repo 문제 등으로 PR 생성이 끝나지 않은 상태다. |

## 왜 projection이 먼저인가

frontend가 event bus나 DB를 직접 읽으면 안 된다. 화면은 query API나 realtime gateway만 읽어야 한다. 그러려면 backend에서 화면용 read model을 만들어야 한다.

projection을 만들 때도 권한은 projection row에만 맡기지 않는다. row에는 `workspace_id`, `cluster_id`를 반드시 넣고, query API에서 `require_session`과 `accessible_resource_ids`로 다시 필터링한다.

현재 이미 있는 패턴:

```python
app = App("audit-worker")

@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext[AuditStore]) -> None:
    await ctx.db.append_audit_logs([audit_log_row(evt)])
```

dashboard projection worker도 같은 방식으로 구현되어 있다.

파일: `src/services/projection/dashboard-worker/app.py`

```python
app = App("dashboard-worker")

@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext[DashboardStore]) -> None:
    row = timeline_update_from_event(evt)
    if row is not None:
        await ctx.db.upsert_rca_timeline(row)
```

## dashboard read model에 필요한 최소 필드

| 필드 | 왜 필요한가 | producer |
| --- | --- | --- |
| `workspace_id` | 로그인 사용자의 workspace filter | 모든 domain body |
| `correlation_id` | command, evidence, RCA, PR을 한 timeline으로 묶음 | event envelope |
| `cluster_id` | 어느 target cluster인지 표시 | target/RCA/command body |
| `incident_id` | RCA 카드의 기준 ID | `IncidentRecord` |
| `evidence_ref` | 어떤 evidence window로 분석했는지 표시 | `Evidence.object_ref`, `RcaCompletedBody` |
| `current_subject` | 현재 단계 표시 | event envelope subject |
| `status` | 화면 badge | projection rule |
| `root_cause` | RCA 결과 | `RcaCompletedBody` |
| `confidence` | RCA 신뢰도 | `RcaReportDetail` |
| `supporting_evidence` | 근거 있는 결론인지 보여줌 | `RcaReportDetail` |
| `missing_evidence` | 추가 수집이 필요한 값 | `EvidenceBundle`, `RcaReportDetail` |
| `action_route` | command/PR/manual 중 어디로 갔는지 표시 | `RecoveryPlan.execution_route` |
| `command_id` | command 상세 조회/상태 표시 | `CommandQueuedForAgentBody` |
| `pr_url` | PR 버튼 링크 | `SafePrCreatedBody` |
| `error_reason` | 실패 이유 | `RcaActionRequiredBody`, `SafePrFailedBody` |
| `last_event_id` | 마지막으로 반영한 event 추적 | event envelope |
| `last_event_at` | 최신 상태 시각 표시 | event envelope |
| `payload` | 디버깅용 마지막 event payload | event payload |

## 현재 구현된 코드 흐름

### 0. 권한 기준

파일:

- `src/packages/contracts/identity.py`
- `src/domains/identity/dependencies.py`
- `src/domains/identity/repository.py`
- `src/services/realtime/realtime-gateway/app.py`

왜 먼저 하는가:

- dashboard는 목록 화면이라 단건 권한 검사만으로 부족하다.
- query API가 workspace와 cluster 권한으로 row를 줄여야 한다.
- realtime browser도 session workspace 밖으로 연결되면 안 된다.

자세한 기준은 [찬빈: 권한 시스템과 대시보드 적용](06-chanbin-permission-dashboard.md)을 따른다.

### 1. Response DTO

파일:

- `src/packages/contracts/gateway/responses.py`

현재 구현된 DTO:

- `RcaTimelineItem`
- `RcaTimelineResponse`
- `RcaIncidentResponse`

왜 필요한가:

- frontend와 backend가 같은 shape를 보고 작업할 수 있다.
- 화면은 raw event payload가 아니라 DTO만 렌더링한다.
- `supporting_evidence`, `missing_evidence`는 항상 list로 내려간다.

### 2. Route 상수

파일:

- `src/packages/contracts/gateway/routes.py`

현재 route:

```python
DASHBOARD_RCA_TIMELINE_PATH = "/dashboard/rca/timeline"
DASHBOARD_RCA_INCIDENT_PATH = "/dashboard/rca/incidents/{incident_id}"
```

왜 필요한가:

- frontend fetch path와 backend route가 문자열로 흩어지지 않는다.
- 테스트가 route 상수를 기준으로 고정된다.

### 3. Projection table

파일:

- `src/domains/dashboard/models.py`
- `src/domains/dashboard/repository.py`

왜 필요한가:

- `audit_log`는 전체 event 원장이고, 화면은 정리된 read model이 필요하다.
- 같은 event가 재처리되어도 같은 row가 갱신되어야 한다.

현재 기준:

- `RcaTimeline`은 `workspace_id + correlation_id` unique 제약으로 같은 흐름을 한 row로 묶는다.
- `DashboardRepository.upsert_rca_timeline()`은 PostgreSQL `ON CONFLICT`로 재처리 중복을 갱신 처리한다.
- 새 event에 없는 `cluster_id`, `incident_id`, `root_cause`, `command_id`, `pr_url` 같은 값은 기존 row 값을 보존한다.
- query는 `workspace_id`를 먼저 필터링하고, 필요하면 `cluster_id in allowed_cluster_ids`를 추가한다.

### 4. Dashboard projection worker

파일:

- `src/services/projection/dashboard-worker/app.py`

왜 필요한가:

- event 흐름과 화면 read model을 분리한다.
- worker가 죽어도 event retry로 다시 만들 수 있다.

실제 패턴:

```python
app = App("dashboard-worker")

@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext[DashboardStore]) -> None:
    update = timeline_update_from_event(evt)
    if update is not None:
        await ctx.db.upsert_rca_timeline(update)
```

### 5. Gateway query router

파일:

- `src/domains/dashboard/router.py`
- `src/services/gateway/api-gateway/gateway.py`

왜 필요한가:

- frontend는 DB를 직접 읽지 않는다.
- session/workspace 권한을 Gateway에서 확인한다.

현재 API:

```text
GET /dashboard/rca/timeline
GET /dashboard/rca/timeline?cluster_id=<cluster_id>
GET /dashboard/rca/incidents/{incident_id}
GET /dashboard/rca/incidents/{incident_id}?cluster_id=<cluster_id>
```

동작:

- `cluster_id` query가 없으면 `accessible_resource_ids(..., "cluster", "read")` 결과로 목록을 필터링한다.
- `cluster_id` query가 있으면 `require_cluster_access(..., READ_ACCESS)`를 먼저 통과해야 한다.
- session의 `workspace_id`만 사용한다. 브라우저가 보낸 workspace 값으로 tenant를 바꾸지 않는다.

### 6. Frontend app

frontend 작업은 backend DTO와 query API가 통과한 다음 아래 화면부터 붙인다.

화면 순서:

1. RCA timeline list
2. incident detail
3. evidence provider status
4. root cause / missing evidence
5. recovery candidates
6. command result
7. PR requested/created/failed state
8. realtime live summary

## 바로 돌릴 테스트

현재 동작 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  tests/test_realtime_gateway.py \
  tests/test_realtime_hub.py \
  -q
```

frontend가 생기면 추가할 테스트:

- route contract 또는 browser test
- 화면이 raw event payload가 아니라 `RcaTimelineResponse`만 렌더링하는지 확인
- 권한 회귀 확인: `tests/test_identity_repository.py`, `tests/test_realtime_gateway.py`

## 구현 체크리스트

| 작업 | 파일 | 완료 기준 |
| --- | --- | --- |
| timeline response DTO | `contracts/gateway/responses.py` | `RcaTimelineItem`, `RcaTimelineResponse`, `RcaIncidentResponse` 존재 |
| dashboard route | `contracts/gateway/routes.py`, `domains/dashboard/router.py` | session/workspace 권한 test 통과 |
| read model table | `domains/dashboard/models.py` | `workspace_id + correlation_id` unique 기준 |
| repository | `domains/dashboard/repository.py` | idempotent upsert/query 권한 필터 test 통과 |
| projector | `services/projection/dashboard-worker/app.py` | `@app.on_any` event별 update test 통과 |
| realtime 표시 | `contracts/realtime`, realtime gateway | bounded payload test 통과 |
| frontend UI | frontend app | backend DTO만 읽고 DB/NATS 직접 접근 없음 |
| 권한 필터 | `identity/repository.py`, dashboard router | 권한 없는 cluster row가 응답에서 제외됨 |
