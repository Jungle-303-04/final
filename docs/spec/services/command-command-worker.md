---
source_commit: 664925a6
status: synced
---

# command-worker — command.requested 정책 검증 → 실행 계획 → agent 큐 적재

> 소스: `src/services/command/command-worker/app.py` · 테스트: `tests/test_command_worker.py`, `tests/test_command_catalog.py`, `tests/test_event_golden_path.py`

## 책임 (Responsibility)

- `command.requested` 를 받아 정책(네임스페이스·액션 allowlist·승인 기록)을 검증하고, 통과 시 실행 `Plan` 을 만들어 `agent_commands` 큐(DB)에 적재하며 `command.dispatched → command.queued_for_agent` 를 발행한다. 거부 시 `command.rejected`.
- 명령 이벤트 처리 길목에서 **기회적으로** 만료 방치 명령을 정리(sweep)해 `command.completed`(FAILED) 를 흘린다 — 전용 [command-janitor](command-command-janitor.md)와 병행.
- 하지 않는 것: 명령 실행(cluster-agent 가 api-gateway 롱폴로 수행), 승인 UI(approval 라우터).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command` | [../../domains/command.md](../domains/command.md) | 이벤트 body·`handle_command_requested`·`sweep_expired_agent_commands`·`COMMAND_CONFIG`·정책·액션 카탈로그·리포지토리 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody`, `AgentCommandStore` 프로토콜, `ApprovalStatus` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `Command`/`CommandStatus`/`Sandbox`/`Target` 상수, `control`(제어 네임스페이스 허용목록), `env` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext`, WorkerRuntime |
| 외부 | PostgreSQL | — | `agent_commands` 큐·`workflow_approvals` 조회 |
| 외부 | NATS JetStream | — | `command.requested` durable 구독 |

## 공개 인터페이스 (Public API)

- `src/services/command/command-worker/app.py :: app` — `App(COMMAND_CONFIG.service_name)` = `App("command-worker")`.
- `src/services/command/command-worker/app.py :: on_command_requested(evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]) -> AsyncIterator[EventBody]` — `@app.on(CommandRequestedBody)`. `handle_command_requested` 결과를 그대로 재-yield 한 뒤 `sweep_expired_agent_commands` 결과를 이어 yield.

핵심 로직은 도메인 계층 소유(코드 앵커는 재구성에 필수라 여기 명시):

- `src/domains/command/handler.py :: COMMAND_CONFIG` — `CommandConfig(service_name="command-worker", agent_route_channel="agent-poll", policy_steps=("validate policy","route target cluster","queue for agent"), default_namespace="sandbox", default_cluster_id="default-target-cluster", default_command_action="rollout_restart", command_status_queued="queued", lease_seconds=60, heartbeat_interval_seconds=20, retry_max_attempts=3, retry_delay_seconds=5, required_agent_capability="command_receiver", policy_rules=(command_action_allowlist,))`.
- `src/domains/command/handler.py :: POLICY` — `Policy((NamespaceAllowlistRule(field=namespace, default_namespace="sandbox", reason=CONTROL_NAMESPACE_DENIED_MESSAGE), *Policy.build(COMMAND_CONFIG.policy_rules).rules))` — 네임스페이스는 정적 값 비교가 아니라 [config control 허용목록](../packages/config.md)을 평가 시점에 읽는다.
- `src/domains/command/policy.py :: NamespaceAllowlistRule` — frozen dataclass `(field, default_namespace, reason)`. `allows(target)` = `control_namespace_allowed(...)`.
- `src/domains/command/handler.py :: evaluate_command_policy(command) -> Result`
- `src/domains/command/handler.py :: approval_exempt_for_environment(command) -> bool` — 승인 면제 rule: `command.action ∈ COMMAND_AUTO_APPROVE_ACTIONS`(csv, 기본 `k8s.apps.v1.deployments.scale`) 이고 `command.environment ∈ COMMAND_AUTO_APPROVE_ENVIRONMENTS`(csv 소문자, 기본 `sandbox`) 이면 True.
- `src/domains/command/handler.py :: command_requires_recorded_approval(command) -> bool` — 액션 spec 이 `requires_approval` 이고 면제 rule 에 해당하지 않을 때만 True.
- `src/domains/command/handler.py :: evaluate_recorded_approval(command, db) -> Result`
- `src/domains/command/handler.py :: idempotency_key(command, correlation_id) -> str`
- `src/domains/command/handler.py :: build_plan(command, correlation_id) -> Plan`
- `src/domains/command/handler.py :: route_for_plan(plan) -> Route`
- `src/domains/command/handler.py :: queue_plan_for_agent(ctx, plan) -> None`
- `src/domains/command/handler.py :: sweep_expired_agent_commands(ctx) -> AsyncIterator[EventBody]`
- `src/domains/command/handler.py :: handle_command_requested(evt, ctx) -> AsyncIterator[EventBody]`

## 데이터 모델 (Data Model)

`agent_commands` 테이블은 [command 도메인](../domains/command.md) 소유. 이 워커가 쓰는 연산:

- `queue_agent_command(correlation_id, plan.to_body(), "queued")` — Plan 전체를 payload 로 적재. 같은 트랜잭션에서 `pg_notify(AGENT_COMMAND_CHANNEL, "<workspace>/<cluster>")` 를 실어 gateway 롱폴을 즉시 깨운다(리스너 없으면 무해한 no-op — [runtime command_wakeup](../packages/runtime.md) 참조).
- `fail_expired_agent_commands(grace_seconds=300)` — `status IN (leased, running)` 이고 `leased_until < now() - 300s` 인 행을 원자 `UPDATE ... RETURNING` 으로 `failed` 종결. `result = {"status":"failed","applied":false,"message":"command lease expired; no agent completed the command"}`.
- `get_workflow_approval(approval_ref, workspace_id)` — 승인 기록 조회(store 에 메서드 없으면 거부).

## 이벤트 (Events)

body 스키마는 [command 도메인](../domains/command.md) 참조.

| 구분 | subject | body | 조건 |
|---|---|---|---|
| 구독 | `command.requested` | `CommandRequestedBody(cluster_id, action, namespace, reason, diff, workspace_id, application_id, workflow_run_id, binding_id, environment, priority=100, requested_by?, actor?, approval_ref?, policy_decision_ref?, payload)` | durable `command-worker` |
| 발행 | `command.rejected` | `CommandRejectedBody(reason, requested=evt.to_body())` | 정책/승인 검증 실패 |
| 발행 | `command.dispatched` | `CommandDispatchedBody(plan, route)` | 정책 통과·계획 수립 직후 |
| 발행 | `command.queued_for_agent` | `CommandQueuedForAgentBody(command_id, cluster_id, workspace_id, application_id, workflow_run_id, binding_id, environment, priority=100, approval_ref?, policy_decision_ref?)` | DB 큐 적재 후 |
| 발행 | `command.completed` | `CommandCompletedBody(command_id, result)` | sweep 이 만료 명령을 FAILED 종결할 때(각 행마다 1건) |

승인 면제 rule: `COMMAND_AUTO_APPROVE_ACTIONS`(기본 `k8s.apps.v1.deployments.scale`) ×
`COMMAND_AUTO_APPROVE_ENVIRONMENTS`(기본 `sandbox`) 조합이면 승인 기록 없이 큐 적재를 허용한다
(`approval_exempt_for_environment`). 카탈로그 `allowed_namespaces` 와 에이전트 name-scoped
정책은 면제와 무관하게 계속 적용된다.

발행 이벤트의 correlation_id 는 원본 이벤트에서 승계, causation_id 는 원본 event_id (런타임 공통).

## 동작 (Behavior)

`handle_command_requested`:

1. **정적 정책** `evaluate_command_policy`:
   - `diff.is_image_only_noop()` → 거부(`Sandbox.NO_DIFF_REASON` = "desired and actual images already match").
   - `command.namespace != diff.namespace` → 거부("command namespace must match diff namespace").
   - `diff.desired_manifest.metadata.namespace` 가 존재하고 command.namespace 와 다르면 → 거부("manifest namespace must match command namespace").
   - `POLICY`(선언 룰): `namespace ∈ control 허용목록`(`NamespaceAllowlistRule`, `CONTROL_ALLOWED_NAMESPACES` — 기본 sandbox 만, 위반 시 "namespace is not allowed by control policy"), `action ∈ allowed_command_actions()`(AllowedValuesRule, 기본 rollout_restart) — 위반 시 각 룰의 reason 으로 거부.
   - 액션 카탈로그(`src/domains/command/builtin_actions.py`: `rollout_restart`, `apply_manifest`, `k8s.apps.v1.deployments.scale`, `rca.test.inject`, `rca.test.cleanup`, `cluster.agent.uninstall`). `rollout_restart`는 `allowed_namespaces=("sandbox","color-turf")`이고 sandbox 밖에서는 `requires_approval_outside_sandbox=True`, `apply_manifest`/`deployment scale`은 sandbox 전용 `requires_approval=True`, RCA test action은 sandbox 전용, uninstall은 target namespace 전용이다. `spec.allows_namespace(namespace)` 실패 → "namespace not allowed for this command action"; `spec.requires_approval_for(namespace)`이고 `approval_exempt_for_environment` 아님인데 `approval_ref` 없음 → "write command requires approval_ref"; `policy_decision_ref` 없음 → "write command requires policy_decision_ref".
2. **기록 승인 검증** `evaluate_recorded_approval` (`command_requires_recorded_approval` = requires_approval 이고 면제 rule 미해당인 액션만):
   - `db.get_workflow_approval(approval_ref, workspace_id)` 없음/비-dict → "write command approval_ref is not recorded".
   - `record.workflow_run_id != command.workflow_run_id` → "write command approval workflow mismatch".
   - `record.status ∉ {granted, not_required}` → "write command approval_ref is not granted".
   - `record.details.policy_decision_ref`/`approval_ref` 가 기록돼 있고 요청값과 다르면 → "write command policy_decision_ref mismatch".
3. 거부 시 `command.rejected` 1건으로 종료.
4. **Plan 생성** `build_plan`: `idempotency_key = sha256(canonical JSON of {correlation_id, workspace/application/workflow_run/binding/environment, cluster_id, action, namespace, approval_ref, policy_decision_ref, diff, payload})` (sort_keys, 구분자 `(",",":")`), `command_id = "cmd-" + key[:32]`. 빈 값은 기본값 보정(cluster→`default-target-cluster`, action→`rollout_restart`, namespace→`sandbox`). lease 60s/heartbeat 20s, retry 3회/5s, routing `channel="agent-poll"`, `required_capability="command_receiver"`, priority는 `max(100, int(command.priority or 100))`.
5. `command.dispatched`(route = channel+cluster) yield → `queue_agent_command`(같은 트랜잭션) → `command.queued_for_agent` yield.
6. **sweep**: `sweep_expired_agent_commands` 가 만료 종결 행마다 `command.completed` yield — workflow 가 영구 APPLYING 에 갇히지 않게 함.

이후 흐름: cluster-agent 가 api-gateway `/agent/commands/poll` 로 lease → start/heartbeat/result → result 가 `command.completed` 를 스테이징.

## 불변식·오류 (Invariants & Errors)

- 쓰기 명령은 control 허용 네임스페이스(기본 sandbox 만) + 카탈로그 등록 액션 + granted/not_required 승인 기록 없이는 절대 큐에 들어가지 않는다(fail-closed, 모든 검증은 거부 사유 문자열 고정). 유일한 예외는 승인 면제 rule(`approval_exempt_for_environment`, 기본 scale×sandbox) — cluster-agent 의 `AGENT_AUTO_APPROVE_*` 게이트와 대칭.
- `command_id`/`idempotency_key` 는 요청 내용+correlation 의 순수 함수 — 같은 요청 재처리 시 동일 키(중복 적재 방지는 DB 큐의 idempotency 로 처리).
- Plan 적재(DB)와 발행 이벤트(outbox)는 한 트랜잭션 — queued_for_agent 이벤트와 큐 상태가 어긋나지 않음.
- sweep 은 원자 UPDATE ... RETURNING — janitor 와 동시 실행돼도 각 행은 한 쪽만 종결.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `COMMAND_LEASE_SECONDS` | int | `60` | Plan lease 유지 초 |
| `COMMAND_HEARTBEAT_INTERVAL_SECONDS` | int | `20` | lease 하트비트 간격 |
| `COMMAND_RETRY_MAX_ATTEMPTS` | int | `3` | agent 실행 재시도 상한 |
| `COMMAND_RETRY_DELAY_SECONDS` | int | `5` | 재시도 간격 |
| `COMMAND_AUTO_APPROVE_ACTIONS` | csv | `k8s.apps.v1.deployments.scale` | 승인 기록 면제 대상 액션(요청마다 재평가) |
| `COMMAND_AUTO_APPROVE_ENVIRONMENTS` | csv | `sandbox` | 승인 기록 면제 허용 환경(소문자 비교) |
| `CONTROL_ALLOWED_NAMESPACES` | csv | `sandbox` | 제어(쓰기) 허용 네임스페이스([config](../packages/config.md) 단일 기준, 요청마다 재평가). `management`는 보호 네임스페이스라 값에 넣어도 제거 |

`COMMAND_*` 재시도·리스 기본값은 `src/domains/command/policy.py` 에서 import 시 1회 평가한다. `COMMAND_AUTO_APPROVE_*`와 `CONTROL_ALLOWED_NAMESPACES`는 요청 처리 중 함수가 env를 다시 읽어 재평가한다. 만료 유예 `EXPIRED_COMMAND_GRACE_SECONDS = 300` 은 `src/domains/command/repository.py` 상수(env 아님). WorkerRuntime 공통 env 는 [../../packages/runtime.md](../packages/runtime.md) 참조.
