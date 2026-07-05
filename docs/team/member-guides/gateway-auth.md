# 멤버 가이드: Gateway / Auth

이 문서는 Gateway/Auth를 맡은 사람이 현재 코드 기준으로 어디를 고치고 무엇을 테스트해야 하는지 보기 위한 문서다. 예전 project 중심 설계가 아니라 지금 `dev`에서 실제로 동작하는 route, DTO, repository, 권한 helper만 기준으로 적었다.

## 역할

Gateway는 외부 HTTP 요청이 처음 들어오는 경계다. 여기서 할 일은 세 가지다.

1. request DTO로 입력을 검증한다.
2. session 또는 agent token으로 신원을 확인한다.
3. 필요한 권한을 확인한 뒤 event를 발행하거나 read model을 조회한다.

worker 로직을 Gateway 안에 넣지 않는다. Gateway는 “받고, 검사하고, event/read model 경계로 넘기는 곳”이다.

## 먼저 보는 파일

| 목적 | 파일 |
| --- | --- |
| Gateway app 조립 | `src/services/gateway/api-gateway/gateway.py` |
| auth service | `src/services/gateway/api-gateway/auth.py` |
| password/hash helper | `src/services/gateway/api-gateway/passwords.py` |
| route 상수 | `src/packages/contracts/gateway/routes.py` |
| request DTO | `src/packages/contracts/gateway/requests.py` |
| response DTO | `src/packages/contracts/gateway/responses.py` |
| identity router | `src/domains/identity/router.py` |
| identity dependency | `src/domains/identity/dependencies.py` |
| identity repository | `src/domains/identity/repository.py` |
| target router | `src/domains/target/router.py` |
| command router | `src/domains/command/router.py` |
| RCA evidence router | `src/domains/rca/router.py` |
| dashboard router | `src/domains/dashboard/router.py` |

## 현재 route 기준

| route | 구현 위치 | 인증 기준 | 하는 일 |
| --- | --- | --- | --- |
| `GET /healthz` | `gateway.py` | 없음 | 프로세스가 떠 있는지 확인한다. DB를 만지지 않는다. |
| `GET /readyz` | `gateway.py` | 없음 | `db.check_ready()`로 DB 연결 가능 여부를 확인한다. |
| `POST /auth/signup` | `identity/router.py` | 없음 | pending user를 만들고 email verification event를 발행한다. |
| `POST /auth/login` | `identity/router.py` | 없음 | email/password를 확인하고 HttpOnly session cookie를 설정한다. |
| `GET /auth/session` | `identity/router.py` | session | 현재 사용자, role, workspace를 반환한다. |
| `POST /auth/logout` | `identity/router.py` | session | Redis session을 삭제하고 cookie를 비운다. |
| `GET /auth/verify-email` | `identity/router.py` | token query | email token을 소비하고 active/pending approval 결과를 처리한다. |
| `POST /auth/users/{user_id}/approve` | `identity/router.py` | admin session | pending 사용자를 승인한다. |
| `POST /targets` | `target/router.py` | session + cluster 권한 | target agent 설치 manifest와 per-cluster token을 만든다. |
| `PUT /clusters/{cluster_id}/policy` | `target/router.py` | cluster 권한 | agent policy를 갱신한다. |
| `POST /agent/connect` | `gateway.py` | agent token | `agent.connected` event를 발행한다. body cluster보다 token identity를 믿는다. |
| `POST /agent/evidence` | `rca/router.py` | agent token | `cluster.evidence.received` event를 outbox에 stage한다. |
| `/agent/evidence/jobs*` | `target/router.py` | agent token | evidence provider job을 schedule, poll, complete한다. |
| `/agent/commands*` | `command/router.py` | agent token | command poll/start/heartbeat/result를 처리한다. |
| `POST /agent/debug/query` | `command/router.py` | session + cluster 권한 | agent에게 one-shot debug query command를 queue한다. |
| `POST /commands` | `command/router.py` | session + cluster 권한 | 사용자 command 요청을 event/queue로 넘긴다. |
| `/dashboard/rca/*` | `dashboard/router.py` | session + cluster read 권한 | dashboard read model을 조회한다. |

## 권한 기준

| helper | 어디서 쓰는가 | 기준 |
| --- | --- | --- |
| `require_session` | browser/user route | Redis session cookie 또는 session header를 확인한다. |
| `require_admin_session` | user approve, DLQ replay | admin role만 통과시킨다. |
| `require_cluster_access` | target/command/dashboard 단건 action | `workspace_id`, `cluster_id`, action을 DB grant로 검사한다. |
| `accessible_resource_ids` | dashboard 목록 조회 | 볼 수 있는 cluster id만 read model query에 넘긴다. |
| `require_cluster_agent` | agent route | `x-agent-token`을 hash해서 등록된 cluster identity를 찾는다. |

프론트는 권한을 “숨김 처리”에만 쓰고, 실제 차단은 반드시 backend helper에서 한다.

## 새 endpoint를 추가하는 순서

1. `routes.py`에 route 상수를 먼저 추가한다.
2. `requests.py`, `responses.py`에 DTO를 추가한다.
3. 도메인 router에 handler를 추가한다.
4. session route면 `require_session` 또는 `require_cluster_access`를 붙인다.
5. agent route면 `require_cluster_agent`를 붙이고 body의 workspace/cluster를 신뢰하지 않는다.
6. event를 발행해야 하면 `events.accept_body(...)` 또는 UoW + outbox stage 경계를 사용한다.
7. 저장이 필요하면 해당 도메인 repository에 method를 추가한다.
8. 같은 PR에서 route test와 repository/unit test를 추가한다.
9. `docs/events.md`와 역할별 온보딩 문서를 갱신한다.

## 바로 돌릴 테스트

Gateway/Auth를 건드렸으면 아래를 먼저 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_gateway_error_handler.py \
  tests/test_identity_auth_routes.py \
  tests/test_password_auth.py \
  tests/test_auth_security.py \
  tests/test_identity_repository.py \
  tests/test_target_registration.py \
  tests/test_agent_evidence_ingest.py \
  tests/test_command_router.py \
  tests/test_dashboard_router.py \
  -q
```

전체 영향까지 보려면 마지막에 `make check`, 서비스 smoke는 `make aws-smoke`로 확인한다.
