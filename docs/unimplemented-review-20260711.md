# 지원 범위 분석 보고서 — SW_AI_W17-21-final (kubeheal)

작성일: 2026-07-11 (Asia/Seoul) · 범위: `src/`(백엔드), `frontend/`, `deploy/`·`infra/`·`config/`·`alembic/`·`scripts/`·`.github/`
방식: **읽기 전용 분석. 코드는 수정하지 않았다.** 실제 코드를 읽고 교차 검증했다.

> 이 문서는 2026-07-11 후속 구현까지 반영한 지원 범위 감사다. 최종 배포 상태는
> `current-service-state.md`를 우선한다.

## 총평

사용자 영향이 있던 유일한 데드엔드인 catalog install 501은 실제 Agent Helm runner로 연결했다.
확인된 production 목업·페이크 데이터·조용한 성공 처리·빈 라우트는 0건이다. 남은 미지원 항목은
provider catalog의 명시적 `UNAVAILABLE`, 안전한 피처 플래그, 운영 인프라 전환 과제다.

분류: **(A) 의도된 미지원**(설계상 명시), **(B) 우발적 공백/스텁**.

| 영역 | A(의도) | B(우발) |
|---|---|---|
| 백엔드 | provider/채널 확장 범위 | 0 |
| 프론트엔드 | 1(테스트 하네스) | 0 |
| 인프라/배포 | 6 | 0 |

---

## 해결된 사용자 영향 공백

### 카탈로그 설치 runner

- `POST /catalog/items/{item_id}/installs`는 실제 high-priority Agent command를 202로 enqueue한다.
- online target Agent가 `command_receiver`와 `catalog_helm_install` capability를 모두 광고해야 한다.
- 서버 소유 PostgreSQL/Redis OCI digest recipe와 sandbox namespace만 허용한다.
- `Idempotency-Key`, 선언 values 검증, management 차단, private values 파일, `shell=False`, timeout,
  실제 Helm 종료 코드 기반 성공/실패를 적용했다.
- 202는 실행 성공이 아니며 `GET /commands/{command_id}`가 최종 상태의 권위값이다.

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
5. **Alembic revision 전환 과제** — 배포 스크립트의 단일 `management-schema-bootstrap` Job이
   현재 `create_all`과 호환 DDL을 수행한다. API/워커는 `DATABASE_STARTUP_MODE=verify`로 읽기 검증만
   하므로 런타임 DDL 경합은 해결됐다. 남은 과제는 bootstrap 구현을 Alembic revision 기반으로
   교체하고 revision 일치를 검증하는 것이다.
6. 기타 구조적 로드맵 — effect-intent TX 분리, worker subject별 동시성, event `payload_version`/upcaster, production HA(Multi-AZ PG·Redis failover·NATS R3·NetworkPolicy·PDB/HPA), realtime-gateway 다중 레플리카 backplane, production 인증 전환(`APP_ENV=production` + bypass off), agent-api ACM/ELB/DNS IaC 이전 (HANDOVER §10-2~8).

---

## B. 우발적 공백 — 백엔드·프론트·인프라 전부 0건

오탐으로 걸러낸 대표 사례(정당함 확인): providers 예외 클래스 `pass` 바디, `EvidenceSource` Protocol `...`, `placeholder_change_ticket`(플레이스홀더 티켓 *탐지* 로직), 각종 `except: pass`(WS disconnect/타입 강제/타임아웃 폴백), `empty_provider_payload`/`aggregate_evidence_payload`의 빈 형태 반환(실패/미완 조기 반환), scripts의 `PLACEHOLDER_*`(placeholder 값을 *거부*하는 검증 가드). 소스에 `NotImplementedError`·`TODO`/`FIXME`/`HACK` 없음(오래된 `.pyc`에만 존재).

---

## 우선 조치 제안 (완성하려면)

1. **Alembic revision 전환** — 기존 단일 bootstrap 경계는 유지하고 내부 DDL만 revision 기반으로 교체.
2. provider 어댑터 확장(GitLab/Bitbucket/ArgoCD/Jenkins 등)·알림 채널(Slack/이메일) — 제품 범위가 확정될 때 추가.
3. production HA/NetworkPolicy/실인증 전환 — HANDOVER의 운영 전환 게이트를 따른다.

나머지(피처 플래그·fail-closed 게이트·EKS/HA 로드맵)는 의도된 이연이며 문서와 일치한다.
