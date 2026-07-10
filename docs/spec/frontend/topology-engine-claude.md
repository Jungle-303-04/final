---
title: Topology Engine — 클로드 버전 구현 기획 (v0 계약)
status: planned-implementation-contract
owner: frontend-platform
constitution: docs/spec/frontend/topology-engine.md (장기 헌법, 의미론 상속)
backend_basis: src/domains/inventory, src/domains/dashboard/fleet_router.py, src/packages/contracts/realtime.py
product_basis: references/ui-layer-lab/src/product (AGENTS.md, PRODUCT_FRONTEND.md 준수)
last_verified: 2026-07-11
---

# Topology Engine — 클로드 버전 구현 기획 (v0)

## 0. 문서의 위치와 규율

현재 repo의 실제 코드와 통과한 테스트가 source of truth다. 이 문서는 현재 백엔드 코드로 v0을 구현하기 위한 계획이며, 아래 값과 타입이 현 코드에 없으면 구현 완료가 아니라 후속 작업 기준으로만 읽는다.

`topology-engine.md`(이하 "헌법")는 장기 목표의 의미론을 정의한다. 이 문서는 그 부분집합인
**v0을 현재 백엔드로 구현 가능한 수준까지 완전 확정**한 계약이다. 두 문서의 관계는 다음과 같다.

- 헌법의 **의미론 불변조건은 전부 상속**한다: UID 우선 identity, 역방향 edge 저장 금지,
  network truth 분리, 타일 내부 percentage gauge 금지, missing≠0, 직교 상태축,
  미정의 상태 금지(§32).
- 헌법이 **정책/토큰/스키마로 위임하고 비워둔 모든 값**을 이 문서가 숫자와 타입으로 채운다.
- 헌법의 **범위 중 v0이 하지 않는 것**은 §0.2에 명시적으로 제외한다. 제외는 포기가 아니라
  순서이며, 각 항목에 제외 근거를 남긴다.

경험적 검증 없이는 확정할 수 없는 값은 `⚠︎초안값` 마커와 함께 **초안값 + 검증 방법 +
확정 게이트**를 명시한다(§9 대장). 마커 없는 모든 수치·타입·규칙은 이 문서로 확정이며,
변경은 이 문서의 개정으로만 한다. "구현하면서 정한다"는 상태는 존재하지 않는다.

### 0.1 헌법 검토에서 확인된 모순의 해소

| # | 헌법의 문제 | v0의 해소 |
|---|---|---|
| M1 | 모션·토큰·payload를 미존재 정책으로 위임 | 이 문서 §4·§5·§6이 전부 정의 |
| M2 | Container가 `EntityRef` union에 표현 불가 | v0 treemap 계층은 Pod까지. Container는 Pod drawer의 목록 데이터이며 entity가 아니다(§1.4). Container entity화는 헌법 개정(전용 arm 추가) 후 v1 |
| M3 | 제스처 연속 보간 × 비동기 레이아웃 계약 부재 | v0은 **드래그 제스처를 제공하지 않는다**. 뷰 전환은 세그먼트 컨트롤/키보드의 이산 전환이며 전환 시퀀스는 §4.2로 확정. 연속 제스처는 프로토타입 검증 후 v1 |
| M4 | decimal string 나눗셈 rounding 미정의 | v0 metric은 pod 수·재시작 수(정수)와 서버 계산 pct(이미 반올림된 float)만 사용. 클라이언트 나눗셈은 레이아웃 비율 계산뿐이며 IEEE754 double로 충분(면적 오차는 픽셀 반올림 이하). decimal wire 정밀도는 cost 도입 시점(v2)의 문제 |
| M5 | 외부 기준 저장소 익명 | 이 문서는 외부 저장소를 인용하지 않는다. 근거는 이 repo의 백엔드 코드 경로만 사용 |
| M6 | synthetic adapter가 과거 실패 패턴 재도입 | v0은 **synthetic/replay adapter를 만들지 않는다**. 실 API만 사용하고, 테스트 데이터는 레이아웃 순수 함수의 단위 테스트 입력으로만 존재(제품 번들 밖 `tests/`) |
| M7 | 10-패키지 모노레포 vs 현 단일 앱 | v0은 `src/product/features/topology/` 한 feature로 구현하고 AGENTS.md 의존 규칙을 그대로 따른다. 패키지 분리는 두 번째 소비자가 생길 때 |
| M8 | query session·resume stream 등 서버 신규 서브시스템 필요 | v0은 기존 계약만 사용: REST 폴링(30s) + 기존 `/api/live/browser` WS. 신규 백엔드 API를 요구하지 않는다(§1.6의 소규모 필드 추가 4건만 요청) |

### 0.2 v0 범위 제외 목록 (명시적)

query planner/AST, CRD discovery, composite metric, cost/flow(observed traffic), WebGL/Canvas,
layout worker, LOD expansion token, RBAC universe 계산, resumable stream, multi-cluster fleet
treemap(기존 FleetPage가 담당), 드래그 제스처, saved view. 각각의 재도입 조건은 헌법의
해당 절이 정의한다.

## 1. 데이터 현실 계약

v0이 소비하는 API는 아래가 전부다. 이 목록 밖 호출은 게이트 위반이다.

| # | API | 용도 | 폴링 |
|---|---|---|---|
| D1 | `GET /api/clusters/{id}/inventory/resources?resource_type=pod` | pod 목록: uid, ns, name, phase, health, restart_total, cpu_mcores, mem_mib, summary.node_name, summary.owner_kind/owner_name, containers | 30s |
| D2 | `GET /api/clusters/{id}/inventory/resources?resource_type=node` | node 목록: name, ready, health, summary(cpu/mem ratio, pod_count) | 30s |
| D3 | `GET /api/clusters/{id}/inventory/services` | service 목록: ns, name, type, summary.selector | 30s |
| D4 | `GET /api/clusters/{id}/inventory/workloads` | workload 목록: kind, ns, name, desired/ready, selector | 30s |
| D5 | `GET /api/clusters/{id}/inventory/resource-detail` | 선택 entity의 서버 계산 1-hop 관계(`related.pods`)와 events | 선택 시 |
| D6 | `GET /api/applications` + `/{id}/deployments` | repo↔deployment binding (gitops 점선 근거) | 진입 시 1회 + 60s |
| D7 | `WS /api/live/browser?workspace_id=` | `live.summary`(hot_pods, restart_delta, rollout_phase), `resource.delta`(pod replace/remove) | 상시 |

모든 응답은 `product/api` zod strictObject로 검증한다(기존 `client.ts` 경로). 검증 실패는
`invalid-payload`이며 화면은 마지막 유효 scene + error 배지를 유지한다.

### 1.1 Entity identity (헌법 §1.3의 v0 적용)

```ts
type TopoEntity =
  | { entityKey: `pod:${string}`;      kind: "pod";      uid: string; namespace: string; name: string; nodeName: string | null }
  | { entityKey: `node:${string}`;     kind: "node";     name: string }
  | { entityKey: `service:${string}`;  kind: "service";  namespace: string; name: string }
  | { entityKey: `workload:${string}`; kind: "workload"; workloadKind: string; namespace: string; name: string }
  | { entityKey: `repo:${string}`;     kind: "repo";     applicationId: string; name: string }
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
  plane: "placement" | "network-configured" | "ownership" | "gitops-provenance"
  relationType: "scheduled-on" | "selects" | "owns" | "declares"
  source: string        // entityKey — canonical 방향 고정 (헌법 §4.3)
  target: string
  evidence: "server-related" | "owner-ref" | "binding"
}
```

관계의 유일한 원천(클라이언트 추론 전면 금지):

| relation | 원천 | 비고 |
|---|---|---|
| pod →(scheduled-on)→ node | D1의 `summary.node_name` | node_name null이면 `Unscheduled` shelf |
| service →(selects)→ pod | D5 `related.pods` (서버 selector 매칭) | 표시는 **configured truth** — 점선. EndpointSlice effective는 BE-3 이후 실선 추가 |
| workload →(owns)→ pod | D5 `related.pods` (서버 selector/owner 매칭) | pod의 `owner_kind`가 ReplicaSet이면 edge 중간 라벨로 RS 이름 표시. RS 노드 열은 만들지 않음(리소스 미수집 — 상태 없는 노드 금지) |
| repo →(declares)→ workload | D6 binding | binding 없으면 workload에 `배포 원천 확인 불가` 배지. 추정 금지 |

역방향은 renderer가 계산한다. 오른쪽 rail이 `Pod ← Deployment`로 보여도 저장은 owner→dependent.

### 1.3 Metric과 면적 (헌법 §10의 v0 적용)

- v0 면적 metric은 **균등(=1/leaf)** 하나다. 근거: 백엔드에 request(할당량)가 없고(§1.6 BE-1),
  실측 사용량을 면적에 쓰면 재배치 불안정(헌법과 동일 판단). 사용량(cpu_mcores/mem_mib)은
  타일 내부 하단 1.5px 막대 2개로 표시하되 **값이 null이면 막대 자체를 그리지 않는다**(0으로
  그리지 않음).
- BE-1 완료 시 면적 기준 토글 `균등 | CPU request | Memory request`를 추가한다. 토글 UI는
  v0에 비활성 상태로 두지 않는다 — 존재하지 않는 capability는 UI에도 없다.
- percentage는 타일 내부 금지(헌법 상속). node frame 헤더의 `CPU 42.1%`는 허용하되 서버가
  이미 percent로 준 값만 그대로 표기하고 클라이언트 ×100 변환을 하지 않는다(단위 규약).

### 1.4 Container

Container는 v0에서 entity가 아니다. Pod drawer의 "컨테이너" 섹션에 D1 `containers` 배열을
목록으로 표시한다(이름, 이미지, waiting_reason). treemap 4단계(Cluster→Node→Pod→Container)는
헌법 개정으로 Container arm이 추가된 뒤 진행한다.

### 1.5 실시간 반영 규칙 (이전 구현 L군 결함의 반대 계약)

1. WS 메시지는 zod로 검증하고 미지 `type`은 폐기한다(dev 모드 console.warn 1회/타입).
2. `seq`는 연결 단위 단조 증가 가드: `seq <= lastSeq`인 메시지는 폐기.
3. `resource.delta`는 key를 `{cluster}/{ns}/pod/{name}`으로 파싱하되, **uid가 없으므로 기존
   entity 갱신(update-only)에만 사용**한다. 미발견 pod의 delta는 삽입하지 않고 해당 클러스터
   inventory 재조회를 1회 예약한다(디바운스 3s). — 삽입 금지가 L1의 해소다.
4. delta로 갱신하는 필드는 REST와 동일한 zod 스키마의 부분집합을 통과시킨다(L2 해소).
5. `live.summary.restart_delta`는 구간값으로만 취급하며 누적값과 같은 시리즈에 넣지 않는다(L3).
6. 화면 이탈·로그아웃 시 구독 해제, 재연결 시 보류 버퍼 폐기, `hello`→스냅샷 적용 전 delta는
   버퍼 후 순서 적용(L4·L5·L7).
7. `document.visibilityState !== 'visible'`이면 delta 적용을 중단하고 복귀 시 inventory를
   즉시 재조회한다(L6 해소 — rAF 적체 자체를 만들지 않음).

### 1.6 백엔드 요청 (v0 병행, v0 완성의 전제 아님)

- **BE-1**: pod spec의 cpu/memory request 수집(`cluster-agent` pod 수집기 +
  `kubernetes_snapshot._pod_resource` 필드 추가). → 면적 기준 토글 활성화.
- **BE-2**: inventory node/service/workload에 `uid` 노출. → §1.1 한계 해소.
- **BE-3**: EndpointSlice의 service label·targetRef를 관계로 노출. → effective truth 실선.
- **BE-4**: `GET /dashboard/rca/incidents/{id}`의 correlation_id 폴백 조회. → pod 타일
  인시던트 배지에서 상세 링크 활성화(그 전까지 배지는 비활성 표시).

## 2. 화면과 상태 기계

### 2.1 라우트와 뷰

- 라우트: `/product/clusters/:clusterId/topology` (product 라우터 내 신규 feature).
- 뷰 상태(URL `?view=`): `overview | traffic | delivery | both`. 기본 `overview`.
- 드릴 상태(URL): `?node={name}` `?pod={ns}/{name}`. 대상 소멸 시 drawer는 닫히지 않고
  `리소스 없음 — 마지막 관측 {timeAgo}` 상태를 렌더한다(이전 U5의 반대 계약).
- 뷰 전환 UI: 상단 세그먼트 컨트롤 4버튼(항상 표시) + 키보드 `[`/`]`(이전/다음 뷰),
  `1..4`(직접 선택). 드래그 제스처 없음(§0.1 M3).

### 2.2 엔진 상태 (직교 축, 헌법 §23의 v0 축소)

```ts
type TopoStatus = {
  query: "loading-initial" | "ready" | "failed"          // REST inventory
  frame: "absent" | "nonempty" | "empty-authoritative"   // pods+nodes 모두 0이고 query ready일 때만 empty
  connection: "connecting" | "connected" | "disconnected" // WS
  freshness: "fresh" | "stale"                           // 마지막 성공 폴링 후 90s 초과 시 stale
  scopedError: { code: string; message: string } | null
}
```

합성 규칙: ① 유효 frame이 하나라도 있으면 이후의 폴링 실패·WS 단절 중에도 마지막 scene을
유지하고 상단에 상태 배지만 바꾼다. ② `empty-authoritative`만 empty 일러스트를 렌더한다 —
403은 forbidden 화면, 타임아웃은 error+retry. ③ stale은 화면 채도를 낮추지 않는다(색은
health 채널 전용). 우상단 배지 `{n}s 전 데이터`로만 표현한다.

### 2.3 UI 7상태

loading(스켈레톤: node frame 자리 3개 고정 높이 220px — 레이아웃 이동 금지) /
unauthenticated(제품 공통) / forbidden / error(+재시도, mutation reset 포함) /
empty-authoritative / stale(배지) / populated. 각 상태는 시각 회귀 대상(§8).

## 3. 레이아웃 수학 (전부 순수 함수, 단위 테스트 대상)

모든 좌표는 컨테이너 상대 px. 컨테이너는 ResizeObserver로 측정하고 250ms trailing debounce로
재계산한다. 레이아웃 함수 시그니처는 `layoutX(graph, bounds): Map<entityKey, Rect>`.

### 3.1 overview (placement treemap)

- node frame 배치: 컬럼 수 `cols = clamp(1, floor(W / 300), 4)`, 프레임 간 gap 12px.
  각 frame 높이는 내부 pod 수 기반 `clamp(160, ceil(pods/perRow) * 24 + 56, 480)`.
- frame 내부 pod 타일: `d3-hierarchy` `treemapResquarify`, 값=균등 1, padding 2px,
  frame 내부 상단 여백 32px(헤더).
- **최소 타일 14×14px**. treemap 결과가 이보다 작아지는 pod 수(≈ frame당 200개 초과)면
  해당 frame은 pod 타일 대신 **workload 그룹 타일**(podgroup projection)로 강등하고 헤더에
  `Pods {n} · {g}개 그룹`을 표시한다. 강등은 frame 단위 결정적 규칙이며 애니메이션 중
  토글되지 않도록 히스테리시스 ±10%를 둔다. ⚠︎초안값[강등 임계 200/프레임 | 실 클러스터
  + 단위 테스트 401 pods 케이스로 검증 | P1 종료 게이트]
- 정렬 tie-break: namespace asc → name asc (결정적).
- `Unscheduled` shelf: 캔버스 하단 전폭, 높이 56px, node_name null인 pod만.

### 3.2 traffic (왼쪽 rail) / delivery (오른쪽 rail)

- rail 폭: 캔버스의 32%(min 260px, max 420px). 반대편에서 treemap이 세로 pod 레일로 재정렬:
  node별 괄호 묶음, 레일 타일 높이 20px, 폭 = 남은 영역 폭 − 24px, 행 gap 2px.
- rail 항목(서비스/워크로드) 카드: 높이 44px, 정렬 namespace asc → name asc.
- 연결선: 소스 카드 우변 중앙 → 타일 좌변 중앙, cubic bezier(제어점 x offset = 구간 폭의
  40%). 한 소스의 연결이 12개를 넘으면 개별 선 대신 묶음 리본 1개 + `{n}` 배지, 소스 선택
  시 개별 선으로 전개. ⚠︎초안값[12 | 시각 회귀에서 가독성 판정 | P2 게이트]
- 선 스타일: configured=점선(4 2), ownership=실선 1.5px, gitops=점선(2 3) + repo 카드.
  **모든 비트래픽 선의 굵기는 1.5px 고정**(수량 인코딩 금지 — 헌법 상속). 수량은 배지 숫자.

### 3.3 both (butterfly)

좌 32% / 중 36% / 우 32%. 중앙은 traffic/delivery와 같은 pod 레일. 좌우 rail 동시 표시,
연결선 묶음 규칙 동일. viewport < 1280px에서는 both를 제공하지 않고 세그먼트에서 숨긴다
(§5.4 breakpoint).

## 4. 모션 계약

### 4.1 토큰 (product `ui` motion 상수로 정의, 컴포넌트 literal 금지)

| 토큰 | 값 | 용도 |
|---|---|---|
| `topo-duration-tile` | 420ms | 타일 위치/크기 morph |
| `topo-duration-line` | 180ms | 연결선 페이드/드로우 |
| `topo-duration-ui` | 160ms | drawer, 배지, 세그먼트 |
| `topo-ease-morph` | cubic-bezier(0.32, 0.72, 0, 1) | 타일 morph |
| `topo-ease-standard` | cubic-bezier(0.2, 0, 0, 1) | 그 외 |
| `topo-stagger-line` | 12ms/선, 총합 max 480ms | 선 전개 |
| `topo-max-concurrent` | 타일 300개 초과 시 morph 없이 crossfade 200ms | 성능 하한 |

⚠︎초안값[420/180/12ms와 bezier 값 | 동작 프로토타입에서 3인 이상 육안 판정 + 60fps 측정 |
P1 종료 게이트에서 확정, 이후 변경은 문서 개정]

### 4.2 뷰 전환 시퀀스 (확정 규칙)

1. **Phase A — 타일 이동(0→420ms)**: 모든 기존 연결선을 60ms 내 페이드아웃 → 타일이
   `layoutId=entityKey`로 새 좌표로 morph. 이동 중 타일 내용(이름/막대)은 유지.
2. **Phase B — 구조 등장(420ms→)**: rail 카드가 20px 슬라이드+페이드로 등장(120ms),
   완료 후 연결선이 stagger 드로우(§4.1). **선은 반드시 타일 정지 후에 그린다.**
3. 전환 중 새 폴링/delta 데이터 도착 시: 적용을 버퍼하고 Phase B 완료 직후 일괄 적용.
   전환은 데이터에 의해 중단되지 않는다.
4. 전환 중 사용자가 다른 뷰를 선택하면: 현재 보간 위치에서 새 목표로 retarget(Motion 기본
   동작), Phase B는 새 뷰 기준으로 재시작.
5. enter(새 pod): 최종 위치에서 scale 0.8→1 + fade 160ms. exit(삭제): fade+scale 0.9,
   160ms 후 제거. **동명 재생성은 §1.1 한계로 enter가 생략될 수 있음을 문서화된 결함으로
   유지**(BE-2로 해소).

### 4.3 reduced motion

`prefers-reduced-motion`: 모든 morph·stagger·드로우를 즉시 상태로 대체(선은 처음부터 표시),
enter/exit는 opacity 100ms만. 파티클·펄스류는 v0에 존재하지 않는다.

## 5. 시각 계약

### 5.1 색 토큰 (product `styles/tokens.css`에 추가, raw 값은 이 파일에만)

| 토큰 | dark | light | 용도 |
|---|---|---|---|
| `--topo-health-healthy` | oklch(0.72 0.12 155) | oklch(0.55 0.13 155) | 타일 fill |
| `--topo-health-degraded` | oklch(0.75 0.14 75) | oklch(0.60 0.14 75) | 〃 |
| `--topo-health-unhealthy` | oklch(0.62 0.19 25) | oklch(0.53 0.19 25) | 〃 |
| `--topo-health-unknown` | oklch(0.55 0.02 260) | oklch(0.70 0.02 260) | 〃 |
| `--topo-rel-configured` | oklch(0.65 0.10 250) | oklch(0.50 0.10 250) | 점선 |
| `--topo-rel-ownership` | oklch(0.70 0.09 300) | oklch(0.52 0.09 300) | 실선 |
| `--topo-rel-gitops` | oklch(0.68 0.10 200) | oklch(0.50 0.10 200) | 점선 |
| `--topo-frame-border` | 기존 `border` 토큰 재사용 | 〃 | node frame |
| `--topo-stale-pattern` | 대각 45° 해치, 선폭 1px, 간격 4px, 불투명도 0.25 | 〃 | stale 타일 오버레이 |

- health 어휘는 백엔드 inventory `health` 리터럴(`healthy|degraded`) + phase 파생 없이
  `unknown`(값 부재)만 사용한다. `unhealthy`는 BE가 해당 리터럴을 방출하기 전까지 미사용
  토큰으로 정의만 해둔다(클라이언트 판정 금지).
- 대비 기준: 텍스트 4.5:1, 타일/선/보더 3:1 (WCAG 2.1 AA). 토큰 확정 시 자동 검사
  스크립트(§8)로 강제. ⚠︎초안값[위 oklch 수치 | 대비 검사 + 기존 tokens.css와 병치 스크린샷 |
  P1 게이트]
- 상태는 색+텍스트 병기: 타일 tooltip과 접근성 라벨에 상태 문자열 포함(§7).
- namespace 안정 색: `hue = FNV-1a(namespace) mod 360`, `oklch(0.65 0.09 hue)`(dark) /
  `oklch(0.50 0.09 hue)`(light). **표시 위치는 타일 좌변 3px 스트립과 rail 카드 좌변만** —
  health(면)와 채널 분리. hue가 health 4색의 ±20° 안이면 +40° 시프트(충돌 회피, 결정적).

### 5.2 크기·타이포

타일: min 14×14px, gap 2px, radius 3px, 선택 ring 2px(`focusRing` 토큰), 좌변 namespace
스트립 3px. 라벨: 타일 폭 ≥56px일 때 이름 1줄(11px, 기존 mono 토큰, ellipsis), ≥96px일 때
이름+재시작 수. 그 미만은 라벨 없음(tooltip·접근성 미러로 보완). node frame: 헤더 32px
(이름 12px semibold + ready 배지 + CPU/MEM % 텍스트), 보더 1.5px, radius 6px, 패딩 8px.
usage 막대: 타일 하단 1.5px×2(CPU 위, MEM 아래), 배경 대비 3:1.

### 5.3 밀도 규칙

`TileDensity`(헌법 §12.2 상속): 폭 <56px `marker` / 56–95px `name` / ≥96px `name-value`.
`summary`는 v0 미사용. 판정은 레이아웃 함수가 Rect와 함께 반환(측정 로직 단일화).

### 5.4 breakpoints

`wide ≥1280px`: 4뷰 전부. `medium 768–1279px`: both 숨김, rail은 overlay(캔버스 위 32%
슬라이드 패널). `narrow <768px`: treemap 대신 node 아코디언 목록 + 관계는 선 없이 카드
목록(선택 체인만). 어떤 폭에서도 가로 스크롤 금지.

## 6. 이벤트·액션 계약

### 6.1 메시지 union (전량 — 이 밖의 상태 변경 경로 금지)

```ts
type TopoMsg =
  | { type: "view.changed"; view: "overview" | "traffic" | "delivery" | "both"; via: "segment" | "keyboard" | "url" }
  | { type: "node.focused"; nodeKey: string | null }
  | { type: "entity.activated"; entityKey: string }        // pod→drawer, service/workload→relation focus
  | { type: "relationFocus.cleared" }
  | { type: "drawer.closed" }
  | { type: "inventory.applied"; frame: TopoFrame; fetchedAt: string }   // REST 폴링 결과(zod 통과 후)
  | { type: "inventory.failed"; error: { code: string; message: string } }
  | { type: "live.summaryApplied"; clusterId: string; summary: LiveSummary; seq: number }
  | { type: "live.deltaApplied"; updates: PodPatch[]; seq: number }      // update-only (§1.5.3)
  | { type: "live.connectionChanged"; state: "connecting" | "connected" | "disconnected" }
  | { type: "visibility.changed"; visible: boolean }
  | { type: "viewport.resized"; width: number; height: number }
  | { type: "retry.requested" }
```

- 처리기는 단일 `useReducer`(pure). fetch/WS/타이머는 effect 훅이 수행하고 결과를 메시지로
  dispatch한다. 컴포넌트가 상태를 직접 쓰거나 fetch하는 경로는 금지(헌법 §1.5 상속).
- `TopoFrame = { entities: TopoEntity[]; relations: TopoRelation[]; usage: ...; fetchedAt }` —
  D1~D4 응답을 어댑터가 병합한 형태. WS 패치도 이 형태의 부분집합만 쓴다.
- URL 동기화: `view.changed`·`node.focused`·`entity.activated`(pod)만 URL에 기록. focus/hover는
  기록하지 않는다(헌법 §21.4 상속).

### 6.2 액션

v0 토폴로지는 **조회 전용**이다. scale/restart 등 명령은 기존 클러스터 상세의 명령 UI가
담당하며, pod drawer에는 해당 화면으로의 내부 이동 링크만 둔다(`navigation.internal`).
따라서 v0에 `ActionDescriptor`류 미정의 타입이 필요 없다 — 명령 표면이 토폴로지에 들어오는
시점(v1)에 기존 command gateway 계약을 그대로 사용한다.

### 6.3 상호작용 매핑 (헌법 §21 상속, v0 전량)

| 입력 | 결과 |
|---|---|
| 타일 hover | tooltip(이름, ns, 상태 텍스트, CPU/MEM 값 or `측정 없음`, 재시작 수) 300ms 지연 |
| pod 클릭/Enter | drawer 열기 + URL `?pod=` |
| node 헤더 클릭/Enter | node focus(해당 frame 확대: 캔버스 전폭 사용) + URL `?node=` |
| service/workload 카드 클릭/Enter | relation focus — 연결 선·타일만 100% 불투명, 나머지 30% |
| Esc | relation focus → drawer → node focus 순으로 단계 해제 |
| `[` `]` `1..4` | 뷰 전환 |
| 화살표 | 공간 이웃으로 focus 이동(§7) |

## 7. 접근성 (구체)

- 타일은 Canvas가 아니라 DOM(button role)이므로 미러 불필요. roving tabindex 1개.
- 화살표 이동: 레이아웃 함수가 반환한 Rect 중심점 기준 방향 최근접(유클리드), 없으면 유지.
- 라벨 형식: `"{name}, {namespace} 네임스페이스, 상태 {health}, 재시작 {n}회{, 인시던트 있음}"`.
  값 부재는 "측정 없음"으로 읽는다.
- aria-live(polite)는 다음만: 뷰 전환 완료(`"{view} 보기, 항목 {n}개"`), 연결 끊김/복구,
  재시도 결과. 폴링 갱신은 알리지 않는다.
- 200% zoom에서 §5.4 narrow 규칙 적용을 시각 회귀로 검증.

## 8. 테스트·게이트

- **레이아웃 단위 테스트**(node `--test`): pods 0/1/13/200/401, node 0/1/5, 미스케줄 pod,
  frame 강등 히스테리시스, 밀도 판정 경계(55/56/95/96px), 화살표 이웃 결정성.
- **reducer 테스트**: seq 역전 폐기, 미발견 delta 미삽입+재조회 예약, visibility 중단/복귀,
  전환 중 데이터 버퍼.
- **시각 회귀**: 4뷰 × light/dark × 1440/1024/390 × {populated, empty, error, stale} +
  reduced-motion 1세트. 기존 `visual-product` 게이트에 추가.
- **대비 자동 검사**: 토큰 조합 전수(텍스트 4.5:1, 그래픽 3:1) 스크립트를 `check:design`에 추가.
- **실측 게이트**: 라이브 `cluster-1`에서 4뷰 순회, WS 5분 관찰(유령 pod 0, 콘솔 오류 0),
  pod 강제 재시작 시 enter/exit 모션 확인.
- 기존 `npm run check` 전 항목 통과. 이 문서의 ⚠︎초안값 항목은 해당 게이트에서 값 확정 후
  마커를 제거하는 커밋을 남긴다.

## 9. 미확정 항목 대장 (전체 — 이 표 밖 미확정은 존재하지 않는다)

| # | 항목 | 초안값 | 검증 방법 | 확정 게이트 |
|---|---|---|---|---|
| U1 | morph duration/easing | 420ms / cubic-bezier(0.32,0.72,0,1) | 프로토타입 육안 3인 + 60fps 측정 | P1 종료 |
| U2 | 선 stagger | 12ms, max 480ms | 〃 | P2 종료 |
| U3 | frame 강등 임계 | 200 pods/frame, 히스테리시스 ±10% | 401-pod 단위 테스트 + 실측 | P1 종료 |
| U4 | 묶음 리본 임계 | 소스당 12선 | 시각 회귀 가독성 | P2 종료 |
| U5 | 색 토큰 oklch 수치 | §5.1 표 | 대비 검사 + 병치 스크린샷 | P1 종료 |
| U6 | crossfade 강등 임계 | 동시 300 타일 | 성능 측정(p95 프레임) | P2 종료 |

## 10. 구현 순서

- **P0 (0.5일)**: 이 문서 리뷰 승인, tokens.css 토큰 추가 + 대비 검사 스크립트.
- **P1 (2일)**: D1~D4 zod 스키마·어댑터, reducer, overview 레이아웃+모션, 7상태, 단위 테스트.
  게이트: U1·U3·U5 확정.
- **P2 (2일)**: traffic/delivery rail + 연결선 + relation focus, D5·D6 연동. 게이트: U2·U4·U6 확정.
- **P3 (1일)**: both 뷰, WS 실시간 규칙(§1.5), drawer.
- **P4 (1일)**: 접근성 마감, 시각 회귀 4뷰 세트, 라이브 실측 게이트, ⚠︎마커 제거 커밋.

총 6.5일. 각 단계는 독립 커밋이며 `npm run check` 통과가 커밋 조건이다. BE-1~4는 병행
요청하되 v0 완성의 전제가 아니다 — 이 문서의 모든 기능은 오늘의 백엔드로 동작한다.
