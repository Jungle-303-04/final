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
