---
source_commit: 664925a6
status: synced
---

# github-poll-worker — GitHub 주기 폴링, 새 commit을 webhook 입구로 전달하는 timer producer

> 소스: `src/services/gitops/github-poll-worker/` (`app.py`, `poller.py`, `settings.py`) · 테스트: `tests/test_github_poller.py`

## 책임 (Responsibility)

- GitHub REST API를 주기적으로 폴링해 대상 repo/branch의 최신 commit을 감지하고, 새 commit이면 [api-gateway](gateway-api-gateway.md)의 `/github/webhook`으로 HMAC 서명된 POST를 보낸다. 이후 경로는 실제 webhook과 동일하다(outbox → NATS `git.webhook.received` → [git-pull-worker](gitops-git-pull-worker.md) → pipeline).
- 모듈 docstring 명시: GitOps 컨트롤러류와 같은 방향("polling 기본 + webhook 가속(옵션)"), cluster-agent와 같은 timer producer 형태. 외부 endpoint를 못 여는 환경이나 webhook 누락 보정용.
- 현재 구현은 최신 commit 1건만 조회하며, 같은 commit 반복은 메모리 가드(`_last_sha`)와 ledger dedup으로 흡수한다. **ETag 조건부 요청**을 지원한다 — 직전 응답의 `ETag`를 기억해 `If-None-Match`로 보내고, `304 Not Modified`면 새 커밋 없음으로 처리한다(304 응답은 GitHub rate limit을 소모하지 않음 — SCM provider를 압박하지 않는 폴링 원칙).
- 하지 않는 것: NATS 이벤트 직접 발행/구독(이 워커는 이벤트 버스에 붙지 않는 HTTP 클라이언트다), commit 내용 해석, manifest 처리.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `CONTEXT_KEY`, `get_logger`(logs), `env`(settings), `Target`(constants) |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `gateway.routes.GITHUB_WEBHOOK_PATH`, gitops 계약 상수(`GITHUB_TOKEN_ENV`, `GITHUB_API_BASE_ENV`, `DEFAULT_*`), `identity.DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `AsyncService` — 로깅 구성 + asyncio 실행 래퍼 |
| import (외부) | `httpx` | — | GitHub API GET / webhook POST 비동기 HTTP 클라이언트 |
| import (로컬) | `poller`, `settings` | (이 페이지) | 서비스 디렉터리 flat 모듈 import(`from poller import GitHubPoller`, `from settings import Settings`) |
| 외부 시스템 | GitHub REST API | — | `GET {GITHUB_API_BASE}/repos/{owner/repo}/commits?per_page=1&sha={branch}` |
| 외부 시스템 | api-gateway HTTP | [../gateway/api-gateway.md](gateway-api-gateway.md) | `POST {MANAGEMENT_BASE_URL}/github/webhook` |

## 공개 인터페이스 (Public API)

### app.py

```python
async def run() -> None
```
`src/services/gitops/github-poll-worker/app.py :: run` — `await GitHubPoller().run()`.

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
class GitHubPoller:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None: ...
    async def run(self) -> None: ...
    async def drive(self, client: httpx.AsyncClient) -> None: ...
    async def loop(self, client: httpx.AsyncClient) -> None: ...
    async def poll_once(self, client: httpx.AsyncClient) -> None: ...
    async def latest_commit_sha(self, client: httpx.AsyncClient) -> str | None: ...
    async def emit_webhook(self, client: httpx.AsyncClient, commit_sha: str) -> None: ...
    def require_poll_config(self) -> None: ...
```
`src/services/gitops/github-poll-worker/poller.py :: GitHubPoller`
(내부 메서드 `_webhook_headers(body: bytes) -> dict[str, str]`, `_github_headers() -> dict[str, str]`는 동작 섹션에서 설명.)

생성자에서 읽는 인스턴스 상태(모두 `env()` 기반, 설정 섹션 참조): `base_url`(끝 `/` 제거), `repo`, `branch`, `workspace_id`, `repository_id`, `watch_target_id`, `binding_id`, `cluster_id`, `manifest_path`, `interval`(int), `token`, `github_api_base`(끝 `/` 제거), `webhook_secret`, `image`, `once`(`env_truthy(POLL_ONCE)`), `_client`(주입 클라이언트), `_last_sha: str | None = None`(같은 커밋 중복 POST만 줄이는 메모리 가드), `_etag: str | None = None`(ETag 조건부 요청용 — 변경 없으면 304로 rate limit 미소모).

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
| `POLL_INTERVAL_ENV` / `DEFAULT_POLL_INTERVAL_SECONDS` | `"POLL_INTERVAL_SECONDS"` / `"30"` |
| `POLL_ONCE_ENV` | `"POLL_ONCE"` |
| `GITHUB_TOKEN_ENV` | `"GITHUB_TOKEN"` (contracts.gitops 재노출) |
| `GITHUB_API_BASE_ENV` / `DEFAULT_GITHUB_API_BASE` | `"GITHUB_API_BASE"` / `"https://api.github.com"` |
| `WEBHOOK_SECRET_ENV` | `"GITHUB_WEBHOOK_SECRET"` |
| `SIGNATURE_HEADER` | `"x-hub-signature-256"` |
| `SIGNATURE_PREFIX` | `"sha256="` |
| `HTTP_TIMEOUT_SECONDS_ENV` / `HTTP_TIMEOUT_SECONDS` | `"HTTP_TIMEOUT_SECONDS"` / `int(env(..., "20"))` — import 시점 평가 |
| `POLL_RETRY_DELAY_SECONDS_ENV` / `POLL_RETRY_DELAY_SECONDS` | `"POLL_RETRY_DELAY_SECONDS"` / `int(env(..., "5"))` — import 시점 평가 |
| `POLL_MAX_BACKOFF_SECONDS_ENV` / `POLL_MAX_BACKOFF_SECONDS` | `"POLL_MAX_BACKOFF_SECONDS"` / `int(env(..., "300"))` — import 시점 평가 |
| `POLL_BACKOFF_JITTER_SECONDS_ENV` / `POLL_BACKOFF_JITTER_SECONDS` | `"POLL_BACKOFF_JITTER_SECONDS"` / `int(env(..., "3"))` — import 시점 평가 |
| `SOFT_SKIP_STATUS_CODES` | `{403, 429}` |
| `NOT_MODIFIED_STATUS_CODE` | `304` — ETag(`If-None-Match`) 조건부 요청의 '변경 없음' 응답 코드 |
| `ACCESS_ERROR_STATUS_CODES` | `{401, 404}` |
| `WEBHOOK_IMAGE_ENV` / `DEFAULT_IMAGE` | `"GITOPS_WEBHOOK_IMAGE"` / `""` (기본값 없음 — 명시 env로만 유입) |
| `DEFAULT_REPLICAS` | `2` |

## 데이터 모델 (Data Model)

없음 (DB 미사용, 상태는 프로세스 메모리의 `_last_sha` 뿐).

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
| cluster_id | `self.cluster_id` |
| manifest_path | `self.manifest_path` |

`environment`/`application_id`/`workflow_run_id`/`force` 키는 보내지 않는다 — 이벤트 body 기본값과 downstream 파생에 맡긴다.

## 동작 (Behavior)

### 기동

1. `main()` → `AsyncService("github-poll-worker", run).run()` (`src/packages/runtime/service.py :: AsyncService`: `SERVICE_NAME` env 기본 설정 + `configure_logging` + `asyncio.run`).
2. `run()` → `GitHubPoller().run()`:
   - 생성자에 클라이언트가 주입됐으면(`_client`) 그대로 `drive()`.
   - 아니면 `httpx.AsyncClient(timeout=Settings.HTTP_TIMEOUT_SECONDS)`를 만들어 `drive()`.

### `drive` — 실행 모드 분기

- `self.once`(`POLL_ONCE` truthy) → `poll_once(client)` 1회 후 종료. (주석: 프로덕션은 k8s CronJob이 주기를 들고 1회 실행 — 겹침·복구는 k8s에 위임.)
- 아니면 `loop(client)` — 상주 무한 루프. (주석: 데모 Deployment, replica 1이라 중복 발화 없음.)

### `loop` — 실패 백오프

1. `failures = 0`으로 시작해 `while True`:
2. `poll_once` 성공 → `failures = 0`, `await asyncio.sleep(self.interval)`.
3. 예외 발생 → `failures += 1`, `backoff = min(POLL_RETRY_DELAY_SECONDS * 2**(failures-1), POLL_MAX_BACKOFF_SECONDS) + random.uniform(0, POLL_BACKOFF_JITTER_SECONDS)`. `github_poll_failed` 경고 로그(repo, exception_type, failures, backoff_seconds 반올림 1자리) 후 `sleep(backoff)`, `continue`.

### `poll_once`

1. `commit_sha = await latest_commit_sha(client)`.
2. `commit_sha is None` 또는 `== self._last_sha` → 아무것도 안 함(새 커밋 없음, dedup은 ledger가 최종 보장).
3. 아니면 `await emit_webhook(client, commit_sha)` → `self._last_sha = commit_sha` → `github_change_detected` info 로그(repo, commit_sha).

### `latest_commit_sha` — GitHub API 호출 명세

1. `require_poll_config()` — `self.repo`가 비었거나 `/`가 없으면 `ValueError("GITHUB_REPO must be set to owner/repo")`.
2. `GET {github_api_base}/repos/{repo}/commits`, query `per_page=1&sha={branch}`, 헤더는 `_github_headers()` — 토큰 있으면 `Authorization: Bearer {token}`, `_etag`가 있으면 `If-None-Match: <etag>` 추가(조건부 요청).
3. 상태 코드 처리:
   - `304`(`NOT_MODIFIED_STATUS_CODE`, ETag 일치) → 즉시 `None` — 새 커밋 없음, GitHub rate limit 미소모.
   - `403/429`(`SOFT_SKIP_STATUS_CODES`, rate limit 등) → `github_poll_skipped` info 로그 후 `None`.
   - `401/404`(`ACCESS_ERROR_STATUS_CODES`, 인증/접근 오류) → `github_poll_access_denied` warning 로그(hint: "GITHUB_TOKEN/GITHUB_REPO 확인 — private repo 는 읽기 토큰 필요") 후 `None` — 예외로 CronJob을 죽이지 않음.
   - 그 외 오류 → `response.raise_for_status()`로 예외(→ loop 백오프 또는 once 모드 실패).
4. 성공 → `self._etag = response.headers.get("etag") or self._etag`로 ETag 갱신 후 `commits[0]["sha"]`, 빈 배열이면 `None`.

### `emit_webhook` — webhook POST 명세

1. `self.image`가 비어 있으면 `ValueError("GITOPS_WEBHOOK_IMAGE is required")`.
2. body를 `json.dumps(...).encode()`로 직접 직렬화 — 주석: HMAC 서명은 전송 바이트와 정확히 일치해야 하므로 `json=` 대신 `content=` 전송.
3. 헤더 `_webhook_headers(body)`: `{"content-type": "application/json"}` + `webhook_secret`이 있으면 `x-hub-signature-256: sha256=<hmac.new(secret, body, sha256).hexdigest()>`. (주석: 시크릿 없으면 서명 미첨부 → 입구가 거부 → fail-closed.)
4. `POST {base_url}{GITHUB_WEBHOOK_PATH}` (= `/github/webhook`, `src/packages/contracts/gateway/routes.py :: GITHUB_WEBHOOK_PATH`) 후 `raise_for_status()`.

## 불변식·오류 (Invariants & Errors)

- 같은 commit SHA는 프로세스 생존 중 두 번 POST되지 않는다(`_last_sha` 메모리 가드). 재시작/CronJob 모드에서는 가드가 초기화되므로 최종 dedup은 downstream ledger 책임.
- `_etag`도 프로세스 메모리 상태다 — 재시작/CronJob 1회 실행에서는 첫 요청이 항상 무조건부(rate limit 1회 소모)이고, 상주 loop 모드에서 변경 없는 주기는 304로 rate limit을 소모하지 않는다. 304 응답에서는 `_etag`가 갱신되지 않는다(성공 2xx 응답의 `etag` 헤더만 저장).
- `emit_webhook` 성공 후에만 `_last_sha`가 갱신된다 — POST 실패 시 다음 주기에 같은 commit을 재시도한다.
- 403/429/401/404는 예외가 아니라 skip(None)으로 처리된다 — 폴링 프로세스(특히 CronJob)를 죽이지 않는 fail-soft. 그 외 HTTP 오류·네트워크 예외는 loop 모드에서 지수 백오프(기본 5s, 상한 300s, 지터 0~3s), once 모드에서는 전파되어 실행 실패.
- `GITHUB_REPO`는 `owner/repo` 형식이 강제된다(`require_poll_config`), `GITOPS_WEBHOOK_IMAGE`는 emit 시점에 필수.
- `HTTP_TIMEOUT_SECONDS` 등 튜닝 상수 4종은 settings 모듈 import 시점에 평가된다 — env 변경은 재시작 필요.
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
| `POLL_INTERVAL_SECONDS` | int | `30` | 상주 루프 폴링 주기 초 |
| `POLL_ONCE` | bool 문자열(`1/true/yes/on`) | 꺼짐 | 1회 폴링 후 종료(CronJob 모드) |
| `GITHUB_TOKEN` | str | `""` | GitHub API Bearer 토큰(무인증 60회/시 → 인증 5000회/시) |
| `GITHUB_API_BASE` | str | `"https://api.github.com"` | GitHub API base(GHE 교체용) |
| `GITHUB_WEBHOOK_SECRET` | str | `""` | webhook HMAC-SHA256 서명 키(게이트웨이와 동일 키) |
| `GITOPS_WEBHOOK_IMAGE` | str | `""` (emit 시 필수) | webhook body의 image |
| `HTTP_TIMEOUT_SECONDS` | int | `20` | GitHub/webhook HTTP 타임아웃 초 |
| `POLL_RETRY_DELAY_SECONDS` | int | `5` | 실패 재시도 기본 간격 초(지수 백오프 밑변) |
| `POLL_MAX_BACKOFF_SECONDS` | int | `300` | 지수 백오프 상한 초 |
| `POLL_BACKOFF_JITTER_SECONDS` | int | `3` | 백오프 지터 상한 초 |
