---
source_commit: d4b003525
status: synced
---

# target — target cluster 등록·desired state·agent 정책·evidence job 조정 도메인

> 소스: `src/domains/target/` · 테스트: `tests/test_target_registration.py`, `tests/test_target_reconciler.py`, `tests/test_target_evidence_jobs.py`, `tests/test_target_policy_control.py`, `tests/test_agent_evidence_ingest.py`

## 책임 (Responsibility)

**한다:**
- target Kubernetes 클러스터 **등록**: 설치 manifest(YAML) 생성, per-cluster agent 토큰 발급, (선택) `kubectl apply` 직접 실행, **원라인 인스톨러**(`GET /install/{agent_token}` — 토큰 해시 대조로 manifest 재렌더, `curl | kubectl apply` 한 줄 설치).
- 제품 연결 위자드용 얇은 계약(`POST /clusters/connect`, `GET /clusters/{id}/connection`)을 제공한다. 등록·토큰·만료·권한은 별도 구현하지 않고 기존 target 등록 경계를 그대로 재사용한다.
- 제어(쓰기) 허용 네임스페이스를 등록 요청의 `control_namespaces` CSV로 받아 설치 manifest ConfigMap에 `CONTROL_ALLOWED_NAMESPACES`로 주입(클러스터별 상이 가능, [command](./command.md)의 제어 정책과 같은 단일 기준).
- 클러스터별 **desired state**(컴포넌트 목표 상태) 저장·버전 계산, desired/actual 비교(**reconcile drift 판정**) 순수 로직 제공.
- cluster agent **정책(AgentPolicy)** 저장·조회·머지, agent가 보고하는 policy/reconcile 적용 상태 기록.
- agent coordination: agent 접속 상태(`cluster_agent_status`) upsert/조회, 클러스터 연결 상태(`online`/`stale`/`never_connected`) 판정. evidence 폴링/결과 보고 시 heartbeat(best-effort `touch_agent_seen`) 기록.
- **evidence job 큐**: provider별 수집 잡 큐잉 → 리스(lease) 기반 분배(롱폴) → 결과 수집 → 윈도우 단위 dedupe 후 `cluster.evidence.received` 이벤트 1회 발행. `completed` kubernetes 결과는 [inventory](./inventory.md) 스냅샷으로도 적재.

**하지 않는다:**
- Kubernetes API 직접 호출(reconciler는 순수 비교 로직 — `ActualStateReader` port 뒤에서 서비스가 연결. `src/domains/target/reconciler.py` 모듈 docstring 참조).
- evidence 실제 수집(target cluster의 cluster-agent 서비스가 수행), RCA 분석(rca 도메인), 클러스터 레지스트리 저장(identity/공유 DB facade의 `register_target_cluster` 등에 위임).
- reconcile 이벤트(`cluster.reconcile.*`)의 발행/구독 처리(이벤트 **계약**만 정의, 실행은 services 계층).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity` | [identity](./identity.md) | `require_admin_session`/`require_session`/`require_cluster_agent`/`require_cluster_access`, `ClusterAgentIdentity`, `hash_agent_token` |
| import | `domains.inventory` | [inventory](./inventory.md) | `kubernetes_evidence_to_inventory_snapshot` — evidence job kubernetes 결과의 인벤토리 스냅샷 변환 |
| import | `domains.providers` | [providers](./providers.md) | `ProviderCategory`, `require_available_provider` — 설치 provider 검증 |
| import | `domains.rca` | [rca](./rca.md) | `ClusterEvidenceReceivedBody` — evidence 완성 시 발행하는 이벤트 body |
| import | `packages.contracts` | [contracts](../packages/contracts.md) | `EventSubject`, `EventBody`, `TargetComponent`, `TargetReconcileStatus`, `TargetDesiredStateStatus`, `TARGET_NAMESPACE`, `SANDBOX_NAMESPACE`, gateway routes/requests/responses, `merge_agent_policy`, identity 상수 |
| import | `packages.config` | [config](../packages/config.md) | `env()`, `Target` 상수(`DEFAULT_EVIDENCE_INTERVAL_SECONDS` 등) |
| import | `packages.events` | [events](../packages/events.md) | `event()` envelope 팩토리 |
| import | `packages.runtime` | [runtime](../packages/runtime.md) | `get_db`, `get_events` FastAPI 의존성 |
| import | `packages.storage` | [storage](../packages/storage.md) | `Base`, 컬럼 헬퍼, `DatabaseConnection`, `iso_or_none`, `unit_of_work_or_null`, `EventModel`, `OutboxModel` |
| 외부 | `kubectl` CLI | — | `apply=true` 등록 시 manifest 직접 적용(subprocess) |

## 공개 인터페이스 (Public API)

### 모듈: `src/domains/target/__init__.py`
docstring만 있는 패키지 마커("target cluster 등록 도메인"). public 심볼 없음.

### 데이터 모델 클래스 — `src/domains/target/models.py`
- `src/domains/target/models.py :: EvidenceWindow`
- `src/domains/target/models.py :: EvidenceJob`
- `src/domains/target/models.py :: TargetDesiredState`
- `src/domains/target/models.py :: TargetReconcileRecord`
- `src/domains/target/models.py :: AgentPolicyRecord`
- `src/domains/target/models.py :: AgentPolicyStatusRecord`
- `src/domains/target/models.py :: ClusterAgentStatusRecord`
- `src/domains/target/models.py :: AgentReconcileStatusRecord`

스키마는 [데이터 모델](#데이터-모델-data-model) 참조.

### 이벤트 body — `src/domains/target/events.py`
[이벤트](#이벤트-events) 참조.

### 리포지토리 — `src/domains/target/repository.py`

`src/domains/target/repository.py :: TargetAgentRepository` — `packages.storage.engine :: DatabaseConnection` 상속. 메서드 전체:

| 시그니처 | 쿼리 의미 |
|---|---|
| `save_cluster_agent_status(*, workspace_id: str, cluster_id: str, agent_id: str, capabilities: list[str], status: str = "connected", details: JsonObject \| None = None) -> JsonObject` | `cluster_agent_status`에 upsert(PK 충돌 시 status/capabilities/details/last_seen_at/updated_at 갱신). 같은 트랜잭션에서 현재 agent가 아닌 행 중 `AGENT_STATUS_RETENTION_SECONDS`(기본 3600초)를 넘긴 행을 정리한다. capabilities는 `dict.fromkeys`로 중복 제거·순서 유지. `last_seen_at=now()`. 직렬화(`serialize_cluster_agent_status`)해서 반환 |
| `list_cluster_agent_statuses(workspace_id: str, cluster_id: str) -> list[JsonObject]` | 해당 클러스터의 agent 상태 전체를 `last_seen_at DESC, agent_id` 순으로 조회 |
| `latest_cluster_agent_statuses(workspace_id: str, cluster_ids: set[str] \| None) -> dict[str, JsonObject]` | 클러스터별 최신(last_seen_at 최대) agent 1건 맵. `cluster_ids`가 빈 set이면 즉시 `{}`, `None`이면 워크스페이스 전체 |
| `upsert_cluster_policy(workspace_id: str, cluster_id: str, policy: JsonObject) -> JsonObject` | `agent_policies` upsert. `policy["generation"]`(기본 1)이 기존 generation **초과**가 아니면 `ValueError("policy generation must be greater than the current generation")`. 저장된 policy dict 반환 |
| `get_cluster_policy(workspace_id: str, cluster_id: str) -> JsonObject \| None` | policy JSONB 단건 조회 |
| `save_agent_policy_status(workspace_id: str, payload: JsonObject) -> None` | `agent_policy_status`에 append-only insert. payload에서 `cluster_id`/`generation`/`status` 필수, `message`(기본 `""`)/`details`(기본 `{}`) |
| `save_agent_reconcile_status(workspace_id: str, payload: JsonObject) -> None` | `agent_reconcile_status`에 append-only insert. 필드 규칙은 위와 동일 |
| `upsert_target_desired_states(workspace_id: str, cluster_id: str, components: list[JsonObject], updated_by: str \| None) -> list[JsonObject]` | 컴포넌트별로 `target_desired_states` upsert. status는 항상 `TargetDesiredStateStatus.ACTIVE.value`(`"active"`). 각 컴포넌트 dict는 `component`/`namespace`/`version`/`spec` 키 필수. 저장 행 목록 반환 |
| `list_target_desired_states(workspace_id: str, cluster_id: str) -> list[JsonObject]` | 클러스터의 desired state를 `component` 순으로 조회 |
| `record_target_reconcile_result(payload: JsonObject) -> JsonObject` | `target_reconcile_records`에 insert. `reconcile_id`는 payload에 없으면 `uuid4()`. `workspace_id`/`cluster_id`/`desired_state_version`/`status`/`drifted`/`applied`/`message` 필수, `details` 기본 `{}` |
| `queue_evidence_jobs(*, workspace_id: str, cluster_id: str, source_id: str, window_start: str, provider_keys: list[str], failure_policy: str, max_attempts: int, policy_generation: int, provider_policies: dict[str, JsonObject]) -> JsonObject` | provider_key 중복 제거 후 provider별 1잡을 `evidence_jobs`에 `ON CONFLICT (job_id) DO NOTHING` insert(status=`queued`, attempt_count=0). 결정적 `job_id` = `evidence_job_id(...)` → 같은 윈도우 재스케줄은 idempotent. `{"accepted": True, "evidence_key": <parent>, "queued": <신규 수>, "job_ids": [...]}` 반환 |
| `async lease_evidence_job(*, workspace_id: str, cluster_id: str, provider_key: str, agent_id: str, lease_seconds: int = DEFAULT_EVIDENCE_JOB_LEASE_SECONDS) -> JsonObject \| None` | `queued` 또는 `leased`이지만 `leased_until < now()`(만료 리스) 잡 중 `created_at` 오름차순 1건을 `SELECT ... FOR UPDATE SKIP LOCKED` 서브쿼리로 선점 → `status=leased`, 새 `lease_id`(uuid4), `agent_id`, `leased_until=now+lease_seconds`, `attempt_count+1`, `error=NULL` 로 UPDATE. 비동기 커넥션 사용. 없으면 `None` |
| `complete_evidence_job(*, workspace_id: str, cluster_id: str, job_id: str, lease_id: str, agent_id: str, status: str, result: JsonObject, error: str) -> JsonObject \| None` | lease_id+agent_id+`status=leased`+`leased_until >= now()`가 모두 일치하는 활성 리스를 `FOR UPDATE`로 잠금 후 완료 처리. `status="failed"`이면 `attempt_count >= max_attempts`일 때만 최종 `failed`, 아니면 `queued`로 재큐잉(result는 `completed`일 때만 저장). 활성 리스가 없으면 같은 lease/agent의 `completed`/`failed`/`queued` 행을 조회해 반환(중복 보고 멱등 처리), 그것도 없으면 `None` |
| `evidence_payload_if_ready(evidence_key_value: str) -> JsonObject \| None` | 해당 evidence_key의 잡 행들을 `provider_key` 순으로 읽어 `aggregate_evidence_payload`에 위임 |
| `evidence_job_status_counts() -> dict[str, int]` | status별 `COUNT(*)` 집계(모니터링용) |
| `oldest_evidence_job_age_seconds(status: str) -> float` | 해당 status에서 가장 오래된 잡의 나이(초). 없으면 `0.0` |
| `serialize_evidence_job(row: JsonObject) -> JsonObject` | `leased_until`을 ISO 문자열/None으로 변환 |
| `serialize_cluster_agent_status(row: JsonObject) -> JsonObject` | `last_seen_at`/`created_at`/`updated_at`을 ISO 문자열/None으로 변환 |
| `get_evidence_window(evidence_key: str) -> JsonObject \| None` | `evidence_windows`에서 `event_id`/`correlation_id`/`updated_at` 조회 |
| `record_evidence_event_once(*, evidence_key: str, workspace_id: str, cluster_id: str, source_id: str, window_start: str, agent_id: str \| None, event_envelope: EventEnvelope, payload: JsonObject) -> JsonObject` | **한 트랜잭션**에서 evidence window insert(중복이면 기존 event_id 반환하고 이벤트 미발행) + `events`/`outbox` 테이블에 envelope 스테이징(`stage_event_envelope`). 윈도우당 이벤트 정확히 1회 보장 |
| `stage_event_envelope(conn: Any, event_table: Any, outbox_table: Any, event_envelope: EventEnvelope) -> None` | 주어진 커넥션 위에서 `events`/`outbox` 두 테이블에 `ON CONFLICT (event_id) DO NOTHING` insert |
| `release_stale_pending_evidence_window(evidence_key: str, stale_after_seconds: int = DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS) -> bool` | pending 행 중 `updated_at`이 TTL보다 오래된 것만 삭제. 삭제됐으면 `True` |

### 라우터 — `src/domains/target/router.py`

라우터 객체:
- `src/domains/target/router.py :: router` — 세션 인증 엔드포인트용 `APIRouter`. 마지막 줄에서 `router.include_router(agent_router)`로 병합.
- `src/domains/target/router.py :: agent_router` — per-cluster 토큰(`x-agent-token`) 인증 엔드포인트용 `APIRouter`. lease의 workspace/cluster는 토큰 identity에서만 취함.

모듈 상수:

| 앵커 | 값 | 의미 |
|---|---|---|
| `src/domains/target/router.py :: AGENT_TOKEN_BYTES` | `32` | per-cluster agent 토큰 엔트로피(`secrets.token_urlsafe`) |
| `src/domains/target/router.py :: KUBECTL_NOT_AVAILABLE` | `"kubectl is not available to api-gateway"` | 503 detail |
| `src/domains/target/router.py :: KUBECTL_APPLY_FAILED` | `"target install apply failed"` | 502 detail |
| `src/domains/target/router.py :: KUBECTL_APPLY_TIMEOUT` | `"target install apply timed out"` | 504 detail |
| `src/domains/target/router.py :: KUBECTL_APPLY_TIMEOUT_SECONDS_ENV` | `"KUBECTL_APPLY_TIMEOUT_SECONDS"` | env 키 |
| `src/domains/target/router.py :: DEFAULT_KUBECTL_APPLY_TIMEOUT_SECONDS` | `"30"` | apply 타임아웃 기본값(문자열) |
| `src/domains/target/router.py :: KUBE_CONTEXT_ALLOWLIST_ENV` | `"KUBE_CONTEXT_ALLOWLIST"` | 콤마구분 허용 kube context 목록 env 키 |
| `src/domains/target/router.py :: KUBE_CONTEXT_NOT_ALLOWED` | `"kube context is not in the allowlist"` | 403 detail |
| `src/domains/target/router.py :: DIRECT_APPLY_DEPLOY_PROVIDER` | `"kube-context"` | 직접 apply용 deploy provider 키 |
| `src/domains/target/router.py :: MANUAL_MANIFEST_DEPLOY_PROVIDER` | `"manual-manifest"` | 수동 manifest deploy provider 키 |
| `src/domains/target/router.py :: TARGET_PROVIDER_INVALID` | `"target install provider selection is invalid"` | 422 detail prefix |
| `src/domains/target/router.py :: DEFAULT_EVIDENCE_JOB_POLL_SECONDS_ENV` | `"EVIDENCE_JOB_POLL_DEFAULT_SECONDS"` | 롱폴 기본 대기 초 env 키 |
| `src/domains/target/router.py :: DEFAULT_EVIDENCE_JOB_POLL_SECONDS` | `int(env(..., "10"))` | 롱폴 기본 대기 초(기본 10, import 시 평가) |
| `src/domains/target/router.py :: MAX_EVIDENCE_JOB_POLL_SECONDS_ENV` | `"EVIDENCE_JOB_POLL_MAX_SECONDS"` | 롱폴 최대 대기 초 env 키 |
| `src/domains/target/router.py :: MAX_EVIDENCE_JOB_POLL_SECONDS` | `int(env(..., "30"))` | 롱폴 최대 대기 초(기본 30) |
| `src/domains/target/router.py :: EVIDENCE_JOB_POLL_SLEEP_SECONDS_ENV` | `"EVIDENCE_JOB_POLL_SLEEP_SECONDS"` | 롱폴 반복 간 대기 초 env 키 |
| `src/domains/target/router.py :: EVIDENCE_JOB_POLL_SLEEP_SECONDS` | `int(env(..., "1"))` | 롱폴 반복 간 대기 초(기본 1) |
| `src/domains/target/router.py :: NOT_FOUND_CODE` | `404` | evidence job 미존재 status code |
| `src/domains/target/router.py :: EVIDENCE_JOB_NOT_FOUND` | `"evidence job not found"` | 404 detail |
| `src/domains/target/router.py :: AGENT_ONLINE_WINDOW_SECONDS_ENV` | `"AGENT_ONLINE_WINDOW_SECONDS"` | agent online 판정 윈도우 env 키 |
| `src/domains/target/router.py :: DEFAULT_AGENT_ONLINE_WINDOW_SECONDS` | `120` | online 판정 윈도우 기본값(초) |
| `src/domains/target/router.py :: AGENT_STATUS_NEVER_CONNECTED` | `"never_connected"` | 연결 이력 없음 |
| `src/domains/target/router.py :: AGENT_STATUS_ONLINE` | `"online"` | 윈도우 내 heartbeat 있음 |
| `src/domains/target/router.py :: AGENT_STATUS_STALE` | `"stale"` | heartbeat이 윈도우를 벗어남/파싱 불가 |
| `src/domains/target/router.py :: TARGET_AGENT_IMAGE_ENV` | `"TARGET_AGENT_IMAGE"` | agent 기본 이미지 env 키(placeholder 이미지 치환 1순위) |
| `src/domains/target/router.py :: GITOPS_WEBHOOK_IMAGE_ENV` | `"GITOPS_WEBHOOK_IMAGE"` | agent 기본 이미지 env 키(2순위 폴백) |
| `src/domains/target/router.py :: PUBLIC_MANAGEMENT_BASE_URL_ENV` | `"PUBLIC_MANAGEMENT_BASE_URL"` | `management_base_url` 미지정 시 우선 사용하는 공개 게이트웨이 주소 env 키 |
| `src/domains/target/router.py :: PUBLIC_API_BASE_URL_ENV` | `"PUBLIC_API_BASE_URL"` | `PUBLIC_MANAGEMENT_BASE_URL` 미지정 시 fallback 공개 API 주소 env 키 |
| `src/domains/target/router.py :: PUBLIC_BASE_URL_ENV` | `"PUBLIC_BASE_URL"` | 공개 API 주소 env 미지정 시 fallback 서비스 루트 env 키(`/api` 접미 정규화) |
| `src/domains/target/router.py :: LOCAL_PLACEHOLDER_IMAGES` | `{"", "service:local", "kubeheal-service:latest"}` | 기본 이미지 치환 대상 placeholder 집합 |
| `src/domains/target/router.py :: BLOCKED_TEST_CLUSTER_IDS` | `{"bruno-api-test"}` | 등록 거부·목록 제외되는 테스트 클러스터 id |
| `src/domains/target/router.py :: BLOCKED_TEST_CLUSTER_NAME_PARTS` | `("bruno api test",)` | 이름 부분 일치로 차단하는 테스트 클러스터 마커 |

헬퍼 함수:

| 앵커 | 시그니처 | 동작 |
|---|---|---|
| `src/domains/target/policy_upgrade.py :: target_desired_components` | `(payload: TargetRegisterRequest) -> list[TargetDesiredComponent]` | 등록 요청을 desired-state 컴포넌트 2개로 정규화: (1) `cluster-agent`(spec: `deployment`, `management_base_url`, `evidence_interval_seconds`, `loki_base_url`, `tempo_base_url`, `otel_traces_endpoint`), (2) `node-collector`(spec: `enabled=payload.install_node_collector`, `daemonset="optional-node-collector"`, `managed_by="cluster-agent"`). Prometheus 주소는 desired-state·install manifest에 저장하지 않고 integration 계약으로만 전달한다. |
| `src/domains/target/router.py :: allowed_kube_contexts` | `() -> set[str]` | `KUBE_CONTEXT_ALLOWLIST` env를 콤마 분리·trim한 set(빈 항목 제거) |
| `src/domains/target/router.py :: normalize_target_provider_defaults` | `(payload: TargetRegisterRequest) -> TargetRegisterRequest` | 기본값 승격 3종을 모아 복사본 반환: ① `apply=true`이고 `deploy_provider` 미명시(`model_fields_set` 기준)면 `deploy_provider="kube-context"`; ② `image`가 `LOCAL_PLACEHOLDER_IMAGES`에 속하면 `TARGET_AGENT_IMAGE` → `GITOPS_WEBHOOK_IMAGE` env 순으로 기본 이미지 치환; ③ `management_base_url`은 trailing `/` 제거 후 `/api`로 끝나지 않으면 `/api` 접미 부여, 빈 값이면 `PUBLIC_MANAGEMENT_BASE_URL` → `PUBLIC_API_BASE_URL` → `PUBLIC_BASE_URL` 순서로 합성. 변경 없으면 원본 반환 |
| `src/domains/target/router.py :: require_management_base_url` | `(payload: TargetRegisterRequest) -> None` | 정규화 후에도 `management_base_url` 이 비어 있으면 422 `"management base URL is not configured"` 로 차단 |
| `src/domains/target/router.py :: reject_test_target` | `(payload: TargetRegisterRequest) -> None` | `cluster_id ∈ BLOCKED_TEST_CLUSTER_IDS` 또는 이름에 `BLOCKED_TEST_CLUSTER_NAME_PARTS` 마커 포함 → 422 `"test target registrations are not allowed"`; 이미지가 여전히 placeholder(`LOCAL_PLACEHOLDER_IMAGES`)면 → 422 `"target agent image is not configured"` |
| `src/domains/target/router.py :: install_command_for` | `(payload: TargetRegisterRequest, agent_token: str) -> str` | 원라인 설치 명령 합성 — `curl -fsSL <base>/install/<token> \| kubectl apply -f -`. URL은 `shlex.quote`로 shell escaping한다. 등록 전에 인증된 배포 경계의 `PUBLIC_MANAGEMENT_BASE_URL`이 요청 body보다 우선하며, 유효한 서버 주소가 없으면 `""` |
| `src/domains/target/router.py :: management_access_response` | `() -> ManagementAccessResponse` | `OPSIA_ACCESS_MODE`와 정규화된 서버 권위 URL로 `external`/`self_only`를 판정한다. external URL이 없으면 localhost를 합성하지 않고 `external_url_not_configured`를 반환 |
| `src/domains/target/router.py :: bootstrap_command_for` | `(payload: TargetRegisterRequest, agent_token: str) -> str` | provider별 복사 실행 명령 합성. `eks`는 `aws eks update-kubeconfig`, `gke`는 `gcloud container clusters get-credentials`, `aks`는 `az aks get-credentials`, `existing-k8s`/`kind`/`minikube`는 `kubectl --context ...` 기반. 사용자 입력은 모두 `shlex.quote`로 escaping한다. |
| `src/domains/target/router.py :: validate_target_bootstrap_config` | `(payload: TargetRegisterRequest) -> None` | `eks(region, eks_cluster_name)`, `gke(project_id, location_type, location, gke_cluster_name)`, `aks(resource_group, aks_cluster_name)` 필수 provider_config를 DB write 전에 검증한다. |
| `src/domains/target/router.py :: touch_agent_seen` | `(db, identity: ClusterAgentIdentity, agent_id: str \| None, *, status: str = "connected") -> None` | best-effort heartbeat — `agent_id` 없거나 db에 `save_cluster_agent_status` 없으면 no-op. capabilities는 `None`을 넘겨 최초 connect에서 Agent가 광고한 실제 capability를 보존하고, details에 heartbeat source만 기록한다. |
| `src/domains/target/router.py :: inventory_counts` | `(counts: list[dict]) -> dict[str, int]` | `inventory_resource_counts` 결과를 resource_type별 총계로 합산(클러스터 목록의 node/pod 수 표시용) |
| `src/domains/target/router.py :: validate_target_install_providers` | `(payload: TargetRegisterRequest) -> None` | `require_available_provider(CLOUD, cloud_provider)`·`(DEPLOY, deploy_provider)` 검증(`ValueError` → 422). `apply=true`인데 deploy_provider≠`kube-context` → 422. `kube_context` 지정인데 deploy_provider≠`kube-context` → 422 |
| `src/domains/target/router.py :: kube_context_connectivity_error` | `(kube_context: str \| None) -> str \| None` | direct apply preflight 전용 non-mutating 연결성 검사. `kubectl [--context <ctx>] get --raw=/version --request-timeout=5s`를 실행한다. `kubectl` 없음 → `"kubectl is not available to api-gateway"`, timeout → `"kubernetes preflight connection timed out"`, returncode≠0 → `"kubernetes preflight connection failed: <첫 줄>"`, 성공 → `None` |
| `src/domains/target/router.py :: apply_manifest_with_kubectl` | `(manifest: str, kube_context: str \| None) -> str` | allowlist 검증(아래 불변식) → `kubectl [--context <ctx>] apply -f -`에 manifest를 stdin으로 전달. `shutil.which("kubectl")` 없음 → 503, `TimeoutExpired` → 504, returncode≠0 → 502. 성공 시 stdout 반환 |
| `src/domains/target/router.py :: install_response` | `(payload: TargetRegisterRequest, manifest: str, apply_output: str \| None, agent_token: str, connect_timeout_seconds, connect_expires_at) -> TargetInstallResponse` | `registered=True`, direct apply 성공이면 `status="install_applied"`, 수동 설치 대기면 `status="pending_install"`, `connection_stage="token_issued"`, `applied=apply_output is not None`, 설치 명령과 연결 만료 정보를 응답 조립 |
| `src/domains/target/router.py :: agent_online_window_seconds` | `() -> int` | `max(1, int(env(AGENT_ONLINE_WINDOW_SECONDS, "120")))` |
| `src/domains/target/router.py :: parse_timestamp` | `(value: str \| None) -> datetime \| None` | ISO 파싱, 실패 시 `None`, naive면 UTC 부여 |
| `src/domains/target/router.py :: cluster_connection_status` | `(agent: dict[str, Any] \| None) -> str` | `None` → `never_connected`; `last_seen_at` 파싱 불가 → `stale`; `now-last_seen_at <= window` → `online`, 아니면 `stale` |
| `src/domains/target/router.py :: cluster_summary` | `(cluster: dict[str, Any], latest_agent: dict[str, Any] \| None, latest_snapshot: dict[str, Any] \| None = None) -> ClusterSummary` | 클러스터 레지스트리·최신 agent·현재 연결 epoch의 inventory snapshot으로 provider와 연결 단계를 조립 |
| `src/domains/target/router.py :: lease_next_evidence_job` | `async (db: Any, cluster_id: str, workspace_id: str, provider_key: str, agent_id: str, timeout: int) -> dict[str, Any] \| None` | `deadline = now + min(timeout, MAX_EVIDENCE_JOB_POLL_SECONDS)`까지 `db.lease_evidence_job(...)`을 `EVIDENCE_JOB_POLL_SLEEP_SECONDS` 간격으로 반복. 리스 성공 시 즉시 반환, 데드라인 초과 시 `None` |
| `src/domains/target/router.py :: emit_evidence_if_ready` | `async (evidence_key: str, events: Any, db: Any) -> EvidenceJobResultResponse \| None` | [동작 4단계](#3-evidence-job-파이프라인) 참조 |
| `src/domains/target/router.py :: db_call` | `async (func: Any, *args: Any, **kwargs: Any) -> Any` | 동기 repository 호출을 `asyncio.to_thread`로 오프로드 |
| `src/domains/target/router.py :: release_stale_pending_evidence_window` | `async (db: Any, evidence_key: str) -> bool` | `db.release_stale_pending_evidence_window(evidence_key, DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS)`를 스레드로 실행 |

HTTP 엔드포인트(핸들러 함수도 public 심볼):

| 메서드+경로 | 핸들러 앵커 | 요청 | 응답 | 인증/권한 |
|---|---|---|---|---|
| `POST /targets/preflight` | `src/domains/target/router.py :: target_registration_preflight` | body: `TargetPreflightRequest` | `TargetPreflightResponse` | `require_admin_session`; `apply=true` + `deploy_provider="kube-context"` + allowlist 통과 시 실제 Kubernetes API `/version` 연결성까지 확인 |
| `POST /targets` | `src/domains/target/router.py :: register_target` | body: `TargetRegisterRequest` | `TargetInstallResponse` | `require_admin_session` (kubectl apply 실행 가능 → admin 전용) |
| `POST /clusters/connect` | `src/domains/target/router.py :: connect_cluster` | body: `ClusterConnectRequest` | `ClusterConnectResponse` | `require_admin_session`; 기존 `register_target`을 호출해 토큰 hash·UoW·만료 계약을 재사용하고 설치 명령만 제품 응답으로 좁힌다. |
| `GET /install/{agent_token}` (`INSTALL_MANIFEST_PATH`) | `src/domains/target/router.py :: install_manifest_by_token` | path: `agent_token` | `PlainTextResponse`(`text/yaml`) | 없음(토큰 자체가 자격증명) — `hash_agent_token` 해시로 `authenticate_cluster_agent` 조회, 미등록/불일치 404 `"install link not found"`(존재 여부 비구분) |
| `GET /clusters` | `src/domains/target/router.py :: list_clusters` | query: `limit: int = 100` | `ClusterListResponse` | `require_session` + `accessible_resource_ids(..., CLUSTER, Permission.CLUSTER_READ)` 필터 |
| `GET /clusters/{cluster_id}` | `src/domains/target/router.py :: get_cluster` | path: `cluster_id` | `ClusterResponse` | `require_session` + `require_cluster_access(..., Permission.CLUSTER_READ)` |
| `GET /clusters/{cluster_id}/connection-status` | `src/domains/target/router.py :: get_cluster_connection_status` | path: `cluster_id` | `ClusterConnectionStatusResponse` | `require_session` + `require_cluster_access(..., Permission.CLUSTER_READ)` |
| `GET /clusters/{cluster_id}/connection` | `src/domains/target/router.py :: get_cluster_connection` | path: `cluster_id` | `ClusterConnectStatusResponse` | `require_session` + 기존 connection-status의 cluster read 권한; `waiting\|connected\|expired`로 제품 상태를 좁혀 반환한다. |
| `DELETE /clusters/{cluster_id}` | `src/domains/target/router.py :: unregister_cluster` | path: `cluster_id`, query: `purge: bool = false` | 204 / 400 / 403 / 404 | `require_admin_session`; 기본은 soft-delete. `purge=true`는 `TEST_FIXTURE_PURGE_ENABLED=1`이면서 registration `environment=test`인 target role fixture만 물리 삭제 |
| `PUT /clusters/{cluster_id}/policy` | `src/domains/target/router.py :: update_cluster_policy` | path: `cluster_id`, body: `AgentPolicy` | `dict[str, Any]` (`{"accepted": True, "policy": <stored>}`) | `require_admin_session` |
| `GET /clusters/{cluster_id}/scheduling-profiles` | `src/domains/target/router.py :: get_cluster_scheduling_profiles` | path: `cluster_id` | `SchedulingPolicyResponse` | `require_session` + `require_cluster_access(..., Permission.CLUSTER_READ)` |
| `PUT /clusters/{cluster_id}/scheduling-profiles` | `src/domains/target/router.py :: update_cluster_scheduling_profiles` | path: `cluster_id`, body: `SchedulingPolicy` | `SchedulingPolicyResponse` | `require_admin_session`; management role은 400 `{code:"management_readonly"}` |
| `GET /agent/policy` | `src/domains/target/router.py :: agent_policy` | query: `cluster_id: str`, `generation: int = 0` | `AgentPolicyResponse` | `require_cluster_agent` (per-cluster 토큰) |
| `POST /agent/policy/status` | `src/domains/target/router.py :: agent_policy_status` | body: `AgentPolicyStatusRequest` | `dict[str, bool]` (`{"accepted": True}`) | `require_cluster_agent` |
| `POST /agent/reconcile/status` | `src/domains/target/router.py :: agent_reconcile_status` | body: `AgentReconcileStatusRequest` | `dict[str, bool]` (`{"accepted": True}`) | `require_cluster_agent` |
| `POST /agent/evidence/jobs` | `src/domains/target/router.py :: schedule_evidence_jobs` | body: `EvidenceJobScheduleRequest` | `EvidenceJobScheduleResponse` | `require_cluster_agent` |
| `GET /agent/evidence/jobs/poll` | `src/domains/target/router.py :: poll_evidence_job` | query: `provider_key: str`, `agent_id: str = "target-agent"`, `timeout: int = DEFAULT_EVIDENCE_JOB_POLL_SECONDS` | `EvidenceJobPollResponse` | `require_cluster_agent` |
| `POST /agent/evidence/jobs/{job_id}/result` | `src/domains/target/router.py :: evidence_job_result` | path: `job_id`, body: `EvidenceJobResultRequest` | `EvidenceJobResultResponse` | `require_cluster_agent` |

경로 상수는 `src/packages/contracts/gateway/routes.py`(`TARGETS_PATH`, `TARGETS_PREFLIGHT_PATH`, `CLUSTERS_PATH`, `CLUSTER_PATH`, `CLUSTER_CONNECTION_STATUS_PATH`, `CLUSTER_POLICY_PATH`, `AGENT_POLICY_PATH`, `AGENT_POLICY_STATUS_PATH`, `AGENT_RECONCILE_STATUS_PATH`, `AGENT_EVIDENCE_JOB_SCHEDULE_PATH`, `AGENT_EVIDENCE_JOB_POLL_PATH`, `AGENT_EVIDENCE_JOB_RESULT_PATH`)에서 가져온다 — [contracts](../packages/contracts.md).

요청/응답 모델 요약(정의는 `src/packages/contracts/gateway/requests.py`, `src/packages/contracts/gateway/responses.py`):
- `TargetRegisterRequest`: `cluster_id: str | None`(미지정 시 서버가 `<name-slug>-<4자리 난수>` 생성), `name`, `environment`, `workspace_id`, `management_base_url: str = ""`, `image: str = ""`, `loki_base_url`, `tempo_base_url`, `otel_traces_endpoint`, `evidence_interval_seconds`, `control_namespaces`, `install_node_collector`, `install_sample_workload`, `sample_workload_name`, `sample_workload_image`, `apply`, `kube_context`, `cloud_provider`, `deploy_provider`, `provider_config`. Prometheus는 `/integrations/prometheus`를 사용한다.
- `TargetPreflightRequest`: `cluster_id`, `cloud_provider`, `deploy_provider`, `provider_config`, `apply`, `kube_context`, `image`, `management_base_url: str = ""`.
- `ClusterConnectRequest`: `name: str`, `provider: "aws"|"gcp"|"azure"|"onprem"`. provider는 pending 카드의 hint이며 agent snapshot이 들어오면 실측 provider가 우선한다.
- `TargetPreflightResponse`: `valid`, `duplicate_cluster_id`, `provider_ready`, `agent_install_status`, `connection_status`, `kube_context_allowed`, `errors`, `warnings`, `selected`, `last_agent_id`, `last_seen_at`, `management_access`.
- `AgentPolicy`: `cluster_id`, `generation`(≥1), `cluster_role`(`"management"|"target"`), `evidence: EvidenceRuntimePolicy`(`failure_policy: "allow_partial"|"strict"`, `max_attempts`, `providers: dict[str, EvidenceProviderPolicy]`), `bootstrap: BootstrapPolicy`, `desired_state: DesiredStatePolicy`, `scheduling: SchedulingPolicy`.
- `EvidenceProviderPolicy`: `enabled: bool = True`, `interval_seconds`, `min_workers`, `max_workers`, `queue_age_target_seconds`, `queries: list[dict]`.
- `SchedulingPolicy`: `profiles: list[SchedulingProfile]`. enabled profile은 `selector.namespaces`/`selector.labels`/`selector.workload_names` 중 하나 이상이 있어야 한다. 빈 selector로 클러스터 전체 workload를 빠른 lane에 넣는 실수를 막는다.
- `SchedulingProfile`: `profile_id`, `enabled`, `selector`, `priority_class_name`, `priority_value`, `preemption_policy`, `placement_mode("preferred"|"required")`, `node_selector`, `preferred_node_labels`, `tolerations`, `pre_pull_images`, `termination_grace_period_seconds`, `scheduler_name`. `scheduler_name` 기본값은 `null`이며, 별도 scheduler가 내려갔을 때 Pending 고착을 막기 위해 명시 선택일 때만 사용한다.
- `EvidenceJobScheduleRequest`: `source_id: str = "cluster-snapshot"`, `window_start: str`, `provider_keys: list[str]`(min_length=1).
- `EvidenceJobResultRequest`: `agent_id: str`, `lease_id: str`, `status: Literal["completed","failed"]`, `result: dict = {}`, `error: str = ""`. `{"result": result}` 직렬화 크기가 `MAX_EVIDENCE_PAYLOAD_BYTES`(1MiB)를 넘으면 `evidence payload exceeds size limit` 검증 오류가 난다.
- `TargetInstallResponse`: `registered: bool`, `cluster_id: str`, `status: str`(`pending_install|install_applied`), `applied: bool`, `apply_output: str | None`, `install_manifest: str`, `agent_token: str`(원문 1회 반환, 서버는 해시만 저장), `install_command: str = ""`, `bootstrap_command: str = ""`, `bootstrap_steps: list[{label, command}] = []`, `connect_timeout_seconds`, `connect_expires_at`, `connection_stage="token_issued"`, `management_access`.
- `ClusterConnectResponse`: `cluster_id`, 서버 생성 `install_command`, `expires_at`. 원문 토큰을 별도 필드나 로그로 중복 노출하지 않는다. / `ClusterConnectStatusResponse`: `status="waiting"|"connected"|"expired"`, 실측이 있을 때만 `agent_version`, `connected_at`.
- `ManagementAccessResponse`: `mode: "portforward"|"loadbalancer"|"ingress"|"nodeport"|"unknown"`, `external_url: str | null`, `agent_server_url: str`, `reachability: "external"|"self_only"`, `limitation_reason: "external_url_not_configured"|null`. `self_only`에서 management cluster는 허용하지만 다른 target cluster의 preflight/등록은 외부 주소가 필요하다는 오류로 닫힌다.
- `EvidenceJobScheduleResponse`: `accepted: bool`, `evidence_key: str`, `queued: int`, `job_ids: list[str]`. / `EvidenceJobPollResponse`: `job: JsonMap | None`. / `EvidenceJobResultResponse`: `accepted: bool`, `evidence_key/event_id/correlation_id: str | None`.

### 리콘실러 — `src/domains/target/reconciler.py`

| 앵커 | 시그니처/값 | 의미 |
|---|---|---|
| `src/domains/target/reconciler.py :: COMPONENT_MISSING_REASON` | `"component missing from actual state"` | drift 사유 |
| `src/domains/target/reconciler.py :: VERSION_MISMATCH_REASON` | `"component version differs"` | drift 사유 |
| `src/domains/target/reconciler.py :: SPEC_MISMATCH_REASON` | `"component spec differs"` | drift 사유 |
| `src/domains/target/reconciler.py :: NO_DRIFT_MESSAGE` | `"desired and actual state are in sync"` | in_sync 메시지 |
| `src/domains/target/reconciler.py :: DRIFT_MESSAGE` | `"desired and actual state differ"` | drifted 메시지 |
| `src/domains/target/reconciler.py :: ActualStateSnapshot` | `@dataclass(frozen=True)` — `components: Mapping[str, JsonObject] = {}` | 컴포넌트명 → actual 상태 맵 |
| `src/domains/target/reconciler.py :: ActualStateReader` | `Protocol` — `async def read_actual_state(self, workspace_id: str, cluster_id: str) -> ActualStateSnapshot` | actual state 조회 port(구현은 services) |
| `src/domains/target/reconciler.py :: ReconcileDecision` | `@dataclass(frozen=True)` — `status: str`, `drifted: bool`, `message: str`, `drifts: list[TargetDrift]` | 판정 결과 |
| `src/domains/target/reconciler.py :: TargetReconciler` | `evaluate(self, desired_components: Sequence[TargetDesiredComponent], actual: ActualStateSnapshot) -> ReconcileDecision` | drift 판정(아래 동작 참조) |
| `src/domains/target/reconciler.py :: component_drift` | `(desired: TargetDesiredComponent, reason: str, actual: JsonObject \| None) -> TargetDrift` | `TargetDrift(component, reason, desired=desired.to_body(), actual)` 생성 |
| `src/domains/target/reconciler.py :: desired_state_version` | `(components: Sequence[TargetDesiredComponent]) -> str` | 컴포넌트 body 리스트를 `json.dumps(sort_keys=True, separators=(",", ":"))`로 정규 직렬화 → `sha256` hex 앞 16자 |

### evidence 정책 — `src/domains/target/evidence_policy.py`

| 앵커 | 시그니처/값 | 의미 |
|---|---|---|
| `src/domains/target/evidence_policy.py :: DEFAULT_EVIDENCE_FAILURE_POLICY` | `"allow_partial"` | 기본 실패 정책 |
| `src/domains/target/evidence_policy.py :: DEFAULT_EVIDENCE_PROVIDER_WORKERS` | `1` | provider min_workers 기본 |
| `src/domains/target/evidence_policy.py :: DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS` | `2` | provider max_workers 기본 |
| `src/domains/target/evidence_policy.py :: DEFAULT_CLUSTER_ROLE` | `"target"` | 기본 cluster_role |
| `src/domains/target/evidence_policy.py :: DEFAULT_BOOTSTRAP_MODE` | `"target"` | 기본 bootstrap mode |
| `src/domains/target/evidence_policy.py :: DEFAULT_EVIDENCE_PROVIDER_QUERIES` | `dict[str, list[dict[str, str]]]` | provider별 기본 쿼리 목록. 키: `"kubernetes"`(2개: `target_namespace_snapshot`, `sandbox_namespace_snapshot` — 데모/장애주입 워크로드가 배포되는 sandbox 네임스페이스 snapshot), `"metrics"`(9개: `scrape_targets_up`, `target_pod_info`, `target_deployment_replicas`, `node_cpu_usage_ratio`, `node_memory_usage_ratio`, `node_filesystem_usage_ratio`, `node_collector_node_pod_count`, `node_collector_node_not_ready_pod_count`, `node_collector_scrape_error` — 마지막 pod count 2개는 `range_seconds: "900"`, `step_seconds: "30"` 포함), `"logs"`(4개: `target_namespace_errors`, `sandbox_namespace_errors`(sandbox 워크로드 ERROR/FATAL/panic — RCA 리포트 로그 근거의 1차 소스), `node_collector_runtime_samples`, `target_agent_warnings`), `"traces"`(4개: `application_error_spans`, `target_agent_error_spans`, `target_agent_recent_spans`, `management_gateway_spans`). 각 항목은 `name`/`description`/`query`(+선택 `range_seconds`/`step_seconds`) 키를 가짐. 정확한 쿼리 문자열은 소스가 규범 |
| `src/domains/target/evidence_policy.py :: MANAGEMENT_EVIDENCE_PROVIDER_QUERIES` | `dict[str, list[dict[str, str]]]` | management role 전용 기본 쿼리. Kubernetes `management_namespace_snapshot` 한 개만 두며 target/sandbox를 관측하지 않는다 |
| `src/domains/target/evidence_policy.py :: default_evidence_provider_policy` | `(provider_key: str, interval_seconds: int, *, enabled: bool = True) -> EvidenceProviderPolicy` | `enabled`, `interval_seconds`, `min_workers=1`, `max_workers=2`, `queries=<기본 쿼리 복사본>` |
| `src/domains/target/evidence_policy.py :: default_evidence_providers` | `(interval_seconds: int, *, cluster_role: str = "target") -> dict[str, EvidenceProviderPolicy]` | target role은 4개 provider 기본 활성화. management role은 기본 Kubernetes evidence만 활성화하고 metrics/logs/traces는 운영자가 읽기성 정책으로 명시할 때만 켠다 |
| `src/domains/target/evidence_policy.py :: default_agent_policy` | `(*, cluster_id: str, cluster_role: str = "target", interval_seconds: int = int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS), failure_policy: str = "allow_partial", bootstrap_mode: str = "target", generation: int = 1) -> AgentPolicy` | 클러스터의 기본 `AgentPolicy` 조립 |
| `src/domains/target/evidence_policy.py :: enabled_provider_keys` | `(policy: AgentPolicy, requested_provider_keys: list[str]) -> list[str]` | 요청 키를 중복 제거 후, 정책에 없거나(`None`) `enabled=True`인 provider만 통과. 즉 정책에 명시적으로 `enabled=False`인 provider만 제외 |
| `src/domains/target/evidence_policy.py :: provider_policy_snapshots` | `(policy: AgentPolicy, provider_keys: list[str]) -> dict[str, dict[str, object]]` | provider별 정책의 `model_dump()` 스냅샷(없으면 기본 `EvidenceProviderPolicy()`) — 잡 행에 고정 저장 |

### evidence job 유틸/상수 — `src/domains/target/evidence_jobs.py`

| 앵커 | 시그니처/값 | 의미 |
|---|---|---|
| `src/domains/target/evidence_jobs.py :: DEFAULT_EVIDENCE_JOB_LEASE_SECONDS_ENV` | `"EVIDENCE_JOB_LEASE_SECONDS"` | 리스 유지 초 env 키 |
| `src/domains/target/evidence_jobs.py :: DEFAULT_EVIDENCE_JOB_LEASE_SECONDS` | `int(env(..., "60"))` | 리스 유지 초(기본 60, import 시 평가) |
| `src/domains/target/evidence_jobs.py :: DEFAULT_EVIDENCE_SOURCE_ID` | `"cluster-snapshot"` | 기본 source_id |
| `src/domains/target/evidence_jobs.py :: DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS_ENV` | `"PENDING_EVIDENCE_EVENT_TTL_SECONDS"` | pending 윈도우 회수 TTL env 키 |
| `src/domains/target/evidence_jobs.py :: DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS` | `int(env(..., "120"))` | pending 윈도우 회수 TTL(기본 120) |
| `src/domains/target/evidence_jobs.py :: EVIDENCE_FAILURE_POLICY_STRICT` | `"strict"` | strict 실패 정책 값 |
| `src/domains/target/evidence_jobs.py :: EVIDENCE_JOB_STATUS_COMPLETED` | `"completed"` | 잡 상태 |
| `src/domains/target/evidence_jobs.py :: EVIDENCE_JOB_STATUS_FAILED` | `"failed"` | 잡 상태 |
| `src/domains/target/evidence_jobs.py :: EVIDENCE_JOB_STATUS_LEASED` | `"leased"` | 잡 상태 |
| `src/domains/target/evidence_jobs.py :: EVIDENCE_JOB_STATUS_QUEUED` | `"queued"` | 잡 상태 |
| `src/domains/target/evidence_jobs.py :: PENDING_EVIDENCE_EVENT_ID_PREFIX` | `"pending:"` | 윈도우 선점용 event_id prefix |
| `src/domains/target/evidence_jobs.py :: TERMINAL_EVIDENCE_JOB_STATUSES` | `{"completed", "failed"}` | 종결 상태 집합 |
| `src/domains/target/evidence_jobs.py :: evidence_key` | `(workspace_id: str, cluster_id: str, source_id: str, window_start: str) -> str` | `":".join([workspace_id, cluster_id, source_id, window_start])` |
| `src/domains/target/evidence_jobs.py :: evidence_job_id` | `(workspace_id: str, cluster_id: str, source_id: str, window_start: str, provider_key: str) -> str` | `evidence_key(...) + ":" + provider_key` |
| `src/domains/target/evidence_jobs.py :: empty_provider_payload` | `(provider_key: str) -> object` | `"logs"`면 `[]`, 그 외 `{}` |
| `src/domains/target/evidence_jobs.py :: aggregate_evidence_payload` | `(rows: list[JsonObject]) -> JsonObject \| None` | [동작 3-집계](#3-evidence-job-파이프라인) 참조 |

### 설치 manifest — `src/domains/target/install_manifest.py`

| 앵커 | 시그니처/값 | 의미 |
|---|---|---|
| `src/domains/target/install_manifest.py :: yaml_string` | `(value: str) -> str` | `json.dumps(value)` — YAML 안전 인용 |
| `src/domains/target/install_manifest.py :: target_install_manifest` | `(payload: TargetRegisterRequest, agent_token: str) -> str` | role=`target`이면 namespace(`target`) → namespace(`sandbox`) → ServiceAccount → read RBAC → target write RBAC → sandbox RBAC → catalog install RBAC → runtime ConfigMap/Secret → cluster-agent Deployment. role=`management`이면 읽기 RBAC와 runtime/Deployment만 렌더하며 catalog Role을 포함하지 않는다. |
| `src/domains/target/install_manifest.py :: namespace_manifest` | `(name: str) -> str` | `v1/Namespace` |
| `src/domains/target/install_manifest.py :: agent_namespace` | `(payload: TargetRegisterRequest) -> str` | role=`management`이면 `management`, 그 외 `target` |
| `src/domains/target/install_manifest.py :: service_account_manifest` | `(namespace: str) -> str` | `cluster-agent` ServiceAccount |
| `src/domains/target/install_manifest.py :: cluster_read_rbac_manifest` | `(namespace: str) -> str` | `cluster-agent-read` ClusterRole(코어: pods/events/nodes/services/endpoints, discovery.k8s.io: endpointslices, apps: deployments/replicasets/daemonsets/statefulsets — get/list/watch; argoproj.io: applications/rollouts — get/list) + ClusterRoleBinding. create/update/patch/delete 동사 없음 |
| `src/domains/target/install_manifest.py :: target_write_rbac_manifest` | `(namespace: str) -> str` | role=`target` 전용. `cluster-agent-self-manage` Role/RoleBinding(configmap `target-agent-policy` get/update/patch, deployment `cluster-agent` get/patch) + `cluster-agent-target-manage` Role/RoleBinding(apps daemonsets CRUD) |
| `src/domains/target/install_manifest.py :: sandbox_rbac_manifest` | `(namespace: str) -> str` | role=`target` 전용. `cluster-agent-sandbox-write` Role/RoleBinding(namespace=`sandbox`: services/configmaps + deployments의 get/list/create/update/patch) |
| `src/domains/target/install_manifest.py :: catalog_install_rbac_manifest` | `(namespace: str) -> str` | role=`target` 전용 별도 Role/RoleBinding. sandbox의 현재 고정 chart 렌더 종류(configmaps/secrets/serviceaccounts/services, statefulsets, networkpolicies, poddisruptionbudgets)에만 Helm wait/atomic CRUD 권한을 부여한다. |
| `src/domains/target/install_manifest.py :: control_namespaces_line` | `(payload: TargetRegisterRequest) -> str` | `payload.control_namespaces`가 비어 있지 않으면 ConfigMap에 붙일 `CONTROL_ALLOWED_NAMESPACES: "<csv>"` 라인 반환, 빈 값이면 `""`(미지정 = 기존 manifest 동일 → agent 기본 sandbox만) |
| `src/domains/target/install_manifest.py :: runtime_config_manifest` | `(payload: TargetRegisterRequest) -> str` | ConfigMap `target-runtime-config` — 키: `TARGET_CLUSTER_ID`, `CLUSTER_ROLE`, `BOOTSTRAP_MODE`, `WORKSPACE_ID`, `EVIDENCE_INTERVAL_SECONDS`, `REALTIME_GATEWAY_URL`, `LOKI_BASE_URL`, `TEMPO_BASE_URL`, `NODE_COLLECTOR_ENABLED`(management는 항상 `"false"`), (조건부) `CONTROL_ALLOWED_NAMESPACES`, `NODE_COLLECTOR_IMAGE`, `NODE_COLLECTOR_NAMESPACE`, `AGENT_CONTROL_DB_PATH`, `COMMAND_OUTBOX_DB_PATH`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` |
| `src/domains/target/install_manifest.py :: runtime_secret_manifest` | `(agent_token: str, namespace: str) -> str` | Secret `target-runtime-secret`(Opaque) — `stringData.AGENT_TOKEN=<원문 토큰>` |
| `src/domains/target/install_manifest.py :: sample_workload_manifest` | `(payload: TargetRegisterRequest) -> str` | `install_sample_workload=false`면 `""`. true인데 name/image 누락이면 `ValueError("sample workload install requires name and image")` |
| `src/domains/target/install_manifest.py :: workload_manifest` | `(name: str, image: str) -> str` | `sandbox` namespace Deployment(replicas=1, `python -m http.server 8080`, containerPort 8080, imagePullPolicy IfNotPresent) |
| `src/domains/target/install_manifest.py :: cluster_agent_manifest` | `(payload: TargetRegisterRequest) -> str` | role에 맞는 namespace의 Deployment `cluster-agent`(replicas=1, serviceAccountName=`cluster-agent`, command `["python", "src/services/target/cluster-agent/app.py"]`, envFrom ConfigMap+Secret, env `MANAGEMENT_BASE_URL`, emptyDir 볼륨 `/var/lib/target-agent`) |

## 데이터 모델 (Data Model)

모든 모델은 `packages.storage.base :: Base` 상속. 컬럼 헬퍼 의미: `text_column()` = `Text NOT NULL`, `jsonb_column()` = `JSONB NOT NULL`, `created_at_column()`/`updated_at_column()` = `TIMESTAMP(timezone=True) NOT NULL server_default=now()`.

### EvidenceWindow — `__tablename__ = "evidence_windows"`
`src/domains/target/models.py :: EvidenceWindow` — evidence 윈도우당 이벤트 1회 발행을 위한 dedupe 테이블.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| evidence_key | Text | PK | `workspace:cluster:source:window_start` 결정적 키 |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| source_id | Text | NOT NULL | 증거 소스(기본 `cluster-snapshot`) |
| window_start | Text | NOT NULL | 수집 윈도우 시작(ISO 문자열) |
| agent_id | Text | nullable | 보고한 agent |
| event_id | Text | NOT NULL | 발행 이벤트 id. 선점 중엔 `pending:<uuid>` |
| correlation_id | Text | NOT NULL | 이벤트 correlation. 선점 중엔 `pending:<uuid>` |
| payload | JSONB | NOT NULL | 발행된 evidence body |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각(pending TTL 판정 기준) |

### EvidenceJob — `__tablename__ = "evidence_jobs"`
`src/domains/target/models.py :: EvidenceJob` — provider별 evidence 수집 잡.
인덱스: `ix_evidence_jobs_claim (workspace_id, cluster_id, provider_key, status, created_at)`, `ix_evidence_jobs_window (evidence_key)`.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| job_id | Text | PK | `<evidence_key>:<provider_key>` 결정적 id |
| evidence_key | Text | NOT NULL, 인덱스 | 부모 윈도우 키 |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| source_id | Text | NOT NULL | 증거 소스 |
| provider_key | Text | NOT NULL | `kubernetes`/`metrics`/`logs`/`traces` 등 |
| window_start | Text | NOT NULL | 윈도우 시작 |
| policy_generation | Integer | NOT NULL | 큐잉 시점 정책 generation |
| provider_policy | JSONB | NOT NULL | 큐잉 시점 provider 정책 스냅샷 |
| status | Text | NOT NULL | `queued`/`leased`/`completed`/`failed` |
| lease_id | Text | nullable | 현재 리스 uuid |
| agent_id | Text | nullable | 리스한 agent |
| leased_until | TIMESTAMP(tz) | nullable | 리스 만료 시각 |
| attempt_count | Integer | NOT NULL, default 0 | 리스 시도 횟수(리스 시 +1) |
| max_attempts | Integer | NOT NULL | 최대 시도 횟수(정책의 `evidence.max_attempts`) |
| failure_policy | Text | NOT NULL | `allow_partial`/`strict` |
| result | JSONB | nullable | 성공 결과(완료 시에만 저장) |
| error | Text | nullable | 마지막 오류 메시지 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성(리스 순서 기준) |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 |

### TargetDesiredState — `__tablename__ = "target_desired_states"`
`src/domains/target/models.py :: TargetDesiredState` — 복합 PK `(workspace_id, cluster_id, component)`.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| workspace_id | Text | PK(복합) | 워크스페이스 |
| cluster_id | Text | PK(복합) | 클러스터 |
| component | Text | PK(복합) | `cluster-agent`/`node-collector`(`TargetComponent`) |
| namespace | Text | NOT NULL | 배포 namespace(`target`) |
| version | Text | NOT NULL | 컴포넌트 버전(현재 이미지 태그) |
| status | Text | NOT NULL | `TargetDesiredStateStatus` — 현재 `active`만 존재 |
| updated_by | Text | nullable | 마지막 갱신 사용자 id |
| spec | JSONB | NOT NULL | 컴포넌트 목표 spec |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 |

### TargetReconcileRecord — `__tablename__ = "target_reconcile_records"`
`src/domains/target/models.py :: TargetReconcileRecord`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| reconcile_id | Text | PK | reconcile 실행 id(uuid4 또는 호출자 지정) |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| desired_state_version | Text | NOT NULL | 판정 대상 desired state 버전 해시 |
| status | Text | NOT NULL | `TargetReconcileStatus` 값 |
| drifted | Boolean | NOT NULL | drift 존재 여부 |
| applied | Boolean | NOT NULL | 교정 적용 여부 |
| message | Text | NOT NULL | 판정 메시지 |
| details | JSONB | NOT NULL | drift 상세 등 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 |

### AgentPolicyRecord — `__tablename__ = "agent_policies"`
`src/domains/target/models.py :: AgentPolicyRecord` — 복합 PK `(workspace_id, cluster_id)`. 클러스터당 현재 정책 1행.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| workspace_id | Text | PK(복합) | 워크스페이스 |
| cluster_id | Text | PK(복합) | 클러스터 |
| generation | Integer | NOT NULL | 정책 세대(단조 증가 강제) |
| policy | JSONB | NOT NULL | `AgentPolicy.model_dump()` 전문 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 |

### AgentPolicyStatusRecord — `__tablename__ = "agent_policy_status"`
`src/domains/target/models.py :: AgentPolicyStatusRecord` — agent의 정책 적용 보고(append-only).

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 순번 |
| workspace_id | Text | NOT NULL | 워크스페이스(토큰 identity에서) |
| cluster_id | Text | NOT NULL | 클러스터(토큰 identity로 덮어씀) |
| generation | Integer | NOT NULL | 적용 대상 정책 generation |
| status | Text | NOT NULL | `applied`/`failed`/`unchanged` |
| message | Text | NOT NULL | 보고 메시지(기본 `""`) |
| details | JSONB | NOT NULL | 상세(기본 `{}`) |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 보고 시각 |

### ClusterAgentStatusRecord — `__tablename__ = "cluster_agent_status"`
`src/domains/target/models.py :: ClusterAgentStatusRecord` — 복합 PK `(workspace_id, cluster_id, agent_id)`.
인덱스: `ix_cluster_agent_status_last_seen (workspace_id, cluster_id, last_seen_at)`.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| workspace_id | Text | PK(복합) | 워크스페이스 |
| cluster_id | Text | PK(복합) | 클러스터 |
| agent_id | Text | PK(복합) | agent 식별자 |
| status | Text | NOT NULL | agent 보고 상태(기본 `connected`) |
| capabilities | JSONB(list[str]) | NOT NULL, default `list` | agent capability 목록(중복 제거 저장) |
| details | JSONB | NOT NULL | 부가 정보 |
| last_seen_at | TIMESTAMP(tz) | NOT NULL | 마지막 heartbeat(연결 상태 판정 기준) |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 |

### AgentReconcileStatusRecord — `__tablename__ = "agent_reconcile_status"`
`src/domains/target/models.py :: AgentReconcileStatusRecord` — agent의 reconcile 적용 보고(append-only). 컬럼 구성은 `agent_policy_status`와 동일:

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 순번 |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| generation | Integer | NOT NULL | 대상 generation |
| status | Text | NOT NULL | `applied`/`failed`/`unchanged` |
| message | Text | NOT NULL | 메시지 |
| details | JSONB | NOT NULL | 상세 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 보고 시각 |

## 이벤트 (Events)

모든 body는 `packages.contracts.event_bus.bodies.base :: EventBody`를 상속한 `@dataclass(frozen=True)`이며 `@event(EventSubject.X)` 데코레이터로 registry에 등록된다. subject 문자열이 곧 라우팅 키다. `JsonObject = dict`.

### 발행 (Publishes) — 이 도메인 코드가 직접 발행

| 이벤트명(subject) | body 클래스 | 발행 지점 |
|---|---|---|
| `cluster.desired_state.changed` | `src/domains/target/events.py :: ClusterDesiredStateChangedBody` | `register_target`에서 `events.accept_body(...)` (등록 트랜잭션 내) |
| `cluster.evidence.received` | `domains.rca.events :: ClusterEvidenceReceivedBody` ([rca](./rca.md)) | `emit_evidence_if_ready`에서 outbox 스테이징(`record_evidence_event_once`) |

**`cluster.desired_state.changed`** — `ClusterDesiredStateChangedBody`:

| 필드 | 타입 | 기본값 |
|---|---|---|
| cluster_id | `str` | — |
| desired_state_version | `str` | — |
| components | `list[TargetDesiredComponent]` | — |
| reason | `str` | — (등록 시 `"target registered"`) |
| workspace_id | `str` | `DEFAULT_WORKSPACE_ID` |
| requested_by | `str \| None` | `None` |

**`cluster.evidence.received`** — `ClusterEvidenceReceivedBody`(정의는 rca 도메인): `cluster_id: str`, `kubernetes: JsonObject`, `metrics: JsonObject`, `logs: list[JsonObject]`, `traces: JsonObject`, `workspace_id: str = DEFAULT_WORKSPACE_ID`, `agent_id: str | None = None`, `source_id: str | None = None`, `window_start: str | None = None`, `evidence_key: str | None = None`, `correlation_id: str | None = None`, `kind: str | None = None`, `payload_size: int | None = None`, `summary: JsonObject = {}`. 신규 발행 경로는 claim-check reference만 outbox에 싣고 원문은 `evidence_windows.payload`에 저장한다.

### 계약 정의 (이 도메인이 body를 정의하지만 발행/구독은 services 계층)

| 이벤트명(subject) | body 클래스 | body 필드(타입, 기본값) |
|---|---|---|
| `agent.connected` | `src/domains/target/events.py :: AgentConnectedBody` | `cluster_id: str`, `agent_id: str`, `capabilities: list[str] = []`, `workspace_id: str = DEFAULT_WORKSPACE_ID` |
| `cluster.reconcile.requested` | `src/domains/target/events.py :: ClusterReconcileRequestedBody` | `cluster_id: str`, `desired_state_version: str`, `reason: str`, `workspace_id: str = DEFAULT_WORKSPACE_ID`, `requested_by: str \| None = None`, `actual_state: JsonObject \| None = None` |
| `cluster.reconcile.started` | `src/domains/target/events.py :: ClusterReconcileStartedBody` | `cluster_id: str`, `desired_state_version: str`, `component_count: int`, `workspace_id: str = DEFAULT_WORKSPACE_ID` |
| `cluster.drift.detected` | `src/domains/target/events.py :: ClusterDriftDetectedBody` | `cluster_id: str`, `desired_state_version: str`, `drifts: list[TargetDrift]`, `workspace_id: str = DEFAULT_WORKSPACE_ID` |
| `cluster.reconcile.completed` | `src/domains/target/events.py :: ClusterReconcileCompletedBody` | `cluster_id: str`, `desired_state_version: str`, `status: str`, `drifted: bool`, `applied: bool`, `message: str`, `drifts: list[TargetDrift] = []`, `workspace_id: str = DEFAULT_WORKSPACE_ID` |
| `cluster.reconcile.failed` | `src/domains/target/events.py :: ClusterReconcileFailedBody` | `cluster_id: str`, `desired_state_version: str`, `error_type: str`, `message: str`, `status: str = TargetReconcileStatus.FAILED.value` (= `"failed"`), `workspace_id: str = DEFAULT_WORKSPACE_ID` |

값 객체(subject 없음, 위 body들에 내장):
- `src/domains/target/events.py :: TargetDesiredComponent` — `component: str`, `namespace: str`, `version: str`, `spec: JsonObject = {}`.
- `src/domains/target/events.py :: TargetDrift` — `component: str`, `reason: str`, `desired: JsonObject`, `actual: JsonObject | None = None`.

### 구독 (Consumes)
이 도메인 코드에는 이벤트 컨슈머가 없다(구독은 services 계층 워커가 수행).

## 동작 (Behavior)

### 1. target 등록 — `POST /targets`
1. `require_admin_session`으로 admin 세션 검증(라우터 단위 `require_session` 중복 없음 — 이중 검증/레이트리밋 2배 회피).
2. `normalize_target_provider_defaults`: `apply=true`이고 `deploy_provider` 미명시면 `kube-context`로 기본값 승격 + placeholder 이미지를 `TARGET_AGENT_IMAGE`/`GITOPS_WEBHOOK_IMAGE` env로 치환 + `management_base_url`을 `/api` 접미로 정규화(빈 값이면 `PUBLIC_MANAGEMENT_BASE_URL` → `PUBLIC_API_BASE_URL` → `PUBLIC_BASE_URL` 기반). 그 후 payload를 세션의 `workspace_id`로 스코프하고, 정규화 후에도 공개 URL이 없으면 등록을 거부한다.
3. `reject_test_target`: 테스트 클러스터 마커(id/이름) 또는 미해결 placeholder 이미지면 422. `validate_target_install_providers`: cloud/deploy provider 존재 검증, `apply`·`kube_context`와 `deploy_provider=kube-context` 조합 규칙 검증(위반 시 422).
4. `target_desired_components(payload)` → `desired_state_version(components)`(sha256 16자).
5. `secrets.token_urlsafe(32)`로 per-cluster agent 토큰 생성 — 원문은 manifest Secret과 응답에만 존재, 레지스트리에는 `hash_agent_token(token)` 해시만 저장. **재등록 시 토큰 회전.** (전역 AGENT_TOKEN 신뢰 제거)
6. `target_install_manifest(payload, token)` 렌더. `apply=true`면 `apply_manifest_with_kubectl`로 즉시 적용.
7. `unit_of_work_or_null(db)` **한 트랜잭션**에서: `db.register_target_cluster(...)`(settings에는 `apply`/`kube_context` 제외한 payload 저장) → 정책 없으면 `default_agent_policy`로 최초 정책 upsert → `db.upsert_target_desired_states(...)` → `events.accept_body(ClusterDesiredStateChangedBody(reason="target registered"))`. 부분 실패 시 고아 등록이 남지 않음.
8. `TargetInstallResponse` 반환(토큰 원문 1회 노출, `install_command` 포함).

### 1b. 원라인 인스톨러 — `GET /install/{agent_token}`
1. `hash_agent_token(agent_token)`으로 `db.authenticate_cluster_agent` 조회 — 미등록/불일치 404 `"install link not found"`(존재 여부를 구분해 주지 않음).
2. `db.get_cluster_registration`으로 등록 행 로드(없으면 동일 404) → `settings`에 저장된 등록 payload로 `TargetRegisterRequest` 재구성.
3. `target_install_manifest(payload, agent_token)`으로 **같은 manifest를 재렌더**해 `text/yaml`로 반환 — 서버는 토큰 원문·manifest를 저장하지 않는다(토큰 자체가 자격증명).

### 2. reconcile 판정 — `TargetReconciler.evaluate`
desired 컴포넌트 각각에 대해 순서대로 검사(첫 매칭 사유만 기록):
1. actual에 컴포넌트 없음 → `component missing from actual state` drift.
2. `str(actual["version"])` ≠ desired.version → `component version differs` drift.
3. `dict(actual["spec"])` ≠ desired.spec (dict 동등 비교) → `component spec differs` drift.

drift가 하나라도 있으면 `ReconcileDecision(status="drifted", drifted=True, message=DRIFT_MESSAGE, drifts)`, 없으면 `(status="in_sync", drifted=False, message=NO_DRIFT_MESSAGE, drifts=[])`.

**reconcile 상태 값**(`packages.contracts.target :: TargetReconcileStatus`):

| 상태 | 산출 주체 |
|---|---|
| `requested` | reconcile 요청 시(services 계층) |
| `in_sync` | `evaluate` — drift 없음 |
| `drifted` | `evaluate` — drift 존재 |
| `failed` | 처리 오류(`ClusterReconcileFailedBody` 기본 status) |

desired state 자체의 상태는 `TargetDesiredStateStatus.ACTIVE`(`"active"`) 하나뿐이며, upsert 시 항상 `active`로 저장된다.

### 3. evidence job 파이프라인

**(a) 스케줄** — `POST /agent/evidence/jobs`: 저장 정책(없으면 `default_agent_policy`) 로드 → `enabled_provider_keys`로 비활성 provider 제외 → `queue_evidence_jobs`가 provider별 잡을 결정적 `job_id`로 idempotent 큐잉(정책의 `failure_policy`/`max_attempts`/`generation`/provider 스냅샷 고정 저장).

**(b) 리스(롱폴)** — `GET /agent/evidence/jobs/poll`: 먼저 `touch_agent_seen`으로 heartbeat 기록(best-effort). `lease_next_evidence_job`이 데드라인(`min(timeout, MAX_EVIDENCE_JOB_POLL_SECONDS)`)까지 1초(`EVIDENCE_JOB_POLL_SLEEP_SECONDS`) 간격으로 `lease_evidence_job` 반복. `queued` 또는 리스 만료(`leased_until < now()`) 잡을 `FOR UPDATE SKIP LOCKED`로 선점, `attempt_count` 증가.

**(c) 결과 보고** — `POST /agent/evidence/jobs/{job_id}/result`: `complete_evidence_job`이 lease_id/agent_id/미만료 리스를 검증해 상태 전이. 결과가 `None`이면 404(`evidence job not found`). `touch_agent_seen`으로 heartbeat 기록 후, `status="completed"`이고 `result["kubernetes"]`가 dict면 `kubernetes_evidence_to_inventory_snapshot`([inventory](./inventory.md))으로 변환해 `db.save_inventory_snapshot`에 적재(인벤토리 read model + usage 시계열 동시 갱신). 이후 `emit_evidence_if_ready` 실행.

**evidence job 상태 머신:**

| 현재 | 이벤트 | 다음 | 조건 |
|---|---|---|---|
| (없음) | `queue_evidence_jobs` | `queued` | `ON CONFLICT DO NOTHING` — 기존 job_id면 무변화 |
| `queued` | `lease_evidence_job` | `leased` | attempt_count+1, lease_id/agent_id/leased_until 세팅 |
| `leased` (만료) | `lease_evidence_job` | `leased` | `leased_until < now()`인 리스는 재선점 가능 |
| `leased` | `complete_evidence_job(status="completed")` | `completed` | result 저장 |
| `leased` | `complete_evidence_job(status="failed")` | `queued` | `attempt_count < max_attempts` — 재시도 |
| `leased` | `complete_evidence_job(status="failed")` | `failed` | `attempt_count >= max_attempts` — 최종 실패 |
| `completed`/`failed`/`queued` | 동일 lease의 중복 보고 | (무변화) | 기존 행 반환(멱등) |

**(d) 집계·발행** — `emit_evidence_if_ready`:
1. `get_evidence_window`: 윈도우가 이미 있고 event_id가 `pending:`이 아니면 기존 event_id/correlation_id로 즉시 응답(중복 발행 방지). `pending:`이면 `release_stale_pending_evidence_window`로 TTL(120초) 지난 것만 회수, 아니면 `None`(다른 요청이 발행 중).
2. `evidence_payload_if_ready` → `aggregate_evidence_payload(rows)`: 행이 없거나, 하나라도 비종결(`queued`/`leased`) 상태면 `None`(아직 준비 안 됨). `failure_policy="strict"`인 행이 `failed`면 `None`(발행 포기). 그 외에는 첫 행에서 `workspace_id`/`cluster_id`/`source_id`/`window_start`/`evidence_key`/`agent_id`를 취하고 `kubernetes: {}`를 시드로, `completed` 잡의 `result` dict를 순서대로 merge, `failed` 잡은 provider 키에 `empty_provider_payload`(logs는 `[]`, 그 외 `{}`)를 `setdefault`.
   - `metadata` bucket은 top-level overwrite가 아니라 내부 key 단위로 merge한다. RCA test run에서는 `metadata.rca_test`가 Pod log 격리 기준이므로 provider result의 `metadata.rca_test`가 기존 값을 덮지 못하고, `release_context`에서 만든 값이 유지된다.
   - strict RCA test run의 metadata result는 `change_context` 안에서 찾은 namespace가 `release_context.namespace` 하나와 정확히 같아야 실제 증거로 인정된다. `release_context.resource_name`이 있으면 workload identity도 그 resource 하나와 정확히 같아야 한다.
3. payload로 `ClusterEvidenceReceivedBody` 구성 → `compact_cluster_evidence_payload`로 `{evidence_key, workspace_id, correlation_id, kind, payload_size, summary}` 중심 reference envelope 생성 → `record_evidence_event_once`가 한 트랜잭션에서 윈도우 원문 기록+`events`/`outbox` reference 스테이징(경쟁 시 먼저 넣은 쪽 승리).
4. 반환된 event_id가 `pending:`이면 `None`, 아니면 `EvidenceJobResultResponse(accepted=True, evidence_key, event_id, correlation_id)`.

**evidence window 상태(사실상 상태 머신):**

| 상태 | event_id | 전이 |
|---|---|---|
| (없음) | — | `record_evidence_event_once`가 window+event+outbox를 한 트랜잭션으로 확정 |
| pending(레거시) | `pending:<uuid>` | 신규 생성 경로 없음. TTL 경과 시 `release_stale_pending_evidence_window`로만 삭제 |
| 확정 | 실제 event_id | 종결 — 이후 요청은 항상 기존 event_id 반환(duplicate) |

### 4. agent 정책 배포
1. 관리자: `PUT /clusters/{cluster_id}/policy` — path와 body의 `cluster_id` 불일치 시 409. 기존 정책(없으면 `default_agent_policy`)에 `merge_agent_policy`로 머지 후 `upsert_cluster_policy`. generation이 기존 이하이면 `ValueError` → 409. registration settings 또는 기존 policy가 role=`management`이면 payload가 `cluster_role`을 명시적으로 `target`으로 바꾸거나 bootstrap/desired_state resources를 추가할 때만 HTTP 400 `{code:"management_readonly"}`로 거부한다. evidence provider 간격처럼 읽기 전용 수집 정책만 바꾸는 payload는 허용하되, 저장 직전 `freeze_management_policy`로 `cluster_role="management"`와 빈 write/command policy를 다시 강제한다.
2. 관리자: `PUT /clusters/{cluster_id}/scheduling-profiles` — 기존 policy의 generation을 1 증가시키고 `scheduling` 섹션만 교체한다. 특정 네임스페이스 이름에 고정하지 않고 profile selector로 적용 대상을 고른다. 예: `namespaces=["sandbox","payments"]`, `labels={"app.kubernetes.io/part-of":"checkout"}`, `workload_names=["orders-api"]`. 선택된 workload는 `gitops-fast-lane` PriorityClass와 warm node label 선호/필수 조건을 받을 수 있다. `gitops-control-critical`은 cluster-agent와 제어 경로 pod 전용이므로 fast-lane workload와 병합하지 않는다. `pre_pull_images`는 안전한 기본 경로에서는 후보 계약만 저장한다. 실제 사전 pull은 node pool warm capacity, `IfNotPresent`, 또는 별도 privileged image-puller/scheduler를 명시 선택했을 때 운영한다.
3. agent: `GET /agent/policy?cluster_id&generation=N` — 토큰 identity의 cluster_id와 다르면 403. 저장 정책이 없거나 `generation <= N`이면 `policy=None`(변경 없음), 아니면 전체 정책 반환.
4. agent 보고: `POST /agent/policy/status`·`POST /agent/reconcile/status` — body의 `cluster_id`는 **항상 토큰 identity의 값으로 덮어써서** append-only 저장.

Scheduling profile 응답 예시:

```json
{
  "accepted": true,
  "cluster_id": "game-server",
  "scheduling": {
    "profiles": [
      {
        "profile_id": "checkout-fast",
        "enabled": true,
        "description": "checkout 계열 workload",
        "selector": {
          "namespaces": ["sandbox", "payments"],
          "labels": {"app.kubernetes.io/part-of": "checkout"},
          "workload_names": ["orders-api"]
        },
        "priority_class_name": "gitops-fast-lane",
        "priority_value": 100000,
        "preemption_policy": "PreemptLowerPriority",
        "placement_mode": "preferred",
        "node_selector": {},
        "preferred_node_labels": {"workload-tier": "fast-lane"},
        "tolerations": [],
        "pre_pull_images": ["ghcr.io/example/orders-api:v1"],
        "termination_grace_period_seconds": 1,
        "scheduler_name": null
      }
    ]
  }
}
```

### 5. 클러스터 연결 상태·목록
`GET /clusters`는 `BLOCKED_TEST_CLUSTER_IDS`/`BLOCKED_TEST_CLUSTER_NAME_PARTS`에 걸리는 테스트 클러스터를 목록에서 제외한다. 현재 inventory snapshot과 `inventory_resource_counts`가 모두 있을 때만 `node_count`/`server_count`/`pod_count`를 채우고, incident count source가 있을 때만 `incident_count`/`open_incidents`를 채운다. `app_count`는 정본 집계가 생길 때까지 `None`이다. **BQ-069 제품 필드는 값을 증명할 수 없으면 0이 아니라 `None`**이며, `last_seen_at`은 최신 agent heartbeat를 그대로 사용한다. provider는 구체 등록값(`eks/gke/aks/kind`)을 최우선으로 사용하고, generic 등록(`existing-k8s/minikube`)은 agent가 Node `spec.providerID` 또는 vendor 전용 label로 감지한 3사 값을 우선한 뒤 `onprem`으로 fallback한다. 어느 근거도 없으면 `unknown`이다. 목록의 최신 inventory snapshot은 cluster별 N+1 조회 대신 단일 window query로 읽는다.

`GET /clusters`·`GET /clusters/{id}`·`GET /clusters/{id}/connection-status`는 기존 `connection_status`를 보존하면서 다음 `connection_stage`를 함께 반환한다. `token_issued`는 등록 직후 응답에서만 관측 가능하며, 설치 manifest fetch를 별도로 영속하지 않으므로 이후 polling에서 추론하지 않는다.

| 연결 단계 | 권위 조건 |
|---|---|
| `token_issued` | `POST /targets`가 per-cluster token을 발급한 즉시의 응답 |
| `awaiting_install` | registration=`pending_install|install_applied`, agent 행 없음, 연결 만료 전 |
| `agent_connected` | agent가 online이지만 현재 connect epoch의 inventory snapshot 없음 |
| `snapshot_received` | 현재 agent/registration epoch의 snapshot 수신, 후속 heartbeat 전 |
| `ready` | 현재 epoch snapshot 수신 후 같은 agent의 후속 heartbeat 확인 |
| `expired` | agent 행 없이 연결 TTL 만료 또는 registration=`install_expired` |
| `error` | registration=`install_failed`, agent 오류 상태, stale/잘못된 heartbeat 시각, 또는 등록 상태 불변식 불일치 |

현재 epoch 판정은 snapshot `agent_id` 일치와 snapshot 생성 시각이 registration 갱신 시각 이후인지 함께 검사한다. 이전 연결의 snapshot으로 재연결 직후 `ready`가 되는 것을 막는다. `expired`는 현재 연결 UX 단계이며 agent 인증 만료 경계라는 의미는 아니다.

기존 `connection_status` 판정:

등록 트랜잭션은 먼저 `pending_install`과 정책·desired-state·이벤트를 commit한 뒤에만 선택적 bootstrap `kubectl apply`를 실행한다. apply 성공은 별도 트랜잭션에서 `install_applied`, 실패는 `install_failed`로 기록하므로 DB 실패 뒤 target에 고아 agent를 남기지 않고 같은 설치를 재발급·재시도할 수 있다. `TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS`(기본 1800초)로 `connect_expires_at`을 계산해 registration settings와 응답에 같이 담는다. `TARGET_REGISTRATION_AUTO_DELETE_EXPIRED`는 문서화된 운영 옵션이지만 기본은 `false`다. 기본 정책은 hard delete가 아니라 상태 노출 + UI 삭제/재시도 흐름이다. 원본 agent token은 등록 응답/manifest Secret에만 1회 노출되고 DB에는 hash만 저장한다. `/agent/connect`가 최초 연결되면 cluster registration status는 `registered`로 승격되지만, 이미 `uninstall_requested`인 등록은 완료 ACK까지 그대로 유지한다.

node-collector는 cluster-agent가 생성·관리하는 bounded subworker지만 별도 `cluster-agent-node-collector` ServiceAccount를 사용한다. 전용 ClusterRole은 pod `get/list`만 허용하며, API 호출은 `fieldSelector=spec.nodeName=<현재 노드>`로 서버 측 제한한다. cluster-agent의 넓은 ServiceAccount를 상속하지 않는다.

role=`management` 등록은 셀프 모니터링 전용이다. 서버가 `install_node_collector=false`, `install_sample_workload=false`, `control_namespaces=""`로 정규화한다. 사용자가 명시하지 않은 `loki_base_url`/`tempo_base_url`/`otel_traces_endpoint`는 target cluster 기본 주소를 상속하지 않고 빈 값으로 둔다. Prometheus는 role에 관계없이 cluster integration revision을 통해서만 활성화한다. 최초 policy도 `cluster_role="management"`, `bootstrap.mode="management"`, resources 빈 배열로 저장하며, 기본 evidence provider는 `kubernetes`만 enabled이고 `management` namespace 한 곳만 조회한다. metrics/logs/traces는 운영자가 읽기성 정책과 endpoint를 명시할 때만 켠다. 읽기 ClusterRole은 core/apps/discovery 리소스, `metrics.k8s.io`의 pods/nodes, `argoproj.io`의 applications/rollouts를 읽으며 Argo 규칙은 get/list만 허용한다. 쓰기 동사는 추가하지 않는다. `DELETE /clusters/{cluster_id}` 등록 해제 API도 management role이면 HTTP 400 `{code:"management_readonly"}`로 거부하며 `purge=true`여도 예외가 없다. target role 등록 해제는 `cluster.agent.uninstall`을 큐에 넣고 status를 `uninstall_requested`로 유지한다. 오프라인 에이전트도 같은 command를 재연결 뒤 실행하며, 브라우저 수동 명령이나 DB 강제 폐기 경로는 없다. 에이전트가 `cleanup_completed=true` 완료 결과를 보낸 뒤에만 토큰을 폐기하고 `disconnected`로 전환한다. 테스트 fixture 물리 삭제는 명시적 `purge=true`, `TEST_FIXTURE_PURGE_ENABLED=1`, registration `environment=test`를 모두 만족할 때만 허용되며 cluster ID 문자열에는 의존하지 않는다.

| 상태 | 조건 |
|---|---|
| `pending_install` | 등록은 됐지만 agent 행이 없고 `connect_expires_at` 이전 |
| `install_applied` | 관리 서버 bootstrap apply가 성공했지만 agent가 아직 최초 연결하지 않음 (`connection_status=pending_install`) |
| `install_failed` | bootstrap apply 실패가 영속됨; 재발급 가능한 상태 (`connection_stage=error`) |
| `install_expired` | 등록은 됐지만 agent 행이 없고 `connect_expires_at` 이후 또는 registration status가 `install_expired` |
| `never_connected` | 등록/agent 행 모두 없음 |
| `online` | `now - last_seen_at <= AGENT_ONLINE_WINDOW_SECONDS`(기본 120초) |
| `stale` | 윈도우 초과 또는 `last_seen_at` 파싱 불가 |

## 불변식·오류 (Invariants & Errors)

**불변식:**
- 정책 generation은 클러스터별 **단조 증가**: `upsert_cluster_policy`는 기존 generation 이하를 거부(`ValueError` → PUT policy에서 409).
- evidence 윈도우당 `cluster.evidence.received` 이벤트는 **정확히 1회**: `evidence_windows.evidence_key` PK + `record_evidence_event_once`의 단일 트랜잭션(윈도우 insert + events/outbox 스테이징)으로 보장.
- `job_id`/`evidence_key`는 결정적(`workspace:cluster:source:window[:provider]`) — 재스케줄·중복 요청이 항상 idempotent.
- evidence job 완료는 **유효한 리스 보유자만** 가능(lease_id+agent_id+`leased`+미만료 검증). 만료 리스 잡은 다른 agent가 재선점 가능.
- `result`는 `completed` 상태에서만 저장(재큐잉/실패 시 `NULL`).
- agent 엔드포인트의 workspace/cluster 스코프는 **토큰 identity에서만** 취한다(body/query의 cluster_id는 검증 대상이거나 덮어씀).
- agent 토큰 원문은 DB에 저장하지 않는다(해시만). desired-state spec에도 secret 원문 없음.
- kube context는 fail-closed: allowlist 미설정 시 명시 컨텍스트 전부 거부(컨텍스트 미지정 apply만 허용), 설정 시 목록 내 컨텍스트만 허용. allowlist가 설정돼 있으면 컨텍스트 미지정도 403.
- 등록 트랜잭션(레지스트리+정책+desired state+이벤트)은 원자적 — 반쪽 등록 금지.
- management 클러스터는 관측 전용이다. 설치 RBAC에는 get/list/watch만 존재하고, 정책 API·등록 해제 API·명령 경로가 모두 management 쓰기를 거부한다.
- `services → domains → packages` 단방향 의존. 이 도메인은 `domains.identity`/`domains.providers`/`domains.rca`를 import한다(도메인 간 수평 의존).

**오류:**

| 상황 | 예외/응답 |
|---|---|
| provider 검증 실패, apply/kube_context 조합 위반 | HTTP 422 (`TARGET_PROVIDER_INVALID` prefix) |
| 테스트 클러스터 등록 시도 | HTTP 422 (`"test target registrations are not allowed"`) |
| agent 이미지 미해결(placeholder + env 기본값 없음) | HTTP 422 (`"target agent image is not configured"`) |
| 설치 링크 토큰 미등록/불일치(`GET /install/{agent_token}`) | HTTP 404 (`"install link not found"`) |
| kube context allowlist 위반 | HTTP 403 (`KUBE_CONTEXT_NOT_ALLOWED`) |
| kubectl 미설치 | HTTP 503 (`KUBECTL_NOT_AVAILABLE`) |
| kubectl apply 실패(returncode≠0) | HTTP 502 (`KUBECTL_APPLY_FAILED`) |
| kubectl apply 타임아웃 | HTTP 504 (`KUBECTL_APPLY_TIMEOUT`) |
| 클러스터 미존재(`GET /clusters/{id}`) | HTTP 404 (`"cluster not found"`) |
| policy path/body cluster_id 불일치 | HTTP 409 (`"cluster_id does not match policy payload"`) |
| management 클러스터 정책 write/open 또는 등록 해제 시도 | HTTP 400 (`{"code":"management_readonly","detail":"management 클러스터는 읽기 전용입니다"}`) |
| policy generation 역행 | `ValueError` → HTTP 409 |
| agent 토큰 identity와 cluster_id 불일치(`GET /agent/policy`) | HTTP 403 (`"cluster_id does not match agent identity"`) |
| evidence job 결과 보고 대상 없음/리스 불일치 | HTTP 404 (`EVIDENCE_JOB_NOT_FOUND`) |
| sample workload 설치 시 name/image 누락 | `ValueError("sample workload install requires name and image")` |

## 설정 (Settings)

모두 `packages.config.settings :: env()`로 읽는다 — [config](../packages/config.md). ※ 표시는 모듈 import 시점에 1회 평가되는 값.

| 환경변수 | 타입 | 기본값 | 의미 | 읽는 위치 |
|---|---|---|---|---|
| `KUBECTL_APPLY_TIMEOUT_SECONDS` | float | `30` | kubectl apply subprocess 타임아웃(초) | `apply_manifest_with_kubectl` (호출 시) |
| `KUBE_CONTEXT_ALLOWLIST` | str(콤마구분) | `""` | 허용 kube context 목록. 미설정=명시 컨텍스트 전부 거부 | `allowed_kube_contexts` (호출 시) |
| `EVIDENCE_JOB_POLL_DEFAULT_SECONDS` | int | `10` | 롱폴 기본 대기 초 ※ | `router.py` |
| `EVIDENCE_JOB_POLL_MAX_SECONDS` | int | `30` | 롱폴 최대 대기 초 ※ | `router.py` |
| `EVIDENCE_JOB_POLL_SLEEP_SECONDS` | int | `1` | 롱폴 반복 간 대기 초 ※ | `router.py` |
| `AGENT_ONLINE_WINDOW_SECONDS` | int | `120` | agent online 판정 윈도우(최소 1로 클램프) | `agent_online_window_seconds` (호출 시) |
| `TARGET_AGENT_IMAGE` | str | `""` | placeholder 이미지 등록 시 치환할 agent 기본 이미지(1순위) | `normalize_target_provider_defaults` (호출 시) |
| `GITOPS_WEBHOOK_IMAGE` | str | `""` | agent 기본 이미지 폴백(2순위) | `normalize_target_provider_defaults` (호출 시) |
| `PUBLIC_MANAGEMENT_BASE_URL` | str | `""` | `management_base_url` 빈 값일 때 우선 사용할 공개 게이트웨이 주소(`/api` 접미 정규화) | `normalize_target_provider_defaults` (호출 시) |
| `PUBLIC_API_BASE_URL` | str | `""` | `PUBLIC_MANAGEMENT_BASE_URL` 미지정 시 fallback 공개 API 주소 | `normalize_target_provider_defaults` (호출 시) |
| `PUBLIC_BASE_URL` | str | `""` | 공개 API 주소 미지정 시 fallback 서비스 루트(`/api` 접미 정규화) | `normalize_target_provider_defaults` (호출 시) |
| `EVIDENCE_JOB_LEASE_SECONDS` | int | `60` | evidence job 리스 유지 초 ※ | `evidence_jobs.py` |
| `PENDING_EVIDENCE_EVENT_TTL_SECONDS` | int | `120` | pending evidence 윈도우 회수 TTL 초 ※ | `evidence_jobs.py` |
