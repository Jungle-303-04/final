---
source_commit: 1616d295
status: synced
---

# manifest-render-worker — `git.changed`를 받아 Kubernetes manifest를 렌더하고 `manifest.rendered` / `manifest.invalid`를 발행하는 워커

> 소스: `src/services/gitops/manifest-render-worker/` (`app.py`, `repo_cache.py`)

## 책임 (Responsibility)

- `git.changed` 이벤트 1종을 구독해, 해당 커밋의 manifest 소스를 (git checkout cache / GitHub Contents API / 로컬 git repo / 로컬 파일) 중 하나에서 로드하고, 소스 타입(raw-yaml / kustomize / helm)에 따라 Kubernetes 객체 목록으로 렌더한다.
- 렌더 성공 시 리소스마다 `repo_change` 저장 + `manifest_artifact` 기록(`rendered`) + `manifest.rendered` 발행. 실패 시 `manifest_artifact` 기록(`invalid_config`) + `manifest.invalid` 발행.
- 같은 (workspace, binding, commit, manifest_path, renderer_version)의 렌더 결과가 이미 저장돼 있으면 재렌더 없이 캐시된 artifact를 재발행한다(멱등 재처리).
- 소스가 어디에도 없으면 manifest를 합성하지 않고 `manifest.invalid`로 정직하게 실패한다.
- 하지 않는 것: diff 계산, 클러스터 적용, 워크플로 상태 기록(각각 diff-worker, command 계열, [workflow-controller](gitops-workflow-controller.md) 담당).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.gitops.diffing` | [gitops 도메인](../domains/gitops.md) | `extract_declared_field_paths` — 렌더된 객체의 선언 필드 경로 추출 |
| import | `domains.gitops.events` | [gitops 도메인](../domains/gitops.md) | `GitChangedBody`, `ManifestRenderedBody`, `ManifestInvalidBody`, `RenderedManifest`, `RenderedMetadata`, `RenderedSpec` |
| import | `packages.config` | [config 패키지](../packages/config.md) | `Sandbox`(기본 네임스페이스), `env` |
| import | `packages.contracts.event_bus.bodies` | [contracts 패키지](../packages/contracts.md) | `EventBody` |
| import | `packages.contracts.gitops` | [contracts 패키지](../packages/contracts.md) | GitHub env 상수, `ManifestArtifactStatus` |
| import | `packages.contracts.security`, `packages.security` | [security 패키지](../packages/security.md) | `SecretRef`, `SecretNotFound`, `build_token_vault` — GitHub 토큰 로드 |
| import | `packages.contracts.stores` | [contracts 패키지](../packages/contracts.md) | `RepoChangeStore` (ctx.db 능력) |
| import | `packages.runtime.app` | [runtime 패키지](../packages/runtime.md) | `App`, `EventContext` |
| 구독 | `git.changed` | [git-pull-worker](gitops-git-pull-worker.md) 등 발행 | 입력 이벤트 |
| 발행 | `manifest.rendered`, `manifest.invalid` | [diff-worker](gitops-diff-worker.md), [workflow-controller](gitops-workflow-controller.md) 소비 | 출력 이벤트 |
| 외부 | git CLI (`git clone --bare` / `fetch` / `cat-file` / `show` / `archive`) | — | checkout cache·로컬 repo에서 manifest 소스 로드 |
| 외부 | GitHub Contents API (`GET {api_base}/repos/{repo}/contents/{path}?ref={sha}`) | — | remote manifest 소스 로드 (`Accept: application/vnd.github.raw`) |
| 외부 | `kubectl kustomize`, `helm template` / `helm dependency build` | — | kustomize/helm 렌더 |

## 공개 인터페이스 (Public API)

### 앱과 상수 — `src/services/gitops/manifest-render-worker/app.py`

| 심볼 | 값/시그니처 | 앵커 |
|---|---|---|
| `app` | `App("manifest-render-worker")` | `src/services/gitops/manifest-render-worker/app.py :: app` |
| `MANIFEST_KIND` | `"Deployment"` | `src/services/gitops/manifest-render-worker/app.py :: MANIFEST_KIND` |
| `METADATA_FIELD` / `SPEC_FIELD` / `TEMPLATE_FIELD` / `CONTAINERS_FIELD` | `"metadata"` / `"spec"` / `"template"` / `"containers"` | `src/services/gitops/manifest-render-worker/app.py :: METADATA_FIELD` |
| `DEFAULT_NAMESPACED_KINDS` | 네임스페이스 기본값을 부여할 kind 집합: `ConfigMap, CronJob, DaemonSet, Deployment, HorizontalPodAutoscaler, Ingress, Job, Pod, PersistentVolumeClaim, ReplicaSet, Role, RoleBinding, Secret, Service, ServiceAccount, StatefulSet` | `src/services/gitops/manifest-render-worker/app.py :: DEFAULT_NAMESPACED_KINDS` |
| `RENDERER_VERSION` | `"manifest-render-v2"` — artifact 캐시 매칭 키 | `src/services/gitops/manifest-render-worker/app.py :: RENDERER_VERSION` |
| `SOURCE_TYPE_RAW_YAML` / `SOURCE_TYPE_KUSTOMIZE` / `SOURCE_TYPE_HELM` | `"raw-yaml"` / `"kustomize"` / `"helm"` | `src/services/gitops/manifest-render-worker/app.py :: SOURCE_TYPE_RAW_YAML` |
| `SUPPORTED_SOURCE_TYPES` | 위 3종 집합 | `src/services/gitops/manifest-render-worker/app.py :: SUPPORTED_SOURCE_TYPES` |
| `KUSTOMIZATION_FILES` | `("kustomization.yaml", "kustomization.yml", "Kustomization")` | `src/services/gitops/manifest-render-worker/app.py :: KUSTOMIZATION_FILES` |
| `HELM_CHART_FILE` | `"Chart.yaml"` | `src/services/gitops/manifest-render-worker/app.py :: HELM_CHART_FILE` |
| `MANIFEST_EXTENSIONS` | `(".yaml", ".yml", ".json")` | `src/services/gitops/manifest-render-worker/app.py :: MANIFEST_EXTENSIONS` |
| `MAX_RENDER_ERROR_LENGTH` | `2000` — 렌더 오류 메시지 절단 길이 | `src/services/gitops/manifest-render-worker/app.py :: MAX_RENDER_ERROR_LENGTH` |
| `GIT_REPO_PATH_ENV` … `GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV` | 환경변수 이름 상수 — [설정](#설정-settings) 표 참조 | `src/services/gitops/manifest-render-worker/app.py :: GIT_REPO_PATH_ENV` |
| `DEFAULT_GITHUB_MANIFEST_TIMEOUT_SECONDS` / `DEFAULT_GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS` | `"5"` / `"5"` | `src/services/gitops/manifest-render-worker/app.py :: DEFAULT_GITHUB_MANIFEST_TIMEOUT_SECONDS` |
| `DEFAULT_GIT_CACHE_DIR` | `"/tmp/gitops-repo-cache"` | `src/services/gitops/manifest-render-worker/app.py :: DEFAULT_GIT_CACHE_DIR` |
| `TRUTHY_VALUES` | `{"1", "true", "yes", "on"}` | `src/services/gitops/manifest-render-worker/app.py :: TRUTHY_VALUES` |
| `SOURCE_MODE_AUTO` / `SOURCE_MODE_REMOTE` / `SOURCE_MODE_LOCAL` | `"auto"` / `"remote"` / `"local"` | `src/services/gitops/manifest-render-worker/app.py :: SOURCE_MODE_AUTO` |
| `MANIFEST_SOURCE_UNAVAILABLE_REASON` | `"manifest source unavailable"` | `src/services/gitops/manifest-render-worker/app.py :: MANIFEST_SOURCE_UNAVAILABLE_REASON` |

### 예외·데이터클래스 — `app.py`

```python
class ManifestSourceError(Exception): ...   # manifest 소스가 개념상 존재하지만 로드 불가

@dataclass(frozen=True)
class RenderSource:
    source_type: str
    manifest_path: str
    origin: str
    local_path: Path | None = None
    source_text: str | None = None

@dataclass(frozen=True)
class RenderResult:
    rendered_manifests: list[RenderedManifest]
    source_type: str
    source_origin: str

@dataclass(frozen=True)
class CachedRenderedManifest:
    rendered: RenderedManifest
    artifact_id: str
```

앵커: `src/services/gitops/manifest-render-worker/app.py :: ManifestSourceError`, `:: RenderSource`, `:: RenderResult`, `:: CachedRenderedManifest`

### 설정 판독 함수 — `app.py`

```python
def env_truthy(name: str, default: str = "") -> bool
def manifest_source_mode() -> str          # auto|remote|local, 그 외 값이면 ManifestSourceError
def remote_manifest_enabled() -> bool      # GIT_REMOTE_MANIFEST_ENABLED truthy
def checkout_cache_enabled() -> bool       # GIT_CHECKOUT_CACHE_ENABLED truthy
def checkout_cache_required() -> bool      # GIT_CHECKOUT_CACHE_REQUIRED truthy
def local_manifest_enabled(mode: str) -> bool
def env_int(name: str, default: str = "0") -> int   # 음수는 0 으로, 파싱 실패 시 default
def git_timeout_seconds() -> float
def manifest_path_for(evt: GitChangedBody) -> str   # env GIT_MANIFEST_PATH 우선, 없으면 evt.manifest_path
def github_token() -> str
def github_auth_header() -> str | None     # "Authorization: Bearer <token>" 또는 None
def repo_remote_url(repo_ref: str) -> str
def source_type_override() -> str | None   # GIT_MANIFEST_SOURCE_TYPE; 미지원 값이면 ManifestSourceError
def kubectl_bin() -> str
def helm_bin() -> str
def render_namespace() -> str              # GITOPS_HELM_NAMESPACE, 기본 Sandbox.NAMESPACE("sandbox")
```

앵커: `src/services/gitops/manifest-render-worker/app.py :: env_truthy` 외 각 함수명 동일.

`local_manifest_enabled(mode)` 규칙: `local` 모드 → True, `remote` 모드 → False, `auto` 모드 → `GIT_LOCAL_MANIFEST_ENABLED` truthy면 True, 아니면 `not remote_manifest_enabled()` (remote source가 꺼진 auto 모드에서만 local fallback 허용).

`github_token()` 규칙: `GITHUB_TOKEN_REF`가 설정돼 있으면 `build_token_vault().read_token(SecretRef(token_ref))`, 아니면 `build_token_vault("env").read_token(SecretRef("GITHUB_TOKEN"))` — 후자에서 `SecretNotFound`면 `""` 반환.

`repo_remote_url(repo_ref)` 규칙: `GIT_CACHE_REMOTE_URL` 설정 시 그 값. 아니면 repo_ref가 URL(`://` 포함)이나 `git@` 시작이면 그대로, `owner/name` 축약이면 `{GITHUB_WEB_BASE}/{repo_ref}.git`.

### 소스 로드 — `app.py`

```python
def detect_source_type(path: Path, override: str | None) -> str
def render_source_from_path(path: Path, manifest_path: str, origin: str) -> RenderSource
def render_source_from_text(source: str, manifest_path: str, origin: str) -> RenderSource
def read_checkout_cache_manifest_source(evt: GitChangedBody, manifest_path: str) -> str | None
def export_checkout_cache_manifest_path(evt: GitChangedBody, manifest_path: str, destination: Path) -> Path | None
def github_contents_url(repo_ref: str, commit_sha: str, manifest_path: str) -> str
def read_github_manifest_source(repo_ref: str, commit_sha: str, manifest_path: str) -> str | None
def read_local_manifest_source(evt: GitChangedBody, manifest_path: str) -> str | None
def export_local_git_path(repo_path: str, commit_sha: str, manifest_path: str, destination: Path) -> Path

@contextmanager
def manifest_render_source(evt: GitChangedBody) -> Any   # RenderSource | None yield
def read_manifest_source(evt: GitChangedBody) -> str | None
```

앵커: `src/services/gitops/manifest-render-worker/app.py :: detect_source_type` 외 각 함수명 동일.

- `detect_source_type`: override가 있으면 그대로. path가 디렉터리이고 `Chart.yaml` 존재 → `helm`, kustomization 파일 존재 → `kustomize`, 그 외 → `raw-yaml`.
- `render_source_from_text`: override가 `raw-yaml` 이외이면 `ManifestSourceError` ("`{override}` rendering requires a checked-out repo path...").
- `read_github_manifest_source`: `GIT_REMOTE_MANIFEST_ENABLED`이 꺼져 있거나 repo_ref/commit_sha/manifest_path 중 하나라도 비면 None. 헤더 `Accept: application/vnd.github.raw`(+토큰 있으면 `Authorization: Bearer`). HTTP/URL/Timeout 오류 시 `GIT_REMOTE_MANIFEST_REQUIRED`(기본 truthy `"1"`)면 `ManifestSourceError`, 아니면 None. 토큰 로드에서 `SecretNotFound`면 `ManifestSourceError`.
- `read_local_manifest_source`: `GIT_REPO_PATH` 설정 시 `git -C {repo} show {sha}:{path}` (check=True, timeout=`GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS`). 미설정 시 `manifest_path`를 파일시스템 경로로 읽고, 없으면 None.
- `export_local_git_path`: `git -C {repo} archive --format=tar {sha} {path}` 출력 tar를 `extract_git_archive`로 풀어 경로 반환.
- `manifest_render_source` 우선순위 (mode ≠ `local`일 때): ① checkout cache export (`origin="git_cache"`) → ② GitHub Contents (`origin="github_contents"`). 그 후 `local_manifest_enabled(mode)`이면 ③ `GIT_REPO_PATH` git archive (`origin="git_repo_path"`) → ④ 파일시스템 경로 (`origin="local_path"`). 모두 실패 시 None yield.
- `read_checkout_cache_manifest_source` / `export_checkout_cache_manifest_path`: `GIT_CHECKOUT_CACHE_ENABLED` truthy이고 remote_url이 결정될 때만 `GitRepoCache` 사용. `GitRepoCacheError` 발생 시 `GIT_CHECKOUT_CACHE_REQUIRED` truthy면 재던짐, 아니면 None.

### 렌더링 — `app.py`

```python
def parse_rendered_manifest_source(source: str) -> list[RenderedManifest]
def load_manifest_documents(source: str) -> list[Any]        # JSON 우선, 실패 시 yaml.safe_load_all; YAML 오류는 ValueError
def render_source_documents(source: RenderSource) -> list[Any]
def load_raw_yaml_documents(source: RenderSource) -> list[Any]
def render_kustomize(source: RenderSource) -> str            # `kubectl kustomize <dir>`
def render_helm(source: RenderSource) -> str                 # `helm template <release> <dir> --namespace <ns> [--include-crds] [--values ...]`
def helm_release_name(source: RenderSource) -> str
def helm_values_args(chart_path: Path) -> list[str]
def safe_child_path(root: Path, raw_path: str) -> Path       # chart 디렉터리 탈출 시 ManifestSourceError
def run_render_command(command: list[str], error_prefix: str) -> str
def compact_render_error(message: str) -> str                # 공백 압축 + 토큰 <redacted> 치환 + 2000자 절단
def render_manifest_payload(payload: dict[str, Any]) -> RenderedManifest
def default_namespace_for_kind(kind: str) -> str             # DEFAULT_NAMESPACED_KINDS 에 있으면 "sandbox", 아니면 ""
def manifest_artifact_digest(payload: dict[str, Any]) -> str # "sha256:<hex>" — sort_keys 정규화 JSON 해시
def rendered_spec_from_payload(kind: str, payload: dict[str, Any]) -> RenderedSpec
def deployment_replicas(spec: dict[str, Any]) -> int
def deployment_image(spec: dict[str, Any]) -> str
def build_rendered_manifests_from_git_change(evt: GitChangedBody) -> list[RenderedManifest]
def build_rendered_manifest_result(evt: GitChangedBody) -> RenderResult
def parse_rendered_manifest_source_documents(source: RenderSource) -> list[RenderedManifest]
def parse_rendered_manifest_payloads(payloads: list[Any]) -> list[RenderedManifest]
def rendered_resource_suffix(rendered: RenderedManifest) -> str   # "<kind소문자>/<name>"
def artifact_manifest_path(evt: GitChangedBody, rendered: RenderedManifest | None) -> str  # "<path>#<kind>/<name>"
def artifact_payload(evt, status, rendered=None, reason=None, source=None) -> dict[str, object]
async def cached_rendered_manifests(evt: GitChangedBody, db: RepoChangeStore, manifest_path: str) -> list[CachedRenderedManifest]
```

앵커: `src/services/gitops/manifest-render-worker/app.py :: parse_rendered_manifest_source` 외 각 함수명 동일.

- `render_helm`: `GITOPS_HELM_DEPENDENCY_BUILD` truthy면 먼저 `helm dependency build <dir>`. release 이름은 `GITOPS_HELM_RELEASE_NAME` 우선, 없으면 디렉터리 이름을 소문자 영숫자+`-`로 정규화해 53자 절단(빈 값이면 `"release"`). `GITOPS_HELM_INCLUDE_CRDS`(기본 truthy)면 `--include-crds` 추가. `GITOPS_HELM_VALUES_FILES`는 콤마 구분, 각 항목을 `safe_child_path`로 검증 후 `--values` 추가(파일 없으면 `ManifestSourceError`).
- `run_render_command`: `FileNotFoundError`(실행파일 없음), `TimeoutExpired`, `CalledProcessError`, 빈 stdout 모두 `ManifestSourceError`로 변환.
- `render_manifest_payload`: `apiVersion`·`kind`·`metadata.name` 중 하나라도 없으면 `ValueError`. namespace 미지정 시 `default_namespace_for_kind`로 채워 payload에 주입. `spec`은 kind가 `Deployment`일 때만 `replicas`(기본 1, bool/음수/비정수는 `ValueError`)·첫 컨테이너 `image` 추출. `declared_fields`는 `extract_declared_field_paths(payload)`.
- `parse_rendered_manifest_payloads`: dict가 아니거나 빈 문서는 걸러내고, 남는 것이 없으면 `ValueError("manifest source did not contain a Kubernetes object")`.
- `build_rendered_manifest_result`: `manifest_render_source`가 None이면 `ManifestSourceError(MANIFEST_SOURCE_UNAVAILABLE_REASON)`.
- `cached_rendered_manifests`: `db.find_rendered_manifest_artifacts(workspace_id, binding_id, commit_sha, manifest_path, RENDERER_VERSION)` 결과 중 `manifest_path`가 정확히 일치하거나 `"{manifest_path}#"` 프리픽스이고 `source_summary.renderer_version == RENDERER_VERSION`인 것만 `RenderedManifest.from_body`로 복원.

### 이벤트 핸들러 — `app.py`

```python
@app.on(GitChangedBody)
async def on_git_changed(evt: GitChangedBody, ctx: EventContext[RepoChangeStore]) -> AsyncIterator[EventBody]
```

앵커: `src/services/gitops/manifest-render-worker/app.py :: on_git_changed`

### repo_cache 모듈 — `src/services/gitops/manifest-render-worker/repo_cache.py`

```python
class GitRepoCacheError(RuntimeError): ...   # 로컬 git object cache 가 commit/path 읽기를 처리하지 못할 때

class GitRepoCache:
    def __init__(self, *, cache_dir: str, remote_url: str, timeout_seconds: float,
                 max_bytes: int = 0, max_repos: int = 0, http_extra_header: str | None = None) -> None
    def read_file(self, commit_sha: str, manifest_path: str) -> str
    def export_path(self, commit_sha: str, manifest_path: str, destination: Path) -> Path

def safe_cache_key(value: str) -> str      # [^A-Za-z0-9_.-]+ → "-", 빈 값이면 "repo"
def dir_size(path: Path) -> int
def extract_git_archive(archive: bytes, destination: Path, manifest_path: str) -> Path
```

앵커: `src/services/gitops/manifest-render-worker/repo_cache.py :: GitRepoCacheError`, `:: GitRepoCache`, `:: GitRepoCache.read_file`, `:: GitRepoCache.export_path`, `:: safe_cache_key`, `:: dir_size`, `:: extract_git_archive`

`GitRepoCache` 동작:
- repo는 `{cache_dir}/{safe_cache_key(remote_url)}.git`에 bare clone. 같은 키 `.lock` 파일로 flock(POSIX)/msvcrt(Windows) 배타 잠금.
- `read_file`/`export_path`: 잠금 → eviction → repo 보장(`git clone --bare`) → 커밋 확인(`git cat-file -e {sha}^{commit}`) → 없으면 `git fetch --prune origin` 후 재확인 → 그래도 없으면 `GitRepoCacheError` → `git show {sha}:{path}` 또는 `git archive --format=tar {sha} {path}` → repo mtime touch → eviction.
- eviction: `max_repos` 초과 시 mtime 오래된 repo부터(자기 repo 제외), `max_bytes` 초과 시 총 크기가 한도 이하가 될 때까지 제거. 각 victim은 non-blocking 잠금 획득 성공 시에만 삭제.
- git subprocess 환경변수는 allowlist(`PATH`, `HOME`, `LANG`, `LC_ALL`, proxy 계열, SSL CA 계열)만 상속하고 `GIT_TERMINAL_PROMPT=0` 고정. `http_extra_header`가 있으면 `GIT_CONFIG_COUNT=1` + `http.extraHeader` 주입(토큰 전달용).
- `extract_git_archive`: symlink/hardlink 멤버 또는 destination 밖으로 탈출하는 멤버가 있으면 `GitRepoCacheError`. `tar.extractall(..., filter="data")`. 추출 결과에 `manifest_path`가 없으면 `GitRepoCacheError`.

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `GitChangedBody` | `git.changed` | `commit_sha: str`, `image: str`, `replicas: int`, `workspace_id: str = "default"`, `repository_id: str = ""`, `repo_ref: str = ""`, `branch: str = "main"`, `watch_target_id: str = ""`, `binding_id: str = ""`, `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `manifest_path: str = "deploy.yaml"` | `src/domains/gitops/events.py :: GitChangedBody` |

### 발행 (Publishes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `ManifestRenderedBody` | `manifest.rendered` | `rendered_manifest: RenderedManifest`, `workspace_id`, `repository_id`, `watch_target_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `cluster_id`, `commit_sha: str = ""`, `manifest_path: str = "deploy.yaml"` | `src/domains/gitops/events.py :: ManifestRenderedBody` |
| `ManifestInvalidBody` | `manifest.invalid` | `workspace_id`, `repository_id`, `watch_target_id`, `binding_id`, `commit_sha`, `manifest_path`, `reason: str`, `application_id`, `workflow_run_id`, `environment`, `cluster_id` | `src/domains/gitops/events.py :: ManifestInvalidBody` |

`RenderedManifest` 값 객체(`src/domains/gitops/events.py :: RenderedManifest`): `api_version`(wire 이름 `apiVersion`), `kind`, `metadata: RenderedMetadata{name, namespace}`, `spec: RenderedSpec{replicas=0, image=""}`, `resource_class="application"`, `manifest: JsonObject`, `declared_fields: list[str]`, `managed_fields: list[str]`, `ignored_fields: list[str]`, `last_approved_snapshot: JsonObject`, `artifact_digest: str = ""`.

## 데이터 모델 (Data Model)

이 워커는 `ctx.db`(`RepoChangeStore`, `src/packages/contracts/stores.py :: RepoChangeStore`)를 통해 저장한다. 실제 테이블은 [gitops 도메인](../domains/gitops.md)의 `RepoChange`·`ManifestArtifact`·`GitWatchTarget`.

- `save_repo_change(correlation_id, commit_sha, manifest, workspace_id, repository_id, watch_target_id, binding_id, manifest_path)` — 렌더된 객체(dict) 저장.
- `record_manifest_artifact(payload)` — `artifact_payload()`가 만드는 payload:

| 필드 | 값 |
|---|---|
| `workspace_id`/`repository_id`/`watch_target_id`/`binding_id`/`commit_sha` | evt 그대로 |
| `manifest_path` | 성공 시 `"{manifest_path}#{kind소문자}/{name}"`, 실패 시 `manifest_path` |
| `status` | `ManifestArtifactStatus.RENDERED.value`(`"rendered"`) 또는 `INVALID_CONFIG.value`(`"invalid_config"`) |
| `status_reason` | 실패 사유 문자열 또는 None |
| `artifact_digest` | `"sha256:..."` 또는 None |
| `rendered_manifest` | `RenderedManifest.to_body()` 또는 None |
| `source_summary` | `repo_ref`, `branch`, `manifest_path`, `resource`, `source_type`, `source_origin`, `renderer_version="manifest-render-v2"`, `cluster_id`, `application_id`, `workflow_run_id`, `environment` |

- `find_rendered_manifest_artifacts(workspace_id, binding_id, commit_sha, manifest_path, renderer_version)` — 캐시 조회.
- `mark_watch_observed(watch_target_id, commit_sha, workspace_id, repository_id, branch, manifest_path)` — watch target의 `last_seen_commit_sha` 갱신. (구현: `src/domains/gitops/repository.py :: RepoChangeRepository.mark_watch_observed` — `RepoChangeStore` Protocol에는 없지만 실제 리포지토리가 제공)

## 동작 (Behavior)

`on_git_changed(evt, ctx)` 처리 순서:

1. `source_manifest_path = manifest_path_for(evt)` (env `GIT_MANIFEST_PATH` 우선), `event_manifest_path = evt.manifest_path` (발행 이벤트에는 항상 이벤트의 원래 경로 사용).
2. **캐시 경로**: `cached_rendered_manifests(...)`가 비어 있지 않으면 — 각 캐시 항목마다 `save_repo_change` 후 `ManifestRenderedBody` yield → `mark_watch_observed` → 종료. (재렌더·artifact 재기록 없음)
3. **렌더**: `build_rendered_manifest_result(evt)` 호출.
   - `manifest_render_source`로 소스 확보 (우선순위: git_cache → github_contents → git_repo_path → local_path; [소스 로드](#소스-로드--apppy) 참조).
   - `render_source_documents`로 소스 타입별 렌더 후 `parse_rendered_manifest_payloads`로 `RenderedManifest` 목록 생성.
4. **실패 분기**: `subprocess.CalledProcessError | subprocess.TimeoutExpired | GitRepoCacheError | ManifestSourceError | ValueError` 캐치 시 —
   - `record_manifest_artifact(status="invalid_config", reason=str(exc))`.
   - 예외가 `ValueError`(= 소스는 읽었으나 내용이 잘못됨)인 경우에만 `mark_watch_observed` 호출 (소스 로드 실패는 관찰 표시하지 않아 재시도 여지를 남김).
   - `ManifestInvalidBody(reason=...)` yield 후 종료.
5. **성공 분기**: 렌더된 리소스마다 —
   - `save_repo_change(ctx.correlation_id, evt.commit_sha, rendered.manifest or rendered.to_body(), ...)`.
   - `record_manifest_artifact(status="rendered", rendered=..., source=result)`.
   - `ManifestRenderedBody(rendered_manifest=rendered, ...)` yield.
6. 마지막으로 `mark_watch_observed(evt.watch_target_id, evt.commit_sha, ...)`.

## 불변식·오류 (Invariants & Errors)

- **합성 금지**: 소스가 어디에도 없으면 Deployment를 합성하지 않고 `ManifestSourceError("manifest source unavailable")` → `manifest.invalid`.
- **멱등성**: 동일 (workspace, binding, commit, manifest_path, renderer_version) 재처리 시 캐시된 artifact를 그대로 재발행. artifact 자체도 `(workspace_id, binding_id, commit_sha, manifest_path)` upsert.
- **renderer_version 격리**: 캐시 판정은 `source_summary.renderer_version == "manifest-render-v2"`일 때만.
- **비밀 보호**: 렌더 오류 메시지에서 GitHub 토큰을 `<redacted>`로 치환하고 2000자로 절단(`compact_render_error`). git subprocess에는 allowlist 환경변수만 전달, `GIT_TERMINAL_PROMPT=0`.
- **경로 안전**: helm values 파일은 chart 디렉터리 밖이면 거부(`safe_child_path`). git archive 추출은 링크·경로 탈출 멤버 거부(`extract_git_archive`).
- **watch 관찰 표시 규칙**: 렌더 성공 또는 `ValueError`(내용 오류)일 때만 `mark_watch_observed`. 인프라성 실패(소스 로드 불가 등)는 관찰 표시하지 않음.
- 예외 → 이벤트 매핑: 렌더 경로의 `CalledProcessError`/`TimeoutExpired`/`GitRepoCacheError`/`ManifestSourceError`/`ValueError`는 모두 `manifest.invalid`. 그 외 예외는 핸들러 밖(런타임)으로 전파.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `GIT_REPO_PATH` | str | `""` | 로컬 git repo 경로. 설정 시 `git -C` show/archive로 소스 로드 |
| `GIT_MANIFEST_PATH` | str | (이벤트의 `manifest_path`) | manifest 경로 override |
| `GIT_MANIFEST_SOURCE_TYPE` | str | `""` (자동 감지) | `raw-yaml` \| `kustomize` \| `helm` 강제 |
| `GIT_MANIFEST_SOURCE_MODE` | str | `auto` | `auto` \| `remote` \| `local` — 소스 탐색 모드 |
| `GIT_LOCAL_MANIFEST_ENABLED` | bool(truthy) | falsy | auto 모드에서 local fallback 강제 허용 |
| `GIT_CHECKOUT_CACHE_ENABLED` | bool(truthy) | falsy | GitRepoCache(bare clone 캐시) 사용 |
| `GIT_CHECKOUT_CACHE_REQUIRED` | bool(truthy) | falsy | 캐시 실패를 치명 오류로 승격 |
| `GIT_CACHE_DIR` | str | `/tmp/gitops-repo-cache` | bare clone 캐시 디렉터리 |
| `GIT_CACHE_REMOTE_URL` | str | `""` | clone remote URL override |
| `GIT_CACHE_MAX_BYTES` | int | `0` (무제한) | 캐시 총 바이트 상한(eviction) |
| `GIT_CACHE_MAX_REPOS` | int | `0` (무제한) | 캐시 repo 개수 상한(eviction) |
| `GIT_REMOTE_MANIFEST_ENABLED` | bool(truthy) | falsy | GitHub Contents API 소스 사용 |
| `GIT_REMOTE_MANIFEST_REQUIRED` | bool(truthy) | `"1"` (truthy) | Contents API 실패를 치명 오류로 처리 |
| `GITOPS_KUBECTL_BIN` | str | `kubectl` | kustomize 렌더 바이너리 |
| `GITOPS_HELM_BIN` | str | `helm` | helm 렌더 바이너리 |
| `GITOPS_HELM_RELEASE_NAME` | str | `""` (chart 디렉터리명 기반 자동) | `helm template` release 이름 |
| `GITOPS_HELM_NAMESPACE` | str | `sandbox` (`Sandbox.NAMESPACE`) | `helm template --namespace` |
| `GITOPS_HELM_VALUES_FILES` | str(콤마 구분) | `""` | chart 내 values 파일 목록 |
| `GITOPS_HELM_INCLUDE_CRDS` | bool(truthy) | `"1"` (truthy) | `--include-crds` 부여 |
| `GITOPS_HELM_DEPENDENCY_BUILD` | bool(truthy) | falsy | 렌더 전 `helm dependency build` 수행 |
| `GITHUB_MANIFEST_TIMEOUT_SECONDS` | float(str) | `"5"` | Contents API 타임아웃 |
| `GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS` | float(str) | `"5"` | git/kubectl/helm subprocess 타임아웃 |
| `GITHUB_TOKEN_REF` | str(secret ref) | `""` | GitHub 토큰 secret ref (우선) |
| `GITHUB_TOKEN` | str | — | env 토큰 fallback |
| `GITHUB_API_BASE` | str | `https://api.github.com` | Contents API base |
| `GITHUB_WEB_BASE` | str | `https://github.com` | `owner/name` → clone URL 조립용 웹 호스트 |
