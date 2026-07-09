# Release Flow 구현 정리

## 한 줄 요약
릴리즈 플로우는 여러 애플리케이션을 순서대로 배포하고, 단계별 승인/검증/실패 대응을 관리하는 운영 기능이다. 현재 구현은 `demo` 모드로 실제처럼 실행 흐름을 보여주고, `live` 모드는 환경변수와 권한 조건을 통과해야 실제 GitOps 이벤트를 발행한다.

## 사용 흐름
1. 운영자가 `/release-flows` 화면에서 릴리즈 플랜을 만든다.
2. 각 step에 애플리케이션, 브랜치, manifest path, commit SHA, image, 환경, 승인 gate, 배포 전략을 넣는다.
3. preview가 의존성 그래프를 계산해서 wave 순서와 blocker를 보여준다.
4. `Start tracked run` 또는 `Dispatch wave`를 누르면 release run이 생성되고 step 상태가 기록된다.
5. workflow/approval/RCA/Safe PR/command 이벤트가 들어오면 `release-flow-worker`가 release run 상태와 timeline에 반영한다.
6. 실패하면 RCA 증거 수집 job을 자동으로 queue하고, 운영자는 pause/resume/advance/retry/rollback/cancel로 런을 제어한다.

## 구현된 파일
- Backend API: `src/domains/release_flow/router.py`
- 실행 정책: `src/domains/release_flow/execution.py`
- preview/wave 계산: `src/domains/release_flow/preview.py`
- DB repository: `src/domains/release_flow/repository.py`
- event projection: `src/domains/release_flow/projection.py`
- DB models: `src/domains/release_flow/models.py`
- projection worker: `src/services/projection/release-flow-worker/app.py`
- Frontend: `frontend/src/features/release/`
- Gateway contracts: `src/packages/contracts/gateway/routes.py`, `requests.py`, `responses.py`
- DB migration: `alembic/versions/20260706_0001_release_flow_tables.py`
- Deployment manifest: `deploy/management/services.yaml`

## API 범위
- `POST /release-plans`
- `PUT /release-plans/{plan_id}`
- `GET /release-plans`
- `GET /release-plans/{plan_id}`
- `POST /release-plans/preview`
- `POST /release-readiness`
- `POST /release-plans/dispatch?wave=1`
- `POST /release-plans/start`
- `POST /release-plans/{plan_id}/archive`
- `DELETE /release-plans/{plan_id}?force=false`
- `GET /release-runs`
- `GET /release-runs/summary`
- `GET /release-runs/{run_id}`
- `GET /release-audit`
- `GET /release-audit/export`
- `POST /release-runs/{run_id}/advance`
- `POST /release-runs/{run_id}/pause`
- `POST /release-runs/{run_id}/resume`
- `POST /release-runs/{run_id}/retry`
- `POST /release-runs/{run_id}/rollback`
- `POST /release-runs/{run_id}/cancel`
- `DELETE /release-runs/{run_id}?force=false`

## 실서비스 안전장치
- 기본값은 `demo` 모드라 실제 GitOps 이벤트를 발행하지 않는다.
- `live` 모드는 `RELEASE_FLOW_LIVE_ENABLED=1`과 `RELEASE_FLOW_LIVE_WORKSPACES` allow-list를 통과해야 한다.
- plan 생성/수정/삭제/dispatch/run action은 `DEPLOY_RUN` 권한을 요구한다.
- plan/run 조회와 summary는 애플리케이션 read 권한을 확인한다.
- `GET /release-runs/summary`가 `/release-runs/{run_id}`에 가려지지 않도록 route 순서 테스트를 추가했다.
- advance/rollback 같은 상태 변경 action은 권한 확인 후에만 상태를 바꾼다.
- retry는 현재 wave의 failed/unhealthy step만 다시 dispatch하고, plan/step의 `retry_attempts` 예산을 넘으면 차단한다.
- workflow 실패, 승인 요청, 승인 거절은 `alert.requested`로 이어져 기존 alert-worker/log/webhook/channel 라우팅을 재사용한다.
- active run/plan 삭제는 기본 차단하고 `force=true`를 명시해야 한다.
- release run timeline과 audit/export details는 password/token/secret/credential류 key를 `<redacted>`로 마스킹한다.

## 프론트에서 보이는 것
- 플랜 목록, 새 플랜, 저장, 아카이브, 삭제, 강제 삭제
- step 편집: application, branch, manifest path, commit SHA, image, namespace, replicas, strategy, gate, dependency
- dependency graph와 wave preview
- deterministic diagnostics와 YAML marker
- release run 운영 요약: 전체 run 수, 상태별 run 수
- 최신 run 상태, step 상태, GitHub/commit 링크, timeline 이벤트
- 실패/승인대기/승인거절 운영 알림은 alert-worker가 설정된 채널로 전달
- release audit 조회와 CSV export
- release audit UI CSV export

- release readiness 조회: preview blocker, dispatch 필수 입력값, live gate, alert channel, retry policy, audit/redaction 상태
- release readiness app context: 등록 application, repo, branch, manifest path, cluster context 누락을 dispatch 전에 차단
- live gate 입력: plan/step 단위 approval granted, change ticket, Safe PR URL/ready 값을 UI에서 설정
- release alerts panel: `/release-flows`에서 alert channel 개수/활성 채널/severity 요약을 확인하고 `/settings/alerts`로 이동

## 검증
- `py -3 -m pytest -q tests/test_release_flow_diagnostics.py tests/test_release_flow_projection.py`
- `py -3 -m pytest -q tests/test_release_flow_smoke_script.py`
- `npm --prefix frontend run typecheck`

## 운영 smoke
기본 모드는 release run을 만들지 않고 health/auth/applications/release API/preview만 확인한다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py
```

demo release run까지 생성해서 projection 전 단계의 tracked run 생성 경로를 확인하려면 명시적으로 `--demo-run`을 붙인다. 이 모드는 `runtime_mode=demo`, `provider_mode=dry_run` 플랜만 사용하므로 live GitOps dispatch를 호출하지 않는다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --demo-run
```

## 아직 운영에서 추가하면 좋은 것
- 실제 target cluster와 연결한 `live` end-to-end smoke test
- 실패 run/DLQ/retry 지표를 대시보드나 알림 채널에 연결
- 운영 전환 SOP: demo에서 live로 바꾸는 조건, 승인 책임자, rollback 기준
- 운영 smoke test 스크립트: 샘플 앱 2~3개로 wave/승인/실패/rollback을 자동 점검

## 운영 요약 신호
`GET /release-runs/summary`는 단순 status breakdown 외에 운영자가 바로 볼 수 있는 파생 카운터를 내려준다.

- `attention_required_runs`: 실패, 롤백 요청, 승인 대기, unhealthy run처럼 먼저 확인해야 하는 run 수
- `active_runs`: 아직 종료되지 않고 진행 중이거나 대기 중인 run 수
- `live_runs`: live 모드이거나 step에 실제 side effect가 기록된 run 수
- `rollback_requested_runs`, `waiting_for_approval_runs`, `unhealthy_runs`, `failed_runs`: 대시보드 배지와 알림 라우팅에 바로 쓰는 세부 카운터
- `last_run_status`: 접근 권한이 확인된 최신 run의 상태
