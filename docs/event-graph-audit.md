# 이벤트 그래프 진단 — 중복·고아·병합/분리 (2026-07-08)

전 서비스의 `@app.on(...)` 구독과 `yield ...Body(...)` 발행, gateway 발행 지점을 대조한 결과다.

## 0. 실행 방법

```bash
PYTHONDONTWRITEBYTECODE=1 make events
```

`make events`는 `uv run python scripts/events.py`를 실행한다. 스크립트는 domain의 `@event(...)` body 정의와 worker `App` 서비스의 `@app.on(...)`/`@app.on_any(...)` 등록을 import해 `events.describe()` 표를 출력한다. `PYTHONDONTWRITEBYTECODE=1`은 감사 실행 중 `__pycache__` 파일 생성을 막기 위한 옵션이다.

## 1. safe-pr-worker vs scm-worker — 중복 아님, 단 정책 이중 실행

두 워커는 실제로 모두 존재하며 역할이 다르다. safe-pr-worker는 `safe_pr.requested → patch_prepared`(패치 초안 준비), scm-worker는 `safe_pr.ready_for_creation → GitHub REST PR 생성 → created/failed`를 담당한다. 그 사이에 ai-diff-worker가 `patch_prepared → diff.explained + ready_for_creation`으로 연결한다.

다만 `DefaultSafePrPreflightPolicy` 평가와 provider mismatch 검사가 **양쪽에서 각각 실행**된다(STAGE_PREPARE, STAGE_SCM). 심층 방어로 볼 수도 있으나 정책이 갈라질(drift) 위험이 있으므로, 정책 버전을 이벤트에 실어 scm 단계에서는 재검증 여부만 선택하게 하는 정리를 권한다.

## 2. 고아(orphan) 감사

엄밀한 의미의 고아 subject는 없다. `audit-worker`와 `dashboard-worker`가 `>` 전체 구독자로 모든 이벤트를 소비하기 때문이다. 다만 typed downstream worker가 없는 subject는 아래처럼 의도별로 분류해 문서에 남긴다.

| 분류 | subject | 판단 |
| --- | --- | --- |
| terminal/outbound | `agent.connected`, `ai.message.responded`, `ai.message.failed`, `alert.dispatched`, `alert.rejected`, `mail.email_verification.sent`, `mail.email_verification.failed`, `cluster.inventory.snapshot.recorded` | 외부 전송 결과·연결 기록·최종 상태다. audit/dashboard 전체 구독 기록만 있으면 충분하다 |
| human/UI gate | `approval.requested`, `approval.recommended`, `rca.followup.required` | 사용자가 보는 승인·추천·후속 조치 상태다. 별도 worker 소비보다 read model 노출이 목적이다 |
| read-model/timeline only | `cluster.reconcile.started`, `cluster.reconcile.completed`, `cluster.reconcile.failed`, `command.dispatched`, `diff.explained`, `incident.detected`, `rca.rule_missing`, `workflow.created`, `workflow.run.started`, `workflow.step.recorded`, `workflow.run.failed` | workflow/RCA/timeline 상태 기록용이다. UI 요구가 커지면 dashboard projection 매핑만 확장한다 |
| 예약 | `audit.>` | `RESERVED_STREAM_SUBJECTS`의 의도된 예약 prefix다. 현재 발행자는 없다 |

소비자는 있으나 코드상 직접 발행자가 안 보이는 subject도 확인했다. `git.webhook.received`, `ai.message.received`, `approval.granted`, `approval.rejected`, `command.requested`, `cluster.desired_state.changed`, `cluster.evidence.received`, `mail.email_verification.requested`, `recovery.action_selected`, `command.completed`는 gateway/API, target agent, command-janitor, timer producer, 사용자 action 등 런타임 진입점에서 발생하는 의도된 inbound subject다.

이전 문서의 `alert.dispatched`/`alert.rejected` self-subscription 설명은 현재 그래프 기준으로 낡았다. 현행 alert-worker에는 해당 자기 구독 핸들러가 없다.

## 3. 병합 후보

- `command.dispatch.ready`는 command-worker에서 제거했고, 계획 수립과 라우팅 결과는 `command.dispatched` 하나로 표현한다. dashboard timeline도 `command.dispatched`를 기준으로 본다.
- **target-drift-worker**: 핸들러 1개(`cluster.drift.detected → alert.requested` 변환)뿐. reconcile-worker 또는 alert 브리지(dead-letter-monitor처럼 alert 도메인)로 흡수 검토.
- **backlog-worker**: 단일 핸들러 DB 적재. rca-feedback-worker와 합쳐 "RCA 후속 처리 워커"로 통합 가능.
- alert-worker의 로그 전용 self-subscription 2개 제거(위 표 참조).

## 4. 분리/정리 후보

- **workflow-controller**: 13개 subject 구독 + 워크플로 상태기계 + 승인 게이트 + 실패 판정 + command 연계까지 담당해 가장 비대하다. 승인(approval) 게이트를 별도 워커로 분리하면 승인 정책 변경이 워크플로 코드에 영향을 주지 않는다.
- `src/services/ai/agent/` 공유 패키지(pipeline/recovery)는 8개 AI 워커가 공유하는 사실상의 라이브러리다. 중복 코드는 아니지만 서비스 폴더 안에 있어 소유권이 모호하므로 `src/packages/`로 승격 검토.
- github-poll-worker는 NATS 발행이 아니라 **Gateway /github/webhook로 HTTP 재진입**한다(webhook 경로 재사용). 중복은 아니지만 다이어그램/문서에 자주 잘못 그려지는 지점.

## 5. 스케줄러 — "유지해라"를 확인·조절하는 주체

관리 측에 별도 스케줄러 워커는 없고, 스케줄링은 세 곳에 분산되어 있다.

**cluster-agent 내부 제어 루프 (agent.py, 총 8개)** — 관리 영역은 desired state와 command 큐만 두고, 실제 "확인하고 조절"은 에이전트가 주기 루프로 수행한다:

| 루프 | 주기 env | 역할 |
| --- | --- | --- |
| command poll | COMMAND_RETRY_DELAY | Gateway 큐에서 명령 당겨 실행 |
| command outbox flush | COMMAND_OUTBOX_FLUSH_INTERVAL | 실행 결과 재전송 보장 |
| command heartbeat | COMMAND_HEARTBEAT_INTERVAL | 실행 중 명령 생존 신고 |
| policy sync | POLICY_SYNC_INTERVAL | /agent/policy 주기 동기화 |
| **desired-state reconcile** | RECONCILE_INTERVAL | `control/reconciler.py` — DesiredResource를 K8s에 merge-patch/POST로 apply |
| evidence job scheduler | EVIDENCE_INTERVAL + provider별 | lease 기반 잡 큐(schedule_forever/work_forever) |
| rollout poll | KUBERNETES_ROLLOUT_POLL_INTERVAL | 롤아웃 상태 관찰 |
| node-collector reconcile | NODE_COLLECTOR_RECONCILE_INTERVAL | DaemonSet 설치 상태 유지 |

**command-janitor (관리 측, 15초 스윕)**: heartbeat가 끊겨 만료된 명령을 강제 `command.completed`(실패 결과)로 정리한다 — 명령 lifecycle을 감시·조절하는 관리 측 스케줄러가 바로 이것이다.

**github-poll-worker**: 주기 폴링 후 Gateway로 HTTP 재진입.

즉 흐름은: Gateway `/targets` → `cluster.desired_state.changed` → target-reconcile-worker(관리 측 판정·drift 감지) ↔ agent reconcile 루프(실제 apply) + command-janitor(만료 정리)로 닫힌다.
