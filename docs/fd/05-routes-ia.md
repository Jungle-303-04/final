# 05. 라우트와 정보구조

[← 문서 지도](README.md) · [아키텍처](03-architecture.md)

`app/router.tsx`는 이 문서와 1:1. 라우트 추가는 여기 먼저.

## 라우트 트리

```text
/login                      LoginView            (게스트 전용)
/signup                     SignupView           (게스트 전용)
/verify-email               VerifyEmailResult    (토큰 링크 랜딩)
/pending                    PendingApprovalView  (게스트 — 로그인 403 approval 분기 랜딩)

/  (AppShell + RequireSession)
├─ /overview                FleetHeatmapView          ← 기본 랜딩
│   └─ /overview/c/:clusterId          (히트맵 드릴다운 오버레이 — LayoutMorph)
├─ /clusters                ClusterListView
│   └─ /clusters/:clusterId ClusterDetailView
│       ├─ (탭) resources | workloads | services | nodes | pods | events | policy
│       └─ /clusters/:clusterId/pods/:namespace/:pod   PodDrawer(URL 유지 오버레이)
├─ /repos                   RepoListView
│   └─ /repos/:applicationId  RepoDetailView
│       └─ (탭) runs | deployments | safe-pr | settings
├─ /workflows               WorkflowListView (runs 전체)
│   └─ /workflows/:runId    WorkflowGraphView
├─ /metrics                 MetricsView
├─ /ai                      ChatListView
│   └─ /ai/:conversationId  ChatView
├─ /notifications           NotificationsView
├─ /catalog                 CatalogView (서비스 카탈로그 설치)
└─ /settings  (RequireAdmin — service_admin)
    ├─ /settings/members    MembersView        (GET /users)
    ├─ /settings/orgs       OrganizationsView  (GET/POST/DELETE /orgs)
    ├─ /settings/groups     GroupsView         (GET/POST /groups + members)
    ├─ /settings/access     AccessView         (GET/POST/DELETE /access)
    └─ /settings/ops        OpsView (DLQ 관리 — /dead-letters)
```

뷰 상세는 각 [views/](README.md#뷰-명세-views) 문서.

## 사이드바 (순서 = 중요도)

| 아이콘 | 라벨 | 경로 | 가시성 |
|---|---|---|---|
| LayoutGrid | 오버뷰 | /overview | 전 사용자 |
| Boxes | 클러스터 | /clusters | 전 사용자 |
| GitBranch | 레포 | /repos | 전 사용자 |
| Workflow | 워크플로우 | /workflows | 전 사용자 |
| LineChart | 메트릭 | /metrics | 전 사용자 |
| Sparkles | AI | /ai | 전 사용자 |
| Package | 카탈로그 | /catalog | 전 사용자 |
| Settings | 설정 | /settings/* | service_admin 만 표시 |

알림은 사이드바가 아니라 Topbar 벨 아이콘(배지 수) → /notifications.

## 가드 (app/guards.tsx)

| 가드 | 조건 | 실패 시 |
|---|---|---|
| RequireGuest | 세션 없음 | /overview 로 |
| RequireSession | `GET /auth/session` authenticated | /login 으로 (returnTo 쿼리 유지) |
| RequireAdmin | roles 에 service_admin | 403 EmptyState("권한 필요") |
| RequirePermission(p) | 리소스 권한 p 보유 | 액션 버튼 disabled + Tooltip 사유 |

권한 판별 데이터: 세션 응답의 roles + 리소스별 접근(G5 실존 API, [01-requirements.md §R5](01-requirements.md#r5-리소스-권한-설정-그룹사용자)).

## 딥링크·URL 상태 규칙

- 드릴다운(히트맵 c/:clusterId, PodDrawer)은 **URL 에 반영** — 새로고침/공유 가능
- 테이블 필터·탭은 searchParams (`?tab=nodes&q=`) — zustand 에 두지 않음
- 알림 클릭 → 대상 딥링크: approval → `/repos/:appId?tab=runs&run=:runId`, incident → `/ai` 또는 `/clusters/:id`, DLQ → `/settings/ops`

## 브레드크럼 규칙

`오버뷰 > 클러스터 > {cluster name} > 팟 {pod}` — 라우트 트리에서 자동 파생.
수동 문자열 금지, `router.tsx` 의 handle.crumb 로 선언.

## 커맨드 팔레트 (⌘K)

| 그룹 | 항목 |
|---|---|
| 이동 | 사이드바 전 항목 + 최근 방문 클러스터/레포 5개 |
| 액션 | "새 대화", "클러스터 등록", "레포 연결", "명령 실행"(권한 시) |
| 검색 | 클러스터/앱 이름 fuzzy (로컬 캐시 검색 — 서버 검색 API 없음) |
