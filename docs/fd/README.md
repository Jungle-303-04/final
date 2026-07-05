# FD — 프론트엔드 설계 문서 (Frontend Design)

Kubernetes 운영 자동화 플랫폼의 웹 콘솔 설계 문서 세트.
Plural Console 의 IA/UX 패턴을 참조하되, 이 저장소의 실제 백엔드 계약
(`src/packages/contracts/gateway/routes.py`)에 1:1 로 매핑해 설계한다.

**목표: Claude(Fable5)가 이 문서만 읽고 한 번에 오류 없이 구현 가능한 수준의 명세.**

## 문서 지도

읽는 순서대로 나열. 각 문서는 자기 범위만 다루고, 겹치는 내용은 링크로 위임한다.

| # | 문서 | 내용 | 선행 문서 |
|---|---|---|---|
| 0 | (이 문서) | 목적, 지도, 전역 결정사항, 용어 | — |
| 1 | [01-requirements.md](01-requirements.md) | 기능 요구사항 전체, 기능→뷰→API 매핑, 백엔드 갭 | — |
| 2 | [02-reference-map.md](02-reference-map.md) | Plural console 참조 지도, 라이선스 경계, 대안 앱 | 1 |
| 3 | [03-architecture.md](03-architecture.md) | 프론트 아키텍처: 레이어, 폴더, 상태관리, API 클라이언트 | 1, 2 |
| 4 | [04-design-system.md](04-design-system.md) | 토큰, 테마, 모션 원칙, 공용 컴포넌트 계약 | 3 |
| 5 | [05-routes-ia.md](05-routes-ia.md) | 라우트 트리, 내비게이션, 권한별 가시성 | 1, 3 |
| 6 | [06-api-map.md](06-api-map.md) | API 전체 인벤토리 + 뷰 역링크 + 신규 API 계약 초안 | 1 |
| 7 | [07-build-plan.md](07-build-plan.md) | Fable5 원패스 구현 순서, 단계별 완료 기준, 검증 | 전부 |

### 뷰 명세 (`views/`)

| 문서 | 뷰 | 대응 요구사항 |
|---|---|---|
| [views/auth.md](views/auth.md) | 로그인/가입/이메일 검증/승인 대기 | 로그인 기능 |
| [views/org-admin.md](views/org-admin.md) | 조직·멤버·그룹 관리 | 조직 생성, 조직원/그룹 생성 |
| [views/resources.md](views/resources.md) | 리소스 등록 위저드(레포/클러스터), 권한 설정 | 리소스 생성, 권한 설정 |
| [views/fleet-heatmap.md](views/fleet-heatmap.md) | 클러스터 모음 treemap 히트맵 + 드릴다운 | 클러스터 모음 뷰→노드→팟 |
| [views/cluster-detail.md](views/cluster-detail.md) | 단일 클러스터 상세(리소스/서비스/노드/팟) | 클러스터 뷰 |
| [views/repo.md](views/repo.md) | 레포 뷰(변경 이력, 배포 바인딩, Safe PR) | 레포뷰 |
| [views/metrics.md](views/metrics.md) | 메트릭 그래프(실시간 + 온디맨드 쿼리) | 각종 그래프 메트릭 뷰 |
| [views/workflow.md](views/workflow.md) | 워크플로우 노드 그래프(파이프라인 시각화/생성) | 워크플로우 생성 노드뷰 |
| [views/ai-chat.md](views/ai-chat.md) | AI 채팅(도구 실행 승인/선택 카드) | AI 채팅 |
| [views/notifications.md](views/notifications.md) | 알림 센터(승인 대기, DLQ, 인시던트) | 알림 |

## 전역 결정사항 (모든 문서가 따르는 전제)

각 결정의 근거는 [02-reference-map.md](02-reference-map.md)와 [03-architecture.md](03-architecture.md)에 있다.

| ID | 결정 | 요약 |
|---|---|---|
| D1 | 앱 위치 | 신규 `frontend/` 폴더. `frontend-demo/`는 참조 데모로 보존, 모션 프리미티브·워크플로우 노드 컴포넌트는 이식 |
| D2 | 스택 | React 18 + TypeScript + Vite. 라우팅 react-router-dom v6, 서버 상태 @tanstack/react-query v5, UI 상태 zustand, 그래프 @xyflow/react, 차트/히트맵 @nivo(line·treemap), 테이블 @tanstack/react-table, 프리미티브 radix-ui, 모션 motion(구 framer-motion), 팔레트 cmdk |
| D3 | 라이선스 | Plural console 소스 **복사 금지**(AGPL v3 전파). IA/UX/네이밍 패턴 참조만. `@pluralsh/design-system` 패키지는 LICENSE 파일 미확인으로 채택 보류 → 자체 토큰 + Radix(MIT) |
| D4 | 인증 | 백엔드 세션 쿠키(`service_session`, httpOnly) 그대로 사용. 프론트는 토큰 저장 안 함. 부팅 시 `GET /auth/session`으로 세션 확인 |
| D5 | API 접근 | 훅 계층(`features/*/api.ts`)에서만 fetch. 뷰/컴포넌트의 직접 fetch 금지 |
| D6 | 실시간 | realtime-gateway `WS /live/browser` 구독. 재연결·백오프는 공용 `useLiveSocket` 훅 한 곳에서만 처리 |
| D7 | 백엔드 갭 | 조직/그룹/멤버/알림 API는 현재 없음. 프론트는 [06-api-map.md](06-api-map.md)의 계약 초안대로 훅을 먼저 만들고 mock adapter 로 개발, 백엔드 완성 시 어댑터만 교체 |
| D8 | 언어 | UI 문구 한국어 기본. 코드 식별자·주석 규칙은 저장소 컨벤션(주석 한글 명사형) |
| D9 | 테마 | 다크 우선 단일 테마(Plural 콘솔 무드). 토큰은 CSS 변수, 라이트 모드는 범위 외 |
| D10 | 품질 게이트 | `tsc --noEmit`, eslint, vitest, Playwright smoke — [07-build-plan.md](07-build-plan.md) 기준 |

## 용어

| 용어 | 의미 (백엔드 근거) |
|---|---|
| workspace | 테넌트 경계. 모든 리소스의 소유 단위 (`packages/contracts/identity`) |
| organization / group | workspace 내 조직/그룹. 리소스 접근 부여 대상 |
| ServiceRole | 서비스 전역 역할: `service_admin`, `user` |
| ResourceRole | 리소스 단위 역할: `observer`, `release_operator`, `cluster_steward` 등 |
| cluster | 등록된 target 클러스터 (`/clusters`) |
| repository / watch target / binding | Git 레포 / 감시 대상(브랜치+manifest) / 배포 바인딩 |
| application / run | 배포 단위 앱 / 워크플로우 실행 (`/applications/{id}/runs`) |
| approval | 배포·명령 승인 레코드. grant/reject 로 종결 |
| incident / evidence / RCA | 장애 감지 → 근거 수집 → 원인 분석 파이프라인 산출물 |
| Safe PR | AI가 준비한 수정 PR (scm-worker 가 유일한 생성자) |
| live summary | cluster-agent가 realtime-gateway 로 push 하는 실시간 요약(핫 팟, rollout 등) |

## 이 문서 세트의 불변 규칙

1. 모든 API 참조는 `routes.py` 상수 경로 문자열과 일치해야 한다 — [06-api-map.md](06-api-map.md)가 단일 출처
2. 뷰 문서의 컴포넌트는 [04-design-system.md](04-design-system.md) 인벤토리에 있는 것만 사용(없으면 먼저 인벤토리에 추가)
3. 백엔드에 없는 API 를 쓰는 설계는 반드시 "갭(G-n)" 표기와 함께 06 문서의 계약 초안을 링크
4. 문서 수정 시 겹치는 내용을 복사하지 말고 링크 — 단일 출처 유지
