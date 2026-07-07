# 프론트엔드 프로덕션 감사 (AUDIT) — 콘솔 디자인 시스템 재정립

## 2026-07-08 디자인 시스템 리셋 진행 상황

- Tailwind CSS v4를 Vite 플러그인 방식으로 연결했다. 설정 소스는 `src/ui/theme.css` 하나로 두고, CSS-first `@theme inline` semantic token을 사용한다.
- 새 토큰 계층:
  - 배경: `bg`, `surface`, `raised`
  - 보더: `border`, `border-strong`
  - 텍스트: `primary`, `secondary`, `muted`
  - 액션/상태: `accent`, `success`, `warning`, `danger`, `info`
  - radius: `control`, `panel`
  - shadow: `soft`, `elevated`
- 타이포는 Pretendard 우선, fallback system-ui이며 `caption(12)`, `label(13)`, `body(14)`, `title(16)`, `page(20)` 5단만 새 UI 레이어에서 사용한다.
- Motion preset 정본은 `src/ui/motion.ts`다. duration은 `fast 120ms`, `base 200ms`, `slow 320ms`이며 개별 컴포넌트에서 duration/easing을 하드코딩하지 않는다.
- 새 프리미티브 정본은 `src/ui/index.tsx`다. Button, IconButton, Card, StatCard, Table, Tabs, Badge, StatusChip, Modal, Drawer, Dropdown/Menu, Field/Input/Select/Textarea, Toast, Tooltip, Skeleton, EmptyState, PageHeader, Breadcrumb, CodeBlock, KeyValueList, ConfirmDialog, Collapsible를 포함한다.
- `/dev/ui`는 개발 환경에서만 등록되는 검수 라우트다. production build output에 `UiShowcase` chunk가 생성되지 않는 것을 확인했다.
- Phase 2 첫 화면 묶음(`/login`, `/signup`, `/pending`, `/verify-email`)은 `src/ui` 프리미티브로 이관했다. 인증 화면 내부의 `@/shared/ui`, `@/shared/motion`, `plural-ui` import와 inline `style=` 사용은 0건이다.
- 인증 뮤테이션은 pending 버튼 상태와 성공/실패 토스트를 제공한다. 가입 성공, 검증 메일 재전송 성공, 로그인 승인 대기/실패 사유도 사용자에게 명시한다.
- Phase 2 앱 셸(`features/console/ui.tsx`)은 Tailwind semantic token과 `src/ui` 프리미티브로 이관했다. 셸 내부의 `plural-ui`, `console.css`, inline `style=`, raw color/px 의존은 0건이다.
- Phase 2 홈 대시보드(`features/console/pages/HomePage.tsx`)는 `src/ui` StatCard/Card/Table/Tabs/Badge/EmptyState 기반으로 이관했다. 홈 화면의 `plural-ui`, `shared/ui`, `shared/motion`, Nivo chart wrapper, inline `style=` 의존은 0건이다.
- 홈 이관 완료에 따라 `features/console/console.css`는 삭제했다.
- Phase 2 클러스터 목록(`features/cluster/ClusterListView.tsx`)은 `src/ui` PageHeader/StatCard/Card/Input/Table/Badge/EmptyState 기반으로 이관했다. 목록 본체의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- Phase 2 클러스터 상세(`features/cluster/ClusterDetailView.tsx`)는 `src/ui` PageHeader/Breadcrumb/StatCard/Card/Tabs/Table/Drawer/Modal/KeyValueList 기반으로 이관했다. 상세 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- Phase 2 인시던트 목록(`features/notifications/NotificationsView.tsx`)은 `src/ui` PageHeader/Card/Tabs/Badge/Button/EmptyState 기반으로 이관했다. 목록 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- Phase 2 인시던트 상세(`features/notifications/IncidentDetailView.tsx`)는 `src/ui` PageHeader/Breadcrumb/Card/KeyValueList/Badge/Button/Collapsible/EmptyState 기반으로 이관했다. RCA 파이프라인 그래프, 후보 점수바, evidence trail, 복구 계획 기능은 유지하고 상세 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- Phase 2 워크플로우(`features/workflow/WorkflowListView.tsx`, `features/workflow/WorkflowGraphView.tsx`)는 `src/ui` PageHeader/Breadcrumb/Card/Table/Badge/Button/Collapsible/Tooltip/EmptyState 기반으로 이관했다. React Flow 공용 wrapper(`shared/flow`)도 새 토큰과 reduced-motion 대응으로 정렬했고, 워크플로 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- 아직 전 화면 이관 전이므로 `shared/ui/app.css`, `plural-ui/plural.css`, `shared/theme-bridge.css`는 남아 있다. 화면 이관 단위마다 해당 화면 전용 레거시 CSS를 제거한다.

## 사용 규칙

- feature 코드는 `src/ui` 프리미티브와 Tailwind semantic token만 사용한다.
- feature 코드에서 새 CSS 파일, inline `style=`, hex 색상, px 하드코딩을 추가하지 않는다.
- 상태 어휘는 `healthy`, `warning`, `critical`, `pending`, `running`, `failed`로 고정하고 사용자 노출 라벨은 한국어 명사형으로 쓴다.
- 리스트/카드/테이블은 로딩, 빈 상태, 오류+재시도 상태를 반드시 제공한다.
- 뮤테이션은 pending, 성공 토스트, 실패 사유 토스트를 함께 설계한다.

## Phase 2 인증 화면 검증 (2026-07-08 04:20 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm run build` passed. 기존 large chunk warning만 있음.
- Playwright 로컬 검수: `/login`, `/signup`, `/pending?email=operator@example.com`, `/verify-email`, `/verify-email?verified=1`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0.
- screenshots: `/tmp/k8s-auth-login-desktop.png`, `/tmp/k8s-auth-signup-mobile.png`, `/tmp/k8s-auth-verify-mobile.png` 등 `/tmp/k8s-auth-<route>-<viewport>.png`.
- 로컬 dev proxy의 `GET /api/auth/session` 500은 화면 렌더 오류가 아니라 로컬 백엔드 세션 확인 응답이다. 배포 smoke에서는 public API health를 별도 확인한다.

## Phase 2 앱 셸 검증 (2026-07-08 04:40 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm run build` passed. 기존 large chunk warning만 있음.
- `features/console/ui.tsx` grep: `plural-ui`, `console.css`, inline `style=`, raw hex/px, legacy `pl-`/`co-` class 0건.
- Playwright route mocking 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 앱 셸을 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-shell-desktop.png`, `/tmp/k8s-shell-tablet.png`, `/tmp/k8s-shell-mobile.png`.

## Phase 2 홈 대시보드 검증 (2026-07-08 04:55 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/console/pages/HomePage.tsx`, `features/console/pages/NotFoundPage.tsx`, `features/console/ui.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, `console.css`, inline `style=`, raw hex/px, legacy `pl-`/`co-` class 0건.
- Playwright route mocking 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 홈 대시보드를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-home-desktop.png`, `/tmp/k8s-home-tablet.png`, `/tmp/k8s-home-mobile.png`.

## Phase 2 클러스터 목록 검증 (2026-07-08 05:10 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/cluster/ClusterListView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-` class 0건.
- Playwright route mocking 검수: 인증 세션/알림/클러스터 목록 최소 응답으로 `/clusters`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0, visible rows 4.
- screenshots: `/tmp/k8s-clusters-list-desktop.png`, `/tmp/k8s-clusters-list-tablet.png`, `/tmp/k8s-clusters-list-mobile.png`.

## Phase 2 클러스터 상세 검증 (2026-07-08 05:20 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/cluster/ClusterDetailView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-` class, legacy CSS var 0건.
- Playwright route mocking 검수: 인증 세션/알림/클러스터 상세 인벤토리 최소 응답으로 `/clusters/prod-seoul-01`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, visible rows 5.
- 탭 전환 검수: 워크로드 → 서비스 → 이벤트 전환, 서비스 IP와 이벤트 `BackOff` cell 확인, document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-cluster-detail-desktop.png`, `/tmp/k8s-cluster-detail-tablet.png`, `/tmp/k8s-cluster-detail-mobile.png`, `/tmp/k8s-cluster-detail-tabs.png`.

## Phase 2 인시던트 목록 검증 (2026-07-08 05:30 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/notifications/NotificationsView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- Playwright route mocking 검수: 인증 세션/알림 합성 소스(timeline/app runs/DLQ) 응답으로 `/incidents`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- screenshots: `/tmp/k8s-incidents-list-desktop.png`, `/tmp/k8s-incidents-list-tablet.png`, `/tmp/k8s-incidents-list-mobile.png`.

## Phase 2 인시던트 상세 검증 (2026-07-08 05:41 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/notifications/IncidentDetailView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- Playwright route mocking 검수: 인증 세션/알림/인시던트 상세/RCA 리포트/복구 계획 최소 응답으로 `/incidents/inc-101`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- 모바일 RCA 그래프는 화면 전체 overflow 없이 그래프 영역 내부 가로 스크롤로 읽을 수 있게 고정했다.
- screenshots: `/tmp/k8s-incident-detail-desktop.png`, `/tmp/k8s-incident-detail-tablet.png`, `/tmp/k8s-incident-detail-mobile.png`, `/tmp/k8s-incident-detail-mobile-fixed.png`.

## Phase 2 워크플로우 검증 (2026-07-08 06:03 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/workflow/*` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- `shared/flow`는 React Flow edge/node motion만 유지하고 색/보더/배경은 `--ui-*` semantic token으로 정렬했다. `prefers-reduced-motion`에서 pulse/dash/node transition은 비활성화된다.
- Playwright route mocking 검수: 인증 세션/알림 합성 API/애플리케이션 run 응답으로 `/workflows`, `/workflows/run-approval-101`을 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- 진행 중 워크플로우 그래프는 현재 단계까지 표시해 과축소를 막고, 완료 run은 전체 단계 경로를 표시한다. 상세 검수 기준 그래프 node 5, edge 4.
- screenshots: `/tmp/k8s-workflows-list-desktop.png`, `/tmp/k8s-workflows-list-tablet.png`, `/tmp/k8s-workflows-list-mobile.png`, `/tmp/k8s-workflow-detail-desktop-final2.png`, `/tmp/k8s-workflow-detail-tablet.png`, `/tmp/k8s-workflow-detail-mobile.png`.

## 전개형 검증 UX 패스 범위 (디자인 시스템 완료 후)

원칙: 다음 단계는 서버 검증을 통과한 뒤에만 나타나며, 제출 버튼은 검증 통과 시에만 활성화한다. 이전 단계 값 변경 시 이후 단계 상태를 reset하고, 실패는 필드 밑 한국어 인라인 사유로 표시한다.

| 플로우 | 단계 -> 검증 API 매핑 | 상태 |
|---|---|---|
| 레포 연결 | repo 입력 -> `POST /repos/validate` 또는 현행 `POST /repositories/discovery/probe`; branch -> `GET /repositories/discovery/branches`; manifest 후보 -> `GET /repositories/discovery/manifests`; manifest 선택 -> `POST /repositories/discovery/validate`; 등록 -> `POST /applications/connect` | 대기 |
| 클러스터 등록 | 이름 -> cluster_id 생성; 등록 -> `POST /targets`; 설치 명령 -> 1회 토큰 표시; heartbeat -> `GET /clusters/{id}/connection-status` 폴링 | 대기 |
| 알림 채널 | 설정 입력 -> 테스트 발송 API; 테스트 성공 -> 저장 API | 계약 확인 필요 |
| 룰 추가 | YAML 입력 -> validate API; 유효 -> symptom/후보 수 preview | 계약 확인 필요 |
| 회원가입 | 이메일 -> 중복 검증 API; 비밀번호 -> 로컬 강도/정책; 가입 -> `POST /auth/signup`; 재발송 -> `POST /auth/resend-verification` | 대기 |
| 로그인 실패 분기 | 로그인 -> `POST /auth/login`; `invalid_credentials`, `email_unverified`, `approval_pending` 분기 | 대기 |
| 이메일 인증 랜딩 | token 검증 -> 성공/만료/이미인증 분기; 만료 -> 재발송 | 대기 |
| 승인 대기 화면 | 세션/승인 상태 폴링 -> 승인 시 returnTo 자동 입장 | 대기 |
| 스케일 | 현재값 조회 -> 변경 미리보기; 정책 불가 선표시; 실행 -> scale command 상태 추적 | 대기 |
| 재시작/DLQ replay | 확인 모달 대상 요약; 실행 중 행 pending; replay -> `POST /dead-letters/{id}/replay` | 대기 |
| 복구 승인 | 명령/PR diff 접이식 preview; 권한 없으면 tooltip; 승인/거절 API | 대기 |
| 역할 변경 | role 변경 -> membership/update API; `last_admin` 인라인 사유; 자기 강등 경고 | 대기 |
| 조직/그룹 생성 | 이름 입력 -> 중복 검증 API; 생성 API | 대기 |
| AI 채팅 | LLM 설정 상태 조회; 미설정/키 오류 -> 설정 안내 카드; 정상 -> 채팅 입력 | 대기 |
| 메트릭 PromQL | 입력 -> dry-run 문법 검증; 실행 -> query API; 0건 -> 시간범위 확장 CTA | 대기 |
| 인시던트 evidence | evidence 상태 조회; `수집 중`과 `없음` 분리 | 대기 |
| 목록 필터 전반 | 필터 변경 -> 목록 query; 0건 -> 필터 초기화 CTA | 대기 |

# 프론트엔드 프로덕션 감사 (AUDIT) — 콘솔 승격 패스

기준: 프로덕션 빌드에서 mock/fixture/하드코딩 수치는 전부 결함.
이번 패스: **Plural 스타일 콘솔이 루트(`/`) 앱으로 승격**, 구 베이스 앱 셸/화면 삭제, 전 화면 실데이터화.
후속 패스(2026-07-07 오후): **mock 레이어 자체를 삭제** — 코드베이스에 페이크 데이터 경로가 아예 없음(섹션 D).

## A. 아키텍처 결정

- 콘솔 셸(`features/console/ui.tsx`, plural-ui 디자인)이 `/` 에 마운트. 구 `AppShell`(`app/shell/`)과 `/overview` 히트맵 화면 삭제.
- "디자인 프리뷰(샘플 데이터)" 배너 제거 — 콘솔이 이제 실데이터 앱 그 자체이므로 존재 이유 소멸.
- 실데이터 뷰(클러스터/레포/워크플로/인시던트/메트릭/AI/설정)는 콘솔 레이아웃 하위로 이동하고,
  `shared/theme-bridge.css` 로 shared/ui 토큰(`--surface-* --text-* --brand …`)을 plural 토큰(`--color-*`)에
  매핑 — 셸과 콘텐츠가 동일 팔레트·다크/라이트 모드(`data-theme-mode`)를 공유. 페이지 헤더는 plural `PageHeader` 로 통일.
- 로그인 등 인증 화면도 같은 토큰 브리지를 사용(첫 페인트 전 `main.tsx` 에서 테마 속성 적용).

## B. 라우트 → 실데이터 API 매핑 (전 화면)

| 라우트 | 화면 | 실 API |
|---|---|---|
| `/` | 홈(플릿 대시보드) | `GET /fleet/summary`(신규 집계 계약) + `GET /dashboard/rca/timeline` + 승인 알림 합성(`/applications/*/runs`) + `GET /ai/conversations` |
| `/clusters` | 클러스터 목록 + 등록 위저드 | `GET /clusters`, `GET /providers/catalog`, `POST /providers/validate`, `POST /targets`, `GET /clusters/{id}/connection-status`(5s 폴링) |
| `/clusters/:id` | 클러스터 상세(워크로드/팟/노드/서비스/리소스/이벤트 + 집계 요약) | `GET /clusters/{id}/inventory/*`, `GET /clusters/{id}/summary`(신규 집계 계약: usage·open_incidents), `POST …/scale`, `POST …/restart` |
| `/repos`, `/repos/:id` | GitOps 레포 + 연결 위저드 | `GET/POST /applications`, `GET /applications/{id}/runs·deployments`, `POST /approvals/{id}/grant·reject` |
| `/workflows`, `/workflows/:runId` | run 목록 + React Flow 그래프(dash-flow·패킷 애니메이션, dagre 자동 배치) | `GET /applications/*/runs`(활성 run 10s 폴링), 승인 API |
| `/incidents` | 알림/인시던트 피드 | timeline + DLQ(`GET /dead-letters`, admin) + 승인 대기 합성 |
| `/incidents/:id` | RCA 파이프라인 그래프 + 증거/리포트 | `GET /dashboard/rca/incidents/{id}`, `GET /evidence?correlation_id=`, `GET /rca-reports?correlation_id=` |
| `/metrics` | 실시간(WS)·스냅샷 시계열·온디맨드 PromQL | WS `/api/live/browser`, `GET /clusters/{id}/usage`, `POST /agent/debug/query` → `GET /commands/{id}` 폴링 |
| `/ai`, `/ai/:id` | AI 채팅(도구 호출·복구 액션·승인 카드) | `GET/POST /ai/conversations*`, `POST /rca/recovery-plans/*/actions/*/select` |
| `/catalog` | 서비스 카탈로그 | `GET /catalog/items`, `POST /catalog/items/{id}/installs` |
| `/settings/{members,orgs,groups,access,ops}` | 조직/그룹/멤버/권한/DLQ (admin 가드) | `GET/POST/DELETE /users·/orgs·/groups·/access`, `POST /auth/users/{id}/approve`, `POST /dead-letters/{id}/replay` |
| `/login /signup /pending /verify-email` | 인증 | `POST /auth/*`, `GET /auth/session` |
| `/console/*`, `/plural/*`, `/overview*`, `/notifications` | 리다이렉트 | → `/` (`/notifications` → `/incidents`) |

신규 집계 계약(백엔드에서 병행 구현 중, `features/fleet/api.ts` 에 타입 고정):
- `GET /fleet/summary` → `{clusters:[{cluster_id,name,health,pods_running,pods_total,nodes_ready,nodes_total,open_incidents,restarts_recent,cpu_pct,mem_pct,last_seen}], totals:{clusters,healthy,warning,critical,open_incidents,pending_approvals,running_workflows,dead_letters}}`
- `GET /clusters/{id}/summary` → `{workloads[], recent_events[], open_incidents[], usage:{cpu_pct,mem_pct,restarts_total}}`
- 엔드포인트 미배포 상태에서는 QueryBoundary 가 오류+재시도(정직한 상태)로 표시 — 배포되면 즉시 동작.

## C. 백엔드 도메인이 없는 복각 섹션 처리 (fixture 삭제)

| 구 콘솔 섹션 | 결정 |
|---|---|
| CD(clusters/services/pipelines/repos/globalservices/observers) | **재설계-흡수** — 실 도메인 `/clusters`(인벤토리)·`/repos`(GitOps)·`/workflows`(파이프라인) 로 대체 |
| Stacks / Kubernetes 뷰어 | **흡수** — `/clusters/:id` 리소스/워크로드 탭(실측 인벤토리) |
| Alerts / AI threads / sentinels | **흡수** — `/incidents`(RCA 타임라인) · `/ai`(실 대화) |
| Home 위젯보드·플릿맵(fixture) | **재구현** — `/` 홈이 `GET /fleet/summary` 기반 히트맵(Treemap)·집계 카드·테이블로 대체 |
| Marketplace/번들/퍼블리셔 | **삭제** — 대응 도메인 없음. 설치형 카탈로그는 실 `/catalog` 로 대체 |
| Cost management / Security(취약점·컴플라이언스) / Edge / Flows / Workbenches / Self-service PR | **삭제** — 백엔드 도메인 없음(fabricated 데이터 금지) |
| Cloud shell / Audits(geo·login) / Profile(키·토큰) / Personas / OIDC·SMTP 등 설정 복제 | **삭제** — 실 설정은 `/settings/*` (orgs/groups/members/access/ops) |
| 역할 전환 데모(viewer.tsx "View as") | **삭제** — 권한은 실 세션(`roles`)과 서버 검증으로만 |

삭제 파일: `features/plural/**`(5), `features/console/{mock,metrics,flows,popups,viewer,ChatPanel,live,routes,api/**,map/**,widgets/**,pages/{AiMisc,Cd,Drill,Settings,StacksK8s}Pages}`(29), `app/shell/**`(2), `features/fleet/{FleetHeatmapView,score}`(2), plural-ui 데드 코드(`PluralLayout/PluralShell/SaveButton` — mock 저장 버튼 포함) = **38개 파일 + 데드 익스포트 제거**.

## D. mock 완전 삭제 (2026-07-07 후속 패스)

- `shared/lib/mock/{fixtures,router}.ts`(463줄 페이크 데이터/라우터) **삭제**. `API_MODE`/`VITE_API_MODE` 개념 자체 제거 —
  `shared/lib/api.ts` 는 무조건 실 fetch, `shared/lib/live.ts` 는 무조건 실 WS.
- `frontend/.env.development` 삭제(mock 플래그만 담던 파일). 로컬 개발은 vite proxy(`VITE_BACKEND`, 기본 127.0.0.1:8000)로 실 백엔드에 붙는다.
- 콘솔 헤더의 "MOCK 모드" 칩 제거(도달 불가 상태였음).
- CI env 가드(.github/workflows/ci.yml)·scripts/frontend-check.sh 의 mock 관련 예외/플래그 정리.
- grep 검증: `mock` 참조 0건(src 전체).
- 하드코딩 제거: 로그인 이메일 prefill(`admin.local@example.com`) 삭제(이전 패스).

## E. 애니메이션/모션 일관성

- React Flow: `AnimatedEdge`(dash-flow + animateMotion 패킷), dagre 자동 배치, fitView 전환 — 워크플로 그래프·RCA 파이프라인.
- Motion: 섹션 전환 fadeRise(콘솔 셸), 카드/리스트 enter-exit(`AnimatedList`/`Stagger`/`AnimatedRow`), 모달 pop·플라이오버 slide(plural-ui variants), LIVE 인디케이터 `PulseOnChange`, CountUp 스탯.
- Nivo: crosshair + 슬라이스 툴팁 + 시리즈 전환 애니메이션(`TimeSeriesChart`), 플릿 히트맵 Treemap.
- `MotionConfig reducedMotion="user"` + 개별 `useReducedMotion` 폴백으로 prefers-reduced-motion 전면 존중.

## F. 실시간

- WS 단일 연결(`startLive`)은 콘솔 셸 마운트 시 1회 — 지수 백오프 재연결, `live.summary`/스냅샷 반영.
- 반영 지점: 셸 LIVE 인디케이터(pulse), 메트릭 실시간 차트, 클러스터 상세 hot 팟 표시.

## G. MISSING-BACKEND

- `GET /fleet/summary`, `GET /clusters/{id}/summary` — 병행 구현 중인 집계 엔드포인트(계약 확정, 프론트 타입 고정).
  미배포 동안 홈 집계 카드/히트맵·클러스터 상세 집계 패널은 오류+재시도 상태로 표시(그 외 화면은 무영향).
- 그 외 필요 API 전부 존재 확인(contracts/gateway/routes.py).

## H. 검증

- [x] `npm run build` (tsc --noEmit + vite build) exit 0
- [x] `npm run lint` exit 0
- [x] 삭제 모듈 잔존 임포트 grep 0건, `/console·/plural·/overview` 링크 잔존 0건(리다이렉트 제외)

## I. 품질 반복 패스 (2026-07-07 오후) — 인터랙션/심화 감사 결과

페이지 전수 코드 감사(홈/클러스터 목록·상세/레포 목록·상세/워크플로우 목록·그래프/인시던트 목록·상세/
메트릭/AI 채팅/카탈로그/설정 5종/인증 4종) 후 수정한 결함:

- [x] **클러스터 상세 스케일/재시작 대상 오류**: mock 시절 팟 이름 규칙(`name.replace(/-pod-.*/)`)으로
  디플로이먼트명을 유추 — 실데이터 팟 이름(`checkout-api-7d9f…`)에선 오동작. 워크로드 행의 실제
  디플로이먼트명(`workload_name` 그룹 키)을 `DeploymentTarget{ns,name,podCount}` 로 전달하도록 교정.
  스케일 기본값도 2 고정 → 현재 팟 수로.
- [x] 클러스터 상세의 죽은 임포트 핵(`void useTimeline`) 제거.
- [x] **권한 회수(AccessView) 확인 단계 없음**: 파괴 동작 중 유일하게 즉시 실행이던 것 → 확인 모달 추가
  (조직 삭제·재시작·DLQ 재처리와 동일 패턴).
- [x] 알림 목록 배지가 원문 kind(`approval`) 노출 → 셸 플라이오버와 동일한 한국어 라벨로 통일.
- [x] AI 채팅 대화 목록 빈 상태 부재 → 안내 문구 추가.
- [x] 인시던트 상세 RCA 리포트 카드 심화(후보 점수바/근거 쿼리 트레일/부증상/미수집 체크) — 섹션 J.
- [x] 메트릭 프리셋 실측 계열 교체 + range 선택 + 단위 포맷 — docs/frontend-metrics-queries.md.
- [x] 메트릭 헤더를 PageHeader 로 통일(빈 상태 분기와 동일 헤더 — 페이지 간 타이포 일관).
- [x] **데드 익스포트 스윕**: 구 콘솔 잔재 미사용 프리미티브/아이콘 35종(~550줄) 제거 — plural-ui 는 실사용
  7종(Button/Chip/Card/Table/Flyover/PageHeader/useThemeMode)만 유지. 미참조 파일 0건.
- [x] 라이브 번들 검증(12:47): `클러스터 맵`/`MOCK`/비용 문자열 0건 — 스크린샷 구화면 소멸 확인.

이상 없음 확인(수정 불요): 등록/연결 위저드(닫기 가드·검증·실패 복구), 조직 삭제 type-to-confirm,
그룹 멤버 토글, DLQ 재처리 확인, 채팅 전송 실패 시 입력 복원, 카탈로그 카드별 pending 분리,
워크플로우 그래프 로딩/404 처리, 로그인 오류 상태별 메시지.

## J. RCA/메트릭 프로덕션 뷰어 (지시 3)

- `/rca-reports` 확장 필드 사용: 후보 평가 점수표(선정 강조·rule/AI 출처·✓충족/✗미충족 신호),
  근거 쿼리 트레일(소스별 실행 쿼리 원문 — 운영자가 재현 가능), 대상 리소스, 부증상, 미수집 체크.
  구 응답(필드 없음)에도 안전(optional + fallback 렌더).
- 메트릭: 실측 계열 프리셋 6종(%, count 단위 자동 포맷), range 5m~6h, agent 실측 결과만 표시.
- 카탈로그 문서: `docs/frontend-metrics-queries.md`(색인 등재, test_docs_index 그린).
