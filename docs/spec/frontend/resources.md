---
source_commit: 1960ed83
status: synced
---

# features/resources — 카탈로그·클러스터 등록/레포 연결 위저드

> 소스: `frontend/src/features/resources/`

## 책임 (Responsibility)

- 카탈로그 화면(`/catalog`)과 리소스 온보딩 위저드 2종: 클러스터 등록(`RegisterClusterWizard`), 레포 연결(`ConnectRepoWizard`).
- 위저드는 모달 컴포넌트로 export 되어 [cluster/ClusterListView](./cluster.md)·[repo/RepoListView](./repo.md) 가 소유한 open state 로 띄운다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get/post`), `@/shared/lib/types`(`CatalogItem`), `@/ui` 프리미티브 | [shared](shared.md) | API·UI |
| import | `@/features/repo/api`(`useCreateApplication`, `useRepositoryProbe`, `useRepositoryBranches`, `useRepositoryManifestCandidates`, `useRepositoryManifestValidation`), `@/features/cluster/api`(`useClusters`) | [repo](./repo.md), [cluster](./cluster.md) | 레포 연결 위저드 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| import ← | [cluster](./cluster.md), [repo](./repo.md) | — | 위저드 소비자 |
| 백엔드 | `/catalog/*`, `/providers/*`, `/targets`, `/clusters/:id/connection-status` | [api-gateway](../services/gateway-api-gateway.md) | Bruno 02-target-admin 흐름과 동일 API 순서 |

## 공개 인터페이스 (Public API)

### `frontend/src/features/resources/CatalogView.tsx :: CatalogView` (default export)

- 라우트: `/catalog`.
- 데이터: 인라인 `useQuery({ queryKey: ['catalog'], queryFn: get('/catalog/items', {timeoutMs: 8_000}), retry:false, select: d => d.items })`; 설치는 `useMutation(POST /catalog/items/${id}/installs, body {})` — 성공 시 toast ok `'설치를 요청했습니다 — 진행 상황은 워크플로우에 표시됩니다'`, 실패 시 danger `'설치 요청 실패 — <message>'`.
- 트리: `PageHeader('카탈로그')` → `QueryBoundary` → 항목 0개면 `Card > EmptyState(IconFile, '설치 가능한 항목이 없습니다')`; 항목이 있으면 카드 그리드(`repeat(auto-fill, minmax(260px, 1fr))`) → `Stagger` 로 항목별 `Card(title=name, actions=설치 primary sm 버튼)`: description + category.
- 설치 버튼은 클릭한 카드만 `loading={install.isPending && install.variables === item_id}` 로 표시하고, 다른 카드 버튼은 같은 mutation 이 pending 인 동안 disabled 처리한다.

### `frontend/src/features/resources/RegisterClusterWizard.tsx :: RegisterClusterWizard`

```tsx
export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void })
```

- `Modal(title '클러스터 등록')` + `StepRail(입력/검증/설치/연결)` 로 진행 상태를 표시한다.
- state: `provider`(`eks|gke|aks|existing-k8s|local`), `localProvider`(`kind|minikube`), 공통/ provider별 `form`, `advancedOpen`, `issued: TargetInstallResponse | null`, `closeGuard`. 연결 여부는 `GET /clusters/:id/connection-status` 쿼리에서 파생한다.
- 지원 provider와 필수 필드:
  - EKS: `region`, `eks_cluster_name`, `context_alias`(기본 `cluster_id`)
  - GKE: `project_id`, `location_type`, `location`, `gke_cluster_name`, `context_alias`
  - AKS: `resource_group`, `aks_cluster_name`, `context_alias`
  - Existing Kubernetes: `context_name`
  - kind: `kind_cluster_name` → context `kind-<name>`
  - minikube: `profile` → context `<profile>`
- `cluster_id`는 `/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/` 로 클라이언트 선검증한다. provider 필드는 빈 값과 공백 문자를 거부한다. 필수값이 유효해야 `확인` 버튼이 활성화된다.
- API 순서:
  1. `GET /providers/cluster-discovery` — 카드 상태/서버 지원 여부 표시. 실패 시 `Card` error + 재시도.
  2. `POST /targets/preflight` — body `{cluster_id,name,environment,cloud_provider,deploy_provider:'manual-manifest',apply:false,provider_config,management_base_url?}`. `valid`일 때만 다음 mutation을 실행한다.
  3. `POST /targets` — 같은 body. 성공 시 `issued` 저장, `['clusters']` invalidate, 설치 단계로 전환.
  4. 설치 단계: 응답의 `bootstrap_steps`를 우선 `CodeBlock`으로 표시하고, 없으면 `bootstrap_command`, `install_command`, `install_manifest` 순서로 fallback한다. 명령에는 agent token이 포함되므로 자격증명 경고를 고정 표시한다.
  5. 연결 단계: `GET /clusters/${cluster_id}/connection-status`를 5초 간격으로 폴링한다. `connected/online`은 성공, `install_expired/expired`는 만료, `error/failed/disconnected`는 오류로 표시한다.
- expired/error 상태는 `재발급` 버튼을 제공한다. 현재 백엔드 등록 API는 동일 `cluster_id` 재등록 시 agent token 회전을 수행한다.
- 미연결 상태에서 닫기를 시도하면 `ConfirmDialog`로 close guard를 표시한다. agent token은 현재 화면에서만 표시한다.

### `frontend/src/features/resources/ConnectRepoWizard.tsx :: ConnectRepoWizard`

```tsx
export function ConnectRepoWizard({ open, onClose }: { open: boolean; onClose: () => void })
```

- `Modal(title '배포 정의 추가')` + `Stepper(['레포','배포 대상','확인'])`.
- state: `step`, `repoRef`, `branch`(초기 빈 값, probe/branch 응답의 default branch 로 자동 선택), `manifestSelection`(선택값은 `${source_type}:${path}`), `selectedClusterIds`.
- 검증: `refOk = /^([\w.-]+\/[\w.-]+|https?:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+|git@[^:\s]+:[^/\s]+\/[^/\s]+(?:\.git)?)$/.test(repoRef.trim())`(실패 시 error `'owner/name 또는 GitHub URL 형식이어야 합니다'`, 다음 disabled). 앱 이름은 `normalized_repo_ref.split('/')[1]`.
- 단계:
  1. repo_ref 입력 → `useRepositoryProbe(POST /repositories/discovery/probe)` 로 `normalized_repo_ref`/default branch/reachability 를 확인한다. reachable 이면 `useRepositoryBranches(GET /repositories/discovery/branches?repo_ref=...)` 로 브랜치 select 를 채우고, 보호 브랜치는 `보호됨` 접미로 표시한다. 선택 branch 기준 `useRepositoryManifestCandidates(GET /repositories/discovery/manifests?repo_ref=...&branch=...)` 로 manifest 후보 select 를 채운다. 후보 value/key 는 `${source_type}:${path}` 이므로 같은 path 가 raw/kustomize/helm 등 여러 source type 으로 잡혀도 선택이 보존된다. 선택된 후보는 `useRepositoryManifestValidation(POST /repositories/discovery/validate)` body `{repo_ref, branch, manifest_path, source_type}` 로 검증하고, `valid` 일 때만 다음 가능하다.
  2. 배포 대상(`useClusters`). `connection_status in connected/online` 이고 `role !== 'management'` 인 target 클러스터만 선택 가능하다. 미연결 클러스터는 비활성 행 + `에이전트 미연결` 뱃지 + `연결하러 가기` 링크, 관리 클러스터는 비활성 행 + `관리 클러스터` 뱃지를 표시한다. "전체 선택"은 선택 가능한 target 클러스터만 대상으로 한다. 선택 가능한 클러스터가 0개면 리스트 대신 `EmptyState("배포하려면 연결된 클러스터가 필요합니다")`와 admin 전용 중첩 `RegisterClusterWizard` CTA를 렌더하고, 위저드 close 후 클러스터 목록을 refetch한다.
  3. `KeyValue`(앱 이름/레포 `@branch`/manifest/대상 요약/네임스페이스) + 선택 클러스터 뱃지 링크 → "배포 정의 생성": 선택된 각 클러스터마다 `useCreateApplication().mutateAsync({name, repo_ref, branch, manifest_path, source_type, cluster_id, namespace, environment})`([repo](./repo.md) 의 `CreateApplicationInput`)를 순차 호출한다. `namespace`는 validation resources 중 첫 non-empty namespace, 없으면 보내지 않는다. `environment`는 선택 클러스터 environment 를 사용한다. 성공 시 첫 application 상세로 이동하고, 400 `cluster_not_connected`는 danger 인라인 사유로 표시한다.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/catalog` | `CatalogView` | `RequireSession`+`ConsoleLayout` | 카탈로그 설치 요청 |
| (모달) | `RegisterClusterWizard` | 호출 화면(`/clusters`)의 가드 | 4단계 등록 플로우 |
| (모달) | `ConnectRepoWizard` | 호출 화면(`/repos`)의 가드 | 3단계 연결 플로우 |

## 불변식·오류 (Invariants & Errors)

- 클러스터 등록 API 호출 순서는 provider cluster-discovery → target preflight → targets → connection-status 로 고정(Bruno 02-target-admin 과 동일). connection-status 는 수동 버튼이 아니라 발급 단계 진입 시 5초 간격 자동 폴링(connected/online 되면 중단).
- 클러스터 등록은 수동 bootstrap 설치를 기본으로 하며 `deploy_provider`는 `manual-manifest`, `apply`는 `false`로 고정한다. provider별 접속 정보는 `provider_config`에만 담는다.
- 레포 연결 API 호출 순서는 repository probe → branches → manifest candidates → manifest validate → clusters target filtering → applications/connect 로 고정한다.
- manifest 후보 선택값은 `source_type:path` 조합이다. connect API 제출에는 `manifest_path` 와 선택 후보의 `source_type`, 선택된 클러스터, validation resource 에서 얻은 namespace(있을 때), 클러스터 environment(있을 때)를 함께 보내며, 서버는 이를 재검증한 뒤 application metadata, deployment binding deploy_policy, git watch target settings 에 보존한다.
- provider cluster-discovery 와 target 등록/preflight 는 admin 세션 라우트다. 클러스터 등록 위저드 진입 CTA 는 admin 화면에서만 노출한다.
- agent token 과 `install_command` 는 발급 응답에서만 표시하고 어디에도 저장하지 않는다(위저드 닫으면 소실).
- `cluster_id` 는 소문자 slug, `repo_ref` 는 `owner/name` 또는 Git URL 형식을 클라이언트에서 선검증한다.
- 등록 성공 시 `['clusters']` invalidate — 목록 화면이 즉시 갱신된다.
