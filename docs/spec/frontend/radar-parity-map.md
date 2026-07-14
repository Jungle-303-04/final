---
title: Radar 패리티 맵 — 소스 레벨 대조 (레퍼런스 = skyhook-io/radar)
status: authoritative
date: 2026-07-14
owner: 우녕 (확정) / 조율 세션 (분석)
license: Radar는 Apache-2.0. 귀속과 수정 고지는 루트 NOTICE가 담당.
source: https://github.com/skyhook-io/radar (`10461f40bcfaf6dd578b24262c8f8fb84ae20766`)
---

# Radar 패리티 맵

레퍼런스는 **skyhook-io/radar** (Apache-2.0, Go 628파일 + React 342파일).
조율 세션이 저장소를 클론해 **소스 레벨로 직접 대조**했다. 추측이 아니다.

---

## 0. 결론 세 줄

1. **우리 스택이 Radar와 정확히 같다.** React 19 / Router 7 / TanStack Query /
   @xyflow/react 12 / elkjs / Tailwind. **이식 마찰이 거의 없다.**
2. **Radar의 `packages/k8s-ui`는 재사용 UI 라이브러리**(500+ 파일)다.
   화면이 이미 다 만들어져 있다. 우리가 새로 짤 이유가 없다.
3. **우리 기획 중 세 개를 고쳐야 한다** (§3). Radar 것이 더 낫다.

---

## 1. Radar 구조 (실측)

```
radar/
├── cmd/, internal/, pkg/          Go 백엔드 628파일 (단일 바이너리, k8s API 직접)
├── web/src/                       호스트 앱 342파일
│   ├── RadarApp.tsx               라우터
│   ├── components/                화면별 조립
│   ├── api/, hooks/, filter/
└── packages/k8s-ui/src/           ★ 재사용 UI 라이브러리 (핵심 자산)
    ├── components/
    │   ├── topology/      13   TopologyGraph, K8sResourceNode, GroupNode,
    │   │                       layout.ts(ELK), layout.worker.ts, TopologyControls,
    │   │                       TopologyFilterSidebar, TopologySearch
    │   ├── timeline/      20   ★ TimelineStrip, scrubber-math.ts, TimelineSwimlanes,
    │   │                       TimelineList, DiffViewer, timeline-live.ts
    │   ├── resources/     211  ResourcesView, ResourceDetailDrawer, renderers/ 108개
    │   ├── gitops/        23   GitOpsTableView, GitOpsDetailLayout, RollbackDialog,
    │   │                       SyncCountdown, ManagedResourcesList, tree/, insights/
    │   ├── applications/   9   ApplicationsView, ApplicationDetail, ReadyBar, AppChips
    │   ├── checks/         5   ChecksView, severity(critical/high/medium/low), types
    │   ├── audit/          6   AuditCard, AuditFindingsTable, AuditAlerts
    │   ├── issues/         9   IssuesView, ResourceIssuesSection, diagnostic
    │   ├── dock/          10   ★ BottomDock, LogsTab, TerminalTab, WorkloadLogsTab,
    │   │                       LocalTerminalTab, NodeTerminalTab, TrafficFlowListTab
    │   ├── logs/          11   LogCore
    │   ├── compare/       13   리비전 비교
    │   ├── charts/        10   MetricsChart
    │   └── ui/            48   Badge, Tooltip, YamlEditor, CodeViewer, SortableTh,
    │                           DistributionBar, HealthRing, SummaryTile, Facet,
    │                           FilterPill, MultiSelectPicker, ConfirmDialog, Toast …
    ├── filter-state/       4   ★ filter-state-core.ts (우리 VP-010과 같은 설계)
    └── hooks/                  useKeyboardShortcuts …
```

**의존성 (web/package.json 실측):**
```
react ^19.2.7 · react-router-dom >=7 · @tanstack/react-query ^5.101
@xyflow/react ^12.10 · elkjs ^0.11 · monaco-editor ^0.55
react-virtuoso · react-markdown · tailwind-merge · lucide-react
```
**우리 product/: React 19 / Router 7 / Zod 4 / TanStack Query. 같은 스택이다.**

---

## 2. 메뉴 대조

| Radar | 우리 | 판정 |
|---|---|---|
| Home | Home | **가져온다** + VP-011 위젯 조합 시스템으로 확장 |
| Resources | Resources | **가져온다** (108개 kind 렌더러 포함) |
| Issues | Issues | **가져온다** + RCA·증거·복구 PR로 확장 |
| **Topology** | → Resources 그래프 | **가져온다** ([D-028] 흡수. TopologyGraph를 VP-012 3층에) |
| Applications | Applications | **가져온다** + Git 드리프트로 확장 |
| **Timeline** | → Resources 시간 스크럽 | **가져온다** ([D-028] 흡수. TimelineStrip을 VP-012 2층에) |
| **Live Traffic** | → Resources 관계 뷰 | **가져온다** ([D-028] 흡수) |
| Helm | (BQ-019/020) | **가져온다** — 읽기 전용 + 설치는 PR로 |
| GitOps | GitOps | **개념이 다르다.** §3-3 참조 |
| Checks | Checks | **가져온다** (31개 감사 체크 + 4단계 심각도) |
| Cost | — | **제외** (OpenCost 의존. 제품 범위 밖) |
| — | **AI 채팅** | **우리만.** Radar는 MCP 서버만 제공 |

---

## 3. 우리 기획을 고쳐야 하는 것 ★

### 3-1. VP-012 시간 스크럽 바 — **Radar 것이 더 낫다. 우리 기획을 대체한다.**

우리 VP-012는 "유튜브식 오버레이 슬라이더 + 재생 버튼"이었다.
Radar의 `TimelineStrip.tsx` + `scrubber-math.ts`는 **로그 탐색기식**이고 더 정확하다.

**Radar의 핵심 통찰 (소스 주석 원문 요약):**
```
두 개의 중첩된 범위를 절대 혼동하지 않는다:
  QUERY  = 서버에서 가져온 데이터 범위 = 히스토그램의 전체 폭.
           범위 선택기(프리셋/직접입력)로만 바뀐다. 재조회를 일으킨다.
  WINDOW = 아래 레인에 실제로 보이는 슬라이스 = 히스토그램 위의 파란 밴드.
           항상 QUERY의 부분범위. 순수하게 뷰다 — 움직여도 재조회하지 않는다.

컨트롤 세 개:
  1. 범위 선택기 — QUERY를 정한다
  2. 창 −/+ — WINDOW를 끝을 고정한 채 늘리고 줄인다
  3. 밴드 — 드래그로 이동, 가장자리로 크기 조절, 빈 곳에 새로 그리기
```

**왜 이게 우리 것보다 나은가:**
- 우리 기획은 "슬라이더 하나 = 한 시점"이었다. **범위를 볼 수 없다.**
- Radar는 **히스토그램**이 있어서 언제 이벤트가 몰렸는지 한눈에 보인다.
  (`ScrubberBucket { startMs, endMs, total, warnings }` — 경고 개수까지 별도)
- 조회 범위와 보기 범위를 분리해 **재조회 없이 창을 움직인다.** 즉각 반응한다.
- `scrubber-math.ts`는 React 없는 **순수 함수 + 유닛 테스트**. 우리도 그래야 한다.

**결정: VP-012 §1.2를 Radar의 TimelineStrip 모델로 교체한다.**
우리가 추가할 것:
- **인시던트 마커** — 히스토그램 위 빨간 눈금. 클릭하면 그 시각 직전으로 점프.
- **재생 버튼** — 창을 시간순으로 자동 전진 (데모의 핵심 동선).
- 우리 shadcn 토큰으로 다시 칠하기.

### 3-2. BottomDock — **우리 기획에 없던 패턴. 가져온다.**

Radar는 **화면 하단에 독(dock)**이 있고, 탭으로 열린다:
```
components/dock/
  BottomDock.tsx          독 셸
  LogsTab.tsx             파드 로그
  WorkloadLogsTab.tsx     워크로드 멀티파드 로그
  TerminalTab.tsx         파드 exec 터미널
  NodeTerminalTab.tsx     노드 디버그 셸
  LocalTerminalTab.tsx    로컬 터미널
  TrafficFlowListTab.tsx  트래픽 흐름
```

**왜 좋은가:** Resources에서 파드를 고르고 `l`을 누르면 **화면 전환 없이** 하단에 로그가
열린다. 목록을 보면서 로그를 본다. 탭으로 여러 개를 동시에 열어둔다.

우리 기획은 "우측 패널"만 있었다. **둘 다 필요하다:**
- **우측 패널** = 그 리소스의 *정적 사실* (YAML, 관련 리소스, 메트릭 차트)
- **하단 독** = *흐르는 것* (로그 스트림, 터미널, 트래픽)

**결정: VP-012에 하단 독을 추가한다.**
우리가 추가할 것: 독 탭에 **AI 질문** — 지금 보고 있는 로그를 물고 질문.

### 3-3. GitOps — **개념이 다르다. 합친다.**

| | Radar | 우리 (VP-014 §2) |
|---|---|---|
| 대상 | **외부 GitOps controller 리소스 상태** | **PR·승인·diff** |
| 하는 일 | 동기화 상태·헬스·재조정 트리거·suspend/resume | 변경 승인·3-way 경고·복구 PR |
| 쓰기 | 클러스터에 직접 (sync, rollback) | **Git PR만** (단일 writer) |

**둘은 겹치지 않는다. 둘 다 필요하다.**

**결정: GitOps 화면을 2탭으로 한다.**
```
GitOps
  [변경]        ← 우리 것. PR·승인·3-way 경고·복구 PR (VP-014 §2)
  [동기화 상태]  ← Radar 것. 외부 GitOps controller 리소스 상태·재조정·suspend
```
Radar의 `gitops/` 23파일(`GitOpsTableView`, `SyncCountdown`, `ManagedResourcesList`,
`RollbackDialog`, `tree/`, `insights/`)을 **[동기화 상태] 탭에 그대로** 넣는다.

---

## 4. 우리 기획이 맞았던 것 (Radar가 검증해줌)

### 4-1. VP-010 통합 필터 = Radar의 `filter-state-core.ts`

Radar도 **schema 기반 URL↔상태 변환**을 쓴다. 우리 `filterUrlCodec`과 같은 설계다.

Radar의 필드 타입 4가지:
```
'set'      다중 선택. 콤마 목록. 비면 param 생략 = "전체". 정렬해서 씀(canonical URL)
'text'     자유 텍스트. history replace (키 입력마다 항목 안 만듦)
'single'   단일 선택 (enum). history push
'boolean'  param=1 / 생략
```
**우리 VP-010의 canonical serializer 규칙과 동일하다.** 설계가 맞았다.

**보강할 것:** Radar는 `'text'`를 **history replace**로 처리한다 (타이핑마다 히스토리
항목을 만들지 않음). 우리 VP-010 §2.4에도 있지만, Radar처럼 **필드 타입에 규칙을
박아두는 것**이 낫다. 매번 판단하지 않게.

### 4-2. Checks 4단계 심각도

Radar `checks/types.ts`:
```
CheckSeverity = 'critical' | 'high' | 'medium' | 'low'
RadarSeverity = 'danger' | 'warning'      ← 탐지기가 내는 원시 심각도
mapRadarSeverity: danger→high, warning→medium
```
**탐지기 심각도와 운영 심각도를 분리한다.** critical/low는 조직이 재정의할 때만 나온다.
우리 VP-014 §3도 이 모델을 그대로 쓴다.

### 4-3. 감사 체크 실제 목록 (`pkg/audit/checks.go` 함수명)

```
checkPodSpecSecurity        checkContainerSecurity      checkPodSpecVolumes
checkSecretInConfigMap      checkPodSpecReliability     checkSingleReplica
checkMissingPDB             checkPodSpecEfficiency      checkServiceNoMatchingPods
checkIngressNoMatchingService  checkMissingTopologySpread  checkPodHARisk
checkOrphanConfigMapsSecrets   checkDeprecatedAPIs      checkStuckTerminating
checkCrossplaneStuck        checkWorkloadPodSpecs
```
카테고리: **Security · Reliability · Efficiency** (`ChecksView.tsx`의 `CATEGORIES`)

우리 VP-014 §3의 예시(replicas 1, latest 태그, limits 없음, PDB 없음)가
**정확히 여기 있다.** 기획이 맞았다.

---

## 5. Radar 백엔드 API (우리 백엔드가 만들 목표)

Go 소스에서 추출한 실제 라우트:

### 5-1. P0 — 이게 없으면 k8s 콘솔이 아니다

| Radar API | 용도 | 우리 상태 |
|---|---|---|
| `GET /api/resources`, `/api/resources/{kind}/{ns}/{name}` | 리소스 목록·상세 | 부분 |
| `GET /api/resource-counts` | 종류별 개수 | 없음 |
| `GET /api/api-resources` | **kind 디스커버리 (CRD 포함)** | **없음** |
| `GET /api/topology` | **그래프 노드·엣지** | **없음** ← VP-012 3층 |
| `GET /api/events`, `SSE /api/events/stream` | 이벤트 + 실시간 | 부분 |
| `GET /api/changes` | **리소스 변경 diff** | **없음** ← Timeline의 실체 |
| `GET /api/audit` | **31개 감사 체크** | **없음** ← Checks 화면 |
| `SSE /api/pods/{ns}/{p}/logs/stream` | **로그 스트림** | **없음** |
| `GET /api/settings`, `PUT /api/settings` | UI 설정 저장 | 없음 ← Home 위젯 |
| `GET /api/cluster/namespace-scope` | 접근 가능 네임스페이스 | 없음 |
| **`GET /api/capabilities`** | **RBAC 기반 버튼 노출 여부** | **없음** ★ |
| `GET /api/dashboard`, `/crds`, `/helm` | 대시보드 요약 | 없음 |
| `GET /api/metrics/top/nodes`, `/api/metrics/pods/{ns}/{p}/history` | 메트릭 | 부분 |
| `GET /api/certificates` | TLS 만료 | 없음 |

★ **`/api/capabilities`가 중요하다.** Radar는 RBAC를 물어보고 **권한 없는 버튼을
아예 렌더하지 않는다.** 우리 BE-Gap 규율과 같은 철학이다. 우리도 이걸 만들어야
"삭제 버튼이 보이는데 누르면 403" 같은 게 안 생긴다.

### 5-2. P1 — 있으면 강력

| Radar API | 용도 |
|---|---|
| `WS /api/pods/{ns}/{p}/exec` | 터미널 |
| `GET/POST/DELETE /api/portforwards` | 포트포워드 |
| `GET /api/prometheus/rightsizing/scan` | 리소스 적정화 제안 |
| `/api/v1/query`, `/api/v1/query_range` | Prometheus 프록시 |
| `GET /api/vitals`, `/api/health/detailed` | 진단 |
| `GET /api/diagnose/runs` | 진단 실행 |
| `GET /api/sessions` | exec/터미널/포트포워드 세션 집계 |

### 5-3. ★ AI 전용 엔드포인트 — 우리 AI가 이걸 써야 한다

```
GET /api/ai/resources/{kind}
GET /api/ai/resources/{kind}/{namespace}/{name}
GET /api/ai/neighborhood/{kind}/{namespace}/{name}    ← 이웃 관계 요약
```

**Radar의 통찰:** LLM에게 raw YAML을 주면 컨텍스트 창을 태운다. 그래서 **토큰 최적화된
전처리 데이터**(토폴로지 그래프, 헬스 판정, 중복 제거된 이벤트, 필터된 로그)를 준다.

**우리 AI 챗·RCA가 정확히 이 형태를 써야 한다.** 지금 우리는 이런 계층이 없다.

### 5-4. 제외

`/api/local-terminal`(로컬 셸), 이미지 파일시스템 뷰어, Cost(OpenCost), CAPI,
GitHub star, desktop bridge.

---

## 6. 우리가 Radar보다 나아가는 것 (차별점)

| | Radar | Opsia |
|---|---|---|
| 클러스터 | 컨텍스트 전환 (한 번에 하나) | **멀티클러스터 동시** |
| 연결 | 노트북 → k8s API 직접 | **아웃바운드 에이전트** (중앙에 kubeconfig 없음) |
| 데이터 | 실시간 informer (휘발) | **이벤트 소싱 + 아웃박스 + 감사 원장** |
| 쓰기 | kubectl처럼 직접 | **Git PR만** (단일 writer 불변식) |
| diff | Git↔클러스터 (드리프트) | **3-way** (old_desired / live / new_desired) |
| 장애 | 이벤트 나열 | **규칙 우선 RCA + 증거 + 검증된 복구 PR** |
| AI | MCP 서버 (외부 AI가 질의) | **내장 RCA + 맥락 챗 + 복구 제안** |

**Radar는 "보여준다". Opsia는 "고친다".**

---

## 7. 이식 계획

### 7-1. 라이선스 (반드시)

Radar는 **Apache-2.0**. 우리도 오픈소스이므로 사용 가능하나:
1. 저장소 루트에 `NOTICE` 생성 — 원저작자(Skyhook), 라이선스, 출처 URL.
2. 파일별 헤더는 추가하지 않고 루트 `NOTICE`에 상당한 수정·재작성 사실을 표기.
3. `README.md`에 "Radar(Apache-2.0)의 UI 컴포넌트를 일부 이식·개작" 명시.
4. `references/upstream/` 에 **고정 커밋으로 서브트리** (추적 가능하게).

**이걸 안 하면 오픈소스 공개 시 라이선스 위반이다.**

### 7-2. 디자인 — 우리 모듈화를 유지한다 (우녕 확정)

**Radar 컴포넌트를 가져오되, 우리 토큰으로 다시 칠한다.**
- primitive 정본은 **`frontend/src/components/ui/` 한 곳뿐** (VP-013).
- Radar의 `packages/k8s-ui/src/components/ui/` 48개는 **shadcn primitive로 매핑**한다.
  (Badge→badge, Tooltip→tooltip, ConfirmDialog→alert-dialog, Toast→sonner …)
  대응이 없는 것(YamlEditor, HealthRing, DistributionBar, SummaryTile, Facet,
  SortableTh, MultiSelectPicker)은 **shadcn primitive를 조합해서** 만든다.
- Radar의 theme CSS 변수 → **우리 `theme.css` 토큰으로 치환**. 색을 가져오지 않는다.
- 아이콘: Radar도 **lucide-react**를 쓴다. 그대로 간다.
- 차트: Radar는 자체 `charts/`. 우리는 **recharts 단일화**(VP-013). 재작성한다.

**절대 금지:** Radar의 색·간격을 하드코딩으로 가져오는 것. 토큰만.

### 7-3. 순서

```
P0-A. references/upstream/ 완결 스냅샷 + NOTICE + Apache-2.0 전문
P0-B. packages/k8s-ui/ui/ 48개 → 우리 shadcn primitive 매핑표 작성
P0-C. TimelineStrip + scrubber-math  → VP-012 2층 (기획 교체)
P0-D. TopologyGraph + layout(ELK)    → VP-012 3층 (빈 슬롯 채움)
P0-E. BottomDock + LogsTab           → VP-012 신규 (하단 독)
P0-F. resources/renderers 108개      → Resources 상세 (kind별)
P1-A. ChecksView + audit 31체크      → Checks 화면
P1-B. ApplicationsView/Detail        → Applications (+ 우리 드리프트 탭)
P1-C. gitops/ 23파일                 → GitOps [동기화 상태] 탭
P1-D. Helm 15파일                    → Helm (읽기 전용 + PR 설치)
```

**각 단계는 백엔드 계약이 선행돼야 한다.** 프론트만 가져오면 빈 화면이다.
§5의 API를 BQ로 등록하고 병렬로 만든다.

---

## 8. 백엔드 신규 계약 (BQ 등록 요구)

| BQ | Radar API | 화면 |
|---|---|---|
| BQ-054 | `GET /api/api-resources` (CRD 포함 kind 디스커버리) | Resources 필터 |
| BQ-055 | `GET /api/resource-counts` | Resources·Home |
| BQ-056 | **`GET /api/topology`** (노드·엣지) | VP-012 3층 그래프 |
| BQ-057 | **`GET /api/changes`** (리소스 변경 diff + 히스토그램 버킷) | VP-012 2층 스크럽 |
| BQ-058 | **`SSE /api/pods/{ns}/{p}/logs/stream`** | 하단 독 로그 |
| BQ-059 | `SSE /api/workloads/{kind}/{ns}/{name}/logs/stream` | 하단 독 워크로드 로그 |
| BQ-060 | **`GET /api/audit`** (31개 감사 체크) | Checks |
| BQ-061 | **`GET /api/capabilities`** (RBAC 기반 버튼 노출) | 전 화면 |
| BQ-062 | `GET /api/cluster/namespace-scope` | 필터 |
| BQ-063 | `GET /api/certificates` (TLS 만료) | Checks·Home |
| BQ-064 | `GET /api/dashboard/helm` (읽기) | Helm |
| BQ-065 | `GET /api/metrics/pods/{ns}/{p}/history` | 스파크라인·차트 |
| BQ-066 | **`GET /api/ai/resources/*`, `/api/ai/neighborhood/*`** (토큰 최적화) | AI 챗·RCA |
| BQ-067 | `WS /api/pods/{ns}/{p}/exec` (P1) | 하단 독 터미널 |
| BQ-068 | `GET/POST/DELETE /api/portforwards` (P1) | 하단 독 |

기존 BQ-035~038(대시보드), BQ-039~053(VP-014)와 병행한다.

---

## 9. 문서 갱신 요구

이 문서가 착륙하면 아래를 **수정**해야 한다:

| 문서 | 수정 |
|---|---|
| **VP-012** §1.2 | 시간 스크럽 바를 **Radar TimelineStrip 모델로 교체** (§3-1) |
| **VP-012** | **하단 독(BottomDock) 절 추가** (§3-2) |
| **VP-012** §1.3 | 그래프를 **Radar TopologyGraph + ELK layout**으로 확정 |
| **VP-014** §2 | GitOps를 **2탭(변경 / 동기화 상태)**으로 (§3-3) |
| **VP-014** §5.4 | **AI 채팅 메뉴를 살린다** (우녕 정정). 플로팅 버튼과 **둘 다** |
| **VP-013** | Radar `ui/` 48개 → shadcn primitive **매핑표 추가** |
| **SESSION-BOOTSTRAP** §5-1 | **`scripts/radar.sh` 삭제 지시 취소.** 레퍼런스 실행 스크립트다 |
| **backend-f-workqueue** | BQ-054~068 등록 |
