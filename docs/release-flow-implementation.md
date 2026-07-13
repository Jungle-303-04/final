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

## 내부 모듈 분해 준비

`src/domains/release_flow/router.py`의 HTTP 동작을 바꾸지 않고 내부 모듈만 분리할 때의
의존 방향은 다음으로 고정한다. 이 절은 BQ-011 착수 전 조사 결과이며 코드 claim이나
구현 완료를 뜻하지 않는다.

```text
router → readiness → policy
                   → verification
router → policy
router → verification
router → report → verification
각 모듈 → _support
```

- `policy.py`: Safe PR 증거, 실행 blocker, required input, diagnostics, rollback, approval,
  change ticket/window/freeze/runbook/owner/abort, 활성 실행 잠금과 policy snapshot을 맡는다.
- `readiness.py`: readiness check/impact/next action과 dispatch readiness·warning을 맡고,
  policy와 verification을 함께 조립하는 `release_dispatch_guard_snapshot`도 여기에 둔다.
- `verification.py`: verification URL/evidence 검증, job spec·결정론 ID·timeout,
  advance blocker와 pending timeout 판정을 맡는다.
- `report.py`: run filter/summary/handoff/report/Markdown/audit 직렬화를 맡는다. DB 조회·인가와
  상태 변경은 계속 router에 남긴다.
- `_support.py`: `step_config`, `plan_settings_value`, 정수·UTC 파싱 등 shape 정규화만 두며
  업무 규칙을 넣지 않는다.

분해 과정에서는 blocker 순서·문구·check ID, `release_guard` 중첩 key, verification job ID
hash 입력, timeout fallback 순서를 관찰 가능한 계약으로 보존한다. 기존 테스트가
`domains.release_flow.router` 심볼과 module-global monkeypatch를 사용하므로 router의 호환
re-export와 patch 대상 정합을 함께 검증한다. import-linter에는 위 화살표만 허용하고
`policy/readiness/verification/report → router` 역방향을 금지한다.

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
- `GET /release-runs/{run_id}/report`
- `GET /release-runs/{run_id}/report/export`
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
- live production release is blocked during `change_freeze_start` to `change_freeze_end`; emergency dispatch during a freeze requires `change_freeze_override_reason`.
- live production release는 승인된 상태라도 `approval_granted_by`, `approval_reason`, `approval_granted_at`을 남겨야 하며, 승인 시각이 `RELEASE_FLOW_APPROVAL_MAX_AGE_HOURS` 기준보다 오래되면 실제 GitOps 이벤트 발행을 차단한다.
- live production release는 `runbook_url`이 필요하며, URL 없이 진행하려면 `runbook_override_reason`을 남겨야 한다.
- live production release는 `release_owner` 또는 `oncall_contact`가 필요하다.
- live production release는 실제 HTTPS `post_deploy_verification_url`이 필요하다. production에서는 `health_check_path`나 verification override 사유만으로 dispatch할 수 없다.
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
- change freeze input: live production release freeze start/end and emergency override reason are editable from the policy UI.
- approval evidence 입력: production live approval의 승인자, 승인 사유, 승인 시각을 UI에서 입력
- runbook 입력: production live release의 운영 runbook URL 또는 runbook override 사유를 UI에서 입력
- owner/contact 입력: production live release의 책임자 또는 온콜 연락처를 UI에서 입력
- verification 입력: production live release의 HTTPS post-deploy verification URL을 UI에서 입력
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
- run report copy: 선택한 release run의 상태, attention reason, handoff next action, step 상태, 최근 timeline을 Markdown으로 복사해 교대/사후 리뷰 노트에 공유
- run report API: `GET /release-runs/{run_id}/report`가 권한 확인된 run/handoff/redacted audit을 서버에서 Markdown report로 묶어 UI copy와 운영 증적에 사용
- run report export: `GET /release-runs/{run_id}/report/export`와 UI Download report 버튼으로 같은 Markdown report를 파일로 내려받아 이슈/교대 문서에 첨부
- run report checks: report Markdown에 handoff checks(mode/health/attention/rollback/verification/abort criteria)를 포함해 교대자가 passed/warning/blocked 상태를 파일만 보고 확인
- run report evidence: report Markdown에 verification evidence/job summary와 rollback criteria를 포함해 검증 근거와 rollback 기준을 사후 리뷰 문서에서 바로 확인
- run report context: report Markdown에 application, cluster, namespace, workflow, repo, commit, manifest path를 포함해 어떤 대상의 배포였는지 파일만 보고 확인
- run report audit summary: report Markdown에 audit/timeline 이벤트 수, 최신 이벤트, event type별 count를 포함해 사후 리뷰에서 이벤트 흐름을 빠르게 파악
- run report approvals: report Markdown에 step approval id, decision/status, gate, reason을 포함해 승인 흐름을 사후 리뷰와 교대 문서에서 확인
- change freeze handoff/report: active freeze, window, production targets, override reason을 operator handoff와 run report Markdown에 포함해 freeze override 근거를 교대/사후 리뷰에서 확인
- change freeze run filter: summary에 active freeze/override run 수를 표시하고 `active_change_freeze_only`, `change_freeze_override_only` API/UI filter로 freeze 영향/override run을 빠르게 조회
- policy override run filter: summary에 정책 override run 수를 표시하고 `policy_override_only` API/UI filter로 diagnostics, rollback, change ticket, release window, freeze, runbook, verification, abort criteria override run을 빠르게 조회
- policy override handoff/report: operator handoff와 report Markdown에 policy override source/reason/production targets를 모아 표시해 예외 승인 근거를 바로 리뷰
- policy override source breakdown: summary에 policy override source별 count를 제공하고 `policy_override_source` API/UI shortcut으로 특정 예외 유형 run만 조회

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

CI나 배포 직후처럼 backend가 잠깐 늦게 뜨는 상황에서는 safe read-only 요청만 재시도할 수 있다. 이 retry는 `GET` 계열 health/readiness/list/summary 요청에만 적용되고, release start나 alert test 같은 side effect 요청은 중복 실행 위험 때문에 재시도하지 않는다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --retry-attempts 5 \
  --retry-delay-seconds 2
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
production live preflight에서는 외부 synthetic monitor나 상태 페이지의 실제 HTTPS URL을 `--live-verification-url`로 반드시 넘긴다. `health_check_path`는 verification job을 추가로 예약할 수 있지만, production dispatch를 통과시키는 근거는 아니다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --live-preflight
```

운영/CI에서 새 production release 전에 가장 흔한 run 상태 위험을 한 번에 막으려면 `--production-preflight`를 붙인다. 이 모드는 run health, post-deploy verification, policy override, change freeze preflight를 모두 실행한다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --production-preflight
```

특정 release plan만 production preflight 대상으로 좁히려면 공통 scope 옵션을 쓴다. 이 값은 run health, verification, policy override, change freeze 조회에 모두 적용된다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --production-preflight-plan-id "<plan id>" \
  --production-preflight-run-limit 10
```

CI artifact로 smoke 결과를 보관하려면 `--report-path`를 함께 쓴다. 성공/실패 모두 같은 JSON 구조로 저장되며, 실패한 preflight check와 대상 run id를 나중에 다시 볼 수 있다.
smoke JSON/JUnit/Markdown/GitHub summary에 쓰이는 detail과 error는 password, token, secret, credential, api key, cookie, Authorization bearer 값을 `<redacted>`로 마스킹한다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --report-path artifacts/release-flow-smoke.json
```

CI 테스트 리포트 UI에서 preflight 실패를 바로 보려면 `--junit-path`도 함께 쓴다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --report-path artifacts/release-flow-smoke.json \
  --junit-path artifacts/release-flow-smoke.junit.xml
```

PR comment나 운영 인계 노트에 붙일 사람이 읽는 report가 필요하면 `--markdown-path`를 함께 쓴다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --markdown-path artifacts/release-flow-smoke.md
```

GitHub Actions에서 job summary 화면에 smoke 결과를 바로 노출하려면 `--github-step-summary`를 함께 쓴다. 이 옵션은 `GITHUB_STEP_SUMMARY`가 있는 환경에서 Markdown report를 append한다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --github-step-summary
```

다음 GitHub Actions step이나 notify job에서 smoke 결과를 조건으로 쓰려면 `--github-output`을 함께 쓴다. 이 옵션은 `GITHUB_OUTPUT`에 `release_smoke_ok`, `release_smoke_failed_count`, `release_smoke_failed_checks`, `release_smoke_error`, `release_smoke_api_base_url`을 append한다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --github-output
```

GitHub Checks/PR 화면에 실패한 smoke check를 바로 annotation으로 띄우려면 `--github-annotations`를 함께 쓴다. annotation 메시지도 smoke artifact와 동일하게 민감정보가 마스킹된다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --github-annotations
```

CI에서 표준 산출물과 GitHub Actions 연동을 한 번에 켜려면 `--ci`를 쓴다. 명시하지 않은 경우 JSON, JUnit, Markdown artifact는 `--ci-artifacts-dir` 아래 기본 파일명으로 저장되고, `GITHUB_STEP_SUMMARY`, `GITHUB_OUTPUT`, `GITHUB_ACTIONS` 환경이 있으면 summary/output/annotation도 자동으로 켜진다.

```bash
python scripts/release_flow_smoke.py \
  --production-preflight \
  --ci \
  --ci-artifacts-dir artifacts/release-flow
```

GitHub Actions에서 바로 실행하려면 `.github/workflows/release-flow-smoke.yml`의 `Release Flow Smoke` workflow를 수동으로 dispatch한다. 자동 PR trigger로 열어두지 않은 이유는 운영 API URL과 로그인 secret이 필요한 smoke gate라서, 준비되지 않은 PR마다 실패시키지 않기 위해서다.

필요한 repository secrets는 다음 세 가지다.

- `RELEASE_FLOW_API_BASE_URL`: 예: `https://k8s.woonyong.org/api`
- `RELEASE_FLOW_AUTH_EMAIL`: 운영 smoke용 계정 email
- `RELEASE_FLOW_AUTH_PASSWORD`: 운영 smoke용 계정 password

수동 실행 input으로 `api_base_url`을 넣으면 `RELEASE_FLOW_API_BASE_URL` secret보다 우선한다. `production_preflight_plan_id`를 넣으면 특정 release plan만 검사하고, `production_preflight_run_limit`은 각 guardrail에서 확인할 release run 개수를 제한한다. `request_timeout_seconds`는 API 요청 1회당 timeout이며 기본 15초다. `retry_attempts`와 `retry_delay_seconds`는 safe read-only 요청의 재시도 횟수와 대기 시간이며 기본은 5회/2초다. `github_environment`는 기본 `production`이며, GitHub Environments의 required reviewers와 environment-scoped secrets를 smoke gate 앞에 붙이는 데 쓴다. `artifact_retention_days`는 기본 30일이며, release review나 감사 보관 정책에 맞춰 smoke artifact 보관 기간을 조정한다. `artifact_name`은 기본 `release-flow-smoke`이며, 여러 환경이나 릴리즈 plan의 smoke 증거를 구분해야 할 때 `release-flow-smoke-production`처럼 바꿀 수 있다.

workflow는 Actions 목록에서 `Release Flow Smoke / <environment> / <plan>` 형태의 run name을 사용하고, `scripts/release_flow_smoke.py --production-preflight --ci --ci-artifacts-dir artifacts/release-flow`를 실행한다. smoke step은 먼저 GitHub step summary, output, annotation, JSON/JUnit/Markdown artifact를 남기고, artifact upload가 끝난 뒤 `release_smoke_ok` output이 `true`가 아니면 job을 실패시킨다. 같은 `github_environment` 값으로 실행된 smoke job은 `release-flow-smoke-<environment>` concurrency group에 묶이며, 이미 진행 중인 smoke를 취소하지 않고 다음 job을 대기시킨다.

workflow는 smoke를 실행하기 전에 input을 검증한다. `production_preflight_run_limit`은 1~500, `request_timeout_seconds`는 1~120초 숫자, `retry_attempts`는 1~10 정수, `retry_delay_seconds`는 0~30초 숫자, `artifact_retention_days`는 GitHub artifact 제한에 맞춰 1~90 사이의 정수여야 한다. `artifact_name`은 비어 있으면 안 되고 GitHub artifact 이름에서 금지된 문자(`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)를 포함하면 안 된다. 범위를 벗어나면 smoke를 시작하지 않고 GitHub annotation으로 잘못된 입력을 표시한다. `alert_preflight`를 켜면 smoke가 enabled alert channel을 찾아 validation alert를 보내며, `alert_severity`는 `info`, `warning`, `critical` 중 하나여야 한다. 이 옵션은 실제 외부 알림 채널/webhook/온콜 테스트 메시지를 보낼 수 있으므로 기본값은 `false`다.

`live_preflight`를 켜면 workflow가 `--live-preflight`를 함께 실행해 live release readiness gate를 확인한다. 이 경로는 `/release-readiness`까지만 호출하고 `/release-plans/start`나 GitOps dispatch는 호출하지 않는다. `live_environment`와 `live_namespace`는 Kubernetes DNS label 형식이어야 하며, `live_change_ticket`은 비어 있으면 안 된다.

reusable workflow output은 `release_smoke_ok`, `release_smoke_failed_checks`, `release_smoke_failed_count`, `release_smoke_api_base_url`, `release_smoke_error`를 노출한다. 배포 job은 `release_smoke_ok`로 gate를 걸고, notify job은 실패 개수나 API URL을 메시지에 넣을 수 있다.

다른 배포 workflow에서 release-flow smoke를 gate로 재사용하려면 같은 파일을 `workflow_call`로 호출한다. 호출자는 `release_flow_api_base_url`, `release_flow_auth_email`, `release_flow_auth_password` secret을 넘기거나 `secrets: inherit`로 repository secret을 그대로 넘길 수 있다.

```yaml
jobs:
  release_flow_smoke:
    uses: ./.github/workflows/release-flow-smoke.yml
    with:
      github_environment: production
      artifact_name: release-flow-smoke-production
      artifact_retention_days: "30"
      alert_preflight: false
      alert_severity: warning
      live_preflight: false
      live_environment: production
      live_namespace: production
      live_change_ticket: CHG-PREFLIGHT
      production_preflight_plan_id: ${{ inputs.release_plan_id }}
      production_preflight_run_limit: "20"
      request_timeout_seconds: "15"
      retry_attempts: "5"
      retry_delay_seconds: "2"
    secrets:
      release_flow_api_base_url: ${{ secrets.RELEASE_FLOW_API_BASE_URL }}
      release_flow_auth_email: ${{ secrets.RELEASE_FLOW_AUTH_EMAIL }}
      release_flow_auth_password: ${{ secrets.RELEASE_FLOW_AUTH_PASSWORD }}

  deploy-production:
    needs: release_flow_smoke
    if: needs.release_flow_smoke.outputs.release_smoke_ok == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "deploy after release-flow smoke"

  notify-release-smoke-failure:
    needs: release_flow_smoke
    if: needs.release_flow_smoke.outputs.release_smoke_ok != 'true'
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "release smoke failed against ${{ needs.release_flow_smoke.outputs.release_smoke_api_base_url }}"
          echo "failed checks: ${{ needs.release_flow_smoke.outputs.release_smoke_failed_checks }}"
          echo "failed count: ${{ needs.release_flow_smoke.outputs.release_smoke_failed_count }}"
```

실제 production deploy workflow 앞에는 `.github/workflows/release-flow-production-gate.yml`의 `Release Flow Production Gate`를 표준 gate로 붙인다. 이 workflow는 `release-flow-smoke.yml`을 호출한 뒤 `release_gate_ok` output을 노출하고, smoke 결과가 `true`가 아니면 별도 `production_gate` job에서 실패를 확정한다. 따라서 실제 deploy job은 다음처럼 `needs.release_flow_production_gate.outputs.release_gate_ok == 'true'` 조건을 걸 수 있다.

```yaml
jobs:
  release_flow_production_gate:
    uses: ./.github/workflows/release-flow-production-gate.yml
    with:
      github_environment: production
      release_plan_id: ${{ inputs.release_plan_id }}
      live_preflight: true
      live_change_ticket: ${{ inputs.change_ticket }}
      live_verification_url: ${{ inputs.verification_url }}
    secrets:
      release_flow_api_base_url: ${{ secrets.RELEASE_FLOW_API_BASE_URL }}
      release_flow_auth_email: ${{ secrets.RELEASE_FLOW_AUTH_EMAIL }}
      release_flow_auth_password: ${{ secrets.RELEASE_FLOW_AUTH_PASSWORD }}

  deploy-production:
    needs: release_flow_production_gate
    if: needs.release_flow_production_gate.outputs.release_gate_ok == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/deploy-production.sh
```

`Release Flow Smoke` 자체도 smoke 실행 전에 `api_base_url` 또는 `RELEASE_FLOW_API_BASE_URL`, `RELEASE_FLOW_AUTH_EMAIL`, `RELEASE_FLOW_AUTH_PASSWORD`가 비어 있는지 먼저 확인한다. 운영 secret이 빠져 있으면 API 호출을 시작하기 전에 GitHub annotation으로 실패하므로, 실제 배포 실패와 설정 실패를 구분하기 쉽다.

`Release Flow Production Gate`는 production `live_preflight`가 켜진 경우 `live_change_ticket`을 필수로 요구하고, `CHG-PREFLIGHT` placeholder 값은 smoke 실행 전에 차단한다. 운영 배포 workflow에서는 실제 변경 티켓을 `live_change_ticket`에 넘겨야 하며, placeholder로 production gate를 통과시킬 수 없다.

같은 production gate는 `live_runbook_url`과 `live_release_owner` 또는 `live_oncall_contact`도 smoke 실행 전에 검사한다. `example.com` runbook, `release-operator`, `release-oncall@example.com` 같은 demo placeholder는 production gate에서 실패하므로 실제 runbook과 운영 책임자/온콜 연락처를 workflow input으로 넘겨야 한다.

직접 `scripts/release_flow_smoke.py --live-preflight`를 실행하는 경우에도 production 환경에서는 같은 placeholder guard가 적용된다. live preflight의 변경 티켓, runbook, owner/on-call 값은 기본값이 없으며 명시적으로 넣어야 한다. `CHG-PREFLIGHT`, `https://example.com/runbooks/release-flow`, `release-operator`, `release-oncall@example.com` 같은 demo 값은 `/release-readiness` payload를 만들기 전에 실패한다.

`.github/workflows/release-flow-gate-contract.yml`은 workflow 변경 PR에서 production deploy job이 release-flow gate를 우회하지 않는지 검사한다. 검사 기준은 `scripts/validate_release_flow_production_gate.py`에 있다. production deploy로 보이는 job은 같은 workflow 안에서 `.github/workflows/release-flow-production-gate.yml`을 호출하는 job을 `needs`에 포함해야 하고, deploy job의 `if` 조건은 `needs.<gate job>.outputs.release_gate_ok == 'true'`를 확인해야 한다. 이 검사는 아직 production deploy workflow가 없는 상태에서는 통과하지만, 나중에 workflow가 추가되면 gate 연결을 빠뜨린 PR을 실패시킨다.

계약 검사는 deploy job만 보지 않고 gate job의 `with` 값도 확인한다. production deploy workflow가 `Release Flow Production Gate`를 호출할 때 `live_change_ticket`, `live_runbook_url`, 그리고 `live_release_owner` 또는 `live_oncall_contact`를 넘기지 않으면 PR 단계에서 실패한다. `CHG-PREFLIGHT`, `https://example.com/runbooks/release-flow`, `release-operator`, `release-oncall@example.com` 같은 placeholder 값도 계약 위반으로 처리한다.

production 환경을 실제로 켜기 전에는 `.github/workflows/release-flow-production-readiness.yml`의 `Release Flow Production Readiness`를 수동 실행한다. 이 workflow는 GitHub Environment를 걸고 `RELEASE_FLOW_API_BASE_URL`, `RELEASE_FLOW_AUTH_EMAIL`, `RELEASE_FLOW_AUTH_PASSWORD`가 실제로 주입되는지 확인한 뒤, smoke workflow/gate workflow/gate contract가 모두 repo에 있는지 검사한다. 로컬에서는 다음처럼 static wiring만 빠르게 확인할 수 있다.

```bash
python scripts/validate_release_flow_production_readiness.py
```

실제 운영 secret까지 확인하려면 환경 변수나 GitHub Environment secret을 넣고 `--require-runtime-config`를 붙인다.

알림 채널이 실제로 validation alert를 받을 수 있는지 확인하려면 `--alert-preflight`를 붙인다. 이 모드는 enabled alert channel 중 요청 severity를 받을 수 있는 채널을 골라 `/alert-channels/test`를 호출하므로, 실제 외부 알림 채널/webhook/온콜 테스트 메시지가 발송될 수 있다.

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

기존 release run에 operator policy override가 남아 있는지 운영 전에 확인하려면 `--policy-override-preflight`를 붙인다. 이 모드는 `/release-runs/summary`의 `policy_override_runs`를 확인하고, 문제가 있으면 `GET /release-runs?policy_override_only=true`로 대상 run을 조회한 뒤 smoke를 실패시킨다. 특정 예외 유형만 좁히려면 `--policy-override-source "Change freeze"`를 함께 쓴다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --policy-override-preflight
```

기존 release run에 active change freeze 또는 change freeze override가 남아 있는지 운영 전에 확인하려면 `--change-freeze-preflight`를 붙인다. 이 모드는 `/release-runs/summary`의 `active_change_freeze_runs`, `change_freeze_override_runs`를 확인하고, 문제가 있으면 `GET /release-runs?active_change_freeze_only=true` 또는 `change_freeze_override_only=true`로 대상 run을 조회한 뒤 smoke를 실패시킨다.

```bash
API_BASE_URL="https://k8s.woonyong.org/api" \
AUTH_EMAIL="<admin email>" \
AUTH_PASSWORD="<admin password>" \
python scripts/release_flow_smoke.py --change-freeze-preflight
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

## Production live image guard

Production `live_preflight` now requires an explicit `live_image` value before
the smoke workflow calls `/release-readiness`. The direct smoke script, the
reusable smoke workflow, and `release-flow-production-gate.yml` all reject an
empty production image and the demo placeholder
`ghcr.io/example/release-flow-smoke:live-preflight`.

Production deploy workflows that call `Release Flow Production Gate` must pass
`live_image` with the same real image/tag that the deploy will promote. The
static contract checker also treats a missing `live_image` or the demo image as
a release-flow gate violation, so placeholder production wiring fails in PR
before it can reach a live gate run.
