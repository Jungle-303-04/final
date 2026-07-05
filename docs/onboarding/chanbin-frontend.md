# 찬빈: Frontend + Dashboard 계약

찬빈 파트는 RCA와 command 상태를 사람이 볼 수 있는 화면으로 만드는 역할이다.

현재 source repo에는 dashboard backend 계약이 구현되어 있다.
`dashboard-worker`가 event를 읽어 `rca_timeline` read model로 만들고, Gateway가 session과 cluster read 권한을 검사한 뒤 `/dashboard/rca/*` API로 내려준다.
frontend는 이 API와 realtime 계약을 기준으로 붙이면 된다.

권한 기준은 [찬빈: 권한 시스템과 대시보드 적용](../rca-production-onboarding/06-chanbin-permission-dashboard.md)을 먼저 읽는다.

## 1단계. Route 상수를 확인한다

이 파일을 연다.

```text
src/packages/contracts/gateway/routes.py
```

찾을 route는 아래다.

```text
GET /dashboard/rca/timeline
GET /dashboard/rca/incidents/{incident_id}
```

frontend에서 URL 문자열을 따로 만들지 않는다.
backend route가 바뀌면 contract와 테스트가 먼저 바뀌어야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py -q
```

## 2단계. Response DTO를 확인한다

이 파일을 연다.

```text
src/packages/contracts/gateway/responses.py
```

찾을 DTO는 아래다.

```text
RcaTimelineItem
RcaTimelineResponse
RcaIncidentResponse
```

frontend는 DB 모델을 직접 보지 않는다.
이 response DTO만 보고 화면 state를 만든다.

필드가 부족하면 DTO와 router test를 먼저 바꾸고, 그다음 frontend를 바꾼다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py -q
```

## 3단계. Read model table을 확인한다

이 파일을 연다.

```text
src/domains/dashboard/models.py
```

찾을 모델은 `RcaTimeline`이다.

이 table은 `workspace_id`와 `correlation_id`를 기준으로 RCA 흐름을 한 row로 묶는다.
event 하나를 card 하나로 만들면 전체 흐름을 보기 어렵다.
같은 correlation 흐름 안에서 status가 갱신되는 구조로 이해한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

## 4단계. Projection mapping을 확인한다

이 파일을 연다.

```text
src/domains/dashboard/repository.py
```

여기서 event subject가 화면 status로 바뀐다.

예를 들어 `cluster.evidence.received`는 evidence가 들어온 상태고, `safe_pr.created`는 실제 PR reference가 생긴 상태다.

`safe_pr.requested`와 `safe_pr.created`를 같은 상태로 보여주면 안 된다.
requested에는 PR URL이 없다.
created 이후에만 PR URL이 있다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

## 5단계. Dashboard worker를 확인한다

이 파일을 연다.

```text
src/services/projection/dashboard-worker/app.py
```

여기서 `@app.on_any`를 찾는다.

dashboard worker는 특정 event 하나만 보는 것이 아니라 RCA, command, Safe PR 흐름의 여러 event를 받아 read model로 투영한다.

worker 안에서 UI용 문자열을 과하게 만들지 않는다.
화면 문구는 frontend에서 만들고, backend는 상태와 근거 값을 정확하게 내려준다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

## 6단계. Dashboard router 권한을 확인한다

이 파일을 연다.

```text
src/domains/dashboard/router.py
```

여기서 session 확인과 cluster read 권한 확인을 찾는다.

browser 요청은 `x-agent-token`을 쓰지 않는다.
browser는 login session cookie를 사용한다.

timeline list는 사용자가 볼 수 있는 cluster만 내려줘야 한다.
incident detail도 같은 권한 필터를 통과해야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py -q
```

## 7단계. Identity dependency를 확인한다

이 파일을 연다.

```text
src/domains/identity/dependencies.py
```

찾을 함수는 아래다.

```text
require_session
require_cluster_access
```

`require_session`은 로그인 사용자를 확인한다.

`require_cluster_access`는 이 사용자가 해당 cluster를 볼 수 있는지 확인한다.

frontend에서 “권한이 있겠지”라고 가정하지 않는다.
backend가 항상 최종 필터를 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_router.py tests/test_identity_repository.py -q
```

## 8단계. 접근 가능한 resource 목록을 확인한다

이 파일을 연다.

```text
src/domains/identity/repository.py
```

찾을 함수는 `accessible_resource_ids`다.

이 함수는 사용자가 볼 수 있는 cluster 목록을 만든다.
service admin, organization role, group role, resource role이 섞여도 결과는 resource id 목록으로 나와야 한다.

frontend list 화면은 backend가 내려준 목록만 보여준다.
숨김 처리는 UX일 뿐이고, 보안 필터는 backend가 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_identity_repository.py tests/test_dashboard_router.py -q
```

## 9단계. 화면 상태를 event 기준으로 나눈다

화면에서 최소로 구분해야 하는 상태는 아래다.

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
command.queued_for_agent
command.completed
safe_pr.requested
safe_pr.patch_prepared
safe_pr.created
safe_pr.failed
```

특히 아래 상태는 섞으면 안 된다.

`rca.completed`는 근거가 충분한 RCA 결과다.

`rca.action_required`는 근거가 부족하거나 사람이 봐야 하는 상태다.

`safe_pr.requested`는 PR 요청만 생긴 상태다.

`safe_pr.created`는 실제 PR reference가 생긴 상태다.

`command.queued_for_agent`는 agent가 가져가기 전 상태다.

`command.completed`는 agent 결과가 돌아온 상태다.

## 10단계. 민정에게 확인할 값을 정한다

민정에게 받아야 하는 값은 화면에서 evidence 상태를 보여주기 위한 값이다.

```text
cluster_id
evidence_key
window_start
provider별 성공/실패 상태
kubernetes bucket의 pods/events/workloads 요약
metrics bucket의 result/series 요약
logs bucket의 line count와 stream 요약
traces bucket의 trace count와 service name
```

provider 일부 실패와 전체 실패를 다르게 보여줘야 한다.
예를 들어 metrics는 실패했지만 Kubernetes snapshot이 있으면 “부분 evidence”로 보여줄 수 있다.

## 11단계. 가인에게 확인할 값을 정한다

가인에게 받아야 하는 값은 RCA 결과와 조치 상태다.

```text
incident_id
evidence_ref
root_cause
confidence
supporting_evidence
missing_evidence
action_route
command_id
pr_url
마지막 event subject
```

`missing_evidence`는 숨기지 않는다.
운영자는 왜 자동 결론을 못 냈는지 알아야 한다.

## 12단계. Realtime 경계를 확인한다

이 경로들을 본다.

```text
src/packages/contracts/realtime
src/services/realtime/realtime-gateway
```

realtime은 화면을 빠르게 갱신하기 위한 경로다.
권한 없는 데이터를 밀어주면 안 된다.

payload는 너무 커지면 안 된다.
provider raw payload 전체를 websocket으로 보내면 안 된다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_realtime_contracts.py \
  tests/test_realtime_gateway.py \
  -q
```

## 13단계. 전체 찬빈 흐름을 검증한다

작은 테스트가 통과한 뒤 아래를 돌린다.

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

## 14단계. Bruno에서 눈으로 확인한다

Bruno는 [Bruno API 테스트](../api/README.md)를 따라 `docs/api`를 collection으로 연다.

찬빈은 이 순서로 보낸다.

1. `00-health-auth/06-login.bru`
2. `00-health-auth/07-session.bru`
3. `05-rca-dashboard/01-dashboard-timeline.bru`
4. `05-rca-dashboard/02-dashboard-incident.bru`
5. `08-ops-dlq/01-dead-letters.bru`
6. `08-ops-dlq/03-metrics.bru`

## 화면에서 헷갈리면 안 되는 것

데이터가 없는 상태와 realtime 연결이 끊긴 상태는 다르다.

provider 일부 실패와 전체 실패는 다르다.

`rca.completed`와 `rca.action_required`는 다르다.

`safe_pr.requested`와 `safe_pr.created`는 다르다.

command queue 상태와 command result 상태는 다르다.

frontend가 DB나 NATS를 직접 보면 안 된다.

`x-agent-token`은 browser에 절대 전달하지 않는다.

## 프로덕션 완료 기준

찬빈 파트는 외부 기준 저장소에서 확인한 account, user, RBAC, OIDC, audit UI, marketplace UI, billing/license, realtime UI를 우리 dashboard와 권한 시스템으로 옮겨야 끝난다.
전체 범위는 [벤치마크 최소선 기준 프로덕션 완성 설계](../rca-production-onboarding/05-production-completion-scope.md)를 따른다.

완료 기준은 하나씩 확인한다.

1. signup, login, session, logout, email verification이 httpOnly cookie 기준으로 동작한다.
2. user, group, role, service account, resource grant가 backend 권한 필터와 연결된다.
3. OIDC provider, trust relationship, auth proxy 설정을 backend API와 화면에서 관리한다.
4. dashboard list/detail API가 workspace와 cluster 권한으로 필터링된다.
5. frontend는 DB, NATS, agent token, provider token, kubeconfig를 직접 보지 않는다.
6. incident detail이 history, message, reaction, follower, postmortem을 표시할 수 있다.
7. audit, login metrics, notification, read state 화면이 있다.
8. marketplace, publisher, repository, artifact, chart, terraform, docker catalog 화면이 있다.
9. billing, license, plan, subscription, invoice 화면은 권한 있는 사용자만 본다.
10. realtime은 incident, notification, upgrade, rollout, test log를 분리해서 표시한다.
11. Bruno에서 auth, dashboard, ops 폴더를 `aws-test` profile로 확인할 수 있다.

## 찬빈이 바꾸면 같이 확인할 것

response DTO를 바꾸면 가인 RCA output과 민정 evidence bucket을 같이 본다.

route path를 바꾸면 `routes.py`, Gateway router include, frontend fetch code, Bruno request를 같이 본다.

projection table을 바꾸면 idempotency test와 audit/realtime 계약을 같이 본다.

realtime payload를 바꾸면 payload 크기 제한과 연결 끊김 표시를 같이 본다.

화면 상태명을 바꾸면 event subject와 실제 backend 상태를 같이 본다.

화면은 마지막에 예쁘게 붙이는 것이 아니라, 팀 전체 계약을 사람이 이해할 수 있게 만드는 입구다.
그래서 DTO와 상태 이름을 작게라도 먼저 맞추는 게 중요하다.
