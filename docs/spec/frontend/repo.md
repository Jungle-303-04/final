---
source_commit: 664925a6
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
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/ui-store`, `@/shared/lib/adapt`(`adaptApplication`, `adaptDeployment`, `adaptRun`), `@/shared/lib/format`, `@/shared/ui`, `@/shared/ui/plan-diff`, `@/shared/ui/icons`, `@/shared/motion` | [shared](shared.md) | API·UI |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 승인 버튼 활성 |
| import | `@/features/resources/ConnectRepoWizard` | [resources](./resources.md) | 목록 화면 위저드 |
| import ← | [workflow](./workflow.md), [chat](./chat.md), [notifications](./notifications.md), [org](./org.md) | — | `useApplications`/`useRuns*`/`ApprovalCard` 소비 |
| 백엔드 | `/applications/*`, `/approvals/*` | [api-gateway](../services/gateway-api-gateway.md) | |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `repoKeys` | `frontend/src/features/repo/api.ts :: repoKeys` | — | `apps() = ['applications']`, `runs(id) = ['applications', id, 'runs']`, `deployments(id) = ['applications', id, 'deployments']` |
| `useApplications` | `frontend/src/features/repo/api.ts :: useApplications` | GET `/applications` | 30s, select `d.applications.map(adaptApplication)` |
| `useApplication` | `frontend/src/features/repo/api.ts :: useApplication` | GET `/applications/${id}` → `{application: raw}` | 쿼리키 `['applications', id]`, `select: d => adaptApplication(d.application)` |
| `useRuns` | `frontend/src/features/repo/api.ts :: useRuns` | GET `/applications/${appId}/runs` | select `d.runs.map(adaptRun)`. **적응 폴링**: raw runs 중 상태(대문자화)가 ACTIVE 집합에 있으면 10s, 아니면 60s |
| `useRunsAll` | `frontend/src/features/repo/api.ts :: useRunsAll` | 앱별 GET `/applications/${id}/runs` (useQueries) | `(apps: Application[])` → `combine` 으로 `{ appId, runs: adaptRun[] }[]` 반환. 활성 run 있으면 10s, 아니면 30s |
| `useDeployments` | `frontend/src/features/repo/api.ts :: useDeployments` | GET `/applications/${appId}/deployments` | select `d.deployments.map(adaptDeployment)` |
| `useApproval` | `frontend/src/features/repo/api.ts :: useApproval` | POST `/approvals/${approvalId}/${action}` (`action: 'grant'\|'reject'`) | 성공: toast(`grant → ok '승인 완료 — 배포가 진행됩니다'` / `reject → warn '거절했습니다'`) + `['applications']`·`applications*` predicate·`ai*` predicate invalidate |
| `CreateApplicationInput` | `frontend/src/features/repo/api.ts :: CreateApplicationInput` | — | `{ name; repo_ref; branch; manifest_path; cluster_id }` — 레포 연결 위저드 입력 계약 |
| `useCreateApplication` | `frontend/src/features/repo/api.ts :: useCreateApplication` | ① POST `/applications` body `{name, repo_ref, default_branch: branch, manifest_path}` → `{application: raw}` ② POST `/applications/${id}/deployments` body `{cluster_id, namespace:'sandbox', environment:'sandbox', manifest_path}` | `(input: CreateApplicationInput)` — 앱 생성 후 배포 대상 등록까지 2단계 순차 실행. 반환은 `adaptApplication` 결과에 `branch`/`cluster_id` 를 덮어쓴 값. 성공 시 apps invalidate. [resources/ConnectRepoWizard](./resources.md) 가 사용 |

`ACTIVE`(모듈 상수, 비공개): `{'STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING'}`.

## 컴포넌트

### `frontend/src/features/repo/ApprovalCard.tsx :: ApprovalCard`

```tsx
export function ApprovalCard({ approvalId, summary, resolved, compact }:
  { approvalId: string; summary: string; resolved?: 'granted' | 'rejected'; compact?: boolean })
```

- `resolved` 있으면 `<Badge status={resolved} />` 만 렌더.
- 아니면 `.card`(surface-2, compact 시 padding 10): `Badge(warn '승인 대기')` + summary + 승인(primary sm)/거절(danger sm) 버튼 — 진행 중엔 둘 다 disabled, 로딩 스피너는 `approval.variables.action` 이 일치하는(클릭한) 버튼에만.
- `canDeploy = useIsAdmin()` — false 면 두 버튼 disabled + title `'deploy 권한 필요'` (mock 단계 단순화, 서버가 최종 검증. G5 도입 시 리소스 권한으로 대체).
- 클릭 → `useApproval().mutate({ approvalId, action })`.

### `frontend/src/features/repo/RepoListView.tsx :: RepoListView` (default export)

- 라우트: `/repos`. state: `wizard: boolean`.
- 트리: 헤더(h1 '레포' + "+ 레포 연결") → `Card > QueryBoundary(useApplications) > ResourceTable<Application>` → `ConnectRepoWizard`.
- 빈 목록: `EmptyState('⑂', '연결된 레포가 없습니다', 레포 연결 버튼)`.
- 열: 앱(b) / 레포(`code {repo_ref}@{branch}`) / 클러스터 / 최근 run(`Badge status={last_run_status}`, 없으면 '—') / 마지막 배포(timeAgo, 없으면 '—'). 행 클릭 → `/repos/${application_id}`.

### `frontend/src/features/repo/RepoDetailView.tsx :: RepoDetailView` (default export)

- 라우트: `/repos/:applicationId`. 쿼리스트링 `tab`(기본 'runs').
- 데이터: `useApplication`, `useRuns`, `useDeployments`. `safePrRun = runs.find(r => r.safe_pr)`.
- 모듈 상수 `STEP_ORDER`: `['STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING','SUCCEEDED']`.
- 트리:
  ```
  FadeSlideIn
  ├─ Breadcrumbs [레포 → app.name]
  ├─ 헤더: h1(name + code repo_ref@branch) · 버튼 2개(새 탭):
  │    "manifest 수정 ↗" → https://github.com/<repo_ref>/blob/<branch>/<manifest_path> · "GitHub ↗" → https://github.com/<repo_ref>
  ├─ 안내문: "manifest(<manifest_path>)는 Git 이 원본입니다 — GitHub 에서 수정해 커밋하면
  │    webhook/poller 가 감지해 자동으로 run 이 생성됩니다. 콘솔에서는 직접 수정하지 않습니다."
  ├─ Tabs: runs(badge=run 수)/deployments(배포)/safe-pr(Safe PR)/settings(설정)
  ├─ [runs] 비면 EmptyState(IconClock '첫 커밋 감지 대기 중' — webhook/poller 안내)
  │   아니면 Stagger(run별 Card):
  │     code(shortSha) · Badge(status) · 미니 스텝바(STEP_ORDER 별 14×5 칩 — SUCCEEDED ok/FAILED danger/PENDING surface-3/그 외 info)
  │     · timeAgo(started_at) · "그래프 보기" → /workflows/${run_id}
  │     status===WAITING_FOR_APPROVAL && approval_id → ApprovalCard(summary '<sha> 배포 승인', compact)
  │       + DIFFING step 의 changes 가 있으면 PlanDiff(changes, resource)
  ├─ [deployments] ResourceTable: 클러스터(Link /clusters/:id?tab=workloads)/네임스페이스/이름/이미지(code)/Replicas/상태 Badge
  ├─ [safe-pr] safePrRun 없으면 EmptyState('🤖 Safe PR 이력이 없습니다')
  │   있으면 Card('Safe PR — <sha>'): Badge(safe_pr.status) + pr_url 링크 'PR 열기 ↗' + explanation
  │     + diff_before 있으면 before(danger)/after(ok) CodeBlock 2열
  │     + safe_pr.error 있으면 Link(/ai?prefill='Safe PR 실패 원인 분석: <error>') "✦ AI에게 원인 묻기"
  └─ [settings] KeyValue: application_id/manifest_path/대상 클러스터/브랜치
  ```

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/repos` | `RepoListView` | `RequireSession`+`AppShell` | 목록 + 연결 위저드 |
| `/repos/:applicationId` | `RepoDetailView` | `RequireSession`+`AppShell` | 상세 4탭, `?tab=` |

## 불변식·오류 (Invariants & Errors)

- run 폴링 주기는 활성 run 존재 여부에서만 파생(수동 refetch 트리거 금지): 단일 앱 10s/60s, 전체 10s/30s.
- 승인 UI 는 `ApprovalCard` 하나만 존재 — 다른 feature 에서 재구현 금지.
- 승인 성공 시 chat 캐시(`['ai']` prefix)도 무효화해 대화 속 `approval_ref` 상태를 동기화한다.
- run 상태 문자열은 `adaptRun` 이 대문자로 정규화한 값으로만 비교한다(실백엔드 step 이름 매핑 포함 — [shared/adapt](shared.md#어댑터-libadaptts)).
- manifest 는 Git 이 원본 — 콘솔은 링크("manifest 수정 ↗")만 제공하고 직접 편집 UI 를 만들지 않는다.
- 앱 생성은 `/applications` → `/applications/:id/deployments` 2단계 순차 호출 — 백엔드 필드명(`default_branch`) 변환은 `useCreateApplication` 내부에서만 한다.
