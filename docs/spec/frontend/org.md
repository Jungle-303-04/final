---
source_commit: 664925a6
status: synced
---

# features/org — 설정: 멤버·조직·그룹·리소스 권한

> 소스: `frontend/src/features/org/`

## 책임 (Responsibility)

- 조직/그룹/멤버/리소스 권한(G1·G2·G3·G5 갭 API) 훅과 `/settings/*` 관리 화면 4종, 설정 공통 탭 레이아웃(`SettingsNav`).
- 모든 화면은 `RequireAdmin` 가드 하위([app 라우터](app.md#라우터--frontendsrcapproutertsx--router)).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get/post/put/del`), `@/shared/lib/types`, `@/shared/lib/ui-store`, `@/shared/lib/format`, `@/shared/ui`, `@/shared/motion` | [shared](shared.md) | API·UI |
| import | `@/features/auth/api`(`useApproveUser`) | [auth](./auth.md) | 멤버 승인 |
| import | `@/features/cluster/api`(`useClusters`), `@/features/repo/api`(`useApplications`) | [cluster](./cluster.md), [repo](./repo.md) | AccessView 리소스 선택지 |
| import ← | [notifications/OpsView](./notifications.md) | — | `SettingsNav` 소비 |
| 백엔드 | `/orgs*`, `/groups*`, `/users`, `/access*` | [api-gateway](../services/gateway-api-gateway.md) | 갭 API |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 비고 |
|---|---|---|---|
| `useOrgs` | `frontend/src/features/org/api.ts :: useOrgs` | GET `/orgs` | 키 `['orgs']`, select `.orgs` |
| `useGroups` | `frontend/src/features/org/api.ts :: useGroups` | GET `/groups` | 키 `['groups']`, select `.groups` |
| `useUsers` | `frontend/src/features/org/api.ts :: useUsers` | GET `/users` | 키 `['users']`, select `.users` |
| `useGrants` | `frontend/src/features/org/api.ts :: useGrants` | GET `/access[?resource_id=]` | `(resourceId?)`, 키 `['access', resourceId ?? 'all']`, select `.grants` |
| `useCreateOrg` | `frontend/src/features/org/api.ts :: useCreateOrg` | POST `/orgs` body `{name; description?}` | 성공: `['orgs']` invalidate + toast ok `'조직을 만들었습니다'` |
| `useDeleteOrg` | `frontend/src/features/org/api.ts :: useDeleteOrg` | DELETE `/orgs/${id}` | 실패(onError): toast danger `'소속 그룹을 먼저 정리해야 합니다'`(422 `groups_exist`) |
| `useCreateGroup` | `frontend/src/features/org/api.ts :: useCreateGroup` | POST `/groups` body `{org_id; name}` | 성공: `['groups']`+`['orgs']` invalidate + toast ok `'그룹을 만들었습니다'` |
| `useGroupMembers` | `frontend/src/features/org/api.ts :: useGroupMembers` | GET `/groups/${groupId}/members` → `{members: {user_id; email}[]}` | `enabled: !!groupId`, 키 `['groups', id, 'members']` |
| `useToggleMembership` | `frontend/src/features/org/api.ts :: useToggleMembership` | PUT / DELETE `/groups/${groupId}/members/${userId}` | mutation `({userId, add: boolean})` — add 면 PUT, 아니면 DELETE. 성공: `['groups']`+`['users']` invalidate |
| `GrantPayload` | `frontend/src/features/org/api.ts :: GrantPayload` | — | `{ subject_type: 'user'\|'group'; subject_id: string; subject_label?: string; resource_type: string; resource_id: string; role: string }` |
| `useGrantAccess` | `frontend/src/features/org/api.ts :: useGrantAccess` | POST `/access` body `GrantPayload` | 성공: `['access']` invalidate + toast ok `'권한을 부여했습니다'` |
| `useRevokeAccess` | `frontend/src/features/org/api.ts :: useRevokeAccess` | DELETE `/access/${id}` | 성공: `['access']` invalidate |

내부 헬퍼 `useInvalidator(keys)` — 성공 시 여러 쿼리키 invalidate 하는 클로저(비공개). 내부에서 `useQueryClient` 를 호출하므로 hooks 규칙 준수를 위해 `use` 접두사 커스텀 훅으로 명명한다.

## 컴포넌트

### `frontend/src/features/org/SettingsNav.tsx :: SettingsNav`

`{ title: string; children: ReactNode }` — h1 `설정 — <title>` + 탭 NavLink 5개(`/settings/members` 멤버, `/settings/orgs` 조직, `/settings/groups` 그룹, `/settings/access` 리소스 권한, `/settings/ops` 운영(DLQ)) + children. `FadeSlideIn` 래핑. 설정 5개 화면이 모두 이 레이아웃을 사용.

### `frontend/src/features/org/MembersView.tsx :: MembersView` (default export) — `/settings/members`

- 데이터: `useUsers`, `useGroups`(그룹 id→이름), `useApproveUser`, `useSearchFilter`(email).
- 테이블 열: 멤버(`Avatar`+email) / 역할(`Badge` — service_admin 은 info, 그 외 neutral) / 상태(`Badge status` + 라벨: active '활성', pending_approval '승인 대기', 그 외 '검증 대기') / 그룹(이름 join ', ', 없으면 '—') / 가입(timeAgo) / 액션: `pending_approval` 이면 "승인" primary sm 버튼(`approve.mutate(user_id)`, `data-testid="approve-<email>"`).

### `frontend/src/features/org/OrganizationsView.tsx :: OrganizationsView` (default export) — `/settings/orgs`

- state: `open`(생성 모달), `name`, `desc`, `confirming: Org | null`, `confirmText`(삭제 확인 입력).
- 테이블 열: 이름/설명('—')/멤버/그룹/생성(timeAgo)/삭제(danger sm). 빈 목록 EmptyState('🏢 아직 조직이 없습니다').
- 생성 모달: 이름(minLength 3, maxLength 40, required, `data-testid="org-name"`) + 설명 → `create.mutate({name, description: desc})`. `data-testid="new-org"`, `"org-submit"`.
- 삭제 모달: **조직 이름을 그대로 입력해야 삭제 버튼 활성**(`confirmText !== confirming.name` 이면 disabled) → `remove.mutate(org_id)`(onSettled 로 모달 닫기).

### `frontend/src/features/org/GroupsView.tsx :: GroupsView` (default export) — `/settings/groups`

- state: `open`, `name`, `orgId`(생성 모달 — 열 때 첫 조직으로 초기화), `selected: Group | null`(멤버 Drawer).
- 테이블 열: 이름 / 조직(orgs 에서 이름 해석, 못 찾으면 org_id) / 멤버 수. 행 클릭 → Drawer.
- 생성 모달: 조직 select + 이름 → `create.mutate({org_id, name})`.
- Drawer(`그룹: <name>`) → 내부 `GroupMembers { group: Group }` (비공개): `useGroupMembers`+`useUsers`+`useToggleMembership`. 전체 사용자 checkbox 목록 — 체크 상태는 멤버 여부, 변경 시 `toggle.mutate({userId, add})`.

### `frontend/src/features/org/AccessView.tsx :: AccessView` (default export) — `/settings/access`

- 모듈 상수 `ROLES`: `[['observer','읽기 전용'],['release_operator','배포 실행'],['cluster_steward','위험 명령 승인']]`.
- state: `open`, `subjectType`('user'|'group', 기본 'group'), `subjectId`, `resourceType`(기본 'cluster'), `resourceId`, `role`(기본 'observer'). 유형 변경 시 대상 id 리셋.
- 선택지: subject — user 면 users(`[user_id, email]`), group 이면 groups(`[group_id, name]`); resource — cluster 면 clusters(`[cluster_id, name]`), application 이면 apps(`[application_id, name]`).
- 테이블 열: 대상(`Badge neutral subject_type` + subject_label) / 리소스(`code resource_type/resource_id`) / 역할(`Badge info`) / 부여(timeAgo) / "회수"(danger sm → 확인 모달 `revoking` 오픈 후 "회수 실행" 이 `revoke.mutate(access_id)` — 파괴 동작 공통 패턴).
- 부여 모달 폼: 대상 유형/대상/리소스 유형/리소스/역할 select 5개 → `grant.mutate({subject_type, subject_id, subject_label(선택지에서 역해석), resource_type, resource_id, role})`.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/settings/members` | `MembersView` | `RequireSession`+`AppShell`+`RequireAdmin` | 멤버 목록·가입 승인 |
| `/settings/orgs` | `OrganizationsView` | 〃 | 조직 생성·삭제(이름 확인) |
| `/settings/groups` | `GroupsView` | 〃 | 그룹 생성·멤버십 토글 |
| `/settings/access` | `AccessView` | 〃 | 리소스 권한 부여/회수 |

(`/settings/ops` 는 [notifications](./notifications.md) 의 OpsView.)

## 불변식·오류 (Invariants & Errors)

- 조직 삭제는 소속 그룹이 없어야 한다(서버 422 `groups_exist` → danger 토스트) + 클라이언트에서 이름 재입력 확인.
- 역할 어휘는 `ROLES` 3종으로 고정(observer/release_operator/cluster_steward).
- 멤버십 토글·권한 변경 후 관련 쿼리(`groups`/`users`/`access`) invalidate 로 화면 동기화.
