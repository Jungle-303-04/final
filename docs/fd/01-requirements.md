# 01. 기능 요구사항과 매핑

[← 문서 지도](README.md)

사용자 요구 11개 기능을 뷰·API·백엔드 갭으로 분해한다.
API 경로의 정본은 [06-api-map.md](06-api-map.md).

## R1. 로그인

| 항목 | 내용 |
|---|---|
| 뷰 | [views/auth.md](views/auth.md) |
| API | `POST /auth/signup`, `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`, `GET /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/users/{user_id}/approve` |
| 흐름 | 가입 → 이메일 검증(mail-worker 발송) → 관리자 승인 → 로그인(세션 쿠키) |
| 갭 | 없음 — 전 API 존재 |

## R2. 조직 생성 / R3. 조직원·그룹 생성

| 항목 | 내용 |
|---|---|
| 뷰 | [views/org-admin.md](views/org-admin.md) |
| 현황 | `src/domains/identity/admin_router.py`에 조직 목록/생성/삭제, 그룹 목록/생성/멤버십, 사용자 목록 route가 붙어 있다 |
| API | `GET/POST /orgs`, `DELETE /orgs/{org_id}`, `GET/POST /groups`, `GET /groups/{group_id}/members`, `PUT/DELETE /groups/{group_id}/members/{user_id}`, `GET /users` |
| 갭 | G1/G2/G3의 1차 운영 화면 차단 범위는 코드 반영됨. 조직 수정, 그룹 수정/삭제 같은 세부 편집은 후속 개선 항목으로 둔다 |
| 개발 방식 | 실존 route 기준으로 훅을 붙이고, mock은 로컬 데모용 fallback으로만 둔다 |

## R4. 리소스 생성 (레포, 클러스터)

| 항목 | 내용 |
|---|---|
| 뷰 | [views/resources.md](views/resources.md) |
| 클러스터 등록 | `GET /providers/cluster-discovery` → `POST /targets/preflight` → `POST /targets` (install manifest + agent token 발급) → `GET /clusters/{id}/connection-status` 폴링 |
| 레포 등록 | `POST /github/webhook` 경로는 기계용. 사람용 등록은 catalog install(`POST /catalog/items/{item_id}/installs`) 또는 application 생성(`POST /applications`) 흐름으로 레포/워치타깃/바인딩이 함께 생성됨 |
| 갭 | 레포 단독 CRUD 조회 API 부분적 — **G4**(repository/watch target 목록 조회) |

## R5. 리소스 권한 설정 (그룹·사용자)

| 항목 | 내용 |
|---|---|
| 뷰 | [views/resources.md § 권한 탭](views/resources.md#권한-탭) |
| 모델 | ResourceRole(observer/release_operator/cluster_steward…) × 대상(user/group) × 리소스(cluster/repository/application) — `packages/contracts/identity` |
| 현황 | `GET/POST /access`, `DELETE /access/{access_id}`가 `src/domains/identity/admin_router.py`에 붙어 있다 |
| API | `GET /access?resource_id=...`, `POST /access`, `DELETE /access/{access_id}` |
| 갭 | G5의 권한 목록/부여/회수는 코드 반영됨. `resource_type` 필터는 현재 화면에서 `resource_id` 중심으로 사용한다 |

## R6. 클러스터 모음 → 클러스터 → 노드 → 팟 (히트맵 드릴다운)

| 항목 | 내용 |
|---|---|
| 뷰 | [views/fleet-heatmap.md](views/fleet-heatmap.md) (모음·드릴), [views/cluster-detail.md](views/cluster-detail.md) (상세) |
| 판단 | "주식 히트맵" 직관 판단은 **타당** — treemap(면적=규모, 색=건강도)은 fleet 규모 파악에 최적. 외부 기준 콘솔도 treemap 패턴을 사용. 채택 |
| API | `GET /clusters`, `GET /clusters/{id}/inventory/summary`, `.../workloads`, `.../resources`, `WS /live/browser`(실시간 색 갱신) |
| 갭 | 노드 단위 상세는 inventory 스냅샷의 node 리소스로 표현 가능. 노드별 실시간 메트릭은 live summary 범위 확인 — 부족 시 **G6**(node metrics 요약) |

## R7. 레포뷰

| 항목 | 내용 |
|---|---|
| 뷰 | [views/repo.md](views/repo.md) |
| API | `GET /applications`, `GET /applications/{id}`, `GET /applications/{id}/deployments`, `GET /applications/{id}/runs` |
| 내용 | 변경 이력(runs), 배포 바인딩, Safe PR 상태, diff 설명(diff.explained payload) |

## R8. 그래프 메트릭 뷰

| 항목 | 내용 |
|---|---|
| 뷰 | [views/metrics.md](views/metrics.md) |
| 실시간 | `WS /live/browser` live summary → 슬라이딩 윈도 차트 |
| 온디맨드 | `POST /agent/debug/query`(PromQL enqueue) → command 결과 폴링 — 비동기 UX 필수 |
| 갭 | 동기식 시계열 프록시 없음 — **G7**(range query 프록시). 초기 버전은 debug query + live summary 로 충분 |

## R9. 워크플로우 생성 노드뷰

| 항목 | 내용 |
|---|---|
| 뷰 | [views/workflow.md](views/workflow.md) |
| 시각화 | run 의 9단계 상태(WorkflowRunStatus)를 @xyflow/react 노드 그래프로. 실제 구현 기준은 `frontend/src/features/workflow/WorkflowGraphView.tsx` |
| 생성 | "워크플로우 생성" = application + binding 생성 위저드([views/resources.md](views/resources.md))의 결과. 임의 DAG 편집기는 백엔드 실행 모델에 없음 → 범위 제외(문서에 명시) |

## R10. AI 채팅

| 항목 | 내용 |
|---|---|
| 뷰 | [views/ai-chat.md](views/ai-chat.md) |
| API | `GET /ai/conversations`, `POST /ai/conversations`, `GET /ai/conversations/{id}`(폴링), `POST /ai/conversations/{id}/messages` |
| 실행 승인 | 외부 기준 "선택지 카드" = 백엔드 실체와 매핑: RCA 액션 선택 `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select`, 승인 `POST /approvals/{id}/grant|reject` |
| 갭 | 스트리밍 없음(폴링 기반) — 폴링 UX로 설계. WS 확장은 **G8**(선택) |

## R11. 알림

| 항목 | 내용 |
|---|---|
| 뷰 | [views/notifications.md](views/notifications.md) |
| 소스 | 승인 대기(approval), DLQ(`GET /dead-letters` admin), 인시던트(`GET /dashboard/rca/timeline`) |
| 갭 | 통합 알림 조회 API 없음 — **G9**(notifications feed). 초기 버전은 3개 소스 클라이언트 합성으로 구현 가능 |

## 갭 상태 요약

우선순위 P1=프론트 1차 릴리스 차단, P2=차선.

| 갭 | 내용 | 상태 | 기준 문서 |
|---|---|---|---|
| G1 | 조직 목록/생성/삭제 | 코드 반영 | [06 §G1](06-api-map.md#g1-조직-crud) |
| G2 | 그룹 목록/생성 + 멤버십 | 코드 반영 | [06 §G2](06-api-map.md#g2-그룹-crud--멤버십) |
| G3 | 사용자 목록/상태 조회 | 코드 반영 | [06 §G3](06-api-map.md#g3-사용자-목록) |
| G4 | repository/watch target 목록 | P2 | [06 §G4](06-api-map.md#g4-레포지토리-목록) |
| G5 | 리소스 접근(권한) 목록/부여/회수 | 코드 반영 | [06 §G5](06-api-map.md#g5-리소스-접근-관리) |
| G6 | 노드 실시간 메트릭 요약 | P2 | [06 §G6](06-api-map.md#g6-노드-메트릭-요약) |
| G7 | 메트릭 range query 프록시 | P2 | [06 §G7](06-api-map.md#g7-메트릭-프록시) |
| G8 | AI 대화 WS 스트리밍 | P3(선택) | [06 §G8](06-api-map.md#g8-ai-스트리밍) |
| G9 | 통합 알림 피드 | P2 | [06 §G9](06-api-map.md#g9-알림-피드) |
| G10 | AI 대화 목록 조회 | 코드 반영 | [06 §G10](06-api-map.md#g10-ai-대화-목록-p1--ai-chat-목록-화면-차단-해소) |
| G11 | 클러스터 정책 조회(GET) | P2 | [06 §G11](06-api-map.md#g11-클러스터-정책-조회-p2) |

**모순 방지 규칙**: "코드 반영" 항목은 실존 route 기준으로 Bruno와 화면을 만든다.
P2/P3 항목은 화면에서 후보 기능으로 분리하고, 실존 API처럼 쓰지 않는다.
