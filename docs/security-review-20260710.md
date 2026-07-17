# 보안 분석 보고서 — SW_AI_W17-21-final (kubeheal)

작성일: 2026-07-10 (Asia/Seoul) · 범위: 백엔드(`src/`), 인프라/배포(`deploy/`, `infra/`, `config/`, `.github/`, `secrets/`), 프론트엔드(`frontend/`)
방식: **읽기 전용 감사. 코드는 일절 수정하지 않았다.** 아래 항목은 모두 실제 파일을 읽고 교차 검증한 결과다.

> 이 문서는 2026-07-10 시점의 감사 스냅샷이다. 아래 발견 당시 근거는 보존하되,
> 현재 완료 사실은 `HANDOVER.md`와 `current-service-state.md`를 우선한다.

## 후속 조치 상태 (2026-07-11)

이하 본문은 발견 당시 근거를 보존한 감사 스냅샷이다. 현재 `dev`에서는 다음 항목을 조치했다.

| 항목 | 현재 상태 | 구현 |
| --- | --- | --- |
| C1/H1 개발 인증 우회 | 해결 | 환경 기반 우회 코드 삭제 + Cloudflare mTLS 전용 개발 프록시 분리 |
| H2/L3 PromQL SSRF·오류 본문 | 해결 | 구형 gateway HTTP 검증 모듈·URL 계약 제거, explicit cluster RBAC 후 `telemetry.query.run`을 target agent에 큐잉 |
| M2 alert webhook SSRF | 해결 | HTTPS·공인 IP·DNS 전체 결과·allowlist 검증, 전송 직전 재검증, redirect 차단 |
| M3 `/metrics` 무인증 | 해결 | 환경과 무관하게 token 미설정 시 503, 설정 시 timing-safe Bearer 검증 |

사용자 세션과 Agent token은 현재 환경과 무관하게 검증한다. 사람용 무세션 개발 접근은
`dev-k8s.woonyong.org`의 client certificate + Tunnel + 내부 비밀 헤더 조합으로만 허용한다.
H3, M1, M4~M6, L1/L2/L4~L6는 별도 환경·프론트·인프라 작업 범위다.

## 요약

전반적인 보안 기초는 견고하다. 커밋된 시크릿·개인키 없음, 비밀번호는 PBKDF2(260k) + `compare_digest`, agent 토큰은 `secrets.token_urlsafe` 생성 후 DB에는 SHA-256 해시만 저장(HANDOVER §1.4 준수), SQL 인젝션·`yaml.load`·`pickle`·`verify=False`·`shell=True` 사용 없음, RBAC는 와일드카드 없는 최소 권한, Dockerfile은 non-root(`USER 10001`)로 하드닝돼 있다. 프론트엔드는 쿠키 인증 + 커스텀 CSRF 헤더 + open-redirect 방어가 갖춰져 있고 `dangerouslySetInnerHTML`/`eval` 등 XSS 싱크가 전무하다.

핵심 위험은 코드 자체가 아니라 **배포 매니페스트에 인증 우회가 켜진 채로 들어가 있다는 점**과 **인증 사용자에게 노출된 SSRF**다.

| 심각도 | 건수 | 항목 |
|---|---|---|
| Critical | 1 | C1 |
| High | 3 | H1, H2, H3 |
| Medium | 6 | M1~M6 |
| Low | 6 | L1~L6 |

---

## Critical

### C1 — 배포 매니페스트에 인증 우회(`APP_ENV=test`)가 하드코딩됨
- 파일: `deploy/management/services.yaml:68`(api-gateway), `:1188`(realtime-gateway)
- 근거: `config/env/app.env.example:8-9` 및 `src/packages/config/security.py:40-49`에서 `APP_ENV=test`이면 `development_security_bypass_enabled()`가 `True`가 되고, 게이트웨이의 `require_session`이 **자격증명 없이 SERVICE_ADMIN 세션을 발급**한다. 즉 세션·리소스 권한·agent 토큰 검증이 모두 fail-open된다.
- 영향: 인터넷에 노출되는 두 게이트웨이가 `APP_ENV: test`로 배포된다. 이 매니페스트가 공유/운영 클러스터에 적용되면 **누구나 관리 콘솔·target 클러스터 명령 경로에 무인증 접근**할 수 있다. 매니페스트 주석은 "운영 전환 시 production으로 바꾸라"고 안내하지만, 기본값이 위험 방향으로 열려 있어 설정 실수 한 번에 전면 우회가 된다.
- 권장(수정 아님, 제안): 배포 매니페스트의 `APP_ENV`를 `production`으로 두고 `test`는 kind/로컬 오버레이에만 남긴다. 나아가 `security.py`에서 `APP_ENV in {production, staging}`이면 우회 플래그를 무시하도록 **구조적으로 fail-closed** 처리(하단 H1 참조).

---

## High

### H1 — 개발 인증 우회가 prod/staging에서 구조적으로 차단되지 않음
- 파일: `src/packages/config/security.py:40-49`; 소비처 `src/services/gateway/api-gateway/auth.py:61-95`, `src/domains/identity/dependencies.py:127,179`
- 근거: `development_security_bypass_enabled()`는 `APP_ENV=test` **또는** `DEV_SECURITY_BYPASS` truthy면 `True`. `APP_ENV`가 production/staging일 때 우회를 거부하는 검사가 없다. "부재로 인한" fail-closed일 뿐 강제되지 않는다.
- 영향: `DEV_SECURITY_BYPASS=1` 또는 `DEV_AUTH_BYPASS=1`이 운영 ConfigMap에 남으면 전 요청이 서비스 관리자로 처리된다. HANDOVER §1.3 요구사항("prod/staging은 fail-closed")이 관례로만 지켜진다.
- 권장: `APP_ENV`가 `test`(또는 명시적 `dev`)가 아니면 플래그 무관하게 즉시 `False` 반환. 운영에서 우회 플래그가 설정돼 있으면 기동 실패 처리.

### H2 — 인증 사용자에게 노출된 SSRF (`base_url` 사용자 제어)
- 파일: `src/domains/dashboard/router.py:56-65` → `src/domains/dashboard/metrics_validation.py:25-56`; 스키마 `src/packages/contracts/gateway/requests.py:499`
- 근거: `POST …/metrics/validate`는 `require_session`(로그인만 하면 됨)으로만 보호되고, 사용자가 보낸 `payload.base_url`을 그대로 `httpx GET {base_url}/api/v1/query_range`에 사용한다. `base_url`은 스킴/호스트 검증 없는 자유 문자열(`max_length=500`)이며 리다이렉트 차단도 없다.
- 영향: 비관리자가 `http://169.254.169.254/...`(클라우드 메타데이터), `http://localhost:<내부포트>`, 클러스터 내부 서비스로 서버가 요청을 보내게 만들 수 있다. 게다가 오류 시 상단 응답 본문 일부를 `detail`로 되돌려줘(`metrics_validation.py:82`) blind SSRF가 semi-blind가 된다.
- 현재 조치(2026-07-17): 이 gateway-side HTTP 모듈과 `base_url` 요청 계약은 삭제됐다. 검증 요청은 cluster `evidence.read` 권한을 검사하고 target agent의 `telemetry.query.run` 명령으로만 전달한다. Prometheus 주소·credential은 revision-bound integration 봉투로 해당 agent에만 제공된다.

### H3 — EKS API 서버가 CIDR 제한 없이 공개됨
- 파일: `infra/eks.tf:16` `cluster_endpoint_public_access = true`(`_cidrs` 미설정) + `:18` `enable_cluster_creator_admin_permissions = true`
- 영향: 세 EKS 클러스터의 API 엔드포인트가 `0.0.0.0/0`에서 접근 가능. 인증만이 유일한 방어선.
- 권장: private endpoint + bastion/VPN, 최소한 `cluster_endpoint_public_access_cidrs`를 오피스/CI 범위로 제한. (코드 주석은 데모용임을 인지하고 있음.)

---

## Medium

### M1 — agent 설치 토큰이 URL 경로로 전송됨
- 파일: `src/domains/target/router.py:946-959`(`GET /install/{agent_token}`), 생성 명령 `:507-530`
- 근거: 원타임 설치 인증을 **평문 토큰을 URL 경로에** 넣어 처리. 토큰이 프록시/ELB/ingress 접근 로그, 브라우저 히스토리, `Referer`에 남는다. (DB 저장은 SHA-256 해시로 올바름 — `:902`.)
- 권장: 토큰을 `Authorization`/`x-agent-token` 헤더나 POST 본문으로 전달. 부득이 curl URL이 필요하면 장기 토큰과 분리된 단기·일회용 nonce 사용, 설치 경로 접근 로깅 제외.

### M2 — 관리자 대상 SSRF (알림 채널 webhook URL)
- 파일: `src/domains/alert/router.py:59-74`(test), `:39-56`(저장), `delivery.py:24-45`; 스키마 `requests.py:477,486`
- 근거: `test_alert_channel`/`upsert_alert_channel`이 임의 `url`로 `httpx.post`. 스킴/호스트 allowlist 없음. `require_admin_session` 필요라 H2보다 낮음.
- 권장: `https` + 공개/allowlist 호스트로 검증, 내부/메타데이터 IP 차단, 리다이렉트 비활성.

### M3 — `/metrics` 엔드포인트가 `METRICS_TOKEN` 미설정 시 무인증
- 파일: `src/services/gateway/api-gateway/gateway.py:534-544`
- 근거: 토큰이 설정된 경우에만 bearer 검사. 미설정 시 열려 있고, 미해결 인시던트·DLQ 깊이·큐 지연 등 운영 텔레메트리 노출. 방어를 NetworkPolicy에 전적으로 의존.
- 권장: 기본 fail-closed로 토큰 필수화하거나 내부 전용 리스너 분리.

### M4 — 이미지 태그가 mutable `:latest`
- 파일: 대부분의 `deploy/**/*.yaml`(`kubeheal-service:latest`, `imagePullPolicy: IfNotPresent`), `infra/ecr.tf:6` `image_tag_mutability = "MUTABLE"`
- 근거: 재현 불가 배포·롤백 불가·태그 덮어쓰기 공급망 위험. (`agent-api-proxy.yaml`은 nginx를 digest 핀으로 올바르게 고정.)
- 권장: digest/버전 태그 배포, ECR `IMMUTABLE`.

### M5 — 약 26/49 워크로드에 `securityContext` 누락
- 파일: `deploy/management/ai-workers.yaml` 전체(15개), `services.yaml`의 drift/release-flow 워커, `target-agent.yaml`/`target/target.yaml`의 cluster-agent, `storage.yaml`(postgres/redis/minio), `nats.yaml`, `pgbouncer.yaml`
- 근거: `runAsNonRoot`/`allowPrivilegeEscalation:false`/`drop:[ALL]`/`seccompProfile` 없음. 데이터스토어 이미지는 root+기본 capability로 구동 가능.
- 권장: `services.yaml`/`agent-api-proxy.yaml`에 이미 있는 securityContext를 전 워크로드에 적용.

### M6 — NetworkPolicy 전무 + 리소스 제한/쿼터 미흡
- 파일: `deploy/`·`infra/` 어디에도 `NetworkPolicy` 없음. `storage.yaml`(postgres/redis)·`nats.yaml`에 requests/limits 없음, LimitRange/ResourceQuota 없음
- 근거: 플랫 네트워크 — 침해된 파드가 PG/Redis/MinIO/NATS/내부 게이트웨이에 직접 도달. 무제한 데이터스토어로 자원 고갈 DoS 가능.
- 권장: default-deny + 명시 allow NetworkPolicy, 데이터스토어 requests/limits, 네임스페이스 LimitRange/ResourceQuota.

---

## Low

### L1 — Fernet 자격증명 키가 순수 SHA-256 파생(KDF 없음)
`src/packages/security/credentials.py:60-68` — `CREDENTIAL_ENCRYPTION_KEY`가 유효한 32바이트 키가 아니면 `sha256(passphrase)`로 파생(salt/iteration 없음). 저엔트로피 passphrase는 브루트포스 가능. → 32바이트 키 강제 또는 scrypt/argon2/PBKDF2 사용.

### L2 — `git clone` 원격 URL 스킴 미검증(심층 방어)
`src/services/gitops/manifest-render-worker/repo_cache.py:127-140` — `repo_ref`에 `://`/`git@` 포함 시 그대로 사용. 등록 시 `owner/repo` 검증이 있어 현 시점 실 취약점 아님. → `https://<허용호스트>/`만 허용하는 스킴 allowlist 추가.

### L3 — 상단 오류 본문을 클라이언트에 반영(H2 증폭)
`src/domains/dashboard/metrics_validation.py:78-83` — Prometheus 응답 `error`를 그대로 반환. 단독으론 경미하나 H2와 결합 시 정보 유출. → 일반화된 메시지 반환, 상세는 서버 로그만.

### L4 — 프로덕션 nginx 보안 응답 헤더 누락
`frontend/nginx.conf` — CSP, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, HSTS 없음. → 제한적 CSP + `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy: no-referrer` + HSTS 추가.

### L5 — CI 액션이 SHA가 아닌 태그 핀 / `secrets: inherit`
`.github/workflows/*.yml` — `actions/checkout@v4` 등 태그 핀(1st-party라 위험 낮음), `release-flow-production-deploy.yml:99` `secrets: inherit`로 전 시크릿 전달. → SHA 핀 및 명시적 `secrets:` 지정. pre-commit에 gitleaks/detect-secrets 추가 권장(`.pre-commit-config.yaml`은 현재 ruff만).

### L6 — 프론트엔드 원타임 토큰의 URL/DOM 노출
`frontend/src/features/auth/VerifyEmailView.tsx:12,23` 이메일 검증 토큰이 쿼리스트링으로 이동(히스토리/Referer 잔존), `frontend/src/features/resources/RegisterClusterWizard.tsx:378,536` agent 토큰이 DOM에 렌더+`data-testid="agent-token"` 노출. 저장은 안 함(양호). → POST 기반 검증, 토큰 마스킹/reveal 토글, 서술적 test id 제거, Referrer-Policy(L4).

---

## 검증 완료(취약하지 않음 — 오탐 제거)

- **커밋된 시크릿 없음**: `config/env/*.example`는 빈 placeholder, `secrets/`는 README + placeholder age 수신자만, `frontend/.env.production`은 `VITE_API_BASE=/api`뿐.
- **agent 토큰**: `secrets.token_urlsafe(32)` 생성, DB엔 SHA-256만, 평문은 원타임 응답에만.
- **비밀번호**: PBKDF2-HMAC-SHA256 260k + random salt + `compare_digest`.
- **SQL 인젝션 없음**: `text(f"…")`는 `int()` 캐스팅 상수/환경값만 보간.
- **직렬화/크립토**: `yaml.load`/`pickle`/`verify=False`/보안용 MD5·SHA1 없음. K8s secret vault SSL fail-closed.
- **명령 주입 없음**: 모든 `subprocess`가 인자 리스트(`shell=True` 없음), kube-context allowlist 검증.
- **멀티테넌시**: 등록 시 세션에서 `workspace_id`/`cluster_id` 파생·본문 override, agent guard는 registry 권위 신뢰(IDOR/교차테넌트 방어 양호).
- **Docker/RBAC**: non-root `USER 10001`, checksum 검증 다운로드, 시크릿 미노출; ClusterRole 와일드카드 없음, `automountServiceAccountToken: false`.
- **프론트 XSS/토큰**: `dangerouslySetInnerHTML`/`innerHTML`/`eval` 없음, 토큰 web storage 미저장, 쿠키 인증 + `x-service-csrf` 헤더, `safeReturnTo` open-redirect 방어.

## 우선 조치 제안

1. **C1/H1** — 배포 매니페스트 `APP_ENV=production` 전환 + `security.py` 구조적 fail-closed. (가장 시급)
2. **H2** — 완료: `metrics/validate`를 explicit cluster agent 명령 경계로 이관.
3. **H3** — EKS 엔드포인트 CIDR 제한.
4. M1~M6 순차 하드닝.
