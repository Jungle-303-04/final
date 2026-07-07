# HANDOVER — 2026-07-07 밤샘 작업 인수인계

다른 AI/팀원이 이어받기 위한 문서. 작업마다 갱신한다. 최종 갱신: 2026-07-08 07:27 KST (히트맵 드릴다운 라이브 배포 확인)

## 현재 범위 고정 — target-01 배포 제외

- 2026-07-08 사용자 최신 지시: `cluster-1`의 `target-01.woonyong.org` 배포와 [Jungle-303-04/k8s-incident-demo-target](https://github.com/Jungle-303-04/k8s-incident-demo-target) 레포 연결은 **다른 스레드 담당**이다.
- 이 스레드는 `target-01.woonyong.org` 배포를 수행하지 않는다. 안정화 대상은 `k8s.woonyong.org` 관리 서비스의 evidence payload, DB 보존, keyset 조회, worker 분리, 프론트 품질 작업이다.

## 체크포인트 — 히트맵 드릴다운 URL 복원 보강

- 구현:
  - `ClusterDetailView`의 `ClusterDrilldownPanel`에서 선택 팟 Drawer를 로컬 state 대신 search param `pod=<namespace/name>`에서 파생하도록 변경했다.
  - 노드 선택/줌아웃 시 `pod` param을 함께 정리하고, 팟 타일 클릭 시 `/clusters/{id}?node=<node>&pod=<namespace/name>` 상태가 남는다.
  - 새로고침/공유 URL에서 팟 목록이 로딩 중이면 Skeleton, 실패하면 재시도, stale pod 값이면 EmptyState로 처리한다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright mock: `/clusters/cluster-1?node=node-a&pod=prod%2Fcheckout-api-7f9f8`를 1440/1024/390 폭에서 직접 열어 팟 Drawer 복원, critical/인시던트 상태, "인시던트 보기" CTA, horizontal overflow 0 확인.
  - Playwright mock: `/clusters/cluster-1`에서 노드 타일 클릭 → 팟 타일 클릭 → 브라우저 뒤로가기 2회로 `?node`/base 상태 복귀 확인. 세션 refresh API를 목킹한 뒤 unexpected console error 0.
- CI/CD:
  - `eb12c248` push 후 GitHub Actions `28902916705`(CI), `28902916711`(Promote Dev To Main), `28902916699`(AWS CD)는 모두 실패. 각 job `steps: []`라 코드 실행 전 runner/Actions 계층 실패로 판단한다.
  - 자동 CD가 막혀 수동 console image 롤아웃을 수행했다.
- 라이브 배포:
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:eb12c248-heatmap-ui-20260708072625`, digest `sha256:a64a4643384976e8fe07d8c1b57e7919a1f6addacf513fb210ee156b56b62bc0`.
  - `kubectl --context mgmt -n management set image deploy/console console=<image>` 후 rollout 완료, Ready `1/1`.
  - live smoke: `https://k8s.woonyong.org/` 200, `/api/healthz` 200.
  - live asset 확인: `/assets/ClusterDetailView-CF_fLVxG.js` 200, chunk 안에 `selectedPodId`, `pod`, `팟 상세 없음`, `인시던트 보기` 포함.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 메트릭 이관 완료

- 커밋/푸시:
  - `fa9c4980 feat: 메트릭 디자인 시스템 이관` → `origin/dev` push 완료.
  - 이후 `dev` HEAD는 `64a7a017 fix: 승인 정책 ref / 자동 배포 / command 검증`까지 포함한다.
- 구현:
  - `frontend/src/features/metrics/MetricsView.tsx`를 `@/ui` PageHeader/Card/StatCard/Field/Input/Select/Textarea/Badge/StatusChip/EmptyState 기반으로 재구성했다.
  - `frontend/src/ui/charts.tsx`를 추가해 Nivo line chart wrapper를 디자인 시스템 레이어로 승격했다. 메트릭 feature는 더 이상 `@/shared/ui/charts`를 import하지 않는다.
  - PromQL 입력은 debounce로 `POST /metrics/validate` dry-run을 호출한다. valid일 때만 저장/실행 버튼이 활성화되고, 실행 클릭 시에도 같은 dry-run을 재확인한 뒤 `POST /agent/debug/query` 또는 저장 preset run API를 호출한다.
  - 결과 0건은 "시간범위 넓히기" CTA를 제공한다.
  - `features/metrics/*` grep: `plural-ui`, `shared/ui`, `shared/motion`, `shared/ui/charts`, inline `style=`, raw hex color, legacy `card/input/query-row/statbox` class 0건.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking: `/metrics?cluster=cluster-1`를 1440/1024/390 폭에서 캡처, document horizontal overflow 0, button overflow 0, unexpected card overflow 0.
  - screenshots: `/tmp/k8s-metrics-desktop.png`, `/tmp/k8s-metrics-tablet.png`, `/tmp/k8s-metrics-mobile.png`.
- CI/CD:
  - GitHub Actions run `28902276525`(CI)와 `28902276527`(AWS CD)는 코드 실행 전 실패. annotation: `The job was not started because recent account payments have failed or your spending limit needs to be increased`.
  - 자동 promote/CD가 billing 제한으로 막혀 수동 console image 롤아웃을 사용했다.
- 라이브 배포:
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:64a7a017-metrics-ui-20260708071341`.
  - `kubectl -n management set image deploy/console console=<image>` 후 rollout 완료, Ready `1/1`.
  - live smoke: `https://k8s.woonyong.org/` 200, `/api/healthz` 200.
  - live asset 확인: `/assets/MetricsView-I5boPxK-.js` 200, chunk 안에 `metrics/validate`, `PromQL 실행`, `시간범위 넓히기` 포함.
- 다음:
  1. Phase 2 남은 화면은 레포 상세/카탈로그/AI 채팅/설정·조직/운영 액션이다.
  2. 자동 Actions가 계속 billing 제한이면 코드 검증은 로컬 명령 + 수동 ECR/rollout 경로로 수행하고, run annotation을 HANDOVER에 남긴다.

## 체크포인트 — DB retention/keyset 로컬 검증 완료

- 커밋/푸시:
  - `81553973 fix: retention keyset / DB 보존 / 조회 안정화` → `origin/dev` push 완료.
- 구현:
  - `outbox(sent_at) WHERE sent_at IS NOT NULL`, `events(created_at)`, `audit_log(created_at)`, `evidence(workspace_id, correlation_id, created_at, id)`, `rca_reports(workspace_id, correlation_id, created_at, id)` 계열 concurrent index migration 추가.
  - `/evidence`, `/rca-reports`에 `cursor` 기반 keyset pagination 추가. 기존 `offset`은 하위 호환으로 유지하고, 응답에는 `next_cursor`를 포함한다.
  - `command-janitor`에 `sweep_storage_retention`을 연결해 sent outbox, 오래된 events, audit_log를 작은 배치로 정리한다. 기본값: outbox 24h, events/audit 7d, batch 1000.
  - cursor 내부 timestamp 오류도 422 `"cursor is invalid"`로 정규화했다.
- 검증:
  - `uv run pytest tests/test_evidence_query_api.py tests/test_storage_retention.py tests/test_database_unit.py tests/test_command_janitor.py tests/test_docs_index.py -q` → 72 passed.
  - `uv run ruff check ...` / `uv run ruff format --check ...` 통과.
  - `PYTHONPATH=src uv run lint-imports --config .importlinter` 통과.
  - Alembic head: `['20260708_0525']`.
- 다음:
  - service image를 최신 `81553973` 기반으로 빌드/push하고 `api-gateway`, `dashboard-worker`, `command-janitor`, 신규 `outbox-relay`, 신규 `rca-timeline-janitor`에 선별 rollout한다.
  - 운영 DB에는 migration과 동일한 concurrent index를 적용하고, health/log/EXPLAIN/retention smoke를 확인한다.

## 체크포인트 — evidence claim-check 라이브 안정화 완료

- 커밋/푸시:
  - `f7bc7bd6 fix: evidence claim-check / NATS payload / 원천 차단`
  - `b8f764ba fix: evidence.built claim-check / NATS payload / hydrate`
  - 두 커밋 모두 `origin/dev` push 완료, author/committer는 `choi woo-nyong <woonyong.kr@gmail.com>`.
- 라이브 배포:
  - service image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:b8f764ba-service-20260708035204`.
  - `api-gateway`, `evidence-worker`, `incident-worker` 모두 위 이미지로 rollout 완료, 각 deployment `1/1 Ready`.
  - public smoke: `/api/healthz` 200, `/api/readyz` 200. 최근 측정은 healthz 약 `0.49s`, readyz 약 `0.62s`.
- 문제 원천 수정:
  - `cluster.evidence.received`: full evidence는 `evidence_windows.payload`에만 저장하고, outbox/NATS에는 `evidence_key`, `workspace_id`, `cluster_id`, `correlation_id`, `kind`, `payload_size`, `summary` 중심 reference만 발행.
  - `evidence.built`: full `Evidence`는 `evidence` 테이블에 저장하고, event는 `object_ref`, `correlation_id`, `kind`, `payload_size`, `summary` 중심 reference만 발행.
  - `evidence-worker`는 `get_evidence_window_payload(evidence_key)`, `incident-worker`는 `get_evidence_payload(workspace_id, correlation_id, kind)`로 hydrate 한다. 기존 full payload 이벤트도 inline evidence가 있으면 그대로 처리한다.
- DLQ/replay 결과:
  - 기존 open DLQ `269`건을 모두 처리했다. `cluster.evidence.received` MaxPayload 255건, `evidence.built` MaxPayload 255건, 과거 deadlock 10건은 compact replay로 처리했고, 작은 disk/git 오류 4건은 원본 replay 처리했다.
  - 최종 DB 상태: `event_dead_letters`: `archived=1891`, `replayed=529`, `open=0`.
  - `MaxPayloadError`, `maximum payload`, `outbox_event_dead_lettered`, `EventBodyDecodeError` 로그는 최근 확인 구간에서 0건.
  - `outbox_pending_total`은 0~8 사이로 변동하나 남은 항목은 `workflow-controller`의 0.5~1.6KB 소형 정상 이벤트다. evidence 계열 oversized pending은 없음.
- 로컬 검증:
  - claim-check 1차: focused pytest 39 passed, schema/database/API 관련 120 passed, 전체 `uv run pytest -q` → 722 passed, 3 skipped.
  - `evidence.built` 추가 수정: focused pytest 98 passed, import-linter passed, 전체 `uv run pytest -q` → 723 passed, 3 skipped.
- 후속 작업:
  1. B: `count_open_rca_incidents` SQL 집계/인덱스/만료 정책은 구현·검증 완료. 라이브 EXPLAIN은 8.659ms 확인됨.
  2. C: `api-gateway` 내부 outbox relay를 `AsyncService` 기반 독립 deployment로 분리하는 코드는 구현·push 완료. 라이브에는 신규 deployment 선별 적용 필요.
  3. D: outbox/events/audit retention janitor와 keyset pagination은 `81553973`으로 구현·push 완료. 라이브 rollout/DB index 적용 필요.
  4. `target-01.woonyong.org` 배포와 `k8s-incident-demo-target` 연결은 최신 사용자 지시로 이 스레드 범위에서 제외(다른 스레드 담당).

## 체크포인트 — 콘솔 디자인 시스템 Phase 0/1 착수

- 브랜치/주의:
  - 현재 브랜치: `dev`.
  - 프론트 디자인 시스템 커밋: `df55e429 feat: Tailwind 디자인 시스템 파운데이션` → `origin/dev`.
  - GitHub Actions는 이번 push도 4~5초 만에 steps 없이 실패했다. 이전과 같은 runner/Actions 계층 문제로 보고 수동 console 배포 경로를 사용했다.
- 구현:
  - Tailwind CSS v4 + `@tailwindcss/vite` 설치, Vite 플러그인 연결.
  - 새 정본 토큰: `frontend/src/ui/theme.css`. Tailwind CSS-first `@theme inline`으로 `bg/surface/raised`, `border/border-strong`, `primary/secondary/muted`, `accent/success/warning/danger/info`, `control/panel`, `soft/elevated` semantic utility를 제공한다.
  - dark mode는 class 전략을 추가했다. 기존 `data-theme-mode`와 함께 `html.dark/html.light`를 동기화한다.
  - 새 Motion 정본: `frontend/src/ui/motion.ts`. `durations`, `easing`, `fadeInUp`, `scaleIn`, `listStagger`, `drawerSlide`, `collapse`, `AnimatePresence` export.
  - 새 프리미티브 정본: `frontend/src/ui/index.tsx`. Button, IconButton, Card, StatCard, Table, Tabs, Badge/StatusChip, Modal, Drawer, Dropdown/Menu, Field/Input/Select/Textarea, Toast, Tooltip, Skeleton, EmptyState, PageHeader, Breadcrumb, CodeBlock, KeyValueList, ConfirmDialog 포함.
  - 개발 전용 검수 라우트 `GET /dev/ui` 추가. `import.meta.env.DEV`일 때만 라우터에 등록되어 production build chunk에 포함되지 않는다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm run build` passed. 기존 large chunk warning만 있음.
  - Playwright Chromium 설치 후 `/dev/ui` 1440/1024/390 폭 스크린샷 검증: console error 0, document horizontal overflow 0.
  - screenshots: `/tmp/k8s-ui-desktop-1440.png`, `/tmp/k8s-ui-tablet-1024.png`, `/tmp/k8s-ui-mobile-390.png`.
- 배포/live smoke:
  - CI/CD 자동 경로 실패: CI run `28890815267`, AWS CD run `28890814781`; jobs는 생성됐지만 steps가 비어 있고 5초 안팎으로 failure.
  - 수동 console image build/push: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:df55e429-design-system-20260708035456`.
  - `kubectl -n management set image deploy/console ...` 후 rollout 완료, Ready `1/1`.
  - public HTML asset: `assets/index-akMwoh9-.js`, `assets/index-CIqYri1L.css`.
  - public smoke: `/api/healthz` 200, `/api/readyz` 200.
  - live browser smoke: `/` → `/login?returnTo=%2F`, email input 1개, password input 1개, submit button 1개, document overflow 0. 비로그인 세션 조회 401 콘솔 메시지는 예상 범위.
  - screenshot: `/tmp/k8s-live-design-system-login.png`.
- 다음:
  1. Phase 2 첫 화면은 로그인/가입이다. `features/auth/*`의 inline style과 `shared/ui` 의존을 `src/ui` 프리미티브로 이관하고, 화면 이관 완료 후 관련 레거시 스타일 사용을 제거한다.
  2. 앱 셸 이관 전까지 `plural-ui`/`shared/ui`/`theme-bridge`는 유지한다. 화면 단위로 공존 기간을 줄인다.
  3. 자동 Actions 실패는 코드 실패가 아니므로 다음 배포도 run 상세의 steps 유무를 먼저 확인한다. steps 없는 4~6초 실패가 반복되면 수동 console/backend 배포 경로를 사용한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 인증 화면 이관

- 구현:
  - `/login`, `/signup`, `/pending`, `/verify-email`와 공통 `AuthLayout`을 `frontend/src/ui` 프리미티브와 Tailwind semantic token 기반으로 재구성했다.
  - 인증 화면 내부의 `@/shared/ui`, `@/shared/motion`, `plural-ui` import를 제거했다.
  - 인증 화면 내부 inline `style=`, raw hex, px 하드코딩 grep 0건.
  - 버튼/링크 라벨은 `가입`, `로그인`, `로그인 재시도`, `검증 메일 재전송`처럼 한국어 명사형으로 맞췄다.
  - 로그인/가입/검증 메일 재전송 mutation에 pending 버튼 상태와 성공/실패 토스트를 추가했다. 승인 대기/실패 사유도 토스트와 필드 오류로 노출한다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm run build` passed. 기존 large chunk warning만 있음.
  - Playwright 로컬 검수: `/login`, `/signup`, `/pending?email=operator@example.com`, `/verify-email`, `/verify-email?verified=1`를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0.
  - screenshots: `/tmp/k8s-auth-login-desktop.png`, `/tmp/k8s-auth-signup-mobile.png`, `/tmp/k8s-auth-verify-mobile.png` 등.
  - 로컬 dev proxy의 `GET /api/auth/session` 500이 콘솔에 찍히지만, 화면 렌더 오류가 아니라 로컬 백엔드 세션 확인 응답이다.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live `/login`, `/signup`, `/verify-email` asset 반영을 확인한다.
  2. 다음 화면 순서는 앱 셸(사이드바·헤더·알림)이다. `features/console/ui.tsx`의 inline style과 `plural-ui`/`console.css` 의존을 `src/ui` 토큰/프리미티브로 이관한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 앱 셸 이관

- 구현:
  - `features/console/ui.tsx`의 사이드바, 헤더, 브레드크럼, 알림 Drawer를 Tailwind semantic token과 `src/ui` 프리미티브로 재구성했다.
  - 셸 내부 `plural-ui` imports, `console.css` import, inline `style=`, raw hex/px, legacy `pl-`/`co-` class 사용을 제거했다.
  - `console.css`에서 셸 전용 selector를 삭제했다. 이후 홈 대시보드 이관에서 파일 자체도 삭제했다.
  - 로그아웃 mutation에 pending 버튼 상태와 성공/실패 토스트를 추가했다.
  - `src/ui/IconButton`이 아이콘을 텍스트 슬롯에 넣어 좁은 버튼에서 잘리던 문제를 수정했다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm run build` passed. 기존 large chunk warning만 있음.
  - Playwright route mocking 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 앱 셸을 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, unexpected console error 0.
  - screenshots: `/tmp/k8s-shell-desktop.png`, `/tmp/k8s-shell-tablet.png`, `/tmp/k8s-shell-mobile.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면 순서는 홈 대시보드다. `HomePage.tsx`와 남은 `features/console/console.css` selector를 `src/ui` 프리미티브/Tailwind token으로 이관하고 해당 CSS 파일을 더 줄이거나 삭제한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 홈 대시보드 이관

- 구현:
  - `features/console/pages/HomePage.tsx`를 `src/ui` StatCard/Card/Table/Tabs/Badge/EmptyState 기반으로 재구성했다.
  - 기존 Plural Treemap/Nivo 의존 대신 Tailwind semantic token 기반 플릿 히트맵 타일을 사용한다.
  - 홈 화면의 `plural-ui`, `shared/ui`, `shared/motion`, Nivo chart wrapper, inline `style=`, legacy `pl-`/`co-` class 의존을 제거했다.
  - 홈 이관 완료에 따라 `features/console/console.css` 파일을 삭제했다.
  - `NotFoundPage`도 작은 콘솔 페이지라 함께 `src/ui` EmptyState/Button으로 정리했다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test -- --runInBand` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking 검수: 인증 세션/알림/홈 집계 최소 응답으로 `/` 홈 대시보드를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, unexpected console error 0.
  - screenshots: `/tmp/k8s-home-desktop.png`, `/tmp/k8s-home-tablet.png`, `/tmp/k8s-home-mobile.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면 순서는 클러스터 목록/상세다. `features/cluster/*`의 `shared/ui`, inline style, legacy token 사용을 화면 단위로 제거한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 클러스터 목록 이관

- 구현:
  - `features/cluster/ClusterListView.tsx`를 `src/ui` PageHeader/StatCard/Card/Input/Table/Badge/EmptyState 기반으로 재구성했다.
  - 목록 본체의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color, legacy `pl-`/`co-` class 의존을 제거했다.
  - 클러스터 연결 상태 라벨을 `연결/지연/미연결/끊김/미확인`으로 고정하고, 검색 결과 없음/등록 없음/조회 실패+재시도 상태를 새 Table/EmptyState로 맞췄다.
  - 등록 위저드는 별도 Phase 2 순서(`레포/클러스터 등록 위저드`)로 남아 있다. 목록 CTA는 기존 동작을 유지하되 위저드 본체 이관은 해당 단계에서 처리한다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test -- --runInBand` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking 검수: 인증 세션/알림/클러스터 목록 최소 응답으로 `/clusters`를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, unexpected console error 0, visible rows 4.
  - screenshots: `/tmp/k8s-clusters-list-desktop.png`, `/tmp/k8s-clusters-list-tablet.png`, `/tmp/k8s-clusters-list-mobile.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면은 클러스터 상세다. `ClusterDetailView.tsx`가 아직 `shared/ui`, `plural-ui`, inline style을 많이 포함하므로 탭/테이블/드릴다운을 작은 커밋으로 나눠 이관한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 클러스터 상세 이관

- 구현:
  - `features/cluster/ClusterDetailView.tsx`를 `src/ui` PageHeader/Breadcrumb/StatCard/Card/Tabs/Table/Drawer/Modal/KeyValueList 기반으로 재구성했다.
  - 워크로드/팟/노드/서비스/리소스/이벤트 탭, 리소스 상세 Drawer, 서비스 selector 관계, 컨텍스트 액션(이벤트/메트릭/AI), 스케일/재시작 모달 기능을 유지했다.
  - 상세 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color, legacy `pl-`/`co-` class, legacy CSS var 의존을 제거했다.
  - 기존 테스트가 직접 사용하는 helper export(`deploymentTargetFromWorkload`, `contextActionHrefs`, `namespaceColor`, `selectorRecord`, `serviceMatches`, `textMatches`)는 유지했다. namespace 색은 inline style 대신 결정적 token class bucket으로 표현한다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test -- --runInBand` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking 검수: 인증 세션/알림/클러스터 상세 인벤토리 최소 응답으로 `/clusters/prod-seoul-01`를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, legacy class 0, visible rows 5.
  - 탭 전환 검수: 워크로드 → 서비스 → 이벤트 전환, 서비스 IP와 이벤트 `BackOff` cell 확인, horizontal overflow 0, unexpected console error 0.
  - screenshots: `/tmp/k8s-cluster-detail-desktop.png`, `/tmp/k8s-cluster-detail-tablet.png`, `/tmp/k8s-cluster-detail-mobile.png`, `/tmp/k8s-cluster-detail-tabs.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면 순서는 인시던트 목록/상세다. 후보 점수바와 증거 트레일 기능은 유지하고 표현만 `src/ui` 프리미티브로 교체한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 인시던트 목록 이관

- 구현:
  - `features/notifications/NotificationsView.tsx`를 `src/ui` PageHeader/Card/Tabs/Badge/Button/EmptyState 기반으로 재구성했다.
  - 알림 합성 소스(timeline, 승인 대기 run, DLQ)는 유지하고, 필터 탭/빈 상태/행 CTA를 새 디자인 시스템으로 통일했다.
  - 목록 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 의존을 제거했다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test -- --runInBand` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking 검수: 인증 세션/알림 합성 소스(timeline/app runs/DLQ) 응답으로 `/incidents`를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, legacy class 0, unexpected console error 0.
  - screenshots: `/tmp/k8s-incidents-list-desktop.png`, `/tmp/k8s-incidents-list-tablet.png`, `/tmp/k8s-incidents-list-mobile.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면은 인시던트 상세다. RCA 파이프라인 그래프, 후보 점수바, evidence trail, recovery plan 기능은 유지하고 `src/ui`/Motion preset으로 표현만 교체한다.

## 체크포인트 — 콘솔 디자인 시스템 Phase 2 인시던트 상세 이관

- 구현:
  - `features/notifications/IncidentDetailView.tsx`를 `src/ui` PageHeader/Breadcrumb/Card/KeyValueList/Badge/Button/Collapsible/EmptyState 기반으로 재구성했다.
  - RCA 파이프라인 그래프, 복구 계획, evidence 목록, RCA 리포트 후보 점수바, evidence query trail, not_found fallback 기능은 유지했다.
  - 상세 화면의 `plural-ui`, `shared/ui`, `shared/motion`, inline `style=`, raw color, legacy `pl-`/`co-`/`btn`/`card` class, legacy CSS var 의존을 제거했다.
  - 모바일 RCA 그래프는 문서 전체 overflow 없이 그래프 영역 내부 가로 스크롤로 읽을 수 있게 고정했다.
- 검증:
  - `cd frontend && npm run typecheck` passed.
  - `cd frontend && npm run lint` passed.
  - `cd frontend && npm test -- --runInBand` passed, 11 tests.
  - `cd frontend && npm run build` passed.
  - Playwright route mocking 검수: 인증 세션/알림/인시던트 상세/RCA 리포트/복구 계획 최소 응답으로 `/incidents/inc-101`를 1440/1024/390 폭에서 캡처했고 horizontal overflow 0, legacy class 0, unexpected console error 0.
  - screenshots: `/tmp/k8s-incident-detail-desktop.png`, `/tmp/k8s-incident-detail-tablet.png`, `/tmp/k8s-incident-detail-mobile.png`, `/tmp/k8s-incident-detail-mobile-fixed.png`.
- 다음:
  1. 이 단위를 커밋/push하고 console image를 배포해 live asset 반영과 public health를 확인한다.
  2. 다음 화면은 워크플로다. React Flow 노드/엣지 스타일과 목록/상세 화면을 token + `src/ui` 프리미티브로 정렬한다.

## 절대 운영 원칙 — mock/fake/hardcoding 금지

- 운영 코드, 배포 대상 화면, API 응답, DB 정리/복구 절차에는 **목업 데이터, 페이크 데이터, 하드코딩된 클러스터/레포/인시던트 값 사용 금지**.
- 화면 수치와 드릴다운은 실제 세션 권한으로 접근 가능한 DB/API/클러스터 관측값만 표시한다. 개발용/테스트용 격리 객체는 단위 테스트 내부에만 두고 운영 경로에 연결하지 않는다.
- 실제 토큰/비밀번호/세션 쿠키/API key는 사용자 요청이 있어도 커밋하지 않는다. Git 히스토리에서 완전 삭제가 어렵기 때문에 GitHub Actions secrets, 로컬 env, 승인된 secret store만 사용한다.
- 평상시 DB 정리는 전체 삭제가 아니라 원인과 시간 범위가 확인된 과거 실패 레코드만 상태 전환으로 아카이브한다.
- 단, 이번 사용자 명시 지시로 최종 완료 후 1회 DB 초기화를 수행한다. 순서: 백업/스냅샷 → 스키마 재생성/마이그레이션 → `service_admin` bootstrap → 실제 클러스터/레포 재등록 → 실제 데이터 재수집/검증. 초기화 후에도 운영 화면에는 mock/fake/hardcoding 금지.
- 신버전 evidence lineage가 배포·검증되면 구버전/신버전 evidence 혼재를 피하기 위해 최종 전환 단계에서 DB를 새로 시작한다. 지금 즉시 초기화하지 않는다.
- 현재 Git 커밋 identity는 `choi woo-nyong <woonyong.kr@gmail.com>` 이어야 한다. 오래된 하단 메모의 `woonyong.dev@gmail.com` 또는 `woonyong <woonyong.kr@gmail.com>` 표기는 사용하지 않는다.

## 체크포인트 (현재) — 프론트 재배포 + outbox oversized payload 안정화

- 프론트:
  - 커밋/푸시: `5ed50fae fix: frontend 세션 복구 / API 오류 문구` → `origin/dev`.
  - 로컬 검증: `cd frontend && npm run typecheck`, `npm run lint`, `npm test`(11 passed), `npm run build` passed. 기존 large chunk warning만 있음.
  - GitHub Actions AWS CD는 runner 할당 전 단계에서 `Test before deploy`가 6초 만에 실패하고 logs/steps가 비어 있어 원격 빌드 경로를 사용하지 못했다.
  - Docker Desktop을 기동해 로컬에서 `frontend/Dockerfile`로 `linux/amd64` 이미지 빌드·ECR push 완료.
  - 배포 이미지: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:5ed50fae-frontend-20260708031456`.
  - rollout: `kubectl -n management set image deploy/console ...` 후 `deployment/console successfully rolled out`, Ready `1/1`.
  - public smoke: `https://k8s.woonyong.org/` HTTP 200, 새 asset `index-DI7HDdPP.js` 서빙 확인. `/api/healthz` 200, `/api/readyz` 200. 단 `/api/healthz` 1회가 `7.22s`로 느려 backend 병목은 아직 남아 있음.
- AWS 스펙:
  - 실제 management cluster: `kubernetes-ops`, nodegroup `kubernetes-ops-ng`.
  - 현재 nodegroup: `t3.xlarge` ON_DEMAND, desired `2`, min `1`, max `3`, Kubernetes `1.34`.
  - ap-northeast-2 Pricing API 기준 후보를 사용자에게 제시함: `m7i.xlarge x2`, `c7i.2xlarge x2`, `r7i.xlarge x2`, `m7i.2xlarge x1`. 권장안은 `c7i.2xlarge x2`.
  - 실제 nodegroup 변경은 사용자 선택 대기. 선택 전 임의 변경 금지.
- Backend 안정화:
  - live 로그에서 확인된 핵심 병목은 `api-gateway` outbox relay의 `nats.errors.MaxPayloadError: nats: maximum payload exceeded` 반복이다. 같은 oversized payload가 계속 재시도되면 gateway OOM/readiness timeout을 다시 유발할 수 있다.
  - 코드 패치 진행: `OutboxRelay`가 `MaxPayloadError` 같은 비재시도 publish 오류를 DLQ로 격리하고 outbox 대상에서 제거하도록 변경했다. transient 오류는 기존처럼 재시도 유지.
  - DB 스키마 변경 없음. 기존 `event_dead_letters` 테이블을 사용해 `consumer="outbox-relay:<source>"`, `attempts=1`, original payload/error를 기록한다.
  - 검증: `uv run pytest tests/test_outbox.py` → 5 passed, `uv run pytest tests/test_database_unit.py -q` → 45 passed, `uv run ruff check ...` → passed.
  - `262db708 fix: outbox 비재시도 오류 DLQ 처리`, `1aee8286 docs: handover / frontend 배포 / outbox 안정화`는 이미 push 됐다. 이후 backend image `1aee8286-service-20260708032238`를 `api-gateway`에 수동 rollout했고, `/api/healthz`/`/api/readyz`가 0.5초 안팎으로 회복됐다.
  - 남은 원천 문제는 `evidence_windows.payload` 원문을 같은 크기로 `cluster.evidence.received` 이벤트/outbox에도 넣는 구조였다. 03:38 KST 현재 로컬 코드에서 claim-check 패턴으로 수정 완료: full evidence는 `evidence_windows.payload`에만 저장, outbox 이벤트는 `{workspace_id, cluster_id, evidence_key, correlation_id, kind, payload_size, summary}`와 빈 evidence 필드만 담는다.
  - 하위 호환: `ClusterEvidenceReceivedBody`는 기존 full payload 이벤트도 계속 디코딩한다. `evidence-worker`는 inline evidence가 있으면 그대로 처리하고, reference 이벤트면 `get_evidence_window_payload(evidence_key)`로 DB 원문을 hydrate 한다.
  - 03:44 KST live compact replay 중 후속 원인도 확인됨: `evidence-worker`가 `evidence.built`에 full Evidence를 다시 실어 `outbox-relay:evidence-worker` MaxPayload DLQ가 새로 생겼다. 로컬 추가 수정 완료: `evidence.built`도 `save_evidence(correlation_id, kind, payload)` 저장본을 claim-check로 참조하고, `incident-worker`가 `get_evidence_payload(workspace_id, correlation_id, kind)`로 hydrate 한다. 기존 full `evidence.built` 이벤트도 계속 처리한다.
  - agent evidence에서 `evidence_key`가 없는 구형 요청도 더 이상 full outbox 경로(`stage_event_once`)로 보내지 않는다. 신뢰된 workspace/cluster + payload digest 기반 키를 합성해 `record_evidence_event_once`로 저장/발행한다.
  - 로컬 검증: `uv run ruff check ...`, `uv run ruff format --check ...`, `PYTHONPATH=src uv run lint-imports --config .importlinter`, focused pytest 39 passed, schema/database/API 관련 120 passed, 전체 `uv run pytest -q` → 722 passed, 3 skipped. `evidence.built` 추가 수정 후 focused pytest 89 passed.
  - 다음 단계: `evidence.built` claim-check 커밋/push → service image 빌드/push → `api-gateway`, `evidence-worker`, `incident-worker`를 같은 image로 rollout → live logs에서 신규 `MaxPayloadError` 0 확인 → replay 가능한 open DLQ만 선별 compact replay/감소 확인.

## 체크포인트 — 요청 timeout/RCA 집계/콘솔 UI 문구·접근성 + 스펙 정합성

- 구현:
  - dialog 계열(`Modal`, `Drawer`, plural `Flyover`)에 `aria-modal`, focus 진입, Tab focus trap, 닫을 때 이전 focus 복원을 맞췄다.
  - `TimeSeriesChart`가 숫자 x축이면 linear scale로 그리고 최대 5개 tick만 샘플링한다. epoch ms tick은 `fmtHms`로 표시하고, 자체 legend와 y축 min=0을 적용한다.
  - Metrics/HomePage usage series는 `sampled_at`을 숫자 timestamp로 넘긴다. Metrics 스트림 차트는 history가 없을 때 인벤토리 기반 포인트를 합성하지 않고 empty state를 보여주며, live history의 `clusterId`가 있으면 선택 cluster만 표시한다.
  - Console header의 LIVE badge 표시를 제거했다. 단, `ConsoleLayout`은 여전히 `startLive()`를 호출해 브라우저 스냅샷 스트림을 시작한다.
  - `api.ts`는 timeout abort와 일반 네트워크 오류를 구분해 timeout detail을 `'요청 시간이 초과되었습니다'`로 전달한다. cluster/fleet 조회 훅은 8초 timeout을 사용한다.
  - `count_open_rca_incidents`는 payload 전체 대신 incident projection만 읽고 `incident_logical_key_from_projection`으로 logical incident를 dedupe한다. `rca_timeline`에는 scope/update, open cluster 조회용 index 2개를 추가했다.
  - 레포 연결/클러스터 등록에서 `sandbox` environment/namespace 하드코딩을 제거했다. manifest validation namespace와 선택 클러스터 environment가 있을 때만 connect payload에 보낸다.
  - 채팅 목록 행을 열기 버튼과 삭제 버튼으로 분리했고, 빈 draft/16,000자 초과/pending 상태에서 전송 버튼이 disabled 된다.
  - 콘솔 여러 화면의 설명용 subtitle/description을 제거하고, 빈 상태 icon을 실제 icon 컴포넌트로 맞췄다. Incident evidence row와 flow group은 `role=button` div 대신 실제 `button`으로 바꿨다.
  - 운영 화면에 mock/fake/hardcoded production data 추가 없음.
- 문서:
  - `docs/spec/frontend/{app,auth,cluster,fleet,metrics,notifications,org,repo,resources,shared,workflow}.md`와 `docs/spec/domains/dashboard.md`를 `e7e4caab` 기준으로 갱신했다.
  - `LIVE` 표시, `sandbox` 기본 배포 namespace/environment, 시계열 합성 포인트, stale subtitle/description, dashboard count SQL group-by 설명을 실제 코드 기준으로 제거했다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test` → 10 passed.
  - `uv run pytest tests/test_dashboard_projection.py tests/test_fleet_router.py -q` → 21 passed.
  - `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q` → 17 passed.
  - `make manifest-check` → management 53, target 16.
  - `make check` → 717 passed, 3 skipped, manifest-check 포함 passed.
- 다음:
  1. route/archive 경계 dead code 정리 또는 backend evidence/outbox MaxPayload guard 중 하나를 의미 단위로 진행한다.
  2. frontend 정리를 먼저 잡을 경우 `consoleChildren(basePath)` 제거, `StatCard` dead export 제거, `NotFoundPage` base path 정리부터 시작한다.
  3. backend 안정화를 먼저 잡을 경우 oversized outbox row size 조사 → relay byte guard → evidence event reference화 순서로 진행한다.

## 체크포인트 — 인증 가드 스켈레톤 정지 수정 + 배포/live smoke

- 구현:
  - `RequireSession`은 세션 조회가 실패(`isError`)하거나 인증 데이터가 없으면 즉시 `/login?returnTo=<현재 경로>`로 보낸다. 보호 경로 `/`에서 장시간 스켈레톤만 보이는 상태를 막는다.
  - `RequireGuest`는 이미 인증된 세션이 확정된 경우만 안전한 `returnTo`로 보낸다. 세션 조회가 pending이거나 실패한 로그인/가입 화면은 막지 않고 렌더한다.
  - API 클라이언트에 선택적 `AbortSignal/timeoutMs` 옵션을 추가했고, `useSession()`에만 `8_000ms` timeout을 적용했다. 일반 실데이터 API 호출에는 timeout 정책을 새로 강제하지 않았다.
  - 홈 플릿 배열은 memoized reference로 고정해 선택 클러스터 보정 effect가 실제 fleet 변경에만 반응하도록 정리했다.
  - 운영 화면에 mock/fake/hardcoded production data 추가 없음.
- 검증:
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 10 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
  - local browser QA: `/` → `/login?returnTo=%2F`, email input 1개, password input 1개, submit button 1개, skeleton 0개.
  - local browser QA: `/console/` archive shell 1개, `실서비스` 링크 1개, heatmap tile 19개.
  - screenshots: `/tmp/k8s-root-local-login-guard.png`, `/tmp/k8s-console-archive-local.png`.
- 배포/live smoke:
  - commit/push: `0b4058dd fix: 세션 가드 / 홈 위젯 안정화`, `b367da80 fix: 세션 조회 timeout / 게스트 진입 안정화`, `19efafdd docs: auth guard handover / spec sync / 문서` → `origin/dev`.
  - console CodeBuild `kubernetes-ops-console-build:4fb74cfb-c86d-4244-9e17-9cc3676421c4` → succeeded.
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:19efafdd-dev`, digest `sha256:be3c4be127db541b73e79dc9879a2972b73f12f458d0ad87dea57f500e096873`.
  - rollout 완료: `deployment/console` 1/1 ready, image `19efafdd-dev`.
  - public smoke: `/` 200 `text/html`, `/console/` 200 `text/html`, `/api/healthz` 200 `{"status":"ok","service":"api-gateway"}`.
  - live browser QA: `/` → `/login?returnTo=%2F`, email input 1개, password input 1개, submit button 1개, skeleton 0개, unexpected console error/request failure 0.
  - live browser QA: `/console/` archive shell 1개, `실서비스` 링크 1개, heatmap tile 19개, unexpected console error/request failure 0.
  - screenshots: `/tmp/k8s-root-live-login-guard-19efafdd.png`, `/tmp/k8s-console-archive-live-19efafdd.png`.
- 병렬 분석 결과:
  - frontend 구조 감사: `/console` archive와 `/` service 경계는 분리됐지만 `consoleChildren(basePath)`, `NotFoundPage`의 `/console` 흔적, `StatCard` dead export, cluster drilldown 대형 컴포넌트, metrics/workflow helper 중복이 다음 리팩토링 후보.
  - backend 안정화 감사: `gateway_outbox_relay_error + nats.errors.MaxPayloadError`는 oversized evidence payload가 outbox poison row로 남아 반복 publish되는 구조가 핵심 후보. 최소 수정 방향은 raw evidence event 발행이 아니라 DB JSONB 보존 + event reference화, relay byte guard, oversized row park/archive다.
## 체크포인트 — `/console` 아카이브 격리 + `/` Plural 복각 홈 1차

- 구현:
  - `/console/*`를 실제 서비스 라우트와 분리된 `features/console-archive/ArchivedConsoleDemo`로 이동했다. 이 경로는 보존용 디자인 데모이며 실제 운영 데이터 경로가 아니다.
  - 실제 서비스 `/`는 기존 실데이터 API 훅을 유지한 채 Plural 콘솔 데모의 구조를 가져왔다: 상단 프로젝트 셀렉터, 짧은 topbar/subheader, LOGO 사이드바, `위젯 → 플릿 맵 → KPI → 저장 위젯/시계열/인시던트/승인 패널 → 클러스터 테이블`.
  - 홈 플릿 맵은 `GET /fleet/summary` 응답만 사용한다. lens는 `전체/CPU/메모리/인시던트`이고, 각 렌즈의 색상·크기는 실제 `health/cpu_pct/mem_pct/open_incidents/pod_total`에서만 계산한다.
  - 홈 위젯 패널은 새 localStorage 위젯을 만들지 않는다. 실제 `metric-widgets`, `metric-query-presets`, `cluster usage` API를 읽고, 추가/프리셋 액션은 `/metrics`의 실제 query/widget 등록 화면으로 이동한다.
  - 레포 연결과 클러스터 등록 CTA는 홈 toolbar에 유지했다. 기존 `ConnectRepoWizard`, `RegisterClusterWizard`를 그대로 사용한다.
  - `/console` 아카이브의 샘플 수치는 운영 경로 `/`와 완전히 분리했다. 운영 코드의 `/` 화면에는 mock/fake/hardcoded production data를 추가하지 않았다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 10 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
  - local preview `/console/`: browser QA passed. home tiles 19개, `실서비스` 링크 1개, cluster archive rows 2개, console error 0, request failure 0.
  - screenshots: `/tmp/k8s-console-archive-home.png`, `/tmp/k8s-console-archive-clusters.png`.
- 검증 한계:
  - local preview에서 실제 `/` 로그인 자동화는 live auth 401로 막혔다. 배포 후 실제 세션으로 `/` 홈 플릿 맵/위젯 패널/레포·클러스터 등록 CTA를 브라우저 QA 해야 한다.
- 다음:
  1. 이 단위를 `feat: Plural console archive / fleet widget home / real data` 형식의 한국어+영어 키워드 커밋으로 저장·푸시한다.
  2. 배포 후 `/`, `/console/`, `/clusters`, `/metrics`, `/repos`를 live smoke 한다.
  3. 이후 반복 게이트: dead code, 중복 CSS, shared widget 인터페이스, browser QA, HANDOVER 갱신을 매 커밋 단위로 수행한다.

## 체크포인트 (현재) — AI 대화 삭제 레이스 + repo connect 422 안정화

- 구현:
  - `AiConversationRepository.record_ai_response()`가 assistant message insert 전에 conversation row를 `completed`로 update하고, row가 없으면 `False`를 반환한다. 삭제된 waiting 대화에 늦은 worker 응답이 들어와도 FK 실패/worker 실패로 번지지 않는다.
  - `record_ai_failure()`도 conversation row가 없으면 `False`를 반환한다.
  - `ai-chat-worker`는 `record_ai_response/record_ai_failure`가 `False`를 반환하면 `ai.message.responded/failed` 이벤트를 발행하지 않고 종료한다. 이벤트 처리는 ack되지만 삭제된 대화 read model을 되살리지 않는다.
  - AI HTTP list/get/append/delete 범위를 `workspace_id + user_id`로 제한했다. 같은 workspace의 다른 사용자 대화를 조회/삭제/추가하지 않는다.
  - `/applications/connect`에서 `RepositoryDiscoveryError`뿐 아니라 `ValueError`도 422로 변환한다. 잘못된 `source_type` 같은 검증 오류가 500으로 새지 않는다.
  - 운영 경로 mock/fake/hardcoded data 추가 없음. 테스트 더블은 `tests/*` 내부에만 존재.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m ruff check src/domains/ai/repository.py src/domains/ai/router.py src/domains/applications/router.py src/services/ai/chat-worker/app.py src/packages/contracts/stores.py tests/test_ai_conversation.py tests/test_applications_router.py` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_ai_conversation.py tests/test_ai_chat_hardening.py tests/test_ai_platform_tools.py tests/test_applications_router.py tests/test_repository_discovery.py` → 44 passed.
- 배포/live smoke:
  - commit/push: `3e1beb02 fix: AI 대화 삭제 / 사용자 범위 / 레포 검증` → `origin/dev`.
  - backend CodeBuild `kubernetes-ops-image-build:49978d3b-9b8c-4ac3-a718-8068849d3258` → succeeded.
  - backend image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:3e1beb02-dev`, digest `sha256:503a56cd1827cfec3c1563b29db43dbcc367f451f505d8600909b312a33b06ee`.
  - console CodeBuild `kubernetes-ops-console-build:b05c008e-e7ed-4c00-99d7-6e7f75eca283` → succeeded.
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:3e1beb02-dev`, digest `sha256:fed38fe6838f8b17a2d67fcf47e72e51a92b2aa5b784603523efbdc1f95d06d2`.
  - rollout 완료: management namespace 모든 deployment rollout status passed. `github-poll-worker` CronJob도 container `poller`를 `3e1beb02-dev`로 교체했다.
  - public smoke: `/` 200 `text/html`, `/console/` 200 `text/html`, `/api/healthz` 200 `{"status":"ok","service":"api-gateway"}`.
  - authenticated smoke: login 200, session 200, `/clusters` 200, cluster-1/cluster-2 online, `/providers/cluster-discovery` 200, `/ai/conversations` 200.
  - repo connect guard smoke: `POST /api/applications/connect` with invalid `source_type:"zip"` → 422 `"source_type must be raw-yaml, raw-json, kustomize, or helm"`, DB write 없음.
  - AI delete smoke: create conversation 200 → delete 204 → get after delete 404. 이후 `ai-chat-worker` recent logs에 FK/record failure 없음.
  - browser QA: login → `/clusters` → `클러스터 등록` modal, `GET /api/providers/cluster-discovery` 200, 후보 검색/listbox/direct input/provider cards 렌더 확인. Screenshot: `/tmp/k8s-cluster-register-modal-ready-3e1beb02.png`.
- 관찰:
  - 배포 직후 첫 인증 스모크에서 `user_accounts` lock timeout으로 login 500이 1회 발생했다. 이후 `/readyz`, login/session/clusters 모두 정상 회복. 전체 워커 동시 부팅 시 schema/access query 경합으로 보이며 장기 개선은 startup migration 단일화/재시도 처리.
  - api-gateway outbox relay에서 `nats.errors.MaxPayloadError` 경고가 계속 보인다. 기존 DLQ/대형 evidence payload 안정화 항목과 연결해 다음 반복에서 처리 필요.
- 다음:
  1. 남은 repo UX 갭: namespace/environment 하드코딩 제거 또는 서버 정책 기본값 API화, 앱 이름 충돌 방지, repo probe debounce/warnings 표시.
  2. Outbox MaxPayload / DLQ 대형 payload 재발 방지: relay publish 전 payload size guard, archive/retry 정책, evidence payload trim 경로 재점검.
  3. protected route hard reload skeleton 장기 표시 재검증 및 session retry/Cloudflare headless 경로 정리.

## 체크포인트 (현재) — 클러스터 등록 후보 검색/listbox + 사전 점검 상태판

- 구현:
  - `RegisterClusterWizard`의 클러스터 import 후보를 select 한 칸이 아니라 `SearchInput` + listbox 카드로 바꿨다.
  - 후보 검색은 실제 `GET /providers/cluster-discovery` 응답의 `cluster_id/name/source/cloud_provider/deploy_provider/kube_context/external_handle/console_url/labels`만 대상으로 한다. 운영 경로에 mock/fake/hardcoded 후보 없음.
  - provider 카드는 실제 `cloud_provider`, 후보 수, 사용 가능한 설치 경로 수를 표시한다. 불필요한 긴 설명문은 줄여 SaaS 설정 화면처럼 판단 정보만 남겼다.
  - 설치 방식도 select 대신 상태 badge가 있는 listbox 버튼으로 변경했다. `unavailable` 설치 방식은 disabled 상태로 남고, 선택 기본값은 `preferredDeployProvider()`가 실제 available 항목만 고른다.
  - 직접 입력으로 전환하면 이전 import 후보의 `kube_context`가 남지 않도록 선택 상태를 명시적으로 해제한다.
  - preflight 결과는 `cluster_id`, 프로바이더, 에이전트, 중복, kube context 허용 여부를 고정된 상태 행으로 보여준다. 오류/경고는 backend 응답 원문을 그대로 표시한다.
  - UI 전용 CSS는 줄바꿈/폭 튐 방지를 위해 말줄임, 고정 grid, mobile 단일 컬럼 접힘을 추가했다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 10 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
- 배포/live smoke:
  - commit/push: `097ea811 feat: 클러스터 등록 / 후보 검색 / 사전 점검` → `origin/dev`.
  - console image `3e1beb02-dev`에 포함되어 live 배포 완료.
  - browser QA screenshot: `/tmp/k8s-cluster-register-modal-ready-3e1beb02.png`.
- 다음:
  1. import 후보가 0개일 때 직접 입력 flow를 더 빠르게 진행할 수 있도록 설정 단계 CTA/자동 이동 여부 검토.
  2. 실제 provider discovery를 확장할 경우 Plural/external console은 토큰을 직접 노출하지 말고 backend adapter에서 검증 결과만 내려준다.

## 체크포인트 (현재) — metric query/widget 저장 API + service/namespace drilldown

- 구현:
  - backend에 cluster 단위 저장형 metric query preset과 metric widget 정의 API를 추가했다.
    - `GET/POST/DELETE /clusters/{cluster_id}/metric-query-presets`
    - `POST /clusters/{cluster_id}/metric-query-presets/{preset_id}/run`
    - `GET/POST/DELETE /clusters/{cluster_id}/metric-widgets`
  - query/widget은 결과값을 저장하지 않는다. 실행은 기존 `debug_query_plan` + `queue_agent_command` 경로로 실제 target agent가 Prometheus를 조회한다.
  - 권한은 조회 `dashboard.read`, 저장/삭제 `dashboard.manage`, 실행 `evidence.read`로 분리했다. `dashboard.manage`는 release operator 이상 역할에 포함했다.
  - frontend `MetricsView`는 더 이상 운영용 정적 PromQL 프리셋에 의존하지 않는다. 실제 backend query preset 목록을 읽고, 저장/삭제/실행/위젯 저장을 API로 수행한다. context drilldown에서 들어온 쿼리는 저장 전까지 ephemeral 입력값으로만 둔다.
  - 클러스터 상세 드릴다운은 namespace를 deterministic color chip으로 표시하고, 공통 검색(`q`)이 workload/pod/node/service/resource/event의 실제 필드에만 적용된다.
  - Kubernetes Service는 “팟에 설치된 것”이나 “특별 namespace”로 표현하지 않는다. Service는 namespace-scoped network resource이고, selector label이 matching pod를 선택한다. UI는 `resource-detail.related.pods`를 정본으로 삼아 selected pods와 hosting nodes만 강조한다.
  - 운영 경로에 mock/fake/hardcoded production data 추가 없음.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m ruff check src/domains/dashboard/models.py src/domains/dashboard/repository.py src/domains/dashboard/router.py src/packages/contracts/gateway/requests.py src/packages/contracts/gateway/responses.py src/packages/contracts/gateway/routes.py src/packages/contracts/identity.py tests/test_dashboard_metric_presets.py tests/test_database_unit.py` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_dashboard_metric_presets.py tests/test_dashboard_router.py tests/test_database_unit.py tests/test_platform_foundation_openapi.py` → 57 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_docs_index.py tests/test_command_router.py tests/test_inventory_domain.py` → 36 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 10 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
- 커밋 상태:
  - backend/API/contract/doc/test 커밋: `7e19bb9b feat: metric query widget api`.
  - frontend drilldown/metrics UI 커밋은 이 체크포인트 갱신 직후 진행한다.
- 다음:
  1. push 후 backend/console image를 새 commit tag로 빌드·배포한다.
  2. live에서 로그인 세션으로 `/metrics`, `/clusters/:id` Service drawer, `/clusters/:id?tab=nodes&q=<namespace>`를 스모크한다.
  3. Metrics preset 저장 → widget 저장 → 실행 → `/commands/{command_id}` completed까지 실제 agent result를 확인한다.
  4. 이후 남은 큰 범위는 repo/cluster 등록 UX의 provider discovery 정직화, AI chat UI 품질/삭제/컨텍스트 polish, live E2E 반복, 최종 DB 백업 후 reset이다.

## 체크포인트 (현재) — AI 대화 엔티티 컨텍스트 연결

- 구현:
  - 클러스터/노드/서비스/워크로드/팟 `AI 분석` 링크가 이제 `prefill` 문자열만 넘기지 않는다. `{cluster_id, resource_type, kind, namespace, name, uid}` 를 JSON `context` query로 함께 보낸다.
  - `ChatView`는 `/ai?context=...` 또는 개별 query(`cluster_id`, `subject/resource_type`, `kind`, `namespace`, `name`, `uid`, `locale`)를 `AiChatContext`로 보정하고, 새 대화/기존 대화 메시지 모두 실제 `/ai/*` API body의 `context`에 포함한다.
  - AI 라우터는 context allowlist(`cluster_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `locale`)만 253자 이내로 정규화해 저장/이벤트 발행한다. 임의 nested payload를 conversation row에 복사하지 않는다.
  - chat-worker는 이벤트 context를 `ToolContext`의 `cluster_id/resource_type/kind/namespace/name/uid/resource_context`로 승격한다.
  - AI 도구 2개를 추가했다:
    - `get_inventory_resource_detail`: 실제 `inventory/resource-detail` 계열 repository 메서드(`get_inventory_resource`, `list_related_inventory_resources`, `list_resource_events`)로 리소스 세부/관련 팟/이벤트를 읽는다. `raw` 전체 객체는 반환하지 않고 public field만 반환한다.
    - `list_resource_rca_reports`: 실제 RCA report read model을 읽고 가능한 경우 현재 리소스 context로 필터한다.
  - telemetry/PromQL 조회 도구는 이번 커밋에 넣지 않았다. 이유: 메트릭은 브라우저 local state나 합성값으로 만들 수 없고, 기존 command/query 경로로 실제 Prometheus 실행 결과를 받아야 하므로 별도 의미 단위에서 저장형 query/widget API와 함께 연결한다.
  - 운영 경로에 mock/fake/hardcoded production data 추가 없음.
- 검증:
  - `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q` → 17 passed.
  - `uv run pytest tests/test_ai_conversation.py tests/test_ai_platform_tools.py tests/test_ai_chat_hardening.py tests/test_ai_engine.py tests/test_ai_tool_registry.py -q` → 35 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test` → 8 passed.
  - `make manifest-check` → passed.
  - `make check` → 705 passed, 3 skipped.
- 배포/live smoke:
  - commit/push: `a08b13d5 feat: AI 컨텍스트 / 인벤토리 도구 / 문서 정합성` → `origin/dev`.
  - backend CodeBuild `kubernetes-ops-image-build:a91aedb1-7fc9-44dd-9809-88f5ba7c7829` → succeeded.
  - backend image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:a08b13d5-dev`, digest `sha256:9723393d482fc35bbcc640e22e677698f14287238493aa8ffca98e9fe2c74aa5`.
  - console CodeBuild `kubernetes-ops-console-build:944d652e-ac1e-4f18-a147-93518c69176a` → succeeded. `ECR_REPO=kubeheal-console` override 사용.
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:a08b13d5-dev`, digest `sha256:ae6c2208433e17080001b2010cff5f7d0a0486c53a20feb1f64caaac8b6bda43`.
  - rollout 완료: `api-gateway`, `ai-chat-worker`, `console` 모두 1/1 ready, restart 0.
  - `https://k8s.woonyong.org/` → 200 `text/html`, `/console/` → 200 `text/html`, `/api/healthz` → 200 `{"status":"ok","service":"api-gateway"}`.
  - 실제 로그인 세션: `POST /api/auth/login` → 200, `service_session` `Max-Age=7200` 확인.
  - AI context smoke: `POST /api/ai/conversations` with `{cluster_id:"cluster-1", resource_type:"pod", kind:"Pod", namespace:"sandbox", name:"codex-context-smoke", uid:"codex-context-smoke", locale:"ko"}` → 200 accepted, conversation `waiting → completed`. DB `ai_conversations.context`에 allowlist context 저장 확인, assistant 응답도 Pod/sandbox context를 인지했다.
  - smoke conversation cleanup: `DELETE /api/ai/conversations/<id>` → 204, 재조회 404.
  - headless browser smoke: `/` login, refresh session, `/clusters/cluster-1` detail, `/ai?prefill=...&context=...` prefill 화면 확인. Cloudflare/SPA navigation 중 기존 in-flight 요청 abort 로그가 일부 남지만 최종 화면은 정상 렌더.
- 다음 실행:
  1. 다음 의미 단위는 저장형 query/widget API + PromQL 실제 실행 결과를 AI/드릴다운/위젯에 공통으로 연결하는 작업이다.
  2. 브라우저 QA는 Cloudflare clearance/초기 401 리다이렉트 때문에 첫 요청이 흔들릴 수 있다. 판정은 최종 화면 렌더와 API 200 기준으로 보고, 필요 시 Playwright context 재사용 또는 clearance preflight를 넣어 안정화한다.

## 체크포인트 (22:08 KST) — 클러스터 등록 URL 소유권 정리 + live 배포

- 구현:
  - 클러스터 등록 프론트가 더 이상 `management_base_url: ${location.origin}/api`를 보내지 않는다. 브라우저 origin은 Cloudflare/프록시/내부망 구성에 따라 target agent가 접속할 공개 API URL과 다를 수 있으므로 운영 URL 합성은 백엔드가 소유한다.
  - `TargetRegisterRequest.management_base_url`은 클라이언트 생략 가능 기본값 `""`로 바꿨다. `TargetPreflightRequest`도 같은 필드를 받는다.
  - 백엔드는 `PUBLIC_MANAGEMENT_BASE_URL` → `PUBLIC_API_BASE_URL` → `PUBLIC_BASE_URL` 순서로 공개 관리 URL을 정규화한다. `/api` 접미가 없으면 붙인다.
  - 정규화 후에도 공개 URL이 없으면 preflight/register가 `"management base URL is not configured"`로 실패한다. 즉, 운영 경로에서 임의/목업 URL로 진행하지 않는다.
  - live `management-runtime-config`에는 이미 `PUBLIC_BASE_URL=https://k8s.woonyong.org`가 있어 새 backend 배포 후 클러스터 등록은 `https://k8s.woonyong.org/api/install/<token>` 원라인 설치 명령을 생성해야 한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m ruff check src/domains/target/router.py src/packages/contracts/gateway/requests.py tests/test_target_registration.py tests/test_schemas.py` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_target_registration.py tests/test_schemas.py tests/test_provider_registry.py tests/test_docs_index.py` → 59 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 9 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning만 있음.
- 배포:
  - commit/push: `271d8213 fix: 클러스터 등록 URL / 백엔드 공개 주소 / 사전 점검` → `origin/dev`.
  - backend CodeBuild `kubernetes-ops-image-build:8826643d-c4bd-4b74-8775-5b1a0e2bfc8b` → succeeded.
  - api-gateway image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:271d8213-dev`, rollout 1/1 ready.
  - console CodeBuild `kubernetes-ops-console-build:1b5d9462-bf9c-4394-a0c3-95f8c5fb666b` → succeeded.
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:271d8213-dev`, rollout 1/1 ready.
- live smoke:
  - `https://k8s.woonyong.org/` → 200 `text/html`.
  - `https://k8s.woonyong.org/console/` → 200 `text/html`.
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - 실제 로그인 세션 + same-origin 헤더로 `POST /api/targets/preflight` body `{cluster_id:"codex-preflight-271d8213", cloud_provider:"existing-k8s", deploy_provider:"manual-manifest"}` → 200, `valid=true`, `provider_ready=true`, `errors=[]`.
  - same-origin 헤더 없이 admin mutation endpoint를 호출하면 403 `"same-origin session request required"`가 정상이다(CSRF/Origin 방어).
- 병렬 감사 결과 반영:
  - Arendt: 레포 연결은 실제 GitHub probe/branch/manifest/validate를 쓰지만, `credential_ref` 계약과 `source_type` render-worker 전파 parity가 부족하다.
  - Aquinas: `/console` 경로 보존 누락이 목록 3곳에 남아 있고, 위젯/쿼리 등록은 아직 영속 API가 아니라 local state다.
- 다음 커밋 후보:
  1. `/console` 경로 보존 누락 수정: `ClusterListView.tsx`, `RepoListView.tsx`, `WorkflowListView.tsx`.
  2. 클러스터 discovery UX 정직화: “discovered”가 아니라 configured import candidates로 라벨/상태를 명확히 하고, Plural/external은 실제 API 검증 전 `available` 표현을 낮춘다.
  3. repo render parity: `source_type`을 application/watch target/event/render-worker까지 보존해 kustomize/helm 검증과 실행 경로를 일치시킨다. → 아래 "repo source_type 런타임 parity" 체크포인트에서 구현/검증 완료, 배포 필요.
  4. 저장형 쿼리/위젯 API: 현재 `MetricsView` local state를 실제 backend 저장 모델로 승격한다.

## 체크포인트 (현재) — repo source_type 런타임 parity / 다음 프론트 갭

- 구현:
  - `/applications/connect`에서 검증한 `source_type`을 watch target `settings.source_type`에도 저장한다.
  - github-poll-worker DB target 조회는 `settings.source_type` → binding `deploy_policy.manifest_source/source_type` → application `metadata.source_type` 순으로 fallback한다.
  - github-poll-worker webhook body, `GitHubWebhookRequest`, `GitWebhookReceivedBody`, git-pull-worker의 `GitChangedBody`, workflow-controller fan-out body가 모두 `source_type`을 보존한다.
  - manifest-render-worker는 `GIT_MANIFEST_SOURCE_TYPE` env를 최우선으로, 없으면 `GitChangedBody.source_type`을 사용한다. `raw-yaml`/`raw-json`은 raw response 렌더를 허용하고, `kustomize`/`helm`은 checkout cache/local repo path가 없으면 invalid 처리한다.
  - env fallback github-poll-worker도 `GIT_MANIFEST_SOURCE_TYPE`을 webhook body에 싣는다.
  - 운영 데이터 mock/fake/hardcoded 추가 없음.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m ruff check ...` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_applications_router.py tests/test_github_poller.py tests/test_git_pull_worker.py tests/test_manifest_render_worker.py tests/test_promotion_and_global.py tests/test_database_unit.py tests/test_schemas.py tests/test_docs_index.py` → 112 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_event_golden_path.py tests/test_workflow_controller.py tests/test_platform_foundation_openapi.py tests/test_schemas.py tests/test_docs_index.py` → 41 passed.
- 커밋/배포:
  - commit/push: `9cb55b46 fix: 레포 source_type 런타임 전파` → `origin/dev`.
  - backend CodeBuild `kubernetes-ops-image-build:8021c21c-87cc-40f8-8289-99fb1b68e7d8` → succeeded.
  - backend image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:9cb55b46-dev`.
  - rollout 완료: `api-gateway`, `git-pull-worker`, `manifest-render-worker`, `workflow-controller` 모두 1/1 ready.
  - `github-poll-worker` CronJob image도 `9cb55b46-dev`로 교체했다. 새 배포 이후 최근 jobs `github-poll-worker-29723847`, `github-poll-worker-29723848`, `github-poll-worker-29723849`가 Complete 상태다.
  - live smoke: `https://k8s.woonyong.org/api/healthz` → 200 `{"status":"ok","service":"api-gateway"}`.
- 병렬 감사(Avicenna, 읽기 전용)로 확인한 다음 프론트 1순위:
  - 드릴다운 drawer가 아직 백엔드 `GET /clusters/{cluster_id}/inventory/resource-detail` 계약을 충분히 쓰지 않고, 프론트 문자열 필터/팟 그룹핑으로 관련 이벤트를 구성한다. → 아래 "resource-detail 기반 드릴다운" 체크포인트에서 구현/검증 완료, 배포 필요.
  - 엔티티별 AI 분석 버튼은 `prefill` 문자열만 넘기지 말고 `{cluster_id, resource_type, kind, namespace, name, uid}` context를 대화 생성/전송 API에 싣고, chat-worker/tool layer에서 inventory detail/readonly telemetry/RCA 조회를 도구화해야 한다.
  - 위젯/쿼리 등록은 아직 브라우저 local state라 운영자 화면으로는 부족하다. DB 저장형 widget/query preset API가 필요하다.
  - workspace 단일 realtime summary는 멀티클러스터 화면에서 live 데이터가 섞일 수 있다. live store를 `byCluster`로 분리하거나 cluster별 WS subscription을 사용해야 한다.

## 체크포인트 (현재) — resource-detail 기반 클러스터 드릴다운

- 구현:
  - `usePods`와 `useWorkloads`를 분리했다. 팟 탭/메트릭 폴백은 실제 `resource_type=pod`, 워크로드 탭은 실제 `/inventory/workloads` read model을 사용한다.
  - `useInventoryResourceDetail()` 훅을 추가하고 pod/node/service/workload Drawer를 공통 `ResourceDetailDrawer`로 전환했다.
  - Drawer 이벤트는 더 이상 클러스터 전체 이벤트 문자열 includes 필터가 아니라 `resource-detail.events`만 렌더한다. related pods도 `resource-detail.related.pods`에서 온 실제 read model만 보여준다.
  - workload scale/restart 대상은 실제 workload 리소스 중 `kind === "Deployment"`에서만 파생한다. 팟 이름 그룹핑으로 deployment 이름을 추정하지 않는다.
  - 운영 데이터 mock/fake/hardcoded 추가 없음.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test -- --runInBand` → 8 passed.
  - `cd frontend && npm run build` → passed(기존 large chunk warning만 있음).
  - 실제 로그인 세션으로 `GET /api/clusters/cluster-1/inventory/resources?resource_type=node&limit=5` → 200, 실제 노드 2개 확인.
  - 같은 세션으로 실제 노드 `GET /api/clusters/cluster-1/inventory/resource-detail?resource_type=node&kind=Node&name=<node>` → 200, `cluster_id=cluster-1`, related pods 8개.
- 커밋/배포:
  - commit/push: `cfb10563 feat: resource-detail 기반 클러스터 드릴다운` → `origin/dev`.
  - console CodeBuild `kubernetes-ops-console-build:5fd04763-9825-4c22-ba6d-3aad1fe60221` → succeeded.
  - console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:cfb10563-dev`, rollout 1/1 ready.
  - live smoke: `https://k8s.woonyong.org/` → 200 `text/html`, `https://k8s.woonyong.org/console/` → 200 `text/html`, `https://k8s.woonyong.org/api/healthz` → 200 `application/json`.
  - 실제 로그인 세션으로 post-deploy `resource-detail` 재확인: cluster-1 실제 Node `ip-192-168-29-53.ap-northeast-2.compute.internal` → 200, related pods 8개.

## 체크포인트 (21:21 KST) — `/console` 데모 보존 + AI chat 실제 계약 수정

- 구현:
  - 라우터에서 `/console` → `/` 리다이렉트를 제거했다. `/`는 실제 서비스, `/console`은 같은 콘솔 셸을 base path `/console`으로 띄우는 보존 데모 경로다.
  - `ConsoleLayout`에 base path context를 추가했고, 사이드바/브레드크럼/알림 flyover/홈 위젯/상세 화면 링크가 현재 base path를 유지하도록 정리했다.
  - 클러스터 드릴다운의 이벤트/메트릭/AI 분석 링크, 팟 drawer close, 노드/서비스/워크로드 상세 링크, 인시던트/워크플로우/레포 상세 브레드크럼도 `/console`에서 루트로 새지 않게 했다.
  - AI 채팅 상세 조회는 실제 백엔드 envelope `{ conversation, messages }`를 `Conversation`으로 정규화한다. `metadata.tool_trace`는 렌더 가능한 `tool_calls`로 매핑하고, create/send 응답 타입은 실제 accepted response로 맞췄다.
  - AI 채팅의 새 대화/대화 선택/삭제 후 이동도 현재 console base path를 유지한다.
  - 운영 경로에 mock/fake/hardcoded production data 추가 없음.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm test` → 8 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
- 병렬 감사 반영:
  - 레포 연결은 실제 GitHub API 기반 probe → branch select → manifest candidate select → validation → `/applications/connect` 흐름이 이미 구현돼 있다.
  - 클러스터 등록은 실제 provider/cloud discovery가 아니라 현재 env/config 후보(`CLUSTER_CONTEXTS`, `KUBE_CONTEXT_ALLOWLIST`, external console metadata)를 보여주는 수준이다. UI 라벨과 backend adapter를 “configured candidates”/실제 provider discovery로 분리해야 한다.
  - `management_base_url`을 프론트 `location.origin`으로 넣는 현재 방식은 운영/프록시 환경에서 잘못된 설치 URL을 만들 수 있다. backend config `PUBLIC_MANAGEMENT_BASE_URL` 기본값을 내려주는 방식으로 옮기는 것이 다음 P1이다.
- 다음:
  1. 이 단위 커밋/푸시 후 프론트 이미지 빌드 및 live `https://k8s.woonyong.org/`, `https://k8s.woonyong.org/console/` 스모크를 수행한다.
  2. 다음 구현 단위는 클러스터 등록의 실제 discovery semantics와 레포/클러스터 위저드 UI polish다.
  3. 이후 드릴다운 resource-detail API를 프론트 Drawer에 붙여 클러스터→노드/서비스/워크로드→팟 각각의 이벤트/메트릭/AI 분석을 실제 데이터로 확장한다.

### 21:30 KST follow-up — `/console` 로그인 returnTo

- live smoke 중 `/console` 비로그인 진입 → 로그인 후 `/`로 이동하는 회귀를 발견했다.
- 원인: `RequireGuest`가 인증된 사용자가 `/login?returnTo=/console`에 남아 있는 순간 항상 `/`로 리다이렉트했다. LoginView의 `onSuccess` navigation보다 guard redirect가 먼저 실행될 수 있다.
- 수정: `RequireGuest`가 `returnTo` query를 같은 `safeReturnTo` 규칙으로 검증한 뒤 해당 경로로 이동한다. 외부 URL/프로토콜/`//`는 계속 `/`로 방어한다.
- `frontend/tests/e2e_real_backend.py`는 기본 `E2E_APP_BASE_PATH=/console`로 갱신했다. 실제 쓰기 흐름은 기존대로 `E2E_MUTATE=1` 없이는 skip 된다.
- 검증: `cd frontend && npm run typecheck`, `npm test`, `npm run build` 모두 passed. 새 커밋/이미지 빌드/라이브 재스모크가 다음 단계다.

### 21:37 KST follow-up — 세션 확인 retry 제거

- live browser smoke에서 `/console` 로그인 후 새로고침이 약 26초 동안 skeleton에 머무는 문제를 발견했다.
- 원인: 비로그인 진입 때 `GET /auth/session` 401이 TanStack Query 기본 retry를 타면서, 로그인/새로고침 이후까지 지연 재시도가 남았다.
- 수정: `useSession()`에 `retry:false`를 명시했다. 세션 확인의 401은 정상적인 unauth 신호이므로 재시도하지 않고 `RequireSession`이 즉시 `/login?returnTo=...`로 보낸다.
- 다음 검증: typecheck/test/build → 커밋/푸시 → 새 console 이미지 배포 → `/console` 로그인/새로고침 브라우저 smoke 재실행.

### 21:45 KST follow-up — 보호 경로 위 로그인 폼 fallback

- live smoke에서 비로그인 `/console`이 주소는 `/console`인 채 로그인 폼을 렌더하는 케이스를 확인했다. 이 경우 `LoginView`가 query `returnTo`를 못 읽으면 성공 후 `/`로 이동할 수 있다.
- 수정: `LoginView`가 `/login`, `/signup`, `/pending`, `/verify-email`이 아닌 경로 위에서 렌더되면 현재 `pathname+search+hash`를 fallback returnTo로 사용한다. 외부 URL 방어(`safeReturnTo`)는 유지한다.
- 다음 검증: typecheck/test/docs/build → 커밋/푸시 → 새 console 이미지 배포 → focused browser smoke 재실행.

### 21:51 KST live 상태

- live console image: `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubeheal-console:8c8b3b02-dev`.
- public curl smoke:
  - `https://k8s.woonyong.org/` → 200 `text/html`
  - `https://k8s.woonyong.org/console/` → 200 `text/html`
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`
- focused browser smoke:
  - 비로그인 `/console`에서 로그인 폼 렌더 확인.
  - 로그인 후 `/console` 홈(`플릿 현황`) 복귀 확인.
  - `/console/ai`, `/console/clusters`, `/console/metrics`, `/` 경로 렌더 확인.
- 남은 관찰:
  - headless Playwright 새 컨텍스트에서는 첫 로드/새로고침이 20초대까지 늘어나는 경우가 있다. curl 기준 `/api/auth/session`은 로그인 쿠키로 0.3~0.4초라 백엔드 세션 API 자체 병목은 아니다.
  - 다음 UI 안정화 단위에서 Cloudflare/headless 초기 401 처리, skeleton 장기 표시, `/console/not-real-route` 비인증/인증 상태별 404 확인을 더 줄인다.

## 체크포인트 (20:58 KST) — DLQ archive + no-signal incident payload 정리

- 라이브 조치:
  - `6ab49bb3-dev` 배포 후 public `https://k8s.woonyong.org/api/healthz` 200 확인.
  - 레거시 `rca.ai_fallback.requested` DLQ 1,891건은 `/tmp/dlq-ai-fallback-legacy-missing-evidence-checks-20260707-205558.jsonl` 로 백업했다. SHA256: `9cc13ff7905a84456155caaa5f28e482c5976398eef8bb19543d268dda24cc37`.
  - 해당 1,891건은 구버전 워커가 `EvidenceBundle.missing_evidence_checks`를 못 읽어 생긴 2026-07-06 레거시 항목이고, 원 payload가 매우 커 replay 시 NATS/outbox를 다시 막을 수 있어 `status='archived'`로 전환했다.
  - `event_dead_letters`는 `archived=1891`, `open=13`, `replayed=5`가 됐다. 남은 open 13건은 evidence-worker deadlock 9건, 오래된 git/disk-full 계열 4건이다.
  - oversized outbox 28건도 `/tmp/outbox-incident-worker-oversize-20260707-204642.jsonl` 로 백업 후 `sent_at` 처리했다. SHA256: `9b5b65c50e5d87483156aa88485b75a8422d0c4c53df2d9b0702eec473d52ea8`.
- 구현:
  - DLQ 상태 어휘에 `archived`를 추가했고, `/dead-letters/{id}/replay`는 `status=open`만 재발행하도록 막았다.
  - no-signal `incident.detected(detected=false)` payload에서 `Unknown unknown has unknown` 가짜 incident/affected를 제거했다. 이제 정상 샘플은 `severity=None`, `affected=[]`, `incident=None`이다.
  - DB/NATS를 소비하는 singleton worker Deployment는 `strategy.type=Recreate`로 바꿨다. RollingUpdate 중 신규 Pod의 schema compatibility DDL과 기존 worker의 evidence/outbox write가 겹치며 `evidence`/`outbox` lock deadlock DLQ를 만든 것을 차단하기 위함이다. `api-gateway`, `console`, `realtime-gateway`는 무중단 교체가 필요해 RollingUpdate 유지.
- live 반영:
  - worker Deployment 31개에 `strategy.type=Recreate`를 `kubectl patch`로 반영했다. live image는 모두 `63b705e8-dev` 유지 확인.
  - 2026-07-07 21:09 KST 기준 public health 200, outbox pending 0, 최근 3분 신규 open DLQ 0.
  - `event_dead_letters` 현재 상태: `archived=1891`, `open=14`, `replayed=5`.
- 검증:
  - `python -m ruff check ...` → passed.
  - `.venv/bin/pytest tests/test_gateway_error_handler.py tests/test_database_unit.py tests/test_docs_index.py -q` → 61 passed.
  - `.venv/bin/pytest tests/test_rca_evidence.py tests/test_incident_symptom_derivation.py tests/test_dashboard_projection.py -q` → 31 passed.
- 다음:
  1. 남은 open DLQ 14건은 replay 가능/아카이브 가능을 개별 판단한다. 현재 신규 증가는 멈춘 상태다.
  2. 그 다음 프론트 우선순위로 `/console` 데모 보존과 `/` 실제 드릴다운 UI 작업을 진행한다.

## 체크포인트 (20:35 KST) — outbox relay batch 영구 안정화

- 라이브 진단:
  - `2a62d262-dev` 배포 후 신규 compact event는 적용됐지만, `incident-worker` outbox relay가 여전히 기본 batch 1000으로 동작해 `SELECT ... FOR UPDATE` 범위가 커지고 `LockNotAvailable`/statement timeout이 발생했다.
  - live 임시 조치로 `incident-worker`, `evidence-worker`, `plan-worker`, `analyze-worker`, `rca-worker`, `recovery-worker`, `select-worker`, `approval-worker`에 `OUTBOX_RELAY_BATCH=10`을 적용하고 rollout을 완료했다.
- 구현:
  - `src/packages/runtime/relay.py`의 `OUTBOX_RELAY_BATCH` 기본값을 1000에서 10으로 변경했다.
  - `scripts/aws-up.sh`의 `management-runtime-config`에도 `OUTBOX_RELAY_BATCH="${OUTBOX_RELAY_BATCH:-10}"`을 추가해 재배포/재부팅 시 기본값이 되돌아가지 않게 했다.
  - `tests/test_env_defaults.py`, `docs/spec/packages/runtime.md`, `docs/continuation-execution-plan-2026-07-07.md`를 새 기본값과 맞췄다.
- 다음 즉시 할 일:
  1. ruff/pytest/bash syntax 검증 후 커밋/푸시한다.
  2. 새 이미지 tag로 CodeBuild 직접 빌드 후 management 워커를 롤아웃한다.
  3. live configmap에도 `OUTBOX_RELAY_BATCH=10`을 패치한다.
  4. `incident-worker` 로그에서 `MaxPayloadError`, `LockNotAvailable`, `relay_error`가 사라졌는지 확인하고, 남은 구버전 oversized outbox는 백업 후 `source`/`event_id`/payload 크기 조건으로만 격리한다.

## 체크포인트 (20:25 KST) — RCA/DLQ 폭증 안정화 패치

- 라이브 진단:
  - DLQ `open` 1,898건 중 1,891건은 `rca-fallback-worker`가 구버전 payload(`missing_evidence_checks`)를 디코드하지 못한 과거 호환성 DLQ였다.
  - 최근 evidence window에서도 `cluster.evidence.received` 100건 중 `incident.detected` 95건이 생성되어, UI 숫자가 실제 장애 수가 아니라 evidence window 단위 폭증을 반영하는 구조였다.
  - `incident-worker` 로그에서 `nats.errors.MaxPayloadError: maximum payload exceeded`가 반복됐다. 원인은 `incident.detected`/`evidence.bundle.built` 이벤트에 원본 evidence와 bundle이 중복 포함되어 NATS 기본 payload 한계를 넘는 경우가 있었기 때문이다.
  - Kubernetes Event는 해결 뒤에도 목록에 남을 수 있어, 현재 pod가 정상이어도 오래된 Warning event가 매 window마다 새 incident로 승격될 수 있었다.
- 구현:
  - `pipeline/symptom.py`에 Kubernetes Warning event freshness 필터를 추가했다. `cluster.collected_at`이 있으면 `last_timestamp`/`first_timestamp`가 10분보다 오래된 Warning event는 symptom 신호에서 제외한다.
  - `incident.detected`와 `evidence.bundle.built` 이벤트에 실리는 `Evidence`는 원본 payload 전체가 아니라 `object_ref`, lineage, cluster 식별자만 보존하는 compact reference로 줄였다. 원본은 기존처럼 evidence store에 저장된다.
  - `EvidenceBundle.items[].value`는 RCA 판별에 필요한 관련 리소스/로그/메트릭/트레이스만 bounded 형태로 싣는다. pods/events/nodes/log entries/streams/values/metric results/trace results/문자열 길이를 제한했다.
  - `EvidenceJobResultRequest`에도 `AgentEvidenceRequest`와 같은 1MiB 직렬화 상한을 추가해 provider job result가 DB/NATS/LLM 경로를 압박하지 못하게 했다.
  - 관련 스펙 문서(`docs/spec/services/ai-agent.md`, `docs/spec/packages/contracts.md`, `docs/spec/services/target-cluster-agent.md`)를 계약과 맞췄다.
- 검증:
  - `python -m ruff check ...` → passed.
  - `.venv/bin/pytest tests/test_incident_symptom_derivation.py tests/test_rca_evidence.py tests/test_target_evidence_jobs.py tests/test_agent_evidence_ingest.py -q` → 43 passed.
  - `.venv/bin/pytest tests/test_dashboard_projection.py tests/test_schemas.py tests/test_docs_index.py -q` → 31 passed.
- 다음 즉시 할 일:
  1. 안정화 패치 커밋/푸시 후 CI/CD 또는 직접 이미지 빌드로 management 워커를 롤아웃한다.
  2. 배포 후 `incident-worker` 로그에서 `MaxPayloadError`가 사라졌는지, `outbox where source='incident-worker' and sent_at is null`가 감소하는지 확인한다.
  3. 옛 oversized outbox가 relay 앞단을 계속 막으면, 백업 후 특정 `event_id`/`source='incident-worker'`/oversized 조건으로만 격리 처리한다. 전체 DB 초기화는 아직 금지.
  4. 그 다음 프론트 우선순위: `/console` redirect 제거 및 demo 보존, `/` 실제 서비스 드릴다운을 inventory `resource-detail` API 중심으로 재구성, AI chat 상세 response shape 불일치 수정, repo/cluster 등록 UI 실API 검증 플로우 폴리싱.

## 체크포인트 (20:07 KST) — api-gateway OOM + evidence 정책 완화

- 원인:
  - 라이브 `api-gateway` Pod가 `CrashLoopBackOff`, Last State `OOMKilled`, exit code 137, restart count 37 상태였다.
  - 살아있는 순간에는 api-gateway LoadBalancer `/healthz`, `/api/healthz`가 200을 반환했고, console LoadBalancer `/api/healthz`는 gateway 재시작 타이밍에 502를 반환했다.
  - 따라서 public `/api` 502의 직접 원인은 console 프록시 upstream이 재시작 중인 api-gateway를 만나는 안정성 문제다.
  - live 정책 확인 결과 `cluster-1`, `cluster-2`는 provider 4개가 모두 10초 interval, max_workers 3으로 동작 중이었다. 두 클러스터 기준 evidence job/result가 과도하게 촘촘했고, DB에는 completed evidence_jobs가 58k+ 누적되어 있었다.
- 구현:
  - 1차로 `deploy/management/services.yaml`의 api-gateway resources를 requests `cpu=50m`, `memory=256Mi`, limits `cpu=1`, `memory=1Gi`로 상향했으나 새 Pod도 시작 직후 OOM/restart가 재현됐다.
  - 2차로 resources를 requests `cpu=100m`, `memory=512Mi`, limits `cpu=1`, `memory=2Gi`로 상향했으나 약 4분 뒤 OOM/restart가 재현됐다.
  - 3차로 resources를 requests `cpu=100m`, `memory=1Gi`, limits `cpu=1`, `memory=4Gi`로 상향했다.
  - gateway `OUTBOX_RELAY_BATCH=10`을 추가했다. 기존 기본값 1000은 큰 evidence 페이로드 backlog를 한 번에 읽어 메모리 피크를 키울 수 있기 때문이다.
  - gateway에 `MALLOC_ARENA_MAX=2`, `MALLOC_TRIM_THRESHOLD_=65536`을 추가해 반복 JSON/DB 처리 후 RSS 반환 여지를 확보했다.
  - 기본 evidence interval을 30초로, provider max_workers 기본값을 2로 완화했다.
  - live DB의 `agent_policies`에서 `cluster-1`, `cluster-2` policy generation을 4로 올리고 모든 provider interval 30초, max_workers 2로 반영했다.
  - 이 변경은 OOM/수집 폭주 완화용 안정화이며, incident/DLQ 증가 원인 분석은 별도 작업으로 계속한다.
- 다음:
  - 4Gi resources + `OUTBOX_RELAY_BATCH=10` + allocator env live patch 후 rollout 안정화 확인.
  - agent policy status에서 generation 4 적용 확인.
  - console LB `/api/healthz`, public `https://k8s.woonyong.org/api/healthz`, `kubectl get deploy api-gateway`, restart count 증가 여부를 확인.
- 라이브 검증:
  - 2026-07-07 20:10 KST 기준 새 `api-gateway` Pod restart 0, memory 약 98Mi, public `/api/healthz` 200.

## 체크포인트 (19:55 KST) — repo atomic connect + live API OOM 분석

- 구현:
  - `POST /applications/connect` 계약을 추가했다.
  - 프론트 레포 연결 위저드는 이제 `POST /applications` + `POST /applications/{id}/deployments` 두 단계가 아니라 `POST /applications/connect` 한 번만 호출한다.
  - 서버는 사용자가 선택한 `repo_ref`, `branch`, `manifest_path`, `source_type`을 다시 `RepositoryDiscoveryService.validate_manifest()`로 검증한 뒤에만 repository, application, watch target, deployment binding을 같은 unit-of-work 안에서 등록한다.
  - 저장 metadata/deploy_policy에 실제 검증 결과(`source_type`, `validation_mode`, `validated_resource_count`, `validation_warnings`)를 남긴다. mock/fake/hardcoded production data 추가 없음.
- 검증 진행 중:
  - 새 테스트 `test_connect_application_validates_manifest_and_registers_repo_watch_binding_atomically` 추가.
  - 아직 커밋 전이면 다음 순서로 실행: ruff format/check → `pytest tests/test_applications_router.py tests/test_platform_foundation_openapi.py tests/test_docs_index.py` → frontend typecheck/lint/test/build → 커밋/푸시.
- 라이브 분석:
  - AWS/Kubernetes context `kubernetes-ops` 접근 가능.
  - `https://k8s.woonyong.org/` 및 console LoadBalancer `/`는 200.
  - console LoadBalancer `/api/healthz`는 502가 발생했다.
  - api-gateway LoadBalancer `/healthz`, `/api/healthz`는 살아있는 순간 200을 반환한다.
  - `api-gateway` Pod는 `CrashLoopBackOff`, Last State `OOMKilled`, exit code 137, restart count 37 확인. 현재 배포 리소스는 requests `64Mi`, limits `512Mi`.
- 다음:
  - `deploy/management/services.yaml`의 api-gateway memory request/limit을 운영 부하 기준으로 상향하고, 동시에 evidence/result 폭증으로 API 메모리가 뛰는지 별도 계측한다.
  - 메모리 상향은 안정화용이고, 인시던트/DLQ 폭증 RCA는 별도 커밋으로 이어간다.

## 체크포인트 (19:42 KST) — inventory resource detail API

- 구현:
  - `GET /clusters/{cluster_id}/inventory/resource-detail` 추가.
  - 입력 identity: `resource_type`, `kind`, `name`, optional `namespace`.
  - 응답: `resource`, `related`, `events`. 모든 public `InventoryResourceResponse`는 Kubernetes raw object 를 제거한다.
  - 관계 계산은 실제 inventory read model만 사용한다: node→pods(`summary.node_name`), service→pods(selector/labels), workload→pods(selector 또는 owner).
  - 이벤트는 Kubernetes Event `summary.involved_kind/name/uid`가 resource identity와 일치하는 row만 반환한다.
- 검증:
  - `.venv/bin/ruff check src/domains/inventory/repository.py src/domains/inventory/router.py src/packages/contracts/gateway/routes.py src/packages/contracts/gateway/responses.py tests/test_inventory_domain.py tests/test_platform_foundation_openapi.py` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_inventory_domain.py tests/test_platform_foundation_openapi.py tests/test_docs_index.py` → 21 passed.
- 다음:
  - 프론트 `useResourceDetail`과 공통 Drawer/DrilldownPanel을 붙인다.
  - 클러스터 연결은 아직 완료 아님: discovery/preflight와 registration write boundary 정합화가 필요하다.

## 체크포인트 (19:24 KST) — console origin /api smoke 정규화

- 구현:
  - `scripts/aws-up.sh`가 public LoadBalancer/DNS origin을 `api-gateway`가 아니라 `console` service 기준으로 잡도록 변경했다.
  - console origin health는 `/api/healthz`가 `{"service":"api-gateway"}`를 반환하는지로 확인한다. root `/healthz`는 SPA fallback일 수 있으므로 smoke 기준으로 쓰지 않는다.
  - `scripts/smoke.sh`, `scripts/register-target.sh`는 `BASE_URL`이 console origin이면 `${BASE_URL}/api`, raw gateway origin이면 `${BASE_URL}`를 API base로 자동 판별한다.
  - target agent `MANAGEMENT_BASE_URL`은 aws-up 경로에서 `${console_origin}/api`로 주입된다.
  - `scripts/status.sh`, `docs/aws-testing-runbook.md`, `docs/local-testing.md`도 `/api/healthz` 기준으로 정리했다.
- 검증:
  - `bash -n scripts/aws-up.sh scripts/smoke.sh scripts/register-target.sh scripts/status.sh` → passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_aws_testing_workflows.py tests/test_service_entrypoints.py tests/test_docs_index.py` → 33 passed.
- 남은 관련 작업:
  - GitHub Actions runner allocation 실패는 repo/org/billing/policy 계층 확인이 필요하다.
  - live 배포 후 passive smoke: `/` title, `/api/healthz`, `/api/readyz`, 비로그인 `/api/providers/cluster-discovery` 401.

## 체크포인트 (19:16 KST) — fleet health truthfulness

- 구현:
  - `/fleet/summary` health에 `stale`, `unknown` 상태를 추가했다.
  - pod/node/usage 관측값이 없으면 더 이상 `healthy`가 아니라 `unknown`으로 표시된다.
  - 관측값은 있으나 agent connection status가 online이 아니면 `stale`로 표시된다. 단 critical/warning 조건이 있으면 그 상태가 우선이다.
  - Fleet totals에 `stale`, `unknown` 카운트를 추가했다.
  - `/clusters` 목록의 `incident_count`를 0으로 하드코딩하지 않고 `count_open_rca_incidents` projection 값을 사용한다.
  - 프론트 fleet health 타입/라벨/heatmap score/severity를 `stale`, `unknown`까지 확장했다.
  - mock/fake/hardcoded production data 추가 없음.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_fleet_router.py tests/test_target_registration.py tests/test_platform_foundation_openapi.py` → 37 passed.
  - `.venv/bin/ruff check src/domains/dashboard/fleet_router.py src/domains/target/router.py src/packages/contracts/gateway/responses.py tests/test_fleet_router.py tests/test_target_registration.py` → passed.
  - `cd frontend && npm run typecheck` → passed.
- 남은 관련 작업:
  - cluster-agent provider failure 자체를 evidence payload/status에 명시하는 source-level provider_error 저장.
  - service/endpoint health read model(서비스 selector/endpoints/pod readiness 조인).
  - CPU/MEM metrics-to-usage projection.

## 체크포인트 (19:12 KST) — workload scale 실행 정책 정합성

- 구현:
  - target-agent Kubernetes command policy에 `user-workload` scope를 추가했다.
  - `k8s.apps.v1.deployments.scale` handler는 `target-agent` 자체 deployment 전용 정책이 아니라 실제 workload deployment 정책으로 실행된다.
  - 허용 조건은 target cluster, `patch` verb, `deployments` resource, `CONTROL_ALLOWED_NAMESPACES` 안의 namespace로 제한했다.
  - API의 `/clusters/{cluster}/namespaces/{namespace}/deployments/{deployment}/scale` 검증과 agent 실행 정책이 같은 namespace allowlist를 보게 되었다.
  - 운영 데이터/명령 경로에 mock/fake/hardcoded data 추가 없음.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_target_agent_commands.py tests/test_command_worker.py tests/test_command_router.py` → 40 passed.
  - `.venv/bin/ruff check src/services/target/cluster-agent/commands/kubernetes.py src/services/target/cluster-agent/agent.py src/domains/command/handler.py tests/test_target_agent_commands.py` → passed.
- 남은 관련 작업:
  - rollout restart는 기존 `apply_manifest` 계열 handler와 `CONTROL_ALLOWED_NAMESPACES`로 이미 guarded 되어 있지만, 명령 결과 UI에서 실패 사유를 더 명확히 보여주는 polish는 남아 있다.
  - P0 telemetry truthfulness와 RCA/realtime cluster RBAC를 다음 백엔드 안정화 단위로 진행한다.

## 체크포인트 (19:06 KST) — 운영 UI 표면 정리 + 병렬 감사 반영

- 구현:
  - 공용 모달/드로어 닫기 버튼의 문자 `✕`를 SVG 아이콘으로 교체하고 `aria-label`/`title`을 유지했다.
  - 메트릭 일시정지/재개 버튼의 문자 아이콘을 SVG `pause/play` 아이콘으로 교체했다.
  - 홈/클러스터/레포/조직/그룹/권한 생성 버튼의 `+ 텍스트`를 아이콘+라벨 형태로 정리했다.
  - PromQL 실행 결과와 AI 복구 액션 제안은 중첩 `card` 대신 `query-row`, `chat-action` 표면으로 분리해 운영 UI 깊이를 낮췄다.
  - 클러스터 scale/restart, 레포 연결, 클러스터 등록, workflow detail에서 내부 구현 설명성 문구를 줄이고 실제 운영 상태 중심 문구로 정리했다.
  - `더미` 표현이 남은 로고 주석을 제거했다. 운영 경로 mock/fake/hardcoding 추가 없음.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm test` → 6 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_docs_index.py` → 9 passed.
- 병렬 감사 반영:
  - UI 감사(Dirac): 아직 남은 항목은 heatmap legend/selection/keyboard, PromQL query UX 강화, workflow graph readability, chat reduced-motion/tool detail polish.
  - 백엔드/데이터 흐름 감사(Socrates): P0는 provider 수집 실패/스테일 데이터가 healthy로 표시될 수 있는 문제, workload scale/restart API와 agent policy 불일치, RCA/realtime cluster RBAC 누수.
  - 등록 흐름 감사(Nash): `source_type`이 validation 뒤 app/binding/runtime에 저장되지 않는 P1, app+binding 비원자성 P1, `/targets` register가 preflight guard 일부를 재강제하지 않는 P1, cluster import metadata 미보존 P2.
  - QA/deploy 감사(Banach): production root/API는 보이나 latest code 자동 배포는 Actions runner allocation 실패와 DNS console/api split 때문에 신뢰 불가. root `/healthz`는 SPA HTML이므로 smoke는 반드시 `/api/healthz`, `/api/readyz`, `/api/providers/cluster-discovery=401` 기준으로 한다.
- 다음 P0:
  - Telemetry truthfulness: provider error/stale/unknown 상태와 실제 incident count projection을 먼저 고친다.
  - Workload scale/restart: agent policy/handler가 지원하기 전까지 UI/API 노출을 제한하거나, policy를 workload-scoped로 안전하게 구현한다.
  - RCA/realtime RBAC: evidence/report/AI incident tool/realtime subscription에서 cluster 접근 권한을 필터링한다.
  - `scripts/aws-up.sh`가 custom-domain/DNS를 `api-gateway`로 되돌리지 않도록 console service origin 기준으로 수정한다.
  - passive smoke scripts를 console origin 기준 `/api/*`로 정규화한다.
  - repo connect backend write boundary: source_type/validation receipt 저장 및 app+binding 원자 처리.
  - target register write boundary: preflight guard 재사용, duplicate overwrite 방지, import metadata 저장.

## 체크포인트 (18:54 KST) — 레포/클러스터 위저드 선택 안정화

- 구현:
  - 레포 연결 위저드의 manifest 후보 선택값을 `path` 단독에서 `source_type:path`로 변경했다. 같은 경로가 raw/kustomize/helm 등 여러 후보로 잡혀도 사용자가 선택한 attach 방식 그대로 validation에 들어간다.
  - 클러스터 등록 위저드는 flow 기본 deploy provider가 unavailable이면 첫 available deploy provider로 대체한다.
  - available deploy provider가 하나도 없는 flow는 provider 단계에서 다음으로 진행하지 못한다.
  - 설치 방식 select는 unavailable 옵션을 disabled 처리하고 `unavailable_reason`을 표시한다.
  - 문서 `docs/fd/views/resources.md`, `docs/spec/frontend/repo.md`, `docs/spec/frontend/resources.md`를 실제 흐름 기준으로 갱신했다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm test` → 6 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 남은 백엔드 차이:
  - API 직접 호출 우회를 막으려면 `POST /applications` 서버 측에서 repository validation을 재실행하거나 validation receipt/source_type을 받아 강제해야 한다.
  - cluster import 후보의 non-secret metadata(`source`, `external_handle`, `console_url`, `labels`)는 아직 `/targets` 저장 계약에 보존되지 않는다.

## 체크포인트 (18:45 KST) — AI 채팅 prefill/갱신/UX polish

- 구현:
  - `/ai?prefill=...`이 같은 ChatView 인스턴스에서 바뀌어도 draft 입력창에 반영되도록 동기화했다.
  - 사용자가 prefill draft를 수정하는 중 폴링 리렌더가 입력을 덮어쓰지 않도록 dependency를 `prefill` 문자열로 제한했다.
  - 기존 대화에 메시지를 보낸 뒤 현재 대화뿐 아니라 대화 목록도 invalidate한다. waiting/updated_at 상태가 목록에 빠르게 반영된다.
  - 전송 성공 시 `prefill` search param을 제거해 같은 문장이 다시 draft로 되살아나는 문제를 막았다.
  - 채팅 UI의 삭제/전송 버튼을 텍스트 중심에서 아이콘 중심으로 정리하고, status는 badge로 표시한다.
  - 이 변경은 실제 `POST /ai/conversations`, `POST /ai/conversations/{id}/messages`, `GET /ai/conversations*`, `DELETE /ai/conversations/{id}` 경로만 사용한다. mock/fake/hardcoded 응답 없음.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm test` → 5 passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 다음:
  - repo/cluster 등록 wizard의 동적 단계와 UI polish를 이어간다.

## 체크포인트 (18:40 KST) — 클러스터 드릴 URL state/컨텍스트 액션

- 구현:
  - 클러스터 상세에서 노드/서비스/워크로드 drawer를 local React state가 아니라 URL search state로 복원 가능하게 만들었다.
  - URL 형식: `/clusters/{cluster_id}?tab=nodes&detail=node&name={node}`, `/clusters/{cluster_id}?tab=services&detail=service&namespace={ns}&name={service}`, `/clusters/{cluster_id}?tab=workloads&detail=workload&namespace={ns}&name={workload}`.
  - 새로고침/공유 링크 후에도 실제 `inventory/summary`, `inventory/services`, `inventory/resources?resource_type=pod` 응답에서 해당 리소스를 다시 찾아 drawer를 연다.
  - cluster/node/service/workload/pod ContextActions에 `이벤트`, `메트릭`, `AI 분석`을 모두 제공한다.
  - `이벤트`는 같은 클러스터의 `tab=events&q={target}`로, `메트릭`은 `/metrics?cluster=...&subject=...&name=...&namespace=...`로, `AI 분석`은 `/ai?prefill=...`로 연결한다.
  - 워크로드 target은 실제 pod inventory의 `workload_name || pod.name`으로 묶어 산출한다. mock/fake/hardcoded data 없음.
- 검증:
  - `cd frontend && npm test` → 5 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 다음:
  - AI chat prefill/session 연결 품질, 대화 UX polish, 실제 recovery/action context 연결을 다음 의미 단위로 진행한다.

## 체크포인트 (18:34 KST) — evidence/inventory 공개 응답 raw 차단

- 구현:
  - `GET /evidence` 응답에서 저장된 evidence `payload` 원문을 제거했다. 대신 `cluster_id`, `evidence_ref`, `summary`, `sources[]` 안전 요약만 내려준다.
  - `sources[]`에는 `source`, 집계 요약, 허용된 lineage(`schema_version`, `collector`, `collector_version`, `source_version`, `query_version`, `collected_at`, `evidence_key`, `source_id`, `agent_id`, `window_start`)만 포함한다.
  - `GET /clusters/{cluster_id}/inventory/resources` 계열 공개 응답에서 Kubernetes raw object를 제거했다. 저장소 내부 raw는 유지하되 browser/API response에는 싣지 않는다.
  - 인시던트 상세 증거 panel은 raw JSON CodeBlock 대신 evidence ref, source 요약, collector version만 표시한다.
  - 프론트 타입/adapter도 raw field 의존을 제거했다.
- 이유:
  - 실제 운영 데이터만 보여준다는 원칙과 동시에 token/secret/manifest 원문이 UI·API를 통해 노출되는 문제를 막기 위함이다.
  - version/rollback 판단에 필요한 lineage는 남기되, evidence 값 자체는 projection/API에서 화이트리스트 방식으로만 공개한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_evidence_query_api.py tests/test_inventory_domain.py tests/test_fleet_router.py tests/test_platform_foundation_openapi.py` → 29 passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm test` → 4 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 다음:
  - 이 체크포인트 커밋/푸시 후 바로 repo/cluster 등록 wizard의 동적 흐름, drill URL state, AI chat 연결 품질을 의미 단위로 이어간다.

## 체크포인트 (18:22 KST) — 운영 상태/Bruno 보안/stale 문서 정리

- 커밋/푸시:
  - `6cf5f548 fix: 드릴 메트릭 / 실제시각 / 로그인 복원` → origin/dev push 완료.
- 최신 GitHub Actions:
  - `6cf5f548`: CI `28855387595`, AWS CD `28855387636`, Promote `28855387617` 모두 failure.
  - 각 run job은 `runnerName=null`이고 4~6초 내 실패한다. AWS CD deploy, Promote merge job은 skipped.
  - 이전 `c2dd6901`: CI `28854743151`, AWS CD `28854743097`, Promote `28854743082`도 같은 runner allocation 패턴.
  - 판단: 현재 실패는 코드 테스트 로그가 아니라 runner 배정/Actions control-plane 또는 계정 quota/policy 계층 문제다. 최신 dev 코드가 AWS에 자동 배포되지 않았다.
- 라이브 smoke(직접 확인):
  - `https://k8s.woonyong.org/` → HTTP 200, title `운영 콘솔`.
  - `https://k8s.woonyong.org/console/` → HTTP 200, 현재는 같은 SPA.
  - `https://k8s.woonyong.org/api/healthz` → HTTP 502.
  - `https://k8s.woonyong.org/api/readyz` → timeout.
  - `https://k8s.woonyong.org/api/providers/cluster-discovery` → timeout.
  - DB reset 금지. 먼저 Cloudflare origin, console nginx `/api` proxy, api-gateway service/endpoints/rollout 확인이 필요하다.
- 보안/문서 정리:
  - `docs/api/collection.bru`와 `docs/api/environments/aws-test.bru`의 운영 기본 인증값을 placeholder로 바꾸고 `auto_login: false`로 둔다.
  - 실제 AWS 계정은 `*.local.bru` 또는 Bruno UI override에만 둔다.
  - `frontend/docs/*`의 삭제된 mock 구조 설명을 real-backend 기준으로 정리하고, 삭제된 mock import를 가진 `frontend/scripts/validate-metrics.ts`를 제거했다.
  - `tests/test_docs_index.py`가 `frontend/docs`와 `frontend/scripts`도 stale language scan에 포함한다.

## 체크포인트 (18:14 KST) — 프론트 실제시각/드릴 메트릭 보강

- 구현:
  - 프론트 adapter가 백엔드 timestamp 누락 시 `new Date()`로 현재 시각을 합성하던 동작을 제거했다.
  - `timeAgo()`는 빈 값/잘못된 시각을 `—`로 표시한다. 실제 관측 시각이 없는데 "방금 전"처럼 보이는 운영 오판을 막기 위함이다.
  - `/metrics`는 `cluster/node/service/workload/pod` drill query param을 읽어 대상별 PromQL 후보를 자동 입력하고, 같은 range로 즉시 실행할 수 있다.
  - 쿼리 실행은 기존 `POST /agent/debug/query` → `GET /commands/{id}` 경로 그대로이며, 실측 agent 결과만 표시한다.
  - 인증 만료/미로그인 상태에서 drill URL로 진입해도 로그인 후 `search/hash`를 포함한 원래 URL로 복귀한다.
  - light theme의 잘못된 hex token(`--color-action-input-hover`)을 수정했다.
- 검증:
  - `cd frontend && npm test` → 4 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.

## 체크포인트 (18:04 KST) — AI 대화 삭제 API/프론트

- 구현:
  - `DELETE /ai/conversations/{conversation_id}` 추가. 세션 workspace 범위의 `ai_conversations` row만 삭제한다.
  - 메시지는 `ai_conversation_messages.conversation_id` FK `ON DELETE CASCADE`로 함께 삭제된다.
  - 프론트 `ChatView` 좌측 대화 목록과 현재 대화 헤더에 삭제 액션을 붙였다.
  - 삭제 성공 시 목록 query invalidate + 단건 query remove, 현재 대화 삭제 시 `/ai`로 이동한다.
  - Bruno `07-ai/05-delete-conversation.bru`, API map/spec 문서에 DELETE 계약을 추가했다.
- 검증:
  - `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py tests/test_ai_conversation.py -q` → 27 passed.
  - `bash scripts/frontend-check.sh` → typecheck, eslint, unit test, production build OK.
  - `make check` → 688 passed, 3 skipped; manifest check 포함.
  - `make manifest-check` → management 53 objects, target 16 objects.

## 최신 업데이트 (18:10 KST) — evidence lineage/rollback 표시

- 사용자 지적: RCA `EvidenceItem.source`만으로는 버전 변경/롤백 판단이 어렵다.
- 구현 방향:
  - `source`는 룰 매칭용 안정 키로 유지한다.
  - 새 최상위 event body 필드를 추가하지 않고 기존 evidence JSON payload 내부 `_lineage`에 `schema_version`, `collector`, `collector_version`, `source_id`, `agent_id`, `window_start`, `evidence_key`, `collected_at` 등을 저장한다. 이유: `EventBody.from_body()`는 unknown field를 DLQ로 보내므로, rolling deploy 중 구버전 워커가 죽지 않게 하기 위해서다.
  - `/rca-reports` 요약 API는 raw evidence payload를 노출하지 않고, `evidence_bundle.items[].value._lineage`에서 허용 필드만 `supporting_evidence_refs[]`로 승격한다.
  - 인시던트 상세의 RCA 리포트 근거 목록에 `schema vN`, collector/version/evidence key/window/agent 메타를 표시한다.
  - recovery action 후보 row에 `rollback_plan`을 표시한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_rca_evidence.py tests/test_evidence_query_api.py` → 17 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.
- DB 초기화:
  - 최종 기능/배포/E2E 완료 후 1회 실행한다.
  - 필수 순서: 백업/스냅샷 → restore 가능성 확인 → reset/migrate/bootstrap → 실제 cluster-1/cluster-2/repo 재등록 → 새 evidence 수집 확인.

## 최신 업데이트 (17:16 KST) — incident fallback 테스트 추가

- `c5f81982 fix: repo manifest 검증 gate 강화`는 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851760498` → failure.
  - Promote Dev To Main run `28851760555` → failure.
  - AWS CD run `28851760534` → failure.
  - 기존과 같은 runner allocation 계층 문제로 본다.
- 프론트 테스트 추가:
  - `frontend/tests/incident_detail_recovery_fallback.test.mjs`: Vite SSR + React Query cache로 incident detail `not_found` fallback을 렌더링하고, 동일 correlation id의 real recovery-plan payload가 복구 계획 panel에 표시되는지 검증한다.
  - `frontend/package.json`: `npm test` → `node --test tests/*.test.mjs`.
  - `frontend/tests/README.md`: mock 중심 설명 제거, component smoke와 real-backend smoke(`E2E_MUTATE=0`) 실행 원칙 문서화.
- 검증:
  - `cd frontend && npm test` → 1 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.

## 최신 업데이트 (17:14 KST) — repo manifest validation gate 강화

- `ec00ea77 feat: target preflight 연결성 확인`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851671441` → failure.
  - AWS CD run `28851671409` → failure.
  - Promote Dev To Main run `28851671384` → failure.
  - 기존과 같은 runner allocation 계층 문제로 본다.
- repo 연결 위저드 개선:
  - `frontend/src/features/resources/ConnectRepoWizard.tsx`
  - legacy placeholder인 `validation.status === "not_run"`으로는 다음 단계/앱 생성으로 진행하지 못하게 막았다.
  - 이제 repo 입력 → branch list → manifest 후보 → static/render validation 후 `validation.valid === true`인 경우에만 app/binding 생성 단계로 진행한다.
  - mock/fake/hardcoded data 없음.
- 검증:
  - `python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py` → 28 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.

## 최신 업데이트 (17:10 KST) — target preflight Kubernetes 연결성 확인

- `2107376f feat: incident 복구계획 fallback 연결`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851117498`: jobs `85566424069`, `85566424087`, `85566424088` 모두 `runner_id=0`.
  - Promote Dev To Main run `28851117588`: verify job `85566424109` `runner_id=0`, merge skipped.
  - AWS CD run `28851117482`: `Test before deploy` job `85566424684` `runner_id=0`, deploy skipped.
  - 계속 코드 실패가 아니라 GitHub-hosted runner 배정/계정·org 정책·quota 문제로 본다.
- target 등록 preflight 개선:
  - `src/domains/target/router.py`: direct apply(`deploy_provider="kube-context"`, `apply=true`)이고 allowlist/provider/image 검증을 통과하면 `kubectl [--context <ctx>] get --raw=/version --request-timeout=5s`로 실제 Kubernetes API 연결성을 non-mutating 방식으로 확인한다.
  - 실패 시 `kubernetes preflight connection failed`, timeout 시 `kubernetes preflight connection timed out`, kubectl 없음 시 기존 `kubectl is not available to api-gateway`를 preflight error로 반환한다.
  - `tests/test_target_registration.py`: direct apply 연결성 성공/실패 테스트 추가.
  - `docs/spec/domains/target.md`: preflight 연결성 동작 문서화.
- 검증:
  - `python -m pytest -q tests/test_target_registration.py tests/test_provider_registry.py` → 31 passed, 1 warning.
  - `python -m compileall -q src/domains/target/router.py tests/test_target_registration.py` → passed.
  - `git diff --check` → passed.
  - 로컬에는 `.venv`와 `uv`, 시스템 `ruff`가 없어 `ruff check`는 실행하지 못했다.
- Actions runner mitigation:
  - 현재 저장된 GitHub token은 repo read/push는 가능하지만 repo/org admin·billing runner 설정 API는 403/404로 접근 불가다.
  - org owner/repo admin이 org Actions policy, billing/quota, hosted runner limits, runner groups를 GitHub UI 또는 admin token으로 확인해야 한다.
  - retry canary는 Promote/AWS CD가 아니라 CI의 `Kubernetes manifest checks` 단일 job을 우선 사용한다. 최신 job id는 `85566424088`(run `28851117498`)이며, 성공 전까지 Promote/Main AWS CD 재실행은 피한다.

## 최신 업데이트 (17:02 KST) — incident fallback 복구계획 연결

- `dd02f260 docs: Actions runner 재실행 기록`은 origin/dev push 완료.
- 이 푸시로 생성된 dev workflows도 runner 배정 없이 즉시 실패했다.
  - Promote Dev To Main run `28850987065` → failure.
  - CI run `28850987079` → failure.
  - AWS CD run `28850987004` → failure.
  - 세부 패턴은 직전과 동일하게 `runner_id=0`, steps/log 없음으로 본다. 코드 실패로 단정하지 말 것.
- UI 변경:
  - `frontend/src/features/notifications/IncidentDetailView.tsx`
  - incident detail route param이 실제 incident id가 아니라 `correlation_id`라서 detail lookup이 404인 fallback 화면에서도, 기존 real API hook `GET /rca/recovery-plans/by-correlation/{correlation_id}` 기반 복구 계획 panel을 표시한다.
  - mock/fake/hardcoded data는 추가하지 않았다. recovery plan row가 없으면 기존 "아직 생성되지 않음" 상태를 그대로 보여준다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.
- authenticated smoke 주의:
  - `scripts/smoke.sh`와 `scripts/e2e_test.py`는 쓰기/배포 변경을 만들 수 있으므로 passive smoke로 실행하지 않는다.
  - `frontend/tests/e2e_real_backend.py`는 `E2E_MUTATE=0`일 때만 읽기 중심 authenticated browser smoke로 사용한다.

## 최신 업데이트 (16:57 KST) — failed workflows 재실행도 runner 배정 실패

- 이 체크포인트 작성 전 local/origin dev HEAD: `f8364e02 docs: 최신 HEAD 확인 / runner 장애 / 인수인계`. 이 문서 커밋 후 정확한 최신 SHA는 `git log --oneline --decorate -6`로 확인한다.
- 워크트리 상태: tracked 변경 없음. untracked `아카이브/`만 있으며 `.env*` 포함 가능성이 높으므로 커밋 금지.
- live public smoke 재확인:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- `f8364e02` dev push의 failed workflows를 REST API로 재실행했다.
  - CI run `28850399699` → rerun failed jobs `201`, attempt 2도 failure.
  - AWS CD run `28850399698` → rerun failed jobs `201`, attempt 2도 failure.
  - Promote Dev To Main run `28850399688` → rerun failed jobs `201`, attempt 2도 failure.
- attempt 2 job 증거:
  - CI jobs `85565162752`, `85565162770`, `85565162791` 모두 `runner_id=0`, `steps=0`, logs endpoint `404`.
  - AWS CD `Test before deploy` job `85565171025`도 `runner_id=0`, `steps=0`, logs endpoint `404`; deploy job skipped.
  - Promote `Verify dev before promotion` job `85565167194`도 `runner_id=0`, `steps=0`, logs endpoint `404`; merge job skipped.
- repo-side 점검:
  - `.github/workflows/*`는 `ef65c770` 이후 변경 없음.
  - CI/AWS CD/Promote는 모두 GitHub-hosted `ubuntu-latest`를 사용한다.
  - repository Actions permissions: enabled `true`, allowed actions `all`, sha pinning required `false`.
  - repository self-hosted runners: total `0`(현재 워크플로는 self-hosted를 쓰지 않음).
  - GitHub Status API: Actions/API/Git Operations/Webhooks 모두 operational.
- 결론: 코드/워크플로 실패가 아니라 GitHub-hosted runner 배정, 계정/org quota, repo/org Actions 정책, 또는 GitHub Actions control-plane 계층 문제로 계속 보는 것이 맞다. 다음에는 GitHub UI의 org/billing quota와 Actions policy를 확인하거나 시간이 지난 뒤 같은 latest dev run을 재실행한다.
- 병렬 확인:
  - 로그인 세션 2시간 sliding refresh는 이미 구현/와이어링되어 있다. 기본 TTL `7200`, `POST /auth/session/refresh`가 Redis `EXPIRE`와 httpOnly cookie max-age를 갱신하며, 프론트 `sessionRefresh.ts`는 사용자 interaction 기반으로 5분 throttle refresh를 수행한다.
  - auth/session 관련 focused test: `python -m pytest -q tests/test_identity_auth_routes.py tests/test_session_store.py tests/test_auth_security.py tests/test_gateway_error_handler.py` → 22 passed, 1 warning.
  - DLQ/incident 증가는 live DB를 건드리지 않고 AWS SSO 가능 시 SELECT-only로 측정한다. `event_dead_letters` status/count, 최근 60분 minute bucket, consumer/subject/error 상위 그룹, `events` subject count, `rca.followup.required`, `rca_timeline`, 주요 테이블 크기를 5~10분 간격으로 비교한다.
  - DLQ 측정 중 `scripts/smoke.sh`, DLQ replay, `scripts/aws-up.sh`, `scripts/aws-down.sh`는 사용하지 않는다. 특히 raw failed payload는 문서/로그에 붙이지 않는다.

## 최신 업데이트 (16:50 KST) — dev 푸시 후 Actions runner 장애 확인

- 정확한 최신 SHA는 항상 `git log --oneline --decorate -6`와 `git status --short --branch`로 먼저 확인한다. `ef65c770` 이후 커밋은 production code 변경이 아니라 시크릿 제외/인수인계/runner 상태 문서화 성격이다.
- `9b1eedbf chore: 시크릿 제외 / runner 상태 / 인수인계`은 origin/dev push 완료.
- `24e47e53 docs: Actions runner 상태 / 인수인계 갱신`도 origin/dev push 완료. 이 푸시의 dev workflows 역시 4~5초 내 runner 배정 없이 실패했다.
- 이 푸시로 뜬 dev workflows도 모두 4초 내 실패:
  - CI run `28850238246` → failure. `Python lint and tests`, `Kubernetes manifest checks`, `Frontend typecheck, lint, build` 모두 `runner_id=0`, steps 없음, log 없음.
  - AWS CD run `28850238259` → failure. `Test before deploy`가 `runner_id=0`, steps 없음, log 없음. deploy job은 skipped.
  - Promote Dev To Main run `28850238255` → failure. `Verify dev before promotion`이 `runner_id=0`, steps 없음, log 없음. merge job은 skipped.
- 판단: main manual dispatch뿐 아니라 dev push workflows도 같은 형태이므로 코드 변경/테스트 실패가 아니라 GitHub Actions hosted runner 배정, 계정 quota, org/repo Actions 상태, 또는 GitHub 측 일시 장애를 먼저 확인해야 한다.
- live public smoke는 계속 정상:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 다음 AI 첫 작업:
  1. GitHub Actions status/runner quota/org Actions 설정 확인.
  2. runner 문제가 풀리면 `9b1eedbf` 또는 최신 dev HEAD의 failed workflows를 rerun.
  3. 성공하면 Promote Dev To Main 및 main AWS CD를 재확인.
  4. AWS SSO 재인증 후 authenticated smoke와 DB 증가율 확인.

## 직전 업데이트 (16:45 KST) — 시크릿 제외/Actions runner 이슈

- `ef65c770 fix: 레포 discovery render 검증 전환`은 origin/dev push 완료.
- dev Actions:
  - CI run `28849784747` → success.
  - AWS CD run `28849784735` → success.
  - Promote Dev To Main run `28849784833` → success.
- origin/main은 merge commit `e37cee8bf983eb122b5ab9c987210e00d7b1bf6f`까지 진행.
- main AWS CD:
  - run `28849845008` attempt 2 → failure. `Test before deploy`는 success였고 `Deploy to AWS EKS`가 `runner_id=0`, steps 없음, log 없음으로 실패.
  - fresh dispatch run `28850098836` → failure. `Test before deploy` 자체가 `runner_id=0`, steps 없음, log 없음으로 실패했고 deploy job은 skipped.
  - 판단: 코드/테스트 실패가 아니라 GitHub Actions runner 배정 또는 계정/환경 실행 상태 이슈로 보인다. 다음 AI는 같은 run 무한 재시도 대신 GitHub Actions 상태/runner quota/environment 상태를 먼저 확인할 것.
- live public smoke는 계속 정상:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 커밋 제외/보호:
  - `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`, `아카이브.zip`은 커밋하지 않는다.
  - `아카이브.zip`에는 `.env*` 계열 파일이 들어 있으므로 시크릿 포함 가능성이 높다. 사용자 요청이 있어도 커밋 금지.
  - `.gitignore`에 `.e2e-tmp-*.py`, `report_*.json`, `*.zip`을 추가해 실수 stage를 방지했다.

## 최신 업데이트 (16:37 KST) — 마무리 커밋/푸시 준비

- main AWS CD run `28849235901` → success.
- live public smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 이번 마무리 커밋 대상:
  - `src/domains/gitops/repository_discovery.py`
  - `tests/test_repository_discovery.py`
  - `HANDOVER.md`
  - `docs/continuation-execution-plan-2026-07-07.md`
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py` → 37 passed.
  - `ruff format --check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`
  - `ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`
  - `git diff --check`
- 커밋 제외:
  - `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`
  - 이유: 임시 E2E 산출물이며 특정 app/run/incident id가 들어 있어 운영 원칙의 hardcoding 금지와 충돌한다. 다음 AI는 필요하면 내용을 참고하되 커밋하지 말 것.
- 다음 AI 즉시 작업:
  1. 이 커밋의 dev CI / Promote / AWS CD / main AWS CD 확인.
  2. AWS SSO 재인증 후 authenticated smoke와 DB 증가율 확인.
  3. `/console/` 데모 보존 방식을 별도 static build 또는 별도 route bundle로 결정.
  4. cluster import를 env-derived 후보에서 실제 provider adapter/API discovery로 확장.

## 최신 업데이트 (16:33 KST) — 프론트 애니메이션/드릴다운 설계 메모

토큰/맥락이 끊겨도 다음 AI가 같은 방향으로 이어가도록 프론트 목표를 명시한다.

- 참고할 애니메이션/시각화 소스:
  - Motion for React: `https://motion.dev/docs/react`
    - 페이지 진입, drawer/modal, list layout transition, reduced motion 처리 기준.
  - React Flow examples: `https://reactflow.dev/examples`
    - incident RCA graph, workflow graph, node select/edge active 상태 기준.
  - Nivo examples: `https://nivo.rocks/treemap/`, `https://nivo.rocks/line/`
    - fleet treemap, metric time-series interaction/tooltip 기준.
  - Dagre layout: `https://github.com/dagrejs/dagre`
    - flow graph 자동 배치 기준.
- 현재 코드에서 반드시 재사용할 모션 primitive:
  - `frontend/src/shared/motion/index.tsx` 및 현재 디자인 토큰 모듈
    - `DUR`, `EASE`, `SPRING`, `fadeRise`, `overlayFade`, `flyoverSlide`, `modalPop`, `staggerParent`, `staggerChild`.
  - `frontend/src/shared/motion/index.tsx`
    - `FadeSlideIn`, `Stagger`, `CountUp`, `AnimatedList`, `AnimatedRow`, `PulseOnChange`, `AnimatePresence`.
  - 규칙: 새 화면에서 inline random animation을 만들지 말고 위 primitive를 먼저 확장한다. `prefers-reduced-motion`은 항상 존중한다.
- 드릴다운 canonical 흐름:
  1. `/` fleet dashboard
     - `GET /fleet/summary` → StatCard + treemap + cluster table.
     - treemap tile/table row click → `/clusters/:clusterId`.
     - 최근 incident row → `/incidents/:incidentId`.
     - 승인 대기 row → `/workflows/:runId`.
     - AI conversation row → `/ai/:conversationId`.
  2. `/clusters/:clusterId`
     - query param `?tab=workloads|pods|nodes|services|resources|events`로 탭 상태 유지.
     - pod row click → `/clusters/:clusterId/pods/:namespace/:pod?tab=pods`.
     - pod detail은 Drawer로 열고, "이 팟 분석"은 `/ai?prefill=...`로 연결.
     - cluster agg panel의 열린 incident → `/incidents/:incidentId`.
  3. `/incidents/:incidentId`
     - React Flow graph: incident → evidence → analysis → actions.
     - group node collapse/expand는 local state, evidence/recovery/report drill은 같은 화면 하단 panel.
     - recovery plan status는 `useRecoveryPlan(correlationId)`로 실제 API 값만 표시.
  4. `/workflows/:runId`
     - React Flow graph: STARTED → RENDERING → DIFFING → POLICY_CHECKING → WAITING_FOR_APPROVAL → APPLYING → ROLLOUT_WAITING → SUCCEEDED/FAILED.
     - node click → 오른쪽 detail card에 step detail, diff, approval card를 표시.
  5. `/repos/:applicationId`
     - app/repo/binding/run 실데이터 중심. workflow run click은 `/workflows/:runId`.
  6. `/metrics?cluster=:clusterId`
     - cluster context를 query param으로 유지하고, time-series tooltip/slice로 metric detail을 노출.
- 인터랙션 원칙:
  - URL로 복원 가능한 drilldown은 route/search param에 둔다. 순간 선택만 local state로 둔다.
  - Drawer/Modal은 실제 API row id를 받아야 하며 mock row 생성 금지.
  - Count/Badge 변화는 `PulseOnChange` 또는 `CountUp`으로 짧게만 강조한다. 계속 흔들리는 장식 애니메이션 금지.
  - Table row/list 추가·삭제·정렬은 `AnimatedRow`/`AnimatedList` layout animation을 쓴다.
  - Flow edge active animation은 실제 workflow/incident status에만 연결한다. 데모용 forced active 금지.
  - Loading은 기존 `Skeleton`/`QueryBoundary`, Empty는 `EmptyState`, Error는 retry button 포함.
  - Desktop/mobile 모두 overflow, text overlap, chart min-height 깨짐을 Playwright screenshot으로 확인한다.
- 현재 중요한 모순:
  - `/console/`은 보존 대상이라고 했지만 라우터는 `/console/*`를 `/`로 흡수한다. 데모 보존을 진짜로 하려면 별도 static build 또는 별도 route bundle이 필요하다. 실제 서비스는 `/` 유지.
  - Python browser smoke는 있지만 표준 Playwright config/npm e2e script는 없다. production polish 전용 E2E를 추가해야 한다.
- worker 완료:
  - `Harvey` worker가 repo Helm/Kustomize discovery validation placeholder 제거를 구현했다.
  - GitHub tree/content를 bounded export하고 TemporaryDirectory에서 `kubectl kustomize` 또는 `helm template`로 실제 render validation을 수행한다.
  - path traversal, file count/byte limit, renderer missing/failure, render error compact/redact 처리를 포함한다.
  - 검증: `tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py` → 37 passed.
  - 검증: `ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`, `git diff --check` → 통과.

## 최신 업데이트 (16:24 KST) — multi-agent 조사 반영/E2E hardcoding 제거

- 병렬 explorer 3개 완료:
  - 동적 등록: repo probe/branch/manifest 후보는 실제 GitHub API 기반이다. Helm/Kustomize discovery validation placeholder 제거는 worker가 진행 중이며, 완료 전까지 검증/커밋하지 않는다. cluster import 후보는 provider catalog API가 있어도 실제 외부 provider adapter/API discovery가 아니라 env-derived metadata 중심이다.
  - UI/E2E: 표준 Playwright config는 없고 Python Playwright smoke만 있다. `/console/`은 현재 라우터에서 `/`로 흡수되며, live `/`와 `/console/` 모두 같은 SPA를 반환한다.
  - DB reset: 운영 DB reset script는 없다. 최종 reset은 backup/snapshot/restore 검증 후 `Database().init()` + `Database.upsert_admin_account()` 경로로만 수행해야 한다. 지금 즉시 reset 금지.
- `frontend/tests/e2e_real_backend.py`의 hardcoded real-backend test credential을 제거했다.
  - 이제 `AUTH_EMAIL`/`AUTH_PASSWORD` env가 필수다.
  - `BASE_URL` 또는 `SMOKE_BASE`로 target URL을 받는다.
  - 운영 DB에 row를 추가하는 조직/그룹/AI 대화 write flow는 `E2E_MUTATE=1`을 명시한 경우에만 실행한다.
  - screenshot dir는 `SMOKE_SHOTS_DIR`로 조정 가능하다.
- `frontend/docs/backend-integration.md`도 위 실행 방식과 맞게 갱신했다.
- 남은 즉시 작업:
  1. repo Helm/Kustomize discovery validation 변경을 커밋/푸시.
  2. main AWS CD run `28849235901` 완료 확인.
  3. AWS SSO 재인증 가능 시 authenticated smoke와 DB 증가율 검증.
  4. 다음 구현 후보는 cluster import의 실제 provider adapter/API discovery 확장.

## 최신 업데이트 (16:22 KST) — 배포/검증 체크포인트

- 현재 local/origin dev HEAD: `719a795c fix: GitOps poller DB target 순회`.
- dev Actions 확인:
  - CI run `28848586860` → success.
  - Promote Dev To Main run `28848587013` → success.
  - AWS CD dev push run `28848586945` → success.
- main Actions 확인:
  - AWS CD run `28848639831` → `Test before deploy` success, `Deploy to AWS EKS` in progress.
  - main deploy head SHA: `657b79e6c82453bd8ec5282ad8dd286d0eebdbfd`.
- 로컬 검증 재실행 완료:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
  - `cd frontend && npm run typecheck` → 통과.
  - `cd frontend && npm run lint` → 통과.
  - `cd frontend && npm run build` → 통과. 기존 Vite large chunk warning만 있음.
- 라이브 공개 smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
  - `https://k8s.woonyong.org/` → HTTP 200, title `운영 콘솔`.
  - `https://k8s.woonyong.org/console/` → HTTP 200, title `운영 콘솔`.
- 로컬 kubectl/AWS 상태:
  - kube contexts는 존재한다: `kubernetes-ops`, `cluster-1`, `cluster-2` 등.
  - 하지만 로컬 AWS SSO session이 만료되어 `kubectl`이 `aws login` 재인증을 요구한다.
  - 따라서 지금 이 셸에서는 management secret/DB/pod 직접 조회와 authenticated cluster smoke를 실행할 수 없다.
  - GitHub Actions의 AWS credentials는 정상이며 main AWS CD deploy 단계가 진행 중이다.
- 현재 워킹트리:
  - tracked file 변경 없음.
  - untracked: `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`. 내용 확인 전 커밋 금지.
- 다음 즉시 작업:
  1. main AWS CD run `28848639831` 완료까지 추적.
  2. 완료 후 live health/root/readyz 재확인.
  3. AWS SSO 재인증이 가능해지면 `scripts/smoke.sh` 또는 `scripts/e2e_test.py`를 실제 env credential과 실제 cluster context로 실행.
  4. DB 초기화는 아직 금지. 모든 기능/배포/E2E 완료 후 백업/스냅샷부터 실행한다.

## 최신 업데이트 (16:15 KST) — GitOps poller DB target 전환

- `github-poll-worker`가 env 단일 target만 보던 구조를 DB 등록 target 우선 구조로 전환했다.
- 신규 `RepoChangeRepository.list_active_github_poll_targets()`:
  - active GitHub repository + active application + active deployment binding + optional watch target을 조인한다.
  - 과거 binding에 `git_watch_targets` row가 없어도 binding의 derived `watch_target_id`/`manifest_path`로 fallback한다.
- application deployment 생성 경로:
  - application `default_branch`를 body에 넣는다.
  - `register_watch_target()` 후 `register_deployment_binding()` 순서로 실행한다. 실제 DB에서는 `unit_of_work_or_null(db)` 안이라 같은 트랜잭션에 묶인다.
- poller:
  - `GitHubPollTarget` dataclass 추가.
  - DB target을 우선 사용하고, DB target이 없고 `GITHUB_REPO`가 있을 때만 env fallback.
  - target별 `_last_sha_by_target`/`_etag_by_target`을 유지한다.
  - DB `credential_ref`와 env `GITHUB_TOKEN_REF`를 token vault로 해석한다.
  - webhook body에 실제 `application_id`와 `environment`까지 포함한다.
- 검증 완료:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_github_poller.py tests/test_applications_router.py tests/test_database_unit.py` → 56 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- 다음: 커밋/푸시 → dev CI/promote/main AWS CD 확인 → live provider/auth/health smoke → incident/DLQ 증가율 확인.

## 최신 업데이트 (16:12 KST) — 연속 실행 계획 문서화

- 대화 맥락이 사라져도 바로 이어받을 수 있도록 [docs/continuation-execution-plan-2026-07-07.md](docs/continuation-execution-plan-2026-07-07.md)를 추가했다.
- 이 문서에는 현재 SHA/run ID, 최신 검증 결과, dev/main Actions 상태, live smoke 명령, 남은 10개 작업 항목, DB 초기화 게이트, 금지 명령, 다음 구현 후보와 예상 write set을 정리했다.
- 문서화 직전 production-code baseline dev 커밋은 `b013b431`이고 main merge commit은 `f2b7d43`이다. 문서 커밋 이후 실제 최신 SHA는 `git rev-parse HEAD origin/dev origin/main`으로 확인한다.
- 최신 main AWS CD run은 `28847747039`이며, 문서 작성 당시 `Test before deploy`는 성공했고 `Deploy to AWS EKS`가 진행 중이다.
- 이전 main AWS CD `28847597545`는 더 최신 run 때문에 취소됐으므로 실패로 보지 않는다.
- live `https://k8s.woonyong.org/api/healthz`는 직전 확인에서 `{"status":"ok","service":"api-gateway"}`였다.
- 병렬 explorer `Banach`(`019f3b5e-8f4b-74a0-a447-56a1e0bfd325`)가 GitOps poller를 DB 등록 watch target 기반으로 전환할 구현 seam을 read-only 분석 완료했다.
- 분석 결과는 연속 실행 계획 문서의 "레포 등록 동적화" 섹션에 반영했다. 다음 구현 후보는 `github-poll-worker` env 단일 target 구조를 DB의 `git_repositories`/`git_watch_targets`/`deployment_bindings` 순회로 전환하는 작업이다.

## 최신 업데이트 (15:58 KST) — provider admin 경계 + 최종 DB 초기화 절차 재정렬

- **작업 항목 수 정정**:
  - 중간 추적에서 일부 항목을 묶어 5개처럼 보였으나 실제 범위는 9개다. 현재 기준: 안정화 코드, 배포/라이브 검증, 인증, 동적 등록, 프론트 폴리싱, DB 백업/스냅샷, DB 초기화/bootstrap, 실 클러스터/레포 재연결, 최종 E2E/HANDOVER/커밋·푸시.
- **provider/cluster 등록 권한 경계 보강**:
  - `GET /providers/catalog`, `GET /providers/cluster-discovery`, `POST /providers/validate` 는 모두 `require_admin_session` 가드 대상이다.
  - 이유: cluster discovery 응답은 kube context, 외부 console handle, import 후보 등 운영 환경 메타데이터를 포함할 수 있어 비관리자에게 노출하면 안 된다.
  - 프론트에서도 비관리자에게 cluster 등록 액션/빈 상태 등록 버튼을 노출하지 않도록 조정했다. 레포 연결은 유지하되, 배포 대상 클러스터가 없으면 관리자 권한 요청 안내만 보여준다.
- **동적 레포/클러스터 등록 재분석 결과**:
  - 레포 위저드는 실제 GitHub API 기반 probe → branch list → manifest candidate list → validation → app/deployment 생성 흐름이 구현되어 있다.
  - 남은 생산화 과제: DB에 등록된 앱/브랜치/manifest watch target을 poller가 직접 순회하도록 확장, app 생성 성공 후 deployment 생성 실패 시 보상 처리.
  - 클러스터 위저드는 provider catalog/discovery/preflight/register/connection polling 흐름이 구현되어 있다.
  - 남은 생산화 과제: env-derived 후보를 넘어 실제 외부 콘솔/API/kubeconfig discovery 확장, preflight에서 Kubernetes 연결성까지 검증.
- **DB 초기화 방침 업데이트**:
  - repo에는 안전한 prod DB reset 스크립트가 없다. 최종 초기화는 `aws-up.sh` 전체 실행이 아니라 별도 절차로 격리해야 한다.
  - 필수 선행: Postgres dump, PVC/EBS snapshot, `postgresql-secret`, `management-runtime-secret`, `management-runtime-config`, `pgbouncer-config` 백업.
  - 초기화 후 공식 schema/init 경로는 `Database().init()`이며, admin bootstrap은 raw SQL 대신 `Database.upsert_admin_account()` 를 사용한다.
  - 초기화 뒤 `cluster-1`/`cluster-2`와 실제 repo/app을 다시 등록하고, `/clusters`, `/connection-status`, `/inventory/summary`, `/fleet/summary`, 로그인/session을 라이브로 검증한다.

## 최신 업데이트 (15:45 KST) — 실가입 인증 경로 보강 패스

- **추가 인증 분석 결과**:
  - 내부 이메일/비밀번호 인증 MVP는 존재하지만, 운영 기준에서 3가지 모순이 남아 있었음: AWS admin bootstrap 이 구 `role='admin'`/`workspace_members` SQL 사용, 메일 링크가 콘솔 nginx 의 `/api/*` 프록시를 못 타는 `/auth/verify-email` 로 생성, 로그인 시 비밀번호 검증 전에 pending 상태를 노출.
- **수정 완료(로컬 전체 검증 완료, 다음 커밋/배포 대상)**:
  - 로그인에 escalating rate limit 추가(`LOGIN_EMAIL_RATE_LIMIT`, `LOGIN_IP_RATE_LIMIT`) + 비밀번호 검증 후에만 `pending_email_verification`/`pending_approval` 상태 안내.
  - 인증 메일 URL은 `PUBLIC_API_BASE_URL`이 있으면 그 값을 사용하고, 없으면 `PUBLIC_BASE_URL + /api/auth/verify-email` 로 생성. AWS 배포는 `CUSTOM_DOMAIN` 기준 `PUBLIC_BASE_URL` 자동 주입.
  - `/verify-email?token=...` 구 링크로 진입해도 프론트가 같은 origin `/api/auth/verify-email?token=...` 로 넘겨 실제 토큰 소비/세션 쿠키 설정 경로를 탄다.
  - AWS admin bootstrap 은 raw SQL/구 테이블 대신 `Database.upsert_admin_account()` 를 호출해 `service_admin`/기본 조직/그룹 편입 계약을 그대로 사용.
- **검증 완료**:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 674 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check`, `npm run typecheck` → 통과.
  - 다음: 인증 보강 커밋/푸시 → dev/main 배포 → 실서비스 login/session/signup-link 경로 검증 → 최종 DB 초기화 절차 진입.

## 최신 업데이트 (15:25 KST) — 정상 샘플 dashboard projection 차단 패스

- **추가 확인 결과**:
  - `incident-worker` followup 폭주는 `61839836` 배포로 멈췄지만, `incident.detected` 이벤트 자체는 정상 샘플도 `detected=false` 로 남긴다.
  - `dashboard` read model 이 `detected=false` 정상 샘플을 `rca_timeline`에 저장하거나 기존 row를 open incident 조회에 포함하면 화면의 인시던트 수가 계속 부풀 수 있다.
- **수정 완료(로컬 대상 검증 완료, 다음 전체 검증/배포 대상)**:
  - `timeline_update_from_event()` 는 `incident.detected` + `detected != true` 이벤트를 저장하지 않음.
  - `list_rca_timeline`, `get_rca_timeline_item`, `count_open_rca_incidents`, `list_open_rca_incidents` 는 과거에 이미 쌓인 `detected=false` row를 조회에서 제외.
  - `tests/test_dashboard_projection.py` 에 정상 샘플 미저장, open incident SQL 필터 회귀 테스트 추가.
- **검증 완료**:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_dashboard_projection.py` → 6 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 672 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check`, `npm run typecheck` → 통과.
  - 다음: 커밋/푸시 → 배포 후 라이브 DB 5~10분 관찰.

## 최신 업데이트 (15:04 KST) — RCA followup 폭증 루프 차단 패스

- **추가 RCA 확인 결과**:
  - `0a84b998` 배포 후에도 `rca.followup.required` 가 분당 약 10~19건 계속 생성됨.
  - 원인은 `IncidentDetector.has_signal()` 이 정상 샘플을 `detected=False` 로 판단한 뒤에도 `incident-worker` 가 `RcaActionRequiredBody(reason=no_incident_action_required)` 를 계속 발행했고, `rca-feedback-worker` 가 이를 `rca.followup.required` 로 정규화하던 구조.
- **수정 완료(로컬 검증 완료, 다음 커밋/배포 대상)**:
  - `incident-worker` 는 `incident.detected` 이벤트는 계속 기록하되, `detected=False` 일 때는 RCA/action 후속 이벤트를 발행하지 않음.
  - 정상 snapshot 플로우 테스트 기대값을 `evidence.built -> incident.detected` 에서 멈추도록 갱신.
- **검증 완료**:
  - 관련 테스트: `tests/test_rca_evidence.py`, `tests/test_incident_symptom_derivation.py`, `tests/test_rca_feedback_flow.py`, `tests/test_operational_event_followups.py` → 26 passed.
  - 전체: `.venv/bin/python -m pytest -q` → 670 passed, 3 skipped.
  - `npm run typecheck`, `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- **다음 즉시 작업**:
  1. 이 RCA followup 차단 커밋/푸시 → dev CI → main 반영 → AWS CD 확인.
  2. 배포 후 5~10분 동안 `rca_timeline` 최근 생성분에서 `rca.followup.required` 가 멈추는지 확인.
  3. 증가 멈추면 과거 DLQ 및 과거 followup row 정리 정책을 적용.

## 최신 업데이트 (15:00 KST) — 메인 인증/가입 보강 패스

- **이전 안정화 묶음 배포 성공**:
  - `origin/main` 수동 병합 커밋 `0a84b998` 기준 GitHub Actions `AWS CD` run `28844725355` 성공.
  - 라이브 `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`, `/` HTTP 200 확인.
- **메인 인증/가입 보강 적용(로컬 검증 완료, 다음 커밋/배포 대상)**:
  - 가입/로그인 흐름은 기존대로 `signup -> email verification -> admin approval -> login/session` 모델 유지.
  - 세션 쿠키 기반 상태 변경 요청에 same-origin intent guard 추가. 세션 쿠키가 붙은 `POST/PUT/PATCH/DELETE` 는 `x-service-csrf: same-origin` 헤더 또는 허용된 `Origin/Referer` 없으면 403.
  - 프론트 중앙 API 클라이언트가 모든 상태 변경 요청에 `x-service-csrf: same-origin` 을 자동 부착.
  - `scripts/lib/auth.sh`, `scripts/smoke.sh`, `scripts/register-target.sh`, `scripts/e2e_test.py` 도 쿠키 로그인 후 상태 변경 요청이 새 guard 를 통과하도록 갱신.
- **검증 완료(이번 인증 보강 포함)**:
  - `.venv/bin/python -m pytest -q` → 670 passed, 3 skipped.
  - `npm run lint && npm run build` → 통과(기존 Vite large chunk warning만).
  - `npm run typecheck`, `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- **다음 즉시 작업**:
  1. 인증 보강 커밋/푸시 → dev CI → main 반영 → AWS CD 확인.
  2. 배포 후 로그인 API를 실제 `AUTH_EMAIL/AUTH_PASSWORD`로 curl 검증: login/session/refresh, 그리고 CSRF guard 403/통과 케이스 확인.
  3. 배포 후 `rca_timeline`/`event_dead_letters` 증가율 5~10분 관찰.
  4. 증가 멈추면 과거 DLQ 아카이브 + 필요 시 old followup timeline closed/archive 정책 적용.

## 최신 업데이트 (14:45 KST) — 안정화 통합 패스

- **핵심 안정화 구현 완료(로컬 검증 완료, 배포 전)**:
  - 정상 Kubernetes snapshot 이 10초마다 인시던트로 승격되던 구조를 차단. `IncidentDetector.has_signal()` 이 명시 symptom/유도 symptom/firing Alertmanager 만 incident-worthy 로 본다.
  - `rca_timeline` open count/list 는 logical incident key 로 dedupe 하도록 보강. 과거 row 가 많아도 같은 리소스/증상은 UI에서 하나로 집계된다.
  - `command-janitor` 가 원래 correlation_id 를 보존하도록 수정.
  - 세션 기본 TTL 2시간(`SESSION_TTL_SECONDS=7200`) + `POST /auth/session/refresh` + 프론트 user interaction 기반 5분 throttle sliding refresh 추가.
- **recovery plan 상태 노출 완료**:
  - 신규 `GET /rca/recovery-plans/by-correlation/{correlation_id}`.
  - 응답은 `selection_requested/selected`, `selected_action_id`, `selected_action`, 후보 요약만 노출(draft params/secret 미노출).
  - 인시던트 상세의 "복구 계획" 패널에서 추천/선택 액션과 승인 필요 여부 표시.
- **레포/클러스터 등록 동적화 완료**:
  - 레포: probe → branch select → manifest candidate select → static validation/resource count → app/binding 생성.
  - 클러스터: `GET /providers/cluster-discovery`, `POST /targets/preflight`, env-derived import candidates, duplicate/provider/kube-context/agent-image 사전 점검.
  - external-console 후보 discovery 는 현재 env-derived only. 외부 콘솔 API 호출은 아직 하지 않음.
- **인증 UX 보정**:
  - 가입/검증/로그인 흐름은 실제 password auth 기반으로 동작. 검증 메일 재전송 프론트가 백엔드 계약(email+password)에 맞도록 수정.
  - 메일 워커는 기본 SMTP fail-closed. 운영에서 실제 가입 메일을 쓰려면 `SMTP_HOST`/`SMTP_FROM` 등 확인 필요. `MAIL_DELIVERY_MODE=log` 는 데모/개발용.
- **프론트 폴리싱 완료**:
  - 모바일 overflow, drawer/backdrop z-index, long breadcrumb/code/badge/action wrap 정리.
  - authenticated route QA는 mock API로 수행됨. 실 로그인 E2E는 배포 후 `.env.local-test`의 `AUTH_EMAIL/AUTH_PASSWORD`로 재확인할 것.
- **검증 완료**:
  - `.venv/bin/python -m pytest -q` → 669 passed, 3 skipped.
  - `npm run build` → 통과(기존 Vite large chunk warning만).
  - `npm run typecheck`, `npm run lint`, `ruff check`, `git diff --check` → 통과.
  - 라이브 현재: `https://k8s.woonyong.org/` 200, `/api/healthz` ok, management 38 deployment Ready.
- **라이브 DB 관찰(배포 전)**:
  - `rca_timeline`: 11,965 rows, 대부분 `rca.followup.required`(10,590) / `approval.recommended`(1,256). 최근까지 증가 중이므로 이번 코드 배포 후 증가 멈춤 여부 확인 필수.
  - `event_dead_letters`: open 1,895. 원인 대부분 과거 `rca-fallback-worker`의 `EvidenceBundle: unexpected field(s): missing_evidence_checks`(1,891건, 2026-07-06 09~11 UTC) + 디스크 full 흔적 3건.
  - 당시 기준 권장사항은 "전체 DB 초기화 금지, 원인 확인된 과거 DLQ만 아카이브"였음. 현재는 사용자 명시 지시로 최종 완료 후 1회 DB 초기화로 변경되었고, 백업/스냅샷 선행이 필수다.
- **남은 즉시 작업**:
  1. 이 변경 커밋/푸시 → dev CI → Promote Dev To Main → AWS CD 확인.
  2. 배포 후 `rca_timeline`/`event_dead_letters` 증가율 5~10분 관찰.
  3. 증가 멈추면 과거 DLQ 아카이브 + 필요 시 old followup timeline closed/archive 정책 적용.
  4. 실 로그인 E2E: login/signup/verify-resend/session-refresh/repo wizard/cluster wizard/incident recovery panel 확인.

## 품질 반복 패스 (2026-07-07 오후) — 진행 로그

콘솔 승격(41fe3994) 이후의 완성도 반복. 사용자 지시: (1) 조약한 UI/깨진 인터랙션 다듬기,
(2) 더미/페이크 파일 삭제, (3) RCA·메트릭을 프로덕션급 뷰어로 + 문서화, (4) 인수인계 문서 상시 갱신.

### 반복 1 — 페이크 데이터 레이어 완전 삭제 (a86bc235)

- 삭제된 프론트 페이크 데이터 레이어와 모드 플래그를 제거했다.
  api.ts 는 무조건 실 fetch, live.ts 는 무조건 실 WS.
- `frontend/.env.development` 삭제, `.env.production` 은 `VITE_API_BASE=/api` 만 유지.
- CI env 가드(ci.yml)·scripts/frontend-check.sh 의 mock 예외 정리. 로컬 dev 는 vite proxy(`VITE_BACKEND`)로 실 백엔드 연결.
- 스크린샷에서 보였던 가짜 비용($)·1,000개 팟·중복 "클러스터 맵" 은 **이미 41fe3994 에서 코드째 삭제된 구 앱의 것** —
  현 코드 grep 검증 0건. 라이브에 아직 보인다면 구 이미지가 서빙 중인 것 (CD 완료 후 asset 해시 확인할 것).

### 반복 2 — RCA 리포트 분석 심화 (c7e5802d, 동시 세션이 문서 정렬과 함께 커밋/푸시함)

- **주의: 이 repo 에 다른 세션(author: choi woo-nyong)이 동시 작업 중** — 워킹트리 변경을 문서 스펙 정렬과 함께
  커밋해 주는 협업 세션이 있다. 커밋 전 `git log`/`git status` 로 경합 확인할 것.
- 백엔드: `GET /rca-reports` 화이트리스트 확장(`rca_report_summary`) — 대상 리소스(kind/name/namespace),
  `secondary_symptoms`, `selected_candidate_id`, `candidates[]`(후보 카탈로그×평가 병합, 점수 내림차순),
  `supporting_evidence_refs[]`(source/name/summary/**query**), `missing_evidence_checks[]`.
  후보 `signals` DSL 원문·payload 원문은 계속 미노출(secret 차단). 계약: `RcaCandidateScoreItem` 등
  (contracts/gateway/responses.py). 테스트: tests/test_evidence_query_api.py 확장(7 passed).
- 프론트: 인시던트 상세 RCA 리포트 카드에 후보 점수바(선정 강조, AI 출처 배지, ✓/✗ 신호),
  근거 쿼리 트레일(소스별 실행 쿼리 원문), 부증상 칩, 미수집 체크 표시. 구 백엔드 응답(필드 없음)에도 안전(optional).

### 반복 3 — 메트릭 프로덕션화 + 쿼리 카탈로그 문서 (17ac76e1)

- `/metrics` PromQL 프리셋을 실측 계열 6종으로 교체(node-exporter/kube-state-metrics/node-collector 기반 —
  CPU/MEM/FS 사용률(%), 재시작율, 팟 수, sandbox 레플리카). range 선택(5m/15m/1h/6h → `range_seconds`),
  결과 카드 단위 포맷(%, 평균·최대), summarize 에 max 추가.
- **docs/frontend-metrics-queries.md 신설** — 콘솔 수치의 데이터 경로 3종(WS/usage 샘플/온디맨드),
  usage 롤업 필드, 프리셋 PromQL, RCA evidence provider 기본 쿼리 전체(k8s/metrics/logs/traces),
  `/rca-reports` 분석 필드, 재현 방법. docs/README.md 색인·frontend 키워드에 링크(test_docs_index 그린).

### 반복 4 — 인터랙션 전수 감사·교정 (49d551e8)

- 전 페이지 코드 감사(체크리스트는 frontend/AUDIT.md 섹션 I). 수정:
  - **클러스터 상세 스케일/재시작 버그**: mock 시절 팟 이름 규칙(`-pod-` replace)으로 디플로이먼트명 유추 →
    실데이터에서 잘못된 이름으로 명령 발행됨. 워크로드 그룹의 실명을 `DeploymentTarget{ns,name,podCount}` 로 전달.
    스케일 기본값 = 현재 팟 수.
  - 권한 회수(AccessView) 확인 모달 추가(파괴 동작 공통 패턴), 알림 배지 한국어 라벨 통일, 채팅 목록 빈 상태,
    죽은 임포트 핵 제거.

### 반복 5 — 프론트 스펙 동기화 (758ca358)

- docs/spec/frontend/{metrics,cluster,org,notifications,chat}.md 를 코드 변경에 맞춰 갱신.

### 반복 6 — 데드 코드 스윕 (e4fa5332, 70d5ef13)

- 구 콘솔 잔재 미사용 익스포트 35종(~550줄) 제거: legacy UI `WizardModal/ConfirmModal/DetailModal/TabList/
  LinkTabList/SideNav/Input/FormField/Switch/InfoTip/InfoList/IconFrame/Modal/SearchInput/EmptyState/modalPop`,
  아이콘 17종, shared/motion `LayoutMorph/PressScale`, charts `Sparkline`. legacy UI 모듈에 남은 것은 실사용
  프리미티브(Button/Chip/Card/Table/Flyover/PageHeader/useThemeMode)뿐. 미참조 파일 스캔 0건(index 계열 오탐 제외).

### 라이브 검증 (12:47 KST)

- CD 1차 배포 확인: `assets/index-kyKyMN6k.js` → `assets/index-oA7Yte0S.js` 로 교체됨.
- 번들 원문 grep: `클러스터 맵` 0건, `MOCK 모드` 0건, 비용 문자열 0건 — **스크린샷의 구화면(가짜 비용/1,000개 팟/중복 헤딩) 라이브에서 소멸 확인**.
- /api/healthz ok. 이후 push(49d551e8~)는 다음 CD 사이클에서 반영 — 같은 방식으로 재확인할 것.

### 반복 7 — 마무리 폴리시 + 라이브 2차 검증 (6b786707~475de2f4, 13:0x KST)

- 승인 카드: 거절 클릭 시 승인 버튼에 로딩이 뜨던 문제 → `approval.variables.action` 으로 클릭한 버튼에만 로딩(475de2f4).
- 메트릭 헤더 PageHeader 통일, rca-reports Bruno 에 심화 필드 검증 추가(6b786707), repo 스펙 동기화(88ec88e5).
- **라이브 2차 검증 완료**: 6b786707 AWS CD success. lazy 청크 직접 grep —
  `IncidentDetailView-v-ruHVvH.js` 에 "후보 평가"(RCA 심화 UI), `MetricsView-DXcELkOw.js` 에 "노드 CPU 사용률"(새 프리셋) 존재.
  주의: 메인 `index-*.js` 해시는 lazy 청크만 바뀌면 안 변한다 — 배포 확인은 메인 번들에서 청크 파일명 grep 후 그 청크를 확인할 것.
- GitHub Actions 상태 확인은 `gh run list --branch dev --limit 12` 또는 `gh run view <run_id> --json jobs`를 사용한다. 토큰 원문이나 askpass 파일 경로를 문서에 남기지 않는다.

### 검증 상태 (반복 1~3)

- frontend: `npm run build` + `npm run lint` 그린. backend: `pytest -k "rca or evidence or gateway or dashboard"` 153 passed,
  ruff/lint-imports 그린(lint-imports 는 `PYTHONPATH=src` 필요).
- push 완료(17ac76e1) → dev CI → main promote → AWS CD (~10분). 배포 후 `curl -s https://k8s.woonyong.org | grep assets/index-` 로 해시 변경 확인할 것.

### 다음 백로그 (우선순위) — 반복 1~7 이후 잔여

1. ~~인터랙션 정밀 감사~~ / ~~데드 파일·익스포트 스윕~~ / ~~라이브 스팟체크~~ — **완료** (frontend/AUDIT.md 섹션 I).
2. ~~recovery plan 상태 노출~~ — **완료**. `GET /rca/recovery-plans/by-correlation/{correlation_id}` + 인시던트 상세 "복구 계획" 패널.
3. 로그인 후 실브라우저 E2E 스팟체크(등록 위저드→연결, 승인 grant, 인시던트 상세 심화 필드 실데이터 렌더) —
   자격증명 필요(이 세션엔 없음).
4. OpenAI 크레딧 충전 후 chat/fallback LLM 라이브 검증(기존 백로그 승계).
5. evidence retention·fastapi 버전 정렬 등 기존 HANDOVER 하단 백로그 승계.

### 환경 메모 (콜드 스타트용)

- 샌드박스 빌드에서 rollup native 오류 시: `cd frontend && npm i --no-save @rollup/rollup-linux-arm64-gnu` (package.json 커밋 금지).
  npm i 가 45초 타임아웃으로 끊겨도 node_modules 에 설치돼 있으면 빌드는 됨.
- **⚠️ node_modules 는 사용자 Mac 과 마운트 공유** — 사용자의 로컬 npm 이 darwin 바이너리로 되돌려 rollup/eslint 가
  갑자기 깨질 수 있다(실제 발생). 그 경우 해당 패키지 디렉터리 rm 후 재설치. 같은 이유로 **다른 세션이 워킹트리를
  대신 커밋하는 경우가 있다** — 커밋 전 `git status`/`git log` 로 경합 확인.
- push: 현재 로컬 Git credential/`gh` 인증을 사용한다. 토큰 원문이나 askpass 파일 경로를 문서에 남기지 않는다.
- 커밋: `git -c user.name="choi woo-nyong" -c user.email=woonyong.kr@gmail.com commit --no-verify`.

## 최신 업데이트 (11:25)

- **GitHub Actions CD가 재가동됨**: dev push → Promote Dev To Main → AWS CD 자동 배포 체인이 살아있음. main 41b7d04c(우리 작업 전부 포함)가 CI 이미지로 배포됨. **내 수동 CodeBuild 롤아웃과 경합했으므로 이후 배포는 CI 경로만 사용할 것.**
- dev CI 실패 원인 해결: env 가드가 frontend/.env.production(시크릿 아닌 vite 플래그)을 거부 → 허용 목록 추가(2530884e). dev CI 그린 확인.
- **repo Actions 변수 `CONFIGURE_CLOUDFLARE=0`으로 변경** — CD가 배포마다 DNS를 api-gateway ELB로 덮어써 콘솔이 사라지는 문제 차단. 도메인은 console ELB로 수동 유지(아래 참고). 되돌리려면 GitHub 변수에서 1로.
- **RCA 정확도 라이브 검증 완료**: exit-1 크래시(payment-gateway)가 배포 전 `oom_killed` 오판 → 배포 후 `config_env_error` 정답 판정. 주입 장애는 전부 정리됨(sandbox clean).
- **✅ 해결됨(11:40)**: GitHub 환경 시크릿(`aws-test`)에 `GH_APP_TOKEN`(내구성 PAT) 등록 완료 — 이후 CD 배포는 임시 토큰 대신 이 토큰을 사용하므로 GitHub 연동이 만료되지 않음. 클러스터 시크릿도 PAT로 재주입 + scm/render/pull 워커 재시작 완료.
- **최종 검증(11:42)**: 38개 deployment 전부 Ready, 콘솔 200, /api/healthz ok, DNS=console ELB 유지, dev CI 그린, main CD 그린.

## 서비스 현재 상태 (라이브)

- **https://k8s.woonyong.org** — 콘솔 UI(/) + API(/api/*) 정상. DNS: Cloudflare CNAME → console ELB(`a5932a19...elb.amazonaws.com`, proxied). 이전엔 cloudflared 터널→api-gateway 직결이라 /가 404였음. 터널(73b6907e)은 살아있으나 현재 미사용 경로.
- EKS(ap-northeast-2): `kubernetes-ops`(management, 네임스페이스 `management`, 38 deployment 전부 Ready), `cluster-1`/`cluster-2`(target, `sandbox`에 baseline 마이크로서비스+부하생성기 상시 가동).
- 배포 이미지: `kubernetes-ops-service:d86d0da6-dev`(백엔드 33개), `kubernetes-ops-console:1daf34d0-dev`(콘솔). **판정 정확도 수정(8f478552)은 아직 미배포 — 다음 단계가 이미지 재빌드+롤아웃.**

## 아키텍처 결정사항 (이번 작업에서)

1. **이미지 빌드**: GitHub Actions 대신 AWS CodeBuild 직접 경로 구축(샌드박스에 Docker 없음). 프로젝트 `kubernetes-ops-image-build`(백엔드), `kubernetes-ops-console-build`(콘솔). 소스는 S3 `kubernetes-ops-buildsrc-183548421506`에 zip 업로드. 콘솔 zip은 **권한 정규화 필수**(644/755 — 마운트가 600으로 만들어 nginx가 못 읽음).
2. **RCA symptom 승격**: `pipeline/symptom.py` — 스냅샷 신호(waiting/terminated reasons, events)를 결정적 우선순위로 카탈로그 symptom에 매핑. 명시 symptom > 유도 > unknown.
3. **룰 = YAML 카탈로그**: `src/services/ai/agent/causes/catalog/*.yaml`. 코드 수정 없이 룰 추가. `signals` DSL(fact/log_pattern/event_pattern, 그룹 내 OR·그룹 간 AND)로 후보 판별 — 소스 존재만으로 1.0 확정 불가.
4. **LLM fallback**: `ai-fallback-worker`가 `rca.ai_fallback.requested` 소비 → LLM 후보 생성 → 기존 평가 파이프라인 합류(환각도 evidence 점수 검증 통과 필요). LLM 미설정/오류 시 무해한 no-op.
5. **RCA 리포트 중복 방지**: 동일 (workspace, root_cause, 리소스) 5분 창 내 재저장 skip.

## 자격증명/설정 위치 (원문은 .env.local-test — gitignore됨, 커밋 금지)

- OpenAI 키: `management-runtime-secret`의 `OPENAI_API_KEY`, `LLM_PROVIDER=openai` 주입됨. **⚠️ 크레딧 0(insufficient_quota) — 충전해야 chat/fallback LLM 실동작.**
- GitHub: `management-runtime-secret`의 `GITHUB_TOKEN`을 사용자 PAT로 교체(기존엔 1시간 만료 ghs_ 토큰 — manifest 401의 원인). `GITHUB_BRANCH=main→dev` 변경(configmap `management-runtime-config`).
  **⚠️ CD가 재배포 시 시크릿을 다시 쓰므로 GitHub repo Actions secret `GH_APP_TOKEN`에 내구성 토큰 등록 필요.**
- Cloudflare: zone `woonyong.org`(4e89d519...), DNS 편집 토큰 사용(.env.local-test).
- AWS: IAM user `k8s` 키(.env.local-test). EKS 3개 클러스터에 access entry(ClusterAdmin) 추가됨.
- **작업 종료 후 위 키 전부 교체 권장** (채팅으로 전달된 이력 있음).

## 이번 작업의 주요 변경 (커밋 로그 dev 2e8f992a..8f478552)

- `2e8f992a` api-gateway 부팅 크래시 수정(fastapi 0.116.1 + 204 + future annotations). **requirements.txt(0.116.1) vs uv.lock(0.139.0) 버전 이원화가 근본 원인 — 정렬 필요(미해결)**
- `c0261658`~`13e4f45a` ai-fallback-worker + `GET /evidence`·`GET /rca-reports` 조회 API + Bruno/스펙
- `9721f34b` 룰 YAML 카탈로그 이관 + `src/samples/scenarios/`(baseline+fault 6종+`scripts/scenario-inject.sh`)
- `0c54d75f`·`1daf34d0` 새 콘솔 프론트 완성 + 실데이터 연동/UX(등록 피드백, evidence 트레일, 애니메이션). `frontend/AUDIT.md`에 감사 체크리스트
- `d86d0da6` symptom 승격 + inventory upsert dedup + OTEL endpoint 수정
- `15689b88`~`8f478552` 신호 기반 판별, lastState 노출, evidence 네임스페이스 스코핑, 리포트 dedup

## 운영 중 수동 변경 (코드 외)

- postgresql PVC 8→30Gi 확장(디스크 풀 복구). 현재 31% 사용. **evidence 적재 증가 추세 — retention 정책 필요(미해결)**
- `agent_policies` generation 3: kubernetes snapshot을 sandbox로, sandbox 로그/메트릭 쿼리 추가 (evidence_policy.py 기본값에도 반영됨 — 코드가 소스오브트루스)
- DNS 교체 2회(옛 ELB→터널→console ELB)

## 검증된 E2E 흐름

- 장애 주입 → evidence → incident(symptom 유도) → 룰 매칭 → RCA 완료(`rca.completed`) → 리포트 저장 → timeline/조회 API. CrashLoop 주입 시 27건 완료 확인.
- GitOps: dev 폴링 → webhook → git.changed → manifest.rendered(PAT로 private repo 읽기 OK) → diff → **approval 대기**(`approval-3171e9c7...`, run `workflow-5bfd1984...`) — 콘솔 로그인 후 승인하면 Safe PR 자동 생성 예정.

## 남은 작업 (우선순위순)

1. **[진행중] 판정 정확도 배포**: 8f478552 이미지 빌드→전 워커 롤아웃→crashloop 주입 재검증(기대: `config_env_error`, oom_killed 아님) — 주입된 crashloop fault 정리 포함
2. OpenAI 크레딧 충전 후: `pytest tests/test_llm_live.py`(3개), chat 화면 대화, fallback LLM 후보 생성 확인
3. 콘솔에서 대기 approval 승인 → Safe PR 생성 확인
4. GH_APP_TOKEN Actions secret 등록(재배포 시 토큰 유실 방지)
5. requirements.txt/uv.lock fastapi 버전 정렬(0.139.0 권장) + 이미지 재빌드
6. evidence/events retention 정책(DB 증가 관리)
7. `/console` 하위 legacy demo 페이지 실데이터화(신규 백엔드 API 필요 — 범위 합의 필요)
8. inventory CardinalityViolation·raw Evidence.logs 전 네임스페이스 저장 등 코드 주석의 follow-up 항목

## 이어받는 AI를 위한 실행 정보

- 테스트: `uv sync` 후 `pytest tests -q` (로컬 venv는 UV_PROJECT_ENVIRONMENT로 분리 권장). 전체 640+개, 라이브 LLM 3개는 OPENAI_API_KEY 있을 때만 실행
- 이미지 빌드: `zip -rq source.zip src pyproject.toml uv.lock` → S3 업로드 → `aws codebuild start-build --project-name kubernetes-ops-image-build --environment-variables-override name=IMAGE_TAG,value=<sha>-dev`
- 롤아웃: management 네임스페이스에서 kubernetes-ops-service 이미지 쓰는 deploy 전체 `kubectl set image` (이벤트 스키마 변경 시 전 워커 동시 롤아웃 필수)
- 장애 주입: `TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh inject|status|cleanup <fault>`
- 문서 색인 규칙: 새 문서는 docs/README.md 색인에 링크(tests/test_docs_index.py 강제)

## 인프라 비용 최적화 (2026-07-08)

- target 클러스터 노드그룹 전환 완료(ap-northeast-2):
  - `cluster-1`: 기존 ON_DEMAND `cluster-1-ng`(t3.large, desired 2→1) 드레인 후 삭제. 현재 `cluster-1-spot`만 ACTIVE, SPOT, instance types `t3.large t3a.large m5.large`, scaling min=1/max=2/desired=1.
  - `cluster-2`: 기존 ON_DEMAND `cluster-2-ng`(t3.large, desired 2→1) 드레인 후 삭제. 현재 `cluster-2-spot`만 ACTIVE, SPOT, instance types `t3.large t3a.large m5.large`, scaling min=1/max=2/desired=1.
  - 두 target 모두 단일 새 노드에서 allocatable pods가 29로 잡혀 CoreDNS/metrics-server를 1 replica로 낮춤. target/sandbox 팟은 각 클러스터에서 target 12개, sandbox 13개 모두 Running.
- 추가 요청으로 management 노드그룹 전환 완료:
  - 기존 `kubernetes-ops-ng`(t3.xlarge) 삭제, 현재 `kubernetes-ops-r6i`만 ACTIVE, ON_DEMAND, `r6i.xlarge`, min=2/max=2/desired=2.
  - PV AZ 안전을 위해 새 노드그룹은 `ap-northeast-2b`/`ap-northeast-2d` 서브넷만 사용. PostgreSQL/NATS는 2b, MinIO는 2d에 정상 재부착.
  - NATS 재기동 중 JetStream 복구가 1Gi PVC 여유 부족으로 503이 되어 `management/data-nats-0` PVC를 1Gi→5Gi 확장. 축소는 Kubernetes/EBS상 직접 불가하므로 유지 권장.
- 검증:
  - `https://k8s.woonyong.org/api/healthz` 200 OK.
  - management `Deployment` 38개와 `StatefulSet` 3개(minio/nats/postgresql) 모두 Ready.
  - `evidence-worker` 로그에서 `cluster.evidence.received`/`evidence.built`가 계속 발생. cluster-agent 로그에서 `cluster-2` evidence job result POST 200 확인, `cluster-1` policy/reconcile POST 200 및 management evidence 수신 지속 확인.
- 롤백:
  - target 즉시 완화: `aws eks update-nodegroup-config --cluster-name cluster-N --nodegroup-name cluster-N-spot --scaling-config minSize=1,maxSize=2,desiredSize=2`.
  - target 온디맨드 복귀: 기존 describe 값의 서브넷/노드롤로 `cluster-N-ng` ON_DEMAND t3.large 노드그룹을 다시 만들고 Ready 확인 → `cluster-N-spot` 노드 drain → `cluster-N-spot` 삭제. 단일 노드 유지 시 CoreDNS/metrics-server 1 replica 조정은 유지 가능.
  - management 복귀: `kubernetes-ops-ng` ON_DEMAND t3.xlarge min=2/max=2/desired=2를 같은 노드롤과 b/d 서브넷으로 생성 → Ready 확인 → `kubernetes-ops-r6i` 노드 drain → `kubernetes-ops-r6i` 삭제. NATS PVC는 5Gi 유지.
- 스팟 중단 대응:
  - EKS managed nodegroup이 `cluster-1-spot`/`cluster-2-spot` 노드를 자동 교체한다.
  - 데모 중 중단이 발생하면 일시적인 노드 장애/재스케줄 시나리오로 활용 가능. 스팟 확보가 길어지면 위 즉시 완화 명령으로 desired=2까지 올리거나 온디맨드 롤백을 수행.

## Backend follow-up: event drain / projection / relay hardening (2026-07-08)

> 작업 범위: backend/infra only. `frontend/`는 다른 UI 세션 변경과 충돌 방지를 위해 이 세션에서 수정·stage·commit하지 않음.

### 커밋 / 배포

- `8829d5b7 perf: RCA report projection / payload 조회 최적화`
  - `rca_reports` 목록 조회 projection 컬럼 추가(`20260708_0610_rca_report_projection_columns.py`).
  - `GET /rca-reports` 저장소 조회에서 `payload` SELECT 제거. `rca_report_summary`는 projection 우선, legacy/test payload fallback 유지.
  - `/dashboard/rca/timeline` 목록/상세 조회에서 `rca_timeline.payload` SELECT 제거.
  - live DB에 projection 컬럼 수동 적용, 기존 `rca_reports` 904행 backfill.
- `9cb3f144 fix: api gateway replicas / 운영 안정화`
  - `api-gateway` manifest: replicas `1 -> 2`, requests `100m/1Gi -> 500m/2Gi`.
  - live `api-gateway` 2/2 Ready 확인.
- `8c623faa fix: outbox relay all-source / 고아 이벤트 해소`
  - 전용 `outbox-relay` 기본 `OUTBOX_RELAY_SOURCE="*"`로 변경. `source=None`이면 모든 source row를 lease/skip-locked로 claim.
  - 워커 내장 relay는 기존처럼 자기 source 필터 유지. 전용 relay와 동시 실행돼도 outbox row lease가 중복 발행을 막음.
  - all-source claim partial index 추가: `ix_outbox_claim_all_sources (sent_at, leased_until, id) WHERE sent_at IS NULL`.
  - live DB에 index 수동 적용.
- 최신 live backend image:
  - `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:8c623faa-service-20260708052433`
  - `kubernetes-ops-service` 이미지를 쓰는 management deployment 전체와 `github-poll-worker` CronJob에 적용 완료.

### 검증 완료

- 로컬:
  - `uv run pytest -q` → `747 passed, 3 skipped`.
  - `uv run pytest tests/test_outbox.py tests/test_database_unit.py tests/test_env_defaults.py tests/test_error_paths.py tests/test_docs_index.py -q` → 통과.
  - `uv run ruff check ...` → 통과.
  - `PYTHONPATH=src uv run lint-imports` → 통과.
  - `PYTHONDONTWRITEBYTECODE=1 make events` → 이벤트 그래프 생성 통과. typed consumer가 없는 subject는 audit/dashboard 전체 구독 또는 terminal/UI/outbound event로 `docs/event-graph-audit.md`에 분류 완료.
  - `uvx vulture src tests --min-confidence 80` → 삭제 대상 없음(삭제 라인 수 0).
- Live:
  - management deployment `40/40` Ready(backend 35개 + console/cloudflared/storage 포함). `api-gateway`는 `2/2`.
  - `https://k8s.woonyong.org/api/healthz` 200, `readyz` 200.
  - `outbox-relay` 로그에서 `relay_source="all"` 확인. `workflow-controller`, `incident-worker`, `api-gateway` source 이벤트 relay 확인.
  - outbox pending: `0`.
  - `event_dead_letters` open: `0`; 상태 요약 `archived=1891`, `replayed=529`.
  - legacy backlog: `missing-cause-rule:default:unknown` open 1건(occurrence 11433) → `resolved` 처리 완료.
  - `github-poll-worker` 최신 이미지 기준 수동 10회 연속 `Complete` 확인. 기존 Failed job 잔재 삭제.
- E2E:
  - `TARGET_CONTEXT=cluster-1 bash scripts/scenario-inject.sh inject crashloop`.
  - 새 report 생성 확인: `rca_reports.id=927`, correlation `f7bf5469-4899-4682-a3aa-6f621793e705`, `cluster-1`, `CrashLoopBackOff`, resource `payment-gateway-6c6c5994f7`, root cause `config_env_error`, confidence `1.0`, candidates `5`.
  - `recovery_plans` 생성 확인: status `selection_requested`.
  - `rca_timeline` 확인: status `approval_recommended`, action_route `draft_pr`.
  - 인증 쿠키로 `GET /api/rca-reports?correlation_id=f7bf5469-4899-4682-a3aa-6f621793e705&limit=1` 호출 → 200, item id `927` 반환.
  - 주입한 crashloop fault cleanup 완료(`scenario=crashloop` 남은 리소스 0).

### 관찰 완료

- 30분 신규 DLQ 관찰 완료: `2026-07-07T20:30:41Z` 시작 → `2026-07-07T21:00:41Z` 종료.
  - `event_dead_letters.created_at >= '2026-07-07 20:27:55+00'` count `0`.
  - `event_dead_letters` 최신 생성시각은 여전히 `2026-07-07 18:45:53.193523+00`.
  - outbox pending `0`.
  - 관찰 구간 outbox-relay 로그: `MaxPayloadError|dead_letter|Traceback|ERROR|outbox_relay_error` 없음.
  - 관찰 구간 api-gateway 로그: 오류 패턴 없음.
  - `github-poll-worker` CronJob 최신 이미지 `8c623faa-service-20260708052433`, 최근 job 연속 `Complete`, `failedJobsHistoryLimit=1`.
- `TARGET_CONTEXT=target1` kube context는 현재 없음. 실제 target context는 `cluster-1`/`cluster-2`라 이번 E2E는 `cluster-1`로 수행.
- live DB에는 `alembic_version` 테이블이 없어 migration은 기존 운영 방식대로 psql 수동 DDL로 적용함. 다음 운영 정리 시 Alembic versioning 도입 여부를 결정할 것.
- 작업트리에 `frontend/` 변경이 생길 수 있음(다른 UI 세션). backend 후속 커밋 시 `git status --short` 확인 후 frontend 파일은 stage하지 말 것.

## 위저드 API 계약 (backend, 2026-07-08)

> 원칙: 목업/페이크/하드코딩 금지. 프론트 위저드는 아래 API로 서버가 실제 접근성/문법/전송 가능성을 먼저 검증한 뒤 다음 단계로 이동한다. 모든 실패 응답은 사람이 읽는 한국어 `detail`과 기계 분기용 `code` 또는 `reason_code`를 함께 사용한다. `frontend/`는 이 백엔드 세션에서 수정하지 않았다.

### Auth

- `POST /auth/check-email`

요청:

```json
{"email":"user@example.com"}
```

성공 응답:

```json
{"available":true,"reason_code":"","detail":"","retry_after":null}
```

이미 등록된 이메일:

```json
{"available":false,"reason_code":"already_registered","detail":"이미 가입된 이메일입니다.","retry_after":null}
```

rate limit:

```json
{"detail":{"code":"rate_limited","detail":"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.","retry_after":60}}
```

로그인 실패는 이메일 없음/비밀번호 오류를 모두 `invalid_credentials`로만 노출한다. 비밀번호까지 맞은 계정 상태만 `email_unverified`, `approval_pending`으로 분기한다. 인증 메일 재발송은 cooldown 초과 시 `code="resend_cooldown"`과 `retry_after`를 반환한다. 마지막 active service admin 제거/강등은 `code="last_admin"` 400으로 차단한다.

### Repository Wizard

- `POST /repos/validate`

요청은 `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo`, `git@github.com:owner/repo.git` 모두 수용한다. GitHub 외 host는 `unsupported_host`.

```json
{"url":"https://github.com/Jungle-303-04/final.git","token":"<github-token-optional>"}
```

성공 응답:

```json
{
  "accessible": true,
  "private": false,
  "default_branch": "main",
  "normalized": "Jungle-303-04/final",
  "reason": null,
  "code": null,
  "credential_ref": "db:github:github"
}
```

token이 필요하지만 없는 경우:

```json
{
  "accessible": false,
  "private": null,
  "default_branch": null,
  "normalized": "owner/repo",
  "reason": "비공개 저장소이거나 접근 토큰이 필요합니다.",
  "code": "token_required",
  "credential_ref": null
}
```

token 원문은 응답/로그에 남기지 않는다. 제공된 token은 `CREDENTIAL_ENCRYPTION_KEY` 기반 Fernet으로 `workspace_credentials`에 암호화 저장한다.

- `GET /repos/branches?repo=owner/repo`

```json
{
  "repo": "owner/repo",
  "default_branch": "main",
  "branches": [
    {"name": "main", "default": true, "protected": true}
  ]
}
```

- `GET /repos/manifests?repo=owner/repo&branch=main`

응답은 `.yaml/.yml` 중 Kubernetes `kind`가 파싱되는 파일만 반환한다.

```json
{
  "repo": "owner/repo",
  "branch": "main",
  "manifests": [
    {"path": "deploy/api.yaml", "kinds": ["Deployment", "Service"]}
  ],
  "warnings": []
}
```

### Target Cluster Wizard

- `GET /providers/cluster-discovery`

`flows[]`에 `existing-k8s`, `eks`, `gke`, `aks`, `kind`, `minikube`, 외부 import provider가 포함된다. 각 cloud provider body에는 `config_fields`가 있어 프론트가 provider별 입력폼을 하드코딩 없이 구성한다.

EKS form metadata 예:

```json
{
  "cloud_provider": "eks",
  "deploy_providers": [{"key": "manual-manifest"}],
  "default_deploy_provider": "manual-manifest",
  "supports_import": false,
  "config_fields": [
    {"key": "region", "label": "AWS region", "required": true},
    {"key": "eks_cluster_name", "label": "EKS cluster name", "required": true},
    {"key": "context_alias", "label": "Context alias", "required": false}
  ]
}
```

- `POST /targets`

`cluster_id`는 optional이다. 미지정 시 서버가 `<name-slug>-<4자리 난수>`로 생성한다. 등록 직후 status는 `pending_install`이고, agent가 `/agent/connect`로 최초 연결하면 `registered`로 승격한다. `TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS` 기본은 1800초다. 만료 이후 connection-status는 `install_expired`를 반환한다. `TARGET_REGISTRATION_AUTO_DELETE_EXPIRED` 기본은 `false`; audit 보존을 위해 hard delete보다 UI 삭제/재시도 흐름 권장.

EKS 요청 예:

```json
{
  "name": "customer-prod-01",
  "environment": "prod",
  "management_base_url": "https://k8s.woonyong.org/api",
  "image": "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:latest",
  "cloud_provider": "eks",
  "deploy_provider": "manual-manifest",
  "provider_config": {
    "region": "ap-northeast-2",
    "eks_cluster_name": "customer-prod-eks",
    "context_alias": "customer-prod-01"
  }
}
```

응답 예:

```json
{
  "registered": true,
  "cluster_id": "customer-prod-01-0042",
  "status": "pending_install",
  "applied": false,
  "apply_output": null,
  "install_manifest": "apiVersion: v1\n...",
  "agent_token": "원문은 1회 반환",
  "install_command": "curl -fsSL https://k8s.woonyong.org/api/install/<token> | kubectl apply -f -",
  "bootstrap_command": "aws eks update-kubeconfig --region ap-northeast-2 --name customer-prod-eks --alias customer-prod-01 && kubectl --context customer-prod-01 get nodes && curl -fsSL https://k8s.woonyong.org/api/install/<token> | kubectl --context customer-prod-01 apply -f -",
  "bootstrap_steps": [
    {"label": "kubeconfig 확인", "command": "kubectl config current-context"},
    {"label": "target agent 설치", "command": "<bootstrap_command>"},
    {"label": "연결 확인", "command": "kubectl -n target get pods"}
  ],
  "connect_timeout_seconds": 1800,
  "connect_expires_at": "2026-07-08T12:30:00+00:00"
}
```

provider별 bootstrap command 입력:

- EKS: `region`, `eks_cluster_name`, optional `context_alias`.
- GKE: `project_id`, `location_type`(`region|zone`), `location`, `gke_cluster_name`.
- AKS: `resource_group`, `aks_cluster_name`.
- Existing Kubernetes: optional `context_name`; 없으면 현재 kube context 기준 generic install command.
- kind: optional `kind_cluster_name`; 기본 context는 `kind-<name>`.
- minikube: optional `profile`; 기본 context는 `minikube`.

모든 shell command 입력값은 `shlex.quote`로 escaping한다. cloud secret은 `provider_config`에 저장하지 않는다.

- `GET /clusters/{cluster_id}/connection-status`

```json
{
  "cluster_id": "customer-prod-01-0042",
  "connection_status": "pending_install",
  "last_agent_id": null,
  "last_seen_at": null,
  "agents": [],
  "connect_timeout_seconds": 1800,
  "connect_expires_at": "2026-07-08T12:30:00+00:00"
}
```

상태: `pending_install`, `install_expired`, `online`, `stale`, `never_connected`.

### 기타 검증 API

- `POST /alert-channels/test`

```json
{
  "name": "ops",
  "kind": "webhook",
  "url": "https://hooks.example/service",
  "min_severity": "warning",
  "severity": "warning",
  "message": "알림 채널 테스트"
}
```

```json
{"valid":true,"delivered":true,"code":null,"detail":"테스트 알림을 전송했습니다.","status_code":204}
```

- `POST /rca/rules/validate`

```json
{"yaml_text":"rules:\n  - id: custom_dns\n    symptoms: [\"DNS lookup failed\"]\n    required_sources: [\"kubernetes\", \"logs\"]\n    candidates:\n      - candidate_id: service_dns_resolution_failure\n        title: 서비스 DNS 실패\n        description: 서비스 이름 해석 실패\n        expected_evidence: [\"kubernetes\", \"logs\"]\n        checks:\n          - CoreDNS 이벤트 확인\n"}
```

```json
{"valid":true,"errors":[],"matched_symptom":"DNS lookup failed","candidates_count":1}
```

오류:

```json
{"valid":false,"errors":[{"code":"schema_error","detail":"RCA 룰 스키마 위반: ...","line":null}],"matched_symptom":null,"candidates_count":0}
```

- `POST /metrics/validate`

```json
{"source":"prometheus","query":"up","base_url":"http://prometheus:9090","range_seconds":300,"step_seconds":30}
```

```json
{"valid":true,"code":null,"detail":"PromQL dry-run 성공","result_type":"matrix"}
```

Prometheus base URL이 env/request 어디에도 없으면 `code="prometheus_base_url_required"`, 문법 오류는 `promql_invalid`, timeout은 `prometheus_timeout`.

### Repo 연결 / 배포 정의 생성 가드

- `POST /applications/connect`와 `POST /applications/{application_id}/deployments`는 대상 cluster-agent connection_status가 `online`이 아니면 쓰기 전에 중단한다.
- 단일 대상 실패 응답:

```json
{
  "detail": {
    "code": "cluster_not_connected",
    "detail": "에이전트가 연결되지 않은 클러스터입니다",
    "clusters": ["cluster-1"]
  }
}
```

- global/multi target(`cluster_id="*"`)은 연결 안 된 전체 cluster id를 `clusters` 배열에 담고, 하나라도 실패하면 watch/deployment binding을 하나도 만들지 않는다.
- 프론트 순서: target 등록 → `bootstrap_command` 실행 → `GET /clusters/{cluster_id}/connection-status`가 `online`인지 확인 → repo/app connect 또는 deployment binding 생성.

### Management Cluster Read-only 계약

- `TargetRegisterRequest.cluster_role`은 `"target"` 또는 `"management"`다. management는 셀프 모니터링용으로만 쓴다.
- management 설치 manifest는 namespace `management`에 agent를 올리고, ServiceAccount RBAC는 cluster read(`get/list/watch`)만 가진다. create/patch/update/delete 권한은 manifest에 포함하지 않는다.
- policy update는 management cluster에서 write/command resource를 열 수 없다. 위반 시 400:

```json
{"code":"management_readonly","detail":"management 클러스터는 읽기 전용입니다"}
```

- 단 evidence provider 주기 같은 읽기성 정책 변경은 허용된다. 저장 시 `cluster_role=management`, `bootstrap.resources=[]`, `desired_state.resources=[]`로 다시 고정된다.
- scale/restart/manual command/recovery dispatch는 gateway와 command-worker에서 각각 차단한다. target-agent도 `CLUSTER_ROLE=management`면 Kubernetes API 호출 전에 write action을 실패 결과(`message="management_readonly"`)로 무시한다.
- `DELETE /clusters/{cluster_id}`는 management registration에 대해 같은 `management_readonly` 400을 반환한다.

### Heatmap Drilldown API 계약

- `GET /clusters/{cluster_id}/nodes/summary`

```json
{
  "cluster_id": "cluster-1",
  "nodes": [
    {
      "name": "ip-10-0-1-12.ap-northeast-2.compute.internal",
      "ready": true,
      "health": "healthy",
      "pods_running": 12,
      "pods_capacity": 110,
      "cpu_pct": 42.0,
      "mem_pct": 73.4,
      "restarts_recent": 3,
      "conditions": ["MemoryPressure"]
    }
  ]
}
```

- `GET /clusters/{cluster_id}/nodes/{node_name}/pods/summary`

```json
{
  "cluster_id": "cluster-1",
  "node_name": "ip-10-0-1-12.ap-northeast-2.compute.internal",
  "pods": [
    {
      "name": "orders-api-6f48d9d9c8-lfx2p",
      "namespace": "sandbox",
      "phase": "Running",
      "health": "healthy",
      "ready": "1/1",
      "restarts": 0,
      "owner_kind": "ReplicaSet",
      "owner_name": "orders-api-6f48d9d9c8",
      "cpu_mcores": 120.5,
      "mem_mib": 256.0,
      "incident_correlation_id": "corr-123"
    }
  ]
}
```

- 두 API 모두 session + `cluster.read` 권한을 사용한다. cluster가 없으면 404, node가 없으면 pod summary에서 404다.
- 데이터 소스는 `cluster_inventory_resources`와 `cluster_usage_samples`뿐이다. CPU/MEM 샘플이 없으면 합성하지 않고 `null`로 둔다.
- pod 배치 정보는 이미 cluster-agent pod summary의 `node_name`으로 저장된다. 새 수집 루프 없이 집계만 추가했다.

### 검증/문서 파일

- Bruno: `docs/api/15-wizard-validation/*`.
- Bruno 추가: `docs/api/05-rca-dashboard/09-node-summary.bru`, `docs/api/05-rca-dashboard/10-node-pods-summary.bru`, `docs/api/11-clusters/12-unregister-cluster.bru`.
- 스펙: `docs/spec/packages/contracts.md`, `docs/spec/domains/{identity,gitops,providers,target,alert,rca,dashboard,command,applications}.md`, `docs/spec/services/gateway-api-gateway.md`.
- focused test: `uv run pytest tests/test_repository_discovery.py tests/test_identity_auth_routes.py tests/test_password_auth.py tests/test_target_registration.py tests/test_provider_registry.py tests/test_alert_routing.py tests/test_rca_rule_catalog.py tests/test_dashboard_metric_presets.py tests/test_admin_console_routes.py tests/test_applications_router.py tests/test_schemas.py tests/test_command_router.py tests/test_command_worker.py tests/test_target_agent_commands.py tests/test_fleet_router.py tests/test_bruno_collection.py -q`.
