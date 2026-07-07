---
source_commit: 664925a6
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
| import | `@/features/repo/api`(`useCreateApplication`), `@/features/cluster/api`(`useClusters`) | [repo](./repo.md), [cluster](./cluster.md) | 레포 연결 위저드 |
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
- state: `step`(0~3), `provider`(기본 'existing-k8s'), `deployProvider`(기본 'manual-manifest'), `kubeContext`, `selectedImportKey`, `clusterId`, `name`, `issued: {agent_token; install_manifest; install_command?} | null`, `closeGuard`. (연결 여부는 state 가 아니라 아래 폴링 쿼리에서 파생.)
- API 순서:
  1. **프로바이더**: `useQuery(['providers','cluster-discovery'], GET /providers/cluster-discovery, enabled: open)` — `flows[]` 를 카드로 표시하고, `status === 'available'` 일 때만 다음 가능. flow 의 `import_candidates[]` 는 "환경에서 가져오기" select 로 표시하며 선택 시 `clusterId`, `name`, `deployProvider`, `kubeContext` 를 채운다.
  2. **설정**: `cluster_id` 입력 — slug 검증 `/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/`(실패 시 error `'소문자·숫자·하이픈만 가능합니다'`, 다음 disabled, `data-testid="cluster-id"`) + 표시 이름 + 설치 방식(`deployProvider`). `deployProvider === 'kube-context'` 이면 kube context select 를 추가로 표시한다. `KeyValue([provider], [environment 'sandbox'], [관측 스택 '기본값 (prometheus/loki/tempo .target.svc)'])`.
     "사전 점검" → `useMutation(POST /targets/preflight)` body `{cluster_id, cloud_provider, deploy_provider, apply, kube_context?}`. 성공 시 step 2로 이동.
  3. **사전 점검**: `TargetPreflightResponse(valid, duplicate_cluster_id, provider_ready, agent_install_status, connection_status, errors, warnings, selected, ...)` 를 보여준다. "다시 점검"은 같은 preflight 를 재실행하고, `valid` 일 때만 "등록 실행" 버튼이 열린다.
     "등록 실행" → `useMutation(POST /targets)` body:
     ```json
     { "cluster_id", "name": name || clusterId, "environment": "sandbox", "apply": "<deployProvider === 'kube-context'>",
       "cloud_provider": provider, "deploy_provider": deployProvider, "kube_context": "<선택 시>",
       "management_base_url": "<location.origin>/api" }
     ```
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
- state: `step`, `repoRef`, `branch`(기본 'main'), `manifestPath`(기본 'deploy.yaml'), `clusterId`.
- 검증: `refOk = /^[\w.-]+\/[\w.-]+$/.test(repoRef)`(실패 시 error `'owner/name 형식이어야 합니다'`, 다음 disabled). 앱 이름은 `repoRef.split('/')[1]`.
- 단계:
  1. repo_ref/브랜치/manifest 경로 입력(placeholder `deploy.yaml · k8s/ · kustomization.yaml`) + 지원 형식 안내문(단일 YAML `---` 다중 문서, 디렉터리 하위 .yaml/.yml/.json, `kustomization.yaml`, Helm `Chart.yaml`) → 다음(첫 클러스터로 `clusterId` 초기화).
  2. 대상 클러스터 select(`useClusters`). 클러스터가 없으면 admin 은 "먼저 클러스터를 등록" 안내와 `/clusters` 링크를 보고, non-admin 은 관리자에게 클러스터 접근 권한을 요청하라는 안내만 본다.
  3. `KeyValue`(앱 이름/레포 `@branch`/manifest/클러스터) + 안내 "등록 후 webhook/poller 가 첫 커밋을 감지하면 run 이 생성됩니다." → "연결": `useCreateApplication().mutate({name, repo_ref, branch, manifest_path, cluster_id})`([repo](./repo.md) 의 `CreateApplicationInput` — 내부적으로 앱 생성 + 배포 대상 등록 2단계) — 성공 시 `onClose()` 후 `nav('/repos/${application_id}')`, 실패 시 에러 메시지를 danger 로 표시.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/catalog` | `CatalogView` | `RequireSession`+`ConsoleLayout` | 카탈로그 설치 요청 |
| (모달) | `RegisterClusterWizard` | 호출 화면(`/clusters`)의 가드 | 4단계 등록 플로우 |
| (모달) | `ConnectRepoWizard` | 호출 화면(`/repos`)의 가드 | 3단계 연결 플로우 |

## 불변식·오류 (Invariants & Errors)

- 클러스터 등록 API 호출 순서는 provider cluster-discovery → target preflight → targets → connection-status 로 고정(Bruno 02-target-admin 과 동일). connection-status 는 수동 버튼이 아니라 발급 단계 진입 시 5초 간격 자동 폴링(connected/online 되면 중단).
- provider discovery/validate 와 target 등록/preflight 는 admin 세션 라우트다. 위저드 진입 CTA 는 admin 화면에서만 노출한다.
- agent token 과 `install_command` 는 발급 응답에서만 표시하고 어디에도 저장하지 않는다(위저드 닫으면 소실).
- `cluster_id` 는 소문자 slug, `repo_ref` 는 `owner/name` 형식을 클라이언트에서 선검증한다.
- 등록 성공 시 `['clusters']` invalidate — 목록 화면이 즉시 갱신된다.
