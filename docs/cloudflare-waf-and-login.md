# Cloudflare WAF 예외 규칙과 콘솔 로그인 점검

## 1. WAF 403 차단 문제 — `/api/agent/*`, `/api/github/webhook`

### 증상

Cloudflare 를 프록시로 둔 도메인에서 cluster-agent 폴링과 GitHub webhook 이 403 으로 차단된다. 두 경로의 클라이언트는 브라우저가 아니라서(쿠키·JS 챌린지 수행 불가) Bot Fight Mode / Managed Challenge / Managed Rules 에 걸린다.

### 애플리케이션 자체 인증 (우회해도 안전한 근거)

| 경로 | 인증 방식 | 코드 위치 |
| --- | --- | --- |
| `/api/agent/*` | per-cluster 토큰 헤더 `x-agent-token` — 해시를 DB 레지스트리와 대조 | `src/domains/identity/dependencies.py` (`AGENT_TOKEN_HEADER`, 해시 조회) |
| `/api/github/webhook` | HMAC 서명 검증 (`X-Hub-Signature-256`) — 라우터 단위 의존성 | `src/domains/gitops/router.py` (`verify_github_signature`) |

두 경로 모두 세션 쿠키를 쓰지 않고 자체 비밀로 검증하므로, WAF 챌린지를 건너뛰어도 무인증 접근은 애플리케이션 계층에서 거부된다. Gateway 자체 rate limit(Redis 기반)도 유지된다.

### Cloudflare 설정 (WAF Custom Rule — Skip)

Security → WAF → Custom rules 에 아래 규칙을 추가한다.

```text
Rule name : skip-machine-endpoints
Expression: (starts_with(http.request.uri.path, "/api/agent/")) or
            (http.request.uri.path eq "/api/github/webhook")
Action    : Skip
Skip 항목  : All managed rules, Bot Fight Mode, Browser Integrity Check
유지 항목  : Rate limiting rules, DDoS protection (Skip 대상에 넣지 않음)
```

주의사항: `/api/live/*`(WebSocket) 는 브라우저 클라이언트지만 업그레이드 요청이 챌린지에 걸리면 같은 방식으로 `Skip: Browser Integrity Check` 만 추가한다. Skip 범위는 필요 최소로 유지하고, 전체 `/api/*` 를 통째로 예외하지 않는다.

## 2. 로그인 직후 문제 점검 체크리스트

로그인은 성공 응답인데 바로 다음 요청부터 401/미인증이 되는 증상은 대부분 세션 쿠키가 브라우저에 저장되지 않은 것이다. 아래 순서로 점검한다.

### 2-1. COOKIE_SECURE (가장 흔한 원인)

세션 쿠키는 `Secure` 기본값으로 발급된다(`src/domains/identity/router.py`). **http 로 콘솔에 접속하면 브라우저가 Secure 쿠키를 버려서 로그인 직후 세션이 사라진다.**

- 로컬 kind(`scripts/up.sh`)는 configmap 에 `COOKIE_SECURE=0` 을 자동 패치한다.
- 다른 http 배포는 gateway env 에 `COOKIE_SECURE=0` 을 설정한다. `0/false/no/off` 모두 인정된다.
- Cloudflare/TLS 뒤에서는 반드시 기본값(Secure)을 유지한다.

### 2-2. 동일 origin 프록시 확인

콘솔 nginx 는 same-origin 리버스 프록시다 (`frontend/nginx.conf`): 브라우저는 콘솔 origin 하나만 보고 `/api/*` 가 gateway 로, `/api/live/*` 가 realtime-gateway 로 프록시된다. 이 구성에서는 CORS 가 개입하지 않는다. 프록시를 거치지 않고 브라우저가 gateway origin 을 직접 호출하는 구성(개발 서버 등)에서만 CORS 가 필요하다:

- `CORS_ALLOW_ORIGINS` 에 콘솔 origin 을 콤마 구분으로 명시 (기본값은 localhost:5173/4173).
- 쿠키 전송 때문에 `*` 는 불가 — gateway 가 `allow_credentials=True` 로 명시 origin 만 허용한다.
- 프런트는 `credentials: 'include'` 로 호출한다 (`frontend/src/shared/lib/api.ts` 반영됨).

### 2-3. 프런트 모드

`VITE_API_MODE` 기본값은 `mock` 이다. 실백엔드에 붙는 빌드는 `VITE_API_MODE=real` 로 빌드했는지 확인한다. mock 모드는 로그인이 항상 성공한 것처럼 보이므로 "로그인은 되는데 데이터가 이상함" 증상의 원인이 되기도 한다.

### 2-4. 계정 상태

- 이메일 미인증: `/auth/login` 전에 `/auth/verify-email` 완료 필요 (`mail-worker` 발송).
- 관리자 승인 대기: 인증 후에도 `approval=pending` 상태면 관리자(`/auth/users/{id}/approve`) 승인이 필요하다.

### 2-5. 세션 저장소

Redis 가 죽어 있으면 로그인 자체가 실패하거나 발급 즉시 세션 조회가 실패한다. `kubectl -n management get pods | grep redis`, gateway 로그의 Redis 연결 오류를 확인한다.

## 3. DATABASE_URL — PgBouncer 경유 기준

정상 구성은 모든 서비스가 `postgresql://…@pgbouncer:6432/…` 로 접속하는 것이다 (`scripts/up.sh`, `scripts/aws-up.sh` 기본값). 과거 secret 이 `postgresql:5432` 직결로 남아 있으면 아래로 복원한다.

```bash
MGMT_CONTEXT="<관리 클러스터 kube context>" bash scripts/restore-pgbouncer.sh
```

직결을 의도적으로 유지할 경우에만 pgbouncer Deployment/Service/secret(`pgbouncer-config`)을 제거해 혼선을 없앤다 — 기본 권장은 PgBouncer 경유다.
