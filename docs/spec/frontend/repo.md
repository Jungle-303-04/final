---
source_commit: f91a4def
status: synced
---

# features/repo — 애플리케이션(레포)·run·배포·승인

> 소스: `frontend/src/features/repo/`

## 책임 (Responsibility)

- 애플리케이션 목록/상세, run 목록(단일 앱·전체 앱), 배포 목록, 승인 grant/reject 훅과 화면.
- `ApprovalCard` 는 repo·workflow·chat·notifications 가 공유하는 **단일 승인 UI 구현**(중복 금지 AC).
- run 데이터 훅(`useRuns`/`useRunsAll`)은 [workflow](./workflow.md)·[notifications](./notifications.md)의 데이터 소스이기도 하다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/adapt`(`adaptApplication`, `adaptDeployment`, `adaptRun`), `@/shared/lib/format`, `@/ui`, `@/ui/motion` | [shared](shared.md) | API·UI |
| import | `@/features/auth/api`(`useSession`) | [auth](./auth.md) | 승인 버튼 활성(`service_admin`, `release_operator`) |
| import | `@/features/resources/ConnectRepoWizard` | [resources](./resources.md) | 목록 화면 위저드 |
| import | `@/features/chat/context`(`encodeChatContext`) | [chat](./chat.md) | GitOps/Safe PR AI 설명 링크 context 직렬화 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| import ← | [workflow](./workflow.md), [chat](./chat.md), [notifications](./notifications.md), [org](./org.md) | — | `useApplications`/`useRuns*`/`ApprovalCard` 소비 |
| 백엔드 | `/applications/*`, `/approvals/*` | [api-gateway](../services/gateway-api-gateway.md) | |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `repoKeys` | `frontend/src/features/repo/api.ts :: repoKeys` | — | `apps() = ['applications']`, `runs(id) = ['applications', id, 'runs']`, `deployments(id) = ['applications', id, 'deployments']`, `probe(repoRef)`, `branches(repoRef)`, `manifests(repoRef, branch)`, `validation(repoRef, branch, manifestPath, sourceType)` |
| `REPO_QUERY_TIMEOUT_MS` | `frontend/src/features/repo/api.ts :: REPO_QUERY_TIMEOUT_MS` | — | `8_000` — 애플리케이션/run/deployment 조회 |
| `REPO_DISCOVERY_TIMEOUT_MS` | `frontend/src/features/repo/api.ts :: REPO_DISCOVERY_TIMEOUT_MS` | — | `15_000` — repository discovery/probe/validation 조회 |
| `useApplications` | `frontend/src/features/repo/api.ts :: useApplications` | GET `/applications` with `{timeoutMs: 8_000}` | 30s, `retry:false`, select `d.applications.map(adaptApplication)` |
| `useApplication` | `frontend/src/features/repo/api.ts :: useApplication` | GET `/applications/${id}` with `{timeoutMs: 8_000}` → `{application: raw}` | 쿼리키 `['applications', id]`, `retry:false`, `select: d => adaptApplication(d.application)` |
| `useRuns` | `frontend/src/features/repo/api.ts :: useRuns` | GET `/applications/${appId}/runs` with `{timeoutMs: 8_000}` | `retry:false`, select `d.runs.map(adaptRun)`. raw run의 optional `promotion_gate`는 백엔드 자동 승격 조건의 구조화된 read model이다. **적응 폴링**: raw runs 중 상태(대문자화)가 ACTIVE 집합에 있으면 10s, 아니면 60s |
| `useRunsAll` | `frontend/src/features/repo/api.ts :: useRunsAll` | 앱별 GET `/applications/${id}/runs` with `{timeoutMs: 8_000}` (useQueries) | `(apps: Application[])` → `combine` 으로 `{ pending; failed; error; items: { appId, runs: adaptRun[] }[] }` 반환. 각 쿼리는 `retry:false`. 활성 run 있으면 10s, 아니면 30s |
| `useDeployments` | `frontend/src/features/repo/api.ts :: useDeployments` | GET `/applications/${appId}/deployments` with `{timeoutMs: 8_000}` | `retry:false`, select `d.deployments.map(adaptDeployment)` |
| `RepositoryProbe` | `frontend/src/features/repo/api.ts :: RepositoryProbe` | — | `{repo_ref, normalized_repo_ref, valid, reachable, default_branch?, private?, html_url?, warnings, errors}` |
| `RepositoryBranch` | `frontend/src/features/repo/api.ts :: RepositoryBranch` | — | `{name, protected, default}` |
| `RepositoryManifestCandidate` | `frontend/src/features/repo/api.ts :: RepositoryManifestCandidate` | — | `{path, source_type, display_name, reason}`. `source_type` 은 raw-yaml/raw-json/kustomize/helm 등 문자열 |
| `RepositoryManifestValidation` | `frontend/src/features/repo/api.ts :: RepositoryManifestValidation` | — | `{repo_ref, branch, manifest_path, valid, status, validation_mode, resource_count, resources[], warnings, errors}` |
| `useRepositoryProbe` | `frontend/src/features/repo/api.ts :: useRepositoryProbe` | POST `/repositories/discovery/probe` body `{repo_ref}` with `{timeoutMs: 15_000}` | 쿼리키 `repoKeys.probe(repoRef)`, `enabled`, `retry:false`, `staleTime:60s` |
| `useRepositoryBranches` | `frontend/src/features/repo/api.ts :: useRepositoryBranches` | GET `/repositories/discovery/branches?repo_ref=...` with `{timeoutMs: 15_000}` | 쿼리키 `repoKeys.branches(repoRef)`, `enabled`, `retry:false`, `staleTime:60s` |
| `useRepositoryManifestCandidates` | `frontend/src/features/repo/api.ts :: useRepositoryManifestCandidates` | GET `/repositories/discovery/manifests?repo_ref=...&branch=...` with `{timeoutMs: 15_000}` | 쿼리키 `repoKeys.manifests(repoRef, branch)`, `enabled`, `retry:false`, `staleTime:30s` |
| `useRepositoryManifestValidation` | `frontend/src/features/repo/api.ts :: useRepositoryManifestValidation` | POST `/repositories/discovery/validate` body `{repo_ref, branch, manifest_path, source_type}` with `{timeoutMs: 15_000}` | 쿼리키 `repoKeys.validation(repoRef, branch, manifestPath, sourceType)`, `enabled`, `retry:false`, `staleTime:30s` |
| `useApproval` | `frontend/src/features/repo/api.ts :: useApproval` | POST `/approvals/${approvalId}/${action}` (`action: 'grant'\|'reject'`) | 성공/실패 `@/ui` toast. 성공 시 `['applications']`·`applications*` predicate·`ai*` predicate invalidate. 실패는 `forbidden`/`invalid` 사유를 한국어로 표시 |
| `CreateApplicationInput` | `frontend/src/features/repo/api.ts :: CreateApplicationInput` | — | `{ name; repo_ref; branch; manifest_path; source_type; cluster_id; namespace?; environment? }` — 레포 연결 위저드 입력 계약 |
| `useCreateApplication` | `frontend/src/features/repo/api.ts :: useCreateApplication` | POST `/applications/connect` body `{name, repo_ref, branch, manifest_path, source_type, cluster_id, namespace?, environment?}` → `{application: raw}` | `(input: CreateApplicationInput)` — 앱과 배포 대상 연결을 서버 재검증 경로에 위임한다. `namespace`와 `environment`는 입력이 있을 때만 보낸다. 반환은 `adaptApplication` 결과에 `branch`/`cluster_id` 를 덮어쓴 값. 성공 시 apps invalidate. [resources/ConnectRepoWizard](./resources.md) 가 사용 |

`ACTIVE`(모듈 상수, 비공개): `{'STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING'}`.

## 컴포넌트

### `frontend/src/features/repo/ApprovalCard.tsx :: ApprovalCard`

```tsx
export function ApprovalCard({ approvalId, summary, resolved, compact }:
  { approvalId: string; summary: string; resolved?: 'granted' | 'rejected'; compact?: boolean })
```

- `resolved` 있으면 `motion.div(fadeInUp)` 안에 `Badge(success|danger)`만 렌더해 승인/거절 확정 배지가 부드럽게 등장한다.
- 아니면 `@/ui` token surface(`rounded-panel`, `border-border`, `bg-bg`)에 `Badge(warning '승인 대기')` + summary + 승인(primary sm)/거절(danger sm) 버튼을 렌더한다. 진행 중엔 둘 다 disabled, 로딩 스피너는 `approval.variables.action` 이 일치하는 버튼에만 표시한다.
- `canDeploy = session.roles includes service_admin|release_operator` — false 면 두 버튼 disabled + Tooltip `'release_operator 권한 필요'`. 서버가 최종 검증한다.
- 클릭 → `useApproval().mutate({ approvalId, action })`.

### `frontend/src/features/repo/RepoListView.tsx :: RepoListView` (default export)

- 라우트: `/repos`. state: `wizard: boolean`.
- 트리: `PageHeader('배포', actions="배포 정의 추가")` → `Card('배포 정의')` → 배포 정의 카드 리스트 → `ConnectRepoWizard`.
- 빈 목록: `EmptyState('배포 정의 없음', 배포 정의 추가 버튼)`.
- 데이터: `useApplications`, `useDeploymentsAll(apps)`, `useClusters`. 카드에는 앱 이름, `repo_ref@branch`, manifest, 최근 run, 마지막 배포, 연결 클러스터 뱃지를 표시한다.
- 연결 클러스터 뱃지는 `/clusters/${cluster_id}` 링크이며, 클러스터 `connection_status`가 connected/online 이면 success, 그 외는 warning tone이다. 카드 자체 클릭은 `/repos/${application_id}`로 이동한다.

### `frontend/src/features/repo/RepoDetailView.tsx :: RepoDetailView` (default export)

- 라우트: `/repos/:applicationId`. 쿼리스트링 `tab`(기본 'runs').
- 데이터: `useApplication`, `useRuns`, `useDeployments`. `safePrRun = runs.find(r => r.safe_pr)`.
- 모듈 상수 `STEP_ORDER`: `['STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING','SUCCEEDED']`.
- 트리:
  ```
  PageHeader(title=app.name, breadcrumb=배포/app.name, actions=manifest 수정/GitHub)
  ├─ description: `repo_ref@branch` + `manifest_path` CodeText
  ├─ Tabs: 실행(count=run 수)/배포 대상(count=deployment 수)/Safe PR(count=0|1)/설정
  ├─ [실행] Card('실행 이력'): loading Skeleton, 오류+재시도, empty('실행 이력 없음')
  │   아니면 motion list(run별 token row):
  │     shortSha · StatusBadge(한국어) · timeAgo · "그래프 보기" → `pathFor('/workflows/${run_id}')`
  │     + STEP_ORDER rail(token bg success/warning/danger/info/raised)
  │     + WAITING_FOR_APPROVAL && approval_id → ApprovalCard(compact) + "AI 설명" + DIFFING changes PlanDiffPanel
  ├─ [배포 대상] Card + `@/ui Table`: 클러스터(Link `pathFor('/clusters/:id?tab=workloads')`)/네임스페이스/이름/이미지(CodeText)/Replicas/상태. loading/empty/error+retry 구분
  ├─ [Safe PR] Card: loading/empty/error+retry 구분. PR 링크, "AI 설명", 설명, before/after CodeBlock 2열, 실패 사유 + "AI 분석" 버튼
  └─ [설정] Card + KeyValueList: application_id/레포/브랜치/manifest/기본 클러스터
  ```

- `RepoDetailView`는 `@/ui` 프리미티브와 `@/ui/motion` preset만 사용한다. `@/shared/ui`, `@/shared/motion`, 구 레거시 UI 패키지, inline style 의존은 없다.

#### AI diff 설명 링크

Repo 상세는 사용자가 보고 있는 run을 기준으로 AI 채팅을 열 수 있다. 이 링크는 채팅을 자동 전송하지 않고 `prefill`과 `context`만 채운다.

- 실행 탭의 승인 대기 run: `diff_source="gitops"`, `workflow_run_id=run.run_id`, `approval_id=run.approval_id`, `application_id=run.application_id`를 전달한다. Chat AI의 `explain_diff_risk`는 `approval.details.diff`를 우선 조회하고, 없으면 workflow diff step을 조회한다.
- Safe PR 탭: `diff_source="safe_pr"`, `workflow_run_id=run.run_id`, `application_id=run.application_id`를 전달한다. Chat AI의 `explain_diff_risk`는 `safe_pr.patch_prepared`/`diff.explained`/`safe_pr.ready_for_creation` 이벤트가 있을 때만 설명한다.
- 실패 사유의 "AI 분석"도 같은 Safe PR context를 사용하고, prefill만 `Safe PR 실패 원인 분석: ...`로 바꾼다.

프론트는 전체 manifest, patch, diff body를 context에 넣지 않는다. 화면이 가진 run 식별자만 넘기고, 실제 데이터 조회와 권한 검증은 백엔드 AI tool이 담당한다.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/repos` | `RepoListView` | `RequireSession`+`ConsoleLayout` | 목록 + 연결 위저드 |
| `/repos/:applicationId` | `RepoDetailView` | `RequireSession`+`ConsoleLayout` | 상세 4탭, `?tab=` |

## 불변식·오류 (Invariants & Errors)

- run 폴링 주기는 활성 run 존재 여부에서만 파생(수동 refetch 트리거 금지): 단일 앱 10s/60s, 전체 10s/30s.
- `useRunsAll`은 개별 앱 run 쿼리 실패를 `failed/error`로 combine 결과에 포함한다. workflow 화면은 이 값을 사용해 실패를 "run 없음"으로 오해하지 않고 재시도 UI를 렌더한다.
- 승인 UI 는 `ApprovalCard` 하나만 존재 — 다른 feature 에서 재구현 금지.
- 승인 성공 시 chat 캐시(`['ai']` prefix)도 무효화해 대화 속 `approval_ref` 상태를 동기화한다.
- AI 설명 버튼은 승인/거절 실행과 독립이다. `explain_diff_risk`는 읽기 전용 설명 tool이며, 클릭만으로 approve/reject/command/Safe PR 생성이 발생하면 안 된다.
- run 상태 문자열은 `adaptRun` 이 대문자로 정규화한 값으로만 비교한다(실백엔드 step 이름 매핑 포함 — [shared/adapt](shared.md#어댑터-libadaptts)).
- manifest 는 Git 이 원본 — 콘솔은 링크("manifest 수정 ↗")만 제공하고 직접 편집 UI 를 만들지 않는다.
- 앱 연결은 `/applications/connect` 단일 호출로 수행한다. 프론트는 `namespace`/`environment`를 고정값 사용하지 않고 manifest validation 결과와 선택 클러스터 환경에서 얻은 값이 있을 때만 보낸다.
