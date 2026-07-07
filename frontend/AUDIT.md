# 프론트엔드 프로덕션 감사 (AUDIT)

기준: `VITE_API_MODE=real` 프로덕션 빌드(`.env.production`) — 실데이터 아닌 것은 모두 결함으로 취급.
범위: `src/app`, `src/features/*`, `src/shared/*` (메인 앱) + `/console`·`/plural` 복각 UI.

## A. 메인 앱 (── `/overview` `/clusters` `/repos` `/workflows` `/metrics` `/ai` `/notifications` `/incidents` `/catalog` `/settings`)

### A-1. mock/가짜 데이터 경로
- [x] `shared/lib/api.ts` — 기본값 real, mock 은 `VITE_API_MODE=mock` 명시 시에만. `.env.production=real` 확인.
- [x] `shared/lib/live.ts` — mock 분기는 API_MODE==='mock' 에서만 가짜 스트림. real 은 WS(`/api/live/browser`) + 지수 백오프 재연결. 이상 없음.
- [x] 메인 앱 뷰 전수 확인 — 하드코딩 수치/固定 fixture 렌더 없음 (모든 데이터 TanStack Query → `/api/*`).

### A-2. 이번 패스에서 발견·수정한 결함
- [x] **인시던트 상세에 evidence/RCA report 실데이터 미연동** — 신규 `GET /evidence`, `GET /rca-reports` 를 `useEvidence`/`useRcaReports` 로 연결. kind 뱃지(kubernetes/prometheus/loki/tempo), payload 펼침(원문 JSON), 상대+절대 시각, correlation id 복사 칩, RCA 리포트(근본원인·신뢰도·severity·action·근거·미수집 증거) + 증거 흐름 앵커. 빈/오류/로딩 상태 모두 정직하게 처리.
- [x] `IncidentDetail`/`Incident` 타입·adapt 에서 `correlation_id` 유실 → 보존하도록 수정 (evidence 조회 키).
- [x] **ConnectRepoWizard** — 닫아도 입력·단계가 남는 문제 → 닫을 때 초기화. 클러스터 0개면 2단계가 빈 select 로 dead-end → 안내 + `/clusters` 이동 버튼. 성공 토스트 + 상세로 이동(기존). 실패 사유 inline 유지.
- [x] **RegisterClusterWizard** — providers catalog 로딩/실패 시 0단계 dead-end → 스켈레톤/오류+재시도. 복사 버튼 무피드백 → 토스트. 등록 성공 토스트. **미연결 상태에서 ESC/오버레이로 닫으면 1회용 토큰 유실** → close guard(경고 후 한 번 더 닫기). '미연결' 표기 명시.
- [x] **useApproval(승인/거절) 실패가 무음** → 사유 토스트(권한/중복 처리) + 상태 재동기화.
- [x] **ChatView 전송 실패 시 입력 유실** → 실패 시 draft 복원 + 토스트. `useSelectAction` 성공/실패 토스트.
- [x] **CatalogView 설치** — 실패 무음 → 토스트. 한 카드 클릭 시 모든 카드 버튼이 pending 되던 문제 → variables 로 해당 카드만.
- [x] **OpsView DLQ 재처리** — 실패 무음 → 성공/실패 토스트.
- [x] **org/api 뮤테이션 (조직·그룹 생성, 권한 부여/회수, 멤버십 토글)** — 실패 무음 → 토스트, 토글 실패 시 서버 상태 재조회로 체크박스 롤백. 멤버십 토글 pending 중 체크박스 잠금.
- [x] **useApproveUser(가입 승인)** — 성공/실패 토스트 + 목록 재동기화.
- [x] SignupView — 409 외 오류(500 등) 무표시 → fallback 오류 라인.
- [x] AppShell 로그아웃 — pending 표시 + 실패 토스트.
- [x] Drawer ESC 미지원(Modal 과 불일치) → ESC 지원 추가.
- [x] ClusterDetailView 재시작 — 파괴적 명령이 확인 없이 즉시 실행 → 확인 모달 추가.
- [x] WorkflowGraphView — run 미발견 시 dead-end 텍스트만 → 목록 복귀 링크, 로딩 중 성급한 '없음' 방지(`useRunsAll` 이 pending 노출).
- [x] WorkflowListView — 첫 로딩 중 '없음' 빈 상태가 먼저 보이던 문제 → 스켈레톤.
- [x] MetricsView — usage 시계열이 비면 카드 자체를 숨겨서(암묵) → 로딩 스켈레톤/오류+재시도/정직한 빈 상태로 항상 표시. 클러스터 0개면 등록 유도 빈 상태. PromQL 재시도가 현재 입력값을 재실행하던 버그 → 해당 카드의 쿼리 재실행. 프리셋 select 를 controlled 로. x축을 실제 시각(HH:MM:SS) 라벨로.
- [x] `TimeSeriesChart` — crosshair + 전 시리즈 슬라이스 툴팁, 부드러운 시리즈 전환(animate+motionConfig).
- [x] 그래프(AnimatedEdge) — 활성 edge 에 이동 패킷(animateMotion) + 노드 좌표 전환 애니메이션(reduced-motion 존중).
- [x] mock 라우터/픽스처 — 신규 `/evidence`·`/rca-reports` 계약 동형 추가(데모 모드 무결성).

### A-3. 확인만 하고 이상 없던 항목
- [x] 401 처리 — `setUnauthorizedHandler` → session invalidate → `RequireSession` 이 `returnTo` 보존 리다이렉트, 로그인 성공 시 복귀.
- [x] 레포 연결 성공 흐름 — invalidate + `/repos/:id` 이동 + 첫 run 대기 빈 상태 안내.
- [x] 클러스터 등록 후 목록 invalidate + connection-status 5s 폴링(connected 시 중단).
- [x] 스케일/재시작 — 비동기 명령 안내, policy(403)/검증(422) 사유 노출 (`commandFailureMessage`).
- [x] PromQL 온디맨드 — `/agent/debug/query` 발행 후 `/commands/{id}` 2s 폴링, 실측 요약만 표시(가짜 완료 없음).
- [x] 알림 — 승인 대기 run·RCA timeline·DLQ 3소스 합성, 미읽음 워터마크, 링크 전부 실 라우트.
- [x] WS 실시간 — AppShell 1회 연결, heatmap/metrics/cluster 뷰가 스냅샷 반영. 끊김 시 '재연결 중' 배너 + 인벤토리 폴백(정직).
- [x] Modal/Drawer — 오버레이 클릭·ESC·✕ 일관.

## B. `/console`·`/plural` 복각 UI (Plural.sh 디자인 데모)

- [x] **전 구간 mock**: `features/console/api/index.ts` 가 `../mock`/`../metrics` 를 재수출 — CLUSTERS/SERVICES/STACKS/ALERTS 등 27개 fixture, seeded RNG 시계열(`genHistorySeries`), 사인파 라이브 스트림(`console/live.ts`). 폼 제출(배포/스케일/스택 생성 등)은 로컬 state 만 변경.
- [x] **조치**: real 모드에서 `/console` 상단에 상시 "디자인 프리뷰 — 샘플 데이터" 배너 + 실데이터 콘솔(`/overview`) 이동 링크. (fabricated 데이터를 실측으로 오인하지 않도록 정직성 확보)
- [ ] (선택/후속) `/console` 하위 CD·K8s 화면을 실 API 로 재배선 — 이번 범위 아님. 필요 시 `frontend/docs/api-layer.md` 의 교체 지침대로 `console/api/index.ts` 만 교체.

## C. MISSING-BACKEND (백엔드에 필요한 것)

- 없음 — 이번 패스에서 필요한 `GET /evidence`, `GET /rca-reports`, `GET /clusters/{id}/usage`, `GET /clusters/{id}/connection-status`, `GET /commands/{id}` 모두 존재(contracts/gateway/routes.py 확인).
- (참고) `/console` 복각 UI 를 실데이터로 전환하려면 stacks/pipelines/security/cost 등 대응 API 가 없음 — 전환 결정 시 별도 설계 필요.

## D. 검증
- [x] `npm run build` (tsc --noEmit + vite build) 통과 — 0 TS error.
- [x] `npm run lint` 통과.
