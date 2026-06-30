# 도메인 아키텍처 기획 — 프로덕션 네이밍 · 도메인별 모듈 · 흐름

이 문서는 `docs/architecture.md`, `docs/team/work-allocation.md`, `docs/service-split-plan.md`,
`docs/events.md`, `docs/team/member-guides/*` 를 근거로 **최종 목표 도메인 구조**를 기획한다.
구현 전 설계 문서이며, 코드 작업은 이 기획 확정 후 도메인 단위로 진행한다.

## 1. 목표 디렉터리 구조

```
src/
  src/packages/                 # 프레임워크(Platform 소유) — 도메인 아님
    config / contracts / events / runtime / storage
  domains/<도메인>/          # 바운디드 컨텍스트(팀원 소유) — 끝까지 한 폴더
    events.py               # 도메인 이벤트(subject + body)
    models.py               # SQLAlchemy ORM 모델(테이블)
    repository.py           # 데이터 접근(Repository)
    router.py               # FastAPI APIRouter(HTTP 엔드포인트)
    schemas.py              # HTTP 요청/응답 DTO(Pydantic) — 필요한 도메인만
    dependencies.py         # 인가 가드/필터(Depends) — 필요한 도메인만
    policy.py / client.py / adapters/  # 도메인 특화 모듈 — 필요한 도메인만
  src/services/<서비스>/app.py   # 실행 프로세스(워커 + 얇은 api-gateway 조립기)
frontend/                   # 대시보드 UI(별도 owner, node 생태계)
```

원칙: **packages = 공유 프레임워크(나만 수정), domains = 도메인 콘텐츠(팀원이 끝까지 소유),
services = 실행 단위.** registry 자동발견으로 도메인 추가 시 packages 수정 0.

## 2. 도메인 정의 + 프로덕션 네이밍

work-allocation 의 5인 분배를 바운디드 컨텍스트로 분해한다.

| 현재 | 프로덕션 도메인명 | 담당(5인) | 책임 |
| --- | --- | --- | --- |
| src/services/api-gateway + auth | **identity** | Gateway/Auth | 인증·세션·OAuth·토큰볼트·권한(authz) |
| src/services/gitops/* (pull→render→diff→analyze) | **gitops** | GitOps/Command | Git 변경 감지→manifest→diff→분석 |
| src/services/command-worker | **command** | GitOps/Command | 명령 정책→target agent 큐(control-plane) |
| src/services/rca-worker | **rca** | RCA/Safe PR | 증거→근본원인분석 |
| src/services/gitops/scm-worker | **scm** | RCA/Safe PR | GitHub PR 생성(유일 outbound writer) |
| src/services/projection/dashboard-worker | **projection** | (대시보드 owner) | 대시보드 read model |
| src/services/projection/audit-worker | **audit** | RCA/Safe PR | 불변 감사 타임라인 |
| src/services/target/* | **telemetry** | Target/Telemetry | target agent·관측성 어댑터·증거 수집·명령 실행 |
| dashboard/(UI) | **frontend** | (미정) | React/Vite UI, node 생태계 |

> `src/packages/`(config·contracts·events·runtime·storage)는 Platform 소유의 **프레임워크**이며 도메인이 아니다.

## 3. 도메인별 필요한 모듈 (문서 기반 추론)

### identity (인증·권한) — 가장 모듈이 많은 도메인
**WIKI gateway-auth 가이드 핵심**: 로그인은 GitHub OAuth 전용이 아니라 **기본은 email/password 내부 로그인**,
OAuth 는 **외부 도구 연동(integration)**용. 사용자 로그인 계정과 외부 도구 계정을 **분리**.
session 은 Redis, provider token 은 event payload 가 아니라 **Token Vault** record. org role 과 project role 분리.
route 순서 = **input validation → auth/policy → event publish**.

| 모듈 | 내용 |
| --- | --- |
| `events.py` | `oauth.start.requested`, `oauth.connected` |
| `models.py` | `User`(email/password), `OAuthAccount`, `TokenVault` |
| `repository.py` | 사용자·OAuth 계정·토큰 영속(`OAuthAccountStore` 계약) |
| `router.py` | `/auth/login`(email/pw), `/auth/session`, `/auth/oauth/{provider}/start·callback` |
| `schemas.py` | `LoginRequest`, `OAuthCallbackRequest` 등 HTTP DTO(위험 field 거부) |
| `dependencies.py` | **인가 가드(필터)** — `require_session`, `require_agent`, `require_roles([...])` |
| `service.py` | 로그인·OAuth flow(`OAuthAuthService`), Redis 세션(`SessionStore`) |
| `integrations.py` | 외부 도구 integration target·credential binding·Token Broker(planned `contracts/integrations`) |
| `security.py` | **organization role · project role 분리**·권한 정책(planned `contracts/security`) |

### gitops (배포 파이프라인)
| 모듈 | 내용 |
| --- | --- |
| `events.py` | `git.webhook.received`, `git.changed`, `manifest.rendered`, `desired.diff.detected`, `diff.analyzed` + 값 객체(`Manifest`, `Diff`, `RenderedManifest`) |
| `models.py` | `RepoChange` |
| `repository.py` | `RepoChangeRepository` |
| `router.py` | `/github/webhook` |
| (실행) | `src/services/gitops/{git-pull,manifest-render,diff,diff-analyze}-worker/app.py` |

### command (제어)
| 모듈 | 내용 |
| --- | --- |
| `events.py` | `command.requested/rejected/dispatch.ready/dispatched/queued_for_agent/completed` + `Plan`, `Route` |
| `models.py` | `AgentCommand` |
| `repository.py` | `AgentCommandRepository`(queue/lease/start/complete) |
| `router.py` | `/commands`, `/agent/command/poll`(롱폴)·`/start`·`/result` |
| `policy.py` | 명령 정책(sandbox namespace 룰 등) — 도메인 특화 |
| (실행) | `src/services/command-worker/app.py` |

### rca (진단)
**WIKI rca-safe-pr 가이드**: RCA Worker 는 직접 PR 생성 안 함 → `safe_pr.requested` 만 발행.
RCA 결과는 **evidence 기반으로만** 생성. `users/ummfieg/rca-scenarios/`·`jcbbbbbb/.../rca-scenarios/`의
**40개 장애 시나리오**(CrashLoop·ImagePull·OOM·probe·DNS·HPA·etcd 등)가 RCA 판정 지식베이스.

| 모듈 | 내용 |
| --- | --- |
| `events.py` | `cluster.evidence.received`, `evidence.built`, `rca.completed` |
| `models.py` | `Evidence`, `RcaReport` |
| `repository.py` | `RcaRepository`(`RcaStore` 계약) |
| `router.py` | `/agent/evidence` |
| `schemas.py` | `AgentEvidenceRequest` |
| `evidence_builder.py` | raw evidence → 사람이 읽는 요약(`EvidenceBuilt`) |
| `analyzer.py` | AI RCA Service — 증거+시나리오 지식 → `rca.completed`(근본원인·조치) |
| `scenarios/` | 40개 장애 시나리오 인디케이터(판정 규칙 소스) |
| (실행) | `src/services/rca-worker/app.py` |

### scm (소스컨트롤/PR)
| 모듈 | 내용 |
| --- | --- |
| `events.py` | `safe_pr.requested/created/failed` |
| `models.py` | `PullRequest` (현재 rca 에 섞임 → scm 으로 이동) |
| `repository.py` | PR 영속 |
| `client.py` | GitHub PR 생성 outbound client(feature flag 보호) |
| (실행) | `src/services/gitops/scm-worker/app.py` |

### projection (read model) / audit
| 도메인 | 모듈 |
| --- | --- |
| projection | `models.py`(`DashboardCard`), `repository.py`(`DashboardRepository`), `events.py`(`dashboard.updated`), `router.py`(`/dashboard/query`, `/dashboard/stream` SSE) |
| audit | `models.py`(`AuditLog`), `repository.py`(`AuditLogRepository`) — `@app.on_any` 프로젝터 |

### telemetry (target agent) — 가장 복잡, 별도 절(§5)

## 4. 전체 흐름

### HTTP/이벤트 (관리 영역)
```
GitHub webhook ─▶ identity.router 인가 ─▶ gitops.router(/github/webhook)
  ─▶ git.webhook.received ─▶ gitops 워커들 ─▶ command.requested
  ─▶ command 워커(정책) ─▶ AgentCommand 큐
target agent ─(outbound long-poll)─▶ command.router(/agent/command/poll) ─▶ 명령 응답
  ─▶ agent 실행 ─▶ /agent/command/result ─▶ command.completed

target agent ─(outbound)─▶ rca.router(/agent/evidence) ─▶ cluster.evidence.received
  ─▶ rca 워커 ─▶ evidence.built ─▶ rca.completed ─▶ safe_pr.requested
  ─▶ scm(repo-gateway) ─▶ GitHub PR ─▶ safe_pr.created

모든 이벤트 ─▶ projection/audit(@app.on_any) ─▶ read model / 감사
```

### 인가 흐름(필터)
```
identity.dependencies.require_session  → 사용자 라우트(dashboard/command 발행)
identity.dependencies.require_agent    → agent 라우트(/agent/command/*, /agent/evidence)
→ APIRouter(dependencies=[Depends(require_*)]) 로 라우터 단위 선언(핸들러 반복 X)
```

## 5. 타깃 에이전트(telemetry) — 복잡도 상세

target agent 는 **여러 클러스터에 각각 설치**되어 (1) 메인이 큐에 넣은 명령을 자기 k8s 에
적용하고 (2) 메트릭/로그/트레이스를 수집해 증거로 올린다. 통신은 전부 **outbound**(agent가 건다).
member-guides 의 telemetry/evidence 문서를 반영한 모듈 구성:

```
domains/telemetry/
  client.py                 # ManagementPlaneClient — gateway 로 outbound(register/poll/result/evidence)
  evidence.py               # EvidenceDraft — agent 내부 중간 요약 모델(raw → 압축, 최종 event 계약 아님)
  executor.py               # 명령 실행기 — k8s adapter + RBAC(sandbox namespace 한정)
  adapters/
    prometheus.py           # metrics 수집(실제 + fake fallback)
    loki.py                 # logs 수집
    otel.py                 # traces 수집
  collector.py              # node-collector(DaemonSet) — node/runtime 메트릭
src/services/target/cluster-agent/app.py   # 에이전트 프로세스(연결·폴링·증거 ship)
src/services/target/node-collector/app.py         # 선택형 DaemonSet
```

특수 고려:
- **RBAC**: agent 는 자기 클러스터 ServiceAccount 로 sandbox namespace 쓰기만(최소권한). `deploy/target` 의 Role/RoleBinding 로 범위 명시.
- **adapter 교체**: 실제 Prometheus/Loki/OTel 과 fake adapter 를 같은 인터페이스로 두고 env 로 선택(fake = fallback).
- **node-collector**: DaemonSet 이라 Fargate 배치 금지(노드별 1개).
- **증거 스키마 계약**: evidence 모델은 rca 도메인과 공유 계약 → `src/packages/contracts/event_bus/bodies/` 의 `ClusterEvidenceReceivedBody` 와 정합 유지.

## 6. 프론트엔드(대시보드) — node 생태계 관리

대시보드 UI 는 Python 도메인과 **완전히 다른 생태계**(React/Vite, npm/pnpm, node_modules)라
별도 폴더·별도 owner·별도 빌드/배포 파이프라인으로 분리한다.

```
frontend/
  package.json / pnpm-lock.yaml    # 의존성 잠금(커밋), node_modules 는 gitignore
  src/                             # React 컴포넌트
  vite.config.ts
  Dockerfile                       # 정적 빌드 → nginx 또는 별도 image
```
- **node_modules 는 절대 커밋 금지**(.gitignore). 빌드 산출물(`.vite`, `dist`, `test-results`)도 ignore.
- 빌드는 CI 에서: `pnpm install --frozen-lockfile && pnpm build` → 정적 배포(또는 컨테이너).
- 대시보드는 gateway 의 `/dashboard/stream`(SSE/WebSocket)으로 실시간 read model 구독.
- 현재 5인 분배에서 대시보드는 제외 상태 → **UI 착수 시 별도 담당 지정** 필요(work-allocation 명시).

## 7. 단계별 실행 계획 (기획 확정 후)

도메인별로 `events·models·repository·router(+특화)` 를 한 번에 옮기고 registry 자동발견에 흡수한다.
각 단계 후 ruff/pytest/mypy 검증.

1. **identity 파일럿** — DI 가드(`dependencies.py`) + `router.py`(APIRouter) + `models/repository` 이전.
   gateway 를 `app.state` + `include_router` 얇은 조립기로 전환. (DI·필터 패턴 확정)
2. **command** — router(/commands, /agent/command/*) + policy + models/repository 이전.
3. **gitops** — 이미 models/repository 이전됨 → router(/github/webhook) 추가.
4. **rca / scm** — evidence/PR 분리(PullRequest 를 scm 으로), router(/agent/evidence) 이전.
5. **projection / audit** — read model + 감사 이전, router(/dashboard/*) 추가.
6. **telemetry** — agent 모듈 재구성(client·evidence·executor·adapters), RBAC 문서화.
7. **frontend** — node 파이프라인 정립(별도 owner).
8. **마무리** — CI 게이트(.github), httpOnly 세션 쿠키, mypy 정식 게이트.

## 8. 미해결/조율 필요 (work-allocation 인용)
- identity 최종 권한 모델(org/project role, Token Broker) 단계 구현.
- 실제 GitHub PR(scm)·Prometheus/Loki(telemetry) adapter — feature flag/fallback.
- 대시보드 UI 담당 재지정.
- 새 event subject/body·DB table·API route·RBAC 변경 시 담당 간 계약 규칙 준수(work-allocation §팀 간 계약 규칙).

## 9. WIKI 포트 계약 → 도메인 repository 매핑

WIKI `projects/final/architecture.md` 의 포트 계약(Protocol)을 도메인 repository 로 매핑하면 경계가 명확해진다.

| WIKI 포트 계약 | 도메인 | repository/모듈 |
| --- | --- | --- |
| `RepoChangeStore` | gitops | `RepoChangeRepository` |
| `AgentCommandQueue` | command | `AgentCommandRepository` |
| `RcaStore` | rca | `RcaRepository` |
| `DashboardReadModel` | projection | `DashboardRepository` |
| `AuditLogStore` | audit | `AuditLogRepository` |
| `OAuthAccountStore`, `SessionStore` | identity | `repository.py` + `service.py`(Redis 세션) |
| `DeadLetterStore` | packages(프레임워크) | DLQ — 도메인 아님, 코어 유지 |
| `ManagementPlaneClient` | telemetry | `client.py`(agent outbound) |

## 근거 문서 (WIKI / repo docs)

- 제품/도메인: `WIKI:projects/final/product-definition.md`, `architecture.md`, `service-split-plan.md`
- 도메인별 모듈: `WIKI:projects/final/member-guides/{gateway-auth, gitops-command, rca-safe-pr, target-telemetry-*}.md`
- 분배/계약 규칙: `WIKI:projects/final/team-work-allocation.md`, `repo:docs/team/work-allocation.md`
- RCA 지식: `WIKI:users/ummfieg/rca-scenarios/`(40 시나리오), `feedback/rca-*.md`
- frontend/security: `WIKI:wiki/frontend/README.md`, `wiki/security/README.md` (현재 stub → 착수 시 정의 필요)

