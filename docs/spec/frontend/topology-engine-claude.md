---
title: Topology Engine — Home Treemap Interaction Contract
status: planned-interaction-contract
owner: frontend-platform
constitution: docs/spec/frontend/topology-engine.md (장기 헌법, 의미론 상속)
backend_basis: src/domains/inventory, src/domains/dashboard/fleet_router.py, src/packages/contracts/realtime.py
product_basis: references/ui-layer-lab/src/product (AGENTS.md, PRODUCT_FRONTEND.md 준수)
last_verified: 2026-07-11
---

# Topology Engine — Home Treemap Interaction Contract

## 0. 문서의 위치와 규율

이 문서는 Home treemap의 interaction model과 전환 sequence를 정리한 구현 예정 계약이다. 색·치수·density·z-order 및 duration/easing literal은 `topology-visual-motion-tokens.md`에서 함께 추적한다. domain 의미·상태의 장기 계획은 `topology-engine.md`, protocol은 `topology-message-action-schema.md`, 제품 API 소비 의미는 `product-data-contract.md`를 함께 본다.

현재 repo의 실제 코드와 통과한 테스트가 구현 완료 여부의 source of truth다. 이 문서는 구현할 interaction 순서와 불변조건을 작업 기준으로 정리한다. 본문의 시각·motion 수치는 token 이름의 설명용 alias이며 값이 다르면 실제 코드/테스트와 `topology-visual-motion-tokens.md`를 함께 동기화한다.

### 0.1 v0 결정 기록

| # | 헌법의 문제 | v0의 해소 |
|---|---|---|
| M1 | 모션·토큰·payload를 미존재 정책으로 위임 | interaction/sequence는 이 문서 §4, numeric visual/motion token은 `topology-visual-motion-tokens.md`, payload는 §6과 message schema로 소유자를 분리 |
| M2 | Container가 `EntityRef` union에 표현 불가 | v0 Home treemap 계층은 Pod까지. Container는 Home 완료 이후 Resources pod 행의 inline detail에만 표시하며 treemap entity가 아니다(§1.4) |
| M3 | 제스처 연속 보간 × 비동기 레이아웃 계약 부재 | v0은 **드래그 제스처를 제공하지 않는다**. map cube activation의 이산 focus 전환만 §4.2로 확정하며 fold drag는 v1 이후다 |
| M4 | decimal string 나눗셈 rounding 미정의 | v0 metric은 pod 수·재시작 수(정수)와 서버 계산 pct(이미 반올림된 float)만 사용. 클라이언트 나눗셈은 레이아웃 비율 계산뿐이며 IEEE754 double로 충분(면적 오차는 픽셀 반올림 이하). decimal wire 정밀도는 cost 도입 시점(v2)의 문제 |
| M5 | 외부 기준 저장소 익명 | 이 문서는 외부 저장소를 인용하지 않는다. 근거는 이 repo의 백엔드 코드 경로만 사용 |
| M6 | synthetic adapter가 과거 실패 패턴 재도입 | v0은 **synthetic/replay adapter를 만들지 않는다**. 실 API만 사용하고, 테스트 데이터는 레이아웃 순수 함수의 단위 테스트 입력으로만 존재(제품 번들 밖 `tests/`) |
| M7 | 10-패키지 모노레포 vs 현 단일 앱 | v0은 `src/product/features/topology/` 한 feature로 구현하고 AGENTS.md 의존 규칙을 그대로 따른다. 패키지 분리는 두 번째 소비자가 생길 때 |
| M8 | query session·resume stream 등 서버 신규 서브시스템 필요 | Home v0은 기존 inventory REST D1~D5만 사용한다. 신규 backend/stream subsystem을 요구하지 않는다 |

### 0.2 v0 범위 제외 목록 (명시적)

query planner/AST, CRD discovery, composite metric, cost/flow(observed traffic), WebGL/Canvas,
layout worker, LOD expansion token, RBAC universe 계산, resumable stream, multi-cluster fleet
treemap, 드래그 제스처, saved view. fold drag는 v1 이후이며 v0 event/listener/control을 만들지
않는다. Home 완료 gate 전에는 Resources 인라인 상세를 포함한 다른 화면 구현을 시작하지 않는다.

## 1. 데이터 현실 계약

Home v0이 소비하는 API는 아래가 전부다. 이 목록 밖 호출과 synthetic/replay gateway는 게이트 위반이다.

| # | API | 용도 | 폴링 |
|---|---|---|---|
| D1 | `GET /api/clusters/{id}/inventory/resources?resource_type=pod` | pod 목록: uid, ns, name, phase, health, restart_total, cpu_mcores, mem_mib, summary.node_name, summary.owner_kind/owner_name, containers | 30s |
| D2 | `GET /api/clusters/{id}/inventory/resources?resource_type=node` | node 목록: name, ready, health, summary(cpu/mem ratio, pod_count) | 30s |
| D3 | `GET /api/clusters/{id}/inventory/services` | service 목록: ns, name, type, summary.selector | 30s |
| D4 | `GET /api/clusters/{id}/inventory/workloads` | workload 목록: kind, ns, name, desired/ready, selector | 30s |
| D5 | `GET /api/clusters/{id}/inventory/resource-detail` | 선택 entity의 서버 계산 1-hop 관계(`related.pods`)와 events | 선택 시 |

모든 응답은 `product/api` zod strictObject로 검증한다(기존 `client.ts` 경로). 검증 실패는
`invalid-payload`이며 화면은 마지막 유효 scene + error 배지를 유지한다.

등록 클러스터 식별자는 `kubernetes-ops`, `cluster-1`만 사용하며 예시용 가짜 클러스터 이름을 만들지 않는다. local backend가 직접 닿지 않을 때만 Vite `/api` proxy를 `https://k8s.woonyong.org/api`에 연결한다. proxy로도 실 API가 검증되지 않으면 synthetic data로 대체하지 않고 Home 구현을 blocked로 보고한다.

### 1.1 Entity identity (헌법 §1.3의 v0 적용)

```ts
type TopoEntity =
  | { entityKey: `pod:${string}`;      kind: "pod";      uid: string; namespace: string; name: string; nodeName: string | null }
  | { entityKey: `node:${string}`;     kind: "node";     name: string }
  | { entityKey: `service:${string}`;  kind: "service";  namespace: string; name: string }
  | { entityKey: `workload:${string}`; kind: "workload"; workloadKind: string; namespace: string; name: string }
  | { entityKey: `group:${string}`;    kind: "podgroup"; workloadKey: string; memberCount: number }
```

- pod: `pod:{clusterId}/{uid}` — 백엔드가 uid를 제공하는 유일한 kind이므로 헌법 규칙 그대로.
- node/service/workload: 백엔드 inventory가 uid를 노출하지 않으므로 v0은
  `{kind}:{clusterId}/{ns}/{name}`을 사용한다. **알려진 한계**: 동명 재생성을 같은 entity로
  취급한다(enter/exit 모션 오판 가능). 이 한계는 §1.6 BE-2로 해소하며, 그때까지 문서화된
  결함으로 유지한다 — 조용한 우회를 만들지 않는다.
- `podgroup`은 헌법 §4.1의 projection이다. 표기는 항상 `Pods {n} · {g}개 그룹`이며 n+g 합산
  표시는 금지.

### 1.2 Relation (헌법 §4.2·§4.3의 v0 부분집합)

```ts
type TopoRelation = {
  relationKey: string   // `${plane}:${type}:${sourceKey}->${targetKey}` 그대로 (v0은 hash 불필요)
  plane: "placement" | "network-configured" | "ownership"
  relationType: "scheduled-on" | "selects" | "owns"
  source: string        // entityKey — canonical 방향 고정 (헌법 §4.3)
  target: string
  evidence: "server-related" | "owner-ref"
}
```

관계의 유일한 원천(클라이언트 추론 전면 금지):

| relation | 원천 | 비고 |
|---|---|---|
| pod →(scheduled-on)→ node | D1의 `summary.node_name` | node_name null이면 `Unscheduled` shelf |
| service →(selects)→ pod | D5 `related.pods` (서버 selector 매칭) | 표시는 **configured truth** — 점선. EndpointSlice effective는 BE-3 이후 실선 추가 |
| workload →(owns)→ pod | D5 `related.pods` (서버 selector/owner 매칭) | pod의 `owner_kind`가 ReplicaSet이면 edge 중간 라벨로 RS 이름 표시. RS 노드 열은 만들지 않음(리소스 미수집 — 상태 없는 노드 금지) |

역방향은 renderer가 계산한다. 오른쪽 rail이 `Pod ← Deployment`로 보여도 저장은 owner→dependent.

### 1.3 Metric과 면적 (헌법 §10의 v0 적용)

- v0 면적 metric은 **균등(=1/leaf)** 하나다. 근거: 백엔드에 request(할당량)가 없고(§1.6 BE-1),
  실측 사용량을 면적에 쓰면 재배치 불안정(헌법과 동일 판단). 사용량(cpu_mcores/mem_mib)은
  타일 내부 하단 1.5px 막대 2개로 표시하되 **값이 null이면 막대 자체를 그리지 않는다**(0으로
  그리지 않음).
- BE-1 완료 여부와 무관하게 Home v0 면적은 균등 1로 고정한다. CPU/memory request를 받더라도
  Home 면적 토글을 추가하지 않으며 usage는 내부 bar와 tooltip에만 표시한다.
- percentage는 타일 내부 금지(헌법 상속). node frame 헤더의 `CPU 42.1%`는 허용하되 서버가
  이미 percent로 준 값만 그대로 표기하고 클라이언트 ×100 변환을 하지 않는다(단위 규약).

### 1.4 Container

Container는 v0 Home treemap entity가 아니다. D1 `containers` 배열의 상세 표시는 Home 완료
이후 Resources 목록의 해당 pod 행을 제자리에서 펼치는 inline detail이 소유한다. 별도 상세
route나 drawer를 만들지 않는다. treemap 4단계(Cluster→Node→Pod→Container)는 헌법 개정으로
Container arm이 추가된 뒤 진행한다.

### 1.5 REST 갱신 규칙

1. D1~D4는 같은 cluster selection과 request generation으로 묶고, 늦게 끝난 이전 generation이 최신 frame을 덮지 못하게 한다.
2. 30초 polling 응답은 전부 zod 검증을 통과한 뒤에만 committed frame에 합친다. 일부 실패는 마지막 유효 scene을 유지하고 partial/error 상태를 별도로 표시한다.
3. `document.visibilityState !== 'visible'`이면 polling을 중단하고 복귀 시 inventory를 즉시 재조회한다.
4. 전환 중에도 transport/reducer 적용을 지연하지 않는다. transition이 캡처한 geometry를 settle한 뒤 최신 frame을 한 번 coalesce해 retarget한다(§4.2).

### 1.6 백엔드 요청 (v0 병행, v0 완성의 전제 아님)

- **BE-1**: pod spec의 cpu/memory request 수집(`cluster-agent` pod 수집기 +
  `kubernetes_snapshot._pod_resource` 필드 추가). Home v0 면적은 완료 여부와 무관하게 균등 1을 유지하며 면적 토글은 만들지 않는다.
- **BE-2**: inventory node/service/workload에 `uid` 노출. → §1.1 한계 해소.
- **BE-3**: EndpointSlice의 service label·targetRef를 관계로 노출. → effective truth 실선.
- **BE-4**: `GET /dashboard/rca/incidents/{id}`의 correlation_id 폴백 조회. → pod 타일
  인시던트 배지에서 상세 링크 활성화(그 전까지 해당 배지를 렌더하지 않음).

## 2. 화면과 상태 기계

### 2.1 Home IA와 모드 (확정)

- 별도 `Topology` 탭·메뉴·route는 만들지 않는다. 기존 항목이 있으면 제거한다.
- **Home이 treemap의 유일한 제품 surface**다. Home은 실제 cluster selector(`kubernetes-ops`,
  `cluster-1`)와 선택 클러스터의 node frame 안 pod tile treemap을 중심 화면으로 가진다.
- sidebar는 backend capability가 실존하는 `Home`, `Resources`, `Issues`, `Timeline`, `GitOps`,
  `Settings`만 둔다. `Cost`, `Helm`, `Live Traffic`, `Checks`는 disabled 항목도 만들지 않는다.
- Home 내부 presentation은 두 개뿐이다(URL `?focus={entityKey}` 유무로 결정):
  - **map**: placement treemap이 캔버스 전폭을 채운다(§3.1).
  - **focus**: 큐브 클릭으로 진입. 클릭한 큐브가 왼쪽 소스 큐브가 되고, **맵의 나머지
    전체 항목**이 오른쪽 세로 1열로 재배치되며, 연관 항목은 상태(색)별 연결체로 뭉쳐
    소스와 리본으로 연결된다(§3.2). `← 전체 맵` 버튼과 Esc로 복귀.
- 상세는 Home의 별도 page/drawer가 아니다. Home 완료 이후 Resources 목록에서 선택한 행이
  제자리 inline expansion으로 펼쳐지는 모델만 허용한다.
- 초기 설계의 세그먼트 뷰(traffic/delivery/butterfly)는 focus 모드로 **대체·삭제**한다.
  fold drag gesture는 v1 이후이며 v0 listener/state/control이 없다(§0.1 M3).

**완전성 불변조건(누락 금지)**: focus 모드에서 `오른쪽 열 항목 수 + 1(소스) = map 항목 수`
가 항상 성립한다. 연관 없는 항목도 열 하단에 반드시 나타난다(dim 처리, 화면에서 소멸
금지). 이 등식은 focus 레이아웃 함수 반환값에 assert로 박고 단위 테스트로 강제한다(§8).

### 2.2 엔진 상태 (직교 축, 헌법 §23의 v0 축소)

```ts
type TopoStatus = {
  query: "loading-initial" | "ready" | "failed"          // REST inventory
  frame: "absent" | "nonempty" | "empty-authoritative"   // pods+nodes 모두 0이고 query ready일 때만 empty
  freshness: "fresh" | "stale"                           // 마지막 성공 폴링 후 90s 초과 시 stale
  scopedError: { code: string; message: string } | null
}
```

합성 규칙: ① 유효 frame이 하나라도 있으면 이후의 폴링 실패 중에도 마지막 scene을
유지하고 상단에 상태 배지만 바꾼다. ② `empty-authoritative`만 empty 일러스트를 렌더한다 —
403은 forbidden 화면, 타임아웃은 error+retry. ③ stale은 화면 채도를 낮추지 않는다(색은
health 채널 전용). 우상단 배지 `{n}s 전 데이터`로만 표현한다.

### 2.3 UI 7상태

loading(고정된 node frame skeleton으로 레이아웃 이동 금지) /
unauthenticated(제품 공통) / forbidden / error(+재시도, mutation reset 포함) /
empty-authoritative / stale(배지) / populated. 각 상태는 시각 회귀 대상(§8).

## 3. 레이아웃 수학 (전부 순수 함수, 단위 테스트 대상)

모든 좌표는 container-relative CSS px이며 dimension literal은 `topology-visual-motion-tokens.md`
에서만 정의한다. 컨테이너는 ResizeObserver로 측정하고 layout revision 단위로 재계산한다.
레이아웃 함수 시그니처는 `layoutX(graph, bounds): Map<entityKey, Rect>`다.

### 3.1 Home map (placement treemap)

- 선택한 cluster가 root이고 node가 frame, pod가 frame 내부 leaf tile이다. 별도 topology page나
  node tree view를 중첩하지 않는다.
- frame 내부 pod tile은 deterministic treemap(`treemapResquarify`)으로 배치하고 모든 leaf
  value를 **정확히 1**로 둔다. CPU/memory usage는 면적에 절대 반영하지 않는다.
- 기본은 packed/high-density다. canonical `packedPodTileMinimum=14×14px`, `nestedChildGap=2px`를
  적용한다. 사용할 수 있는 frame 내부에 거대한 빈 tile/영역이 생기면 의도된 여백이 아니라
  layout bug다.
- canonical minimum을 지키지 못하면 member를 임의 삭제하거나 타일을 부풀리지 않고 결정적
  workload group projection으로 집계한다. projection member count와 전체 pod count 보존은
  assert한다.
- 정렬 tie-break: namespace asc → name asc (결정적).
- `Unscheduled` shelf는 node_name null인 pod만 포함하며 geometry는 visual token 정본을 따른다.

### 3.2 focus 모드 (좌 소스 큐브 / 우 전체 세로 열 / 연결체당 리본 1개) — 확정

focus 대상은 map의 모든 큐브다(pod 타일, node frame 헤더 포함). 소스가 무엇이든 연관
집합의 원천은 서버 계산 관계(§1.2)뿐이다. geometry/density literal은 visual token 정본을 따른다.

- **오른쪽 열 (전체 항목 — §2.1 완전성 불변조건 적용)**:
  - logical inline-end에 map의 source를 제외한 **모든 항목**을 세로 1열로 둔다.
  - 상단 = 연관 항목: **health별로 뭉친 연결체**.
  - 뭉침 기준 = health level. 근거: 색이 곧 상태 채널이므로 "같은 색끼리 뭉침"이 시각과
    의미를 일치시킨다. 연결체 정렬은 심각도 내림차순(unhealthy → degraded → unknown →
    neutral → healthy), 연결체 내부는 canonical label sort key 뒤 entityKey 순이다. kind 구분은 라벨 앞
    kind 아이콘 토큰으로 보조한다.
  - 하단 = 비연관 항목 전부. dim 처리하되 identity·label·keyboard access를 유지하고 리본은 없다.
- **왼쪽 소스 큐브**: logical inline-start에 고정하고 source face 전체를 health connector face
  비율로 gap/overlap 없이 partition한다. source/target size와 label density는 visual token 정본을 따른다.
- **리본 — 연결체당 정확히 1개, 세 갈래 금지**: 양끝이 **세로면 전체**와 결합한다.
  소스 오른면은 연결체 face 높이 비례로 빈틈없이 분할하고, 연결체 왼면은 첫 멤버
  위끝부터 마지막 멤버 아래끝까지 전체를 덮는다. **중앙점 결합 금지**. 경로는 상·하
  두 변의 cubic bezier band이며 routing tension은 visual token 정본을 따른다.
- 항목이 열 높이를 넘치면 논리 collection을 그대로 유지한 채 vertical scroll/virtualization을
  사용한다. mount된 DOM 수가 아니라 logical collection으로 완전성 assert를 계산한다.

### 3.3 리본 두께의 의미 (헌법 §1.2 적용)

리본 두께는 연결체 face 높이의 기하적 결과다. 트래픽량이 아니라
**집합 크기(cardinality)**이며, 라벨에 멤버 수를 병기해 트래픽으로 오인하지 않게 한다.
헌법의 확정 예외는 다음과 같다: **"face-결합 리본의 두께는 결합 면 높이의 기하적 결과(집합 크기)로서 허용한다".**

## 4. 모션 계약

### 4.1 sequence token alias (컴포넌트 literal 금지)

| sequence 역할 | canonical token (`topology-visual-motion-tokens.md`) |
|---|---|
| 기존 ribbon 완전 소거 | `ribbonErase` |
| cube geometry morph + map x순 stagger/cap | `focusMorph` |
| cube-local label 등장 gate | `labelReveal` |
| settle 뒤 정지 + ribbon 좌→우 성장 | `ribbonDraw` |
| health connector 간 시작 간격 | `connectorStagger` |

위 이름은 alias가 아니라 canonical token key다. 숫자와 easing을 이 문서나 component에 다시 선언하지 않는다.

### 4.2 전환 시퀀스 (focus 진입/복귀 — 확정 규칙)

**진입(map → focus)**
1. 기존 ribbon/connector를 `ribbonErase`로 완전히 소거한다. 이 단계가 끝나기 전 cube morph를 시작하지 않는다.
2. source와 map의 **모든 나머지 cube**를 `focusMorph`로 목표 좌표에 morph한다. stagger는
   map의 logical x좌표 오름차순, block 좌표, entityKey 순이며 random/index delay를 금지한다.
3. 각 cube의 local morph가 `labelReveal` gate에 도달하면 source/target label이 등장한다.
4. 마지막 cube가 settle한 뒤 canonical 정지 gate를 기다리고, health connector 순서대로
   `ribbonDraw`를 source face→target face 방향으로 실행한다. connector start는
   `connectorStagger`를 적용한다. fade-in으로 방향성 draw를 대체하지 않는다.

현재 canonical token 해석은 `150ms erase → 720ms morph(24ms/cube, cap 300ms) → local 80% label reveal → 마지막 settle +60ms → 560ms draw(110ms/connector)`다. 값 변경은 visual token 정본에서만 한다.

**복귀(focus → map)**: `ribbonErase` 완료 → 전체 cube `focusMorph`(비연관 opacity 복원 동시)
→ `labelReveal`에서 map label 등장. ribbon draw의 역재생은 하지 않는다.

5. 전환 중 새 polling frame이 도착하면 reducer에는 즉시 적용한다. transition이 캡처한 universe와
   geometry만 settle까지 유지하고 완료 직후 최신 frame을 한 번 coalesce해 현재 rect에서 retarget한다.
6. 전환 중 다른 큐브 클릭/Esc: 현재 보간 위치에서 새 목표로 retarget(위치 점프 금지),
   리본은 `ribbonErase` 후 새 기준으로 재드로우.
7. enter(새 항목): 최종 위치에서 scale 0.9→1 + fade 160ms. exit(삭제): fade 160ms 후
   제거. **동명 재생성은 §1.1 한계로 enter가 생략될 수 있음을 문서화된 결함으로
   유지**(BE-2로 해소).

### 4.2b 자연스러움 원칙 (모든 모션 공통 — 게이트 대상)

1. easing은 visual token 정본의 `focusMorphEase`, `ribbonDrawEase`만 사용한다.
2. 이동하는 요소는 위치·크기를 **한 트랜지션에서 동시에** 보간한다(순차 보간 금지).
3. stagger는 항상 공간 좌표 순서 기반 — 인덱스·랜덤 기반 금지. 물결에는 방향이 있어야 한다.
4. 요소별 모션 문법 고정: 큐브=morph, 리본=성장 드로우, 라벨=페이드+슬라이드. 같은 요소가
   상황마다 다른 방식으로 움직이지 않는다.
5. 어떤 인터럽트에서도 요소는 순간이동하지 않는다(retarget만 허용).
6. 검증: P1·P2 게이트에서 60fps(프레임 드랍 p95 0) + 3인 육안 "부자연스러운 지점 0건".

### 4.3 reduced motion

`prefers-reduced-motion`: `ribbonErase`, `focusMorph`/stagger, `labelReveal`, `ribbonDraw`,
`connectorStagger`를 즉시 완료 상태로 대체한다. 논리 universe, 우측 열 순서, connector count,
focus/URL 결과는 일반 motion과 같아야 한다. 파티클·펄스류는 v0에 존재하지 않는다.

## 5. 시각 계약

색 literal, contrast, pattern, gradient, dimension, density, z-order는 모두
`topology-visual-motion-tokens.md`에서만 정의한다. 이 절은 semantic channel만 고정한다.

### 5.1 색 channel

- pod health는 canonical health fill/stroke pair를 사용해 **타일 전체 면을 채운다**. health를
  얇은 좌측 strip으로 축약하는 표현은 금지한다.
- 타일 좌측 canonical 3px strip은 `namespaceStableFill`만 사용한다. namespace strip에 health,
  kind, selection 색을 넣지 않는다.
- backend health literal을 client가 임의 재판정하지 않는다. 값 부재는 `unknown`이고 상태는
  tooltip/accessibility label의 text와 함께 전달한다.
- CPU/memory usage는 면적이나 health fill을 바꾸지 않는다. 사용량은 tile 내부 하단 bar와
  tooltip에서만 보이며 null은 0으로 그리지 않고 bar 자체를 생략한다.
- focus connector gradient/palette와 observed flow ribbon은 서로 다른 canonical token channel이다.
  focus connector에 traffic rate, particle, speed encoding을 적용하지 않는다.

### 5.2 크기·타이포

Home map은 canonical `packedPodTileMinimum=14×14px`, `nestedChildGap=2px`,
`namespaceStabilityStripWidth=3px`를 사용한다. radius, selection ring, typography, frame header,
usage bar와 focus column geometry는 visual token 정본을 직접 참조한다. 이 문서에 대체 pixel
literal을 만들지 않는다.

### 5.3 밀도 규칙

`TileDensity`는 visual token 정본의 측정 기반 `marker | name | name-value | summary` policy를
그대로 사용한다. 판정은 layout 함수가 Rect와 actual text measurement를 함께 사용해 반환한다.
Home 전용 threshold를 만들지 않는다.

### 5.4 breakpoints

viewport 상수가 아니라 topology root container inline-size와 canonical container mode를 쓴다.
compact의 focus는 같은 universe/order를 가진 grouped list fallback이며 완전성 불변조건을
그대로 지킨다. 어떤 폭에서도 별도 Topology surface나 fold gesture를 되살리지 않는다.

## 6. 이벤트·액션 계약

### 6.1 메시지 union (전량 — 이 밖의 상태 변경 경로 금지)

```ts
type TopoMsg =
  | { type: "cluster.selected"; clusterId: "kubernetes-ops" | "cluster-1" }
  | { type: "focus.entered"; entityKey: string; via: "click" | "keyboard" | "url" }
  | { type: "focus.exited"; via: "back" | "escape" | "url" }
  | { type: "inventory.applied"; frame: TopoFrame; fetchedAt: string }   // REST 폴링 결과(zod 통과 후)
  | { type: "inventory.failed"; error: { code: string; message: string } }
  | { type: "relations.applied"; sourceKey: string; relations: TopoRelation[] }
  | { type: "relations.failed"; sourceKey: string; error: { code: string; message: string } }
  | { type: "visibility.changed"; visible: boolean }
  | { type: "container.resized"; width: number; height: number }
  | { type: "retry.requested" }
```

- 처리기는 단일 `useReducer`(pure). fetch/timer는 effect 훅이 수행하고 결과를 메시지로
  dispatch한다. 컴포넌트가 상태를 직접 쓰거나 fetch하는 경로는 금지(헌법 §1.5 상속).
- `TopoFrame = { entities: TopoEntity[]; relations: TopoRelation[]; usage: ...; fetchedAt }` —
  D1~D5 실 API 응답을 adapter가 병합한 형태다. runtime synthetic adapter는 없다.
- URL 동기화는 Home의 `focus.entered/exited`(`?focus=`)만 기록한다. resource detail URL이나
  drawer route를 만들지 않는다. keyboard focus/hover는 기록하지 않는다.

### 6.2 액션

Home treemap은 **조회 전용**이다. scale/restart 등 mutation과 resource detail은 Home의
surface가 아니다. Resources inline detail은 Home 완료 뒤 별도 capability slice에서 구현한다.

### 6.3 상호작용 매핑 (헌법 §21 상속, v0 전량)

| 입력 | 결과 |
|---|---|
| 큐브 hover | tooltip(이름, namespace, 상태 text, CPU/MEM 값 또는 `측정 없음`, 재시작 수) |
| 큐브 클릭/Enter (map) | focus 진입 — 클릭한 큐브가 소스 |
| 열 큐브 클릭/Enter (focus) | 그 큐브를 소스로 focus 재진입(§4.2-6 retarget) |
| 소스 큐브 클릭/Enter (focus) | focus 유지; 별도 detail page/drawer를 열지 않음 |
| `← 전체 맵` 버튼 / Esc | focus → Home map 복귀 |
| 화살표 | 공간 이웃으로 keyboard focus 이동(§7) |

## 7. 접근성 (구체)

- 타일은 Canvas가 아니라 DOM(button role)이므로 미러 불필요. roving tabindex 1개.
- 화살표 이동: 레이아웃 함수가 반환한 Rect 중심점 기준 방향 최근접(유클리드), 없으면 유지.
- 라벨 형식: `"{name}, {namespace} 네임스페이스, 상태 {health}, 재시작 {n}회{, 인시던트 있음}"`.
  값 부재는 "측정 없음"으로 읽는다.
- aria-live(polite)는 다음만: presentation 전환 완료(`"{view} 보기, 항목 {n}개"`)와 재시도
  결과. polling 갱신은 알리지 않는다.
- 200% zoom에서 §5.4 compact fallback과 동일한 logical universe/order를 시각 회귀로 검증한다.

## 8. 테스트·게이트

- **레이아웃 단위 테스트**: pods 0/1/13/200/401, node 0/1/5, 미스케줄 pod, packed geometry,
  canonical 14×14 minimum/2px gap, 거대한 빈 tile 0건, projection count 보존, 화살표 이웃 결정성.
  **focus 완전성**: 임의 입력에서 `열 항목 수 + 1 = map 항목 수` property 테스트,
  뭉침 결정성(동일 입력 → 동일 연결체 분할), 연결체 심각도 정렬, 소스면 분할 합 = 소스면
  전체(빈틈 0), 연결체당 리본 수 = 1.
- **reducer 테스트**: stale request generation 폐기, visibility polling 중단/복귀, 전환 중 최신
  frame 즉시 적용+settle 뒤 coalesced retarget, focus 중 source 소멸 처리.
- **motion fake-clock**: `ribbonErase=150ms` 완료 전 morph 0건, `focusMorph=720ms`와 map x순
  24ms/cube·cap 300ms, `labelReveal=80%`, 마지막 settle+60ms 전 ribbon 0건,
  `ribbonDraw=560ms`, `connectorStagger=110ms`를 검증한다.
- **시각 회귀**: map/focus × light/dark × 1440/1024/390 × {populated, empty, error, stale} +
  reduced-motion 1세트 + focus 전환 중간 프레임(morph 50%·리본 드로우 50%) 2컷.
  기존 `visual-product` 게이트에 추가.
- **대비 자동 검사**: 토큰 조합 전수(텍스트 4.5:1, 그래픽 3:1) 스크립트를 `check:design`에 추가.
- **실측 게이트**: 실제 API의 `cluster-1`을 선택해 Home map/focus를 렌더하고 synthetic dataset,
  `DEMO DATA`, fake cluster label이 0건인지 확인한다.
- `references/ui-layer-lab/src/product`에서 `npm run check` 전 항목과 frontend 디렉토리 부재를 확인한다.

## 9. 확정/연기 경계

- §2~§4의 Home map/focus model, 완전성 invariant, 균등 면적과 sequence는 v0 확정이다.
- 색·치수·density·z-order와 motion literal은 visual token 정본에서 확정한다.
- fold drag gesture와 Container treemap entity는 v1 이후다. v0 implementation surface에
  disabled UI나 dormant listener로도 넣지 않는다.
- workload projection threshold는 실제 cluster bounds로 선택할 수 있지만 canonical tile minimum,
  전체 count 보존, packed/no-large-blank invariant를 완화할 수 없다.

## 10. 구현 순서와 다음 화면 차단 gate

1. `frontend/` 부재와 product code root가 `references/ui-layer-lab/src/product`뿐인지 확인한다.
2. D1~D4 actual API schema/adapter와 Home cluster selector, node frame/pod packed treemap을 완성한다.
3. D5 관계를 연결하고 전체 focus column, health connector, face ribbon, sequence, 완전성 assert를 완성한다.
4. 실제 API `cluster-1` Home 렌더, motion/property/visual gate와 `npm run check`를 통과한다.

위 네 단계가 모두 끝나기 전에는 Resources inline expansion을 포함한 다른 화면을 시작하지
않는다. 각 commit 직전 `npm run check`를 통과해야 하며 synthetic data로 gate를 대체할 수 없다.
