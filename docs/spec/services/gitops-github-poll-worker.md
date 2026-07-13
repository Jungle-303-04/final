---
source_commit: 664925a6
status: synced
---

# github-poll-worker — GitHub 주기 폴링, 새 commit을 webhook 입구로 전달하는 timer producer

> 소스: `src/services/gitops/github-poll-worker/` (`app.py`, `poller.py`, `settings.py`) · 테스트: `tests/test_github_poller.py`

## 책임 (Responsibility)

- GitHub REST API를 주기적으로 폴링해 대상 repo/branch의 최신 commit을 감지하고, 새 commit이면 [api-gateway](gateway-api-gateway.md)의 `/github/webhook`으로 HMAC 서명된 POST를 보낸다. 이후 경로는 실제 webhook과 동일하다(outbox → NATS `git.webhook.received` → [git-pull-worker](gitops-git-pull-worker.md) → pipeline).
- 모듈 docstring 명시: GitOps 컨트롤러류와 같은 방향("polling 기본 + webhook 가속(옵션)"), cluster-agent와 같은 timer producer 형태. 외부 endpoint를 못 여는 환경이나 webhook 누락 보정용.
- 현재 구현은 DB에 등록된 active GitHub repository/application/deployment binding/watch target을 우선 순회하고, DB target이 없을 때만 env 단일 target(`GITHUB_REPO` 등)으로 fallback한다. target별 최신 commit 1건만 조회하며, 같은 commit 반복은 target별 메모리 가드(`_last_sha_by_target`)와 ledger dedup으로 흡수한다. **ETag 조건부 요청**을 target별로 지원한다 — 직전 응답의 `ETag`를 기억해 `If-None-Match`로 보내고, `304 Not Modified`면 새 커밋 없음으로 처리한다(304 응답은 GitHub rate limit을 소모하지 않음 — SCM provider를 압박하지 않는 폴링 원칙).
- 하지 않는 것: NATS 이벤트 직접 발행/구독(이 워커는 이벤트 버스에 붙지 않는 HTTP 클라이언트다), commit 내용 해석, manifest 처리.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `CONTEXT_KEY`, `get_logger`(logs), `env`(settings), `Target`(constants) |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `gateway.routes.GITHUB_WEBHOOK_PATH`, gitops 계약 상수(`GITHUB_TOKEN_ENV`, `GITHUB_API_BASE_ENV`, `DEFAULT_*`), `identity.DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `AsyncService` — 로깅 구성 + asyncio 실행 래퍼 |
| import | `packages.security` | [../../packages/security.md](../packages/security.md) | `build_token_vault`, `SecretNotFound`, `SecretRef` — per-repo `credential_ref` 또는 env token ref 해석 |
| import | `packages.storage` | [../../packages/storage.md](../packages/storage.md) | `Database`, `DATABASE_URL_ENV` — DB target 조회 주입 |
| DB read | `RepoChangeRepository.list_active_github_poll_targets` | [../domains/gitops.md](../domains/gitops.md) | active GitHub poll target 목록 |
| import (외부) | `httpx` | — | GitHub API GET / webhook POST 비동기 HTTP 클라이언트 |
| import (로컬) | `poller`, `settings` | (이 페이지) | 서비스 디렉터리 flat 모듈 import(`from poller import GitHubPoller`, `from settings import Settings`) |
| 외부 시스템 | GitHub REST API | — | `GET {GITHUB_API_BASE}/repos/{owner/repo}/commits?per_page=1&sha={branch}` |
| 외부 시스템 | api-gateway HTTP | [../gateway/api-gateway.md](gateway-api-gateway.md) | `POST {MANAGEMENT_BASE_URL}/github/webhook` |

## 공개 인터페이스 (Public API)

### app.py

```python
async def run() -> None
```
`src/services/gitops/github-poll-worker/app.py :: run` — `DATABASE_URL`이 있으면 `Database()`를 poller에 주입하고 `await GitHubPoller(db=db).run()`.

```python
def main() -> None
```
`src/services/gitops/github-poll-worker/app.py :: main` — `AsyncService(Settings.SERVICE_NAME, run).run()`. 진입점: `if __name__ == "__main__": main()`.

### poller.py

| 심볼 | 값/시그니처 | 앵커 |
|---|---|---|
| `LOGGER` | `get_logger(__name__)` | `src/services/gitops/github-poll-worker/poller.py :: LOGGER` |
| `TRUTHY_VALUES` | `{"1", "true", "yes", "on"}` | `src/services/gitops/github-poll-worker/poller.py :: TRUTHY_VALUES` |

```python
def env_truthy(name: str) -> bool
```
`src/services/gitops/github-poll-worker/poller.py :: env_truthy` — `env(name, "").strip().lower() in TRUTHY_VALUES`.

```python
@dataclass(frozen=True)
class GitHubPollTarget:
    workspace_id: str
    repository_id: str
    repo_ref: str
    branch: str
    watch_target_id: str
    binding_id: str
    application_id: str
    environment: str
    cluster_id: str
    manifest_path: str
    credential_ref: str = ""

class GitHubPoller:
    def __init__(self, client: httpx.AsyncClient | None = None, *, db: Any | None = None, token_vault: Any | None = None) -> None: ...
    async def run(self) -> None: ...
    async def drive(self, client: httpx.AsyncClient) -> None: ...
    async def loop(self, client: httpx.AsyncClient) -> None: ...
    async def poll_once(self, client: httpx.AsyncClient) -> None: ...
    def poll_targets(self) -> list[GitHubPollTarget]: ...
    def db_poll_targets(self) -> list[GitHubPollTarget]: ...
    async def latest_commit_sha(self, client: httpx.AsyncClient, target: GitHubPollTarget) -> str | None: ...
    async def emit_webhook(self, client: httpx.AsyncClient, target: GitHubPollTarget, commit_sha: str) -> None: ...
    def require_poll_config(self, target: GitHubPollTarget) -> None: ...
```
`src/services/gitops/github-poll-worker/poller.py :: GitHubPoller`
(내부 메서드 `_webhook_headers(body: bytes) -> dict[str, str]`, `_github_headers(target) -> dict[str, str]`, `_github_token(target)`, `_read_token_ref(ref, target)`는 동작 섹션에서 설명.)

생성자에서 읽는 인스턴스 상태(설정 섹션 참조): env fallback용 `repo`, `branch`, `workspace_id`, `repository_id`, `watch_target_id`, `binding_id`, `cluster_id`, `manifest_path`, `source_type`, `interval`, `token_ref`, `token`, `github_api_base`, `webhook_secret`, `image`, `once`, `_client`, `db`, `token_vault`, `_last_sha_by_target: dict[str, str]`, `_etag_by_target: dict[str, str]`.

### settings.py

```python
class Settings:
    SERVICE_NAME = "github-poll-worker"
```
`src/services/gitops/github-poll-worker/settings.py :: Settings` — 클래스 속성 전부(코드 그대로):

| 속성 | 값 |
|---|---|
| `DEFAULT_MANAGEMENT_BASE_URL` | `"http://api-gateway:8000"` |
| `MANAGEMENT_BASE_URL_ENV` | `"MANAGEMENT_BASE_URL"` |
| `GITHUB_REPO_ENV` / `DEFAULT_GITHUB_REPO` | `"GITHUB_REPO"` / `DEFAULT_REPO_REF`(`""`) |
| `GITHUB_BRANCH_ENV` / `DEFAULT_GITHUB_BRANCH` | `"GITHUB_BRANCH"` / `DEFAULT_REPO_BRANCH`(`"main"`) |
| `WORKSPACE_ID_ENV` / `DEFAULT_WORKSPACE_ID` | `"WORKSPACE_ID"` / `"default"` |
| `REPOSITORY_ID_ENV` / `DEFAULT_REPOSITORY_ID` | `"REPOSITORY_ID"` / `""` |
| `WATCH_TARGET_ID_ENV` / `DEFAULT_WATCH_TARGET_ID` | `"WATCH_TARGET_ID"` / `""` |
| `DEPLOYMENT_BINDING_ID_ENV` / `DEFAULT_DEPLOYMENT_BINDING_ID` | `"DEPLOYMENT_BINDING_ID"` / `""` |
| `TARGET_CLUSTER_ID_ENV` / `DEFAULT_TARGET_CLUSTER_ID` | `"TARGET_CLUSTER_ID"` / `Target.DEFAULT_CLUSTER_ID`(`"default-target-cluster"`) |
| `MANIFEST_PATH_ENV` / `DEFAULT_MANIFEST_PATH` | `"MANIFEST_PATH"` / `"deploy.yaml"` |
| `MANIFEST_SOURCE_TYPE_ENV` | `"GIT_MANIFEST_SOURCE_TYPE"` |
| `POLL_INTERVAL_ENV` / `DEFAULT_POLL_INTERVAL_SECONDS` | `"POLL_INTERVAL_SECONDS"` / `"30"` |
| `POLL_ONCE_ENV` | `"POLL_ONCE"` |
| `GITHUB_TOKEN_ENV` | `"GITHUB_TOKEN"` (contracts.gitops 재노출) |
| `GITHUB_TOKEN_REF_ENV` | `"GITHUB_TOKEN_REF"` (contracts.gitops 재노출) |
| `GITHUB_API_BASE_ENV` / `DEFAULT_GITHUB_API_BASE` | `"GITHUB_API_BASE"` / `"https://api.github.com"` |
| `WEBHOOK_SECRET_ENV` | `"GITHUB_WEBHOOK_SECRET"` |
| `SIGNATURE_HEADER` | `"x-hub-signature-256"` |
| `SIGNATURE_PREFIX` | `"sha256="` |
| `HTTP_TIMEOUT_SECONDS_ENV` / `HTTP_TIMEOUT_SECONDS` | `"HTTP_TIMEOUT_SECONDS"` / `int(env(..., "30"))` — import 시점 평가 |
| `POLL_ONCE_MAX_ATTEMPTS_ENV` / `POLL_ONCE_MAX_ATTEMPTS` | `"POLL_ONCE_MAX_ATTEMPTS"` / `int(env(..., "3"))` — import 시점 평가 |
| `POLL_RETRY_DELAY_SECONDS_ENV` / `POLL_RETRY_DELAY_SECONDS` | `"POLL_RETRY_DELAY_SECONDS"` / `int(env(..., "5"))` — import 시점 평가 |
| `POLL_MAX_BACKOFF_SECONDS_ENV` / `POLL_MAX_BACKOFF_SECONDS` | `"POLL_MAX_BACKOFF_SECONDS"` / `int(env(..., "300"))` — import 시점 평가 |
| `POLL_BACKOFF_JITTER_SECONDS_ENV` / `POLL_BACKOFF_JITTER_SECONDS` | `"POLL_BACKOFF_JITTER_SECONDS"` / `int(env(..., "3"))` — import 시점 평가 |
| `TRANSIENT_RETRY_STATUS_CODES` | `{408, 500, 502, 503, 504}` |
| `SOFT_SKIP_STATUS_CODES` | `{403, 429}` |
| `NOT_MODIFIED_STATUS_CODE` | `304` — ETag(`If-None-Match`) 조건부 요청의 '변경 없음' 응답 코드 |
| `ACCESS_ERROR_STATUS_CODES` | `{401, 404}` |
| `WEBHOOK_IMAGE_ENV` / `DEFAULT_IMAGE` | `"GITOPS_WEBHOOK_IMAGE"` / `""` (기본값 없음 — 명시 env로만 유입) |
| `DEFAULT_REPLICAS` | `2` |

## 데이터 모델 (Data Model)

자체 소유 테이블 없음. DB target 조회는 gitops 도메인의 `git_repositories`, `applications`, `deployment_bindings`, `git_watch_targets`를 `RepoChangeRepository.list_active_github_poll_targets()`로 읽는다. 프로세스 메모리 상태는 `_last_sha_by_target`, `_etag_by_target`이고, 운영 관측 상태는 `RepoChangeRepository.record_watch_poll_result()`가 `git_watch_targets.settings.poll_status`, `poll_status_code`, `poll_error_kind`, `poll_error`, `last_polled_at`에 저장한다.

## 이벤트 (Events)

NATS 이벤트를 직접 발행/구독하지 않는다. 대신 HTTP POST가 간접 트리거가 된다:

- **간접 발행**: `POST {MANAGEMENT_BASE_URL}/github/webhook` → api-gateway가 `git.webhook.received`(`EventSubject.GIT_WEBHOOK_RECEIVED`, body `src/domains/gitops/events.py :: GitWebhookReceivedBody`)를 outbox로 발행 → [git-pull-worker](gitops-git-pull-worker.md)가 소비.

webhook POST body(JSON, 코드 그대로의 키 순서):

| 키 | 값 |
|---|---|
| commit_sha | 감지된 최신 commit SHA |
| image | `self.image` (`GITOPS_WEBHOOK_IMAGE`) |
| replicas | `Settings.DEFAULT_REPLICAS`(`2`) 고정 |
| workspace_id | `self.workspace_id` |
| repository_id | `self.repository_id` |
| repo_ref | `self.repo` |
| branch | `self.branch` |
| watch_target_id | `self.watch_target_id` |
| binding_id | `self.binding_id` |
| application_id | target application id(DB target이면 실제 application_id, env fallback이면 기본값 `""`) |
| environment | target environment(DB target이면 binding environment, env fallback이면 `"sandbox"`) |
| cluster_id | `self.cluster_id` |
| manifest_path | `self.manifest_path` |
| source_type | target source type(DB target이면 watch target settings → binding deploy_policy → application metadata 순 fallback, env fallback이면 `GIT_MANIFEST_SOURCE_TYPE`) |

`workflow_run_id`/`force` 키는 보내지 않는다 — 이벤트 body 기본값과 downstream 파생에 맡긴다.

## 동작 (Behavior)

### 기동

1. `main()` → `AsyncService("github-poll-worker", run).run()` (`src/packages/runtime/service.py :: AsyncService`: `SERVICE_NAME` env 기본 설정 + `configure_logging` + `asyncio.run`).
2. `run()` → `GitHubPoller(db=Database() | None).run()`:
   - `DATABASE_URL`이 있으면 DB target 조회용 `Database()`를 주입한다.
   - 없으면 DB 없이 env fallback만 사용한다.
   - 생성자에 클라이언트가 주입됐으면(`_client`) 그대로 `drive()`.
   - 아니면 `httpx.AsyncClient(timeout=Settings.HTTP_TIMEOUT_SECONDS)`를 만들어 `drive()`(기본 30초).

### `drive` — 실행 모드 분기

- `self.once`(`POLL_ONCE` truthy) → `poll_once_with_retry(client)` 후 종료. 1분 이상 주기가 충분한 환경의 CronJob 호환 모드다.
- 아니면 `loop(client)` — 상주 무한 루프. 운영 fallback polling은 Deployment replica 1 + `POLL_INTERVAL_SECONDS=30`으로 실행한다. Kubernetes CronJob은 표준적으로 초 단위 schedule을 지원하지 않으므로 30초 감지는 이 모드를 쓴다.

### `poll_once_with_retry` — CronJob 일시 오류 재시도

1. `max_attempts = max(1, Settings.POLL_ONCE_MAX_ATTEMPTS)`로 시도 횟수를 제한한다(기본 3).
2. `poll_once`가 성공하면 즉시 종료한다.
3. `httpx.TimeoutException`/`httpx.TransportError` 또는 `TRANSIENT_RETRY_STATUS_CODES`의 `HTTPStatusError`이면 `POLL_RETRY_DELAY_SECONDS * 2**(attempt-1)` 지수 백오프를 적용하되 `POLL_MAX_BACKOFF_SECONDS`로 상한을 둔다. 지터는 `0..POLL_BACKOFF_JITTER_SECONDS`.
4. 한도를 넘거나 비일시 오류이면 예외를 다시 올려 CronJob 실패로 드러낸다.

### `loop` — 실패 백오프

1. `failures = 0`으로 시작해 `while True`:
2. `poll_once` 성공 → `failures = 0`, `await asyncio.sleep(self.interval)`.
3. 예외 발생 → `failures += 1`, `backoff = min(POLL_RETRY_DELAY_SECONDS * 2**(failures-1), POLL_MAX_BACKOFF_SECONDS) + random.uniform(0, POLL_BACKOFF_JITTER_SECONDS)`. `github_poll_failed` 경고 로그(repo, exception_type, failures, backoff_seconds 반올림 1자리) 후 `sleep(backoff)`, `continue`.

### `poll_once`

1. `poll_targets()`로 DB target 목록을 읽는다. DB target이 있으면 그 목록을 사용하고, 없으면 `GITHUB_REPO`가 설정된 env fallback target 1개를 사용한다.
2. target마다 `commit_sha = await latest_commit_sha(client, target)`.
3. `commit_sha is None` 또는 target key 기준 `== self._last_sha_by_target[target.key]` → 아무것도 안 함(새 커밋 없음, dedup은 ledger가 최종 보장).
4. 아니면 `await emit_webhook(client, target, commit_sha)` → `record_poll_result(..., ok=True)` → `_last_sha_by_target[target.key] = commit_sha` → `github_change_detected` info 로그(repo, branch, watch_target_id, binding_id, application_id, commit_sha).
5. GitHub API가 target 단위로 `401/403/404/429` 또는 transport failure를 반환하면 `record_poll_result(..., ok=False)`로 실패 상태를 저장하고 `github_poll_target_unavailable` 로그를 남긴다. `POLL_ONCE`에서는 모든 target 처리를 마친 뒤 target error를 다시 올려 CronJob 실패로 노출한다.

### `latest_commit_sha` — GitHub API 호출 명세

1. `require_poll_config(target)` — target repo가 비었거나 `/`가 없으면 `ValueError("GITHUB_REPO must be set to owner/repo")`.
2. `GET {github_api_base}/repos/{target.repo_ref}/commits`, query `per_page=1&sha={target.branch}`, 헤더는 `_github_headers(target)` — target credential_ref 또는 env token ref/token이 있으면 `Authorization: Bearer {token}`, target key별 ETag가 있으면 `If-None-Match: <etag>` 추가(조건부 요청).
3. 상태 코드 처리:
   - `304`(`NOT_MODIFIED_STATUS_CODE`, ETag 일치) → 즉시 `None` — 새 커밋 없음, GitHub rate limit 미소모.
   - `403/429`(`SOFT_SKIP_STATUS_CODES`, rate limit 등) → `github_poll_skipped` info 로그 후 `None`.
   - `401/404`(`ACCESS_ERROR_STATUS_CODES`, 인증/접근 오류) → `github_poll_access_denied` warning 로그(hint: "GITHUB_TOKEN/GITHUB_REPO 확인 — private repo 는 읽기 토큰 필요") 후 `None` — 예외로 폴링 프로세스를 죽이지 않음.
   - 그 외 오류 → `response.raise_for_status()`로 예외(→ loop 백오프 또는 once 모드 실패).
4. 성공 → response `etag`가 있으면 `_etag_by_target[target.key]` 갱신 후 `commits[0]["sha"]`, 빈 배열이면 `None`.

### `emit_webhook` — webhook POST 명세

1. `self.image`가 비어 있으면 `ValueError("GITOPS_WEBHOOK_IMAGE is required")`.
2. body를 `json.dumps(...).encode()`로 직접 직렬화 — 주석: HMAC 서명은 전송 바이트와 정확히 일치해야 하므로 `json=` 대신 `content=` 전송.
3. 헤더 `_webhook_headers(body)`: `{"content-type": "application/json"}` + `webhook_secret`이 있으면 `x-hub-signature-256: sha256=<hmac.new(secret, body, sha256).hexdigest()>`. (주석: 시크릿 없으면 서명 미첨부 → 입구가 거부 → fail-closed.)
4. `POST {base_url}{GITHUB_WEBHOOK_PATH}` (= `/github/webhook`, `src/packages/contracts/gateway/routes.py :: GITHUB_WEBHOOK_PATH`) 후 `raise_for_status()`.

## 불변식·오류 (Invariants & Errors)

- 같은 target의 같은 commit SHA는 프로세스 생존 중 두 번 POST되지 않는다(`_last_sha_by_target` 메모리 가드). 재시작/CronJob 모드에서는 가드가 초기화되므로 최종 dedup은 downstream ledger 책임.
- `_etag_by_target`도 프로세스 메모리 상태다 — 재시작/CronJob 1회 실행에서는 첫 요청이 항상 무조건부(rate limit 1회 소모)이고, 상주 loop 모드에서 변경 없는 주기는 304로 rate limit을 소모하지 않는다. 304 응답에서는 ETag가 갱신되지 않는다(성공 2xx 응답의 `etag` 헤더만 저장).
- `emit_webhook` 성공 후에만 해당 target의 `_last_sha_by_target`이 갱신된다 — POST 실패 시 다음 주기에 같은 commit을 재시도한다.
- 403/429/401/404는 예외가 아니라 skip(None)으로 처리된다 — 폴링 프로세스를 죽이지 않는 fail-soft. 그 외 HTTP 오류·네트워크 예외는 loop 모드에서 지수 백오프(기본 5s, 상한 300s, 지터 0~3s), once 모드에서는 일시 오류만 기본 3회까지 같은 백오프로 재시도한 뒤 전파한다.
- `GITHUB_REPO`는 `owner/repo` 형식이 강제된다(`require_poll_config`), `GITOPS_WEBHOOK_IMAGE`는 emit 시점에 필수.
- `HTTP_TIMEOUT_SECONDS` 등 튜닝 상수 5종은 settings 모듈 import 시점에 평가된다 — env 변경은 재시작 필요.
- 무인증 폴링은 GitHub 공개 repo 시간당 60회 제한에 걸린다(데모 30초 주기=120회/시) — 토큰 설정 시 5000회(주석 명시).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `MANAGEMENT_BASE_URL` | str | `"http://api-gateway:8000"` | webhook POST 대상 게이트웨이 base URL |
| `GITHUB_REPO` | str (`owner/repo`) | `""` (필수) | 폴링 대상 repo |
| `GITHUB_BRANCH` | str | `"main"` | 폴링 대상 branch |
| `WORKSPACE_ID` | str | `"default"` | webhook body의 workspace_id |
| `REPOSITORY_ID` | str | `""` | webhook body의 repository_id(빈 값이면 downstream이 파생) |
| `WATCH_TARGET_ID` | str | `""` | webhook body의 watch_target_id |
| `DEPLOYMENT_BINDING_ID` | str | `""` | webhook body의 binding_id |
| `TARGET_CLUSTER_ID` | str | `"default-target-cluster"` | webhook body의 cluster_id |
| `MANIFEST_PATH` | str | `"deploy.yaml"` | webhook body의 manifest_path |
| `GIT_MANIFEST_SOURCE_TYPE` | str | `""` | env fallback webhook body의 source_type. DB target 은 저장된 source_type 을 사용 |
| `POLL_INTERVAL_SECONDS` | int | `30` | 상주 루프 폴링 주기 초 |
| `POLL_ONCE` | bool 문자열(`1/true/yes/on`) | 꺼짐 | 1회 폴링 후 종료(CronJob 호환 모드). 30초 fallback은 Deployment 상주 루프를 사용 |
| `GITHUB_TOKEN` | str | `""` | GitHub API Bearer 토큰(무인증 60회/시 → 인증 5000회/시) |
| `GITHUB_API_BASE` | str | `"https://api.github.com"` | GitHub API base(GHE 교체용) |
| `GITHUB_WEBHOOK_SECRET` | str | `""` | webhook HMAC-SHA256 서명 키(게이트웨이와 동일 키) |
| `GITOPS_WEBHOOK_IMAGE` | str | `""` (emit 시 필수) | webhook body의 image |
| `HTTP_TIMEOUT_SECONDS` | int | `30` | GitHub/webhook HTTP 타임아웃 초 |
| `POLL_ONCE_MAX_ATTEMPTS` | int | `3` | CronJob once 모드 일시 오류 최대 시도 횟수 |
| `POLL_RETRY_DELAY_SECONDS` | int | `5` | 실패 재시도 기본 간격 초(지수 백오프 밑변) |
| `POLL_MAX_BACKOFF_SECONDS` | int | `300` | 지수 백오프 상한 초 |
| `POLL_BACKOFF_JITTER_SECONDS` | int | `3` | 백오프 지터 상한 초 |
