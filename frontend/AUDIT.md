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
- Motion preset 정본은 `src/ui/motion.ts`다. duration은 `fast 120ms`, `base 200ms`, `slow 320ms`이며 개별 컴포넌트에서 duration/easing을 고정값 사용하지 않는다.
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
- Phase 2 메트릭(`features/metrics/MetricsView.tsx`)은 `src/ui` PageHeader/Card/StatCard/Field/Input/Select/Textarea/Badge/StatusChip/EmptyState 기반으로 이관했다. Nivo line chart wrapper는 `src/ui/charts.tsx`로 승격했고, 메트릭 feature의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color 의존은 0건이다.
- 차트 정본은 `src/ui/charts.tsx`다. 전체 선형 차트는 `TimeSeriesChart`, 카드형 미니 차트는 `Sparkline`을 사용한다. feature 화면은 실제 API/WS/집계 배열만 전달하고, 더미 높이 배열이나 장식용 차트는 금지한다.
- 레거시 CSS import 제거(2026-07-08 09:15 KST): `main.tsx` 전역 스타일 import는 `@/ui/theme.css` 단독이다. 삭제 파일: `frontend/src/shared/tokens.css`, `frontend/src/shared/ui/app.css`, `frontend/src/shared/theme-bridge.css`, `frontend/src/plural-ui/tokens.css`, `frontend/src/plural-ui/plural.css`, `frontend/src/features/console-archive/archive.css`.
- 남은 CSS import는 `@/ui/theme.css`, React Flow 라이브러리 스타일, `shared/flow/flow.css`뿐이다. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 `/login`과 `/`를 1440/1024/390 폭에서 확인했고 marker와 horizontal overflow 0을 확인했다.
- 배포 확인(2026-07-08 09:19 KST): GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `ab014c10-css-cleanup-20260708091722`, main `/assets/index-BtlDgMJr.js`, CSS `/assets/index-BRxn7xco.css` 서빙 및 삭제한 레거시 CSS marker 0건 확인.
- CI 가드(2026-07-08 09:22 KST): `scripts/frontend-check.sh`가 `frontend/src/features` 아래 새 `.css` 파일, inline `style=`, raw hex 색상을 배포 전 차단한다. `bash scripts/frontend-check.sh` 전체 통과.
- 미사용 레거시 UI 스윕(2026-07-08 09:25 KST): 앱 경로에서 참조가 끊긴 `src/plural-ui/*`, `src/shared/ui/*`, `src/shared/motion/index.tsx`, `src/shared/lib/ui-store.ts`를 삭제했다. 남은 `src/shared`는 flow wrapper와 API/lib 유틸뿐이며 legacy UI import grep 0건, `bash scripts/frontend-check.sh` 전체 통과.

## 사용 규칙

- feature 코드는 `src/ui` 프리미티브와 Tailwind semantic token만 사용한다.
- feature 코드에서 새 CSS 파일, inline `style=`, hex 색상, px 고정값 사용을 추가하지 않는다.
- 새 CSS 파일, inline `style=`, hex 색상은 CI gate에서 차단된다.
- 상태 어휘는 `healthy`, `warning`, `critical`, `pending`, `running`, `failed`로 고정하고 사용자 노출 라벨은 한국어 명사형으로 쓴다.
- 리스트/카드/테이블은 로딩, 빈 상태, 오류+재시도 상태를 반드시 제공한다.
- 뮤테이션은 pending, 성공 토스트, 실패 사유 토스트를 함께 설계한다.
- 차트는 실측 데이터, 서버 집계, 브라우저 실시간 스트림 중 하나가 있을 때만 표시한다. 단일 합계만 있는 항목은 차트를 숨기고, feature 코드에서 더미 차트나 고정 높이 배열을 만들지 않는다.

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
- Playwright 계약 스모크 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 앱 셸을 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-shell-desktop.png`, `/tmp/k8s-shell-tablet.png`, `/tmp/k8s-shell-mobile.png`.

## Phase 2 홈 대시보드 검증 (2026-07-08 04:55 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/console/pages/HomePage.tsx`, `features/console/pages/NotFoundPage.tsx`, `features/console/ui.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, `console.css`, inline `style=`, raw hex/px, legacy `pl-`/`co-` class 0건.
- Playwright 계약 스모크 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 홈 대시보드를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-home-desktop.png`, `/tmp/k8s-home-tablet.png`, `/tmp/k8s-home-mobile.png`.

## Phase 2 클러스터 목록 검증 (2026-07-08 05:10 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/cluster/ClusterListView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-` class 0건.
- Playwright 계약 스모크 검수: 인증 세션/알림/클러스터 목록 최소 응답으로 `/clusters`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, unexpected console error 0, visible rows 4.
- screenshots: `/tmp/k8s-clusters-list-desktop.png`, `/tmp/k8s-clusters-list-tablet.png`, `/tmp/k8s-clusters-list-mobile.png`.

## Phase 2 클러스터 상세 검증 (2026-07-08 05:20 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/cluster/ClusterDetailView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-` class, legacy CSS var 0건.
- Playwright 계약 스모크 검수: 인증 세션/알림/클러스터 상세 인벤토리 최소 응답으로 `/clusters/prod-seoul-01`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, visible rows 5.
- 탭 전환 검수: 워크로드 → 서비스 → 이벤트 전환, 서비스 IP와 이벤트 `BackOff` cell 확인, document horizontal overflow 0, unexpected console error 0.
- screenshots: `/tmp/k8s-cluster-detail-desktop.png`, `/tmp/k8s-cluster-detail-tablet.png`, `/tmp/k8s-cluster-detail-mobile.png`, `/tmp/k8s-cluster-detail-tabs.png`.

## Phase 2 인시던트 목록 검증 (2026-07-08 05:30 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/notifications/NotificationsView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- Playwright 계약 스모크 검수: 인증 세션/알림 합성 소스(timeline/app runs/DLQ) 응답으로 `/incidents`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- screenshots: `/tmp/k8s-incidents-list-desktop.png`, `/tmp/k8s-incidents-list-tablet.png`, `/tmp/k8s-incidents-list-mobile.png`.

## Phase 2 인시던트 상세 검증 (2026-07-08 05:41 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/notifications/IncidentDetailView.tsx` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- Playwright 계약 스모크 검수: 인증 세션/알림/인시던트 상세/RCA 리포트/복구 계획 최소 응답으로 `/incidents/inc-101`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- 모바일 RCA 그래프는 화면 전체 overflow 없이 그래프 영역 내부 가로 스크롤로 읽을 수 있게 고정했다.
- screenshots: `/tmp/k8s-incident-detail-desktop.png`, `/tmp/k8s-incident-detail-tablet.png`, `/tmp/k8s-incident-detail-mobile.png`, `/tmp/k8s-incident-detail-mobile-fixed.png`.

## Phase 2 워크플로우 검증 (2026-07-08 06:03 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test -- --runInBand` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/workflow/*` grep: `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw hex color, `console.css`, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 0건.
- `shared/flow`는 React Flow edge/node motion만 유지하고 색/보더/배경은 `--ui-*` semantic token으로 정렬했다. `prefers-reduced-motion`에서 pulse/dash/node transition은 비활성화된다.
- Playwright 계약 스모크 검수: 인증 세션/알림 합성 API/애플리케이션 run 응답으로 `/workflows`, `/workflows/run-approval-101`을 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, legacy class 0, unexpected console error 0.
- 진행 중 워크플로우 그래프는 현재 단계까지 표시해 과축소를 막고, 완료 run은 전체 단계 경로를 표시한다. 상세 검수 기준 그래프 node 5, edge 4.
- screenshots: `/tmp/k8s-workflows-list-desktop.png`, `/tmp/k8s-workflows-list-tablet.png`, `/tmp/k8s-workflows-list-mobile.png`, `/tmp/k8s-workflow-detail-desktop-final2.png`, `/tmp/k8s-workflow-detail-tablet.png`, `/tmp/k8s-workflow-detail-mobile.png`.

## Phase 2 메트릭 검증 (2026-07-08 07:20 KST)

- `cd frontend && npm run typecheck` passed.
- `cd frontend && npm run lint` passed.
- `cd frontend && npm test` passed, 11 tests.
- `cd frontend && npm run build` passed.
- `features/metrics/*` grep: `plural-ui`, `shared/ui`, `shared/motion`, `shared/ui/charts`, inline `style=`, raw hex color, legacy `card`/`input`/`query-row`/`statbox` class 0건.
- `POST /metrics/validate` dry-run을 debounce 검증과 실행 직전 재검증 양쪽에 연결했다. 저장/실행 버튼은 valid 상태에서만 활성화되고, 0건 결과는 "시간범위 넓히기" CTA로 이어진다.
- Playwright 계약 스모크 검수: 인증 세션/알림/클러스터/usage/metric preset/widget/metrics validate 최소 응답으로 `/metrics?cluster=cluster-1`를 1440/1024/390 폭에서 캡처했고 document horizontal overflow 0, button overflow 0, unexpected card overflow 0.
- screenshots: `/tmp/k8s-metrics-desktop.png`, `/tmp/k8s-metrics-tablet.png`, `/tmp/k8s-metrics-mobile.png`.

## 체크포인트 — 더미 차트 제거 (2026-07-08 10:12 KST)

- 구현:
  - `src/ui/charts.tsx`에 `Sparkline` 프리미티브를 추가했다. feature 화면은 숫자 배열만 전달하고 색/라인/빈 상태 표현은 UI 프리미티브가 맡는다.
  - 홈 StatCard의 고정 막대(`SparkBars`)를 제거하고 `GET /fleet/summary`의 health/pod/cpu/memory/incident 분포로 교체했다.
  - 클러스터 목록 StatCard의 고정 막대(`ClusterSpark`)를 제거하고 `GET /clusters`의 연결 상태, 인시던트, 노드, 팟 분포로 교체했다.
  - 클러스터 상세 StatCard의 고정 막대(`MiniBars`)를 제거하고 `GET /clusters/{id}/usage`의 `node_ready`, `pod_running`, `restart_total` delta를 사용한다. 서비스처럼 단일 합계만 있는 항목은 차트를 숨긴다.
  - 메트릭 StatCard의 고정 막대(`MiniBars`)를 제거했다. WS history가 있으면 실시간 `실행 팟`/`재시작` 시리즈를 우선 사용하고, 없으면 `/usage` 롤업으로 fallback한다. rollout은 단일 진행률이라 차트를 숨긴다.
- 검증:
  - `rg "SparkBars|ClusterSpark|MiniBars|barToneClass|sparkClass|heightClass" frontend/src/features` 0건.
  - `bash scripts/frontend-check.sh` passed. design-system guard, `npm ci`, `tsc --noEmit`, `eslint --max-warnings 0`, `npm test` 12건, production build 모두 통과.
- 배포 확인:
  - 커밋/푸시: `3f98a7d0 feat: 더미 차트 실데이터 스파크라인 교체`.
  - GitHub Actions는 코드 실행 전 실패: CI `28910247958`, AWS CD `28910247957`, Promote `28910248008` 모두 failed job의 `steps: []` 확인.
  - 수동 ECR/rollout 수행: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:3f98a7d0-real-charts-20260708101622`, rollout `1/1 ready`.
  - live `https://k8s.woonyong.org/`와 `/api/healthz` 200. live assets에서 real chart aria marker 5건, legacy marker(`SparkBars`, `ClusterSpark`, `MiniBars`) 0건 확인.
- 실시간/미확인 차트 보정(2026-07-08 10:33 KST):
  - `Sparkline`은 `null`/`undefined`를 0으로 변환하지 않고, 실제 측정 숫자가 있을 때만 차트 근거로 사용한다. 홈/메트릭/클러스터 상세 StatCard도 같은 `hasSparklinePoints` 기준을 공유한다.
  - 브라우저 live WS의 초기 `snapshot.state.clusters`를 메트릭 history에 반영한다. 접속 직후 `live.summary` 새 이벤트를 기다리지 않아도 실시간 그래프 초기값이 채워진다.
  - 라이브 API 확인: `/fleet/summary`의 CPU/MEM은 전부 `null`, `1`/`2`는 각각 `never_connected`/`install_expired` 등록으로 서버가 반환 중이다. UI는 합성값을 만들지 않고 미확인/미연결 상태를 표시한다.
  - `bash scripts/frontend-check.sh` passed. unit tests 14건, production build 통과.
  - 푸시 후 GitHub Actions 확인: `959820f9`의 CI `28911051896`, AWS CD `28911051890`, Promote `28911051958` 모두 4~6초 내 `steps: []`로 실패했다. 이후 `a58ff950` CI `28911155725` annotation에서 "recent account payments have failed or your spending limit needs to be increased" 확인. 로컬 검증은 green이나 live 배포 반영은 미확인이다.

## 전개형 검증 UX 패스 범위 (디자인 시스템 완료 후)

원칙: 다음 단계는 서버 검증을 통과한 뒤에만 나타나며, 제출 버튼은 검증 통과 시에만 활성화한다. 이전 단계 값 변경 시 이후 단계 상태를 reset하고, 실패는 필드 밑 한국어 인라인 사유로 표시한다.

| 플로우 | 단계 -> 검증 API 매핑 | 상태 |
|---|---|---|
| 레포 연결 | repo 입력 -> `POST /repos/validate` 또는 현행 `POST /repositories/discovery/probe`; branch -> `GET /repositories/discovery/branches`; manifest 후보 -> `GET /repositories/discovery/manifests`; manifest 선택 -> `POST /repositories/discovery/validate`; 배포 대상 -> `GET /clusters`에서 `connection_status in connected/online` 이고 `role != management`인 클러스터만 선택; 등록 -> 선택 클러스터별 `POST /applications/connect`; 400 `cluster_not_connected`는 인라인 사유 | 완료 |
| 클러스터 등록 | provider/필드 입력 -> 로컬 검증; 확인 -> `POST /targets/preflight`(`cloud_provider`, `deploy_provider=manual-manifest`, `provider_config`, `apply=false`); 통과 -> `POST /targets`; 설치 -> `bootstrap_steps`/`bootstrap_command`/`install_command` 우선순위 CodeBlock 복사; 연결 -> `GET /clusters/{id}/connection-status` 5초 폴링 | 완료 |
| 알림 채널 | 설정 입력 -> `POST /alert-channels/test`; `valid && delivered`인 현재 입력 서명만 저장 활성; 저장 -> `POST /alert-channels`; 목록 -> `GET /alert-channels`; 삭제 -> `DELETE /alert-channels/{id}` | 완료 |
| 룰 추가 | YAML 입력 -> validate API; 유효 -> symptom/후보 수 preview | 계약 확인 필요 |
| 회원가입 | 이메일 입력 debounce -> `POST /auth/check-email`; 사용 가능해야 비밀번호 단계 표시; 비밀번호 강도/정책 실시간; 가입 -> `POST /auth/signup`; 성공 화면 재발송 -> `POST /auth/resend-verification` | 완료 |
| 로그인 실패 분기 | 로그인 -> `POST /auth/login`; `invalid_credentials`는 단일 문구, `email_unverified`는 재발송 CTA, `approval_pending`은 `/pending` 자동 확인 화면 | 완료 |
| 이메일 인증 랜딩 | token -> `/api/auth/verify-email?token=&redirect=/verify-email?status=success`; query 상태로 성공/만료/이미인증 분기; 만료 -> `POST /auth/resend-verification` | 완료 |
| 승인 대기 화면 | `/pending` 진입 시 memory credentials가 있으면 `POST /auth/login` 5초 폴링; 승인 시 returnTo 자동 입장; 새로고침 후에는 수동 로그인 안내 | 완료 |
| 스케일 | 현재값 조회 -> 변경 미리보기; 정책 불가 선표시; 실행 -> scale command 상태 추적 | 대기 |
| 재시작/DLQ replay | DLQ: 확인 모달 대상 요약; 실행 중 행 pending; replay -> `POST /dead-letters/{id}/replay`. 재시작 행 pending은 클러스터 운영 액션 패스에서 진행 | 부분 완료 |
| 복구 승인 | 명령/PR diff 접이식 preview; 권한 없으면 tooltip; 승인/거절 API | 대기 |
| 역할 변경 | role 변경 -> membership/update API; `last_admin` 인라인 사유; 자기 강등 경고 | 대기 |
| 조직/그룹 생성 | 이름 입력 -> 현재 목록 기준 실시간 중복 검증; 유효할 때만 `POST /orgs` 또는 `POST /groups`; 성공/실패 toast | 완료 |
| AI 채팅 | `GET /ai/conversations`, `GET /ai/conversations/:id`, create/send mutation 오류에서 LLM provider/API key/quota 계열 사유 감지; `conversation.status=failed`도 설정 안내 카드 선행; 정상일 때만 채팅 입력 표시 | 완료 |
| 메트릭 PromQL | 입력 debounce -> `POST /metrics/validate`; valid일 때만 저장/실행 활성; 실행 클릭 시 동일 dry-run 재검증 -> `POST /agent/debug/query` 또는 `POST /clusters/{id}/metric-query-presets/{preset_id}/run`; 결과는 `GET /commands/{id}` 폴링; 0건 -> 시간범위 확장 CTA | 완료 |
| 인시던트 evidence | evidence 상태 조회; `수집 중`과 `없음` 분리. 비종결 인시던트가 evidence 단계이거나 `missing_evidence`가 남아 있고 저장 evidence가 0건이면 `증거 수집 중`, 종결/근거 없음이면 `증거 없음` | 완료 |
| 목록 필터 전반 | 필터 변경 -> 목록 query; 0건 -> 필터 초기화 CTA. 클러스터/멤버 목록, 알림 탭, 인시던트 evidence kind, 클러스터 상세 인벤토리 탭(워크로드/팟/노드/서비스/리소스/이벤트)에 `필터 초기화` 제공 | 완료 |

목록 필터 배포 확인(2026-07-08 09:36 KST): GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `c7cda4f9-filter-empty-cta-20260708093449`, 필터 대상 lazy chunk 4종에서 `필터 초기화` 문구 서빙 확인.

인시던트 evidence 배포 확인(2026-07-08 09:30 KST): GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `fba2a457-incident-evidence-ux-20260708092931`, `IncidentDetailView-DKFsSrY7.js`에서 `증거 수집 중`/`증거 없음` 문구 서빙 확인.

## 인증 전개형 검증 UX 변경 (2026-07-08)

- `SignupView`는 이메일 입력을 450ms debounce 후 `POST /auth/check-email`로 선검증한다. 중복이면 "로그인하기" 링크를 인라인으로 표시하고, 사용 가능 응답 전에는 비밀번호 필드와 가입 제출이 열리지 않는다.
- 비밀번호 단계는 강도/정책을 실시간 표시하고, 8자 이상·확인 일치가 충족되어야 가입 버튼이 활성화된다.
- 가입 성공 화면은 인증 메일 재발송 버튼, 60초 쿨다운, 스팸함 안내를 포함한다.
- `LoginView`는 `invalid_credentials`를 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일하고, `email_unverified`는 검증 메일 재전송 CTA, `approval_pending`은 `/pending` 자동 확인 화면으로 분기한다. `returnTo` 복원은 유지한다.
- `PendingView`는 로그인 실패 직후 넘어온 memory credentials가 있을 때만 `POST /auth/login`을 5초 간격으로 재시도하고, 승인되면 returnTo로 자동 입장한다. 새로고침 후에는 비밀번호를 보관하지 않고 수동 로그인 안내를 표시한다.
- `VerifyEmailView`는 성공/만료/이미인증 query 상태를 구분하고, 만료 상태에서 같은 자리 재발송 폼을 제공한다. token이 있으면 `/api/auth/verify-email?token=&redirect=/verify-email?status=success`로 넘겨 서버 검증을 먼저 수행한다.
- `app/guards.tsx`는 `@/ui` 프리미티브와 Tailwind token으로 이관해 인증 계열의 `@/shared/ui`, inline style 의존을 제거했다.
- 검증(2026-07-08 08:16 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 `/signup`, `/login`, `/pending`, `/verify-email?status=success`, `/verify-email?status=already_verified`, `/verify-email?expired=1`을 1440/1024/390 폭에서 순회했다. 이메일 중복 차단, 이메일 통과 후 비밀번호 단계 표시, 가입 성공 화면, invalid/unverified/approval_pending 로그인 분기, pending 자동 입장, 만료 재발송, horizontal overflow 0, unexpected console error 0 확인.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `3e56fe39-auth-validation-ui-20260708081840`, 인증 lazy chunk 5종 서빙 확인.

## 알림 채널 전개형 검증 UX 변경 (2026-07-08)

- `AlertChannelsView`를 `/settings/alerts`에 추가하고 `SettingsNav`에 "알림 채널" 탭을 연결했다.
- 채널 목록은 `GET /alert-channels`를 사용하며 loading, empty, error+retry 상태를 모두 `@/ui` Table/EmptyState로 처리한다.
- 채널 폼은 이름, HTTPS Webhook URL, 최소 심각도, 활성 여부, 테스트 심각도, 테스트 메시지를 받는다. 저장 버튼은 로컬 검증과 `POST /alert-channels/test`의 `valid && delivered`가 현재 입력 서명과 일치할 때만 활성화된다.
- 입력값을 변경하면 테스트 통과 상태가 즉시 reset되어 저장 전 재검증을 강제한다.
- 저장은 `POST /alert-channels`, 삭제는 `DELETE /alert-channels/{id}`를 사용하고 성공/실패 toast와 삭제 확인 모달을 제공한다.
- `features/notifications/AlertChannelsView.tsx`, `features/notifications/api.ts`, `features/org/SettingsNav.tsx`, `app/router.tsx`의 알림 채널 범위는 `@/ui` 프리미티브와 Tailwind token만 사용한다. `@/shared/ui`, `@/shared/motion`, `@/plural-ui`, inline `style=`, raw hex, feature `.css` 의존은 0건이다.
- 검증(2026-07-08 08:27 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 `/settings/alerts`를 1440/1024/390 폭에서 순회했고, 초기 저장 비활성, 테스트 전 저장 비활성, 테스트 성공 후 저장 활성, 입력 변경 후 저장 재비활성, horizontal overflow 0, unexpected console error 0 확인.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `cb10b438-alert-channels-ui-20260708083237`, `AlertChannelsView-DACvgMIP.js`와 `SettingsNav-Br9x1klQ.js` lazy chunk 서빙 확인.

## 클러스터 등록 위저드 UX 변경 (2026-07-08)

- `RegisterClusterWizard`를 `@/ui` 프리미티브만 사용하도록 재작성했다. 레거시 `@/shared/ui`, `uiStore`, shared `queryClient` 싱글턴, `.cluster-registration-*`, inline style 의존은 제거했다.
- 지원 provider: `eks`, `gke`, `aks`, `existing-k8s`, `kind`, `minikube`. local 선택지는 kind/minikube 세그먼트로 분기한다.
- 공통 필드: `cluster_id`, 표시 이름, 환경, 고급 `management_base_url`. provider별 필드는 `provider_config`로 전송한다.
- 버튼 활성 조건: 모든 필수 provider 필드가 공백 없이 유효해야 `확인`이 활성화된다. 초기 등록은 `POST /targets/preflight` 성공 후에만 `POST /targets`가 실행된다.
- 등록 성공 후 설치 단계는 응답의 `bootstrap_steps`를 우선 표시하고, 없으면 `bootstrap_command`, `install_command`, `install_manifest` 순으로 fallback한다. 모든 명령은 `CodeBlock` 복사 버튼을 사용한다.
- 연결 대기 상태는 `pending`, `connected`, `install_expired/expired`, `error/failed/disconnected`를 구분한다. pending은 5초 폴링, connected는 evidence 정책 CTA, expired/error는 재발급 CTA를 제공한다.
- 닫기 가드: 설치 명령이 발급됐지만 연결 전이면 확인 모달을 먼저 띄우고, agent token은 현재 화면에서만 노출한다.

## 레포↔클러스터 연결 UX 변경 (2026-07-08)

- `ConnectRepoWizard` 2단계는 `GET /clusters`의 `connection_status`와 `role`을 함께 사용한다. 연결된 target 클러스터만 선택 가능하며, 미연결 클러스터는 "에이전트 미연결"과 "연결하러 가기" 링크, 관리 클러스터는 "관리 클러스터" 비활성 뱃지로 표시한다.
- 멀티 선택과 "전체 선택"은 선택 가능한 target 클러스터만 대상으로 한다. 확인 단계에는 `cluster-1 외 N개에 배포` 요약과 클러스터 상세 링크를 표시한다.
- 선택 가능한 클러스터가 0개면 `EmptyState("배포하려면 연결된 클러스터가 필요합니다")`와 admin 전용 `RegisterClusterWizard` 중첩 오픈 CTA를 제공한다.
- `RepoListView`는 `@/ui` 기반 카드 목록으로 교체했고, 각 배포 정의 카드에 연결된 클러스터 뱃지를 노출한다. 뱃지는 클러스터 상세로 이동한다.
- `ClusterDetailView`는 "이 클러스터에 배포된 레포" 섹션을 추가해 레포/브랜치/manifest/namespace/status 관계를 반대 방향에서도 확인할 수 있다.
- `/console`과 `/console/*`는 `/`로 redirect하고, `ArchivedConsoleDemo` 소스는 삭제했다. 사이드바/브레드크럼 어휘는 "클러스터", "배포"로 정렬했다.

## 레포 상세 디자인 시스템 이관 (2026-07-08)

- `RepoDetailView`를 `@/ui` PageHeader/Breadcrumb/Tabs/Card/Table/Badge/CodeBlock/KeyValueList/EmptyState/Skeleton과 `@/ui/motion` list preset 기반으로 재구성했다.
- `@/shared/ui`, `@/shared/motion`, `@/plural-ui`, inline `style=`, legacy CSS var 의존을 제거했다.
- 실행 이력, 배포 대상, Safe PR 탭은 loading, empty, error+retry 상태를 모두 갖는다. 승인 대기 run은 공유 `ApprovalCard`와 token 기반 PlanDiffPanel을 표시한다.
- `useApproval`은 legacy `uiStore` toast 대신 `@/ui` toast를 사용하고 성공/실패 사유를 한국어로 표시한다.
- 검증(2026-07-08 08:41 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. 금지 패턴 grep(`@/shared/ui`, `@/shared/motion`, `@/plural-ui`, inline `style=`, raw hex, legacy css var, `.css`) 0건. Playwright 계약 스모크로 `/repos/app-1`를 1440/1024/390 폭에서 순회했고 실행/배포 대상/Safe PR/설정 탭 표시, horizontal overflow 0, 의미 있는 console error 0 확인. screenshots: `/tmp/repo-detail-desktop.png`, `/tmp/repo-detail-tablet.png`, `/tmp/repo-detail-mobile.png`.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `77ecf6be-repo-detail-ui-20260708084354`, `RepoDetailView-a14V4fYv.js`와 `ApprovalCard-Ci8lQGAe.js` lazy chunk 서빙 확인.

## 카탈로그 디자인 시스템 이관 (2026-07-08)

- `CatalogView`를 `@/ui` PageHeader/Card/Badge/Button/Skeleton/EmptyState/Toast와 `@/ui/motion` list preset 기반으로 재구성했다.
- `@/shared/ui`, `@/shared/motion`, `@/plural-ui`, legacy `uiStore`, inline `style=`, raw hex, legacy CSS var, feature `.css`, Tailwind arbitrary value 의존을 제거했다.
- 목록 loading은 Skeleton 카드 그리드, empty는 "설치 항목 없음" + 새로고침 CTA, error는 "카탈로그 조회 실패" + 재시도 CTA로 분리했다.
- 설치 mutation은 카드별 pending을 유지하고 성공/실패 toast를 제공한다. 기존 `{}` 요청 대신 `CatalogInstallRequest`의 필수 `application_name`을 item slug/name에서 생성해 함께 보낸다.
- 검증(2026-07-08 08:50 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. 금지 패턴 grep(`@/shared/ui`, `@/shared/motion`, `@/plural-ui`, inline `style=`, raw hex, legacy css var, `.css`, Tailwind arbitrary value) 0건. Playwright 계약 스모크로 `/catalog`를 1440/1024/390 폭에서 순회했고 카탈로그 카드/태그/설치 요청 toast, POST body `{application_name:"postgresql", values:{}}`, horizontal overflow 0, 의미 있는 console error 0 확인. screenshots: `/tmp/catalog-desktop.png`, `/tmp/catalog-tablet.png`, `/tmp/catalog-mobile.png`.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `b3c86e1c-catalog-ui-20260708085319`, `CatalogView-D9Tir7kG.js` lazy chunk 서빙 확인.

## 레거시 toast 경로 제거 (2026-07-08)

- `app/providers.tsx`에서 `@/shared/ui` `<Toasts />`를 제거하고 `@/ui` ToastProvider/ToastViewport만 사용한다.
- `cluster/api.ts`, `metrics/api.ts`, `chat/api.ts`의 mutation toast를 legacy `uiStore`에서 `useToast()`로 이관했다. 스케일/재시작/등록 해제, 메트릭 쿼리/위젯 저장·삭제·실행, AI 복구 액션 선택 성공/실패가 모두 `@/ui` toast를 사용한다.
- 검증(2026-07-08 09:07 KST): `rg "uiStore|@/shared/ui|Toasts" frontend/src/app frontend/src/features` 0건. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `2f18aada-toast-cleanup-20260708090840`, main chunk와 `MetricsView-B2CuNqJu.js`에서 신규 toast 문구 서빙 확인.

## 클러스터 제어 UX 변경 (2026-07-08)

- `role=management` 클러스터는 목록과 홈 플릿 히트맵에서 "관리 클러스터" 뱃지를 표시한다.
- 관리 클러스터 상세는 조회 전용 안내를 표시하고 스케일, 재시작, 등록 해제 버튼을 숨긴다. 배포 대상 선택에서도 관리 클러스터를 제외한다.
- target 클러스터 상세에는 admin 전용 "등록 해제" 위험 영역을 추가했다. GitHub식 확인으로 클러스터 이름을 직접 입력해야 실행 가능하며, 성공 후 `CodeBlock`으로 에이전트 제거 명령을 제공한다.
- 등록 해제 실패가 409 `has_deployments`면 연결된 배포 정의 목록과 레포 상세 이동 링크를 인라인으로 표시한다.

## 히트맵 드릴다운 UX 변경 (2026-07-08)

- 공용 `DrilldownHeatmap` 컴포넌트를 추가했다. 홈 L1(fleet 클러스터)과 클러스터 상세 L2/L3(노드/팟)가 같은 타일 레이아웃, breadcrumb, Motion `layout` 전환, health token 색상 체계를 공유한다.
- L1 fleet: 타일=클러스터, 크기=`pods_total`, 색=`health`, 관리 클러스터 뱃지 표시.
- L2 노드: `GET /clusters/{id}/nodes/summary`를 우선 사용하고 미배포 404일 때 기존 inventory summary/pod inventory로 fallback한다. 타일=노드, 크기=`pods_running`, CPU/MEM 미니 게이지, condition 뱃지를 표시한다.
- L3 팟: `GET /clusters/{id}/nodes/{node}/pods/summary`를 우선 사용하고 404일 때 pod inventory fallback을 사용한다. 타일=팟, 크기=CPU/MEM 또는 균등, `incident_correlation_id`가 있으면 critical + pulse border로 표시하고 Drawer에서 "인시던트 보기" CTA를 제공한다.
- 클러스터 상세 URL은 `/clusters/{id}?node=<node>&pod=<namespace/name>`로 노드/팟 뎁스를 동기화해 새로고침과 공유, 브라우저 뒤로가기를 지원한다.
- 팟 Drawer는 search param에서 파생한다. 팟 목록 로딩 중에는 Skeleton, 조회 실패는 재시도, stale URL은 "팟 상세 없음" EmptyState로 처리한다.
- 검증(2026-07-08 07:19 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 1440/1024/390 폭에서 `/clusters/cluster-1?node=node-a&pod=prod%2Fcheckout-api-7f9f8` 복원 확인, overflow 0. 클릭 왕복은 `/clusters/cluster-1` → `?node=node-a` → `?node=node-a&pod=prod%2Fcheckout-api-7f9f8` → 뒤로가기 2회까지 확인.
- 보강(2026-07-08 09:01 KST): `DrilldownHeatmap`은 선택 노드 `layoutId`를 zoom shell로 재사용해 노드 타일이 부모 영역으로 확장된 뒤 팟 타일이 같은 그리드 안에 나타난다. `useReducedMotion()`이 true면 layout/stagger를 끄고 `@/ui/motion`의 `transitions.reduced`만 사용한다. 인시던트 팟은 `ring-danger` pulse border로 표시한다.
- 보강 검증: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 `/clusters/cluster-1` 클릭 왕복에서 `?node`/`?pod` URL, Drawer, "인시던트 보기", pulse border, 뒤로가기 2회, reduced-motion 환경, overflow 0, console error 0을 확인했다. `/clusters/cluster-1?node=node-a&pod=prod%2Fcheckout-api-7f9f8` 직접 진입은 1440/1024/390 폭에서 Drawer/CTA/breadcrumb 복원과 overflow 0을 확인했다.
- 보강 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `62a28572-heatmap-motion-20260708090258`, `ClusterDetailView-BMnacLsD.js` lazy chunk 서빙 확인.

## AI 채팅 디자인 시스템 이관 (2026-07-08)

- `ChatView`를 `@/ui` PageHeader/Card/Field/Textarea/Badge/Tooltip/EmptyState/Skeleton/Toast와 `@/ui/motion` preset으로 재구성했다. feature 내부의 `@/shared/ui`, `@/shared/motion`, `.chat-*` 레거시 class, inline style, raw hex 의존은 0건이다.
- 대화 목록/메시지/도구 호출/복구 조치/승인 카드 모두 같은 surface, border, typography, shadow 토큰을 사용한다. 삭제/생성/전송 실패는 toast로 사유를 노출하고, 목록·상세는 로딩/빈/오류+재시도 상태를 각각 갖는다.
- LLM provider/API key/quota/auth 계열 오류 또는 `conversation.status=failed`가 감지되면 composer를 숨기고 "AI 설정 확인 필요" 또는 "AI 응답 실패" 안내 카드와 `운영 설정` CTA를 먼저 보여준다. 현 백엔드에 별도 설정 조회 API가 없어 오류 계약 기반 선행 차단으로 구현했다.
- 복구 조치 선택 권한은 `service_admin` 또는 `release_operator` 역할로 통일했고, 권한이 없으면 버튼 비활성 + `release_operator 권한 필요` Tooltip을 표시한다. 선택 성공 시 `chatKeys.list()` 캐시를 무효화한다.
- `ApprovalCard`는 repo·workflow·chat·notifications 공유 단일 구현을 유지하되 `@/ui` 프리미티브와 `useSession` 역할 체크로 정리했다.
- 검증(2026-07-08 07:58 KST): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. Playwright 계약 스모크로 `/ai/aic-1` 1440/1024/390 폭에서 메시지/도구 호출/복구 조치/승인 카드/빈 draft 전송 차단/복구 조치 선택 활성 전환/horizontal overflow 0을 확인했다. `/ai` LLM 설정 오류 계약(503 raw detail `LLM_PROVIDER is not configured`)에서는 composer 0건, `운영 설정` CTA 1건, overflow 0을 확인했다.
- 배포(2026-07-08 08:00 KST): Actions가 `steps: []`로 실패해 수동 console image `ce75d57c-ai-chat-ui-20260708074225`를 `mgmt/management` console deployment에 롤아웃했다. `https://k8s.woonyong.org/` 200, `/api/healthz` 200, live chunks `ChatView-RjgESk8p.js`와 `ApprovalCard-DlHhFo68.js`에서 새 LLM 안내/권한/승인 문구를 확인했다.

## 설정/조직 디자인 시스템 이관 (2026-07-08)

- `SettingsNav`, `MembersView`, `OrganizationsView`, `GroupsView`, `AccessView`, `OpsView`를 `@/ui` PageHeader/Card/Table/Field/Input/Select/Modal/Drawer/Badge/EmptyState/Skeleton/Toast 기반으로 재구성했다. 설정/조직 범위의 `@/shared/ui`, `@/shared/motion`, 레거시 UI 계층, inline style, raw hex 의존은 0건이다.
- 멤버 목록은 검색 0건 시 `필터 초기화` CTA를 제공하고, 가입 승인 pending/성공/실패 toast를 `@/ui` ToastProvider로 표시한다.
- 조직/그룹 생성은 현재 목록 기준 이름 중복을 입력 중 인라인으로 차단하고, 유효할 때만 제출 버튼이 활성화된다.
- 그룹 멤버 Drawer는 멤버 목록 로딩/빈/오류+재시도 상태를 갖고, `last_admin` 응답은 "최소 1명의 관리자 필요" 인라인 사유로 표시한다.
- 권한 부여/회수와 DLQ 재처리는 확인 모달에 대상 요약을 표시하고, 실행 중 해당 버튼만 pending 상태가 된다.
- 검증: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q`, `make check`, `make manifest-check` 통과.
- Playwright 계약 스모크: `/settings/members`, `/settings/orgs`, `/settings/groups`, `/settings/access`, `/settings/ops`를 1440/1024/390 폭에서 순회했다. 멤버 검색 0건+필터 초기화, 조직/그룹 중복 이름 제출 차단, `last_admin` 인라인 오류, 권한 회수 요약 모달, DLQ 재처리 요약 모달, horizontal overflow 0, console error 0 확인.
- 배포 확인: GitHub Actions는 `steps: []`로 코드 실행 전 실패해 수동 ECR/rollout을 수행했다. live `https://k8s.woonyong.org/`와 `/api/healthz` 200, console image `c1c7bf87-settings-org-ui-20260708080409`, 설정/조직 lazy chunk 6종 서빙 확인.

# 프론트엔드 프로덕션 감사 (AUDIT) — 콘솔 승격 패스

기준: 프로덕션 빌드에서 운영 외 응답 경로·레거시 데이터·고정 수치는 전부 결함.
이번 패스: **Plural 스타일 콘솔이 루트(`/`) 앱으로 승격**, 구 베이스 앱 셸/화면 삭제, 전 화면 실데이터화.
후속 패스(2026-07-07 오후): **운영 외 응답 레이어 자체를 삭제** — 코드베이스에 실데이터가 아닌 화면 경로가 아예 없음(섹션 D).

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
| `/metrics` | 실시간(WS)·스냅샷 시계열·온디맨드 PromQL | WS `/api/live/browser`, `GET /clusters/{id}/usage`, `POST /metrics/validate`, `POST /agent/debug/query` → `GET /commands/{id}` 폴링 |
| `/ai`, `/ai/:id` | AI 채팅(도구 호출·복구 액션·승인 카드) | `GET/POST /ai/conversations*`, `POST /rca/recovery-plans/*/actions/*/select` |
| `/catalog` | 서비스 카탈로그 | `GET /catalog/items`, `POST /catalog/items/{id}/installs` |
| `/settings/{members,orgs,groups,access,ops}` | 조직/그룹/멤버/권한/DLQ (admin 가드) | `GET/POST/DELETE /users·/orgs·/groups·/access`, `POST /auth/users/{id}/approve`, `POST /dead-letters/{id}/replay` |
| `/login /signup /pending /verify-email` | 인증 | `POST /auth/*`, `GET /auth/session` |
| `/console/*`, `/plural/*`, `/overview*`, `/notifications` | 리다이렉트 | → `/` (`/notifications` → `/incidents`) |

신규 집계 계약(백엔드에서 병행 구현 중, `features/fleet/api.ts` 에 타입 고정):
- `GET /fleet/summary` → `{clusters:[{cluster_id,name,health,pods_running,pods_total,nodes_ready,nodes_total,open_incidents,restarts_recent,cpu_pct,mem_pct,last_seen}], totals:{clusters,healthy,warning,critical,open_incidents,pending_approvals,running_workflows,dead_letters}}`
- `GET /clusters/{id}/summary` → `{workloads[], recent_events[], open_incidents[], usage:{cpu_pct,mem_pct,restarts_total}}`
- 엔드포인트 미배포 상태에서는 QueryBoundary 가 오류+재시도(정직한 상태)로 표시 — 배포되면 즉시 동작.

## C. 백엔드 도메인이 없는 복각 섹션 처리 (레거시 데이터 삭제)

| 구 콘솔 섹션 | 결정 |
|---|---|
| CD(clusters/services/pipelines/repos/globalservices/observers) | **재설계-흡수** — 실 도메인 `/clusters`(인벤토리)·`/repos`(GitOps)·`/workflows`(파이프라인) 로 대체 |
| Stacks / Kubernetes 뷰어 | **흡수** — `/clusters/:id` 리소스/워크로드 탭(실측 인벤토리) |
| Alerts / AI threads / sentinels | **흡수** — `/incidents`(RCA 타임라인) · `/ai`(실 대화) |
| Home 위젯보드·플릿맵(레거시 데이터) | **재구현** — `/` 홈이 `GET /fleet/summary` 기반 히트맵(Treemap)·집계 카드·테이블로 대체 |
| Marketplace/번들/퍼블리셔 | **삭제** — 대응 도메인 없음. 설치형 카탈로그는 실 `/catalog` 로 대체 |
| Cost management / Security(취약점·컴플라이언스) / Edge / Flows / Workbenches / Self-service PR | **삭제** — 백엔드 도메인 없음(fabricated 데이터 금지) |
| Cloud shell / Audits(geo·login) / Profile(키·토큰) / Personas / OIDC·SMTP 등 설정 복제 | **삭제** — 실 설정은 `/settings/*` (orgs/groups/members/access/ops) |
| 역할 전환 데모(viewer.tsx "View as") | **삭제** — 권한은 실 세션(`roles`)과 서버 검증으로만 |

삭제 파일: `features/plural/**`(5), `features/console/{local-api,metrics,flows,popups,viewer,ChatPanel,live,routes,api/**,map/**,widgets/**,pages/{AiMisc,Cd,Drill,Settings,StacksK8s}Pages}`(29), `app/shell/**`(2), `features/fleet/{FleetHeatmapView,score}`(2), plural-ui 데드 코드(`PluralLayout/PluralShell/SaveButton` — 로컬 저장 버튼 포함) = **38개 파일 + 데드 익스포트 제거**.

## D. 운영 외 응답 경로 삭제 (2026-07-07 후속 패스)

- `shared/lib/local-api/{data,router}.ts`(463줄 로컬 응답/라우터) **삭제**. `API_MODE`/`VITE_API_MODE` 개념 자체 제거 —
  `shared/lib/api.ts` 는 무조건 실 fetch, `shared/lib/live.ts` 는 무조건 실 WS.
- `frontend/.env.development` 삭제(검증 플래그만 담던 파일). 로컬 개발은 vite proxy(`VITE_BACKEND`, 기본 127.0.0.1:8000)로 실 백엔드에 붙는다.
- 콘솔 헤더의 "검증 모드" 칩 제거(도달 불가 상태였음).
- CI env 가드(.github/workflows/ci.yml)·scripts/frontend-check.sh 의 검증 예외/플래그 정리.
- grep 검증: 운영 외 응답 레이어 참조 0건(src 전체).
- 고정값 사용 제거: 로그인 이메일 prefill(`admin.local@example.com`) 삭제(이전 패스).

## E. 애니메이션/모션 일관성

- React Flow: `AnimatedEdge`(dash-flow + animateMotion 패킷), dagre 자동 배치, fitView 전환 — 워크플로 그래프·RCA 파이프라인.
- Motion: 섹션 전환 fadeRise(콘솔 셸), 카드/리스트 enter-exit(`AnimatedList`/`Stagger`/`AnimatedRow`), 모달 pop·플라이오버 slide(plural-ui variants), LIVE 인디케이터 `PulseOnChange`, CountUp 스탯.
- Nivo: crosshair + 슬라이스 툴팁 + 시리즈 전환 애니메이션(`TimeSeriesChart`), 플릿 히트맵 Treemap.
- `MotionConfig reducedMotion="user"` + 개별 `useReducedMotion` 폴백으로 prefers-reduced-motion 전면 존중.

## F. 실시간

- WS 단일 연결(`startLive`)은 콘솔 셸 마운트 시 1회 — 지수 백오프 재연결, `live.summary`/스냅샷 반영.
- 반영 지점: 셸 LIVE 인디케이터(pulse), 메트릭 실시간 차트, 클러스터 상세 hot 팟 표시.
- 홈 상단 StatCard의 장식성 스파크라인 제거. 홈의 차트는 연결된 클러스터의
  `GET /clusters/{id}/usage?limit=120` 샘플을 30초 간격으로 조회해 `TimeSeriesChart` 두 장
  (실행 팟 추이, 재시작 증가)으로 표시한다. `restart_total`은 누적 카운터라 샘플 간 증가분으로 변환한다.
- 2026-07-08 라이브 확인: 기본 워크스페이스의 `cluster-1`은 `pending_install`, `node_count=0`,
  `pod_count=0`, `/nodes/summary=[]`, pod inventory `0`으로 응답한다. 상세 화면은 이 상태를
  빈 리소스가 아니라 `Agent 미연결`/`설치 대기`로 표기한다.
- 클러스터 상세/목록/Home 핵심 운영 화면의 설명성 문구와 StatCard 미니 스파크라인을 제거했다.
  노드/팟 드릴다운은 `/nodes/summary` 또는 `/nodes/{node}/pods/summary`가 빈 배열을 반환해도
  inventory summary/resources fallback으로 한 번 더 복구한다.

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

- [x] **클러스터 상세 스케일/재시작 대상 오류**: legacy adapter 시절 팟 이름 규칙(`name.replace(/-pod-.*/)`)으로
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
- [x] 라이브 번들 검증(12:47): `클러스터 맵`/검증 모드/비용 문자열 0건 — 스크린샷 구화면 소멸 확인.

이상 없음 확인(수정 불요): 등록/연결 위저드(닫기 가드·검증·실패 복구), 조직 삭제 type-to-confirm,
그룹 멤버 토글, DLQ 재처리 확인, 채팅 전송 실패 시 입력 복원, 카탈로그 카드별 pending 분리,
워크플로우 그래프 로딩/404 처리, 로그인 오류 상태별 메시지.

## J. RCA/메트릭 프로덕션 뷰어 (지시 3)

- `/rca-reports` 확장 필드 사용: 후보 평가 점수표(선정 강조·rule/AI 출처·✓충족/✗미충족 신호),
  근거 쿼리 트레일(소스별 실행 쿼리 원문 — 운영자가 재현 가능), 대상 리소스, 부증상, 미수집 체크.
  구 응답(필드 없음)에도 안전(optional + fallback 렌더).
- 메트릭: 실측 계열 프리셋 6종(%, count 단위 자동 포맷), range 5m~6h, agent 실측 결과만 표시.
- 카탈로그 문서: `docs/frontend-metrics-queries.md`(색인 등재, test_docs_index 그린).

## K. 인시던트 복구/AI/드릴다운 연결 패스 (2026-07-08)

- 인시던트 상세는 raw key 중심 표시를 줄이고 `상황 요약` 카드에서 대상, 증상, 근본 원인, 신뢰도,
  다음 조치를 한국어 운영 용어로 보여준다. correlation/command id는 복사 보조 정보로만 유지한다.
- `GET /rca/recovery-plans/by-correlation/{id}` 후보를 같은 화면에서 선택할 수 있다.
  선택은 기존 `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select`만 사용하며,
  성공/실패 토스트와 recovery/timeline/incident 재조회로 상태를 갱신한다.
- `AI 분석`은 기존 `/ai/conversations`로 새 대화를 만들고 incident/correlation/resource context를 전달한다.
  AI 화면은 같은 context를 표시하고, 기존 action card는 recovery action select API를 그대로 사용한다.
- 클러스터 드릴다운은 열린 인시던트가 Pod가 아니라 Deployment/ReplicaSet/Service로 잡혀도 owner/prefix/label 관계로
  관련 Pod 타일을 critical+pulse로 표시한다. 새 API 없이 기존 timeline projection과 pod summary를 연결한다.
- RCA 6개 데모 시나리오(crashloop, oom, imagepull, probe-fail, sched-fail, svc-selector)는 모두
  RCA completed + recovery planned 경로를 focused test로 고정했다.

## L. 드릴다운 관찰 대상 정리 및 라이브 반영 (2026-07-08)

- 드릴다운의 node/pod summary는 운영자가 조치할 워크로드만 보이도록 조정했다. `target`, `management`,
  `kube-system`, `monitoring` 등 운영 namespace와 `cluster-agent`, `node-collector`, telemetry stack 이름 마커는
  backend summary와 frontend fallback 양쪽에서 제외한다.
- `default`/`sandbox`의 데모 워크로드는 유지하므로 장애 주입 시 Pod 타일, 색상, pulse, 인시던트 이동 흐름은 계속 보인다.
- 검증: `tests/test_fleet_router.py::test_node_pods_summary_hides_agent_and_management_pods`,
  `tests/test_fleet_router.py::test_node_pods_summary_filters_node_and_links_incident`, RCA/AI/드릴다운 관련 focused suite 105 passed,
  `bash scripts/frontend-check.sh` passed.
- 라이브 반영: service image `0aa81ea5-drilldown-agent-filter-20260708125500`, console image
  `0aa81ea5-drilldown-agent-filter-20260708125500`로 management deployment 전체 rollout 완료.
  live `/api/healthz` 200, root asset `/assets/index-YIJZma8H.js`, cluster detail chunk `ClusterDetailView-CwucS_FI.js` 서빙 확인.

## M. 데모 RCA 복구계획·토폴로지 실측 패스 (2026-07-08)

- RCA가 `rca.analysis_blocked`로 끝나도 root cause 후보가 식별된 경우 기존 `RecoveryPlanner`를 재사용해
  `recovery.planned`를 추가 발행한다. 단, blocked 경로는 자동 실행하지 않고 모든 후보를 `selection_required`
  상태로 강제해 운영자가 복구 버튼을 선택해야 진행된다.
- Safe PR 복구 후보가 구체 patch 없이 끝나는 경우에도 `.gitops/recovery/*.md` 검토 패치를 생성해
  기존 safe-pr-worker/scm-worker 경로가 끊기지 않는다. 실제 cluster 변경은 기존 command approval 경로
  (restart/scale)와 GitOps manifest diff 경로가 맡는다.
- 클러스터 상세는 Pod summary의 `cpu_mcores`/`mem_mib`를 읽어 mCPU/MiB로 표시한다. 퍼센트 실측이 있으면
  기존 gauge를 우선 사용하고, 없으면 수치 fallback을 보여준다.
- `target`, `management`, `kube-system`, `monitoring` 등 운영 namespace와 agent/telemetry 이름 마커는
  Pod뿐 아니라 워크로드/서비스/리소스/이벤트 탭에서도 동일하게 제외한다. `sandbox` 데모 워크로드는 계속 표시한다.
- `집계 요약` 500 원인은 열린 인시던트 row의 대상 필드(`namespace/resource_kind/resource_name`)가 응답 모델에서
  허용되지 않았기 때문이다. 계약에 필드를 추가하고, router에서 허용 필드만 정규화해 extra field가 다시 500을 만들지 않게 했다.
- Motion 토큰은 시연 화면의 과한 이동감을 줄이기 위해 fast/base/slow를 100/160/240ms 계열로 낮췄고,
  prefers-reduced-motion 경로는 기존 프리셋을 유지한다.
- 검증: `PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py tests/test_target_kubernetes_evidence.py tests/test_inventory_domain.py tests/test_fleet_router.py -q`
  48 passed, `PYTHONPATH=src .venv/bin/python -m ruff check src tests` passed, `bash scripts/frontend-check.sh` passed.

## N. 라이브 데모 안정화 핫픽스 (2026-07-08)

- 클러스터 등록 위저드: `/targets/preflight`에는 `name`/`environment`를 보내지 않고, `/targets` 등록 요청에만 포함한다.
  `extra_forbidden` 422가 다시 나지 않도록 payload 함수를 분리했다.
- kind/minikube 등록의 `환경` 라벨은 설치 환경으로 오해되지 않게 `운영 구분`으로 변경했고,
  로컬 provider는 `dev`로 고정 표시한다. 설치 방식은 raw key(`manual-manifest`) 대신 `수동 manifest`로 표시한다.
- 클러스터 상세/메트릭/AI/레포 상세의 URL search param 갱신은 `preventScrollReset`을 사용한다.
  필터나 입력값 변경 시 화면이 맨 위로 튀는 현상을 막는다.
- 클러스터 상세의 `배포된 레포`가 비는 원인은 application name과 deployment binding app_name이 drift된 데이터였다.
  같은 repository + manifest_path binding도 같은 배포 정의로 조회해, GitOps가 만든 관계가 UI에서 사라지지 않게 했다.
- 검증: backend focused suite 50 passed, `ruff check src tests` passed, `bash scripts/frontend-check.sh` passed.
- 라이브 반영: service/console image `d6a27854-demo-hotfix-20260708142734` rollout 완료.
  `TARGET_AGENT_IMAGE`, `GITOPS_WEBHOOK_IMAGE`, target-agent `NODE_COLLECTOR_IMAGE` runtime 값도 같은 service image로 맞췄다.
  배포 직후 startup DDL 경합으로 `/nodes/summary` lock timeout이 일시 발생했으나, 30초 관찰에서 DB blocked lock 0,
  긴 idle transaction 0, `/api/healthz` OK, 최근 api-gateway 500/validation/lock 로그 0건을 확인했다.

## O. 데모 RCA/GitOps 복구 흐름 안정화 (2026-07-08)

- 데모 앱의 `orders-api` 5xx 로그는 실제 live 로그 형태인 `event=intentional_error_endpoint` 또는
  `intentional error endpoint called` 문자열만으로도 `application_5xx_spike` 증상으로 감지한다.
- evidence 수집 시각 기준 5분을 넘긴 로그는 새 장애 신호로 사용하지 않는다. 정상화 후 과거 5xx 로그가
  1분마다 새 인시던트처럼 반복 생성되는 회귀를 막는다.
- `application_5xx_spike` 복구 후보 순서:
  1. `gitops_recovery_review` — 승인 필요, route `draft_pr`, 실제 manifest patch가 명시되지 않으면
     `.gitops/recovery/*.md` 검토 문서만 생성한다. 특정 demo 파일명·이미지 태그를 고정값 사용하지 않는다.
  2. `deployment_scale` — 승인 필요, 임시 replica 3 증설 command.
  3. `rollout_restart` — 보조 재시작 command.
- 승인 후 Safe PR 요청은 plan target과 action params를 함께 사용해 repository/binding/application/workflow 식별자를
  이벤트에 담는다. SCM worker는 기존 `safe_pr.requested -> safe_pr.patch_prepared -> safe_pr.ready_for_creation`
  경로로 실제 PR branch와 manifest patch commit을 생성한다.
- 드릴다운 히트맵은 과한 zoom/layout 애니메이션과 health 색 채움을 줄였다. 같은 컴포넌트와 상태 토큰은 유지하되,
  타일은 중립 surface + health bar/left border로 표시해 노드/팟 관찰 화면이 깨지지 않게 했다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest tests/test_incident_symptom_derivation.py tests/test_rca_evidence.py tests/test_rca_rule_catalog.py -q` → 60 passed.
  - `PYTHONPATH=src .venv/bin/python -m ruff check src/services/ai/agent/pipeline/incident.py src/services/ai/agent/recovery/dispatch.py src/services/ai/agent/recovery/builtin.py tests/test_incident_symptom_derivation.py tests/test_rca_evidence.py` → passed.
  - `cd frontend && npm run test -- --test-name-pattern="cluster drilldown|home fleet charts|live stream"` → 17 passed.
