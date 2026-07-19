---
source_commit: d4b003525
status: synced
---

# api-gateway — HTTP 입구(인증·인가·이벤트 수납·콘솔/라이브 중계까지 겸하는 단일 진입점)

> 소스: `src/services/gateway/api-gateway/` · 테스트: `tests/test_identity_auth_routes.py`, `tests/test_password_auth.py`, `tests/test_auth_security.py`, `tests/test_gateway_error_handler.py`, `tests/test_metrics.py`, `tests/test_dlq_reliability.py`, `tests/test_api_event_gateway.py`

## 책임 (Responsibility)

- 브라우저 SPA·cluster-agent 의 **유일한 HTTP 입구**. 모든 도메인 라우터를 하나의 FastAPI 앱에 조립한다.
- 이메일+패스워드 회원가입/로그인/이메일 인증/승인 흐름과 Redis 세션(불투명 opaque 토큰) 관리. **JWT 는 사용하지 않는다** — 세션 토큰은 `secrets.token_urlsafe` 로 생성한 랜덤 문자열이고 상태는 전부 Redis 에 있다.
- HTTP 요청을 내부 이벤트 봉투로 변환해 **outbox 에 스테이징**한다. NATS 발행은 별도 [outbox-relay](gateway-outbox-relay.md) 프로세스가 맡는다.
- dead letter 조회/재발행(admin), Prometheus `/metrics` 노출.
- **단일 origin 진입점**: 콘솔 정적 자산은 `CONSOLE_ORIGIN` 으로 프록시, `/api` prefix 는 미들웨어에서 제거 후 인프로세스 라우터로 전달, `/api/live/{path}` WebSocket 은 realtime-gateway 로 중계(`_bridge_websocket`). API 라우트 자체는 여전히 이 프로세스 안의 도메인 라우터가 직접 처리한다.
- 하지 않는 것: 이벤트 소비(워커 아님), 비즈니스 로직(도메인 라우터/워커 소유).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity` | [../../domains/identity.md](../domains/identity.md) | 인증 라우터·admin 콘솔 라우터·가드(`require_session`/`require_admin_session`/`require_cluster_agent`) |
| import | `domains.ai` | [../../domains/ai.md](../domains/ai.md) | AI conversation 라우터 |
| import | `domains.alert` | [../../domains/alert.md](../domains/alert.md) | 알림 채널 admin 라우터 |
| import | `domains.applications` | [../../domains/applications.md](../domains/applications.md) | application 제품 조회/deployment binding 라우터 |
| import | `domains.catalog` | [../../domains/catalog.md](../domains/catalog.md) | service catalog 라우터 |
| import | `domains.command` | [../../domains/command.md](../domains/command.md) | command 라우터(+agent 폴링 라우트) |
| import | `domains.dashboard` | [../../domains/dashboard.md](../domains/dashboard.md) | dashboard read model 조회 라우터 |
| import | `domains.gitops` | [../../domains/gitops.md](../domains/gitops.md) | webhook(HMAC)·approval 라우터 |
| import | `domains.inventory` | [../../domains/inventory.md](../domains/inventory.md) | agent inventory snapshot 라우터 |
| import | `domains.providers` | [../../domains/providers.md](../domains/providers.md) | provider catalog/검증 라우터 |
| import | `domains.rca` | [../../domains/rca.md](../domains/rca.md) | agent evidence·recovery 선택 라우터 |
| import | `domains.target` | [../../domains/target.md](../domains/target.md) | target 등록·cluster·agent policy 라우터, `AgentConnectedBody`, evidence job 상태 상수 |
| import | `domains.mail` (identity 라우터 경유) | [../../domains/mail.md](../domains/mail.md) | `EmailVerificationRequestedBody` 발행 |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `Auth`/`Redis`/`CommandStatus` 상수, `env`, 로깅 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | gateway routes/requests/responses/fields, `ServiceRole`, `UserStatus`, `DEFAULT_WORKSPACE_ID`, `SessionStore`/`UserStore` 프로토콜 |
| import | `packages.events` | [../../packages/events.md](../packages/events.md) | `NatsEventBus` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `FastApiService`, `ApiEventGateway`, metrics 렌더러 |
| import | `packages.storage` | [../../packages/storage.md](../packages/storage.md) | `Database`, `unit_of_work_or_null`, `RedisSessionStore`, `AuthSession`, `RateLimitExceeded` |
| import | `packages.runtime.command_wakeup` | [../../packages/runtime.md](../packages/runtime.md) | `WAKEUP`(command 롱폴 LISTEN/NOTIFY 웨이크업) lifespan start/stop |
| 외부 | PostgreSQL | — | 도메인 테이블·outbox·dead letter·처리대장 (+`COMMAND_NOTIFY_DATABASE_URL` 직결 LISTEN) |
| 외부 | Redis | — | 세션·레이트리밋·이메일 인증 토큰 |
| 외부 | NATS JetStream | — | startup 연결 확인과 직접 publish 경로의 발행 대상. outbox 발행 루프는 [outbox-relay](gateway-outbox-relay.md)가 담당 |
| 외부 | console (httpx) | — | 프론트 정적 자산 프록시(`CONSOLE_ORIGIN`) |
| 외부 | realtime-gateway (websockets) | [realtime-realtime-gateway.md](realtime-realtime-gateway.md) | `/api/live/*` WebSocket 중계(`REALTIME_ORIGIN`) |

## 공개 인터페이스 (Public API)

### 모듈 구성

| 모듈 | 역할 |
|---|---|
| `src/services/gateway/api-gateway/app.py` | 진입점 — `FastApiService(Settings.SERVICE_NAME, create_app).run()` |
| `src/services/gateway/api-gateway/gateway.py` | `ApiGateway` 조립(라우터 등록·lifespan·metrics·오류 핸들러) |
| `src/services/gateway/api-gateway/auth.py` | 세션/패스워드 인증 서비스 |
| `src/services/gateway/api-gateway/passwords.py` | PBKDF2 해시·이메일 정규화 |
| `src/services/gateway/api-gateway/rate_limits.py` | 인증 남용(escalating) 레이트리밋 정책 |
| `src/services/gateway/api-gateway/settings.py` | `Settings` 상수/env 키 |

### app.py

- `src/services/gateway/api-gateway/app.py :: main` — `FastApiService` 로 uvicorn 서빙(`PORT` env, 기본 8000).

### gateway.py

- `src/services/gateway/api-gateway/gateway.py :: ApiGateway` — 생성자에서 `Database()`, event bus, `ApiEventGateway(bus, db, "api-gateway")`, session store, `SessionAuthService`, `PasswordAuthService`, `FastAPI(title, version, lifespan)` 를 만들고 CORS 설정 후 라우트 등록. bus/session 미주입 시 기존 `NatsEventBus`/`RedisSessionStore`, OSS composition root에서는 shared bus/`MemorySessionStore`를 명시 주입한다. 공유 객체는 `app.state.db / app.state.events / app.state.auth / app.state.password_auth` 에 DI.
  - `ApiGateway._configure_cors(app)` — `CORS_ALLOW_ORIGINS`(콤마 구분, 기본 로컬 dev origin 4종) 파싱 후 `CORSMiddleware(allow_credentials=True, allow_methods=["*"], allow_headers=["*"])` 추가. origin 목록이 비면 미들웨어 자체를 추가하지 않음.
  - `ApiGateway._session_store_config()` — `RedisSessionStoreConfig` 구성(아래 [설정](#설정-settings)의 세션 항목 참조).
  - `ApiGateway.lifespan(_app)` — `wait_for_database(db)` → `sessions.connect()` → `bus.connect()`. `COMMAND_NOTIFY_DATABASE_URL`이 있으면 `WAKEUP.start(url)`로 command long-poll 전용 LISTEN 연결을 연다. 종료 시 `WAKEUP.stop()` → `bus.close()` → `sessions.close()` → `db.dispose_async()` → `db.dispose()`.
  - `ApiGateway.configure_routes()` — 라우터 등록 순서: frontend proxy(미들웨어) → health → identity → alert channels → providers → catalog → ai → identity_admin → repository discovery → applications → target → gitops → approval → ingest(`/agent/connect`) → inventory → rca → command → dashboard → fleet → live proxy(WS) → dead-letter → metrics → 전역 오류 핸들러.
  - `ApiGateway._register_frontend_proxy(app)` — `@app.middleware("http")`: 경로가 `/api` 또는 `/api/*` 면 prefix 를 벗겨(`request.scope["path"]` 재작성) 인프로세스 라우터로 통과, `_is_frontend_request`(GET/HEAD 이면서 `/assets/*`·`/favicon.ico`·`/manifest.webmanifest` 또는 `Accept: text/html`)면 `_proxy_console` 로 콘솔 정적 자산을 프록시(httpx, hop-by-hop 헤더 제거, 실패 시 502 `"frontend unavailable"` + `frontend_proxy_error` 로그). 그 외는 그대로 통과.
  - `ApiGateway._register_live_proxy_routes(app)` — `@app.websocket("/api/live/{path:path}")`: `REALTIME_ORIGIN` 의 `/live/{path}` 로 접속(구독 query string 그대로 전달 — 유실 시 기본 workspace 로만 붙어 이벤트가 비어 보임), `cookie`/`authorization`/`x-session-token` 헤더 승계 후 `_bridge_websocket` 로 양방향 중계. 업스트림 실패는 `live_proxy_error` 로그 후 1011 종료.
- `src/services/gateway/api-gateway/gateway.py :: agent_connected_body_from_request(payload, identity)` — `AgentConnectRequest` 의 `cluster_id` 를 버리고 인증 identity 의 `cluster_id`/`workspace_id` 를 권위값으로 채운 `AgentConnectedBody` 생성.
- `src/services/gateway/api-gateway/gateway.py :: create_app` — optional `event_bus`/`session_store`를 `ApiGateway`에 전달하고 `.app` 반환(테스트·uvicorn factory·OSS composition 공용).

### auth.py

- `src/services/gateway/api-gateway/auth.py :: EmailVerificationChallenge` — frozen dataclass `(user_id, email, token, expires_in_seconds)`.
- `src/services/gateway/api-gateway/auth.py :: EmailVerificationResult` — frozen dataclass `(user_id, status, roles, workspace_id | None, session: AuthSession | None)`.
- `src/services/gateway/api-gateway/auth.py :: extract_session_token(request)` — 세션 토큰 추출 우선순위: ① `Authorization: Bearer <token>`(대소문자 무시) → ② `x-session-token` 헤더 → ③ `service_session` 쿠키(`Auth.SESSION_COOKIE_NAME`) → 없으면 `None`.
- `src/services/gateway/api-gateway/auth.py :: SessionAuthService` — `require_session(request) -> AuthSession`: 토큰 추출 → `sessions.get_session` (없으면 401 `"authentication required"`) → `sessions.check_rate_limit(user_id)` (초과 시 429 `"rate limit exceeded"`).
- `src/services/gateway/api-gateway/auth.py :: PasswordAuthService`
  - `signup(email, password, password_confirm, client_key) -> EmailVerificationChallenge`
  - `login(email, password) -> AuthSession`
  - `resend_email_verification(email, password, client_key) -> EmailVerificationChallenge | None`
  - `verify_email(token) -> EmailVerificationResult`
  - `approve_user(user_id, workspace_id) -> dict`
  - `logout(token | None) -> None` — 토큰 있으면 `sessions.delete_session`.
- `src/services/gateway/api-gateway/auth.py :: user_id_from_record(user)` — `user_id` 없으면 `id` 사용.
- `src/services/gateway/api-gateway/auth.py :: roles_from_record(user)` — `role` 컬럼(기본 `user`)을 단일 원소 리스트로.
- `src/services/gateway/api-gateway/auth.py :: workspace_id_from_record(user)` — falsy 면 `None`.

### passwords.py

- `src/services/gateway/api-gateway/passwords.py :: PASSWORD_HASH_ALGORITHM` = `"pbkdf2_sha256"`, `PASSWORD_HASH_NAME` = `"sha256"`, `PASSWORD_HASH_ITERATIONS` = `260000`, `PASSWORD_SALT_BYTES` = `16`.
- `src/services/gateway/api-gateway/passwords.py :: hash_password(password)` — 랜덤 16바이트 salt + PBKDF2-HMAC-SHA256 260,000회. 저장 형식: `pbkdf2_sha256$<iterations>$<urlsafe_b64(salt)>$<urlsafe_b64(digest)>` (b64 패딩 `=` 제거).
- `src/services/gateway/api-gateway/passwords.py :: verify_password(password, password_hash)` — `$` 3분할 파싱, 알고리즘 불일치/파싱 실패(`binascii.Error`, `TypeError`, `ValueError`)는 `False`. 비교는 `hmac.compare_digest`(timing-safe).
- `src/services/gateway/api-gateway/passwords.py :: normalize_email(email)` — `strip().lower()`.
- `src/services/gateway/api-gateway/passwords.py :: default_display_name(email)` — `@` 앞부분.

### rate_limits.py

- `src/services/gateway/api-gateway/rate_limits.py :: AuthRateLimitPolicy` — frozen dataclass `(scope, email_limit, client_limit, window_seconds, lock_steps_seconds: tuple[int, ...], strike_ttl_seconds)`.
  - `email_key(email)` = `auth:{scope}:email:{sha256(normalize_email(email))}`
  - `client_key(client_key)` = `auth:{scope}:client:{sha256(client_key)}`
- `src/services/gateway/api-gateway/rate_limits.py :: AuthRateLimiter` — `check(policy, email, client_key)`: 이메일 키·클라이언트 키 각각 `SessionStore.check_escalating_rate_limit(...)` 호출, `RateLimitExceeded` 는 429 로 변환.
- `src/services/gateway/api-gateway/rate_limits.py :: signup_rate_limit_policy()` — scope `"signup"`, email 한도 `SIGNUP_EMAIL_RATE_LIMIT`, client 한도 `SIGNUP_IP_RATE_LIMIT`.
- `src/services/gateway/api-gateway/rate_limits.py :: resend_verification_rate_limit_policy()` — scope `"resend"`, 한도는 signup 과 동일 값 재사용.
- `src/services/gateway/api-gateway/rate_limits.py :: stable_rate_key(value)` — SHA-256 hex(레이트리밋 키에 원문 이메일/IP 를 남기지 않음).

## 엔드포인트 표 (Routing)

프록시 아님 — 모든 경로는 인프로세스 도메인 라우터가 처리한다. "대상"은 처리 핸들러의 코드 앵커. 인증 열: `공개`(가드 없음) / `세션`(`require_session`) / `admin`(`require_admin_session` = `service_admin` 역할) / `agent`(`require_cluster_agent` = `x-agent-token`) / `HMAC`(GitHub 서명).

### gateway 직접 등록 (`gateway.py`)

| 메서드 | 경로 | 대상 | 인증 | 권한 |
|---|---|---|---|---|
| GET | `/healthz` | `gateway.py :: ApiGateway._register_health_routes` | 공개 | — |
| GET | `/readyz` | 〃 (`db.check_ready()` 만 수행, DDL 없음) | 공개 | — |
| POST | `/agent/connect` | `gateway.py :: ApiGateway._register_ingest_routes` | agent | 토큰 identity 의 cluster/workspace 만 |
| GET | `/dead-letters` | `gateway.py :: ApiGateway._register_dead_letter_routes` | 세션 | admin (전 테넌트 노출이므로) |
| POST | `/dead-letters/{dead_letter_id}/replay` | 〃 | 세션 | admin |
| GET | `/metrics` | `gateway.py :: ApiGateway._register_metrics_routes` | `METRICS_TOKEN` 설정 시 Bearer(compare_digest), 미설정 시 공개 | — |
| GET/HEAD | (콘솔 자산 — `/assets/*` 등) | `gateway.py :: ApiGateway._register_frontend_proxy` | 공개(콘솔 upstream 프록시) | — |
| WS | `/api/live/{path}` | `gateway.py :: ApiGateway._register_live_proxy_routes` | 인증 헤더/쿠키를 realtime-gateway 로 승계 | — |

### identity (`src/domains/identity/router.py`)

| 메서드 | 경로 | 대상 | 인증 | 권한 |
|---|---|---|---|---|
| GET | `/auth/session` | `src/domains/identity/router.py :: session` | 세션 | — |
| POST | `/auth/check-email` | `src/domains/identity/router.py :: check_email` | 공개 | 이메일+client rate limit |
| POST | `/auth/signup` | `src/domains/identity/router.py :: signup` | 공개 | escalating 레이트리밋(email+client) |
| POST | `/auth/resend-verification` | `src/domains/identity/router.py :: resend_verification` | 공개(이메일+패스워드 검증) | escalating 레이트리밋 |
| POST | `/auth/login` | `src/domains/identity/router.py :: login` | 공개 | — |
| GET | `/auth/verify-email` | `src/domains/identity/router.py :: verify_email` | 공개(`token` 쿼리) | — (303 redirect) |
| POST | `/auth/users/{user_id}/approve` | `src/domains/identity/router.py :: approve_user` | 세션 | admin |
| POST | `/auth/logout` | `src/domains/identity/router.py :: logout` | 세션 | — |

### identity admin 콘솔 (`src/domains/identity/admin_router.py`)

| 메서드 | 경로 | 인증 | 권한 |
|---|---|---|---|
| GET/POST | `/orgs` | 세션 | admin |
| DELETE | `/orgs/{org_id}` (204) | 세션 | admin |
| GET/POST | `/groups` | 세션 | admin |
| GET | `/groups/{group_id}/members` | 세션 | admin |
| PUT | `/groups/{group_id}/members/{user_id}` | 세션 | admin |
| DELETE | `/groups/{group_id}/members/{user_id}` (204) | 세션 | admin |
| GET | `/users` | 세션 | admin |
| GET | `/access` | 세션 | — |
| POST | `/access` | 세션 | admin |
| DELETE | `/access/{access_id}` (204) | 세션 | admin |

### alert channels / providers / catalog / ai / applications

| 메서드 | 경로 | 인증 | 권한 |
|---|---|---|---|
| GET | `/alert-channels` | 세션 | admin |
| POST | `/alert-channels` | 세션 | admin |
| POST | `/alert-channels/test` | 세션 | admin |
| DELETE | `/alert-channels/{channel_id}` (204) | 세션 | admin |
| GET | `/providers/catalog` | admin | — |
| GET | `/providers/cluster-discovery` | admin | — |
| POST | `/providers/validate` | admin | — |
| GET | `/catalog/items` · `/catalog/items/{item_id}` | 세션 | — |
| POST | `/catalog/items/{item_id}/installs` (202) | 세션 | `DEPLOY_RUN`; 필수 idempotency key, online target Agent, management readonly |
| POST/GET | `/ai/conversations` | 세션 | — |
| GET | `/ai/conversations/{conversation_id}` | 세션 | — |
| DELETE | `/ai/conversations/{conversation_id}` (204) | 세션 | — |
| POST | `/ai/conversations/{conversation_id}/messages` | 세션 | — |
| POST | `/repositories/discovery/probe` | 세션 | `require_repository_discovery_access`; 하나 이상의 concrete target `DEPLOY_RUN` |
| GET | `/repositories/discovery/branches` | 세션 | `require_repository_discovery_access`; 하나 이상의 concrete target `DEPLOY_RUN` |
| POST | `/repositories/discovery/manifests` | 세션 | `require_repository_discovery_access`; 하나 이상의 concrete target `DEPLOY_RUN` |
| POST | `/repositories/discovery/validate` | 세션 | `require_repository_discovery_access`; 하나 이상의 concrete target `DEPLOY_RUN` |
| GET/POST | `/applications` | 세션 | GET은 application read + inventory read scope, POST는 기존 mutation 계약 |
| POST | `/applications/connect` | 세션 | cluster `deploy.run` |
| GET | `/repositories/connection-status` | 세션 | 등록된 repository는 service admin 또는 연결 application 전체의 `APPLICATION_MANAGE` |
| GET | `/applications/{application_id}` | 세션 | application read; cluster evidence는 inventory read scope |
| GET/POST | `/applications/{application_id}/deployments` | 세션 | GET은 deployment read 배포 이력, POST는 application manage + cluster deploy binding |
| GET | `/applications/{application_id}/drift` | 세션 | application read; visible cluster의 저장 diff evidence |
| GET | `/applications/{application_id}/runs` | 세션 | application 접근 |

### target / clusters (`src/domains/target/router.py`, `router.include_router(agent_router)`)

| 메서드 | 경로 | 인증 | 권한 |
|---|---|---|---|
| POST | `/targets/preflight` | 세션 | admin |
| POST | `/targets` | 세션 | admin (`kubectl apply` 실행) |
| GET | `/install/{agent_token}` | 공개 URL + agent token 참조 | 토큰 해시가 등록된 target 만 |
| GET | `/clusters` | 세션 | — (접근 가능 cluster 필터) |
| GET | `/clusters/{cluster_id}` | 세션 | `require_cluster_access` |
| GET | `/clusters/{cluster_id}/connection-status` | 세션 | `require_cluster_access` |
| PUT | `/clusters/{cluster_id}/policy` | 세션 | admin |
| GET | `/clusters/{cluster_id}/scheduling-profiles` | 세션 | `require_cluster_access` |
| PUT | `/clusters/{cluster_id}/scheduling-profiles` | 세션 | admin |
| GET | `/agent/policy` | agent | 쿼리 `cluster_id` = 토큰 cluster (아니면 403) |
| POST | `/agent/policy/status` | agent | — |
| POST | `/agent/reconcile/status` | agent | — |
| POST | `/agent/evidence/jobs` | agent | — |
| GET | `/agent/evidence/jobs/poll` | agent | — (롱폴) |
| POST | `/agent/evidence/jobs/{job_id}/result` | agent | — |

### gitops / approval / inventory / rca

| 메서드 | 경로 | 인증 | 권한 |
|---|---|---|---|
| POST | `/github/webhook` | HMAC (`verify_github_signature` 라우터 의존성) | — |
| POST | `/approvals/{approval_id}/grant` | 세션 | `require_cluster_access`(deploy) |
| POST | `/approvals/{approval_id}/reject` | 세션 | `require_cluster_access`(deploy) |
| POST | `/agent/inventory/snapshots` | agent | — |
| GET | `/clusters/{cluster_id}/inventory/{resources,workloads,services,events,summary}` | 세션 | `require_cluster_access` |
| GET | `/clusters/{cluster_id}/usage` | 세션 | `require_cluster_access` |
| GET | `/metrics/history` | 세션 | Resources common filter + pinned snapshot에서 요청 pod ID 전부를 권한 교집합 재검증; batch only |
| POST | `/agent/evidence` | agent | evidence_key 를 토큰 cluster 로 스코핑 |
| POST | `/webhooks/alertmanager` | Bearer `ALERTMANAGER_WEBHOOK_TOKEN` | `cluster_id` 등록 확인 후 evidence 입구 |
| GET | `/evidence` | 세션 | 세션 workspace 범위 evidence query(`limit`/`offset`/`cursor`) |
| GET | `/rca-reports` | 세션 | 세션 workspace 범위 RCA report query(`limit`/`offset`/`cursor`) |
| GET | `/rca/rules` | 세션 | 현재 로딩된 RCA rule catalog 확인 |
| POST | `/rca/rules/validate` | 세션 | RCA 룰 YAML 저장 전 검증 |
| POST | `/rca/recovery-plans/{plan_id}/actions/{action_id}/select` | 세션 | `require_cluster_access` |

### command / dashboard (`src/domains/command/router.py`, `router.include_router(agent_router)`)

| 메서드 | 경로 | 인증 | 권한 |
|---|---|---|---|
| POST | `/commands` | 세션 | `require_cluster_access`(deploy) + `validate_control_namespace`(허용목록 밖 422) |
| GET | `/commands/{command_id}` | 세션 | cluster read 접근 — 콘솔이 명령 상태·agent 실측 결과 폴링(`get_agent_command`, 없으면 404) |
| POST | `/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale` | 세션 | deploy 접근 + `validate_control_namespace` |
| POST | `/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart` | 세션 | deploy 접근 + `validate_control_namespace` |
| POST | `/agent/debug/query` | 세션 | cluster read 접근 |
| GET | `/agent/commands/poll` | agent | 토큰 identity 의 cluster 만 롱폴 |
| POST | `/agent/commands/{command_id}/start` | agent | — |
| POST | `/agent/commands/{command_id}/heartbeat` | agent | — |
| POST | `/agent/commands/{command_id}/result` | agent | — |
| GET | `/dashboard/rca/timeline` | 세션 | cluster read 필터 |
| GET | `/dashboard/rca/incidents/{incident_id}` | 세션 | cluster read 필터 |
| POST | `/metrics/validate` | 세션 + cluster `evidence.read` | `telemetry.query.run` agent PromQL 검증 접수(202) |
| GET | `/fleet/summary` | 세션 | `accessible_resource_ids`(cluster read)로 클러스터 필터 — `src/domains/dashboard/fleet_router.py :: fleet_summary` |
| GET | `/clusters/{cluster_id}/summary` | 세션 | cluster read 접근 — `src/domains/dashboard/fleet_router.py :: cluster_summary_detail` |

## 데이터 모델 (Data Model)

이 서비스는 자체 테이블이 없다. `Database`(도메인 리포지토리 합성)를 통해 outbox/dead letter/처리대장/도메인 테이블에 접근한다. 세션·레이트리밋·이메일 인증 토큰은 Redis 키:

| Redis 키 | 값 | TTL |
|---|---|---|
| `session:<token>` | JSON `{user_id, roles, workspace_id}` | `SESSION_TTL_SECONDS`(기본 86400) |
| `rate:authenticated:read:session:<token_sha256>` | 인증 후 GET/HEAD/OPTIONS 카운터 | `AUTHENTICATED_READ_RATE_WINDOW_SECONDS`(기본 60) |
| `rate:authenticated:mutation:session:<token_sha256>` | 인증 후 변경 요청의 세션 카운터 | `AUTHENTICATED_MUTATION_RATE_WINDOW_SECONDS`(기본 60) |
| `rate:authenticated:mutation:user:<user_id_sha256>` | 인증 후 변경 요청의 사용자 합산 카운터 | `AUTHENTICATED_MUTATION_RATE_WINDOW_SECONDS`(기본 60) |
| `rate:count:auth:<scope>:{email,client}:<sha256>` | 시도 카운터 | `AUTH_ABUSE_RATE_WINDOW_SECONDS`(기본 900) |
| `rate:strike:auth:...` | 스트라이크 카운터 | `AUTH_ABUSE_STRIKE_TTL_SECONDS`(기본 86400) |
| `rate:lock:auth:...` | 잠금 표식(값=스트라이크 수) | 1·2·3차 잠금 초 |
| `email_verify:<token>` | JSON `{user_id, email}` | `EMAIL_VERIFICATION_TTL_SECONDS`(기본 3600), GETDEL 로 1회 소비 |

## 이벤트 (Events)

발행만 하고 구독하지 않는다. 모든 HTTP 발행은 `ApiEventGateway.accept/accept_body` 를 거쳐 **outbox 스테이징**(`unit_of_work` + `stage_events`) 후 [outbox-relay](gateway-outbox-relay.md)가 NATS 로 발행한다.

| 이벤트 | subject | 발행 시점 |
|---|---|---|
| `AgentConnectedBody` | `agent.connected` | `POST /agent/connect` — `save_cluster_agent_status` 와 같은 트랜잭션 |
| `EmailVerificationRequestedBody` | `mail.email_verification.requested` | signup / resend-verification 성공 시 (`_request_email_verification`) |
| `ClusterEvidenceReceivedBody` | `cluster.evidence.received` | `POST /webhooks/alertmanager` 또는 RCA evidence 라우터 — Alertmanager firing 알림을 evidence payload로 변환 |
| (임의 원본 subject) | dead letter 의 `original_subject` | `POST /dead-letters/{id}/replay` — `status=open` 인 DLQ만 원본 payload·correlation_id·`original_event_id`(causation) 로 재발행 |
| 도메인 라우터 발행 이벤트 | `git.webhook.received`, `command.requested`, `cluster.evidence.received`, `ai.message.received`, `approval.granted/rejected` 등 | 각 도메인 스펙 참조 |

## 동작 (Behavior)

### 부팅과 미들웨어 순서

1. `main()` → `FastApiService("api-gateway", create_app)` → uvicorn(`0.0.0.0:$PORT`, 기본 8000).
2. 미들웨어는 **frontend proxy**(`/api` prefix 제거 + 콘솔 자산 프록시)와 **CORSMiddleware**(조건부) 둘. 그 외 cross-cutting 은 ① FastAPI `Depends` 가드(라우트 단위 인증/인가), ② 전역 `@app.exception_handler(Exception)`(모든 미처리 예외 → 500 `{"error": "internal server error"}` + `gateway_unhandled_error` 로그)로 처리한다.
3. lifespan: DB 대기 → Redis 연결 → NATS 연결 → `COMMAND_NOTIFY_DATABASE_URL`이 설정된 경우 command wakeup listener. outbox relay 루프는 별도 `outbox-relay` 서비스가 실행한다.

### 인증 흐름 (상태 머신)

사용자 상태: `pending_email_verification` → (`verify-email`) → `active` 또는 `pending_approval` → (`approve`) → `active`.

1. **signup** — escalating 레이트리밋 검사(이메일별 3회/IP별 20회, 15분 창) → `password != password_confirm` 이면 400 → 이메일 정규화 후 중복이면 409 → `create_user(status=pending_email_verification, role=user)`(경합 시 None → 409) → Redis 에 이메일 인증 토큰(32바이트, TTL 3600) 생성 → `mail.email_verification.requested` 발행. 인증 URL 은 `PUBLIC_BASE_URL` 이 있으면 `{base}/auth/verify-email?token=...`, 없으면 `request.url_for('verify_email')` 기반.
2. **verify-email** — 토큰을 `GETDEL` 로 1회 소비(무효/만료 400) → `complete_email_verification` → 상태가 `active` 면 세션 생성 + `service_session` httpOnly 쿠키 설정 후 `redirect`(open-redirect 방지: `/` 시작·`//`·`://` 금지, 기본 `/login?verified=1`)로 303. `pending_approval` 이면 쿠키 없이 `/login?verified=1&approval=pending` 으로 303.
3. **login** — 사용자 없음 401 / `pending_email_verification` 403 `"email verification required"` / `pending_approval` 403 `"account approval required"` / 그 외 비-active 401 / 패스워드 불일치 401(모두 `"invalid email or password"` 로 통일해 사용자 존재 노출 최소화, 상태 코드는 구분됨) → `create_session(user_id, roles, workspace_id or 기본 워크스페이스)` → 응답 본문에는 토큰을 싣지 않고 httpOnly 쿠키(`secure=COOKIE_SECURE!=0`, `samesite=lax`, `max_age=SESSION_TTL`)로만 전달.
4. **세션 요구 라우트** — `extract_session_token`(Bearer → `x-session-token` → 쿠키 순) → Redis 조회 → 사용자별 공통 레이트리밋(기본 120회/60초) 검사.
5. **logout** — 세션 삭제 + 쿠키 삭제.
6. **클라이언트 키** — `_client_key`: `TRUST_PROXY=1` 일 때만 `X-Forwarded-For` 첫 항목 신뢰, 아니면 소켓 peer IP(스푸핑 우회 방지).

### 레이트리밋 3층

| 층 | 대상 | 메커니즘 |
|---|---|---|
| 세션 공통 | 인증된 사용자당 | 고정 윈도 INCR (기본 120회/60초) → 429 |
| 인증 남용(signup/resend) | 이메일 해시·클라이언트 해시 각각 | escalating: 윈도 내 한도 초과 → 스트라이크 증가 → 잠금 900s/3600s/86400s (스트라이크 TTL 86400s). 잠금 중 재시도는 TTL 을 retry_after 로 429 |
| /metrics | 토큰 | `METRICS_TOKEN` 설정 시 Bearer 강제 |

### dead letter replay 원자성

replay 이벤트의 outbox 스테이징과 `mark_dead_letter_replayed`(열린 행만 원자 UPDATE)를 한 트랜잭션(`unit_of_work_or_null`)으로 묶는다 — 동시 replay 는 첫 요청만 통과하고 진 요청의 스테이징은 롤백(이중 재발행 방지). `status != open` 이면 409와 `"dead letter is not open"`을 반환한다.

### /metrics 산출 항목

scalar: `event_dead_letters_open_total`, `outbox_pending_total`, `command_queue_oldest_age_seconds`(QUEUED), `command_leased_oldest_age_seconds`(LEASED), `evidence_job_queue_oldest_age_seconds`, `evidence_job_leased_oldest_age_seconds`. labeled counter: `event_processing_status_total{status}`, `command_status_total{status}`, `evidence_job_status_total{status}`. media type `text/plain; version=0.0.4`.

## 불변식·오류 (Invariants & Errors)

- agent 라우트의 `workspace_id`/`cluster_id` 는 **항상 토큰 identity 가 권위** — 요청 body 값은 신뢰하지 않는다(크로스 테넌트 차단).
- 세션 토큰·metrics 토큰 비교는 timing-safe(`hmac.compare_digest`/`secrets.compare_digest`).
- 패스워드 해시 형식/알고리즘 불일치는 예외 없이 `False`(fail-closed).
- 이메일 인증 토큰은 1회용(GETDEL).
- dead letter 조회/재발행은 admin 전용 — 임의 이벤트 재발행 권한이기 때문.
- 제어(쓰기) 명령 라우트는 `validate_control_namespace`(`src/domains/command/router.py :: validate_control_namespace`)로 [config control 허용목록](../packages/config.md)을 검사 — 허용목록 밖 네임스페이스는 422 `"namespace is not allowed by control policy"`. `management` 네임스페이스는 보호 네임스페이스라 env allowlist에 있어도 항상 제거된다.
- `limit` 쿼리는 `1..MAX_DEAD_LETTER_LIMIT(100)` 로 클램프.
- HTTP 오류 코드: 400(확인 불일치/무효 토큰), 401(자격/세션/agent 토큰), 403(이메일 미인증·승인 대기·admin/리소스 권한), 404(user/dead letter/command), 409(중복 가입/replay 경합), 429(레이트리밋), 500(전역 핸들러).

## 설정 (Settings)

`src/services/gateway/api-gateway/settings.py :: Settings` — env 는 import 시 1회 평가.

| 환경변수 / 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `SERVICE_NAME` (상수) | str | `api-gateway` | 서비스 이름·outbox source |
| `APP_TITLE` / `APP_VERSION` (상수) | str | `API Gateway` / `0.1.0` | FastAPI 메타 |
| `PORT` | int | `8000` | HTTP 포트 (`FastApiService`) |
| `CONSOLE_ORIGIN` | str | `http://console-dev.management.svc.cluster.local:80` | 콘솔 정적 자산 프록시 upstream (`console-dev`가 현재 Service 정본) |
| `REALTIME_ORIGIN` | str | `ws://realtime-gateway.management.svc.cluster.local:8000` | `/api/live/*` WS 중계 upstream |
| `FRONTEND_PROXY_TIMEOUT_SECONDS` (상수) | float | `10.0` | 콘솔 프록시 httpx 타임아웃 |
| `COMMAND_NOTIFY_DATABASE_URL` | str | 미설정 | 설정 시 lifespan 이 command 롱폴 웨이크업용 Postgres LISTEN 직결 연결(`WAKEUP.start`)을 연다 |
| `CORS_ALLOW_ORIGINS` | csv | `http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173` | 쿠키 인증 허용 origin |
| `REDIS_URL` | str | `redis://redis:6379/0` | 세션 스토어 |
| `SESSION_TTL_SECONDS` | int | `86400` | 세션·쿠키 TTL |
| `AUTH_ABUSE_RATE_WINDOW_SECONDS` | int | `900` | 인증 남용 계수 윈도 |
| `AUTH_ABUSE_FIRST_LOCK_SECONDS` | int | `900` | 1차 잠금 |
| `AUTH_ABUSE_SECOND_LOCK_SECONDS` | int | `3600` | 2차 잠금 |
| `AUTH_ABUSE_THIRD_LOCK_SECONDS` | int | `86400` | 3차 잠금 |
| `AUTH_ABUSE_STRIKE_TTL_SECONDS` | int | `86400` | 스트라이크 TTL |
| `SIGNUP_EMAIL_RATE_LIMIT` | int | `3` | 가입 이메일별 한도 (resend 도 동일값) |
| `SIGNUP_IP_RATE_LIMIT` | int | `20` | 가입 클라이언트별 한도 (resend 도 동일값) |
| `EMAIL_VERIFICATION_TTL_SECONDS` | int | `3600` | 인증 토큰 TTL |
| `DEFAULT_RATE_LIMIT` | int | `120` | 세션 공통 레이트리밋 횟수 |
| `RATE_LIMIT_WINDOW_SECONDS` | int | `60` | 세션 공통 레이트리밋 윈도 |
| `AUTHENTICATED_READ_RATE_LIMIT` | int | `600` | 세션별 읽기 요청 허용량. 초기 셨·자원 상세 병렬 조회 burst를 수용 |
| `AUTHENTICATED_READ_RATE_WINDOW_SECONDS` | int | `60` | 세션별 읽기 요청 윈도 |
| `AUTHENTICATED_MUTATION_SESSION_RATE_LIMIT` | int | `30` | 세션별 변경 요청 허용량 |
| `AUTHENTICATED_MUTATION_USER_RATE_LIMIT` | int | `60` | 여러 세션을 합산한 사용자별 변경 요청 허용량 |
| `AUTHENTICATED_MUTATION_RATE_WINDOW_SECONDS` | int | `60` | 세션·사용자 변경 요청 윈도 |
| `METRICS_TOKEN` | str | `""` | 설정 시 `/metrics` Bearer 강제 |
| `SESSION_TOKEN_BYTES` / `EMAIL_VERIFICATION_TOKEN_BYTES` (상수) | int | `32` | 토큰 엔트로피 |
| `SESSION_KEY_PREFIX` / `RATE_LIMIT_KEY_PREFIX` / `EMAIL_VERIFICATION_KEY_PREFIX` (상수) | str | `session` / `rate` / `email_verify` | Redis 키 프리픽스 |
| `AUTHORIZATION_HEADER` / `SESSION_TOKEN_HEADER` (상수) | str | `authorization` / `x-session-token` | 토큰 헤더 |
| `DEFAULT_DEAD_LETTER_LIMIT` / `MAX_DEAD_LETTER_LIMIT` (상수) | int | `50` / `100` | dead letter 조회 한도 |
| `DEAD_LETTER_NOT_OPEN_MESSAGE` (상수) | str | `dead letter is not open` | replay 대상 DLQ가 `open`이 아닐 때 409 detail |
| identity 라우터: `PUBLIC_BASE_URL` | str | `""` | 인증 메일 링크 base URL |
| identity 라우터: `TRUST_PROXY` | str | `""` | `1` 이면 X-Forwarded-For 신뢰 |
| `COOKIE_SECURE` (`Auth.COOKIE_SECURE_ENV`) | str | `1` | `0` 이면 쿠키 secure 해제(로컬 http) |
