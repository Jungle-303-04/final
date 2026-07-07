# 02. 참조 지도 — 외부 기준 콘솔과 대안

[← 문서 지도](README.md) · [요구사항](01-requirements.md)

## 외부 기준 저장소 실사 결과 (2026-07-06 확인)

| 저장소 | 스택 | 라이선스 | 재사용 판단 |
|---|---|---|---|
| 외부 기준 콘솔 저장소 | 서버 Elixir(GraphQL) + 프론트 React 19/Vite/TS (`assets/`) | **소스는 AGPL v3** (컴파일 산출물만 MIT) | **코드 복사 금지**. IA/UX/화면 구성/네이밍 참조만 |
| 외부 기준 CLI 저장소 | Go | Apache 2.0 | 참조 자유. 프론트 관련성 낮음 |
| 외부 기준 design-system 저장소 | React 컴포넌트 (Radix + react-aria + styled-components + honorable) | LICENSE 파일 확인 불가 | npm 의존 **보류**. 컴포넌트 목록·API 형태만 참조 |
| 외부 기준 문서 사이트 | 문서 | — | UX 흐름·용어 참조 |

**라이선스 결론(D3)**: 우리 프론트는 외부 기준 콘솔의 *구조와 패턴*을 가져오고 *코드*는 가져오지 않는다.
아래 매핑은 "무엇을 보고 무엇을 만들지"의 지도다.

## console 프론트 스택 → 우리 스택 대응 (D2 근거)

console `assets/package.json` 실측 기준.

| 용도 | console | 우리 선택 | 이유 |
|---|---|---|---|
| 빌드 | Vite + TS | 동일 | 현재 `frontend/package.json` 기준 |
| 데이터 | Apollo GraphQL + TanStack Query | **TanStack Query 단독** | 우리 백엔드는 REST(openapi.json 제공) |
| 라우팅 | react-router-dom 6 | 동일 | |
| 차트 | @nivo (line·pie·**treemap** 등) | @nivo/line + @nivo/treemap | 히트맵 요구(R6)와 정확히 일치 |
| 노드 그래프 | @xyflow/react | 동일 | 현재 `frontend/src/features/workflow/WorkflowGraphView.tsx`에서 사용 |
| 테이블 | @tanstack/react-table + virtua | @tanstack/react-table (가상화는 필요 시) | |
| 스타일 | styled-components/emotion | **CSS 변수 + CSS Modules** | 런타임 의존 축소, 토큰 중심 |
| 프리미티브 | design-system(Radix+aria) | **radix-ui 직접**(MIT) | 라이선스 명확, 접근성 확보 |
| 모션 | react-spring | **motion** | 현재 `frontend/src/shared/motion` 기준, 요구사항 "다이나믹 UI" |
| 팔레트 | cmdk | 동일 | 커맨드 팔레트 UX |
| 코드젠 | graphql-codegen + @hey-api/openapi-ts | **@hey-api/openapi-ts** | 백엔드 `GET /openapi.json` → 타입·클라이언트 생성 |

## console 화면 → 우리 뷰 매핑

console 의 실제 IA(사이드바: Home / CD / Stacks / Kubernetes / AI / PR / Security / Cost)를 우리 도메인으로 번역.

| console 화면 | 참조할 것 | 우리 뷰 |
|---|---|---|
| Home(fleet overview) | 클러스터 카드·헬스 요약 배치 | [fleet-heatmap](views/fleet-heatmap.md) |
| CD > Clusters | 목록/상세 탭 구조(Nodes·Pods·Metadata) | [cluster-detail](views/cluster-detail.md) |
| CD > Services | 서비스 상태 뱃지·sync 상태 표현 | [cluster-detail § 서비스 탭](views/cluster-detail.md) |
| CD > Repositories | 레포 카드·헬스 표시 | [repo](views/repo.md) |
| Pipelines | 단계 노드 그래프(gate 승인 UI) | [workflow](views/workflow.md) |
| AI | 채팅 + insight 카드 + "Fix" 실행 버튼 | [ai-chat](views/ai-chat.md) |
| Notifications | 벨 아이콘 + 읽음 처리 패턴 | [notifications](views/notifications.md) |
| Settings > User Management | 사용자/그룹/역할 테이블 | [org-admin](views/org-admin.md) |
| Cost/Security | — | 범위 외 |

## 대안 오픈소스 (소스 공개 + 관대한 라이선스)

요구사항별로 console 보다 나은 참조가 있는 영역.

| 앱 | 라이선스 | 참조 포인트 | 어디에 |
|---|---|---|---|
| **벤치마크 k8s 콘솔 A** | Apache 2.0 | k8s 리소스 목록/상세 UI, 플러그인 구조 — **코드 차용 가능** | cluster-detail 의 리소스 테이블·상세 drawer |
| **벤치마크 GitOps 콘솔 A** | Apache 2.0 | 리소스 트리/헬스 아이콘 체계, sync 상태 UX | cluster-detail, workflow |
| **벤치마크 워크플로우 콘솔 A** | Apache 2.0 | DAG 노드뷰(실행 상태 색·로그 패널) | workflow |
| **벤치마크 클러스터 타일 뷰** | GPL-3.0 | 클러스터/노드/팟 타일 시각화 아이디어 | fleet-heatmap (아이디어만, 코드 금지) |
| **벤치마크 대시보드 도구** | AGPL v3 | 대시보드 패널 UX | metrics (아이디어만, 코드 금지) |
| **벤치마크 개발자 포털** | Apache 2.0 | 카탈로그/소유권(조직·그룹) 모델 UX | org-admin, resources |
| **벤치마크 히트맵 패턴** | — | 면적=규모·색=등락 매핑, 호버 툴팁 | fleet-heatmap 색·범례 설계 |

**권고**: 코드 수준 차용은 Apache 2.0 계열 벤치마크에서만.
AGPL/GPL 계열 벤치마크는 스크린샷·문서 수준 참조로 제한.

## 현재 frontend 반영 위치

예전에 분리해 보던 프론트 컴포넌트 기준은 현재 `frontend/src` 아래로 합쳐 관리한다.
[03-architecture.md](03-architecture.md)의 shared/features 레이어와 아래 실제 파일을 같이 본다.

| 기능 | 현재 위치 | 비고 |
|---|---|---|
| 모션 프리미티브 | `frontend/src/shared/motion/index.tsx` | FadeSlideIn, Stagger, CountUp, AnimatedList, PulseOnChange |
| 워크플로우 노드 그래프 | `frontend/src/features/workflow/WorkflowGraphView.tsx` | @xyflow 노드/엣지와 단계 표시 |
| KPI 카운터 | `frontend/src/shared/motion/index.tsx`, `frontend/src/shared/ui/index.tsx` | CountUp을 StatBox에서 사용 |
| 차트 wrapper | `frontend/src/shared/ui/charts.tsx` | @nivo 기반 chart shell |
| 채팅 화면 | `frontend/src/features/chat/ChatView.tsx` | conversation API와 카드 표시 |
| 실시간 연결 | `frontend/src/shared/lib/live.ts` | `/api/live/browser` WebSocket |
| 토큰·이징 값 | `frontend/src/shared/tokens.css`, `frontend/src/shared/motion/index.tsx` | 디자인 토큰과 motion 설정 |

## 백엔드 이벤트 흐름 참조

프론트가 표시하는 상태의 원천은 이벤트 파이프라인이다. 상태 전이 이해가 필요할 때:

- 워크플로우 상태 9단계: `src/domains/gitops/repository.py` `WORKFLOW_STATUS_RANKS`
- RCA 파이프라인: 루트 [README.md § 서비스 역할](../../README.md) ai 섹션
- 이벤트 계약: `src/packages/contracts/event_bus`, [../events.md](../events.md)
