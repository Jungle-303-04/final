# Opsia 통합 기획서 — Master Spec v1

> **문서의 지위**: 이 문서는 프론트엔드 demo→dev 병합의 결정 문서다. 저장소 전체 문서 루트와 위키형 입구는 `docs/README.md`다.
> - `DESIGN-RULES.md` = 시각·모션 **세부 규칙집** (이 문서의 4장이 위임하는 하위 문서. 충돌 시 본 문서 우선)
> - `DEMO-MERGE-PLAN.md` = **폐기(superseded)**. 유효한 내용은 본 문서 7장에 전부 흡수됨. 참조 금지.
> - 실행 주체: **코덱스(제품 코드, dev 브랜치)**. 데모(`devpreview-*`)는 사양 원본이며 **동결**된다.
> - 대원칙: **같은 기능은 정확히 한 곳에서 한 번 정의된다. 같은 개념은 하나의 이름·하나의 아이콘·하나의 색을 가진다. 두 화면이 다른 숫자를 말하면 그것은 버그다.**

---

## 0. 용어 사전 (전 화면·전 문서 공통 — 다른 표기 발견 시 이 표로 교정)

**내비게이션은 8항목이 전부다** (D19 병합 IA 확정). 병합 전 라우트는 전부 리다이렉트로만 존속.

| 표준 용어 (ko) | 표준 용어 (en) | 라우트 | 흡수한 것 (리다이렉트) | 금지 표기 |
|---|---|---|---|---|
| 홈 | Home | `/home` | 클러스터 목록(`/clusters`→) | 대시보드, Overview |
| 리소스 | Resources | `/resources` | 트래픽(`/traffic`→ 흐름 관점) | 인벤토리, 카탈로그(단독) |
| 배포 | Deploy | `/deploy` (신설) | 애플리케이션(`/applications`→)·GitOps(`/gitops`,`/workflows`→)·Helm(`/helm`→) | 워크플로, 앱스 |
| 인시던트 | Incidents | `/issues` | 알림 규칙(`/alerts`→ 탭) | 이슈, 장애 목록("장애"는 상태 서술어로만) |
| 타임라인 | Timeline | `/timeline` | — | 감사 로그, 히스토리 |
| 점검 | Checks | `/checks` (`/audit` 별칭) | — | 감사, 정책 |
| 비용 | Cost | `/cost` | — | 코스트 |
| 설정 | Settings | `/settings` | — | 환경설정, 프리퍼런스 |

비(非)내비 표면: 상세 시트(Detail Sheet — "상세페이지" 금지), 연결 모달(Connect — 버튼 라벨 "+ 연결"), 알림 센터(벨 — "알림함" 금지), AI 패널.

기술 고유명사(Pod, Deployment, OOMKilled, kubectl, ArgoCD, Helm, YAML)는 한국어 문장 안에서도 원문 유지. 상태 어휘는 정확히 3단: **정상(ok) / 주의(warn) / 임계(crit)** + 보조 2단 **대기(pending) / 비활성(ghost)**. "위험", "심각", "에러" 등 유의어를 UI 카피에 쓰지 않는다.

---

## 1. 레퍼런스 분석 → 제품 원칙

### 1.1 조사 대상과 결론

| 레퍼런스 | 관찰된 패턴 | 우리 채택 |
|---|---|---|
| **벤치마크 최소선 A: 클러스터 목록** | 홈=클러스터 목록. 행당 정보: 색상 상태 배지(Active 초록/Updating 파랑/Error 빨강) + 이름 + 프로바이더 + 버전 + 노드 수 + CPU/MEM. 인벤토리·차트는 클릭 후 상세 대시보드 | 클러스터 카드 v6 (2.3) + 드릴 후 개요 스트립 |
| **벤치마크 최소선 B: 클러스터 사용률 목록** | 테이블: 이름·위치·플릿·노드·코어·메모리. 사용률 탭에서 CPU/MEM/디스크 정렬. 상세는 행 클릭 | 목록은 스캔용 최소 열 구성, 정렬 가능 사용률 |
| **벤치마크 최소선 C: 운영 Overview** | Overview 상단 = 상태 체크(Cluster/Control Plane/Operators). Details 박스=버전·채널, Cluster inventory=노드/파드 카운트(+문제 파드 느낌표 링크), Utilization=CPU/MEM/FS/NET + Top consumers 드릴 | 상태 요약 줄, 개요 스트립의 인벤토리 링크(클릭=해당 종류 표로 전환), 임계 카운트에 배지 |
| **벤치마크 최소선 D: 디자인 시스템·차트·AI 채팅** | 의미 토큰 단일 소스, 정보 우선 차분한 표면, 차트 문법(점선 그리드+크로스헤어+펄스), 스트리밍 채팅 패턴 | `DESIGN-RULES.md` 전체 (토큰·차트·AI 채팅) |
| **벤치마크 최소선 E: HIG·알림 센터** | 컬러는 데이터에만, 헤어라인 구분, 스프링 모션, 알림=반투명 블러 일시 표면 | 모션 3종 스프링, 알림 센터 시각, 상태색 장식 금지 |

### 1.2 도출된 3원칙 (모든 화면 설계의 심사 기준)

1. **목록은 스캔, 상세는 드릴.** 목록 단위(카드·행)에는 식별(이름·버전) + 상태(배지) + 핵심 카운트 + 사용률 요약까지만. 인벤토리 나열·차트·ARN 등은 드릴 후 표면에.
2. **단일 데이터 세계.** 화면의 모든 숫자는 단일 소스(제품: zod 검증된 API 응답 / 데모: `podInventory·nodeInventory·repoInventory`)에서 파생된다. 파생 경로가 두 개면 하나를 지운다.
3. **하나의 개념 = 하나의 정의.** 컴포넌트·색·아이콘·이름·이벤트 모두. 중복 발견 시 3장의 결정표에 오너를 지정하고 나머지를 제거한다.

---

## 2. 현재 자산 감사 (2026-07 기준, 코드 검증 완료)

### 2.1 저장소·브랜치 지형

| 체크아웃 | 브랜치 | 역할 | 상태 |
|---|---|---|---|
| `SW_AI_W17-21-final` | `demo/motion-animations` | **데모(사양 원본)** — `devpreview-*.html/tsx`, `src/devpreview/` | 활발. 제품 번들과 완전 격리(`index.html`은 `src/main.tsx`만 로드) |
| `SW_AI_W17-21-final-dev` (worktree, 같은 .git) | `dev` | **제품 본선** — 13 서피스 + dev 전용 10 피처 | 활발(코덱스). 머지 목적지 |

- `src/features/filters/devpreviewDeepLinks.ts`(`?svc/?crit/?focus`)는 **demo 체크아웃에만 존재**하며 import처도 devpreview 파일뿐이다 — 제품(dev) 오염은 아님. P0에서 dev 부재를 확인만 하고, 정식 딥링크는 6.3 계약으로 신설한다.
- **dev 전용 10 피처(머지 시 회귀 보호 대상)**: `diagnose`, `namespace-scope`, `preferences`, `resource-files`, `rightsizing`, `runtime-status`, `service-access`, `shell-sessions`, `shell-state`, 확장된 `settings`.

### 2.2 제품(dev) 인프라 — 이식의 그릇

- React 19 + Vite 6 + TS 5.7, `react-router-dom` v7. 라우트 단일 소스 `src/app/productRoutes.ts` (13 서피스 + `g h`~`g s` 단축키, 별칭·아이콘·라벨 전부 카탈로그 파생 — **페이지 안 하드코딩 없음. 이 원칙을 데모 이식에도 그대로 적용**).
- 스타일: Tailwind v4 + 컴포넌트 프리미티브 + **`src/styles/tokens.css`(oklch) 단일 토큰**. `scripts/product-design-guard.mjs`(`npm run check:design`)가 하드코딩 hex를 차단(현재 제품 코드 위반 1건: `ResourceManifestCreateDialog.tsx:199` 에디터 크롬 — 7장 P1에서 토큰화).
- 상태: ports+composition (`app/productComposition.ts`, `composition/surfaces/*`), `use*DataFrame` 훅 + `serverRefreshScheduler`. react-query 없음(도입하지 않는다).
- API: `api/client.ts` fetch 래퍼, 전 응답 zod 검증, SSE(`alert-events`, `operation-events`, `diagnose`, `log-stream` 등) + WS(`live`, `pod-terminal`).
- i18n: 자체 시스템(`shared/i18n/`), 기본 ko. **리터럴 금지 가드 존재** — 데모의 한국어 리터럴은 이식 시 전부 키 등록.
- 모션: `motion` v12 + `src/motion/tokens.css`. 그래프: `@xyflow/react`+elk. 차트: recharts v3 + 토큰 파생 팔레트(`shared/ui/charts/colors.ts`).

### 2.3 데모(사양 원본) — 이식할 알맹이

| 데모 자산 | 파일 | 확정된 사양(요지) |
|---|---|---|
| 통합 셸 | `devpreview-unified.tsx` | 내비 레일(접힘·1100px 자동), 헤더(스코프 칩·ns 필터·⌘K 단일 검색·벨), Surface 3종(`resources/connect/topology`), z-계층 계약(6.4) |
| 드릴 맵 | `devpreview-opsia.tsx` | 클러스터(카드 v6)→노드(개요 스트립+4칸 그리드)→파드 드릴, 렌즈(svc/cfg/git/crit), 상태 요약 줄, `clusterStats()` 공용 계산 |
| 클러스터 카드 v6 | 〃 | 상태 필(데모 표기 "Active/장애 N" — 제품 라벨은 D1의 상태 어휘가 최종)+프로바이더 배지+이름+버전 / `노드 R/N ready · 파드 P · 임계 c · 네임스페이스 n` 한 줄 / CPU·MEM 미니 바 2개. **그 외 정보 금지** |
| 개요 스트립 | 〃 | 드릴 후 상단: 계정·버전·ns / CPU·MEM used/total·NET·DISK / ARN / 자동갱신 + 리소스 종류 링크 6종(클릭=해당 종류 표) |
| 상세 시트 | `devpreview-unified.tsx` `DetailOverlay` | top=실측 헤더, left=내비 폭, 우측 AI 폭 회피(`rightInset`), 좌변 드래그 리사이즈, AI 열림 시 `forceFull`, 탭 overview/yaml/events/logs/rbac, YAML 편집→diff(y-del/y-add)→적용 토스트, 재시작→이벤트 파생, 복제 수 +1→ScalingReplicaSet |
| 표 | 〃 `ResourceTable` | 가로 스크롤 금지(`minmax(48px,w)`), 내부 스크롤+sticky 헤더+`scrollbar-gutter`, 검색 하이라이트, 행 스태거(8개 캡), 빈 상태=필터 설명+해제 버튼 |
| 알림 | 〃 + `devpreview/bus.ts` | 버스 `DemoAction{kind:"alert_rule"|"connect"}` → 토스트(일시)+벨 세션 노트(지속). 벨=블러 카드, 클릭=해당 리소스 딥링크 |
| AI | `devpreview-ai.tsx` | FAB(z75, 열리면 숨김)→오버레이(z72, 폭 드래그), 파트 스트리밍(steps/result/evidence/links/action), action=알림 규칙 생성 카드→버스 발화 |
| 연결 | `devpreview-connect.tsx` | 모달 팝업(서피스 전환 금지), `initialView "repo"|"cluster"` 딥오픈, 완료→버스 발화→모달 자동 닫힘 |
| 토폴로지 | `devpreview-topology.tsx` | 호출 흐름, 화살촉 없는 흐름 대시, 노드·엣지 클릭=Service 상세 시트(팝업 금지) |
| 토큰 | `devpreview/theme.ts` | UI/BLUE/HP/TINT/TYPE/모션/ELEV/RADIUS — 4장의 매핑표로 제품 토큰에 흡수 후 **파일 자체는 데모 전용으로 존속** |
| 6개 서피스 견본 | `devpreview-surfaces.tsx` | 배포(탭3)·인시던트(탭2)·타임라인·점검·비용·설정 — 5.7~5.10 사양의 데모 구현. `costModel()`·`timelineItems()` 단일 소스 |
| 위젯 부품 | `devpreview/widgets.tsx` | WidgetFrame·KpiValue·RatioBar·MiniBars·Donut·RankList·MultiLine·MiniTimeline·RingGauge — D13/D21 부품의 데모 원본 |
| 브랜드 아이콘 | `devpreview/brandIcons.tsx` | AWS(EKS)/GitHub/Redis/PostgreSQL simple-icons 패스 — 제품 `ClusterProviderIcon` 계열로 이식 |

### 2.4 감사에서 확정된 결함 목록 (전부 3장·7장에서 해소됨 — 방치 금지)

| # | 결함 | 해소 위치 |
|---|---|---|
| F1 | 알림 표면 3중(sonner / OperationStatusCenter / AlertEvents 벨) — "완료" 알림이 두 곳에서 정의될 수 있음 | D4 |
| F2 | 테이블 4종 각자 구현 + `@tanstack/react-table` 설치만 되고 미사용 | D5 |
| F3 | `@tabler/icons-react` 의존성 잔존(설치만, src import 0건) | D8 |
| F4 | 상세 뷰 2계보(`ResourceDetailSheet` vs `/workload/:kind/:ns/:name` 라우트) | D3 |
| F5 | `ResourcesCatalog` Core/Mobile/Parts 3변형 드리프트 위험 | D5 비고 |
| F6 | 명칭 혼선: issues=Incidents, `/gitops`=`/workflows`, `/checks`=`/audit` | 0장 용어 사전 |
| F7 | 데모 딥링크(`?svc/?crit/?focus`)가 정식 URL 계약과 별도 존재(demo 한정) | 6.3 |
| F8 | 제품 하드코딩 hex 1건(에디터 크롬) + demo hex ~140개 | P1·4장 |
| F9 | dev 전용 10 피처가 main에 없음 — 머지 방향 착오 시 회귀 | 7.1 브랜치 규칙 |
| F10 | 데모 `PRESENT_SCALE`(zoom 1.25) 좌표계 특례 — 제품에 새어들면 안 됨 | 4.5 |
| F11 | **모션 2계보**: `motion` v12 + `tw-animate-css`(프리미티브 개폐)가 각자 duration/ease 보유 | D17 |
| F12 | **차트 2계보**: 데모 수제 SVG(MetricChart) vs 제품 recharts 래퍼 | D13 |
| F13 | **드릴 맵 2계보 위험**: 데모 맵 vs 기존 `ResourcesPhysicalTopologyScene` — 오너 미지정 시 병렬 구현 | D12 |
| F14 | **스코프 2계보 위험**: 데모 헤더 스코프 칩·ns 드롭다운 vs 기존 `cluster-scope`+`namespace-scope` 피처 | D14 |
| F15 | **diff 2계보**: `UnifiedDiff` vs `HelmResourcesDiffView` vs 데모 diff | D15 |
| F16 | 표 내부 검색 인풋 잔존: `pages/gitops/GitOpsSyncSearch.tsx` — D6 위반 사례 | D6 |

---

## 3. 기능 단일화 결정표 (Decision Table — 이 표가 중복의 최종 심판)

각 결정 D#: **오너(단일 정의 위치) / 흡수되는 것 / 제거되는 것 / 금지 사항**.

### D1. 클러스터 목록·카드
- **오너**: `pages/clusters/ClusterCard.tsx`(카드 정의) — 목록 표면은 **홈**(D19: `ClustersPage` 은퇴, `/clusters`→`/home` 리다이렉트)
- **흡수**: 데모 카드 v6 사양 그대로 — 상태 필(라벨은 상태 어휘로: `정상` 초록 펄스 / `임계 N` 임계 틴트. 데모의 "Active/장애 N" 표기는 본 표기로 대체), 프로바이더 배지(D8 브랜드 아이콘), 이름+K8s 버전, 카운트 한 줄(`노드 R/N ready · 파드 P · 임계 c · 네임스페이스 n`), CPU/MEM 미니 바 2개, 카드 끝에 `+ 클러스터 연결` 점선 카드(클릭=D7 모달).
- **제거**: 카드 내 링 차트·스파크라인·ARN·인벤토리 나열 일체(레퍼런스 3사 공통 근거).
- **금지**: 클러스터 카드의 두 번째 구현. 홈(유일한 목록)과 `/resources` 지도 관점의 클러스터 단계가 **같은 `ClusterCard`**를 쓴다(밀도 차이는 `variant` 프롭 하나로만).

### D2. 클러스터 드릴 후 개요
- **오너**: `/resources` 물리 토폴로지의 노드 뷰 상단 **개요 스트립**(데모 `ClusterOverview` 사양).
- **구성**: 1행 계정·버전·네임스페이스 수 / 2행 CPU `used/total cores`·MEM `used/total Gi`·NET·DISK / 3행 ARN(모노)·자동갱신 상태 / 우측 리소스 종류 링크 6종(클릭=해당 종류 표 전환, 스코프 유지).
- **계산**: 데모 `clusterStats()`와 동일한 파생 규칙을 제품 어댑터에 재현 — 카드(D1)와 스트립이 **같은 함수**에서 숫자를 얻는다. 다르면 버그.
- **제거**: `/clusters` 상세 다이얼로그에 사용률 차트를 넣으려는 시도(개요는 여기 한 곳).

### D3. 리소스 상세
- **오너**: `pages/resources/ResourceDetailSheet.tsx` (시트형).
- **흡수**: 데모 `DetailOverlay` 계약 전부 — (a) 시트는 상단바·좌측 내비를 **절대 덮지 않는다**(top=실측 헤더 높이, left=내비 폭), (b) 좌변 드래그 리사이즈, (c) AI 패널 열림 시 `forceFull` + `rightInset=aiW`로 전체화면 전환(수동 축소 버튼 비활성), (d) 탭 = `개요 / YAML / 이벤트 / 로그 / RBAC` — **'관련 리소스' 탭 금지**(관련 리소스는 개요 탭의 관계도+링크로만), (e) YAML 편집→diff 프리뷰→적용(제품은 기존 dry-run/approve 플로 유지), (f) 액션(재시작·스케일)은 이벤트 탭과 알림(D4)에 즉시 반영.
- **정리(F4)**: `/workload/:kind/:namespace/:name` 라우트는 **딥링크 진입점으로만 존속**하며, 렌더링은 동일 `ResourceDetailSheet`를 전체화면 모드로 여는 래퍼가 된다. `WorkloadDetailRoute` 고유 UI는 시트 탭으로 흡수. 상세 UI 정의는 시트 한 곳.
- **히스토리**: 시트 열림=history push(URL 갱신, 6.3 코덱) — 브라우저 뒤로가기와 `Esc`는 동일하게 시트를 닫는다. 새로고침=같은 시트 복원.
- **편집 충돌**: YAML 편집 모드 진입 시 해당 리소스 자동 갱신 일시정지. 적용 시점에 서버 리비전이 다르면 diff를 서버 최신 기준으로 재생성해 재확인(무경고 덮어쓰기 금지).

### D4. 알림 (F1 해소 — 발화 규칙은 6.2가 유일한 정의)
- **오너**: 헤더 **벨 = 알림 센터**(지속 기록, 데모 벨 사양: 블러 카드, 항목 클릭=해당 리소스 상세 시트 딥오픈) + **sonner 토스트**(일시 반영, 동일 이벤트의 그림자).
- **흡수**: `OperationStatusCenter`는 독립 표면을 잃고 알림 센터 상단의 **"진행 중" 섹션**이 된다(스토어·SSE 어댑터는 재사용, UI만 벨 안으로). `AlertEventsProvider`의 unread 배지는 벨 배지로 이동(사이드바 배지 제거).
- **제거**: 사이드바 알림 배지, 독립 OperationStatusCenter 패널.
- **금지**: 같은 사건이 토스트 2회 또는 벨 2항목이 되는 경로. 발화는 6.2 표의 단일 매핑으로만.
- **읽음 규칙**: 항목 식별은 서버 이벤트 id(멱등 — 재수신 시 중복 생성 금지). 읽음 처리=벨 열람 시 일괄(개별 읽음 UI 없음), 미확인 수=마지막 열람 시각 이후 항목 수(로컬 보존). "모두 지우기"=클라이언트 목록 비움(서버 이력은 타임라인이 보존).

### D5. 표 (F2·F5 해소)
- **오너**: 신규 공용 `shared/ui/table/ResourceTable.tsx` — 데모 표 사양(2.3) + 컬럼 정의는 데이터로 주입.
- **규모·정렬 규칙**: 행 200개 초과 시 `react-virtuoso` 가상 스크롤(기존 의존성 재사용 — 두 번째 가상화 도입 금지). 정렬=단일 컬럼 토글, 기본 정렬은 모든 표 공통 `상태(임계→주의→정상) → 이름`. 페이지네이션 금지(내부 스크롤+가상화로 통일). 좁은 폭에서는 컬럼 우선순위(이름·상태 최후 생존)로 축소.
- **수렴**: `ResourcesTable` → 즉시 교체(P2), `IssuesTable`·`ApplicationsTable`·`GitOpsSyncTableView` → 순차 교체(P5). 교체 전까지 신규 표 기능 추가 금지(드리프트 방지).
- **제거**: `@tanstack/react-table` 의존성(미사용 확정).
- **비고(F5)**: `ResourcesCatalog` 3변형은 공용 표 도입 시 `Core` 하나로 수렴하고 반응형은 CSS로만 분기.

### D6. 검색
- **오너**: 헤더 ⌘K 단일 검색(`ProductCommandPalette`, cmdk) — 데모 확정 사양: 리소스·서비스·저장소 통합 인덱스, 결과 선택=상세 시트 or 스코프 전환.
- **제거**: 표 상단 개별 검색 인풋(데모에서 이미 확정된 "검색 이원화 제거" 결정) — 현존 위반 사례 `pages/gitops/GitOpsSyncSearch.tsx`는 P5에서 제거하고 전역 검색+스코프 파생으로 대체. 표의 행 하이라이트·필터링은 전역 검색어와 현재 스코프(클러스터·ns·렌즈)에서 **파생**될 뿐, 표가 자체 검색 상태를 갖지 않는다.
- **금지**: 검색 결과 드롭다운에 갈 곳 없는 "전체 결과 보기" 류의 항목.

### D7. 연결(클러스터·Git)
- **오너**: 클러스터=`pages/clusters/ClusterConnectDialog.tsx`(기존). Git=**신규** `pages/gitops/RepoConnectDialog.tsx`(dev에 저장소 등록 다이얼로그가 현재 부재함을 코드로 확인 — 데모 `ConnectWizard`의 repo 뷰 사양으로 신설). 두 다이얼로그의 진행 스테이지 UI는 P2의 공용 부품(`shared/ui/connect/ConnectStages.tsx`)을 공유한다(두 번째 스테이지 구현 금지).
- **사양**: 데모 `ConnectWizard` 모달 계약 — 문맥 진입 2곳(홈의 `+ 클러스터 연결` 카드 / `/deploy` 저장소·동기화 탭의 `+ 저장소 연결`), **모달 팝업이며 서피스 전환 금지**, `initialView: "repo"|"cluster"` 딥오픈, 진행 스테이지 시각은 3그룹(에이전트 설치→핸드셰이크→동기화)이되 **단계 상태는 실제 `api/cluster-connection`·등록 API의 진행 이벤트에서 파생**(데모의 고정 타이머 금지), 완료 시 D4 발화 + 모달 자동 닫힘 + 목록 반영.
- **진입점은 문맥뿐이다**: 홈의 `+ 클러스터 연결` 카드와 `/deploy` 저장소·동기화 탭의 `+ 저장소 연결` — 연결이 필요한 바로 그 자리에서 팝업으로 열리고 완료 흐름이 그 자리에서 끝난다.
- **제거**: 내비의 "연결 설정" 항목(데모 셸의 `connect` Surface 포함), `/settings` 안의 연결 관리 섹션 — **설정은 전역 앱 설정만 담는다(D20)**. 연결을 페이지로 만들지 않는다.

### D8. 아이콘 (F3 해소)
- **오너**: `lucide-react`(기능 아이콘) + `shared/ui/brand/`(브랜드: AWS·GitHub·Redis·PostgreSQL은 데모 `brandIcons.tsx` 이식, ArgoCD는 simple-icons에서 신규 추가. `ClusterProviderIcon`과 통합).
- **제거**: `@tabler/icons-react` 의존성 — src import 0건 확인됨, package.json에서 즉시 제거(치환 작업 없음).
- **규칙**: 같은 개념=같은 아이콘(Service=Plug, Pod=Box, Node=Server, 저장소=GitHub/GitBranch). 카드형 텍스트 뱃지로 브랜드를 표기하지 않는다(실 로고 사용).

### D9. AI 어시스턴트
- **오너**: `app/AiAssistantPanel.tsx` + `features/diagnose/`.
- **흡수**: 데모 규칙 — FAB는 우하단 최상위(패널 열리면 소멸), 패널은 우측 도킹(폭 드래그), 상세 시트와 공존 시 시트는 `forceFull`(D3-c), 현재 화면 컨텍스트(`contextView/contextScope` 개념 → 기존 `app/aiAssistantContext.ts`에 매핑), action 파트(알림 규칙 제안 카드)=`app/AiAlertRuleActionCard.tsx` 재사용, 생성 완료는 D4 발화.
- **금지**: AI가 열릴 때 본문 리플로(화면 축소) — 오버레이/도킹만.

### D10. 토폴로지 4종 역할 분리 (중복 아님 — 역할 정의로 고정)

| 그래프 | 위치 | 답하는 질문 | 상호 링크 |
|---|---|---|---|
| 물리 토폴로지(드릴 맵) | `/resources` | "어디서 돌고 있나" (클러스터→노드→파드) | 파드 클릭=상세 시트 |
| 관계 토폴로지 | `/resources` 상세 시트 개요 탭 | "이 리소스와 무엇이 엮였나" | 노드 클릭=해당 상세 시트 |
| 트래픽 흐름 | `/resources` 흐름 관점(D18·D19) | "호출이 어떻게 흐르나" (데모 topology 사양: 흐름 대시, 화살촉 금지, 클릭=Service 상세 시트) | 서비스 클릭=상세 시트 |
| GitOps 워크플로 | `/gitops` | "배포가 어떤 단계를 거치나" | 단계 클릭=해당 리소스/실행 |

- **금지**: 한 그래프에 다른 그래프의 질문을 겸하게 하는 확장(예: 트래픽 그래프에 노드 배치 표시).

### D11. 문서
- **오너**: 본 문서. `DESIGN-RULES.md`는 4장에서 위임한 시각 세부만 담는다(기능·IA·이벤트 서술 금지). `DEMO-MERGE-PLAN.md`는 헤더에 폐기 선언만 남긴다.

### D12. 드릴 맵 (F13 해소)
- **오너**: 기존 `pages/resources/ResourcesPhysicalTopologyScene.tsx`를 **데모 사양으로 재작성**(2.3 드릴 맵·카드 v6·개요 스트립·`clusterStats`).
- **금지**: 데모 맵을 별도 신규 컴포넌트로 나란히 추가(병렬 구현). 데모 파일 복사.

### D13. 차트 (F12 해소)
- **오너**: `shared/ui/charts/`(recharts 래퍼 + 토큰 팔레트). 데모의 수제 SVG `MetricChart`·미니 바·SegRing은 **사양 원본일 뿐** — 그리드/크로스헤어/펄스/pathLength 문법(DESIGN-RULES 6장)을 recharts 래퍼와 공용 미니 컴포넌트로 재현한다.
- **부품 목록(전체·이곳이 유일한 정의)**: `MiniBar` `RatioBar` `MiniBars` `Donut` `RankList` `SlotMatrix` `ProgressFill` `RingGauge`(상세 시트 개요 한정 — D21 역할 분담) + recharts 시계열 래퍼. 사용처 제한은 D21 게이지 조항.
- **금지**: 페이지 컴포넌트 안 수제 SVG 차트 신설. 두 번째 차트 팔레트. 목록 밖 시각 부품.

### D14. 스코프 (F14 해소)
- **오너**: 기존 `features/cluster-scope/` + `features/namespace-scope/`(dev). 데모 헤더의 스코프 칩·ns 드롭다운·"필터 해제"는 이 두 피처의 **표현 사양**으로 흡수한다.
- **금지**: 헤더·맵·표가 각자 스코프 상태를 갖는 것 — 스코프 저장소는 하나, 나머지는 전부 구독자.

### D15. diff (F15 해소)
- **오너**: `shared/ui/UnifiedDiff.tsx` — 데모 diff 시각(추가=ok 틴트 `y-add` / 삭제=crit 틴트 `y-del`) 흡수.
- **수렴**: `HelmResourcesDiffView`는 UnifiedDiff를 사용하도록 P5에서 리팩터(자체 diff 렌더 제거).

### D16. 우측 탐색 패널
- **오너**: `ResourcesCatalogCore`를 데모 SidePanel 탭 구조로 재작성. `Mobile`/`Parts` 변형 삭제(F5 확정 해소 — 반응형은 CSS 분기).
- **탭명 확정(용어 충돌 제거)**: `리소스 종류 | 서비스 | 구성 | 저장소` — 데모의 "설정" 탭(ConfigMap·Secret)은 서피스 `/settings`와, "배포" 탭은 서피스 `/deploy`와 이름이 겹치므로 각각 **구성**·**저장소**로 개명한다. 같은 단어가 두 표면을 가리키면 안 된다(0장 원칙).
- **규칙**: 종류 카운트=D18 목록 보기 표 행수와 동일 소스. 저장소 탭에 `+ 저장소 연결`(D7).

### D17. 모션 시스템 단일화 (F11 해소 — 전 화면 모든 움직임의 유일한 규정)
- **오너**: **`motion` v12(motion/react) + `src/motion/tokens.css`**. 움직임의 종류별 소유:
  - 등장·전환·레이아웃·드릴·시트/모달 개폐·리스트 스태거·차트 드로잉 = **motion/react 스프링 3종(SOFT/SPRING/PAGE)+EASE_DRAW만**. 임의 duration·ease·keyframes 금지.
  - 색·보더·폭 등 미세 상태 변화만 CSS 전환 허용 — 단 duration·ease는 모션 토큰 변수(`var(--motion-*)`) 참조. 리터럴 `0.3s`, `ease-in-out` 금지.
  - 컴포넌트 프리미티브(dialog·sheet·popover·toast)의 개폐 애니메이션: `tw-animate-css` 기본값을 쓰지 않고 모션 토큰 기반 클래스로 재정의한다. 재정의 완료 후 `tw-animate-css` 의존성 제거 검토(P5). `vaul`·`sonner` 내장 모션은 토큰과 시각적으로 동일한 파라미터로 설정.
  - `usePrefersReducedMotion` 전 모션 필수 적용.
- **게이트**: `check:design`에 모션 리터럴 검사 추가(`duration-[0-9]`, `transition: .*[0-9]+m?s` grep — 토큰 변수 참조만 통과).

### D18. `/resources` 관점 모델 (IA 확정 — "지도 밑 표" 구조 폐지)
- **문제**: 드릴 맵 아래에 리소스 표가 수직으로 붙는 구조는 통일성을 깨고(사용자 관찰), 벤치마크 최소선의 Explorer/Topology 패턴에도 없는 배치다. 반면 "쿠버네티스 리소스" 사이드바 메뉴 신설은 메뉴 축소 원칙에 반한다 — 기각.
- **결정**: `/resources`는 **한 서피스, 두 관점**이다. 상단 세그먼트 토글 `지도 | 목록`(벤치마크 최소선의 Topology↔List 패턴).
  - **지도 보기**: 드릴 맵이 전체 높이(클러스터 카드→노드+개요 스트립→파드). 표 없음. 우측 D16 패널의 렌즈(서비스/구성/저장소)로 하이라이트.
  - **목록 보기**: 종류 선택(D16 패널)+D5 공용 표가 전체 높이. 맵 없음.
  - **관점 간 연속(정보 무손실 계약)**: 스코프(클러스터·노드·ns·검색어)는 하나의 저장소(D14)로 공유 — 지도에서 노드 드릴 후 목록으로 전환하면 표는 그 노드로 필터된 상태로 열린다. 개요 스트립의 종류 링크·"파드 N 보기" 류 액션=목록 보기로 전환+필터. 목록의 행 클릭=D3 시트(관점 무관 동일). 임계 칩 클릭=양 관점에서 동일 의미.
  - 관점 상태는 URL(6.3 코덱)에 기록 — 새로고침·딥링크에 보존.
- **금지**: 한 화면에 지도와 표 동시 렌더(요약 줄·개요 스트립은 표가 아니므로 허용). 관점별 별도 스코프.
- **확장(D19와 연동)**: 관점은 3개다 — `지도 | 목록 | 흐름`. 흐름 관점=구 `/traffic`(데모 topology 사양) 흡수. 흐름에서 서비스 클릭=D3 시트.
- **흐름의 스코프 의미론(정정)**: 흐름은 **서비스 수준** 관점이라 물리 스코프(클러스터·노드)가 적용되지 않는다 — 흐름 진입 시 스코프·ns 칩을 숨기고 "서비스 호출 관점 — 전체 클러스터"를 명시(적용되지 않는 필터를 표시하는 것은 거짓 표시다). 물리 스코프 상태 자체는 보존되어 지도·목록 복귀 시 그대로. 제품에서 서비스 수준 필터(ns·앱)는 흐름 자체 컨트롤로 추가할 수 있으나 물리 스코프 칩을 재사용하지 않는다.

### D19. 내비게이션 병합 IA (메뉴 13 → 8 — 레퍼런스 근거 병합)

| 병합 | 근거 레퍼런스 | 결과 |
|---|---|---|
| 클러스터 → 홈 | 벤치마크 최소선: 홈 = 클러스터 목록 그 자체. 별도 메뉴 없음 | `/home`이 플릿(D1 카드 그리드)의 유일한 표면. `ClustersPage` 은퇴, 카드 `⋯` 메뉴에 연결 해제(기존 `ClusterDisconnectDialog` 재사용), `+ 연결` 카드=D7 모달 |
| 트래픽 → 리소스 흐름 관점 | 벤치마크 최소선: 토폴로지·목록 토글 한 화면, Tree↔List 관점 전환 | D18 3관점. 내비에서 트래픽 삭제 |
| 애플리케이션+GitOps+Helm → 배포 | 벤치마크 최소선: 애플리케이션이 중심 개체고 Git 동기화는 앱의 속성. Helm 릴리스=설치된 애플리케이션의 한 형태 | `/deploy` 단일 서피스, 탭 3: `애플리케이션(기본) | 저장소·동기화 | Helm 릴리스`. 상세 계약은 5.4·기존 상세 페이지 유지 |
| 알림 → 인시던트 탭 | 벤치마크 최소선: 관제 탭과 모니터링 규칙이 한 지붕 | `/issues` 탭 2: `인시던트(기본) | 알림 규칙`. 알림 **이벤트 스트림**은 페이지가 아니라 벨(D4)이 오너 — 이벤트 목록 페이지를 만들지 않는다 |

- **원칙**: 내비 항목은 "사용자가 아침에 여는 질문" 단위다 — 무엇이 떠 있나(홈)/무엇이 돌고 있나(리소스)/무엇을 내보내나(배포)/무엇이 터졌나(인시던트)/무엇이 바뀌었나(타임라인)/규칙을 지키나(점검)/얼마 드나(비용). 이 질문에 안 걸리는 메뉴는 존재할 수 없다.
- **구현**: `productRoutes.ts` 카탈로그에서 병합 라우트를 리다이렉트로 강등, 단축키 재배치(`g h/r/d/i/l/u/c/s`). 기존 페이지 컴포넌트는 탭 콘텐츠로 재사용(기능 삭제 아님 — **표면 병합**이다. 정보 손실 0).

### D20. 셸 헤더·계정·설정의 범위
- **헤더 좌→우 고정 배치**: ① **워크스페이스**(맨 왼쪽 — 정체성은 항상 좌측 시작점) ② 스코프 칩(클러스터·ns) ③ (중앙) ⌘K 검색 ④ (우측) 자동갱신 상태 · 벨 · 로케일/테마 ⑤ **계정 메뉴(맨 오른쪽)** — 아바타, 열면 프로필(이름·이메일)·워크스페이스 관리·로그아웃.
- **정리**: 사이드바의 `SidebarProfileMenu`·`SidebarWorkspaceSwitcher`는 헤더로 이동하고 사이드바에서 제거(dev 최근 커밋 "상단바 워크스페이스/프로필 배치"가 이 방향 — 위 배치 순서로 확정). 계정·워크스페이스 UI는 헤더 한 곳.
- **설정의 범위**: `/settings` = **전역 앱 설정만**(테마·로케일·알림 기본값·Prometheus 연동·진단). 연결 관리(D7)·워크스페이스 관리(계정 메뉴)·클러스터 관리(홈)는 설정에 두지 않는다 — "설정에 넣으면 편하다"는 유혹이 중복의 주 진입로다.

### D21. 홈 = 위젯 보드 (레퍼런스 패턴 카탈로그 기반 — Surface Spec §14가 요소 전수 판정표)
- **구조**: 홈은 3층이다 — [고정 헤더 = 상태 요약 줄·주 액션·기간 컨텍스트] / [**클러스터 섹션**(D1 카드 그리드) — 위젯이 아니라 홈의 본질이므로 보드 밖 고정] / [**위젯 보드**(W2~W8)]. 위젯은 카탈로그(Surface Spec §2.3)에서만 추가하고, `Edit layout`으로 추가·제거·드래그 배치(`@dnd-kit` — 기존 의존성 재사용, 두 번째 DnD 도입 금지). 배치·접힘 상태는 `preferences` 저장, 기간 컨텍스트는 URL(공유 가능).
- **보드 그리드**: CSS grid 12컬럼(`minmax(0,1fr)`), 위젯 기본 스팬은 카탈로그에 명기. 1280px 미만=6컬럼.
- **위젯 공용 문법** (`shared/ui/widgets/WidgetFrame.tsx` — 유일한 위젯 껍데기): 제목 `text-bodyStrong` + ⓘ 설명 툴팁(일시 표면 — 안내 문구 금지 규칙의 명시적 예외) + 우측 `>` 딥링크(반드시 실 라우트) + 접기 토글. 본문 시각은 D13 소유 부품만: `KpiCard` / `RatioBar` / `MiniBars` / `Donut` / `RankList` / `SlotMatrix` / `ProgressFill` — **부품 경로는 전부 `shared/ui/charts/`**(P2의 MiniBar와 같은 곳 — 부품 이중 경로 금지, `widgets/`에는 WidgetFrame과 홈 위젯 조립만). SlotMatrix·ProgressFill은 위젯 밖(노드 타일·벨·연결 스테이지)에서도 같은 것을 쓴다.
- **기간 컨텍스트**: 보드 우상단 셀렉터 1개(오늘/7일/30일)가 모든 시계열 위젯에 공통 적용 — 위젯별 개별 기간 토글 금지(통일성).
- **게이지는 3종뿐**(중복 차단): 연속 `MiniBar`=카드·개요 스트립·위젯, 도트 `SlotMatrix`=슬롯 점유, `RingGauge`=상세 시트 개요 순간 사용률 **한정**(카드·홈 금지 — D1 유지). 틱 게이지는 도입하지 않는다(P-02 각색 — MiniBar로 흡수, 실사용처 없는 부품을 만들지 않는다). 정의 없는 합성 점수 게이지("헬스 스코어" 류) 금지 — 근거 없는 숫자는 가짜 정보다.
- **금지**: 홈에 새 피드 구현(W8=타임라인 미니 뷰 임베드, W2=인시던트 표와 동일 어댑터), 위젯 안 개별 새로고침 버튼(자동 갱신 일원화 — 위젯 오류 시 재시도 버튼은 복구 액션이라 허용).

---

## 4. 디자인 시스템 통합 (데모 토큰 → 제품 토큰)

### 4.1 컬러 매핑표 (데모 `theme.ts` hex → 제품 `styles/tokens.css` 토큰)

데모 hex를 제품 코드에 **복사하는 것을 금지**한다. 아래 매핑으로 의미를 번역한다(값은 oklch로 제품 파일에서 정의, 라이트/다크 각각).

| 데모 토큰 | 값(데모) | 제품 토큰 | 비고 |
|---|---|---|---|
| `UI.bg` | `#FAFAFC` | `--background` | 기존 값 유지 |
| `UI.card` | `#FFFFFF` | `--card` | 〃 |
| `UI.line` / `line2` | `#E9EAEE` / `#F1F2F5` | `--border` / `--border-subtle`(신설) | 헤어라인 2단 |
| `UI.ink` / `ink2` / `ink3` | `#111318` / `#5F6570` / `#9AA0AA` | `--foreground` / `--muted-foreground` / `--caption-foreground`(신설) | 잉크 3단 초과 금지 |
| `BLUE` | `#0A84FF` | `--primary` | 선택·포커스·링크 전용 |
| `HP.ok` | `#30D158` | `--status-healthy` | 기존 status 토큰과 병합 |
| `HP.warn` | `#FFB340` | `--status-warning` | 〃 |
| `HP.crit` | `#FF5F55` | `--status-critical`(신설, 기존 `--destructive`와 별개 유지) | 파괴적 액션 색과 상태색을 섞지 않는다 |
| `HP.pending` / `ghost` | 회색 계열 | `--status-stale` / `--status-unknown` | 기존 토큰 재사용 |
| `TINT.*` (fg/bg/bd 6톤) | rgba 짝 | `color-mix(in oklch, var(--status-*) N%, transparent)` 유틸 | 임의 rgba 신설 금지 |
| 브랜드 색 | `#DC382C`(Redis) 등 | `shared/ui/brand/`의 `BRAND_COLOR` 상수로만 | 토큰화하지 않음(브랜드 고유값) |

**다크 모드**: 데모는 라이트 전용이지만 제품은 `next-themes` 다크를 지원한다. 신설 토큰(`--border-subtle`, `--caption-foreground`, `--status-critical`, 타이포·RADIUS·ELEV)은 **`.dark` 값을 반드시 함께 정의**하고(기존 `.dark` 팔레트 톤 준수), 상태색 3단은 다크에서도 WCAG AA 대비를 만족해야 한다. 다크 값 누락은 P1 게이트 실패.

### 4.2 타이포
- 데모 `TYPE`(caption 11 · label 12 · body 13 · bodyStrong 14 · title3 15.5 · title2 17 · title1 21) → Tailwind v4 `@theme` 폰트 스케일로 등록(`text-caption`~`text-title1`). 웨이트 400/600/700/800, **500 금지**. 숫자는 `font-mono + tabular-nums`.
- 제품 폰트는 Geist Variable 유지(데모의 SF Pro 폴백 체인은 데모 전용).

### 4.3 모션
- 시스템 소유·금지 규정은 **D17이 유일한 정의**다. 여기서는 매핑만: 데모 SOFT/SPRING/PAGE/EASE_DRAW → `src/motion/tokens.css` + motion 헬퍼로 등록. 용도 구속(DESIGN-RULES 3장): SOFT=등장·탭 인디케이터·토스트, SPRING=카드 레이아웃, PAGE=뷰 전환·드릴, EASE_DRAW=차트 드로잉. 리스트 스태거 `i*0.04~0.05`, 8개 캡.

### 4.4 라운드·엘리베이션
- RADIUS(tile 3→sheet 18)·ELEV(hover/pop/overlay) → 토큰 등록. 기본 카드=헤어라인, 그림자는 떠 있는 표면만.

### 4.5 데모 전용 특례 (제품 반입 금지 — F10)
- `PRESENT_SCALE`(zoom 1.25)과 그 좌표계 보정(`offsetHeight`/`clientWidth/SCALE`/`calc(100vh/SCALE)`)은 **발표용 데모에만** 존재한다. 제품은 zoom을 쓰지 않으므로 이 코드를 이식하지 않는다. 단, "오버레이는 상단바·사이드바를 덮지 않는다 / top·left는 실측값" 원칙 자체는 제품 상세 시트에 그대로 적용(D3-a).

---

## 5. 화면별 상세 사양 (이식 후 최종 모습)

모든 화면 공통: 로딩=스켈레톤(스피너 금지), 오류 화면=`ProductStateScreen` 재시도, 빈 상태=원인 설명+해소 액션 1개(설명용 안내 문구 금지), 카피=i18n 키(ko 기본), 숫자=단일 소스 파생.

### 5.1 홈 `/home` (= 플릿 + 위젯 보드 — D19·D21)
- [고정] 상태 요약 줄(클러스터/노드/파드/OutOfSync 세그먼트+임계 칩) + 페이지 주 액션 슬롯(`+ 클러스터 연결`).
- [클러스터 섹션 — 보드 밖 고정] D1 카드 그리드 + `+ 클러스터 연결` 점선 카드. [보드] 기본 배치: W2 인시던트 레일 → W3 동기화 비율 → W4 활동 추이 (W5~W8 선택 추가). 위젯 정의·바인딩은 Surface Spec §2.3.
- 카드 클릭=`/resources` 지도 관점 드릴(스코프 전달). 홈의 모든 카운트는 `/resources`와 동일 어댑터 파생. 기존 "라이브 밴드"는 W4 활동 추이로 흡수(두 번째 실시간 밴드 금지).

### 5.2 리소스 `/resources` (기함 서피스 — D18 3관점)
- 상단: 관점 세그먼트 `지도 | 목록 | 흐름` + 스코프 칩(D14 — 클러스터/노드/ns 실반영, 개별 해제).
- **지도**: 드릴 전체 높이. 클러스터 카드 그리드 → (드릴) 노드 4칸 그리드 + 상단 D2 개요 스트립 → (드릴) 파드. 우측 D16 패널 렌즈=하이라이트(파드 뷰=실필터 `파드 N/전체·필터 적용됨`, 노드 뷰=활성/비활성).
- **목록**: D16 패널에서 종류 선택(카운트=표 행수) + D5 공용 표 전체 높이. 행 클릭=D3 시트.
- **흐름**: 호출 그래프(데모 topology 사양 — 흐름 대시, 화살촉 금지, 엣지 호버=rps·p99·5xx 칩, 노드·엣지 클릭=D3 시트).
- 관점 전환 시 스코프·검색어 보존(D18 무손실 계약). 개요 스트립 종류 링크=목록 관점 전환+필터.

### 5.4 상세 시트 (전역, D3)
- 개요 탭: 팩트 패널 + 관계 토폴로지(D10) + 핵심 메트릭 차트(DESIGN-RULES 6장 문법). 액션: 재시작·스케일(복제 수 ±)·매니페스트 편집 — 이벤트 탭·알림은 6.2 매트릭스대로(진행=벨, 토스트=결과 시점 1회).
- YAML 탭: 하이라이트 뷰 → 편집 모드 → diff(추가=ok 틴트/삭제=crit 틴트) → dry-run→적용.
- 이벤트/로그/RBAC 탭: 스트림 기반, 시간 역순.

### 5.5 알림 (전역, D4)
- 벨 배지=미확인 수. 드롭다운: 진행 중(구 OperationStatusCenter) → 오늘 → 이전. 항목=아이콘+제목+본문+상대시각, 클릭=대상 상세 시트/화면 딥오픈. 모두 지우기 제공. 토스트는 우상단(헤더 아래 10px), 동일 사건 1회.

### 5.6 AI (전역, D9)
- FAB → 우측 도킹 패널(드래그 폭). 컨텍스트 줄(현재 화면·스코프) 표시. 스트리밍 파트: steps(진행)→result(임계/주의 요약 칩)→evidence(근거 카드)→links(딥링크)→action(알림 규칙 제안→생성=D4 발화). 인시던트 화면에서는 RCA 세션(`diagnose`)과 연결.

### 5.7 배포 `/deploy` (D19 병합: 애플리케이션+GitOps+Helm — 애플리케이션 중심 배포 패턴)
- 탭 3: **애플리케이션(기본)** — 카드/표(D5): 앱 이름·환경·동기화 상태(Synced/OutOfSync=상태 어휘 틴트)·마지막 배포·소스 저장소. 행 클릭=기존 `GitOpsApplicationDetailPage`를 D3 시트 계약으로(동기화 히스토리·리소스 트리·롤백). **저장소·동기화** — 연결된 저장소 목록(리비전·툴·sync 상태), `+ 저장소 연결`(D7 모달), 동기화 표(기존 `GitOpsSyncTableView`→D5 표), 워크플로 그래프·플랜 위저드(기존 유지). **Helm 릴리스** — 릴리스 표+차트 소스, 설치/업그레이드 다이얼로그(기존), diff는 D15 UnifiedDiff.
- 한 앱의 "Git 소스↔클러스터 리소스↔Helm" 관계가 탭을 넘나들지 않도록: 앱 상세 시트 안에서 전부 도달 가능(탭은 진입 관점일 뿐).

### 5.8 인시던트 `/issues` (D19 병합: +알림 규칙 — 관제 탭 패턴)
- 탭 2: **인시던트(기본)** — D5 표(심각도=상태 어휘·대상·시작 시각·상태 open/ack/resolved). 행 클릭=RCA 워크스페이스(기존 `rcaContext`+`diagnose` 연결): 타임라인 조각(원인 구간)+근거 리소스 링크(D3 시트)+AI RCA 세션(D9). **알림 규칙** — 기존 `AlertRulesPanel`(규칙 CRUD, AI 생성 규칙도 여기 나타남 — D4 발화의 착지점).
- 알림 이벤트 스트림 페이지는 없다(벨이 오너, D4). 인시던트↔알림 규칙은 "규칙이 만든 인시던트" 역링크로 연결.

### 5.9 타임라인 `/timeline` — "무엇이 바뀌었나"의 유일한 표면
- 기존 서피스 유지: 변경 스트립(배포·스케일·설정 변경·인시던트 마커) + 이벤트 상세 시트(기존 `TimelineEventDetailSheet`→D3 계약 수렴). 인시던트 RCA(5.8)가 이 타임라인의 구간 뷰를 임베드한다 — 두 번째 타임라인 구현 금지.

### 5.10 점검 `/checks` · 비용 `/cost` · 설정 `/settings`
- 점검: 기존 기능 유지, 결과 표=D5, 결과 행 클릭=대상 리소스 D3 시트(점검 탭 추가 없이 개요 탭에 위반 배지).
- 비용: 기존 기능 유지(개요+노드 비용+라이트사이징), 차트=D13 래퍼, 표=D5. 라이트사이징 제안 클릭=대상 워크로드 D3 시트.
- 설정: 기존 + D7 세 번째 진입점("연결" 섹션). Prometheus 카드 유지.
- 세 서피스 공통: 4장 토큰·D17 모션 수렴. 기능 재설계는 범위 밖이되 **표·시트·차트·상태 어휘는 예외 없이 공용 계약을 따른다**(이것이 "시각만 수렴"의 정확한 의미다).

---

## 6. 이벤트·인터랙션 모델

### 6.1 액션 버스 → 제품 이벤트 매핑
- 데모 `bus.ts`(`opsia:demo-action`, `kind: "alert_rule"|"connect"`)는 데모 전용으로 존속. 제품에서는 동일 의미를 **SSE 스트림이 담당**: `operation-events`(작업 진행/완료), `alert-events`(알림). 이식 시 버스 코드를 복사하지 않고 각 완료 지점에서 기존 스트림/스토어에 이벤트를 흘린다.

### 6.2 발화 매트릭스 (단일 정의 — 이 표 밖의 발화 금지)

모든 토스트는 **결과 시점**(성공/실패 확정)에 1회만 발화한다. 실행 시작은 토스트를 만들지 않는다(진행은 벨 "진행 중" 섹션이 담당). 5장 등 다른 절의 알림 서술은 전부 이 표의 요약이다.

| 사건 | 토스트(sonner, 결과 시점 1회) | 벨 항목 | 비고 |
|---|---|---|---|
| 클러스터/저장소 연결 완료 | ✅ "연결됨 · {이름}" | ✅ 지속 | 모달 자동 닫힘 |
| AI 알림 규칙 생성 | ✅ | ✅ | 카드 상태 created 전환 |
| 매니페스트 적용 성공/실패 | ✅ ok/crit | ✅ | diff 요약 1줄 |
| 재시작·스케일 완료(성공/실패) | ✅ | ✅ | 이벤트 탭 동시 반영, 시작 시점 무발화 |
| 장기 작업 진행 중 | ❌ | ✅ 진행 중 섹션(진척 갱신) | 완료 시 위 규칙으로 1회 |
| 알림 규칙 발화(운영 알림) | 임계만 ✅, 주의·정상 ❌(소음 방지) | ✅ + 배지 | — |

### 6.3 내비게이션 계약
- 딥링크는 dev의 **기존 URL 코덱에 통합**한다(`features/filters/filterUrl.ts`, `detailUrlCodec.ts`, `routeSearchAdapter.ts` — 신규 코덱·병렬 파서 신설 금지). 상세 시트 오픈(`kind/ns/name`)과 드릴 스코프(`cluster/scope`)를 기존 코덱에 파라미터로 등록하며, 파라미터명은 기존 계약을 따른다(기존 이름과 충돌 시 기존 이름 승리). 데모 전용 `?svc/?crit/?focus`(F7)는 제품 계약에 편입하지 않는다.
- 키보드: 기존 `g *` 유지 + `⌘K` 검색, `Esc`=최상위 표면부터 역순 닫기(토스트 제외).

### 6.4 z-계층 계약 (데모 검증값 → 제품 동일 서열)
`본문 < 연결 모달(68/69) < 상세 시트(70/71) < AI 패널(72) < 헤더(74) < FAB(75) < 토스트(80)`. 서열 위반=버그. 헤더 드롭다운(벨)은 헤더의 자식. 상세 시트는 헤더·내비를 덮지 않으므로 z보다 기하(top/left inset)가 우선 방어선.

---

## 7. 머지 실행 계획 (코덱스 단독 수행 가능 수준)

### 7.1 브랜치·소유권 규칙
- 방향: **demo → dev 단방향 이식**(체리픽·파일 복사 금지, 사양 재구현). `demo/motion-animations`는 P0 시점에 태그(`demo-freeze-v1`) 후 동결. dev 전용 10 피처(2.1)는 매 페이즈 회귀 테스트 대상.
- 각 페이즈=독립 커밋(컨벤션 `<type>: 명사 키워드 / 명사 키워드`), 페이즈 완료 게이트: `tsc --noEmit` + `npm run check:design` + i18n 가드 + `vitest` 통과.

### 7.2 페이즈

**P0 — 정지(準備)**: demo 태그(`demo-freeze-v1`)·동결 / dev에 devpreview 코드 부재 재확인(F7) + 6.3 딥링크 파라미터를 기존 코덱에 등록(스텁) / `@tanstack/react-table`·`@tabler/icons-react`를 package.json에서 즉시 제거(양쪽 모두 src import 0건 확인됨).

**P1 — 토큰 (4장 전체)**: `tokens.css`에 신설 토큰(border-subtle, caption-foreground, status-critical, 타이포 스케일, RADIUS/ELEV) + 모션 토큰 등록 / `ResourceManifestCreateDialog` hex 토큰화 / `check:design`에 신설 토큰 화이트리스트 반영. *산출: 시각 변화 없음, 토큰만 준비.*

**P2 — 공용 부품**: D5 공용 `ResourceTable`(가상화·정렬 규칙 포함) 구현+`ResourcesTable` 교체 / D8 브랜드 아이콘 `shared/ui/brand/` / 상태 필·틴트 칩 `shared/ui/status/StatusPill.tsx`·`TintChip.tsx`(전 화면이 이것만 사용) / D7 스테이지 부품 `shared/ui/connect/ConnectStages.tsx` / D13 미니 차트 부품(`MiniBar` 등) / D17 프리미티브 개폐 모션 토큰 재정의.

**P3 — 홈·클러스터 축(D19 1단계)**: D1 카드 v6(`ClusterCard` 재작성) + 홈 = 고정 헤더+클러스터 섹션까지 개편(D21 1층·2층 — 위젯 보드는 P5) + `/clusters` 리다이렉트·`ClustersPage` 은퇴 / D2 개요 스트립 + `clusterStats` 어댑터(카드와 단일 계산 공유) / D7 연결 모달(실 API 진행 이벤트 파생 포함) / D12 드릴 맵 재작성 착수.

**P4 — 상세·알림 축**: D3 시트 계약(인셋 기하·드래그·forceFull·탭 5종·related 탭 금지·히스토리·편집 충돌) + `/workload/*` 래퍼화 / D4 알림 센터(벨 통합, OperationStatusCenter 흡수, 사이드바 배지 제거, 읽음 규칙) + 6.2 매트릭스 구현.

**P5 — IA 병합 마감(D19 2단계)**: D18 3관점(`지도|목록|흐름`) 완성 — 지도 밑 표 구조 폐지, `/traffic` 리다이렉트 / `/deploy` 신설(탭 3, `/applications`·`/gitops`·`/helm` 리다이렉트) / `/issues` 탭 2(`/alerts` 리다이렉트) / **D21 위젯 보드 3층(W2~W8·Edit layout·기간 컨텍스트)** / D16 패널 재작성(탭명 구성·저장소)+`Mobile`/`Parts` 삭제 / D6 `GitOpsSyncSearch` 제거 / D15 diff 수렴 / 나머지 표 3종 D5 교체 / D9 AI(FAB·도킹·forceFull·action 카드) / 5.10 수렴 / 단축키 재배치·`tw-animate-css` 제거 검토.

**P6 — 데모 은퇴**: 제품이 데모 시나리오를 전부 재현하면 `devpreview-*`를 빌드에서 제외(파일은 브랜치에 보존), 데모 문서 링크를 제품 URL로 교체.

### 7.2b 백엔드 전제조건 (프론트가 가정만 하고 넘어가면 안 되는 것 — 착수 전 존재 확인, 부재 시 백엔드에 요구)
- W4 활동 추이: 기간별 **집계** 엔드포인트(배포 수·알림 수·임계 수 시계열). `timeline` 원시 스트림만 있으면 30일 클라이언트 집계는 금지(성능) — 집계 API 필요.
- W5 네임스페이스 분포: `inventory-summary`의 ns별 분해 제공 여부 확인.
- D7 연결 진행: `cluster-connection`·저장소 등록의 **진행 이벤트 스트림**(스테이지 상태) 존재 확인 — 없으면 폴링 기반 상태 조회로 대체 설계.
- D4 알림: 이벤트 id 멱등 보장(재수신 중복 방지).

### 7.3 페이즈별 완료 정의(DoD)
각 페이즈는 (a) 게이트 통과, (b) 해당 결정표 D# "제거" 항목이 실제로 코드에서 사라짐, (c) 6.2 매트릭스 위반 0, (d) 스크린샷 대비 리뷰(데모 대비 시각 동등 이상)로 닫는다. 실패 시 페이즈 내 수정 — 다음 페이즈로 부채 이월 금지.

---

## 8. 배포·QA

### 8.1 빌드·배포
- Vite 청크 전략 유지(motion/flow 분리). `index.html`은 계속 `src/main.tsx`만 로드(P6 전까지 데모 엔트리 공존 허용, 프로덕션 빌드 아티팩트에는 devpreview 엔트리 미포함 확인). 백엔드 프록시(`VITE_BACKEND_ORIGIN`)·CSRF 헤더 계약 불변. Tauri 데스크톱 빌드는 P5 이후 스모크만.

### 8.2 판매 품질 스윕 (매 페이즈 + 최종, 데모에서 검증된 절차)
1. **논리 모순 0**: 임의 화면 2개를 골라 같은 개념의 숫자 대조(클러스터 카드 vs 개요 스트립 vs 사이드바 카운트 vs 표 행수). 불일치=차단 결함.
2. **중복 UI 0**: 결정표 D1~D11의 "제거" 목록 재확인 + 신규 중복 grep(두 번째 테이블/카드/벨 구현).
3. **가짜 컨트롤 0**: 모든 클릭 가능 요소는 실동작 or 미존재. 장식용 토글·갈 곳 없는 링크 발견 시 즉시 제거.
4. **좌표계**: 상세 시트·모달이 헤더/내비를 침범하지 않는지 뷰포트 3종(1280/1440/1920)에서 확인.
5. **i18n**: ko/en 전환 후 리터럴 잔존 가드 + 레이아웃 파손 확인.
6. **모션**: 전 모션이 D17 토큰 경유(리터럴 duration grep 0), reduced-motion에서 기능 손실 없음, 60fps(드릴·시트 개폐) 프로파일.
7. **접근성**: 시트·모달 포커스 트랩+`Esc`, 토스트 `aria-live=polite`·벨 배지 `aria-label`, 상태색 AA 대비(라이트·다크), 키보드만으로 8 서피스 전부 도달.
8. **다크 모드**: 신설 토큰 다크 값 존재 + 8 서피스 육안 점검.
9. **지원 범위**: 최소 폭 1024(그 이하 모바일 전용 레이아웃은 범위 밖 — Mobile 변형 삭제와 정합). 검증 뷰포트 1024/1280/1440/1920.

### 8.3 최종 완료 정의
제품(dev)만으로 데모 발표 시나리오(홈→클러스터 드릴→임계 파드 상세→YAML 수정→AI RCA→알림 규칙 생성→연결 위저드)를 **데모 없이** 시연 가능하고, 8.2 스윕 전 항목 통과, 결정표의 모든 "제거" 완료. 그 시점에 P6 실행.

---

## 부록 A. 데모 계약 레퍼런스 (재구현 시 확인용 원본 위치)
`devpreview-unified.tsx`(셸·표·상세·벨·z계층) / `devpreview-opsia.tsx`(드릴 맵·카드 v6·개요 스트립·`clusterStats`·인벤토리 export) / `devpreview-ai.tsx`(파트 스트리밍·action 카드) / `devpreview-connect.tsx`(모달 위저드·`initialView`) / `devpreview-topology.tsx`(트래픽 사양) / `devpreview/theme.ts`(토큰 원본) / `devpreview/bus.ts`(발화 의미) / `devpreview/brandIcons.tsx`(브랜드 패스).

## 부록 B. 레퍼런스 근거 자료
외부 기준 저장소 실캡처 9장 — outputs 폴더 전달본. 텍스트 근거는 벤치마크 최소선의 클러스터 목록, 상태 색 규칙, 사용률 탭, 상세 대시보드 배치만 요약한다.
