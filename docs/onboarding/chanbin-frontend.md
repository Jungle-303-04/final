# 찬빈: Frontend + Dashboard 계약

찬빈 파트는 RCA와 command 상태를 사람이 볼 수 있는 화면으로 만드는 역할이다.

현재 source repo에는 dashboard backend 계약이 구현되어 있다. `dashboard-worker`가 event를 읽어 `rca_timeline` read model로 만들고, Gateway가 session과 cluster read 권한을 검사한 뒤 `/dashboard/rca/*` API로 내려준다. 프론트 앱은 이 API와 realtime 계약을 기준으로 붙이면 된다.

권한 기준은 [찬빈: 권한 시스템과 대시보드 적용](../rca-production-onboarding/06-chanbin-permission-dashboard.md)을 먼저 읽는다. 화면 구현을 시작할 때는 [찾아보고 구현하는 방법](../rca-production-onboarding/07-how-to-find-and-implement.md)도 같이 본다.

## 먼저 열 파일

| 순서 | 파일 | 이유 |
| --- | --- | --- |
| 1 | `src/packages/contracts/gateway/routes.py` | dashboard route 상수 |
| 2 | `src/packages/contracts/gateway/responses.py` | frontend가 받을 response DTO |
| 3 | `src/domains/dashboard/models.py` | `RcaTimeline` read model 컬럼 |
| 4 | `src/domains/dashboard/repository.py` | event subject를 화면 status로 바꾸는 mapping |
| 5 | `src/services/projection/dashboard-worker/app.py` | `@app.on_any` projection worker |
| 6 | `src/domains/dashboard/router.py` | session, workspace, cluster read 권한 필터 |
| 7 | `src/domains/identity/dependencies.py` | `require_session`, `require_cluster_access` |
| 8 | `src/domains/identity/repository.py` | `accessible_resource_ids` 목록 필터 |
| 9 | `src/packages/contracts/realtime` | 화면 realtime payload 크기와 type 제한 |
| 10 | `src/services/realtime/realtime-gateway` | browser/agent realtime 연결 경계 |
| 11 | `tests/test_dashboard_projection.py` | event -> timeline projection 테스트 |
| 12 | `tests/test_dashboard_router.py` | 권한 필터와 response DTO 테스트 |

## 현재 구현 기준

| 항목 | 현재 기준 |
| --- | --- |
| dashboard worker | `src/services/projection/dashboard-worker/app.py` |
| dashboard read model | `src/domains/dashboard/models.py::RcaTimeline` |
| dashboard repository | `src/domains/dashboard/repository.py::DashboardRepository` |
| timeline API | `GET /dashboard/rca/timeline` |
| incident API | `GET /dashboard/rca/incidents/{incident_id}` |
| API 권한 | `require_session`, `accessible_resource_ids`, `require_cluster_access` |
| realtime 경계 | `src/services/realtime/realtime-gateway` |
| frontend 구현 기준 | backend DTO만 읽고 DB/NATS/agent queue 직접 접근 없음 |

## 화면이 읽어야 하는 event 상태

| 상태 | 의미 |
| --- | --- |
| `cluster.evidence.received` | target evidence window가 들어옴 |
| `evidence.built` | RCA가 읽을 수 있게 evidence가 정리됨 |
| `incident.detected` | 증상/장애 후보가 생김 |
| `evidence.bundle.built` | RCA 판단 근거 묶음이 생김 |
| `rca.candidates.planned` | 원인 후보가 만들어짐 |
| `rca.candidates.evaluated` | 후보별 근거와 점수가 계산됨 |
| `rca.completed` | 근거가 충분한 RCA 결과 |
| `rca.action_required` | 근거 부족 또는 수동 판단 필요 |
| `recovery.planned` | 복구 후보가 만들어짐 |
| `recovery.selection_requested` | 사람이 복구 후보를 골라야 함 |
| `recovery.action_selected` | command 또는 PR route가 선택됨 |
| `command.queued_for_agent` | agent가 가져갈 command가 queue에 있음 |
| `command.completed` | agent 실행 결과가 돌아옴 |
| `safe_pr.requested` | PR 생성 요청이 만들어짐 |
| `safe_pr.patch_prepared` | PR patch와 설명 초안이 준비됨 |
| `safe_pr.created` | 실제 PR reference가 생김 |
| `safe_pr.failed` | PR 생성 실패 |

`safe_pr.requested`에는 PR URL이 있다고 보면 안 된다. URL은 `safe_pr.created`에서만 온다.

## 민정에게 확인할 값

- `cluster_id`
- `evidence_key`
- `window_start`
- provider별 성공/실패 상태
- `kubernetes` bucket의 pods/events/workloads 요약
- `metrics` bucket의 result/series 요약
- `logs` bucket의 line count와 stream 요약
- `traces` bucket의 trace count와 service name

## 가인에게 확인할 값

- `incident_id`
- `evidence_ref`
- `root_cause`
- `confidence`
- `supporting_evidence`
- `missing_evidence`
- `action_route`
- `command_id`
- `pr_url`
- 마지막 event subject

## dashboard 계약을 확인하고 확장하는 순서

1. `src/packages/contracts/gateway/responses.py`의 `RcaTimelineItem`, `RcaTimelineResponse`, `RcaIncidentResponse`를 먼저 본다.
2. `src/packages/contracts/gateway/routes.py`의 `/dashboard/rca/*` route 상수를 확인한다.
3. `src/domains/dashboard/models.py`의 `RcaTimeline` 컬럼을 확인한다.
4. `src/domains/dashboard/repository.py`의 event subject -> status mapping을 확인한다.
5. `src/services/projection/dashboard-worker/app.py`가 `@app.on_any`로 event를 읽는지 확인한다.
6. `src/domains/dashboard/router.py`가 session과 cluster read 권한을 적용하는지 확인한다.
7. `tests/test_dashboard_projection.py`, `tests/test_dashboard_router.py`를 돌린다.
8. 그 다음 frontend가 route를 소비한다.

## 화면에서 헷갈리면 안 되는 것

- 데이터가 없는 상태와 realtime 연결이 끊긴 상태는 다르다.
- provider 일부 실패와 전체 실패는 다르다.
- `rca.completed`와 `rca.action_required`는 다르다.
- `safe_pr.requested`와 `safe_pr.created`는 다르다.
- command queue 상태와 command result 상태는 다르다.
- frontend가 DB나 NATS를 직접 보면 안 된다.
- `x-agent-token`은 browser에 절대 전달하지 않는다.

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  tests/test_realtime_gateway.py \
  -q
```

실제 로컬 서비스까지 확인할 때는 아래 순서로 본다.

```bash
make up
make smoke
```

`make up`은 local 기본 계정 `admin@example.com / local-admin-password`를 만들고 기본 `UP_WORKER_SET=smoke` worker만 켠다. `make smoke`는 샘플 manifest `src/samples/smoke/deploy.yaml`로 webhook -> render -> diff -> analyze 이벤트가 실제 DB에 남는지 확인한다.

## 찬빈이 바꾸면 같이 봐야 하는 것

| 바꾸는 것 | 같이 확인할 것 |
| --- | --- |
| response DTO | 가인 RCA output, 민정 evidence bucket |
| route path | `routes.py`, Gateway router include, frontend fetch code |
| projection table | idempotency test, audit/realtime 계약 |
| realtime payload | payload 크기 제한, 연결 끊김 표시 |
| 화면 상태명 | event subject와 실제 backend 상태 |

화면은 마지막에 예쁘게 붙이는 것이 아니라, 팀 전체 계약을 사람이 이해할 수 있게 만드는 입구다. 그래서 DTO와 상태 이름을 작게라도 먼저 맞추는 게 중요하다.
