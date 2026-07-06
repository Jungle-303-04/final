---
source_commit: 1616d295
status: synced
---

# realtime-gateway — cluster-agent live stream 을 browser 로 fan-out 하는 WebSocket 게이트웨이

> 소스: `src/services/realtime/realtime-gateway/` · 테스트: `tests/test_realtime_gateway.py`, `tests/test_realtime_hub.py`, `tests/test_realtime_contracts.py`, `tests/test_live_summary.py`

## 책임 (Responsibility)

- 경로: cluster-agent --(outbound WS `/live/agent`)--> hub cache --(WS `/live/browser`)--> browser.
- 클러스터당 agent 연결 1개를 받아 최신 상태(cluster 요약 + 리소스 델타)를 메모리에 캐시하고, 구독 필터에 맞는 browser 들에게 즉시 fan-out 한다.
- 하지 않는 것: node-collector 수용(`/metrics` 는 Prometheus scrape 경로 유지), 이벤트 버스 발행/구독, 영속 저장(순수 인메모리 — 재시작 시 agent 재연결로 복구).
- SSE 는 없다 — 프로토콜은 WebSocket + JSON 메시지(`realtime.v1`)뿐.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity` | [../../domains/identity.md](../domains/identity.md) | `AGENT_TOKEN_HEADER`(`x-agent-token`), `hash_agent_token`(SHA-256) |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `packages.contracts.realtime`(경로·메시지 계약), `Gateway` 필드명, `ServiceRole`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `Auth`/`Redis` 상수, `env`, 로깅 |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `FastApiService` |
| import | `packages.storage` | [../../packages/storage.md](../packages/storage.md) | `Database.authenticate_cluster_agent`, `RedisSessionStore`(browser 세션) |
| 외부 | PostgreSQL | — | agent 토큰 해시 조회(등록 레지스트리) |
| 외부 | Redis | — | browser 세션 조회(api-gateway 가 만든 세션 재사용) |

## 공개 인터페이스 (Public API)

### app.py

- `src/services/realtime/realtime-gateway/app.py :: GATEWAY_NAME` = `"realtime-gateway"`.
- `src/services/realtime/realtime-gateway/app.py :: BROWSER_PING_INTERVAL_SECONDS` = `15.0` — 보낼 것이 없을 때 keepalive ping 주기.
- close code 상수: `CLOSE_BAD_REQUEST = 4400`, `CLOSE_UNAUTHORIZED = 4401`, `CLOSE_PROTOCOL_VIOLATION = 1008`.
- 타입 별칭: `AgentAuthenticator = Callable[[str], Any]`(원문 토큰 → `{"workspace_id", "cluster_id"} | None`, fail-closed), `BrowserSessionAuthenticator = Callable[[str | None], Awaitable[Any]]`.
- 모듈 상수(세션 스토어 구성용, api-gateway 와 동일 값): `REDIS_URL_ENV="REDIS_URL"`, `SESSION_KEY_PREFIX="session"`, `RATE_LIMIT_KEY_PREFIX="rate"`, `EMAIL_VERIFICATION_KEY_PREFIX="email_verify"`, `SESSION_TOKEN_BYTES=32`, `EMAIL_VERIFICATION_TOKEN_BYTES=32`, `DEFAULT_RATE_LIMIT=120`, `RATE_LIMIT_WINDOW_SECONDS=60`, `EMAIL_VERIFICATION_TTL_SECONDS=3600`, `SESSION_TOKEN_HEADER="x-session-token"`, `AUTHORIZATION_HEADER="authorization"`, `BEARER_PREFIX="bearer "`.
- `src/services/realtime/realtime-gateway/app.py :: database_authenticator(db) -> AgentAuthenticator` — api-gateway 의 `require_cluster_agent` 와 동일 경로 재사용: 빈 토큰 → `None`, 아니면 `db.authenticate_cluster_agent(hash_agent_token(token))`.
- `src/services/realtime/realtime-gateway/app.py :: session_store_config() -> RedisSessionStoreConfig` — 위 상수 + `Auth.SESSION_TTL_ENV`(기본 86400)로 구성.
- `src/services/realtime/realtime-gateway/app.py :: redis_session_authenticator(session_store) -> BrowserSessionAuthenticator` — `session_store.get_session(token)` 래핑.
- `src/services/realtime/realtime-gateway/app.py :: create_app(db=None, authenticate_agent=None, authenticate_browser=None) -> FastAPI` — 인증기 미주입 시 DB/Redis 기본 구현 생성(테스트는 주입으로 대체). `app.state.hub = RealtimeHub()`. lifespan: `wait_for_database(db)`(db 있을 때) → browser 세션 스토어 `connect()`, 종료 시 `close()`.
- `src/services/realtime/realtime-gateway/app.py :: browser_session_token(websocket) -> str | None` — 추출 순서: `Authorization: Bearer` → `x-session-token` 헤더 → `service_session` 쿠키.
- `src/services/realtime/realtime-gateway/app.py :: session_workspace_id(session) -> str` — dict/객체 모두에서 `workspace_id` 추출, 없으면 `""`.
- `src/services/realtime/realtime-gateway/app.py :: main` — `FastApiService(GATEWAY_NAME, create_app).run()`.

### hub.py

- `src/services/realtime/realtime-gateway/hub.py :: BrowserClient` — `@dataclass(eq=False)`(연결 1개 = 객체 identity). 필드: `subscription: Subscription`, `queue: asyncio.Queue(maxsize=BROWSER_QUEUE_MAX=32)`, `dropped_messages: int = 0`.
- `src/services/realtime/realtime-gateway/hub.py :: RealtimeHub`
  - `seq` (property) — hub 전역 단조 증가 시퀀스.
  - `browser_count` (property).
  - `register_browser(subscription) -> BrowserClient` / `unregister_browser(client)`.
  - `snapshot_for(subscription) -> SnapshotMessage` — 구독 필터를 적용한 최신 상태 전체. `state = {"clusters": {cluster_id: LiveSummary...}, "resources": {key: value}}`.
  - `publish_summary(summary: LiveSummary) -> LiveSummaryMessage` — seq 증가, `_summaries[cluster_id]` 갱신, cluster 필터 일치 browser 에 offer.
  - `publish_delta(delta: ResourceDelta) -> ResourceDelta` — seq 증가, `op=="remove"` 면 `_resources` 에서 제거, 아니면 `value or {}` 저장. seq 를 갱신한 복사본을 필터 일치 browser 에 offer.

## 데이터 모델 (Data Model)

DB 테이블 없음. 인메모리 상태(`RealtimeHub`):

| 필드 | 타입 | 의미 |
|---|---|---|
| `_seq` | int | 전역 단조 증가. client 는 seq gap 을 snapshot 복구 신호로 사용 가능 |
| `_summaries` | dict[cluster_id, LiveSummary] | 클러스터별 최신 요약 |
| `_resources` | dict[key, dict] | 리소스별 최신 값. key = `"<cluster>/<namespace>/<kind>/<name>"` |
| `_browsers` | set[BrowserClient] | 접속 중 browser |

## 프로토콜 (WebSocket, `realtime.v1`)

메시지 계약은 `src/packages/contracts/realtime.py` 가 단일 출처(`parse_realtime_message` = `TypeAdapter` 검증, StrictModel — 계약 밖 필드는 즉시 실패). discriminator 는 `type`.

| type | 방향 | 스키마 |
|---|---|---|
| `hello` | gateway → agent/browser | `{type:"hello", protocol:"realtime.v1"}` — 연결 수락 직후 1회 |
| `snapshot` | gateway → browser | `{type:"snapshot", seq, state:{clusters, resources}}` — 접속 직후·overflow 복구 시 |
| `live.summary` | agent → gateway, gateway → browser | `{type:"live.summary", seq, cluster_id, summary: LiveSummary}` — seq 는 gateway 가 부여 |
| `resource.delta` | agent → gateway, gateway → browser | `{type:"resource.delta", seq, op:"replace"\|"remove", key, value?}` |
| `ping` | 양방향 keepalive | `{type:"ping", ts: float}` |

`LiveSummary` 상한(계약 강제): `window_ms ≤ 60000`, `hot_pods ≤ MAX_HOT_PODS(20)` — raw metric/전체 로그 금지.

### `/live/agent` (WS, `AGENT_LIVE_PATH`)

1. accept 후 `x-agent-token` 헤더 인증(해시 → DB). 실패 시 close `4401`.
2. 쿼리 `cluster_id` 가 있으면 토큰의 cluster 와 일치해야 함 — 불일치는 close `4401`(크로스 테넌트 발행 차단).
3. `hello` 송신 후 수신 루프. 수신 1건마다 `app.py :: _ingest` 판정:
   - 파싱 실패(`ValueError`) → close `1008`.
   - `ping` → 무시(유지).
   - `live.summary` → `message.cluster_id`·`summary.cluster_id` 둘 다 토큰 cluster 와 일치해야 `publish_summary`. 불일치 close `1008`.
   - `resource.delta` → `delta_key_parts(key)[0]`(cluster 조각) 일치 시 `publish_delta`. 불일치 close `1008`.
   - `hello`/`snapshot` 은 gateway→client 방향 전용 — agent 가 보내면 close `1008`.

### `/live/browser` (WS, `BROWSER_LIVE_PATH`)

1. accept 후 쿼리 파라미터를 `Subscription` 모델 필드명으로 수집(`workspace_id`, `cluster_id`, `namespace`, `app` — 빈 문자열 = 전체 허용). `workspace_id` 없으면 close `4400`.
2. `browser_session_token` 으로 세션 토큰 추출 → Redis 세션 조회. 세션 없음 또는 세션의 `workspace_id` ≠ 쿼리 `workspace_id` 면 close `4401`.
3. `hub.register_browser(subscription)` → 송신 태스크(`app.py :: _browser_send_loop`) 시작: `hello` → `snapshot_for(subscription)` → queue 소비. queue 가 15초간 비면 `ping(ts=time.time())` 송신.
4. 수신 루프는 내용을 쓰지 않지만 `receive_text()` 가 disconnect 감지의 유일한 수단. 종료 시 `unregister_browser` + 송신 태스크 취소.

### HTTP

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/healthz` | `"ok"` (PlainText) |
| GET | `/readyz` | `"ok"` (PlainText) |

## 이벤트 (Events)

NATS 이벤트 발행/구독 없음(이벤트 버스 밖의 실시간 사이드 채널).

## 동작 (Behavior)

### 구독 필터 매칭

- `hub.py :: _summary_matches` — summary 는 cluster 단위 정보라 cluster 필터만 적용: `subscription.cluster_id in ("", cluster_id)`.
- `hub.py :: _delta_matches` — key 를 `(cluster, namespace, kind, name)` 로 분해해 cluster·namespace 필터 적용. `subscription.app` 은 `value["app"]` 이 존재하고 다를 때만 제외(app 정보 없는 델타는 통과).

### 느린 browser 처리 (`RealtimeHub._offer`)

`put_nowait` 가 `QueueFull` 이면: `dropped_messages += qsize` → queue 전부 비움 → 그 client 의 구독 필터 기준 최신 `snapshot` 1개만 적재. 메모리 무한 증가 금지, client 는 snapshot 으로 상태 복구.

## 불변식·오류 (Invariants & Errors)

- cluster-agent 연결은 클러스터당 1개 전제 — browser 수와 무관하게 agent 부하 동일(fan-out 은 hub 책임).
- agent 는 자기 토큰의 cluster 에 대해서만 발행 가능(모든 ingest 에서 cluster 검증, fail-closed).
- browser 는 자기 세션 workspace 와 일치하는 `workspace_id` 구독만 가능.
- seq 는 hub 전역 단조 증가 — snapshot 포함 모든 송신 메시지에 실림.
- 수신 payload 검증은 전부 `parse_realtime_message`(수동 dict 검사 금지).
- close code: `4400` 필수 파라미터 누락 / `4401` 인증·인가 실패 / `1008` 프로토콜 위반.

## 설정 (Settings)

| 환경변수 / 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `PORT` | int | `8000` | HTTP/WS 포트 (`FastApiService`) |
| `REDIS_URL` | str | `redis://redis:6379/0` | browser 세션 조회용 Redis |
| `SESSION_TTL_SECONDS` | int | `86400` | 세션 스토어 구성값(조회 전용이지만 config 필수 필드) |
| `BROWSER_PING_INTERVAL_SECONDS` (상수) | float | `15.0` | browser keepalive 주기 |
| `BROWSER_QUEUE_MAX` (계약 상수) | int | `32` | browser 송신 queue 상한 |
