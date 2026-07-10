# 06. API 맵 — 인벤토리와 갭 상태

[← 문서 지도](README.md)

정본: `src/packages/contracts/gateway/routes.py` + 각 `domains/*/router.py` (2026-07-06 실측 검증).
스키마 타입은 `GET /openapi.json` 코드젠으로 생성([03 § API 클라이언트](03-architecture.md#api-클라이언트)) — 여기선 경로·용도·사용처만.

인증 표기: 🔓공개 · 🍪세션 · 👑admin(service_admin) · 🤖agent 토큰(x-agent-token, 프론트 미사용)

## 실존 API 인벤토리 (프론트 사용분)

### 인증 (identity)

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| GET /auth/session | 🍪 | 전역 부팅 [auth](views/auth.md#세션-수명-주기-전역--여기가-정본) |
| POST /auth/signup · POST /auth/login · POST /auth/logout | 🔓/🍪 | [auth](views/auth.md) |
| GET /auth/verify-email · POST /auth/resend-verification | 🔓 | [auth](views/auth.md) |
| POST /auth/users/{user_id}/approve | 👑 | [org-admin 멤버](views/org-admin.md#멤버--membersview-g3) |

### 관리 콘솔 (organization, group, user, access)

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| GET /orgs · POST /orgs | 👑 | [org-admin 조직](views/org-admin.md#조직--organizationsview-g1) |
| DELETE /orgs/{org_id} | 👑 | [org-admin 조직](views/org-admin.md#조직--organizationsview-g1) |
| GET /groups · POST /groups | 👑 | [org-admin 그룹](views/org-admin.md#그룹--groupsview-g2) |
| GET /groups/{group_id}/members | 👑 | [org-admin 그룹](views/org-admin.md#그룹--groupsview-g2) |
| PUT /groups/{group_id}/members/{user_id} · DELETE /groups/{group_id}/members/{user_id} | 👑 | 그룹 Drawer 멤버십 편집 |
| GET /users | 👑 | [org-admin 멤버](views/org-admin.md#멤버--membersview-g3) |
| GET /access | 🍪 | [resources 권한](views/resources.md#권한-탭--accessview-g5) |
| POST /access · DELETE /access/{access_id} | 👑 | [resources 권한](views/resources.md#권한-탭--accessview-g5) |

### 클러스터/타깃 (target, inventory, command)

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| POST /targets | 👑 | [resources 위저드](views/resources.md) |
| GET /clusters · GET /clusters/{cluster_id} | 🍪 | [fleet](views/fleet-heatmap.md), [cluster](views/cluster-detail.md) |
| GET /clusters/{id}/connection-status | 🍪 | 위저드 4단계 폴링 |
| GET /clusters/{id}/inventory/summary·resources·workloads·services·events | 🍪 | [fleet](views/fleet-heatmap.md), [cluster](views/cluster-detail.md) |
| PUT /clusters/{id}/policy | 👑 | Bruno/API 확인용 cluster policy 수정 — **GET 없음(G11)**, AgentPolicy 전체 전송 |
| POST /commands | 🍪 deploy | (팔레트 "명령 실행") |
| POST /clusters/{id}/namespaces/{ns}/deployments/{name}/scale·restart | 🍪 deploy | [cluster workloads](views/cluster-detail.md#쓰기-액션-권한-release_operator-이상--requirepermission) |
| POST /agent/debug/query | 🍪 read | [metrics](views/metrics.md#온디맨드-쿼리-비동기-ux--이-화면의-핵심-설계) |

### 앱/레포/워크플로우 (applications, catalog, gitops)

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| GET·POST /applications | 🍪 | [repo](views/repo.md), [resources](views/resources.md) |
| GET /applications/{application_id} | 🍪 | [repo 상세](views/repo.md#상세--repodetailview-reposapplicationid) |
| GET·POST /applications/{id}/deployments | 🍪 | repo deployments 탭 |
| GET /applications/{id}/runs | 🍪 | repo runs, [workflow](views/workflow.md) |
| GET /catalog/items · GET /catalog/items/{item_id} | 🍪 | /catalog |
| POST /catalog/items/{item_id}/installs | 🍪 | 설치 runner 연결 전 501로 차단 |
| POST /approvals/{approval_id}/grant · reject | 🍪 deploy | ApprovalCard (repo·workflow·chat·notifications 공유) |

### AI / 대시보드 / RCA

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| GET /ai/conversations | 🍪 | [ai-chat 목록](views/ai-chat.md#목록--chatlistview-ai) |
| POST /ai/conversations | 🍪 | [ai-chat](views/ai-chat.md) |
| GET /ai/conversations/{conversation_id} | 🍪 | ai-chat 폴링 |
| DELETE /ai/conversations/{conversation_id} | 🍪 | ai-chat 대화 삭제 |
| POST /ai/conversations/{id}/messages | 🍪 | ai-chat 전송 |
| GET /dashboard/rca/timeline | 🍪 | fleet 티커, [notifications](views/notifications.md), pod 원인분석 탭 |
| GET /dashboard/rca/incidents/{incident_id} | 🍪 | 인시던트 상세 |
| POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select | 🍪 deploy | [ai-chat ActionSelectCard](views/ai-chat.md#actionselectcard--선택하면-실행-카드) |

### 운영 (admin)

| 메서드 경로 | 인증 | 사용 뷰 |
|---|---|---|
| GET /dead-letters | 👑 | [notifications](views/notifications.md), /settings/ops |
| POST /dead-letters/{dead_letter_id}/replay | 👑 | /settings/ops |
| GET /providers/catalog · GET /providers/cluster-discovery · POST /providers/validate | 👑 | resources 위저드 provider 조회·검증 |
| GET /healthz · /readyz | 🔓 | (모니터링 전용) |

### WebSocket

| 경로 | 방향 | 내용 |
|---|---|---|
| WS {realtime-gateway}/live/browser | 서버→브라우저 | live summary 스냅샷: 네임스페이스별 팟 요약(hot pod, phase, rollout 진행). 스키마는 `src/services/realtime/realtime-gateway/app.py` 계약 — 코드젠 대상 아님, `shared/lib/live.ts` 에 수기 타입 + 런타임 가드(zod) |

`/live/agent` 는 agent 전용 — 프론트 미사용.

## 갭 상태 표

이 섹션은 G번호의 현재 상태를 고정한다.
코드 반영 항목은 위 실존 API 인벤토리와 `src/domains/identity/admin_router.py`, `src/domains/ai/router.py`를 따른다.
후속 항목은 프론트가 실존 route처럼 호출하지 않고, 별도 작업으로 연결한다.
공통 규칙: 세션 인증, workspace 는 세션에서 유도(클라이언트 입력 금지 — 기존 보안 원칙).

### G1. 조직 CRUD

```text
GET    /orgs                      → { orgs: [{ org_id, name, description, member_count, group_count, created_at }] }
POST   /orgs        {name, description?}                          👑
DELETE /orgs/{org_id}   — 소속 그룹 존재 시 409 {detail:"groups_exist"}  👑
```

코드 반영 범위: 목록, 생성, 삭제. 조직 수정 route는 후속 편집 항목이다.

### G2. 그룹 CRUD + 멤버십

```text
GET    /groups?org_id=            → { groups: [{ group_id, org_id, name, member_count }] }
POST   /groups      {org_id, name, description?}                  👑
GET    /groups/{group_id}/members → { members: [{ user_id, email }] }
PUT    /groups/{group_id}/members/{user_id}   (멱등 추가)          👑
DELETE /groups/{group_id}/members/{user_id}                       👑
```

코드 반영 범위: 목록, 생성, 멤버 목록, 멤버 추가/제거. 그룹 수정/삭제 route는 후속 편집 항목이다.

### G3. 사용자 목록

```text
GET /users?status=active|pending_verification|pending_approval&q=
  → { users: [{ user_id, email, role, status, groups: [group_id], created_at }] }   👑
```

코드 반영 범위: `status` 필터. 검색 `q`는 후속 필터 항목이다.

### G4. 레포지토리 목록

```text
GET /repositories → { repositories: [{ repository_id, repo_ref, default_branch, status,
                       watch_targets: [{ watch_target_id, branch, manifest_path }] }] }  🍪
```

(초기 화면은 /applications 로 대체 가능 — P2)

### G5. 리소스 접근 관리

```text
GET    /access?resource_id=
  → { grants: [{ access_id, subject_type: user|group, subject_id, subject_label,
                 resource_type, resource_id, role, granted_at }] }                🍪 read
POST   /access  {subject_type, subject_id, subject_label?, resource_type, resource_id, role} 👑
DELETE /access/{access_id}                                                        👑
role ∈ ResourceRole (packages/contracts/identity 정본)
```

### G6. 노드 메트릭 요약 (P2)

```text
GET /clusters/{id}/nodes/summary → { nodes: [{ name, ready, cpu_ratio, mem_ratio, pod_count }] }
```

(node-collector 수집값의 read model 투영)

### G7. 메트릭 프록시 (P2)

```text
POST /clusters/{id}/metrics/query  {promql, start?, end?, step?}
  → { result_type: vector|matrix, series: [...] }   — agent 경유 동기화(타임아웃 10s)
```

### G8. AI 스트리밍 (P3 선택)

현재 구현된 AI 대화 경로에는 token stream WebSocket 이 없다. 프론트는 `GET /ai/conversations/{id}` 폴링을 유지하며, 스트리밍은 별도 후속 과제로 추가될 때 이 표에 실제 route 를 반영한다.

### G9. 알림 피드 (P2)

현재 프론트는 이 API를 쓰지 않고 `useNotices()`가 승인 대기 run, RCA timeline, DLQ를 클라이언트에서 합성한다. 아래는 통합 알림 API 도입 시 교체할 계획 계약이다.

```text
GET  /notifications?after=          → { notices: [Notice] }   (Notice 는 notifications.md 타입)
POST /notifications/read  {last_seen_at}
```

### G10. AI 대화 API (P1 — ai-chat 화면 차단 해소)

```text
GET /ai/conversations → { conversations: [{ conversation_id, title, status, updated_at }] }  🍪
POST /ai/conversations {message, title?, agent?, context?}
  → { accepted, conversation_id, message_id, event_id, correlation_id }  🍪
GET /ai/conversations/{conversation_id}
  → { conversation: {...}, messages: [{ message_id, role, status?, content, created_at, metadata?, tool_calls?, actions?, approval_ref? }] }  🍪
POST /ai/conversations/{conversation_id}/messages {message, agent?, context?}
  → { accepted, conversation_id, message_id, event_id, correlation_id }  🍪
```

코드 반영 범위: 목록 조회, 새 대화/메시지 accepted response, 단건 `{conversation, messages}` envelope. 프론트는 단건 응답을 `adaptConversationDetail`로 `Conversation`에 정규화하고, `metadata.tool_trace`를 `tool_calls`로 렌더한다. `context?`는 서버에서 `cluster_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `locale` 문자열 필드만 유지하고 각 값을 253자로 제한한다.

### G11. 클러스터 정책 조회 (P2)

```text
GET /clusters/{cluster_id}/policy → AgentPolicy   👑
```

실측: PUT 만 존재하고 현재 프론트 cluster 상세에는 policy 편집 탭이 없다.
도입 전까지 정책 수정 검증은 Bruno `02-target-admin/02-update-cluster-policy.bru`로 수행한다.

## 갭-뷰 정합성 규칙 재확인

[01 § 갭 상태 요약](01-requirements.md#갭-상태-요약)의 상태와 이 문서 상태는 1:1 이어야 한다.
불일치가 보이면 `routes.py`와 실제 router가 정본이고, 이 문서를 즉시 맞춘다.
