# 03. 프론트엔드 아키텍처

[← 문서 지도](README.md) · [참조 지도](02-reference-map.md)

목표: **코드량 최소·재사용 최대·한 번에 빌드 가능**.
백엔드의 계층 규칙(services→domains→packages)과 동형인 단방향 레이어를 프론트에도 강제한다.

## 레이어 (의존 방향: 아래 → 위 금지)

```text
app        라우터, 쉘(사이드바/헤더), 전역 Provider          — 조립만
features   도메인별 뷰 + 훅 + 도메인 컴포넌트                — 화면 로직
shared     ui(프리미티브), motion, lib(api·ws·유틸), tokens  — 도메인 무지
generated  openapi 코드젠 산출물                             — 수정 금지
```

규칙:

1. `shared`는 `features`/`app`을 import 금지 (도메인 지식 0)
2. `features` 간 상호 import 금지 — 공유가 필요하면 `shared`로 강등
3. 뷰(view 컴포넌트)는 **조립만**: 데이터는 훅에서, 표현은 shared/ui 에서
4. fetch/WebSocket 호출은 `shared/lib/api.ts`·`useLiveSocket` 경유만 (D5, D6)

## 폴더 구조 (전체)

```text
frontend/
  package.json  vite.config.ts  tsconfig.json  index.html
  src/
    main.tsx                    # 엔트리
    app/
      router.tsx                # 라우트 트리(05 문서와 1:1)
      providers.tsx             # QueryClient, Theme, Toast, ErrorBoundary
      guards.tsx                # RequireSession, RequireAdmin, RequirePermission
    features/
      console/                  # ConsoleLayout, HomePage, console.css
    shared/
      tokens.css                # 디자인 토큰(04 문서와 1:1)
      ui/                       # Button, Card, Table, Modal, … (04 인벤토리와 1:1)
      motion/                   # 프리미티브: FadeIn, Stagger, PressScale, CountUp
      lib/
        api.ts                  # fetch 래퍼(세션 쿠키, 에러 정규화, baseURL)
        query.ts                # QueryClient 설정, queryKey 팩토리
        live.ts                 # useLiveSocket (WS 재연결·백오프 단일 구현)
        format.ts               # 날짜/용량/기간 포맷
    generated/
      api/                      # @hey-api/openapi-ts 산출물 (수정 금지)
    features/
      auth/          { api.ts, views/, components/ }
      org/           { api.ts(G1~G3,G5 실존 route), views/, components/ }
      resources/     { api.ts, views/, components/wizard/ }
      fleet/         { api.ts, views/, components/Treemap*.tsx }
      cluster/       { api.ts, views/, components/ }
      repo/          { api.ts, views/, components/ }
      metrics/       { api.ts, views/, components/ }
      workflow/      { api.ts, views/, components/ }
      chat/          { api.ts, views/, components/ }
      notifications/ { api.ts, views/, components/ }
  tests/                        # vitest 단위 + Playwright smoke
```

## 상태 관리

| 상태 종류 | 도구 | 규칙 |
|---|---|---|
| 서버 상태 | TanStack Query | 모든 원격 데이터. queryKey 는 `query.ts` 팩토리에서만 생성. 폴링은 `refetchInterval` |
| 실시간 상태 | zustand `liveStore` | WS 수신 스냅샷 1곳 저장, selector 로 구독(리렌더 최소화) |
| UI 로컬 | useState/useReducer | 컴포넌트 내부 한정 |
| 전역 UI | zustand `uiStore` | 사이드바 접힘, 팔레트 열림, 토스트 큐 |
| 세션 | TanStack Query `['session']` | `GET /auth/session`. 401 → 로그인 리다이렉트는 api.ts 인터셉터 한 곳 |

파생 계산(예: 히트맵 색)은 selector/`useMemo`로 — 저장하지 않는다(단일 출처).

## API 클라이언트

1. 백엔드 `GET /openapi.json` → `@hey-api/openapi-ts` 로 `generated/api` 생성 (타입+클라이언트)
2. `shared/lib/api.ts`: `credentials: 'include'`, 401/403/422/5xx 정규화(`ApiError` 단일 타입), 재시도 정책(GET 만 1회)
3. feature `api.ts` 패턴 (모든 feature 동일 형태 — 일관성):

```ts
// features/cluster/api.ts — 패턴 예시
export const clusterKeys = {
  list: () => ['clusters'] as const,
  detail: (id: string) => ['clusters', id] as const,
  summary: (id: string) => ['clusters', id, 'summary'] as const,
};
export function useClusters() {
  return useQuery({ queryKey: clusterKeys.list(), queryFn: listClusters });
}
export function useScaleDeployment(clusterId: string) {
  return useMutation({
    mutationFn: scaleDeployment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clusterKeys.detail(clusterId) }),
  });
}
```

4. **실 API 단일 경로**: `shared/lib/api.ts`는 `VITE_API_BASE ?? '/api'`만 사용한다.
   로컬 dev/preview 는 `frontend/vite.config.ts` 의 `/api` proxy로 Gateway에 붙고, 브라우저에서 테스트용 API 라우터를 선택하는 분기는 없다.

## 실시간 (WS /live/browser)

```ts
// shared/lib/live.ts — 단일 구현
useLiveSocket({
  url: `${WS_BASE}/live/browser`,
  onMessage: (snapshot) => liveStore.getState().apply(snapshot),
  backoff: { initialMs: 1000, maxMs: 15000, jitter: true },
});
```

- 연결은 ConsoleLayout 에서 1개만. 뷰는 `liveStore` selector 로 구독
- 메시지 스키마는 [06-api-map.md § WS](06-api-map.md#websocket)
- 오프라인 표시: 연결 상태를 `liveStore.status` 로 노출 → Topbar 인디케이터

## 객체지향·재사용 원칙 (코드량 절감 장치)

| 원칙 | 적용 |
|---|---|
| 합성 > 상속 | 컴포넌트 variant 는 prop + CSS 변수. 클래스 상속 금지 |
| 단일 책임 | 파일 1개 = export 1개(컴포넌트) 원칙. 200줄 초과 시 분해 |
| 제네릭 리스트 패턴 | `ResourceTable<T>`(컬럼 정의 주입), `EntityDrawer<T>` — 목록+상세 화면 전부 이 2개로 |
| 상태 표현 통일 | 모든 원격 데이터 렌더는 `<QueryBoundary query={q}>{data => …}</QueryBoundary>` 1개로 로딩/에러/빈 상태 처리 |
| 폼 통일 | `<Form schema={zod} onSubmit>` 래퍼 1개 (react-hook-form + zod). 위저드는 `<Stepper steps>` |
| 상태 뱃지 통일 | 백엔드 enum → 색/아이콘 매핑 테이블 1곳(`shared/ui/status.ts`). 뷰마다 switch 금지 |
| 모션 통일 | 페이지 전환/리스트 등장/숫자 변화는 `shared/motion` 프리미티브만 사용. 인라인 animate 금지 |

## 에러·로딩·빈 상태 (전 화면 공통 계약)

- 로딩: Skeleton (스피너 금지, 04 문서)
- 에러: `ApiError.kind` 별 문구 — `unauthorized`(재로그인), `forbidden`(권한 안내), `network`(재시도 버튼), `server`(요청 ID 표시)
- 빈 상태: `<EmptyState icon title action>` — action 은 해당 화면의 생성 흐름으로 연결

## 테스트 전략

| 레벨 | 도구 | 대상 |
|---|---|---|
| 단위 | vitest | shared/ui 프리미티브, format, 훅(queryKey) |
| 컴포넌트 | vitest + testing-library | QueryBoundary, Form, 상태 뱃지 매핑 |
| E2E smoke | Playwright | 로그인 → fleet → 클러스터 상세 → AI 채팅 1왕복 (계약 스모크) |

빌드 게이트: `tsc --noEmit && eslint && vitest run` — [07-build-plan.md](07-build-plan.md).
