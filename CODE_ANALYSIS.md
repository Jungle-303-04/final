# Opsia 소스코드 종합 분석

분석 대상 두 폴더:
- `SW_AI_W17-21-final`
- `SW_AI_W17-21-final-front`

## 0. 가장 중요한 발견 — 두 폴더는 "백엔드/프론트" 분리가 아니다

두 폴더는 **동일한 풀스택 모노레포(`github.com/Jungle-303-04/final.git`, 제품명 "Opsia")의 두 사본**입니다. 각 폴더 안에 백엔드(`src/`, Python), 프론트엔드(`frontend/`, React), 데스크톱(`desktop/`, Tauri), 인프라(`infra/`, `deploy/`, `charts/`)가 모두 들어 있습니다.

두 사본은 **서로 다른 시점으로 갈라져(diverged)** 있습니다:
- `src/`(백엔드) 기준 852개 항목이 다름, `frontend/src` 기준 1010개 항목이 다름
- `-final`(권장 기준본)에만 존재: `src/domains/activity`, `activity-overview` API, `accepted-event`, `api-resource-discovery` 등 → **더 최신/진전된 버전으로 보임**
- `-final-front`에만 존재: `src/controller`, 그리고 빌드 산출물(`node_modules`, `output`, `report_*.json`, `bugreport-*.zip`, `아카이브.zip`) → **작업/실행 흔적이 남은 사본**

규모: 백엔드 Python 약 178K LOC, 프론트엔드 TS/TSX 약 205K LOC (의존성 제외).

> 권장: 하나를 정본(source of truth)으로 정하는 게 좋습니다. 코드 최신도로 보면 `-final`이 정본, `-final-front`는 로컬 실행/리포트가 쌓인 실험 사본으로 보입니다.

---

## 1. 제품 개요

**Opsia — 이벤트 기반 Kubernetes 운영 자동화 플랫폼 (SaaS형 관제 콘솔)**

관리(management) 클러스터가 여러 대상(target) 클러스터를 관측하고, 장애를 자동 탐지·분석·복구합니다.
핵심 파이프라인: **Evidence 수집 → Incident 탐지 → RCA(근본원인분석) → Recovery(복구) → Safe PR(GitOps 안전 변경)** 를 이벤트 체이닝으로 자동화. AI/LLM으로 RCA 및 대화형 운영 어시스턴트를 제공합니다. ("SW_AI"의 AI가 여기서 옴)

실서비스 배포 중: `k8s.woonyong.org`, AWS EKS 2개 클러스터(management/target), Cloudflare.

---

## 2. 백엔드 (`src/`)

**기술스택**: Python 3.13, FastAPI + Uvicorn, PostgreSQL(psycopg3) + SQLAlchemy 2.0(동기) + Alembic, NATS JetStream(메시지 버스), Redis(세션/rate limit), OpenTelemetry, cryptography. 개발도구 ruff / pytest / import-linter / pre-commit.

**아키텍처**: 진짜 마이크로서비스 + 이벤트 소싱 + 헥사고날(포트-어댑터). "단일 FastAPI 모놀리식 금지"가 문서에 명시됨.
- **40개+ 독립 워크로드**, 각각 자체 `app.py` 진입점 (43개 확인). 자체 경량 프레임워크(`packages/runtime/app.py`)로 `@app.on(EventBody)` 구독 → `yield NextEventBody`로 이벤트 체이닝.
- **단일 NATS JetStream 스트림** `SERVICE_EVENTS`(7일/512MiB 보존, subject = `<도메인>.<행동>`).
- **트랜잭션 아웃박스** 패턴(`outbox` 테이블 → `outbox-relay` 별도 배포), **DLQ**(`event_dead_letters`, admin replay).
- **포트-어댑터 경계**를 `import-linter`로 CI에서 강제.

**디렉터리**:
- `packages/` — config / contracts(포트) / events(NATS) / storage(DB) / runtime(프레임워크) / ai(LLM) / security
- `domains/` — ~36개 도메인 (identity, ai, rca, command, target, gitops, inventory, dashboard, alert, audit, catalog, helm, diagnose, timeline...)
- `services/` — 실제 배포 단위(gateway, ai 워커 15개, gitops 워커 9개, target, projection, alert, mail, realtime, mcp)

**주요 진입점**: `src/services/gateway/api-gateway/app.py` → `gateway.py`의 `create_app()`(819줄). health `:18080/healthz`. 실행: `bash scripts/up.sh`.

**API**: 게이트웨이가 ~50개 도메인 라우터 등록. 주요 그룹 — identity(RBAC, Redis 세션 쿠키), ai(대화형 어시스턴트), rca/recovery, command(agent 명령 큐), target(EKS/GKE/AKS/kind 등록), gitops(GitHub webhook HMAC 검증 + Safe PR), inventory/dashboard/fleet, catalog(Helm 설치 runner), diagnose(SSE), alert. 인프라 라우트: `/healthz` `/readyz` `/metrics`(Bearer) `/api/live/*`(WS 프록시).

**데이터 모델**: SQLAlchemy 2.0 ORM, ~70개 테이블 도메인별 분산. alembic 43개 리비전 존재. (단, 현재 라이브는 `schema-bootstrap` Job의 `create_all` 사용 → Alembic 전환이 최우선 과제)

**AI/LLM**: `packages/ai/llm.py`의 단일 `LlmClient` 포트 + 어댑터 4종(OpenAI / OpenAI-compat / Anthropic / Gemini). env로 무코드 교체. 결정론적 RCA(YAML rule catalog) 우선, 규칙 미매칭 시 LLM fallback. 대화 엔진은 엄격 JSON tool-calling 프로토콜.

**보안 강점**: agent 토큰은 SHA-256 해시만 저장, repo/provider 자격증명 암호화 저장, 관리 클러스터 fail-closed read-only 경계 다계층 강제, trusted proxy 검증, CSRF origin guard, 로그 레닥션, Cloudflare mTLS.

---

## 3. 프론트엔드 (`frontend/`)

**정체**: `opsia-console` — **React 19 + Vite 6 + TypeScript(strict) SPA**. "Provider-neutral Kubernetes operations and GitOps control plane".

**기술스택**: React 19 / Vite 6 / TS 5.7 / react-router 7 / Tailwind CSS v4 / shadcn(nova) + radix/base-ui / zod(런타임 계약 검증) / recharts + @xyflow/react + elkjs(토폴로지) / @tanstack/react-table / motion / @ai-sdk/react / @xterm(터미널) / @tauri-apps/api(데스크톱). 테스트 Vitest + Testing Library + Playwright.

**아키텍처**: Feature-Sliced + 헥사고날(ports-adapters) 하이브리드, 매우 엄격.
- 흐름: `pages/*` → `features/*/*Contract.ts`(포트) ← `create*Adapter.ts`(어댑터) → `src/api/*`(zod fetch) → `/api/*`
- 합성 루트: `src/app/apiComposition.ts`에서 모든 어댑터 조립 + 14개 화면 lazy 로더 등록
- **상태 라이브러리 없음** (Redux/Zustand/React Query 미사용). 크로스커팅 상태는 React Context, 화면 데이터는 커스텀 훅 + **서버 주도 폴링**(`serverRefreshScheduler`, 서버가 알려준 `refreshAfterSeconds`로만 갱신, 탭 숨김 시 정지) + **SSE**(로그/오퍼레이션/라이브).
- import-linter로 레이어 경계 CI 강제.

**진입 흐름**: `main.tsx` → `ProductApp.tsx`(I18n → ErrorBoundary → Theme → Router → AuthBarrier) → `AuthenticatedProductRuntime` → `ProductRouter` → `ProductShell`(사이드바+헤더+AI패널+하단도크).

**14개 주 라우트**: home, resources(최대 규모 ~90파일: 카탈로그/토폴로지/매니페스트 에디터/Pod 터미널), issues(Incidents), topology, applications, timeline, traffic, helm, gitops(워크플로우 그래프), checks(audit), cost, clusters, alerts, settings. + `/workload/:kind/:ns/:name`, `/compare`.

**API 연동**: `src/api/client.ts`의 `apiRequest`가 모든 응답을 zod로 런타임 검증, `credentials: include`(httpOnly 세션 쿠키 `service_session`), 상태변경 메서드에 CSRF 헤더 자동 부착, 세분화된 `ApiError`. 도메인별 클라이언트 ~70개(각각 `.ts` + `-schemas.ts` + `.test.ts`). 개발 시 `/api` 프록시 → `VITE_BACKEND_ORIGIN`(기본 `k8s.woonyong.org`), 프로덕션은 nginx same-origin 프록시.

**스타일**: Tailwind v4 + shadcn(nova), 디자인 토큰 `styles/tokens.css`(oklch CSS 변수), next-themes 다크모드, Geist 폰트.

**부가**: Tauri v2 데스크톱 앱(Rust, xterm 로컬 터미널), DevPreview UI 랩(백엔드 없이 미리보기), 자체 i18n(ko/en), 소스:테스트 ≈ 694:327(약 1:2), 품질 게이트(typecheck+lint 0경고+test+design guard+bundle 크기 검사).

---

## 4. 주의/우려 사항

- **두 폴더 divergence**: 정본을 하나로 정하고 병합/정리 필요. `-final`이 코드상 더 최신.
- 백엔드: schema-bootstrap `create_all` → Alembic 리비전 마이그레이션 미전환(최우선), 프로덕션 인증 미전환(test bypass 존재), 프로덕션 HA(Multi-AZ PG/Redis/NATS, NetworkPolicy, HPA) 미완, realtime-gateway 1 replica.
- 프론트: 문서-코드 불일치 — `docs/api-layer.md`는 "TanStack Query + shared/lib/api.ts"라 서술하나 실제로는 미사용(커스텀 fetch + 폴링 훅). 온보딩 시 혼동 주의.
- `-final-front` 폴더에 커밋되지 않은 산출물/리포트/zip 다수 → 정리 대상.

---

## 5. 한 줄 요약

두 폴더는 **AI 기반 Kubernetes 장애 자동복구(RCA→Recovery→Safe PR) 관제 플랫폼 "Opsia"의 동일 모노레포 두 사본**입니다. 백엔드는 자체 경량 이벤트 프레임워크 위의 40+ 마이크로서비스(FastAPI+NATS+PG+헥사고날), 프론트엔드는 React 19+Vite+상태라이브러리 없는 헥사고날 SPA로, 양쪽 모두 엄격한 레이어 경계·촘촘한 테스트·zod/포트 계약을 갖춘 **프로덕션 지향의 성숙한 코드베이스**입니다.
