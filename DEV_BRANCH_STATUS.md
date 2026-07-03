# KubeHeal dev 브랜치 현황 보고서

> 작성일: 2026-07-04
> 브랜치: `dev` (검토 기준 HEAD: `63ebdcc1`, 보고서 커밋 전 기준)
> main 대비: **437 files changed, +51,867 / -3,661**

---

## 1. Git 현황 요약

### 커밋 통계

| 작성자 | 커밋 수 | 비고 |
|--------|---------|------|
| choi woo-nyong (최우녕) | 404 | 아키텍처, 코어, AI |
| minmings111 (이민정) | 30 | target/evidence |
| woohyun (전우현) | 1 | GitOps (피처 브랜치 작업 중) |
| JCBBBBBB (정찬빈) | 1 | auth/dashboard (피처 브랜치 작업 중) |

전체 프로젝트 히스토리가 약 2주 이내에 집중되어 있으며, dev에 직접 커밋되지 않은 팀원들은 개별 피처 브랜치에서 작업 중이다.

### 활성 브랜치

| 브랜치 | 담당자 | 상태 |
|--------|--------|------|
| `feat/jeonwoohyun-hydromel/command-worker` | 전우현 | 작업 중 |
| `feat/jeonwoohyun-hydromel/gitops-sync-worker` | 전우현 | 작업 중 |
| `feat/jcbbbbbb/api-gateway` | 정찬빈 | 작업 중 |
| `feat/ummfieg/rca-worker` | 임가인 | 작업 중 |
| `feat/ummfieg/dashboard-projection-service` | 임가인 | 작업 중 |
| `feat/ummfieg/audit-timeline-service` | 임가인 | 작업 중 |
| `feat/minmings111/target-cluster-agent` | 이민정 | 작업 중 |
| `feat/minmings111/node-collector` | 이민정 | 작업 중 |
| `demo/v1` | 전체 | 데모용 |

### 최근 주요 커밋 (보고서 커밋 전 최신 10건)

1. `63ebdcc1` — refactor: 소비자 없는 ai.conversation.started 이벤트를 삭제
2. `976cb37b` — fix: psycopg 전용 connect_args를 드라이버별 분기로 분리
3. `b83f2bca` — refactor: chat-worker를 도구 호출 대화 엔진 기반으로 전환
4. `c49c31e8` — feat: 플랫폼 조회 능력을 읽기 전용 AI 도구로 등록하고 자동 발견 배선
5. `e0a61fa5` — feat: 도구 호출 루프를 도는 ConversationEngine 대화 오케스트레이터 추가
6. `67cf2e82` — feat: LLM이 호출 가능한 플랫폼 능력을 선언하는 @ai.tool 레지스트리 도입
7. `c4ff2966` — feat: 만료 방치 명령 janitor를 도입해 영구 APPLYING workflow 복구
8. `d45ca94b` — feat: DB 풀/워커 처리량·재시도 정책을 서비스별 env로 오버라이드
9. `6aefd6b2` — fix: scm-worker PR URL prefix 미설정 시 즉시 실패
10. `71643186` — fix: workflow 상태 갱신에 허용 전이 guard

---

## 2. 서비스 목록 및 구현 상태

총 **29개 서비스/워커**, 3-레이어 아키텍처 (services → domains → packages).

### Gateway (1개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| api-gateway | ✅ 완료 | FastAPI 기반, 25+ 엔드포인트 (인증, GitOps, RCA, AI 채팅, 커맨드, 타겟) |

### GitOps Pipeline (7개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| github-poll-worker | ✅ 완료 | CronJob(1분), GitHub 폴링 |
| git-pull-worker | ✅ 완료 | 웹훅 수신 → Git 변경 이벤트 |
| manifest-render-worker | ⚠️ 부분 | 매니페스트 렌더링 (Helm/Kustomize 미지원, Deployment만 하드코딩) |
| diff-worker | ✅ 완료 | 3-way 매니지드 필드 diff |
| diff-analyze-worker | ⚠️ 부분 | 위험도 분석 (이진 분류만, TODO 5건) |
| scm-worker | ❌ 스텁 | PR 생성 가짜 URL, GitHub App 미구현 |
| workflow-controller | ✅ 완료 | 12개 이벤트 핸들링, 상태 머신, 713줄 |

### Command & Alert (2개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| command-worker | ✅ 완료 | 정책 기반 명령 디스패치 |
| alert-worker | ⚠️ 부분 | 알람 게이트 항상 True, Slack/PagerDuty 미구현 |

### AI / RCA Pipeline (14개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| evidence-worker | ✅ 완료 | 클러스터 증거 수집 이벤트 처리 |
| incident-worker | ✅ 완료 | 증거 → 인시던트 탐지 |
| plan-worker | ✅ 완료 | RCA 후보 계획 |
| analyze-worker | ✅ 완료 | RCA 후보 평가 |
| rca-worker | ✅ 완료 | 최종 RCA 결과 생성 |
| recovery-worker | ✅ 완료 | 복구 전략 계획 |
| select-worker | ✅ 완료 | 복구 액션 선택 |
| dispatch-worker | ✅ 완료 | 명령/PR 요청 발행 |
| ai-chat-worker | ✅ 완료 | LLM 대화 엔진, 도구 호출 루프, i18n |
| backlog-worker | ✅ 완료 | RCA 백로그 아이템 적재 |
| approval-worker | ⚠️ 부분 | 셀렉션/롤아웃 → 추천 (단순 라우팅) |
| rollout-worker | ⚠️ 부분 | 커맨드 결과 → 롤아웃 진단 (단순 체크) |
| safe-pr-worker | ⚠️ 부분 | 패치 바디 전달만, 실제 패치 생성 없음 |
| ai-diff-worker | ⚠️ 부분 | 하드코딩된 diff 설명 문자열 |

### Target / Cluster (3개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| cluster-agent | ✅ 완료 | 타겟 클러스터 아웃바운드 에이전트, K8s 명령, 텔레메트리 |
| node-collector | ⚠️ 부분 | DaemonSet 메트릭 수집 (노드 메트릭 하드코딩) |
| reconcile-worker | ✅ 완료 | desired-state 드리프트 감지 |

### Cross-cutting (2개)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| audit-worker | ✅ 완료 | 모든 이벤트 감사 로그 |
| mail-worker | ✅ 완료 | 이메일 인증 발송 (dev: 로그 출력) |

**요약**: ✅ 완료 20개 / ⚠️ 부분 완료 8개 / ❌ 스텁 1개

---

## 3. 도메인별 완성도

### 3.1 GitOps 파이프라인 (전우현) — 75%

**완성된 것**:
- NATS 기반 이벤트 파이프라인 (17+ 이벤트 타입)
- 10개 SQLAlchemy 모델, 전체 CRUD (repository.py 786줄)
- 매니지드 필드 3-way diff 엔진 (diffing.py 276줄)
- GitHub 폴링/웹훅 수신
- Workflow 상태 머신 (guarded transitions, 12개 이벤트)
- 승인 시스템 (원자적 동시성 안전 해결)
- HMAC-SHA256 웹훅 서명 검증

**남은 작업**:
- SCM/PR 생성 실제 GitHub App 연동 (현재 가짜 URL)
- Helm/Kustomize 매니페스트 렌더링 (현재 Deployment 하드코딩)
- 롤백 메커니즘
- diff 위험도 분석 고도화 (현재 이진 분류)

**테스트**: 14개 테스트 (diffing, approval). 워커 테스트 없음.

### 3.2 RCA 플로우 (임가인) — 80%

**완성된 것**:
- 전체 이벤트 체인: evidence → incident → plan → evaluate → root cause → recovery
- 25+ 이벤트/VO 데이터클래스
- 룰 기반 원인 후보 생성/평가 엔진
- `@rca.cause` 데코레이터 기반 플레이북 시스템
- 증거 번들링 + 누락 증거 추적
- API 엔드포인트 (에이전트 증거 제출, 클러스터 토큰 인증)

**남은 작업**:
- **증상 프로필 1개뿐** (CrashLoopBackOff) → OOMKilled, ImagePullBackOff 등 추가 필요
- `RcaAiFallbackRequestedBody` 이벤트 소비자 없음 (AI 폴백 분석 미구현)
- 원인 평가가 순수 룰 기반 → LLM 파워드 분석 미적용
- 백로그 목록 조회 메서드 없음

**테스트**: 10개 통합 테스트 (전체 happy path, 빈 증거, 미지 증상).

### 3.3 대시보드/프론트엔드 (정찬빈) — 40%

**완성된 것**:
- 백엔드 API Gateway에 25+ 엔드포인트
- 프론트엔드 별도 레포 존재 (`SW_AI_W17-21-final-dashboard`, React/Vite, port 5173)
- Vite dev proxy로 `/gateway/*` 연결

**남은 작업**:
- **Dashboard Projection Worker 미구현** — 이벤트를 DashboardCard 읽기 모델로 투영
- SSE/WebSocket 엔드포인트 없음 (`EVENT_STREAM_MEDIA_TYPE` 상수만 정의)
- `/dashboard/query`, `/dashboard/stream` 라우트 미구현
- CORS 설정 없음 (Vite 프록시 의존)
- 프론트엔드 컴포넌트 완성도 별도 확인 필요

**테스트**: 별도 확인 필요 (프론트엔드 레포).

### 3.4 AI 대화 플로우 (최우녕) — 85%

**완성된 것**:
- LLM Gateway: OpenAI, Anthropic, Gemini 3개 프로바이더 어댑터
- ConversationEngine: 도구 호출 루프 (최대 4회 반복), JSON 응답 파싱
- `@ai.tool` 데코레이터 기반 도구 레지스트리 + 자동 발견
- 4개 AI 도구: `list_recent_incidents`, `get_conversation_summary`, `list_command_actions`, `list_recovery_playbooks`
- i18n (en/ko) 시스템 프롬프트, 에러 메시지
- 프로바이더 선택 (`LLM_PROVIDER` env), 429/5xx 재시도
- FakeLlmClient 테스트 지원

**남은 작업**:
- ai-diff-worker 하드코딩 요약 → 실제 diff 분석
- safe-pr-worker 패스스루 → 실제 패치 생성
- LLM 스트리밍 응답 (SSE) 미지원
- 프롬프트 인젝션 보호 없음
- 대화 히스토리 10개 제한, 요약 전략 없음

**테스트**: 39개 테스트 (LLM 어댑터, 엔진, 도구, i18n, 증거 수집).

### 3.5 인증/인가 (정찬빈) — 80%

**완성된 것**:
- PBKDF2-SHA256 비밀번호 해싱 (260k iterations)
- Redis 세션 관리 (24h TTL, opaque 토큰)
- 회원가입 → 이메일 인증 → 관리자 승인 → 로그인 플로우
- httpOnly/SameSite=lax 쿠키 보안
- 에스컬레이팅 속도 제한 (15min → 1hr → 24hr)
- RBAC: 4단계 역할 (Owner > Maintainer > Deployer > Viewer)
- 클러스터 에이전트 토큰 인증

**남은 작업**:
- SSO/OAuth/OIDC 미구현 (비밀번호 전용)
- 비밀번호 복잡도 검증 없음
- 로그인 실패 계정 잠금 없음
- 비밀번호 변경/리셋 플로우 없음
- CSRF 토큰 없음 (SameSite=lax만 의존)
- 세션 슬라이딩 만료 없음

**테스트**: 29개 테스트 (인증 플로우, 속도 제한, 쿠키, 에이전트 토큰).

### 3.6 Target/Evidence (이민정) — 90%

**완성된 것**:
- 3개 텔레메트리 프로바이더: Prometheus(PromQL), Loki(LogQL), Tempo(TraceQL)
- 중앙 잡 기반 증거 수집 (lease 기반, 재시도, 중복 제거)
- `@telemetry.source` 데코레이터 + 자동 발견
- 16개 기본 쿼리 (9 메트릭, 3 로그, 4 트레이스)
- K8s API 클라이언트 (get/patch), 명령 정책 적용
- 정책 동기화 + SQLite 아웃박스
- desired-state 재조정, 해시 기반 변경 감지
- 풀 데모 환경 (Docker Compose + Prometheus/Loki/OTel)

**남은 작업**:
- 노드 메트릭 하드코딩 (CPU 0.37, memory 268MB 등) → 실제 값 수집
- K8s 매니페스트 인라인 생성 → Helm/Kustomize 전환
- 명령 허용 목록 워크스페이스/클러스터 정책 확장

**테스트**: 60+ 테스트 (전체 도메인 중 가장 높은 커버리지).

---

## 4. 도메인별 완성도 요약

| 도메인 | 담당자 | 완성도 | 핵심 갭 |
|--------|--------|--------|---------|
| Target/Evidence | 이민정 | 90% | 노드 메트릭 하드코딩 |
| AI 대화 플로우 | 최우녕 | 85% | diff/safe-pr 스텁, 스트리밍 없음 |
| 인증/인가 | 정찬빈 | 80% | SSO 없음, 비밀번호 리셋 없음 |
| RCA 플로우 | 임가인 | 80% | 증상 프로필 1개, AI 폴백 미구현 |
| GitOps 파이프라인 | 전우현 | 75% | SCM 스텁, Helm 미지원, 롤백 없음 |
| 대시보드/프론트엔드 | 정찬빈 | 40% | 프로젝션 워커 없음, SSE 없음 |

---

## 5. 하드코딩/잠재 오류 심층 검토

### 즉시 수정 완료

1. **`POLL_ONCE` truthy 파싱 오류**
   - 위치: `src/services/gitops/github-poll-worker/poller.py`
   - 문제: `bool(env("POLL_ONCE"))` 때문에 `POLL_ONCE=0`도 CronJob 1회 실행 모드로 처리됨
   - 조치: `{"1", "true", "yes", "on"}`만 true로 인정하는 `env_truthy()`로 교체
   - 회귀 테스트: `tests/test_github_poller.py::test_poll_once_env_parses_only_truthy_values`

### 운영 전 반드시 교체/정책화

1. **SCM PR adapter stub**
   - 위치: `src/services/gitops/scm-worker/app.py`
   - 현재 상태: `SCM_PR_URL_PREFIX` 기반 가짜 PR URL 생성. 미설정 시 부팅 fail-fast는 적용됨
   - 위험: `scripts/up.sh`의 기본값 `https://github.local/pull`이 운영에 남으면 실제 PR 생성 없이 safe-pr.created가 흐를 수 있음

2. **alert gate 항상 통과**
   - 위치: `src/services/alert/alert-worker/app.py`
   - 현재 상태: `allow_after_alarm_gate()`가 항상 `True`, mode는 `stub_alarm_adapter`
   - 위험: Slack/Email/PagerDuty 전송 확인 없이 후속 command가 이어짐

3. **manifest render fallback**
   - 위치: `src/services/gitops/manifest-render-worker/app.py`, `src/services/gitops/github-poll-worker/settings.py`
   - 현재 상태: 원격/로컬 manifest source가 없으면 `checkout-api`, `service:local`, replicas 2 기준 Deployment를 생성
   - 위험: production watcher가 잘못 설정되면 실제 repo manifest 대신 데모 manifest가 흐를 수 있음

4. **diff 기준 snapshot demo fallback**
   - 위치: `src/services/gitops/diff-worker/app.py`
   - 현재 상태: `last_approved_snapshot`이 없으면 live fields를 이전 승인 snapshot처럼 사용
   - 위험: 첫 실행/정책 누락 시 drift 또는 미관리 필드가 과소 탐지될 수 있음

5. **위험도 판단 문자열 정책**
   - 위치: `src/services/gitops/diff-analyze-worker/app.py`
   - 현재 상태: `diff.risk == Sandbox.RISK_TAG`이면 safe로 판단
   - 위험: namespace 외에 operation, RBAC, environment, blast radius 기준이 없음

6. **배포 manifest 이미지 고정**
   - 위치: `deploy/management/*.yaml`, `deploy/target/target.yaml`
   - 현재 상태: local KinD용 `service:local` 이미지 고정
   - 위험: 운영 배포 전 image tag 주입 또는 kustomize overlay 없으면 재현 불가

### 검증 결과

- `make doctor`: 로컬 필수 도구와 Docker daemon 정상
- `make test`: ruff, format check, import-linter, compileall, pytest **343 passed**, FastAPI/TestClient deprecation warning 1건
- `kubectl apply --dry-run=client --validate=false -k deploy/management -o name`: 정상
- `kubectl apply --dry-run=client --validate=false -f deploy/target/target.yaml -o name`: 정상
- 민감정보 패턴 스캔: 실제 API key/PAT/private key 패턴 없음. 예제/테스트 DB URL과 동적 secret 생성 구문만 탐지
- 주의: `deploy/management`는 `kubectl apply -f deploy/management`가 아니라 `kubectl apply -k deploy/management`로 적용해야 함

---

## 6. 팀원별 다음 할 일 (우선순위)

### 이민정 — Target/Evidence

1. **노드 메트릭 실측 수집**: node-collector의 하드코딩 값을 실제 K8s 메트릭 API 호출로 교체
2. **텔레메트리 쿼리 확장**: 현재 16개 기본 쿼리 외에 도메인별 커스텀 쿼리 추가 (e.g., HPA, Network Policy)
3. **명령 허용 목록 확장**: 워크스페이스/클러스터 정책 기반 동적 허용 목록 구현

### 임가인 — RCA Flow

1. **증상 프로필 추가**: OOMKilled, ImagePullBackOff, NodeNotReady 등 주요 K8s 장애 패턴에 대한 `@rca.cause` 플레이북 작성
2. **AI 폴백 소비자 구현**: `RcaAiFallbackRequestedBody` 이벤트를 처리하는 AI 기반 RCA 워커 구현
3. **대시보드 프로젝션 워커 구현** (`feat/ummfieg/dashboard-projection-service`): 이벤트 → DashboardCard 읽기 모델 투영

### 전우현 — GitOps

1. **SCM 워커 실제 구현**: GitHub App 연동, 실제 PR 생성/병합 로직 (`feat/jeonwoohyun-hydromel/command-worker` 연계)
2. **매니페스트 렌더러 확장**: Helm Chart / Kustomize 렌더링 지원, 현재 Deployment 하드코딩 탈피
3. **diff 위험도 분석 고도화**: 바이너리 분류 → 리소스 유형/변경 범위 기반 다단계 위험도 판정

### 정찬빈 — Auth / Dashboard

1. **대시보드 SSE 엔드포인트**: 실시간 이벤트 스트림을 프론트엔드에 전달 (이미 상수 정의됨)
2. **CORS 설정 추가**: 프로덕션 환경에서 Vite 프록시 없이도 동작하도록 CORS 미들웨어 추가
3. **로그인 보안 강화**: 로그인 실패 속도 제한 + 비밀번호 복잡도 검증 + 비밀번호 리셋 플로우

### 최우녕 — Architecture / AI

1. **ai-diff-worker / safe-pr-worker 실제 구현**: LLM 기반 diff 분석 및 패치 생성 로직
2. **E2E 통합 테스트**: 전체 파이프라인 (GitOps → RCA → AI → Command) 흐름 테스트 시나리오
3. **데모 v1 안정화**: demo/v1 브랜치에 전체 서비스 정상 동작 확인 및 시연 시나리오 정리

---

## 7. 아키텍처 참고

```
┌──────────────────────────────────────────────────────────────┐
│                    Management Cluster (KinD)                  │
│                                                              │
│  ┌─────────┐   ┌──────────┐   ┌────────┐   ┌─────────────┐ │
│  │   API   │   │   NATS   │   │ Postgres│   │   PgBouncer │ │
│  │ Gateway │   │ JetStream│   │  17     │   │             │ │
│  └────┬────┘   └────┬─────┘   └────┬────┘   └─────────────┘ │
│       │             │              │                         │
│  ┌────┴─────────────┴──────────────┴────────────────────┐   │
│  │              Event-Driven Workers (28개)              │   │
│  │                                                      │   │
│  │  GitOps: poll → pull → render → diff → analyze       │   │
│  │          → scm → workflow-controller                  │   │
│  │                                                      │   │
│  │  AI/RCA: evidence → incident → plan → analyze        │   │
│  │          → rca → recovery → select → dispatch        │   │
│  │          + chat-worker (LLM 대화 엔진)                │   │
│  │                                                      │   │
│  │  Cross: command, alert, audit, mail, reconcile       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                          ↕ NATS
┌──────────────────────────────────────────────────────────────┐
│                    Target Cluster (KinD)                      │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ cluster-agent │  │ node-collector│  │ Telemetry Stack  │ │
│  │ (Deployment)  │  │ (DaemonSet)   │  │ Prom+Loki+Tempo  │ │
│  └───────────────┘  └───────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. 핵심 수치

| 항목 | 수치 |
|------|------|
| 총 파일 변경 (main 대비) | 437 files |
| 코드 추가/삭제 | +51,867 / -3,661 |
| 서비스/워커 수 | 29개 |
| 도메인 모듈 | 12개 |
| 공유 패키지 | 7개 |
| 테스트 파일 | 59개 (~10,394줄) |
| 이벤트 타입 | 55개 (Body 클래스) |
| 총 커밋 (dev, 보고서 커밋 전) | 436 |
