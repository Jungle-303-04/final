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
- `GET /release-runs/{run_id}/handoff`
- `GET /release-audit`
- `GET /release-audit/export`
- `POST /release-runs/{run_id}/advance`
- `POST /release-runs/{run_id}/pause`
- `POST /release-runs/{run_id}/resume`
- `POST /release-runs/{run_id}/retry`
- `POST /release-runs/{run_id}/rollback`
- `POST /release-runs/{run_id}/cancel`
- `POST /release-runs/{run_id}/notify`
- `DELETE /release-runs/{run_id}?force=false`

## 실서비스 안전장치
- 기본값은 `demo` 모드라 실제 GitOps 이벤트를 발행하지 않는다.
- `live` 모드는 `RELEASE_FLOW_LIVE_ENABLED=1`과 `RELEASE_FLOW_LIVE_WORKSPACES` allow-list를 통과해야 한다.
- plan 생성/수정/삭제는 `application.manage`, dispatch/start/advance/retry/pause/resume/notify는 `deploy.run`, rollback은 `rollback.run`, cancel/run delete는 `runner_job.cancel`, audit/export는 `evidence.read` 권한을 요구한다.
- plan/run 조회와 summary는 애플리케이션 read 권한을 확인한다.
- `GET /release-runs/summary`가 `/release-runs/{run_id}`에 가려지지 않도록 route 순서 테스트를 추가했다.
- advance/rollback 같은 상태 변경 action은 권한 확인 후에만 상태를 바꾼다.
- advance는 현재 wave의 step status가 succeeded이고 post-deploy verification job이 passed/completed/healthy일 때만 다음 wave로 넘어간다. verification이 pending이거나 failed/unhealthy이면 차단한다.
- retry는 현재 wave의 failed/unhealthy step만 다시 dispatch하고, plan/step의 `retry_attempts` 예산을 넘으면 차단한다.
- workflow 실패, 승인 요청, 승인 거절은 `alert.requested`로 이어져 기존 alert-worker/log/webhook/channel 라우팅을 재사용한다.
- post-deploy verification job 실패도 `alert.requested`로 이어져 배포 후 검증 실패를 운영 채널에 critical로 전달한다.
- live release dispatch/start/advance/retry는 warning 이상 release event를 받을 수 있고 최근 검증 테스트가 통과한 enabled alert channel이 있어야 실제 GitOps 이벤트 발행을 허용한다. 최근 기준은 기본 24시간이며 `RELEASE_FLOW_ALERT_TEST_MAX_AGE_HOURS`로 조정할 수 있다.
- live release dispatch/start/advance/retry는 `require_diagnostics_pass`가 켜져 있으면 deterministic release diagnostics의 error/warning이 없어야 실제 GitOps 이벤트 발행을 허용한다.
- live release에서 `require_diagnostics_pass=false`로 diagnostics gate를 우회하려면 `diagnostics_override_reason`을 남겨야 한다.
- live release에서 `rollback_policy=disabled`로 rollback을 끄려면 `rollback_override_reason`을 남겨야 한다.
- live production release는 change ticket이 필요하며, ticket 없이 진행하려면 `production_change_override_reason`을 남겨야 한다.
- live production release는 `release_window_start`와 `release_window_end` 사이에서만 진행되며, window 밖에서 진행하려면 `release_window_override_reason`을 남겨야 한다.
- live production release는 승인된 상태라도 `approval_granted_by`, `approval_reason`, `approval_granted_at`을 남겨야 하며, 승인 시각이 `RELEASE_FLOW_APPROVAL_MAX_AGE_HOURS` 기준보다 오래되면 실제 GitOps 이벤트 발행을 차단한다.
- live production release는 `runbook_url`이 필요하며, URL 없이 진행하려면 `runbook_override_reason`을 남겨야 한다.
- live production release는 `release_owner` 또는 `oncall_contact`가 필요하다.
- live production release는 post-deploy 검증 근거가 필요하며, step/plan의 `health_check_path` 또는 `post_deploy_verification_url`이 없으면 `verification_override_reason`을 남겨야 한다.
- live production release는 rollback/abort 기준이 필요하며, step/plan의 `rollback_trigger` 또는 `abort_criteria`가 없으면 `abort_criteria_override_reason`을 남겨야 한다.
- live dispatch step/audit details에는 readiness impact, dispatch warning actions, diagnostics gate, override reason, alert validation window, validated alert channel snapshot, post-deploy verification evidence, automatic verification job snapshot/result, rollback/abort criteria를 `release_guard`로 남긴다.
- saved alert channel test results keep `last_tested_at`, status, detail, and HTTP status code so operators can see whether a channel was recently validated.
- active run/plan 삭제는 기본 차단하고 `force=true`를 명시해야 한다.
- release run timeline과 audit/export details는 password/token/secret/credential류 key를 `<redacted>`로 마스킹한다.

## 프론트에서 보이는 것
- 플랜 목록, 새 플랜, 저장, 아카이브, 삭제, 강제 삭제
- step 편집: application, branch, manifest path, commit SHA, image, namespace, replicas, strategy, gate, dependency
- dependency graph와 wave preview
- execution preview copy: executable 상태, blockers, wave 순서, step 목록을 Markdown으로 복사해 배포 리뷰에 공유
- deterministic diagnostics와 YAML marker
- release run 운영 요약: 전체 run 수, 상태별 run 수
- 최신 run 상태, step 상태, GitHub/commit 링크, timeline 이벤트
- 실패/승인대기/승인거절/배포 후 검증 실패 운영 알림은 alert-worker가 설정된 채널로 전달
- release audit 조회와 CSV export
- release dispatch guard snapshot: live 실행 시 readiness impact, warning action, diagnostics/alert gate 통과 근거와 post-deploy verification job snapshot/result를 run step details와 audit event details에 기록
- release audit UI CSV export

- release readiness 조회: preview blocker, dispatch 필수 입력값, live gate, diagnostics gate, alert channel, retry policy, audit/redaction 상태
- release readiness impact: `/release-readiness`가 영향받는 application, environment, wave, production target, first wave step을 `impact`로 요약
- release readiness next actions: `/release-readiness`가 blocked/warning 체크를 `next_actions`로 요약해서 운영자가 dispatch 전에 고칠 항목이나 검토할 항목을 바로 확인
- release readiness app context: 등록 application, repo, branch, manifest path, cluster context 누락을 dispatch 전에 차단
- release readiness copy: readiness summary, impact, next actions, checks를 Markdown으로 복사해 승인/온콜/교대 채널에 공유
- live gate 입력: plan/step 단위 approval granted, change ticket, Safe PR URL/ready 값을 UI에서 설정
- diagnostics override 입력: diagnostics gate를 끄는 경우 운영 사유를 UI에서 입력
- rollback override 입력: rollback policy를 disabled로 두는 경우 운영 사유를 UI에서 입력
- production change override 입력: live production release에서 change ticket 없이 진행하는 경우 운영 사유를 UI에서 입력
- release window 입력: live production release의 승인된 시작/종료 시각과 window override 사유를 UI에서 입력
- approval evidence 입력: production live approval의 승인자, 승인 사유, 승인 시각을 UI에서 입력
- runbook 입력: production live release의 운영 runbook URL 또는 runbook override 사유를 UI에서 입력
- owner/contact 입력: production live release의 책임자 또는 온콜 연락처를 UI에서 입력
- verification 입력: production live release의 health check path, post-deploy verification URL, 또는 verification override 사유를 UI에서 입력
- abort criteria 입력: production live release의 rollback trigger, abort criteria, 또는 abort criteria override 사유를 UI에서 입력
- release alerts panel: `/release-flows`에서 alert channel 개수/활성 채널/severity 요약을 확인하고 `/settings/alerts`로 이동
- alert channel validation: 저장된 alert channel의 마지막 테스트 통과/실패와 검증 시각을 `/settings/alerts` 목록에서 확인
- release approval card: waiting approval step에 기존 approval grant/reject UI를 노출하고 승인 후 release run/audit query 갱신
- active run lock: 같은 저장된 release plan에 active run이 있으면 start/dispatch를 409 blocker로 차단
- readiness active run lock: 저장된 plan의 active run blocker를 실행 전 readiness에도 표시
- operator action controls: pause/resume/retry/rollback/cancel 액션은 운영자 사유를 입력받아 audit details에 남기고, `rollback_policy=disabled` run은 rollback 요청을 409 blocker로 차단
- operator action reason presets: pause/resume/retry/rollback/cancel/notify prompt 기본 사유에 run id, status/health, attention reason을 반영해 audit 문맥을 개선
- operator action disabled hints: advance/retry/pause/rollback/cancel/notify/delete 버튼이 비활성화된 이유를 tooltip으로 표시
- destructive action confirmation: rollback/cancel은 운영 사유 입력 후 확인 dialog를 한 번 더 통과해야 API를 호출
- live action confirmation: live side effect가 있는 run의 advance/retry는 실제 GitOps wave dispatch 가능성을 확인한 뒤 실행
- live start confirmation: live side effect가 있는 plan의 dispatch/start도 실제 GitOps event 발행 가능성을 확인한 뒤 실행
- preview action disabled hints: dispatch/start preview 버튼이 비활성화된 이유나 live confirmation 필요 여부를 tooltip으로 표시
- run history selector: release run이 여러 개 쌓이면 최신 run뿐 아니라 이전 run의 상태, wave, timeline을 선택해서 확인하고 필요한 운영 액션을 수행
- run deep link: 선택한 release run을 `run_id` query parameter로 보존하고 Copy link로 handoff/audit/timeline 컨텍스트를 공유
- attention reasons: failed, waiting approval, rollback requested, paused, unhealthy run/step에서 `attention.required/reasons`를 파생해 API와 UI에서 왜 조치가 필요한지 바로 표시
- stale run detection: active run의 `updated_at`이 `health_timeout_seconds` 또는 step timeout을 넘으면 stale attention reason과 `stale_runs` summary 카운터를 표시
- verification failure summary: post-deploy verification job 실패가 있는 run 수를 `verification_failed_runs` summary 카운터와 UI card로 표시
- run filters: `GET /release-runs`와 UI에서 all/attention/stale/active/live/succeeded/failed/paused/cancelled/rollback requested/unhealthy/waiting approval/verification failed/verification timeout 기준으로 run 목록을 빠르게 필터링
- active run filter: 아직 terminal 상태가 아닌 run만 `active_only` API query와 UI 필터로 바로 조회
- run summary shortcuts: summary 카드의 attention/active/live/succeeded/failed/paused/cancelled/rollback/waiting approval/unhealthy/verification/stale 숫자를 누르면 대응하는 run filter로 바로 전환
- recent run shortcuts: summary의 `recent_runs`를 Run panel에 표시하고, 최근 run을 누르면 `All runs`로 전환하면서 해당 run을 바로 선택
- unhealthy run filter: run health나 step health가 unhealthy인 run만 `unhealthy_only` API query와 UI 필터로 바로 조회
- verification failed filter: post-deploy verification job이 failed/error/unhealthy인 run만 `verification_failed_only` API query와 UI 필터로 바로 조회
- verification pending timeout: post-deploy verification job의 `queued_at`/`timeout_minutes`를 기록하고, 오래 pending/queued/running인 job을 summary, UI filter, handoff blocked check로 표시
- verification timeout alert: timeout된 verification job이 있는 run의 수동 notify 알림을 critical로 올리고 job id/kind/경과 시간/timeout 기준을 메시지에 포함
- verification timeout status: verification worker가 `status=timeout`을 보낸 경우도 failed/error/unhealthy와 동일하게 실패 summary/filter/advance blocker/critical alert로 처리
- run-scoped audit/export: 선택한 release run의 `run_id`로 audit 조회와 CSV export를 좁혀 사고 리뷰와 배포 증적 제출에 바로 사용
- audit event filter/export: 선택한 run audit에서 workflow failure, approval, rollback, cancel, wave dispatch, evidence queued 같은 event type별 조회와 CSV export를 지원
- audit prefix filter: `release.notify.*`처럼 동적 timestamp suffix가 붙는 audit event를 prefix 기준으로 조회/CSV export
- audit operator filters: Audit 카드에서 `release.*`, `release.retry.*`, `release.notify.*` prefix filter를 바로 선택
- audit row metadata: Audit 카드의 event row에도 notify severity/application, retry attempt, RCA/evidence meta를 같이 표시
- audit copy: 현재 scope/filter의 release audit 이벤트 요약을 Markdown으로 복사해 사후 리뷰나 증적 코멘트에 공유
- attention alert: 선택한 attention/stale release run을 기존 `alert.requested` 파이프라인으로 수동 알림 요청
- notify cooldown/audit: release notify는 `release.notify.<timestamp>` audit event를 남기고 최근 알림이 있으면 cooldown blocker로 반복 알림 폭주를 차단
- notify cooldown handoff: notify cooldown 중에는 operator handoff의 notify next action과 UI Notify 버튼을 비활성화하고 남은 대기 사유를 표시
- rollback disabled handoff: rollback policy가 disabled인 run은 handoff next action에서도 rollback 비활성 사유를 표시
- notify audit metadata: notify audit details에 alert severity/cluster/namespace/application/workflow context를 남기고 timeline meta에서 빠르게 확인
- operator handoff: 선택한 release run의 headline, severity, 다음 조치, mode/health/attention/rollback/verification/verification job result/rollback criteria 체크를 한 번에 표시해 교대/온콜 인계를 빠르게 수행
- operator handoff copy: handoff panel 내용을 Markdown으로 복사해 같은 run 링크와 함께 채팅/이슈/교대 노트에 공유

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

운영 액션까지 rehearsal하려면 `--ops-rehearsal`을 붙인다. 이 모드는 demo release run을 만들고 `pause -> notify -> resume -> cancel -> get` 순서로 API를 확인한 뒤 cancel로 정리한다. 실제 GitOps dispatch는 여전히 호출하지 않는다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --ops-rehearsal
```

live release gate를 실제 설정값으로 사전 점검하려면 `--live-preflight`를 붙인다. 이 모드는 live plan payload를 만들어 `/release-readiness`까지만 호출하고, `/release-plans/start`나 GitOps dispatch는 호출하지 않는다.
외부 synthetic monitor나 상태 페이지를 검증 근거로 남기려면 `--live-verification-url`을 함께 넘긴다. 넘기지 않으면 기본 step health check path(`/readyz`)가 post-deploy verification evidence로 쓰인다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --live-preflight
```

알림 채널이 실제로 validation alert를 받을 수 있는지 확인하려면 `--alert-preflight`를 붙인다. 이 모드는 enabled alert channel 중 요청 severity를 받을 수 있는 채널을 골라 `/alert-channels/test`를 호출하므로, 실제 Slack/webhook/온콜 테스트 메시지가 발송될 수 있다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --alert-preflight
```

기존 release run에 post-deploy verification 실패나 pending timeout이 남아 있는지 운영 전에 확인하려면 `--verification-preflight`를 붙인다. 이 모드는 `/release-runs/summary`의 `verification_failed_runs`, `verification_pending_timeout_runs`를 확인하고, 문제가 있으면 `GET /release-runs?verification_failed_only=true` 또는 `verification_pending_timeout_only=true`로 대상 run을 조회한 뒤 smoke를 실패시킨다. 특정 plan만 좁히려면 `--verification-plan-id`를 함께 쓴다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --verification-preflight
```

기존 release run 중 실패, stale, rollback 요청, 승인 대기, unhealthy 상태처럼 운영자가 먼저 처리해야 하는 항목이 남아 있는지 확인하려면 `--run-health-preflight`를 붙인다. 이 모드는 `/release-runs/summary`의 운영 카운터를 보고 문제가 있으면 `GET /release-runs?attention_only=true`와 필요 시 `stale_only=true`로 대상 run을 조회한 뒤 smoke를 실패시킨다. 특정 plan만 좁히려면 `--run-health-plan-id`를 함께 쓴다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --run-health-preflight
```

## 아직 운영에서 추가하면 좋은 것
- 실제 target cluster와 연결한 `live` end-to-end smoke test
- 실패 run/DLQ/retry 지표를 대시보드나 알림 채널에 연결
- 운영 전환 SOP: demo에서 live로 바꾸는 조건, 승인 책임자, rollback 기준
- 운영 smoke test 확장: 실제 target 환경에서 샘플 앱 2~3개로 wave/승인/실패/rollback까지 자동 점검

## 운영 요약 신호
`GET /release-runs/summary`는 단순 status breakdown 외에 운영자가 바로 볼 수 있는 파생 카운터를 내려준다.

- `attention_required_runs`: 실패, 롤백 요청, 승인 대기, unhealthy run처럼 먼저 확인해야 하는 run 수
- `active_runs`: 아직 종료되지 않고 진행 중이거나 대기 중인 run 수
- `live_runs`: live 모드이거나 step에 실제 side effect가 기록된 run 수
- `succeeded_runs`, `cancelled_runs`, `paused_runs`, `rollback_requested_runs`, `waiting_for_approval_runs`, `unhealthy_runs`, `verification_failed_runs`, `failed_runs`: 대시보드 배지와 알림 라우팅에 바로 쓰는 세부 카운터
- `last_run_status`: 접근 권한이 확인된 최신 run의 상태
