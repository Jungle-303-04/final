# 찬빈: Frontend + Dashboard 계약

찬빈 파트는 RCA와 command 상태를 사람이 볼 수 있는 화면으로 만드는 역할이다.

현재 source repo에는 frontend app과 dashboard projection worker가 아직 없다. 그래서 먼저 실제 backend 계약을 작게 만들고, 화면은 그 계약만 소비하게 잡아야 한다.

## 먼저 열 파일

| 순서 | 파일 | 이유 |
| --- | --- | --- |
| 1 | `src/packages/contracts/gateway/routes.py` | 현재 route 상수 |
| 2 | `src/packages/contracts/gateway/requests.py` | request DTO 패턴 |
| 3 | `src/packages/contracts/gateway/responses.py` | response DTO 패턴 |
| 4 | `src/packages/contracts/event_bus/subjects.py` | 화면 timeline에 필요한 event subject |
| 5 | `src/services/projection/audit-worker/app.py` | `@app.on_any` projection 패턴 |
| 6 | `tests/test_projection.py` | projection test 패턴 |
| 7 | `src/services/realtime/realtime-gateway` | realtime boundary |
| 8 | `tests/test_realtime_contracts.py` | 화면에 보낼 bounded payload 기준 |

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| audit worker | 구현되어 있음 |
| realtime gateway | 구현되어 있음 |
| dashboard worker | 신규 구현 목표 |
| dashboard query route | 신규 구현 목표 |
| dashboard stream route | 신규 구현 목표 |
| frontend app | 신규 구현 목표 |

이 상태를 숨기지 않는다. 화면을 만들기 전에 어떤 API와 DTO가 필요한지 먼저 고정한다.

## 화면이 읽어야 하는 event 상태

| 상태 | 의미 |
| --- | --- |
| `cluster.evidence.received` | target evidence window가 들어옴 |
| `evidence.built` | RCA가 읽을 수 있게 evidence가 정리됨 |
| `incident.detected` | 증상/장애 후보가 생김 |
| `rca.completed` | 근거가 충분한 RCA 결과 |
| `rca.action_required` | 근거 부족 또는 수동 판단 필요 |
| `command.queued_for_agent` | agent가 가져갈 command가 queue에 있음 |
| `command.completed` | agent가 실행 결과를 돌려줌 |
| `safe_pr.requested` | PR 생성 요청이 만들어짐 |
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
- command 또는 Safe PR로 이어졌는지

## dashboard 계약을 추가하는 순서

1. 화면에서 필요한 최소 DTO를 적는다.
2. `responses.py`에 response model을 추가한다.
3. `routes.py`에 route 상수를 추가한다.
4. projection table이 필요하면 `src/domains/projection/`에 model/repository를 만든다.
5. `src/services/projection/dashboard-worker/app.py`를 만들고 `@app.on_any`로 event를 읽는다.
6. 같은 event를 두 번 처리해도 같은 row로 유지되는 테스트를 쓴다.
7. Gateway router를 붙이고 response test를 쓴다.
8. 그 다음 frontend가 route를 소비한다.

## 화면에서 헷갈리면 안 되는 것

- 데이터가 없는 상태와 realtime 연결이 끊긴 상태는 다르다.
- provider 일부 실패와 전체 실패는 다르다.
- `rca.completed`와 `rca.action_required`는 다르다.
- `safe_pr.requested`와 `safe_pr.created`는 다르다.
- command queue 상태와 command result 상태는 다르다.
- frontend가 DB나 NATS를 직접 보면 안 된다.

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  tests/test_realtime_gateway.py \
  -q
```

dashboard route를 새로 만들었다면 route/response 테스트를 같이 추가한다.

## 찬빈이 바꾸면 같이 봐야 하는 것

| 바꾸는 것 | 같이 확인할 것 |
| --- | --- |
| response DTO | 가인 RCA output, 민정 evidence bucket |
| route path | `routes.py`, Gateway router include, frontend fetch code |
| projection table | idempotency test, audit/realtime 계약 |
| realtime payload | payload 크기 제한, 연결 끊김 표시 |
| 화면 상태명 | event subject와 실제 backend 상태 |

화면은 마지막에 예쁘게 붙이는 것이 아니라, 팀 전체 계약을 사람이 이해할 수 있게 만드는 입구다. 그래서 DTO와 상태 이름을 작게라도 먼저 맞추는 게 중요하다.
