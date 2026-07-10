# 지원 범위 분석 보고서 — SW_AI_W17-21-final (kubeheal)

작성일: 2026-07-11 (Asia/Seoul) · 범위: `src/`(백엔드), `frontend/`, `deploy/`·`infra/`·`config/`·`alembic/`·`scripts/`·`.github/`
방식: **읽기 전용 분석. 코드는 수정하지 않았다.** 실제 코드를 읽고 교차 검증했다.

> 이 문서는 지원 범위 감사 스냅샷이다. 의도된 501/503과 provider 비활성 항목은 완료
> 선언이 아니며, 최종 배포 상태는 `current-service-state.md`를 우선한다.

## 총평

이 프로젝트는 완성도가 매우 높다. **우발적(계획에 없던) 구현 공백 = 0건.** 죽은 버튼, 목업/하드코딩 데이터, "준비 중" 텍스트, 빈 페이지 컴포넌트, 조용히 삼키는 에러 경로가 전무하다. `pass`/`...`/`except: pass`는 모두 관용적 사용(예외 클래스 바디, Protocol 스텁, 정당한 폴백)이다. 남은 구현 범위는 전부 **의도적으로 명시된 것**(501/503, `UNAVAILABLE` 상태, 피처 플래그, fail-closed 게이트)이며, HANDOVER §10에 로드맵으로 문서화돼 있다.

분류: **(A) 의도된 미지원**(설계상 명시), **(B) 우발적 공백/스텁**.

| 영역 | A(의도) | B(우발) |
|---|---|---|
| 백엔드 | ~17 | 0 |
| 프론트엔드 | 1(테스트 하네스) | 0 |
| 인프라/배포 | 6 | 0 |

---

## 실제로 눈여겨볼 항목 (엔드포인트는 있으나 동작 안 함)

### ★ 카탈로그 설치 러너 부재 — 유일하게 사용자 영향 있는 데드엔드
- 위치: `src/domains/catalog/router.py:79-82`
- 내용: `POST /catalog/items/{item_id}/installs`가 아이템 조회·버전 해석·`DEPLOY_RUN` 권한 검사까지 다 하고 **항상 HTTP 501**(`catalog_install_runner_unavailable`)을 던진다. 권한(`CATALOG_INSTALL`), 라우트(`routes.py:84`), 시드 카탈로그의 `{"runner": "helm"}` 필드까지 있으나 **이를 소비하는 이벤트·워커·실행기가 `src/` 어디에도 없다.** (`services/ai`의 catalog는 RCA 원인 룰 YAML로 무관.)
- 영향: 카탈로그 조회는 실제 동작하지만 **설치는 완전히 비동작**. 501로 정직하게 노출됨.
- 성격: 의도적 스코프 제한(정직하게 표면화). 완성하려면 install 이벤트 + helm 실행 워커 신설 필요.

---

## A. 백엔드 — 의도된 미지원

### providers 카탈로그 (`src/domains/providers/catalog.py`)
11개 provider가 `ProviderStatus.UNAVAILABLE`(`adapter=None` + `unavailable_reason`)로 선언되고 `require_available_provider`(`:796`)가 선택을 거부한다. AVAILABLE 항목은 실제 어댑터로 뒷받침됨(GitHub SCM, Env/AWS-SM/K8s Secret Vault — 검증 완료).

- SOURCE: `git-url`, `gitlab`, `bitbucket`
- DEPLOY: `gitops-controller`(ArgoCD/Flux), `jenkins`
- CLOUD: `gcp`, `azure` / 외부 콘솔 계열 provider는 메타데이터 env 설정 시 런타임 AVAILABLE 승격
- SECRET: `vault`, `gcp-sm`
- 추가: `KUBEHEAL_DISABLED_PROVIDERS`에 명시된 provider는 런타임 강제 UNAVAILABLE(`:445`)

### 피처 플래그로 꺼둔 완성 코드
- `src/domains/release_flow/execution.py:129-140` — 라이브 GitOps 배포는 구현돼 있으나 `RELEASE_FLOW_LIVE_ENABLED` + `RELEASE_FLOW_LIVE_WORKSPACES` allowlist로 게이트. 기본은 demo/dry-run(`:56`). off면 `release_execution_blockers`가 blocker 반환.
- `src/domains/rca/router.py:107-108` — RCA 테스트 실행 API 전체가 `rca_test_runs_enabled()` + `RCA_TEST_RUNS_TOKEN` 없으면 404(fail-closed).

### 설정 게이트 fail-closed (구현 공백이 아닌 운영 가드)
- `gitops/dependencies.py:21`(webhook secret 미설정 503), `gitops/router.py:151`(webhook image 미설정 503), `target/router.py:484`(kubectl 부재 503)·`:322`(agent image 미설정 422), `rca/router.py:577`(alertmanager 미설정).

### 좁은 범위 기능
- 알림 전송(`src/services/alert/alert-worker/app.py`): `LogAlertProvider`(기본, 로그만) + `WebhookAlertProvider`(범용 HTTP POST)만 존재. 네이티브 Slack/이메일/PagerDuty 어댑터 없음(범용 webhook으로 대체). 주입형 전략이라 확장 가능하나 현재 채널 폭이 좁음.

---

## A. 프론트엔드 — 의도된 항목 (런타임 영향 없음)

- 런타임 UI 공백 0건. 모든 라우트가 실제 컴포넌트에 연결됨. `return null`은 가드/조건부 렌더, `placeholder=`는 입력 필드 안내문, `disabled=`는 실제 로직(`isPending`/`!valid`/RBAC)에 바인딩. `아직 …없습니다` 문구는 실제 API 응답 기반의 정당한 빈 상태.
- 남은 것은 테스트 하네스뿐: HANDOVER §10-9(`/` 제품 UI·`/console/` 아카이브·로그인 Playwright E2E·`frontend/tests/smoke.py` lint 완료).

---

## A. 인프라/배포 — 의도된 이연 (문서화됨)

1. `deploy/eks/` — README만 있고 매니페스트 없음. AWS 계정/VPC/IAM/도메인 확정 전 임의값 매니페스트 금지(명시).
2. Terraform "layer 1"만 — VPC/EKS/ECR/IAM만 코드화, 앱 배포는 `scripts/aws-up.sh` 담당(`infra/README.md`).
3. Terraform S3 remote backend 주석 처리(`infra/versions.tf:19-25`) — 로컬 state 기본, 부트스트랩 절차 문서화.
4. 자동 CD 부재 — 전 워크플로 수동 `workflow_dispatch`(gate-contract만 PR 트리거). Actions 예산 이슈로 의도적 비활성(HANDOVER §10, §11-8).
5. **Alembic 마이그레이션 미연결(운영상 주의)** — `alembic/versions/*.py` 9개는 실제 `upgrade()`/`downgrade()` 바디가 있으나, `deploy/management/kustomization.yaml`에 마이그레이션 Job이 없다. 스키마는 앱 기동 시 `create_all` 부트스트랩으로 생성. HANDOVER §10-1의 최우선 과제. **현재 마이그레이션 적용은 수동/암묵적이며 배포로 강제되지 않음** — 인프라 계층에서 실제 기능 공백에 가장 가까운 항목.
6. 기타 구조적 로드맵 — effect-intent TX 분리, worker subject별 동시성, event `payload_version`/upcaster, production HA(Multi-AZ PG·Redis failover·NATS R3·NetworkPolicy·PDB/HPA), realtime-gateway 다중 레플리카 backplane, production 인증 전환(`APP_ENV=production` + bypass off), agent-api ACM/ELB/DNS IaC 이전 (HANDOVER §10-2~8).

---

## B. 우발적 공백 — 백엔드·프론트·인프라 전부 0건

오탐으로 걸러낸 대표 사례(정당함 확인): providers 예외 클래스 `pass` 바디, `EvidenceSource` Protocol `...`, `placeholder_change_ticket`(플레이스홀더 티켓 *탐지* 로직), 각종 `except: pass`(WS disconnect/타입 강제/타임아웃 폴백), `empty_provider_payload`/`aggregate_evidence_payload`의 빈 형태 반환(실패/미완 조기 반환), scripts의 `PLACEHOLDER_*`(placeholder 값을 *거부*하는 검증 가드). 소스에 `NotImplementedError`·`TODO`/`FIXME`/`HACK` 없음(오래된 `.pyc`에만 존재).

---

## 우선 조치 제안 (완성하려면)

1. **카탈로그 설치 러너** — install 이벤트 발행 + helm 실행 워커 구현. 엔드포인트·권한·시드는 이미 준비됨.
2. **Alembic 마이그레이션 Job** — 배포에 revision 기반 마이그레이션 Job 추가, `create_all` 부트스트랩 대체(HANDOVER §10-1).
3. provider 어댑터 확장(GitLab/Bitbucket/ArgoCD/Jenkins 등)·알림 채널(Slack/이메일) — 필요 시.

나머지(피처 플래그·fail-closed 게이트·EKS/HA 로드맵)는 의도된 이연이며 문서와 일치한다.
