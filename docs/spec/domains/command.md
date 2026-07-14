---
source_commit: 664925a6
status: synced
---

# command — 명령 정책·에이전트 큐·명령 HTTP API

> 소스: `src/domains/command/` · 테스트: `tests/test_command_router.py`, `tests/test_command_worker.py`, `tests/test_command_catalog.py`, `tests/test_command_janitor.py`, `tests/test_command_wakeup.py`, `tests/test_target_agent_commands.py`

## 책임 (Responsibility)

- 명령 카탈로그(`@command.action` 데코레이터 레지스트리)와 정책 엔진(룰 기반 allow/reject)을 소유한다.
- `command.*` 이벤트 계약 전부와 command-worker의 이벤트 핸들러(`handle_command_requested`), 만료 명령 janitor를 제공한다.
- 에이전트 명령 큐 테이블(`agent_commands`)과 리스(lease) 기반 리포지토리를 소유한다.
- 명령 발행 HTTP API + 클러스터 에이전트용 롱폴/시작/하트비트/결과 API를 제공한다.
- 하지 않는 것: 명령의 실제 클러스터 적용(target agent 담당), 이벤트 버스 소비 루프(command-worker 서비스 담당).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.gitops` | [./gitops.md](./gitops.md) | `Diff` 값 객체 (`CommandRequestedBody.diff`) |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_cluster_access`, `require_cluster_agent`, `ClusterAgentIdentity`, `RESOURCE_ACCESS_DENIED_MESSAGE` |
| import | `packages.config` | [../packages/config.md](../packages/config.md) | `env`, `require`, 상수 `Command`/`CommandStatus`/`Sandbox`/`Target`, 제어 허용목록 `control.py`(`control_namespace_allowed`, `CONTROL_NAMESPACE_DENIED_MESSAGE`) |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventBody`, `@event`, `EventSubject`, `Actor`, gateway routes/모델/`Gateway` 필드, `ApprovalStatus`, `AgentCommandStore`, `CommandRecord`, `DEFAULT_WORKSPACE_ID`, gitops 기본값 |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db`, `get_events`, `EventContext`, 롱폴 웨이크업 `command_wakeup`(`WAKEUP`, `AGENT_COMMAND_CHANNEL`, `wakeup_key`) |
| import | `packages.events` | [../packages/events.md](../packages/events.md) | `event()` envelope 생성 (결과 이벤트 스테이징) |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `DatabaseConnection`, `row_dict`, `serialize_command`, `UNKNOWN_AGENT_ID`, `EventModel`/`OutboxModel` |
| 구독 | `command.requested` | 아래 [이벤트](#이벤트-events) | 정책 평가 → 계획 수립 → 큐 적재 |
| 발행 | `command.dispatched`, `command.queued_for_agent`, `command.rejected`, `command.completed` | 아래 [이벤트](#이벤트-events) | 명령 수명주기 |

## 공개 인터페이스 (Public API)

### 명령 카탈로그 — `src/domains/command/actions.py`

```python
@dataclass(frozen=True)
class CommandActionSpec:            # src/domains/command/actions.py :: CommandActionSpec
    action: str
    recovery_aliases: tuple[str, ...] = ()
    allowed_namespaces: tuple[str, ...] = ()   # 빈 튜플 = 제한 없음
    requires_approval: bool = False
    def matches_recovery_action(self, value: str) -> bool   # value == action or value in recovery_aliases
    def allows_namespace(self, namespace: str) -> bool      # not allowed_namespaces or namespace in allowed_namespaces
```

`class CommandCatalog` — `src/domains/command/actions.py :: CommandCatalog`

| 메서드 | 시그니처 | 의미 |
|---|---|---|
| `action` | `(self, action: str, *, recovery_aliases=(), allowed_namespaces=(), requires_approval=False) -> Callable[[type], type]` | 클래스 데코레이터. 동일 action 다른 spec 재등록 → `ValueError(f"duplicate command action: {action}")`, 동일 spec 재선언은 멱등. marker 클래스에 `__command_spec__` 부착 |
| `actions` | `(self) -> tuple[CommandActionSpec, ...]` | 호출 시 `import domains.command.builtin_actions`로 내장 액션 등록 유발 후 전체 spec 반환 |
| `allowed_actions` | `(self) -> tuple[str, ...]` | action 문자열 튜플 |
| `spec_for` | `(self, action: str) -> CommandActionSpec \| None` | action 정확 일치 |
| `action_for_recovery` | `(self, value: str) -> str \| None` | action 또는 recovery alias 일치 시 정식 action 반환 |

모듈 싱글턴·하위 호환 별칭: `command = CommandCatalog()` (`src/domains/command/actions.py :: command`), `command_action = command.action`, `registered_command_actions = command.actions`, `allowed_command_actions = command.allowed_actions`, `command_action_for_recovery = command.action_for_recovery`, `command_action_spec = command.spec_for`.

### 내장 액션 — `src/domains/command/builtin_actions.py`

빈 marker 클래스 3개에 `@command.action` 부착. 모두 `allowed_namespaces=(Sandbox.NAMESPACE,)`(= `("sandbox",)`). `requires_approval` 은 `rollout_restart`=False(비파괴 자동 실행 허용), `apply_manifest`/`deployment_scale`=True. 단 `deployment_scale` 은 sandbox 환경 한정 승인 면제 rule(`COMMAND_AUTO_APPROVE_*` env, handler 의 `approval_exempt_for_environment`)이 기본 적용된다.

| marker 클래스(앵커) | action | recovery_aliases |
|---|---|---|
| `src/domains/command/builtin_actions.py :: RolloutRestartCommand` | `Command.DEFAULT_ACTION` = `"rollout_restart"` | `("rollout_restart",)` |
| `src/domains/command/builtin_actions.py :: ApplyManifestCommand` | `Command.APPLY_MANIFEST_ACTION` = `"apply_manifest"` | `("apply_manifest",)` |
| `src/domains/command/builtin_actions.py :: ScaleDeploymentCommand` | `Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION` = `"k8s.apps.v1.deployments.scale"` | `("deployment_scale",)` |

### 정책 엔진 — `src/domains/command/policy.py`

환경변수 상수 (모듈 로드 시 `env()`로 해석):

| 상수(앵커: `src/domains/command/policy.py :: <이름>`) | env 키 | 기본값 |
|---|---|---|
| `DEFAULT_COMMAND_LEASE_SECONDS` | `COMMAND_LEASE_SECONDS` | 60 |
| `DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS` | `COMMAND_HEARTBEAT_INTERVAL_SECONDS` | 20 |
| `DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS` | `COMMAND_RETRY_MAX_ATTEMPTS` | 3 |
| `DEFAULT_COMMAND_RETRY_DELAY_SECONDS` | `COMMAND_RETRY_DELAY_SECONDS` | 5 |

(각각 `*_ENV` 문자열 상수도 public: `DEFAULT_COMMAND_LEASE_SECONDS_ENV` 등.)

| 심볼 | 정의 | 앵커 |
|---|---|---|
| `PolicyRuleConfig` | `@dataclass(frozen=True)`: `name: str`, `field: str`, `reason: str`, `expected: Any \| None = None`, `allowed_values: tuple[Any, ...] = ()`, `default: Any = None` | `src/domains/command/policy.py :: PolicyRuleConfig` |
| `CommandConfig` | `@dataclass(frozen=True)`: `service_name`, `agent_route_channel`, `policy_steps: tuple[str, ...]`, `default_namespace`, `default_cluster_id`, `default_command_action`, `command_status_queued`, `lease_seconds: int`, `heartbeat_interval_seconds: int`, `retry_max_attempts: int`, `retry_delay_seconds: int`, `required_agent_capability`, `policy_rules: tuple[PolicyRuleConfig, ...]` | `src/domains/command/policy.py :: CommandConfig` |
| `Lookup` | `Protocol`: `def value(self, field: str, default: Any = None) -> Any` | `src/domains/command/policy.py :: Lookup` |
| `ModelLookup` | `@dataclass(frozen=True)` `model: Any`; `value()` = `getattr(self.model, field, default)` | `src/domains/command/policy.py :: ModelLookup` |
| `Rule` | `Protocol`: 속성 `reason: str`, `def allows(self, target: Lookup) -> bool` | `src/domains/command/policy.py :: Rule` |
| `EqualsRule` | frozen dataclass(name, field, expected, reason, default=None); `allows` = `target.value(field, default) == expected`; `@classmethod build(config) -> EqualsRule` | `src/domains/command/policy.py :: EqualsRule` |
| `AllowedValuesRule` | frozen dataclass(name, field, allowed_values, reason, default=None); `allows` = `target.value(field, default) in allowed_values`; `build` 동일 | `src/domains/command/policy.py :: AllowedValuesRule` |
| `NamespaceAllowlistRule` | frozen dataclass(`field: str`, `default_namespace: str`, `reason: str`); `allows` = `control_namespace_allowed(str(target.value(field, default_namespace)))` — 기준은 `src/packages/config/control.py`의 `CONTROL_ALLOWED_NAMESPACES` 단일 소스(기본 sandbox만). `management` 보호 네임스페이스는 allowlist에 들어와도 항상 제거된다. env를 평가 시점마다 읽어 재기동 없이 반영 | `src/domains/command/policy.py :: NamespaceAllowlistRule` |
| `Result` | frozen dataclass(`allowed: bool`, `reason: str \| None = None`); `Result.allow()`, `Result.reject(reason)`, `require_reason() -> str`(reason 없으면 `require(...)` 실패) | `src/domains/command/policy.py :: Result` |
| `Policy` | `__init__(rules: Sequence[Rule])`; `Policy.build(configs)` — `allowed_values` 있으면 `AllowedValuesRule`, 아니면 `EqualsRule`; `evaluate(target) -> Result` — 첫 위반 룰의 reason으로 reject, 전부 통과 시 allow | `src/domains/command/policy.py :: Policy` |

### 핸들러 — `src/domains/command/handler.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `COMMAND_CONFIG` | `CommandConfig(service_name="command-worker", agent_route_channel="agent-poll", policy_steps=("validate policy", "route target cluster", "queue for agent"), default_namespace=Sandbox.NAMESPACE, default_cluster_id=Target.DEFAULT_CLUSTER_ID, default_command_action=Command.DEFAULT_ACTION, command_status_queued=CommandStatus.QUEUED, lease/heartbeat/retry=policy 기본 상수, required_agent_capability="command_receiver", policy_rules=`command_action_allowlist` 1룰)` | `src/domains/command/handler.py :: COMMAND_CONFIG` |
| `POLICY` | `Policy((NamespaceAllowlistRule(field=Gateway.NAMESPACE, default_namespace=Sandbox.NAMESPACE, reason=CONTROL_NAMESPACE_DENIED_MESSAGE), *Policy.build(COMMAND_CONFIG.policy_rules).rules))` — 네임스페이스 룰은 정적 값 비교가 아니라 제어 허용목록을 평가 시점에 읽음 | `src/domains/command/handler.py :: POLICY` |
| `AUTO_APPROVE_ACTIONS_ENV` | `"COMMAND_AUTO_APPROVE_ACTIONS"` | `src/domains/command/handler.py :: AUTO_APPROVE_ACTIONS_ENV` |
| `AUTO_APPROVE_ENVIRONMENTS_ENV` | `"COMMAND_AUTO_APPROVE_ENVIRONMENTS"` | `src/domains/command/handler.py :: AUTO_APPROVE_ENVIRONMENTS_ENV` |
| `DEFAULT_AUTO_APPROVE_ACTIONS` | `Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION` (`"k8s.apps.v1.deployments.scale"`) | `src/domains/command/handler.py :: DEFAULT_AUTO_APPROVE_ACTIONS` |
| `DEFAULT_AUTO_APPROVE_ENVIRONMENTS` | `"sandbox"` | `src/domains/command/handler.py :: DEFAULT_AUTO_APPROVE_ENVIRONMENTS` |
| `approval_exempt_for_environment` | `def approval_exempt_for_environment(command: CommandRequestedBody) -> bool` — `command.action ∈ COMMAND_AUTO_APPROVE_ACTIONS`(CSV, env 평가 시점 조회) AND `command.environment`(strip·lower) ∈ `COMMAND_AUTO_APPROVE_ENVIRONMENTS`. 기본: deployment scale × sandbox 환경만 승인 기록 면제. 카탈로그 `allowed_namespaces`·네임스페이스 룰은 그대로 적용 | `src/domains/command/handler.py :: approval_exempt_for_environment` |
| `desired_manifest_namespace` | `def desired_manifest_namespace(command: CommandRequestedBody) -> str \| None` — `diff.desired_manifest["metadata"]["namespace"]`(dict 아닐/빈 값이면 None) | `src/domains/command/handler.py :: desired_manifest_namespace` |
| `evaluate_command_policy` | `def evaluate_command_policy(command: CommandRequestedBody) -> Result` | `src/domains/command/handler.py :: evaluate_command_policy` |
| `command_requires_recorded_approval` | `def command_requires_recorded_approval(command: CommandRequestedBody) -> bool` — spec 존재 && `requires_approval` && `not approval_exempt_for_environment(command)` | `src/domains/command/handler.py :: command_requires_recorded_approval` |
| `evaluate_recorded_approval` | `async def evaluate_recorded_approval(command: CommandRequestedBody, db: AgentCommandStore) -> Result` | `src/domains/command/handler.py :: evaluate_recorded_approval` |
| `idempotency_key` | `def idempotency_key(command: CommandRequestedBody, correlation_id: str) -> str` — 아래 [동작](#동작-behavior) | `src/domains/command/handler.py :: idempotency_key` |
| `build_plan` | `def build_plan(command: CommandRequestedBody, correlation_id: str) -> Plan` | `src/domains/command/handler.py :: build_plan` |
| `route_for_plan` | `def route_for_plan(plan: Plan) -> Route` — `Route(channel=plan.routing_constraint.channel, cluster_id=plan.cluster_id)` | `src/domains/command/handler.py :: route_for_plan` |
| `queue_plan_for_agent` | `async def queue_plan_for_agent(ctx: EventContext[AgentCommandStore], plan: Plan) -> None` — `ctx.db.queue_agent_command(ctx.correlation_id, plan.to_body(), CommandStatus.QUEUED)` | `src/domains/command/handler.py :: queue_plan_for_agent` |
| `sweep_expired_agent_commands` | `async def sweep_expired_agent_commands(ctx: EventContext[AgentCommandStore]) -> AsyncIterator[EventBody]` | `src/domains/command/handler.py :: sweep_expired_agent_commands` |
| `handle_command_requested` | `async def handle_command_requested(evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]) -> AsyncIterator[EventBody]` | `src/domains/command/handler.py :: handle_command_requested` |

`POLICY` 룰 2종: ① 네임스페이스 허용목록 — `NamespaceAllowlistRule(Gateway.NAMESPACE)` — namespace가 `control_allowed_namespaces()`(env `CONTROL_ALLOWED_NAMESPACES`, 기본 `("sandbox",)`) 안에 있어야 함. `management`는 보호 네임스페이스라 env에 명시돼도 제거된다. reason `CONTROL_NAMESPACE_DENIED_MESSAGE` = `"namespace is not allowed by control policy"` (`src/packages/config/control.py :: CONTROL_NAMESPACE_DENIED_MESSAGE`), ② `command_action_allowlist`(`COMMAND_CONFIG.policy_rules` 유일 룰) — `Gateway.ACTION` 필드가 `allowed_command_actions()` 안에 있어야 함(default `Command.DEFAULT_ACTION`, reason `"unsupported command action"`). 기존 정적 `sandbox_namespace` 룰은 제거되고 `packages.config.control` 단일 기준으로 대체됐다.

거부 사유 상수(모두 `src/domains/command/handler.py :: <이름>` 앵커):

| 상수 | 값 |
|---|---|
| `NAMESPACE_MISMATCH_REASON` | `"command namespace must match diff namespace"` |
| `MANIFEST_NAMESPACE_MISMATCH_REASON` | `"manifest namespace must match command namespace"` |
| `ACTION_NAMESPACE_REASON` | `"namespace not allowed for this command action"` |
| `MISSING_APPROVAL_REF_REASON` | `"write command requires approval_ref"` |
| `MISSING_POLICY_DECISION_REF_REASON` | `"write command requires policy_decision_ref"` |
| `APPROVAL_RECORD_MISSING_REASON` | `"write command approval_ref is not recorded"` |
| `APPROVAL_NOT_GRANTED_REASON` | `"write command approval_ref is not granted"` |
| `APPROVAL_POLICY_DECISION_MISMATCH_REASON` | `"write command policy_decision_ref mismatch"` |
| `APPROVAL_WORKFLOW_MISMATCH_REASON` | `"write command approval workflow mismatch"` |

### 리포지토리 — `class AgentCommandRepository(DatabaseConnection)` (`src/domains/command/repository.py :: AgentCommandRepository`)

모듈 상수: `EXPIRED_COMMAND_GRACE_SECONDS = 300`, `EXPIRED_COMMAND_FAILURE_MESSAGE = "command lease expired; no agent completed the command"` (앵커: `src/domains/command/repository.py :: EXPIRED_COMMAND_GRACE_SECONDS` 등).

| 메서드 | 시그니처 | 쿼리 의미 |
|---|---|---|
| `queue_agent_command` | `(self, correlation_id: str, plan: JsonObject, status: str) -> bool` | `INSERT INTO agent_commands ... ON CONFLICT (command_id) DO NOTHING` (멱등). 새 row가 저장되면 `True`, 충돌이면 `False`. `payload=plan` 전문 저장, `priority=int(plan["priority"] or 100)`, lease 필드 NULL, `result={}`. 같은 트랜잭션에서 `pg_notify(AGENT_COMMAND_CHANNEL, wakeup_key(workspace_id, cluster_id))`(`src/packages/runtime/command_wakeup.py :: AGENT_COMMAND_CHANNEL` = `"agent_command_queued"`, payload는 `wakeup_key`가 만드는 `"<workspace_id>/<cluster_id>"`)를 호출해 대기 중인 agent long-poll을 즉시 깨운다. 리스너가 없어도 DB row가 source of truth라 동작은 폴링으로 보장된다 |
| `queue_rca_test_command_if_available` | 동일 workspace/cluster/fixture(kind·namespace·name)의 signed bigint advisory key로 `pg_advisory_xact_lock`을 획득한 뒤, `expires_at` 이내 미정리 inject 수 확인과 새 command INSERT, `pg_notify`를 한 트랜잭션에 묶는다. cleanup 명령이 completed(소유권 변경에 따른 skipped 포함)되거나 TTL이 만료되기 전에는 catalog의 동시 실행 한도를 넘길 수 없다. 일반 `queue_agent_command`는 RCA inject action을 거부해 우회 경로를 닫는다 |
| `get_agent_command` | `async (self, command_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID) -> JsonObject \| None` | 워크스페이스 범위 명령 단건 SELECT(`command_id, cluster_id, correlation_id, action, status, result, completed_at`) — 콘솔이 명령 상태·실제 결과를 폴링하는 용도. 없으면 None |
| `list_agent_commands_by_correlation` | `async (workspace_id, correlation_id, *, limit=20) -> list[JsonObject]` | workspace+correlation exact 조건으로 최신 command를 `created_at DESC, command_id DESC` 정렬해 최대 20개만 반환한다. 브라우저 논리 로그 스트림의 persisted 배치 재조회 경계다 |
| `lease_agent_command` | `async (self, cluster_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID, queued_status: str = CommandStatus.QUEUED, leased_status: str = CommandStatus.LEASED, agent_id: str = UNKNOWN_AGENT_ID, lease_seconds: int = DEFAULT_COMMAND_LEASE_SECONDS) -> CommandRecord \| None` | 후보 = (status=queued) OR (status=leased AND leased_until<now()) OR (status=running AND leased_until<now())를 `workspace_id+cluster_id`로 필터, `ORDER BY priority DESC, created_at LIMIT 1 FOR UPDATE SKIP LOCKED` 스칼라 서브쿼리 → `UPDATE ... SET status=leased, lease_id=uuid4, agent_id, leased_until=now+lease_seconds RETURNING`. 없으면 None, 있으면 `serialize_command(row_dict(...))` |
| `start_agent_command` | `async (self, command_id: str, workspace_id: str, cluster_id: str, lease_id: str, agent_id: str, running_status: str = CommandStatus.RUNNING, lease_seconds: int = DEFAULT_COMMAND_LEASE_SECONDS) -> str \| None` | lease_id+agent_id+status=LEASED+미만료 조건의 UPDATE → RUNNING, `started_at=now()`, lease 연장. RETURNING correlation_id(불일치 시 None) |
| `heartbeat_agent_command` | `async (self, command_id, workspace_id, cluster_id, lease_id, agent_id, lease_seconds=DEFAULT_COMMAND_LEASE_SECONDS) -> str \| None` | status IN (LEASED, RUNNING) + 미만료 조건에서 `leased_until` 연장만. RETURNING correlation_id |
| `complete_agent_command_and_stage_event` | `async (self, command_id, workspace_id, cluster_id, result: JsonObject, lease_id, agent_id, source: str) -> EventEnvelope \| None` | 단일 async 트랜잭션(`async_engine.begin()`): status=RUNNING+lease 유효 조건 UPDATE → `status=result["status"]`, result/completed_at 기록. 성공 시 `CommandCompletedBody`를 `event()`로 envelope화해 `events`·`outbox` 테이블에 `ON CONFLICT (event_id) DO NOTHING` insert 후 envelope 반환. 조건 불일치 시 None |
| `fail_expired_agent_commands` | `(self, grace_seconds: int = EXPIRED_COMMAND_GRACE_SECONDS) -> list[JsonObject]` | LEASED/RUNNING이고 `leased_until < now() - interval '<grace>초'`인 행을 단일 원자 `UPDATE ... RETURNING`으로 FAILED 종결. result = `{"status": "failed", "applied": False, "message": EXPIRED_COMMAND_FAILURE_MESSAGE}`. 반환: command_id/workspace_id/cluster_id/correlation_id/result 행 목록 |
| `command_status_counts` | `(self) -> dict[str, int]` | `SELECT status, count(*) GROUP BY status` |
| `oldest_command_age_seconds` | `(self, status: str) -> float` | `SELECT extract(epoch FROM now() - min(created_at)) WHERE status=?` (없으면 0.0) |

### 라우터 — `src/domains/command/router.py`

롱폴 튜닝 상수 (모듈 로드 시 `env()` 해석):

| 상수 | env 키 | 기본값 |
|---|---|---|
| `DEFAULT_POLL_SECONDS` | `COMMAND_POLL_DEFAULT_SECONDS` | 10 |
| `MAX_POLL_SECONDS` | `COMMAND_POLL_MAX_SECONDS` | 30 |
| `POLL_SLEEP_SECONDS` | `COMMAND_POLL_SLEEP_SECONDS` | 1 |

기타 상수: `LEASE_SECONDS = DEFAULT_COMMAND_LEASE_SECONDS`, `NOT_FOUND_CODE = 404`, `NOT_FOUND_MESSAGE = "command not found"`, `RESOURCE_ACCESS_DENIED = RESOURCE_ACCESS_DENIED_MESSAGE`, `UNPROCESSABLE_CODE = 422`, `MANUAL_DIFF_REQUIRED_MESSAGE = "diff is required for manual command requests"`, `CONTROL_NAMESPACE_NOT_ALLOWED = CONTROL_NAMESPACE_DENIED_MESSAGE`(= `"namespace is not allowed by control policy"`, `src/packages/config/control.py` 단일 기준) (앵커: `src/domains/command/router.py :: <이름>`).

헬퍼:

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `command_diff` | `def command_diff(payload: CommandRequest, workspace_id: str) -> Diff` — `payload.diff` 없으면 422; `{**payload.diff, "workspace_id", "cluster_id"}`로 `Diff.from_body` | `src/domains/command/router.py :: command_diff` |
| `validate_control_namespace` | `def validate_control_namespace(namespace: str) -> None` — `control_namespace_allowed(namespace)`(`src/packages/config/control.py :: control_namespace_allowed`) 아니면 422 `CONTROL_NAMESPACE_NOT_ALLOWED` | `src/domains/command/router.py :: validate_control_namespace` |
| `require_cluster_deploy_access` | `def require_cluster_deploy_access(db, current, workspace_id, cluster_id) -> None` — `Permission.DEPLOY_RUN` | `src/domains/command/router.py :: require_cluster_deploy_access` |
| `require_cluster_read_access` | `def require_cluster_read_access(db, current, workspace_id, cluster_id) -> None` — `Permission.EVIDENCE_READ` | `src/domains/command/router.py :: require_cluster_read_access` |
| `deployment_control_diff` | `def deployment_control_diff(*, workspace_id, cluster_id, namespace, deployment, action, basis) -> Diff` — `resource=f"deployment/{deployment}"`, `desired_image=""`, `actual_image="resource-not-inspected"`, `risk=Sandbox.RISK_TAG`, `status=action` | `src/domains/command/router.py :: deployment_control_diff` |
| `accept_deployment_control` | `async def accept_deployment_control(*, cluster_id, namespace, deployment, action, reason, payload, approval_ref, policy_decision_ref, current, db, events) -> AcceptedResponse` — namespace 검증 → 권한 → diff 합성 → `CommandRequestedBody` 발행 | `src/domains/command/router.py :: accept_deployment_control` |
| `debug_query_plan` | `def debug_query_plan(payload: AgentDebugQueryRequest, *, workspace_id, requested_by, correlation_id) -> JsonObject` — 아래 동작 참조 | `src/domains/command/debug_queries.py :: debug_query_plan` |
| `queue_debug_query` | persisted agent telemetry query를 합성·큐 적재하고 `QueuedDebugQuery(command_id, correlation_id, plan, inserted)`를 반환하는 내부 공용 경계 | `src/domains/command/debug_queries.py :: queue_debug_query` |
| `lease_next_command` | `async def lease_next_command(db, cluster_id, workspace_id, agent_id, timeout) -> JsonObject \| None` — `min(timeout, MAX_POLL_SECONDS)` 데드라인까지 `db.lease_agent_command(...)` 반복. 빈손이면 `WAKEUP.wait(workspace_id, cluster_id, min(POLL_SLEEP_SECONDS, 남은 시간))`로 기다린다. `WAKEUP`은 LISTEN/NOTIFY가 켜져 있으면 즉시 깨어나고, 꺼져 있으면 timeout까지 자므로 기존 주기 폴링과 같은 안전성을 유지한다 | `src/domains/command/router.py :: lease_next_command` |

#### 사용자 엔드포인트 (`router` — `src/domains/command/router.py :: router`)

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `POST /commands` (`gateway_routes.COMMANDS_PATH`) | `src/domains/command/router.py :: commands` | `CommandRequest` | `AcceptedResponse` | `require_session` + cluster `DEPLOY_RUN` |
| `POST /clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale` (`CLUSTER_DEPLOYMENT_SCALE_PATH`) | `src/domains/command/router.py :: scale_deployment` | `DeploymentScaleRequest` | `AcceptedResponse` | `require_session` + cluster `DEPLOY_RUN`, namespace는 제어 허용목록(`CONTROL_ALLOWED_NAMESPACES`, 기본 sandbox)만 |
| `POST /clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart` (`CLUSTER_DEPLOYMENT_RESTART_PATH`) | `src/domains/command/router.py :: restart_deployment` | `DeploymentRestartRequest` | `AcceptedResponse` | 위와 동일 |
| `POST /agent/debug/query` (`AGENT_DEBUG_QUERY_PATH`) | `src/domains/command/router.py :: agent_debug_query` | `AgentDebugQueryRequest` | `AgentDebugQueryResponse` | `require_session` + cluster `EVIDENCE_READ` |
| `GET /commands/{command_id}` (`COMMAND_STATUS_PATH`) | `src/domains/command/router.py :: command_status` | — | `CommandStatusResponse(command_id, cluster_id, correlation_id, action, status, result, completed_at(ISO \| None))` | `require_session` + cluster `EVIDENCE_READ`(`require_cluster_read_access`) |

`command_status`는 `db.get_agent_command(command_id, 세션 workspace_id)` 조회 후(None이면 404 `"command not found"`) 행의 `cluster_id`에 대한 읽기 권한을 검사한다 — 콘솔이 명령 진행 상태와 agent가 올린 실제 결과를 폴링하는 용도(임의 완료 표시 제거).

management 클러스터(role=`management`)는 제어 불가다. `commands`와 scale/restart wrapper는 cluster registration settings 또는 stored policy의 `cluster_role`이 management이면 이벤트 발행 전에 HTTP 400 `{"code":"management_readonly","detail":"management 클러스터는 읽기 전용입니다"}`로 거부한다. `POST /agent/debug/query`는 읽기성 telemetry query라 이 write guard 대상이 아니다.

#### 에이전트 엔드포인트 (`agent_router` — `src/domains/command/router.py :: agent_router`, 마지막에 `router.include_router(agent_router)`)

모두 `require_cluster_agent`(per-cluster 토큰)로 인증하며, `workspace_id`/`cluster_id`는 **토큰 identity에서만** 취한다(body/query 불신).

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 |
|---|---|---|---|
| `GET /agent/commands/poll` (`AGENT_COMMAND_POLL_PATH`) | `src/domains/command/router.py :: poll_command` — query `agent_id: str = "target-agent"`, `timeout: int = DEFAULT_POLL_SECONDS` | — | `AgentCommandPollResponse(command=row \| None)` |
| `POST /agent/commands/{command_id}/start` (`AGENT_COMMAND_START_PATH`) | `src/domains/command/router.py :: command_start` | `CommandStartRequest(lease_id, agent_id)` | `CommandStartedResponse(accepted=True, correlation_id)`; 불일치 시 404 |
| `POST /agent/commands/{command_id}/heartbeat` (`AGENT_COMMAND_HEARTBEAT_PATH`) | `src/domains/command/router.py :: command_heartbeat` | `CommandHeartbeatRequest(lease_id, agent_id)` | `CommandHeartbeatResponse(accepted=True, correlation_id)`; 불일치 시 404 |
| `POST /agent/commands/{command_id}/result` (`AGENT_COMMAND_RESULT_PATH`) | `src/domains/command/router.py :: command_result` | `CommandResultRequest` | `EventIdAcceptedResponse(accepted=True, event_id)`; 불일치 시 404 |

`command_result`는 `payload.model_dump()`에 identity의 workspace_id/cluster_id를 덮어쓴 result로 `complete_agent_command_and_stage_event(..., source="api-gateway")`를 호출한다.

## 데이터 모델 (Data Model)

### `agent_commands` — `src/domains/command/models.py :: AgentCommand`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| command_id | Text | PK | `cmd-<idempotency_key[:32]>` 또는 `cmd-debug-<hash[:24]>` |
| workspace_id | Text | NOT NULL | 워크스페이스 격리 |
| correlation_id | Text | NOT NULL | 발행 이벤트 상관관계 |
| cluster_id | Text | NOT NULL | 대상 클러스터 |
| action | Text | NOT NULL | 명령 액션 |
| priority | Integer | NOT NULL, server_default `100` | lease 후보 정렬 우선순위. 큰 값 먼저, 같은 값은 `created_at` 순 |
| payload | JSONB | NOT NULL | Plan 전문 |
| status | Text | NOT NULL | `queued`/`leased`/`running`/`completed`/`failed` (`CommandStatus`) |
| lease_id | Text | nullable | 현재 리스 UUID |
| agent_id | Text | nullable | 리스한 에이전트 |
| leased_until | TIMESTAMP(timezone=True) | nullable | 리스 만료 시각 |
| started_at | TIMESTAMP(timezone=True) | nullable | RUNNING 전이 시각 |
| completed_at | TIMESTAMP(timezone=True) | nullable | 종결 시각 |
| result | JSONB | NOT NULL | 실행 결과(초기 `{}`) |
| created_at / updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 시각 |

## 이벤트 (Events)

모두 `src/domains/command/events.py`, `@event(EventSubject.*)` + frozen dataclass. 라우팅 키 = subject 값.

### 값 객체 (이벤트 아님 — `EventBody` 상속 dataclass)

| 심볼(앵커: `src/domains/command/events.py :: <이름>`) | 필드 |
|---|---|
| `LeaseMetadata` | `lease_seconds: int`, `heartbeat_interval_seconds: int` |
| `RetryPolicy` | `max_attempts: int`, `retry_delay_seconds: int` |
| `RoutingConstraint` | `channel: str`, `cluster_id: str`, `workspace_id: str`, `required_capability: str` |
| `Plan` | `command_id`, `idempotency_key`, `cluster_id`, `action`, `namespace` (str) · `diff: JsonObject` · `payload: JsonObject` · `steps: list[str]` · `lease: LeaseMetadata` · `retry_policy: RetryPolicy` · `routing_constraint: RoutingConstraint` · `workspace_id=DEFAULT_WORKSPACE_ID` · `application_id=DEFAULT_APPLICATION_ID` · `workflow_run_id=DEFAULT_WORKFLOW_RUN_ID` · `binding_id=DEFAULT_DEPLOYMENT_BINDING_ID` · `environment=DEFAULT_ENVIRONMENT` · `priority: int = 100` · `approval_ref: str \| None = None` · `policy_decision_ref: str \| None = None` |
| `Route` | `channel: str`, `cluster_id: str` |

### 구독 (Consumes)

#### CommandRequestedBody

**`command.requested`** (`EventSubject.COMMAND_REQUESTED`) — `src/domains/command/events.py :: CommandRequestedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| cluster_id | str | (필수) |
| action | str | (필수) |
| namespace | str | (필수) |
| reason | str | (필수) |
| diff | [Diff](./gitops.md) | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| application_id | str | `DEFAULT_APPLICATION_ID` |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` |
| environment | str | `DEFAULT_ENVIRONMENT` |
| priority | int | `100` |
| requested_by | str \| None | None |
| actor | JsonObject \| None | None |
| approval_ref | str \| None | None |
| policy_decision_ref | str \| None | None |
| payload | JsonObject | `field(default_factory=dict)` |

### 발행 (Publishes)

| 이벤트명(라우팅 키) | body(앵커) | 필드 |
|---|---|---|
| `command.dispatched` (`COMMAND_DISPATCHED`) | `src/domains/command/events.py :: CommandDispatchedBody` | `plan: Plan`, `route: Route` |
| `command.queued_for_agent` (`COMMAND_QUEUED_FOR_AGENT`) | `src/domains/command/events.py :: CommandQueuedForAgentBody` | `command_id: str`, `cluster_id: str`, `workspace_id=DEFAULT_WORKSPACE_ID`, `application_id=DEFAULT_APPLICATION_ID`, `workflow_run_id=DEFAULT_WORKFLOW_RUN_ID`, `binding_id=DEFAULT_DEPLOYMENT_BINDING_ID`, `environment=DEFAULT_ENVIRONMENT`, `priority: int = 100`, `approval_ref: str \| None = None`, `policy_decision_ref: str \| None = None` |
| `command.rejected` (`COMMAND_REJECTED`) | `src/domains/command/events.py :: CommandRejectedBody` | `reason: str`, `requested: JsonObject` (원요청 `to_body()`) |
| `command.completed` (`COMMAND_COMPLETED`) | `src/domains/command/events.py :: CommandCompletedBody` | `command_id: str`, `result: JsonObject` |

`command.completed`는 (a) 에이전트 결과 보고 시 `complete_agent_command_and_stage_event`가 outbox로 스테이징, (b) janitor `sweep_expired_agent_commands`가 FAILED result로 발행.

## 동작 (Behavior)

### `handle_command_requested` 흐름

1. `evaluate_management_guard(evt, ctx.db)`: registration settings 또는 stored policy가 role=`management`이면 `CommandRejectedBody(reason="management_readonly")`를 남기고 queue 적재 없이 종료한다. gateway를 우회한 recovery dispatch/direct event도 여기서 차단된다.
2. `evaluate_command_policy(evt)`:
   1. `evt.diff.is_image_only_noop()` → reject(`Sandbox.NO_DIFF_REASON` = `"desired and actual images already match"`).
   2. `evt.namespace != evt.diff.namespace` → reject(`NAMESPACE_MISMATCH_REASON`).
   3. `desired_manifest_namespace(evt)`가 있고 `evt.namespace`와 다르면 → reject(`MANIFEST_NAMESPACE_MISMATCH_REASON`).
   4. `POLICY.evaluate(ModelLookup(evt))` — 제어 네임스페이스 허용목록 룰(`NamespaceAllowlistRule`) + action allowlist 룰.
   5. 액션 spec의 `allows_namespace` 위반 → reject(`ACTION_NAMESPACE_REASON`).
   6. spec.requires_approval이고 `approval_exempt_for_environment(evt)`가 아닌데 `approval_ref`/`policy_decision_ref` 누락 → reject(각 사유). (기본값 기준 sandbox 환경의 deployment scale은 면제.)
3. 거부 시 `CommandRejectedBody(reason, requested=evt.to_body())` yield 후 종료.
4. `evaluate_recorded_approval(evt, ctx.db)`: 승인 필요 명령(`command_requires_recorded_approval` — 환경 면제 반영)이면 `db.get_workflow_approval(approval_ref, workspace_id)` 레코드 검증 — getter 없음/레코드 없음 → `APPROVAL_RECORD_MISSING_REASON`; `workflow_run_id` 불일치 → `APPROVAL_WORKFLOW_MISMATCH_REASON`; status가 `ApprovalStatus.GRANTED`/`NOT_REQUIRED`가 아니면 → `APPROVAL_NOT_GRANTED_REASON`; `details.policy_decision_ref`/`details.approval_ref`가 기록돼 있고 불일치 → `APPROVAL_POLICY_DECISION_MISMATCH_REASON`. 거부 시 `CommandRejectedBody` yield 후 종료.

### idempotency_key / build_plan

- `idempotency_key`: `{correlation_id, workspace_id, application_id, workflow_run_id, binding_id, environment, cluster_id, action, namespace, approval_ref, policy_decision_ref, diff: command.diff.to_body(), payload}`를 `json.dumps(sort_keys=True, separators=(",", ":"))` 후 sha256 hexdigest.
- `build_plan`: `command_id=f"cmd-{key[:32]}"`, cluster/action/namespace는 빈 값이면 `COMMAND_CONFIG` 기본값으로 대체, `steps=list(COMMAND_CONFIG.policy_steps)`, lease/retry/routing_constraint는 `COMMAND_CONFIG` 값(`channel="agent-poll"`, `required_capability="command_receiver"`), `priority=max(100, int(command.priority or 100))`.

### 만료 명령 janitor (`sweep_expired_agent_commands`)

전용 스케줄러 없이 command-worker 이벤트 처리 길목에서 기회적으로 실행. `db.fail_expired_agent_commands()`가 종결한 각 행에 대해 `CommandCompletedBody(command_id, result)` yield — workflow가 영구 APPLYING에 갇히지 않게 함. lease 만료 직후(grace 300초 이내)는 재리스 후보라 건드리지 않는다.

### 명령 상태 머신 (`agent_commands.status`)

```
queued ──lease──▶ leased ──start──▶ running ──result──▶ completed | failed
  ▲                 │(만료: leased_until<now)   │(만료)
  └── (만료 행은 재리스 후보로 lease_agent_command가 다시 잡음)
leased/running + 만료 후 grace 300s 경과 ──janitor──▶ failed
```

### debug query (`POST /agent/debug/query`)

이벤트 발행 없이 직접 큐 적재: `correlation_id=f"corr-debug-{uuid4()}"`, plan은 `debug_query_plan`이 합성 — `action=Command.TELEMETRY_QUERY_RUN_ACTION`(`"telemetry.query.run"`), `namespace="sandbox"`, `command_id=f"cmd-debug-{sha256(plan_basis)[:24]}"`(plan_basis = workspace_id/cluster_id/action/query), diff는 `resource="telemetry/query"` 합성, routing_constraint `channel="agent"`, `required_capability="collector"`. `db.queue_agent_command(correlation_id, plan, CommandStatus.QUEUED)` 후 `AgentDebugQueryResponse(accepted=True, command_id, correlation_id)`.

### 브라우저 로그 스트림 (BQ-058/BQ-059)

- `GET /pods/{namespace}/{name}/logs/stream?cluster_id=&container?`와 `GET /workloads/{kind}/{namespace}/{name}/logs/stream?cluster_id=`는 `src/domains/log_stream/`이 제공한다. 세션 workspace와 exact cluster/target을 매 배치 다시 확인하고 `inventory.read`와 `evidence.read`가 모두 필요하다. 권한 없음과 target 없음은 모두 404다.
- 브라우저 입력에는 LogQL이 없다. 서버가 exact namespace/pod/container selector만 만들고 `queue_debug_query`로 기존 `telemetry.query.run` agent protocol에 적재한다. 공용 `POST /agent/debug/query`는 예약 metadata `log_stream`과 `browser_log_stream_` name prefix를 422로 거부하므로 사용자가 AI용 stream handle을 위조할 수 없다. 에이전트 protocol과 Loki provider wire shape은 바뀌지 않는다.
- SSE는 named event를 쓰지 않고 `data: <strict JSON>\n\n`만 보낸다. envelope type은 `connected`, `log`, `pod_added`, `pod_removed`, `end`, `error`다. `connected.stream_id`는 첫 persisted debug command ID이며 process-local cache가 아니다. 후속 poll batch는 command ID는 새로 발급하되 첫 command의 correlation ID를 공유해 하나의 논리 스트림으로 묶는다.
- 로그는 Loki provider의 `redaction_summary.applied=true`인 persisted completed result만 읽고, 공용 `packages.security.log_lines`로 다시 redact/truncate한 최대 4096자 line만 내보낸다. polling/batch/dedupe는 모두 bounded이며 연결 해제는 100ms 이내 poll로 중단한다. fake line이나 synthetic fallback은 없다.

## 불변식·오류 (Invariants & Errors)

- 같은 요청(같은 correlation + 내용)은 같은 `idempotency_key` → 같은 `command_id` → `ON CONFLICT DO NOTHING`으로 중복 적재 없음.
- 리스 프로토콜: start/heartbeat/result는 `lease_id + agent_id + 상태 + leased_until >= now()`가 모두 일치해야 성공 — 불일치는 404 `"command not found"`.
- 리스 획득은 `FOR UPDATE SKIP LOCKED`로 에이전트 간 경합 안전.
- 결과 기록과 `command.completed` 이벤트 스테이징(events+outbox)은 단일 트랜잭션(원자성).
- 쓰기 명령(내장 3종)은 제어 허용 네임스페이스(`CONTROL_ALLOWED_NAMESPACES`, 기본 sandbox만) 한정. `management` 네임스페이스는 보호 네임스페이스라 allowlist에 있어도 gateway/command-worker/target-agent 모두에서 거부된다. 승인 레코드는 `apply_manifest`는 필수, `deployment_scale`은 sandbox 환경 면제(기본), `rollout_restart`는 비파괴라 불요.
- management 클러스터 쓰기 명령은 gateway와 command-worker에서 각각 차단된다. target-agent도 management role이면 write action(`apply_manifest`, rollout restart, k8s patch/scale)을 Kubernetes API 호출 전 실패 결과(`message="management_readonly"`)로 무시한다.
- 수동 명령은 diff 필수(422), 서버가 임의 리소스를 합성하지 않음. deployment 제어는 허용목록 외 네임스페이스 422(`"namespace is not allowed by control policy"`).
- 정책 reject에는 반드시 reason이 있다(`Result.require_reason`).
- 카탈로그 중복 등록(동일 action, 다른 spec) → `ValueError`.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `COMMAND_LEASE_SECONDS` | int | 60 | 명령 리스 유지 초 |
| `COMMAND_HEARTBEAT_INTERVAL_SECONDS` | int | 20 | 리스 하트비트 간격 초 |
| `COMMAND_RETRY_MAX_ATTEMPTS` | int | 3 | 에이전트 재시도 최대 횟수 |
| `COMMAND_RETRY_DELAY_SECONDS` | int | 5 | 재시도 간격 초 |
| `COMMAND_POLL_DEFAULT_SECONDS` | int | 10 | 롱폴 기본 대기 초 |
| `COMMAND_POLL_MAX_SECONDS` | int | 30 | 롱폴 최대 대기 초 |
| `COMMAND_POLL_SLEEP_SECONDS` | int | 1 | 롱폴 반복 간 대기 초(LISTEN/NOTIFY 미가동 시 폴링 주기) |
| `CONTROL_ALLOWED_NAMESPACES` | str(CSV) | `"sandbox"` | 제어(쓰기) 명령 허용 네임스페이스 — `src/packages/config/control.py`가 단일 기준(게이트웨이 검증·워커 정책·cluster-agent 공용), 매 호출 시 평가 |
| `COMMAND_AUTO_APPROVE_ACTIONS` | str(CSV) | `"k8s.apps.v1.deployments.scale"` | 환경 한정 승인 면제 대상 액션 |
| `COMMAND_AUTO_APPROVE_ENVIRONMENTS` | str(CSV, 소문자 비교) | `"sandbox"` | 승인 면제가 적용되는 environment 목록 |
| `COMMAND_NOTIFY_DATABASE_URL` | str | 미설정 = 리스너 비활성 | LISTEN/NOTIFY 웨이크업 리스너용 직결 DB URL(pgbouncer 우회) — `src/packages/runtime/command_wakeup.py :: COMMAND_NOTIFY_DATABASE_URL_ENV`([runtime](../packages/runtime.md)). 미설정/리스너 장애 시 `WAKEUP.wait`가 타임아웃까지 잠들어 기존 주기 폴링과 동일(fail-open) |
