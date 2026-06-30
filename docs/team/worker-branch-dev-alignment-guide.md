# 작업자 브랜치 dev 정렬 가이드

작성 기준: 2026-06-30, `origin/dev`와 원격 작업자 브랜치를 직접 비교했다.

이 문서의 목표는 각 팀원이 자기 브랜치 구현을 현재 `dev` 구조와 같은 방식으로
리팩터링하고, 충돌 없이 작은 PR로 머지할 수 있게 하는 것이다. 오래된 브랜치를
그대로 merge하지 않는다. 현재 `dev`에서 새 브랜치를 만든 뒤 가치 있는 함수, 정책,
테스트만 현재 경로로 옮긴다.

## 공통 판단

현재 `dev`의 기준 구조:

- 외부 HTTP는 `src/services/api-gateway`가 받고, 실제 도메인 route는 `src/domains/*/router.py`로 나뉜다.
- 공유 계약은 `src/packages/contracts/*`, 런타임/저장소 공통은 `src/packages/runtime`, `src/packages/storage`에 둔다.
- worker는 `src/services/<service>/app.py`에서 `App(...)`와 `@app.on(...)`을 사용한다.
- Target Agent는 management plane으로 outbound HTTP만 한다. NATS/DB에 직접 붙지 않는다.
- Target 등록은 cluster-agent만 설치하고, node collector DaemonSet은 cluster-agent가 reconcile한다.
- `services/*`, `packages/*` 루트 경로에 구현한 코드는 현재 구조와 맞지 않는다. 같은 파일명이어도 그대로 복사하지 않는다.

충돌 없이 작업하는 기본 절차:

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/<git-id>/<small-topic>-dev-align
```

브랜치 코드를 볼 때는 merge 대신 `git show`나 `git diff`로 필요한 부분만 읽는다.

```bash
git diff --stat origin/dev...origin/feat/<git-id>/<topic>
git diff --name-status origin/dev...origin/feat/<git-id>/<topic>
git show origin/feat/<git-id>/<topic>:<old-path>
```

PR 하나의 크기는 “한 도메인 안에서 한 가지 기능”으로 제한한다. 예를 들어 로그인,
권한 정책, target telemetry query, node collector metric은 서로 다른 PR이다.

## 브랜치 현황

| 작업자 | 브랜치 | dev 대비 판단 | 권장 액션 |
| --- | --- | --- | --- |
| 우현 | `origin/feat/jeonwoohyun-hydromel/gitops-sync-worker` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `dev`에서 새 브랜치를 만들고 GitOps worker TODO만 구현한다. |
| 우현 | `origin/feat/jeonwoohyun-hydromel/command-worker` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `dev`의 `src/services/command-worker`를 기준으로 작은 PR 작성. |
| 찬빈 | `origin/feat/jcbbbbbb/api-gateway` | `services/`, `packages/` 루트에 Gateway/Auth 구현 1600줄이 있다. 현재 경로와 충돌 가능성이 높다. | 코드 전체 merge 금지. password auth, access policy, schema, 테스트 아이디어만 현재 `src/` 구조로 이식. |
| 가인 | `origin/feat/ummfieg/rca-worker` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `dev`의 RCA event flow에서 새 PR을 시작한다. |
| 가인 | `origin/feat/ummfieg/dashboard-projection-service` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `src/services/projection/dashboard-worker` 기준으로 projection 확장. |
| 가인 | `origin/feat/ummfieg/audit-timeline-service` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `src/services/projection/audit-worker` 기준으로 audit timeline 확장. |
| minmings111 | `origin/feat/minmings111/node-collector` | 고유 변경은 merge/init 성격이고 파일 diff는 없다. | 현재 `src/services/target/node-collector`에서 새 PR 시작. |
| minmings111 | `origin/feat/minmings111/target-cluster-agent` | target telemetry/collector 구현 1200줄이 오래된 루트 경로에 있다. | telemetry query, Kubernetes pod metric, install script 아이디어만 현재 `src/services/target/*`로 이식. |

## 찬빈: Gateway/Auth 브랜치 이식

브랜치에서 가치 있는 구현:

- `hash_password`, `verify_password`: email/password 로그인용 PBKDF2 해시.
- `PasswordAuthService`: OAuth와 자체 로그인을 분리한 책임 구조.
- `AccessPolicy`: organization membership과 cluster access grant를 분리한 정책.
- `LoginRequest`, login/logout 테스트.
- 사용자, 조직, 클러스터 권한 테이블 아이디어.

그대로 가져오면 안 되는 구현:

- `services/api-gateway/gateway.py`에 route를 전부 넣는 방식. 현재 dev는 도메인 router로 분리되어 있다.
- `packages/storage/database.py`에 긴 DDL과 SQL 메서드를 직접 추가하는 방식. 현재 dev는 `src/domains/identity/models.py`, `repository.py`가 권한/연결 모델을 맡는다.
- root `packages/*` 경로. 현재는 `src/packages/*`다.
- session token을 응답 body에 자세히 싣는 흐름. 브라우저는 HttpOnly cookie를 우선한다.

현재 dev에 맞춘 파일 배치:

| 브랜치 구현 | dev 이식 위치 |
| --- | --- |
| `services/api-gateway/auth.py` password 함수 | `src/services/api-gateway/auth.py` 또는 `src/domains/identity/security.py` |
| `PasswordAuthService` | `src/services/api-gateway/auth.py`에 작게 두고 route는 identity router에서 호출 |
| `LoginRequest` | `src/packages/contracts/gateway/requests.py` |
| login/logout route | `src/domains/identity/router.py` |
| organization/cluster policy | `src/domains/identity/policy.py` 또는 `src/packages/contracts/interfaces.py` Protocol + `src/domains/identity/repository.py` |
| DB 테이블 | `src/domains/identity/models.py`에 SQLAlchemy model로 추가 |
| 권한 테스트 | `tests/test_auth_security.py`, 새 `tests/test_identity_access_policy.py` |

작은 PR 순서:

1. `feat/jcbbbbbb/password-login-dev-align`
   - `LoginRequest`, password hash/verify, `PasswordAuthService`만 추가.
   - `/auth/login`, `/auth/logout` route를 `src/domains/identity/router.py`에 추가.
   - Redis session은 기존 `RedisSessionStore`를 그대로 사용.

2. `feat/jcbbbbbb/identity-access-policy`
   - `AccessPolicy`를 현재 workspace/repo/cluster model에 맞춰 다시 작성.
   - route guard에 붙이기 전 순수 policy 테스트부터 작성.

3. `feat/jcbbbbbb/cluster-credential-binding`
   - integration target, credential ref, binding을 모델/레포지토리로 연결.
   - secret 원문은 event, response, log에 노출하지 않는다.

예시 1: password hashing은 작게 유지한다.

```python
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_NAME = "sha256"
PASSWORD_HASH_ITERATIONS = 260_000
PASSWORD_SALT_BYTES = 16


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        PASSWORD_HASH_NAME,
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "$".join(
        [
            PASSWORD_HASH_ALGORITHM,
            str(PASSWORD_HASH_ITERATIONS),
            encode_token(salt),
            encode_token(digest),
        ]
    )
```

예시 2: login route는 Gateway 본체가 아니라 identity router에 둔다.

```python
@router.post(gateway_routes.AUTH_LOGIN_PATH)
async def login(
    payload: LoginRequest,
    response: Response,
    auth: Any = Depends(get_password_auth),
) -> dict[str, Any]:
    session = await auth.login(payload.email, payload.password)
    set_session_cookie(response, session)
    return {Gateway.AUTHENTICATED: True, Gateway.USER_ID: session.user_id}
```

예시 3: 정책은 SQL 구현에 직접 묶지 않고 port를 받는다.

```python
class OrganizationAccessStore(Protocol):
    def get_workspace_member_role(self, workspace_id: str, user_id: str) -> str | None: ...


class ClusterAccessStore(Protocol):
    def get_cluster(self, cluster_id: str) -> dict[str, Any] | None: ...
    def get_cluster_access_grant(
        self, cluster_id: str, principal_type: str, principal_id: str
    ) -> dict[str, Any] | None: ...


class AccessPolicy:
    def __init__(self, organizations: OrganizationAccessStore, clusters: ClusterAccessStore) -> None:
        self.organizations = organizations
        self.clusters = clusters

    def evaluate(self, request: AccessRequest) -> AccessDecision:
        role = self.organizations.get_workspace_member_role(
            request.workspace_id, request.actor_id
        )
        if role is None:
            return AccessDecision.deny("workspace membership required")
        cluster = self.clusters.get_cluster(request.cluster_id)
        if cluster is None or cluster["workspace_id"] != request.workspace_id:
            return AccessDecision.deny("cluster workspace mismatch")
        return AccessDecision.allow(role=role)
```

테스트 최소 세트:

- 로그인 성공 후 `/auth/session` 성공.
- 잘못된 password는 401.
- logout 후 같은 session은 401.
- response/event/log에 password, password_hash, provider token이 없다.
- workspace member가 아니면 cluster action denied.
- viewer가 write command를 요청하면 denied.

## 우현: GitOps/Command 브랜치 이식

우현 브랜치들은 현재 dev와 파일 diff가 없으므로, 예전 브랜치를 되살리는 대신 현재 코드에서 바로 작업한다.

담당 파일:

- `src/services/gitops/github-poll-worker`
- `src/services/gitops/git-pull-worker`
- `src/services/gitops/manifest-render-worker`
- `src/services/gitops/diff-worker`
- `src/services/gitops/diff-analyze-worker`
- `src/services/command-worker`
- `src/domains/gitops`
- `src/domains/command`

작은 PR 순서:

1. `feat/jeonwoohyun-hydromel/git-changed-idempotency`
   - 같은 repo/branch/commit은 중복 `git.changed`를 발행하지 않는다.

2. `feat/jeonwoohyun-hydromel/manifest-render-port`
   - renderer를 Protocol로 두고 fake renderer와 real renderer를 분리한다.

3. `feat/jeonwoohyun-hydromel/desired-diff-structure`
   - diff body에 `action`, `resource`, `namespace`, `risk_reason`을 구조화한다.

4. `feat/jeonwoohyun-hydromel/command-policy`
   - `sandbox` namespace 외 write는 fail-closed.
   - Target Agent를 직접 호출하지 않고 queue 계약만 사용.

예시: renderer port.

```python
class ManifestRenderer(Protocol):
    async def render(self, repo_ref: str, commit_sha: str, path: str) -> RenderedManifest: ...


class FakeManifestRenderer:
    async def render(self, repo_ref: str, commit_sha: str, path: str) -> RenderedManifest:
        return RenderedManifest(
            repo_ref=repo_ref,
            commit_sha=commit_sha,
            resources=[{"apiVersion": "apps/v1", "kind": "Deployment"}],
        )
```

예시: worker handler는 다음 body를 yield한다.

```python
@app.on(GitChangedBody)
async def handle_git_changed(body: GitChangedBody, ctx: EventContext[GitOpsStore]):
    rendered = await renderer.render(body.repo_ref, body.commit_sha, body.manifest_path)
    await ctx.db.save_rendered_manifest(body.correlation_id, rendered.to_body())
    yield ManifestRenderedBody.from_rendered(rendered)
```

테스트 최소 세트:

- 새 commit이면 `git.changed` 발행.
- 같은 commit이면 event 없음.
- render 실패는 raw exception 문자열 전체가 아니라 구조화된 실패로 남음.
- `command.requested -> command.dispatch.ready -> command.queued_for_agent` 흐름.
- production namespace write가 거부된다.

## 가인: RCA/Safe PR/Audit 브랜치 이식

가인 브랜치들도 현재 dev와 파일 diff가 없다. 현재 event flow 위에서 바로 구현한다.

담당 파일:

- `src/services/rca-worker/app.py`
- `src/domains/rca`
- `src/domains/scm`
- `src/services/gitops/scm-worker/app.py`
- `src/services/projection/audit-worker/app.py`
- `docs/team/member-guides/rca-safe-pr.md`

작은 PR 순서:

1. `feat/ummfieg/evidence-bundle-normalizer`
   - `cluster.evidence.received`를 RCA 입력 bundle로 정규화한다.

2. `feat/ummfieg/rca-insufficient-evidence`
   - 근거가 부족하면 억지 RCA를 만들지 않고 insufficient 상태를 남긴다.

3. `feat/ummfieg/safe-pr-policy-body`
   - `rca.completed -> safe_pr.policy_decided` 분기 body를 명확히 한다.

4. `feat/ummfieg/audit-correlation-timeline`
   - command, RCA, safe PR 상태를 같은 `correlation_id` timeline으로 조회 가능하게 한다.

예시: RCA 판단 경계.

```python
class RcaAnalyzer(Protocol):
    async def analyze(self, bundle: EvidenceBundle) -> RcaResult: ...


class DeterministicRcaAnalyzer:
    async def analyze(self, bundle: EvidenceBundle) -> RcaResult:
        if not bundle.has_incident_signal:
            return RcaResult.insufficient("incident signal not found")
        return RcaResult.completed(
            root_cause="readiness probe failed",
            action="rollout_restart",
            evidence_refs=bundle.refs,
        )
```

예시: Safe PR 정책은 바로 GitHub write를 하지 않는다.

```python
@app.on(RcaCompletedBody)
async def decide_safe_pr(body: RcaCompletedBody, ctx: EventContext[RcaStore]):
    decision = policy.decide(body)
    await ctx.db.save_safe_pr_decision(body.correlation_id, decision.to_body())
    if decision.route == "draft_pr":
        yield SafePrRequestedBody.from_decision(decision)
    elif decision.route == "approval_required":
        yield RcaActionRequiredBody.from_decision(decision)
```

테스트 최소 세트:

- evidence 부족 -> RCA completed가 아니라 insufficient/ action_required.
- 장애 flag 있음 -> RCA result에 evidence ref가 포함됨.
- `safe_pr.requested`는 feature flag off에서 실제 GitHub write를 하지 않음.
- `safe_pr.failed`가 audit timeline에 남음.

## minmings111: Target/Agent/Telemetry 브랜치 이식

브랜치에서 가치 있는 구현:

- `EvidenceCollector`: Prometheus/Loki 결과를 evidence로 정규화하는 책임 분리.
- `telemetry_queries.py`: query 정의를 코드에서 한 곳에 모은 구조.
- `KubernetesApiClient`, `PodMetricCollector`: node collector가 Kubernetes API에서 pod 상태를 읽는 구조.
- `node_collector_scrape_error`: collector 부분 실패를 Prometheus metric으로 노출.
- telemetry 설치 manifest와 script 아이디어.

그대로 가져오면 안 되는 구현:

- root `services/node-collector/*`, `services/target-cluster-agent/*` 경로.
- `scripts/up.sh`, `deploy/target/target.yaml` 전체 교체. 현재 dev는 target 등록 API가 install manifest를 생성한다.
- Prometheus/Loki raw payload 전체를 큰 event로 계속 싣는 구조. 운영에서는 summary/ref로 축약해야 한다.
- Node Collector를 정적 target manifest에 다시 넣는 방식. 현재는 cluster-agent가 DaemonSet을 관리한다.

현재 dev에 맞춘 파일 배치:

| 브랜치 구현 | dev 이식 위치 |
| --- | --- |
| `services/target-cluster-agent/evidence.py` | `src/services/target/cluster-agent/evidence_collector.py` 후보 또는 `agent.py` 내부를 작게 추출 |
| `services/target-cluster-agent/telemetry_queries.py` | `src/services/target/cluster-agent/telemetry_queries.py` |
| `services/node-collector/kubernetes_api.py` | `src/services/target/node-collector/kubernetes_api.py` |
| `services/node-collector/metric_collectors.py` | `src/services/target/node-collector/metric_collectors.py` |
| `services/node-collector/prometheus_metrics.py` | `src/services/target/node-collector/prometheus_metrics.py` |
| telemetry YAML | `deploy/target` 또는 추후 Helm/Kustomize renderer PR |

작은 PR 순서:

1. `feat/minmings111/node-collector-metric-port`
   - `MetricCollector` Protocol, `MetricSample`, renderer만 추가.
   - 기존 `/metrics` shape를 깨지 않는다.

2. `feat/minmings111/node-collector-kubernetes-pods`
   - Kubernetes API read client와 pod count metric 추가.
   - API 실패 시 `/metrics`는 계속 200이고 `scrape_error=1`.

3. `feat/minmings111/target-telemetry-queries`
   - Prometheus/Loki query 목록을 별도 모듈로 이동.
   - `httpx.MockTransport` 테스트로 직접 조회 검증.

4. `feat/minmings111/target-telemetry-summary`
   - raw payload 전체가 아니라 bounded summary evidence로 축약.

5. `feat/minmings111/telemetry-install-adapter`
   - fake telemetry 제거 전 실제 Prometheus/Loki/OTel adapter 설치 경계 문서화.
   - cluster-agent가 node collector를 관리한다는 현재 구조는 유지.

예시: node collector metric port.

```python
@dataclass(frozen=True)
class MetricSample:
    name: str
    help: str
    value: float
    labels: dict[str, str]


class MetricCollector(Protocol):
    async def collect(self, labels: dict[str, str]) -> list[MetricSample]: ...
```

예시: Kubernetes pod metric collector.

```python
class PodMetricCollector:
    def __init__(self, kubernetes: KubernetesApiClient, node_name: str) -> None:
        self.kubernetes = kubernetes
        self.node_name = node_name

    async def collect(self, labels: dict[str, str]) -> list[MetricSample]:
        pods = pods_on_node(await self.kubernetes.list_pods(), self.node_name)
        return [
            MetricSample(
                name="node_collector_node_pod_count",
                help="Pods scheduled on this Kubernetes node.",
                value=len(pods),
                labels=labels,
            )
        ]
```

예시: target telemetry collector.

```python
class TelemetryCollector:
    def __init__(self, prometheus: PrometheusClient, loki: LokiClient) -> None:
        self.prometheus = prometheus
        self.loki = loki

    async def collect(self) -> dict[str, Any]:
        metrics, logs = await asyncio.gather(
            self.prometheus.query_all(PROMETHEUS_QUERIES),
            self.loki.query_all(LOKI_QUERIES),
        )
        return {
            "metrics": summarize_metrics(metrics),
            "logs": summarize_logs(logs),
        }
```

테스트 최소 세트:

- Kubernetes API 실패해도 `/metrics`는 200이고 scrape error metric이 1.
- pod fixture에서 node별 pod count가 맞다.
- Prometheus label/query endpoint를 실제로 호출한다.
- Loki labels/query_range endpoint를 실제로 호출한다.
- evidence payload가 최대 행 수/크기 제한을 가진다.
- Target Agent는 `/agent/evidence`, `/agent/commands/poll`, `/agent/commands/{id}/result`만 사용한다.

## 파일별 충돌 회피표

| 오래된 브랜치 파일 | 현재 dev 기준 처리 |
| --- | --- |
| `packages/config/constants.py` | `src/packages/config/constants.py`에 필요한 상수만 추가. 이미 있는 상수 중복 금지. |
| `packages/contracts/gateway/requests.py` | `src/packages/contracts/gateway/requests.py`에 schema만 추가. route 로직 금지. |
| `packages/contracts/interfaces.py` | `src/packages/contracts/interfaces.py`에 Protocol만 추가. concrete DB/Redis import 금지. |
| `packages/storage/database.py` | 직접 이식 금지. 도메인 model/repository 또는 storage schema로 분리. |
| `services/api-gateway/gateway.py` | 직접 이식 금지. route는 `src/domains/*/router.py`, 조립은 현재 `ApiGateway.configure_routes()` 유지. |
| `services/api-gateway/auth.py` | password/session helper만 현재 `src/services/api-gateway/auth.py` 또는 identity security 모듈로 이식. |
| `services/target-cluster-agent/agent.py` | 직접 이식 금지. 현재 `TargetClusterAgent`의 outbound 계약 유지. |
| `services/target-cluster-agent/evidence.py` | `src/services/target/cluster-agent` 하위 작은 collector 모듈로 이식 가능. |
| `services/node-collector/*` | `src/services/target/node-collector/*`로 module 단위 이식. 기존 API path 유지. |
| `deploy/target/target.yaml` | 전체 교체 금지. target 등록 API 생성 manifest와 정적 예시가 같은 방향인지 확인. |
| `scripts/up.sh` | 전체 교체 금지. telemetry install은 독립 script나 target register option으로 분리. |

## PR 설명 예시

```markdown
## 변경
- email/password login route를 identity router에 추가
- Redis session은 기존 `RedisSessionStore` 재사용
- password hash는 PBKDF2로 저장하고 response/event/log에 노출하지 않음

## 이유
- Gateway/Auth 브랜치의 로그인 구현을 현재 dev 도메인 구조로 이식
- root `services/` 경로 충돌을 피하고 `src/domains/identity` 책임 유지

## 테스트
- `uv run pytest tests/test_auth_security.py tests/test_identity_login.py`
- `uv run ruff check src tests`

## 위험과 rollback
- 로그인 route 추가만 포함하므로 rollback은 해당 PR revert
- 기존 OAuth session route는 변경하지 않음
```

## Merge 전 체크리스트

- 새 브랜치가 `origin/dev`에서 시작했는가?
- root `services/`, `packages/` 경로를 새로 만들지 않았는가?
- PR이 한 역할/한 기능만 바꾸는가?
- 새 API는 `src/packages/contracts/gateway/routes.py`와 request schema를 함께 바꾸었는가?
- 새 event는 subject/body/docs/test를 함께 바꾸었는가?
- 새 DB model은 repository와 테스트가 있는가?
- secret/token/password/kubeconfig 원문이 response, event, log, test fixture, docs에 없는가?
- Target write는 `sandbox` namespace 정책을 지키는가?
- node collector는 정적 DaemonSet이 아니라 cluster-agent reconcile 흐름을 유지하는가?
- `uv run ruff check src tests`와 관련 pytest를 통과했는가?

## 팀원별 첫 TODO

- TODO(gateway): 찬빈은 password login PR부터 시작하고, AccessPolicy는 두 번째 PR로 분리한다.
- TODO(gateway): route는 `ApiGateway.configure_routes()` 안에 직접 늘리지 말고 identity router로 넣는다.
- TODO(gitops): 우현은 현재 dev에서 `manifest.rendered`와 `desired.diff.detected` 테스트를 먼저 고정한다.
- TODO(command): 우현은 command worker가 Target Agent를 직접 호출하지 않고 queue만 쓰게 유지한다.
- TODO(rca): 가인은 evidence 부족 케이스를 먼저 명시하고, Safe PR 실제 write는 feature flag 뒤에 둔다.
- TODO(audit): 가인은 `correlation_id` 기준 timeline을 command/RCA/PR 상태에 연결한다.
- TODO(target): minmings111은 node collector metric collector port부터 이식하고, 정적 DaemonSet으로 회귀하지 않는다.
- TODO(telemetry): minmings111은 Prometheus/Loki raw payload를 bounded summary evidence로 축약한다.
