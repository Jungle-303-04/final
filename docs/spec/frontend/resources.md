---
source_commit: c8d21d6d
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
| import | `@/shared/lib/api`(`get/post`), `@/shared/lib/ui-store`, `@/shared/lib/query`(`queryClient`), `@/shared/lib/types`(`CatalogItem`), `@/shared/ui`, `@/shared/motion` | [shared](shared.md) | API·UI |
| import | `@/features/repo/api`(`useCreateApplication`, `useRepositoryProbe`, `useRepositoryBranches`, `useRepositoryManifestCandidates`, `useRepositoryManifestValidation`), `@/features/cluster/api`(`useClusters`) | [repo](./repo.md), [cluster](./cluster.md) | 레포 연결 위저드 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| import ← | [cluster](./cluster.md), [repo](./repo.md) | — | 위저드 소비자 |
| 백엔드 | `/catalog/*`, `/providers/*`, `/targets`, `/clusters/:id/connection-status` | [api-gateway](../services/gateway-api-gateway.md) | Bruno 02-target-admin 흐름과 동일 API 순서 |

## 공개 인터페이스 (Public API)

### `frontend/src/features/resources/CatalogView.tsx :: CatalogView` (default export)

- 라우트: `/catalog`.
- 데이터: 인라인 `useQuery({ queryKey: ['catalog'], queryFn: get('/catalog/items'), select: d => d.items })`; 설치는 `useMutation(POST /catalog/items/${id}/installs, body {})` — 성공 시 toast ok `'설치를 요청했습니다 — 진행 상황은 워크플로우에 표시됩니다'`, 실패 시 danger `'설치 요청 실패 — <message>'`.
- 트리: `PageHeader('카탈로그', sub='설치 요청은 워크플로우 run 으로 실행됩니다')` → `QueryBoundary` → 항목 0개면 `Card > EmptyState(IconFile, '설치 가능한 항목이 없습니다', '카탈로그 항목이 등록되면 여기에서 설치를 요청할 수 있습니다')`; 항목이 있으면 카드 그리드(`repeat(auto-fill, minmax(260px, 1fr))`) → `Stagger` 로 항목별 `Card(title=name, actions=설치 primary sm 버튼)`: description + category.
- 설치 버튼은 클릭한 카드만 `loading={install.isPending && install.variables === item_id}` 로 표시하고, 다른 카드 버튼은 같은 mutation 이 pending 인 동안 disabled 처리한다.

### `frontend/src/features/resources/RegisterClusterWizard.tsx :: RegisterClusterWizard`

```tsx
export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void })
```

- `Modal(size 'lg', title '클러스터 등록')` + `Stepper(STEPS = ['프로바이더','설정','사전 점검','발급'], current=step)`.
- state: `step`(0~3), `provider`(초기 'existing-k8s', discovery 이후 기본 flow), `deployProvider`(초기 'manual-manifest', flow 변경/초기화 시 `preferredDeployProvider(flow)`), `kubeContext`, `selectedImportKey`, `candidateQuery`, `clusterId`, `name`, `issued: {agent_token; install_manifest; install_command?} | null`, `closeGuard`. (연결 여부는 state 가 아니라 아래 폴링 쿼리에서 파생.)
- API 순서:
  1. **프로바이더**: `useQuery(['providers','cluster-discovery'], GET /providers/cluster-discovery, enabled: open)` — `flows[]` 를 카드 버튼으로 표시하고, flow `status === 'available'` 이면서 `deploy_providers` 중 `status === 'available'` 이 하나 이상 있을 때만 다음 가능. 선택 상태는 `aria-pressed`와 border 색으로 표시한다. 카드에는 실제 `cloud_provider`, 후보 수, 사용 가능한 설치 경로 수만 표시한다. flow 의 `import_candidates[]` 는 `SearchInput` + 카드 버튼으로 표시하며 `clusterImportCandidateMatches()`가 `cluster_id/name/source/cloud_provider/deploy_provider/kube_context/external_handle/console_url/labels`를 검색한다. 후보 선택 시 `clusterId`, `name`, `deployProvider`, `kubeContext` 를 채우고, "직접 입력"은 선택 후보와 kube context를 해제한다.
  2. **설정**: `cluster_id` 입력 — slug 검증 `/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/`(실패 시 error `'소문자·숫자·하이픈만 가능합니다'`, 다음 disabled, `data-testid="cluster-id"`) + 표시 이름 + 설치 방식(`deployProvider`). 설치 방식은 select가 아니라 버튼 목록으로 표시하고 `aria-pressed`로 선택 상태를 나타내며, `status !== 'available'` 항목은 disabled 처리하고 `unavailable_reason` 을 경고문으로 보여준다. `deployProvider === 'kube-context'` 이면 kube context select 를 추가로 표시한다. `KeyValue([프로바이더], [설치 방식], [환경 selectedCandidate.labels.environment/env 또는 '서버 기본 정책'], [관측 스택 'prometheus/loki/tempo target service'])`.
     "사전 점검" → `useMutation(POST /targets/preflight)` body `{cluster_id, cloud_provider, deploy_provider, apply, kube_context?}`. 성공 시 step 2로 이동.
  3. **사전 점검**: `TargetPreflightResponse(valid, duplicate_cluster_id, provider_ready, agent_install_status, connection_status, errors, warnings, selected, ...)` 를 보여준다. `cluster_id`, 프로바이더, 에이전트, 중복, kube context 허용 여부는 `cluster-registration-check` 행으로 고정 폭 표시하고, 오류/경고는 응답 문자열 그대로 표시한다. "다시 점검"은 같은 preflight 를 재실행하고, `valid` 일 때만 "등록 실행" 버튼이 열린다.
     "등록 실행" → `useMutation(POST /targets)` body:
     ```json
     { "cluster_id", "name": name || clusterId, "environment": "<선택 후보 label 에 environment/env 가 있을 때만>",
       "cloud_provider": provider, "deploy_provider": deployProvider, "kube_context": "<선택 시>" }
     ```
     관리 API 공개 URL은 프론트가 브라우저 origin 으로 합성하지 않는다. 백엔드가 `PUBLIC_MANAGEMENT_BASE_URL` → `PUBLIC_API_BASE_URL` → `PUBLIC_BASE_URL` 순서로 실제 agent 접속 URL을 정규화하고, 없으면 preflight/register 단계에서 실패시킨다.
     성공 시 `issued` 저장 + `queryClient.invalidateQueries(['clusters'])`. 실패 시 에러 메시지를 danger 로 표시.
  4. **발급**: `Badge ok '등록 완료'` + 경고 "agent token 은 지금 한 번만 표시됩니다. 저장소·상태에 보관하지 않습니다." + agent token readonly input(mono, `data-testid="agent-token"`, 복사 버튼).
     - 응답에 `install_command`(원라인 인스톨러 — `curl -fsSL …/api/install/<token> | kubectl apply -f -`)가 있으면 "원라인 설치" readonly input(`data-testid="install-command"`, 복사 버튼)을 먼저 보여주고, install manifest `CodeBlock` 은 "수동 적용 대안" 라벨로 강등. 없으면 기존처럼 manifest 가 주 경로.
     - **연결 상태 자동 폴링**: `useQuery(['cluster-conn', clusterId], GET /clusters/${clusterId}/connection-status, enabled: step===3 && !!issued, refetchInterval: connected 면 false, 아니면 5000)`. `connected` 파생값이 true 면 `Badge ok 'connected — 에이전트 연결 완료'`, 아니면 `Badge warn '연결 대기 중… (<status>)'` + "지금 확인" 수동 refetch 버튼 + 안내문(kubectl apply 후 보통 30초~1분 내 connected, 5초 간격 자동 확인).
     - 미연결 상태에서 처음 닫기를 시도하면 `closeGuard` 경고를 먼저 보여준다. 한 번 더 닫거나 "완료"를 누르면 reset.
- `reset()`: 모든 state 초기화 후 `onClose()`. 내부 `Footer` 서브컴포넌트(`{onPrev?; onNext; nextLabel?='다음'; nextDisabled?; loading?}`, `data-testid="wizard-next"`).

### `frontend/src/features/resources/ConnectRepoWizard.tsx :: ConnectRepoWizard`

```tsx
export function ConnectRepoWizard({ open, onClose }: { open: boolean; onClose: () => void })
```

- `Modal(size 'lg', title '레포 연결')` + `Stepper(['레포','배포 대상','확인'])`.
- state: `step`, `repoRef`, `branch`(초기 빈 값, probe/branch 응답의 default branch 로 자동 선택), `manifestSelection`(선택값은 `${source_type}:${path}`), `clusterId`.
- 검증: `refOk = /^([\w.-]+\/[\w.-]+|https?:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+|git@[^:\s]+:[^/\s]+\/[^/\s]+(?:\.git)?)$/.test(repoRef.trim())`(실패 시 error `'owner/name 또는 GitHub URL 형식이어야 합니다'`, 다음 disabled). 앱 이름은 `normalized_repo_ref.split('/')[1]`.
- 단계:
  1. repo_ref 입력 → `useRepositoryProbe(POST /repositories/discovery/probe)` 로 `normalized_repo_ref`/default branch/reachability 를 확인한다. reachable 이면 `useRepositoryBranches(GET /repositories/discovery/branches?repo_ref=...)` 로 브랜치 select 를 채우고, 선택 branch 기준 `useRepositoryManifestCandidates(GET /repositories/discovery/manifests?repo_ref=...&branch=...)` 로 manifest 후보 select 를 채운다. 후보 value/key 는 `${source_type}:${path}` 이므로 같은 path 가 raw/kustomize/helm 등 여러 source type 으로 잡혀도 선택이 보존된다. 선택된 후보는 `useRepositoryManifestValidation(POST /repositories/discovery/validate)` body `{repo_ref, branch, manifest_path, source_type}` 로 검증하고, `valid` 일 때만 다음 가능(다음 클릭 시 첫 클러스터로 `clusterId` 초기화).
  2. 대상 클러스터 select(`useClusters`). 클러스터가 없으면 admin 은 "먼저 클러스터를 등록" 안내와 `pathFor('/clusters')` 링크를 보고, non-admin 은 관리자에게 클러스터 접근 권한을 요청하라는 안내만 본다.
  3. `KeyValue`(앱 이름/레포 `@branch`/manifest/클러스터/네임스페이스/환경) + 안내 "등록 후 webhook/poller 가 첫 커밋을 감지하면 run 이 생성됩니다." → "연결": `useCreateApplication().mutate({name, repo_ref, branch, manifest_path, source_type, cluster_id, namespace, environment})`([repo](./repo.md) 의 `CreateApplicationInput` — 내부적으로 `POST /applications/connect` 1회 호출) — `namespace`는 validation resources 중 첫 non-empty namespace, `environment`는 선택 클러스터 environment 를 사용하며 없으면 보내지 않는다. 성공 시 `onClose()` 후 `nav(pathFor('/repos/${application_id}'))`, 실패 시 에러 메시지를 danger 로 표시.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/catalog` | `CatalogView` | `RequireSession`+`ConsoleLayout` | 카탈로그 설치 요청 |
| (모달) | `RegisterClusterWizard` | 호출 화면(`/clusters`)의 가드 | 4단계 등록 플로우 |
| (모달) | `ConnectRepoWizard` | 호출 화면(`/repos`)의 가드 | 3단계 연결 플로우 |

## 불변식·오류 (Invariants & Errors)

- 클러스터 등록 API 호출 순서는 provider cluster-discovery → target preflight → targets → connection-status 로 고정(Bruno 02-target-admin 과 동일). connection-status 는 수동 버튼이 아니라 발급 단계 진입 시 5초 간격 자동 폴링(connected/online 되면 중단).
- 클러스터 등록은 unavailable deploy provider 를 기본 선택하지 않는다. flow 의 기본 deploy provider 가 unavailable 이면 첫 available 항목으로 대체하고, available deploy provider 가 없으면 provider 단계에서 다음으로 진행하지 않는다.
- 레포 연결 API 호출 순서는 repository probe → branches → manifest candidates → manifest validate → applications/connect 로 고정한다.
- manifest 후보 선택값은 `source_type:path` 조합이다. connect API 제출에는 `manifest_path` 와 선택 후보의 `source_type`, 선택된 클러스터, validation resource 에서 얻은 namespace(있을 때), 클러스터 environment(있을 때)를 함께 보내며, 서버는 이를 재검증한 뒤 application metadata, deployment binding deploy_policy, git watch target settings 에 보존한다.
- provider cluster-discovery 와 target 등록/preflight 는 admin 세션 라우트다. 클러스터 등록 위저드 진입 CTA 는 admin 화면에서만 노출한다.
- agent token 과 `install_command` 는 발급 응답에서만 표시하고 어디에도 저장하지 않는다(위저드 닫으면 소실).
- `cluster_id` 는 소문자 slug, `repo_ref` 는 `owner/name` 또는 Git URL 형식을 클라이언트에서 선검증한다.
- 등록 성공 시 `['clusters']` invalidate — 목록 화면이 즉시 갱신된다.
