---
title: Codex 프론트엔드 착수 전 계획 보고서
status: review-required
date: 2026-07-11
evidence_head: 40bdea2d73b06cd4950910209cfe27a6fad70c48
directive: CODEX-BRIEFING-20260711.md §3
---

# Codex 프론트엔드 착수 전 계획 보고서

이 보고서는 `CODEX-BRIEFING-20260711.md` §3의 질문 순서를 그대로 따른다. 신규 화면 구현은 하지 않았으며, 보고서 작성 전 수행한 작업은 코드·문서 조회, 빌드·검사, 기존 visual gate, 읽기 전용 HTTP 확인뿐이다. 브리핑이 요구한 보고서 선행 게이트는 `docs/spec/frontend/CODEX-BRIEFING-20260711.md:10-18,99-120`에 정의되어 있다(커밋 `40bdea2d73b06cd4950910209cfe27a6fad70c48`).

증거 표기 규칙:

- `커밋 <hash>`는 해당 경로의 현재 추적 근거다.
- `미커밋 작업 트리`는 HEAD에는 없거나 HEAD 이후 수정된 파일이다. 이 경우 구현 완료 증거로 인정하지 않는다.
- 실행 결과는 2026-07-11, 브랜치 `woonyong/ui-layer-lab`, HEAD `40bdea2d73b06cd4950910209cfe27a6fad70c48`에서 관측했다.

## Q1 게이트 상태

### Q1.1 `npm run check`

실행 명령:

```bash
cd references/ui-layer-lab
npm run check
```

결과: **exit 0, 전체 통과**. 현재 `check` 체인은 `typecheck → lint → check:design → UI catalog check → build` 순서다(`references/ui-layer-lab/package.json:7-18`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).

| 항목 | 실행 결과 | 판정 |
|---|---|---|
| `typecheck` | `tsc -b`, 진단 없음 | 통과 |
| `lint` | product entry와 UI catalog lab 대상 ESLint, 경고·오류 없음 | 통과 |
| `check:design` | `Product design guard passed (22 files checked).` | 통과 |
| UI catalog check | `482 documented previews (445 components + 10 area charts + 27 blocks), commit 21e4ceb.` | 통과 |
| `build` | Vite 6.4.3, 14,345 modules transformed, build 25.47s | 통과, 500kB 초과 chunk 경고 존재 |

주의: 위 결과는 현재 dirty 작업 트리 기준이다. `package.json`의 현재 검사 스크립트와 `scripts/product-design-guard.mjs` 등 일부 기반 파일은 HEAD에 완전히 반영되지 않았으므로 재현 가능한 커밋 게이트로는 아직 인정할 수 없다(`references/ui-layer-lab/package.json:6-18`, `references/ui-layer-lab/scripts/product-design-guard.mjs:15-20,227-245`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).

### Q1.2 `visual-product`

실행 명령:

```bash
cd references/ui-layer-lab
npm run visual-product
```

결과: **exit 0**.

```text
product visual gate passed (desktop + mobile, mocked backend contract)
```

생성된 기존 화면 증거는 다음 두 파일이다.

- `references/ui-layer-lab/output/playwright/product-desktop.png`
- `references/ui-layer-lab/output/playwright/product-mobile.png`

그러나 이 검사는 `/api/auth/session`, `/api/fleet/summary`, `/api/dashboard/rca/timeline`을 Playwright route로 모킹한다(`references/ui-layer-lab/scripts/product-visual-gate.mjs:22-36,42-45`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). 따라서 **기존 Fleet 화면의 회귀 검사일 뿐 Home 또는 `cluster-1` 실데이터 증거가 아니다**. 또한 `visual-product`는 `npm run check`에 포함되지 않은 별도 명령이다(`references/ui-layer-lab/package.json:14-17`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).

## Q2 실측 증거

판정: **`cluster-1` 실데이터 렌더 미확인**. 실데이터 스크린샷은 없다.

### Q2.1 proxy 전달 확인

실행 명령:

```bash
cd references/ui-layer-lab
VITE_BACKEND_ORIGIN=https://k8s.woonyong.org \
  npm run dev -- --host 127.0.0.1 --port 5196 --strictPort

curl --include http://127.0.0.1:5196/api/auth/session
curl --include 'http://127.0.0.1:5196/api/clusters?limit=100'
curl --include \
  'http://127.0.0.1:5196/api/clusters/cluster-1/inventory/resources?resource_type=pod&limit=5'
```

세 요청 모두 proxy를 통해 원격 서버까지 도달했지만 다음 응답으로 끝났다.

```text
HTTP/1.1 401 Unauthorized
{"detail":"authentication required"}
```

`/api` proxy와 `changeOrigin: true`는 존재하지만 `cookieDomainRewrite`는 없다(`references/ui-layer-lab/vite.config.ts:82-91`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). API client는 same-origin URL과 `credentials: "include"`를 사용한다(`references/ui-layer-lab/src/product/api/client.ts:73-96`, 커밋 `8dbcfde9c51a931c6b4d1c6865b6983aa44c0e0d`).

### Q2.2 로그인 세션과 쿠키

판정: **모름**. 인증 자격 증명이 제공되지 않았고, 읽기 전용 확인에서 로그인 mutation을 실행하지 않았다. 401 응답에는 `Set-Cookie`가 없어서 cookie jar가 비어 있었으며, 실제 로그인 뒤 proxy host에서 세션 쿠키가 유지되는지는 확인하지 못했다. backend 로그인은 성공 시 session cookie를 설정한다(`src/domains/identity/router.py:54-64,219-228`, 커밋 `101bc4a2cff3fbd8c88708cebea4ad54dc6857a8`).

### Q2.3 렌더 미확인 사유

1. proxy 실 API가 인증 없이 401을 반환했다.
2. 현재 `ProductApp`은 `FleetPage`만 렌더하고 inventory 기반 Home을 마운트하지 않는다(`references/ui-layer-lab/src/product/ProductApp.tsx:9-32`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).
3. 현재 `useProductData`는 fleet summary와 RCA timeline만 읽는다(`references/ui-layer-lab/src/product/app/useProductData.ts:24-56`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).
4. `listClusters`, `listInventoryResources`, `getInventoryResourceDetail` API 함수는 존재하지만 제품 view에서 소비되지 않는다(`references/ui-layer-lab/src/product/api/clusters.ts:11-22`, `references/ui-layer-lab/src/product/api/inventory.ts:41-103`, 커밋 `8dbcfde9c51a931c6b4d1c6865b6983aa44c0e0d`).

따라서 fake session, synthetic fallback, 가짜 `cluster-1` payload로 이 게이트를 통과시키지 않는다. proxy session이 준비되고 실제 Home orchestration이 연결될 때 다시 실측한다(`docs/spec/frontend/topology-engine-claude.md:41-54,387-393`, 커밋 `40bdea2d73b06cd4950910209cfe27a6fad70c48`).

## Q3 Home 구현 설계

현재 구현 판정: **Home treemap, focus reducer, pending 상태, 완전성 검증, SVG face connector, canonical focus motion은 모두 구현 전**이다. 현재 HEAD가 추적하는 제품 구현은 `src/product/api/**` 계층이며, 작업 트리의 `ProductApp`·Fleet feature도 미추적 상태다(`references/ui-layer-lab/src/product/ProductApp.tsx:1-32`, 미커밋 작업 트리; API 근거 커밋 `8dbcfde9c51a931c6b4d1c6865b6983aa44c0e0d`).

### Q3(a) treemap 레이아웃 함수·알고리즘·tie-break

예정 소유 위치:

```text
references/ui-layer-lab/src/product/features/home/
  model/homeTopologyTypes.ts
  model/homeReducer.ts
  model/projectInventoryFrame.ts
  layout/layoutHomeTreemap.ts
  layout/layoutFocusSankey.ts
  render/HomeTreemap.tsx
  render/FocusConnectors.tsx
  useHomeTopology.ts
```

`features/home`을 사용하는 이유는 디자인 문서가 Home renderer의 위치를 이 경로로 지정하기 때문이다(`docs/spec/frontend/design-system.md:40-51`, 커밋 `ac1905be226336494fb7a162cdb0f27cf40a17ed`). `topology-engine-claude.md:29`의 과거 `features/topology` 표기는 브리핑의 “Topology 탭 금지, Home 단일 surface” 결정과 맞지 않는다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:36-53`, 커밋 `40bdea2d73b06cd4950910209cfe27a6fad70c48`).

알고리즘:

1. 입력은 선택 cluster의 검증된 node·pod 목록이며 모든 pod leaf value를 정확히 `1`로 둔다. CPU·memory는 geometry 입력에서 제외한다(`docs/spec/frontend/topology-engine-claude.md:184-203`, 커밋 `40bdea2d73b06cd4950910209cfe27a6fad70c48`).
2. outer pass는 node frame을 pod child 합으로 배치한다. pod가 0개인 실제 node는 최소 leaf weight 1로 보존한다. inner pass는 frame header/inset을 제외한 영역에서 pod를 `treemapResquarify`로 배치한다. nested outer/inner pass 원칙은 장기 엔진에도 명시돼 있다(`docs/spec/frontend/topology-engine.md:2189-2198`, 커밋 `f04b755d23ae11328e6ad221c3de0b93b56c18dd`).
3. pod tie-break는 `namespace asc → name asc → entityKey asc`, node tie-break는 `name asc → entityKey asc`로 고정한다. 마지막 `entityKey`는 namespace/name 동률에서만 쓰며 v0의 선행 정렬을 바꾸지 않는다(`docs/spec/frontend/topology-engine-claude.md:194-203`, `docs/spec/frontend/topology-engine.md:2189-2195`, 커밋 `40bdea2d7`, `f04b755d2`).
4. `summary.node_name`이 없거나 실제 node와 일치하지 않는 pod는 버리지 않고 `Unscheduled` shelf로 보낸다(`docs/spec/frontend/topology-api-integration.md:430-440`, 커밋 `ac1905be226336494fb7a162cdb0f27cf40a17ed`).
5. `14×14px` minimum과 `2px` gap을 만족하지 못하면 pod를 임의 삭제·팽창시키지 않고 workload projection으로 집계한다. 원 member count 합, pod 전체 count, frame bounds, overlap 0, 거대한 빈 영역 0을 반환 전 검증한다(`docs/spec/frontend/topology-engine-claude.md:194-203,375-381`, `docs/spec/frontend/topology-visual-motion-tokens.md:110-136`, 커밋 `40bdea2d7`).
6. 레이아웃 함수는 DOM을 읽지 않는 순수 함수이고 `ResizeObserver`로 측정한 container-relative CSS px bounds만 받는다(`docs/spec/frontend/topology-engine-claude.md:184-188`, 커밋 `40bdea2d7`).

현재 직접 dependency에 `d3-hierarchy`가 없으므로 구현 시 이를 명시적으로 추가하고 transitive dependency에 기대지 않는다(`references/ui-layer-lab/package.json:20-57`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). dependency 추가는 이 보고서 커밋 뒤 별도 변경으로 수행한다.

### Q3(b) focus 시퀀스·fetch-then-morph·pending

단일 reducer와 effect hook을 `model/homeReducer.ts`, `useHomeTopology.ts`에 둔다. UI component는 fetch·timer·상태 직접 쓰기를 하지 않는다(`docs/spec/frontend/topology-engine-claude.md:324-347`, 커밋 `40bdea2d7`).

예정 시퀀스:

1. click/Enter는 `focus.requested(requestId, sourceEntityKey)` intent만 보낸다. map geometry와 마지막 유효 scene은 유지한다.
2. effect가 `getInventoryResourceDetail(..., signal)`을 호출하고 같은 request에 120ms pending timer를 건다. 현재 helper는 AbortSignal과 zod validation을 이미 제공한다(`references/ui-layer-lab/src/product/api/inventory.ts:83-103`, `references/ui-layer-lab/src/product/api/client.ts:73-120`, 커밋 `8dbcfde9c51a931c6b4d1c6865b6983aa44c0e0d`).
3. 120ms 안에 D5 응답, relation adaptation, focus layout, completeness proof가 모두 끝나지 않으면 source cube에 취소 가능한 pending indicator를 표시한다. transition clock은 아직 시작하지 않는다(`docs/spec/frontend/topology-visual-motion-tokens.md:364-370`, 커밋 `40bdea2d7`).
4. 응답·layout revision·proof가 current request와 정확히 일치할 때만 `focus.ready`를 reducer에 보낸다. 실패, 취소, stale request는 map을 유지하고 scoped error만 표시한다. Esc/retarget/cluster change는 AbortController와 timer를 함께 취소한다.
5. 준비 완료 뒤 `ribbonErase → focusMorph → labelReveal → settle+60ms → ribbonDraw/connectorStagger`를 실행한다. 전환 중 새 inventory frame은 canonical reducer에 적용하되 frozen presentation이 settle한 뒤 최신 revision으로 한 번 retarget한다(`docs/spec/frontend/topology-engine-claude.md:247-269`, `docs/spec/frontend/topology-message-action-schema.md:559-614`, 커밋 `40bdea2d7`, `ac1905be2`).

현재 v0 `TopoMsg`에는 `focus.entered`, `relations.applied/failed`만 있고 request ID, pending, cancel/ready 메시지가 없다(`docs/spec/frontend/topology-engine-claude.md:326-340`, 커밋 `40bdea2d7`). 이 차이는 Q6 결정 전 코드에서 임의 메시지로 우회하지 않는다.

### Q3(c) 완전성 assert 위치

`layoutFocusSankey.ts` 반환 직전 1차 proof를 만들고 검증한다.

- source가 universe에 정확히 1회 존재
- `columnEntityKeys`가 source를 뺀 universe의 exact permutation
- unique, source 미포함, related/unrelated 서로소와 합집합 일치
- related member의 health group exactly-once
- non-empty health group과 connector 1:1
- source face interval gap/overlap 0, 합계 1

기준 등식과 proof 구조는 `docs/spec/frontend/topology-visual-motion-tokens.md:189-206` 및 `docs/spec/frontend/topology-message-action-schema.md:381-402,600-607`에 있다(커밋 `40bdea2d7`, `ac1905be2`).

reducer가 layout commit 직전에 같은 proof를 2차 검증한다. 실패 시 throw로 전체 앱을 죽이지 않고 typed invariant failure를 기록하며 map/마지막 valid scene을 유지하고 morph를 0건으로 만든다. property test는 임의 universe·source·relation 조합에서 `column.length + 1 === U.size`를 강제한다(`docs/spec/frontend/topology-engine-claude.md:158-160,375-386`, 커밋 `40bdea2d7`).

브리핑의 “열 한도 초과 시 나머지 n개 집계 블록”은 현재 exact item-count 등식과 충돌하므로 Q6 결정 전에는 구현하지 않는다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:89-97`, `docs/spec/frontend/topology-visual-motion-tokens.md:186-206`, 커밋 `40bdea2d7`).

### Q3(d) health fill·SVG ribbon token 주입

현재 `tokens.css`는 단일 dark 계열 status color만 있고 canonical five-health fill/stroke pair, light/dark/high-contrast pair, focus face connector channel이 없다(`references/ui-layer-lab/src/product/styles/tokens.css:1-46`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). 따라서 현 상태를 Home token 구현 완료로 보지 않는다.

예정 방식:

1. raw color는 `src/product/styles/tokens.css`에만 theme별 CSS custom property로 정의한다.
2. root theme controller가 `light | dark | high-contrast`를 결정하고, 중앙 resolver가 theme revision마다 root의 `getComputedStyle`을 한 번 읽어 typed `ResolvedTopologyTheme`을 만든다.
3. DOM tile은 health fill/stroke를 타일 전체 면에 적용한다. 좌측 3px strip은 namespace stable color 전용이다(`docs/spec/frontend/topology-visual-motion-tokens.md:54-66,110-136`, `docs/spec/frontend/topology-engine-claude.md:287-310`, 커밋 `40bdea2d7`).
4. SVG `<linearGradient>`의 stop은 renderer가 CSS를 다시 조회하지 않고 주입받은 resolved source/target health token을 `stopColor` attribute로 사용한다. connector ID는 stable connector key에서 만든다. observed palette, raw hex, moving particle을 사용하지 않는다(`docs/spec/frontend/topology-visual-motion-tokens.md:242-253`, 커밋 `40bdea2d7`).
5. Canvas/SVG/WebGL에 theme object를 주입하는 책임은 Product root가 소유한다(`docs/spec/frontend/design-system.md:151-159`, 커밋 `ac1905be226336494fb7a162cdb0f27cf40a17ed`).

### Q3(e) motion token 1:1 대응

예정 `references/ui-layer-lab/src/product/shared/motion.ts`의 public key는 아래 이름과 철자를 그대로 사용한다. generic `morph`, `stagger`, component-local duration으로 대체하지 않는다(`docs/spec/frontend/design-system.md:40-51`, 커밋 `ac1905be2`).

| canonical token | 값/규칙 |
|---|---|
| `ribbonErase` | 150ms |
| `focusMorph` | 720ms; map x/block/entityKey 순 24ms/cube, 누적 cap 300ms |
| `labelReveal` | cube-local progress 80% |
| `ribbonDraw` | 마지막 cube settle+60ms 뒤 560ms |
| `connectorStagger` | 110ms/non-empty health connector |
| `focusMorphEase` | `cubic-bezier(0.3,0.7,0,1)` |
| `ribbonDrawEase` | `cubic-bezier(0.33,1,0.68,1)` |

기준 표는 `docs/spec/frontend/topology-visual-motion-tokens.md:346-370`이고 Home sequence alias는 `docs/spec/frontend/topology-engine-claude.md:235-258`이다(커밋 `40bdea2d73b06cd4950910209cfe27a6fad70c48`). 현재 제품 코드에는 이 token key가 없고 `--duration-fast`, `--duration-base`, `--ease-standard`만 있으므로 구현되지 않은 상태다(`references/ui-layer-lab/src/product/styles/tokens.css:25-27`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).

## Q4 IA 계획

### Q4.1 현재 상태와 교체 대상

현재 entry는 pathname이 `/product`인지 수동 분기할 뿐 제품 내부 router가 아니며, `ProductApp`은 FleetPage를 직접 렌더한다(`references/ui-layer-lab/src/main.tsx:4-9`, `references/ui-layer-lab/src/product/ProductApp.tsx:9-32`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). 현재 작업 트리 화면은 브리핑의 cluster-first Home이 아니므로 완료 화면으로 유지하지 않는다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:36-53`, 커밋 `40bdea2d7`).

### Q4.2 router·shell·sidebar

예정 구조:

```text
src/product/app/
  ProductRouter.tsx
  ProductShell.tsx
  routeRegistry.ts
src/product/features/home/
  HomePage.tsx
```

- canonical route는 `/product` Home이다.
- 후속 route는 `/product/resources`, `/product/issues`, `/product/timeline`, `/product/gitops`, `/product/settings`다.
- `/product/topology`, `/product/traffic`, Cost, Checks, Image FS route/menu는 만들지 않는다.
- Helm은 BE-5 조회 capability가 실제로 연결되는 커밋에서 route와 menu를 함께 추가한다. 그 전에는 disabled item도 만들지 않는다.
- Home gate 기간에는 Home만 제품 surface로 둔다. 후속 메뉴는 실제 API-backed 화면이 추가되는 시점에 route와 원자적으로 추가한다. placeholder screen을 선등록하지 않는다.

이 목록은 브리핑 IA와 Home 차단 게이트를 그대로 적용한다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:36-53`, `docs/spec/frontend/topology-engine-claude.md:404-412`, 커밋 `40bdea2d7`). page는 feature를 조합하고 transport는 `product/api`만 소유한다(`references/ui-layer-lab/AGENTS.md:25-40,54-60`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).

### Q4.3 cluster-first Home 흐름

1. 공통 session gate를 통과한 뒤 `GET /api/clusters`를 selector의 유일한 identity source로 사용한다. fleet summary를 selector나 entity universe에 섞지 않는다(`docs/spec/frontend/topology-api-integration.md:234-286`, 커밋 `ac1905be2`; 현재 함수 `references/ui-layer-lab/src/product/api/clusters.ts:11-22`, 커밋 `8dbcfde9c`).
2. 응답의 실제 `cluster_id`와 `name`만 option으로 만든다. runtime에서 `cluster-1`, `kubernetes-ops`를 하드코딩하지 않고 `cluster-1`은 실측 QA 대상으로만 사용한다(`docs/spec/frontend/topology-api-integration.md:241-263,309-318`, 커밋 `ac1905be2`).
3. online cluster 선택 시 D1-D4를 같은 request generation으로 요청하고 검증된 bundle만 commit한다. 30초 polling, background last-valid-frame, visibility pause, cluster switch abort를 적용한다(`docs/spec/frontend/topology-engine-claude.md:41-54,116-121`, 커밋 `40bdea2d7`).
4. cluster가 없거나 admin이 “클러스터 추가”를 선택하면 새 route가 아니라 Home 내부 registration state로 전환한다.
5. registration flow는 `provider discovery/catalog → selection/validation → preflight → register → bootstrap 결과 1회 표시 → connection-status polling → cluster list refresh → 실제 응답 cluster 선택` 순이다. backend route는 `/api/providers/catalog`, `/api/providers/cluster-discovery`, `/api/providers/validate`, `/api/targets/preflight`, `/api/targets`, `/api/clusters/{id}/connection-status`다(`src/packages/contracts/gateway/routes.py:72-105`, 커밋 `f224a5968e682c115509dbed3abc326a62657143`; `src/domains/providers/router.py:28-60`, 커밋 `6dc85a30f3d905ecf5c48c7883c09b53e1b7625a`; `src/domains/target/router.py:758-903,996-1027`, 커밋 `f224a5968e682c115509dbed3abc326a62657143`).
6. provider별 component/route 분기는 만들지 않고 discovery response의 flow/status/unavailable reason을 데이터로 렌더한다(`src/packages/contracts/gateway/responses.py:804-856`, 커밋 `9fe235e7b03032af7d7ac3b14d05ab0f17306b02`).
7. 등록 API는 admin session을 요구하므로 session role에 `service_admin`이 없으면 등록 CTA를 노출하지 않고 읽기 상태만 유지한다(`references/ui-layer-lab/src/product/api/schemas.ts:6-11`, 커밋 `8dbcfde9c`; `src/domains/identity/dependencies.py:91-101`, 커밋 `63bde82a34742fd1604ba80728a965ab3eca8eb0`).
8. `agent_token`, manifest, bootstrap command는 등록 응답에서 한 번만 보여 주고 저장소·URL·로그에 보존하지 않는다(`src/packages/contracts/gateway/responses.py:553-569`, 커밋 `9fe235e7b03032af7d7ac3b14d05ab0f17306b02`).
9. connection-status가 online이고 새 cluster가 `listClusters`에 나타난 뒤에만 treemap으로 전환한다. pending/stale/expired 상태를 임의 성공으로 바꾸지 않는다(`src/domains/target/router.py:118-135,676-693`, 커밋 `f224a5968e682c115509dbed3abc326a62657143`).

현재 `product/api/index.ts`에는 onboarding 함수가 없으므로 화면보다 zod schema와 endpoint 함수를 먼저 추가해야 한다(`references/ui-layer-lab/src/product/api/index.ts:1-58`, 커밋 `8dbcfde9c`).

## Q5 향후 2주 계획

계획 기간은 2026-07-13~2026-07-24, 10영업일이다. **Home 완료 게이트까지가 유일한 확정 범위**이며 Resources를 포함한 후속 화면은 이 기간에 시작하지 않는다. Home gate 통과 뒤에도 검토자의 별도 coordination 지시가 있어야 다음 화면으로 이동한다(`docs/spec/frontend/topology-engine-claude.md:404-412`, `docs/spec/frontend/CODEX-BRIEFING-20260711.md:117-120`, 커밋 `40bdea2d7`).

| 예상일 | 단계·산출물 | 소비 API | 완료 게이트 |
|---|---|---|---|
| 07-13 | H0 결정·기반: Q6 해소 반영, stale 작업 트리 분리, route registry/shell 경계, Home reducer/message 보강, test runner | session, `GET /api/clusters` | 기준 문서 동기화, 새 dependency 명시, `npm run check` |
| 07-14~15 | H1 cluster-first map: selector, node/pod adapter, equal-area nested treemap, loading/empty/forbidden/error/partial/background-refresh | D1 pod, D2 node | same-generation node+pod commit, 14×14/2px, count/overlap/blank/property tests |
| 07-16 | H2 registration: admin add/empty flow, preflight, one-time bootstrap result, connection polling | provider catalog/discovery/validate, targets preflight/register, connection-status | 401/403 first-class, token 비저장, synthetic 0건, connected 후 list refresh |
| 07-17~20 | H3 focus data/engine: D3/D4 catalog, D5 fetch-then-morph, pending, full logical column, health grouping, face connector, keyboard/reduced motion | D3 service, D4 workload, D5 resource-detail | Q6 relation/universe 결정, complete proof, group↔connector 1:1, fake-clock token sequence |
| 07-21~22 | H4 visual/theme/performance: three themes, health fill, namespace strip, SVG token injection, 390/768/1024/1440, keyboard/reduced-motion | 새 API 없음 | contrast/design guard, visual map/focus 중간 프레임, frame budget 검사 |
| 07-23 | H5 실측: proxy cookie/session, 실제 selector의 `cluster-1`, light/dark map/focus screenshots | Home API 전부 | 실제 API, fake label/DEMO DATA 0건, proxy 401 loop 0건 |
| 07-24 | H6 종결: 전체 회귀, 문서·API handoff, blocked capability 기록 | 새 API 없음 | `npm run check` + `npm run visual-product` 별도 통과, Home gate 4단계 재검증 |

각 commit 전에 `npm run check`를 실행한다. Home milestone에서는 `npm run visual-product`도 별도로 실행한다. 현재 check가 visual gate를 포함하지 않는 사실은 Q1에서 확인했다(`references/ui-layer-lab/package.json:7-18`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측). 실제 cluster가 1000 resource 한도를 넘거나 D5 관계가 불완전하면 fake·클라이언트 추론으로 통과시키지 않고 blocked로 보고한다(`docs/spec/frontend/topology-api-integration.md:518-535`, 커밋 `ac1905be2`).

## Q6 충돌·리스크·결정 요청

### Q6.1 브리핑 기준으로 해소한 충돌

1. **Fleet-first vs cluster-first Home**: 미추적 `PRODUCT_FRONTEND.md`와 `PRODUCT_PLAN.md`는 fleet summary 첫 화면을 규정하고 현재 작업 트리도 FleetPage를 직접 렌더한다(`references/ui-layer-lab/PRODUCT_FRONTEND.md:13-50`, `references/ui-layer-lab/PRODUCT_PLAN.md:10-23,75-100`, `references/ui-layer-lab/src/product/ProductApp.tsx:9-32`, 모두 미커밋 작업 트리). 브리핑 기준에 따라 이를 Home 구현 완료 근거로 보지 않고 cluster-first Home으로 교체한다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:10-18,36-53`, 커밋 `40bdea2d7`).
2. **D1-D5 소비 시점**: API 가이드는 D3/D4/D5를 Resources 후순위로 적었지만 Home focus에는 D1-D5가 모두 필요하다(`docs/spec/frontend/topology-api-integration.md:288-337`, 커밋 `ac1905be2`; `docs/spec/frontend/topology-engine-claude.md:41-49`, 커밋 `40bdea2d7`). Home이 D3/D4 relation catalog와 D5 activation fetch를 먼저 소비하고 Resources가 같은 API 함수를 나중에 재사용한다.
3. **feature 경로**: `features/topology` 과거 표기보다 `features/home` 디자인 소유권과 Topology 탭 금지가 우선한다(`docs/spec/frontend/topology-engine-claude.md:29,134-160`, `docs/spec/frontend/design-system.md:40-51`, 커밋 `40bdea2d7`, `ac1905be2`).
4. **focus source activation**: 장기 헌법은 source 재클릭 시 inspector를 열지만 v0은 focus 유지와 detail page/drawer 금지를 명시한다(`docs/spec/frontend/topology-engine.md:2408-2428`, 커밋 `f04b755d2`; `docs/spec/frontend/topology-engine-claude.md:354-363`, 커밋 `40bdea2d7`). v0에서는 inspector를 열지 않는다.
5. **동적 cluster ID**: v0 message union의 두 literal ID는 실제 selector 계약과 충돌한다(`docs/spec/frontend/topology-engine-claude.md:326-345`, 커밋 `40bdea2d7`; `docs/spec/frontend/topology-api-integration.md:241-263`, 커밋 `ac1905be2`). `cluster.selected.clusterId`는 string으로 바꾸고 현재 `listClusters` membership을 검증한다. `cluster-1`은 QA fixture가 아니라 실제 검증 target으로만 사용한다.

### Q6.2 구현 전 결정이 필요한 항목

1. **완전성 집계 블록**
   - 결정 요청: 열 한도 초과 시 `나머지 {n}개`를 exact completeness와 어떻게 양립시킬까? / 선택지 A) logical right collection은 전량 유지하고 virtualization만 사용, 집계 블록 없음 / 선택지 B) 집계 block의 `logicalMemberCount` 합으로 invariant를 개정 / 자체 권고: A. 현재 `right.length + 1 = U.size`와 object identity를 그대로 보존한다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:89-97`, `docs/spec/frontend/topology-visual-motion-tokens.md:186-206`, 커밋 `40bdea2d7`).
2. **Pod source 역관계**
   - 결정 요청: Pod D5 역관계를 어떻게 제공할까? / 선택지 A) backend가 pod detail에 `related.services`, `related.workloads`, 필요 시 node를 계산 / 선택지 B) frontend가 D3/D4 selector·owner를 역색인 / 선택지 C) pod focus에는 relation 없음 / 자체 권고: A. 실제 repository는 node/service/workload→pods만 계산하고 pod source는 빈 related를 반환하므로 클라이언트 추론 금지와 fetch-then-morph를 함께 지키는 유일한 방식이다(`src/domains/inventory/repository.py:367-435`, 커밋 `b9618f1842f25741cf6664ad85d46e83f0eff77e`).
3. **focus universe**
   - 결정 요청: `U`에 service/workload를 포함할까? / 선택지 A) `U=node header+pod tile`, service/workload는 별도 relation actor collection / 선택지 B) service/workload도 base map item / 선택지 C) focus에서만 새 item 생성 / 자체 권고: A. map의 object identity와 `열+1=map` 등식을 보존하고 외부 actor count는 별도 invariant로 명시한다(`docs/spec/frontend/topology-engine-claude.md:58-65,134-160,205-225`, 커밋 `40bdea2d7`).
4. **Pod stable identity**
   - 결정 요청: `uid=null` pod를 어떻게 처리할까? / 선택지 A) Home pod parser가 uid non-null을 refine하고 위반 payload를 차단 / 선택지 B) `inventory_key` fallback / 선택지 C) backend pod DTO가 uid required를 보장 / 자체 권고: 단기 A, 근본 C. `inventory_key`는 workspace/cluster/type/ns/kind/name hash라 재생성을 구분하지 못한다(`docs/spec/frontend/topology-engine-claude.md:58-71`, 커밋 `40bdea2d7`; `references/ui-layer-lab/src/product/api/inventory-schemas.ts:11-34`, 커밋 `8dbcfde9c`; `src/domains/inventory/repository.py:53-63`, 커밋 `b9618f1842f25741cf6664ad85d46e83f0eff77e`).
5. **inventory `raw` 처리**
   - 결정 요청: 브리핑의 `summary/raw passthrough`에서 browser `raw`를 허용할까? / 선택지 A) optional raw record를 frontend schema에 추가 / 선택지 B) browser contract대로 raw를 계속 금지하고 summary만 open record로 유지 / 자체 권고: B. backend는 raw Kubernetes object를 명시적으로 제거하고 detail response도 raw 없이 제공한다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:89-97`, 커밋 `40bdea2d7`; `src/domains/inventory/router.py:104-108,137-194`, 커밋 `b9618f1842f25741cf6664ad85d46e83f0eff77e`; `src/packages/contracts/gateway/responses.py:358-396`, 커밋 `9fe235e7b`).
6. **focus request protocol**
   - 결정 요청: fetch/pending/ready/cancel을 v0 `TopoMsg`에 추가할까? / 선택지 A) `focus.requested|pending|ready|failed|cancelled`을 requestId/revision과 함께 추가 / 선택지 B) component-local state로 처리 / 자체 권고: A. 단일 reducer 원칙과 stale effect 폐기를 유지한다(`docs/spec/frontend/topology-engine-claude.md:326-347`, `docs/spec/frontend/topology-message-action-schema.md:559-609`, 커밋 `40bdea2d7`, `ac1905be2`).
7. **client stale 의미**
   - 결정 요청: 90초 초과 상태를 무엇으로 표기할까? / 선택지 A) `clientRefreshDelayed`로 표시하고 backend freshness와 분리 / 선택지 B) refresh 실패 때만 stale / 선택지 C) backend freshness 전에는 stale 없음 / 자체 권고: A. Home 90초 규칙을 지키되 서버 stale로 오인시키지 않는다(`docs/spec/frontend/topology-engine-claude.md:162-176`, 커밋 `40bdea2d7`; `docs/spec/frontend/topology-api-integration.md:443-457,503-516`, 커밋 `ac1905be2`).
8. **제품 router**
   - 결정 요청: 제품 router를 무엇으로 표준화할까? / 선택지 A) `react-router-dom` nested shell / 선택지 B) 자체 History API codec / 자체 권고: A. route registry, query focus, back/Esc, focus restoration을 검증된 경계에 모은다. 현재 package에는 router dependency가 없다(`references/ui-layer-lab/package.json:20-57`, 미커밋 작업 트리; `references/ui-layer-lab/src/main.tsx:4-9`, 미커밋 작업 트리, HEAD `40bdea2d7` 관측).
9. **unit/property/motion test runner**
   - 결정 요청: 순수 엔진 test runner는 무엇으로 할까? / 선택지 A) Vitest+fast-check / 선택지 B) Vitest+seeded deterministic property loop / 선택지 C) Playwright만 사용 / 자체 권고: B. dependency를 줄이면서 reducer fake timer와 실패 seed 재현성을 확보한다. 현재 test script는 없지만 spec은 property/reducer/fake-clock을 완료 gate로 요구한다(`references/ui-layer-lab/package.json:6-18`, 미커밋 작업 트리; `docs/spec/frontend/topology-engine-claude.md:375-390`, 커밋 `40bdea2d7`).
10. **메뉴 capability 권위**
    - 결정 요청: v0 menu 노출의 권위는 무엇인가? / 선택지 A) 구현 완료+실 API 연결을 담은 frontend release registry / 선택지 B) 신규 backend UI capability catalog / 선택지 C) endpoint 404 probe / 자체 권고: Home 기간 A, 장기 B, C 금지. 현재 session은 roles만 제공하고 global menu capability endpoint는 확인되지 않아 **모름**이다(`references/ui-layer-lab/src/product/api/schemas.ts:6-11`, 커밋 `8dbcfde9c`; 장기 semantic 제안 `docs/spec/frontend/product-data-contract.md:2493-2505`, 커밋 `ac1905be2`).
11. **non-online cluster selector**
    - 결정 요청: 등록됐지만 online이 아닌 cluster를 selector에서 어떻게 다룰까? / 선택지 A) 모든 실제 cluster를 유지하고 선택 시 connection/install resume surface / 선택지 B) online만 노출 / 선택지 C) pending은 wizard 내부에만 유지 / 자체 권고: A. 서버 identity를 숨기지 않고 pending/stale/expired를 정직하게 표시한다(`src/packages/contracts/gateway/responses.py:584-617`, 커밋 `9fe235e7b`; `src/domains/target/router.py:118-135,676-693`, 커밋 `f224a5968e682c115509dbed3abc326a62657143`).
12. **cluster URL 보존**
    - 결정 요청: 선택 cluster를 URL에 저장할까? / 선택지 A) v0은 session-local이고 URL에는 `?focus=`만 기록 / 선택지 B) `?cluster=`를 추가하고 inaccessible ID를 명시 오류로 표시 / 선택지 C) 잘못된 ID를 첫 cluster로 자동 교정 / 자체 권고: B, C 금지. 다만 승인 전에는 기존 v0 계약 A를 유지한다(`docs/spec/frontend/topology-engine-claude.md:342-347`, 커밋 `40bdea2d7`; 접근 불가 selector 원칙 `docs/spec/frontend/product-data-contract.md:2485-2491`, 커밋 `ac1905be2`).

### Q6.3 결정 없이 관리할 리스크·차단

1. **proxy cookie**: `cookieDomainRewrite`가 없어 브리핑 게이트를 충족하지 않는다. 보고서 뒤 config를 보강하고 실제 session으로 검증하며, 401 loop에는 우회·fake를 넣지 않는다(`references/ui-layer-lab/vite.config.ts:82-91`, 미커밋 작업 트리; `docs/spec/frontend/CODEX-BRIEFING-20260711.md:95-97`, 커밋 `40bdea2d7`).
2. **1000개 초과**: inventory endpoint에는 cursor/`has_more`/`total`이 없고 limit 최대가 1000이라 그 이상 cluster에서 완전성을 증명할 수 없다. 성공으로 표시하지 않고 backend gap으로 blocked 처리한다(`src/domains/inventory/router.py:111-133`, 커밋 `b9618f1842f25741cf6664ad85d46e83f0eff77e`; `docs/spec/frontend/topology-api-integration.md:518-535`, 커밋 `ac1905be2`).
3. **D5 관계 잘림**: frontend 기본 `relatedLimit=100`, backend 최대 1000이며 truncation metadata가 없다. Home focus는 최소 1000을 명시하지만 1000 초과는 blocked다(`references/ui-layer-lab/src/product/api/inventory.ts:36-39,88-102`, 커밋 `8dbcfde9c`; `src/domains/inventory/router.py:141-172`, 커밋 `b9618f1842f25741cf6664ad85d46e83f0eff77e`).
4. **비원자 snapshot**: node/pod/D3/D4 사이 shared revision이 없다. 같은 refresh generation만 보장하고 “동일 시점 topology”라고 표시하지 않는다(`docs/spec/frontend/topology-api-integration.md:486-516`, 커밋 `ac1905be2`).
5. **dirty 작업 트리**: 현재 product shell, styles, 검사 스크립트가 미추적 또는 수정 상태다. 보고서 커밋에는 이 파일을 섞지 않고, 이후 소유권과 변경 출처를 확인해 기능별로 분리한다(HEAD `40bdea2d7`에서 `git status --short` 관측).
6. **visual gate 의미**: 현 `visual-product`는 mocked Fleet 화면이므로 Home 실 API gate와 분리한다. Home 구현 뒤 map/focus, light/dark, 390/1024/1440, reduced motion, 중간 frame을 추가하고 실제 `cluster-1` 증거를 별도로 남긴다(`references/ui-layer-lab/scripts/product-visual-gate.mjs:22-45`, 미커밋 작업 트리; `docs/spec/frontend/topology-engine-claude.md:375-393`, 커밋 `40bdea2d7`).

## 제출 결론

- 보고서 작성 시점에 Home 구현 완료 주장은 **0건**이다.
- 현재 통과한 `npm run check`와 mocked `visual-product`는 작업 트리 품질 신호지만 실 Home acceptance는 아니다.
- 새 화면 구현은 이 보고서 커밋 전까지 시작하지 않았다.
- Q6의 relation universe·Pod 역관계·completeness·protocol 결정 없이는 focus 구현을 시작하지 않는다.
- 다음 단계는 검토자가 `docs/spec/frontend/`에 추가할 상세 지시와 Q6 결정을 반영하는 것이다(`docs/spec/frontend/CODEX-BRIEFING-20260711.md:117-120`, 커밋 `40bdea2d7`).
