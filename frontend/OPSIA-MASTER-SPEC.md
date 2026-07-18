# Opsia 통합 기획서 — Master Spec v1

> **문서의 지위**: 이 문서가 제품·데모·머지에 관한 **유일한 결정 문서**다.
> - `DESIGN-RULES.md` = 시각·모션 **세부 규칙집** (이 문서의 4장이 위임하는 하위 문서. 충돌 시 본 문서 우선)
> - `DEMO-MERGE-PLAN.md` = **폐기(superseded)**. 유효한 내용은 본 문서 7장에 전부 흡수됨. 참조 금지.
> - 실행 주체: **코덱스(제품 코드, dev 브랜치)**. 데모(`devpreview-*`)는 사양 원본이며 **동결**된다.
> - 대원칙: **같은 기능은 정확히 한 곳에서 한 번 정의된다. 같은 개념은 하나의 이름·하나의 아이콘·하나의 색을 가진다. 두 화면이 다른 숫자를 말하면 그것은 버그다.**

---

## 0. 용어 사전 (전 화면·전 문서 공통 — 다른 표기 발견 시 이 표로 교정)

| 표준 용어 (ko) | 표준 용어 (en) | 라우트 | 금지 표기 |
|---|---|---|---|
| 홈 | Home | `/home` | 대시보드, Overview |
| 리소스 | Resources | `/resources` | 인벤토리, 카탈로그(단독 사용) |
| 인시던트 | Incidents | `/issues` | 이슈, 장애 목록 ("장애"는 상태 서술어로만) |
| 애플리케이션 | Applications | `/applications` | 앱스, 서비스 목록 |
| 타임라인 | Timeline | `/timeline` | 감사 로그, 히스토리 |
| 트래픽 | Traffic | `/traffic` | 토폴로지(단독 사용 금지 — 4종 그래프 구분은 3.7) |
| Helm | Helm | `/helm` | 차트, 패키지 |
| GitOps | GitOps | `/gitops` | 워크플로(`/workflows`는 리다이렉트 별칭으로만 유지, 내비·카피에 노출 금지) |
| 점검 | Checks | `/checks` | 감사(`/audit`는 별칭으로만), 정책 |
| 비용 | Cost | `/cost` | 코스트 |
| 클러스터 | Clusters | `/clusters` | 클러스터 관리, 플릿 |
| 알림 | Alerts | `/alerts` | 경보, 노티 |
| 설정 | Settings | `/settings` | 환경설정, 프리퍼런스 |
| 상세 시트 | Detail Sheet | — | 상세페이지, 오버레이(구현 용어) |
| 연결 | Connect | (모달) | 온보딩, 등록(버튼 라벨은 "+ 연결") |
| 알림 센터 | Notification Center | (벨) | 알림함, 인박스 |

기술 고유명사(Pod, Deployment, OOMKilled, kubectl, ArgoCD, Helm, YAML)는 한국어 문장 안에서도 원문 유지. 상태 어휘는 정확히 3단: **정상(ok) / 주의(warn) / 임계(crit)** + 보조 2단 **대기(pending) / 비활성(ghost)**. "위험", "심각", "에러" 등 유의어를 UI 카피에 쓰지 않는다.

---

## 1. 레퍼런스 분석 → 제품 원칙

### 1.1 조사 대상과 결론

| 레퍼런스 | 관찰된 패턴 | 우리 채택 |
|---|---|---|
| **Rancher 홈/클러스터 목록** (extensions.rancher.io UI Walkthrough, oneuptime 멀티클러스터 가이드) | 홈=클러스터 목록. 행당 정보: 색상 상태 배지(Active 초록/Updating 파랑/Error 빨강) + 이름 + 프로바이더 + 버전 + 노드 수 + CPU/MEM. 인벤토리·차트는 클릭 후 Cluster Explorer 대시보드 | 클러스터 카드 v6 (2.3) + 드릴 후 개요 스트립 |
| **GKE 콘솔 클러스터 목록** (Google Cloud docs "GKE in console") | 테이블: 이름·위치·플릿·노드·코어·메모리. 사용률 탭에서 CPU/MEM/디스크 정렬. 상세는 행 클릭 | 목록은 스캔용 최소 열 구성, 정렬 가능 사용률 |
| **OpenShift 콘솔 Overview** (IBM App Runtimes lab 실캡처 9장, `outputs/` 보관) | Overview 상단 = 상태 체크(Cluster/Control Plane/Operators). Details 박스=버전·채널, Cluster inventory=노드/파드 카운트(+문제 파드 느낌표 링크), Utilization=CPU/MEM/FS/NET + Top consumers 드릴 | 상태 요약 줄, 개요 스트립의 인벤토리 링크(클릭=해당 종류 표로 전환), 임계 카운트에 배지 |
| **Vercel Geist / shadcn / Tremor / AI SDK** | 의미 토큰 단일 소스, 정보 우선 차분한 표면, 차트 문법(점선 그리드+크로스헤어+펄스), 스트리밍 채팅 패턴 | `DESIGN-RULES.md` 전체 (토큰·차트·AI 채팅) |
| **Apple HIG / 알림 센터** | 컬러는 데이터에만, 헤어라인 구분, 스프링 모션, 알림=반투명 블러 일시 표면 | 모션 3종 스프링, 알림 센터 시각, 상태색 장식 금지 |

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
- 스타일: Tailwind v4 + shadcn + **`src/styles/tokens.css`(oklch) 단일 토큰**. `scripts/product-design-guard.mjs`(`npm run check:design`)가 하드코딩 hex를 차단(현재 제품 코드 위반 1건: `ResourceManifestCreateDialog.tsx:199` 에디터 크롬 — 7장 P1에서 토큰화).
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

---

## 3. 기능 단일화 결정표 (Decision Table — 이 표가 중복의 최종 심판)

각 결정 D#: **오너(단일 정의 위치) / 흡수되는 것 / 제거되는 것 / 금지 사항**.

### D1. 클러스터 목록·카드
- **오너**: `pages/clusters/ClustersPage.tsx` + `ClusterCard.tsx`
- **흡수**: 데모 카드 v6 사양 그대로 — 상태 필(라벨은 상태 어휘로: `정상` 초록 펄스 / `임계 N` 임계 틴트. 데모의 "Active/장애 N" 표기는 본 표기로 대체), 프로바이더 배지(D8 브랜드 아이콘), 이름+K8s 버전, 카운트 한 줄(`노드 R/N ready · 파드 P · 임계 c · 네임스페이스 n`), CPU/MEM 미니 바 2개, 카드 끝에 `+ 클러스터 연결` 점선 카드(클릭=D7 모달).
- **제거**: 카드 내 링 차트·스파크라인·ARN·인벤토리 나열 일체(레퍼런스 3사 공통 근거).
- **금지**: 홈(`/home`)의 클러스터 그리드가 **다른 카드 컴포넌트**를 쓰는 것. 홈은 동일 `ClusterCard`를 재사용하되 `variant="summary"` 프롭 하나로만 밀도를 조절한다(두 번째 카드 구현 금지).

### D2. 클러스터 드릴 후 개요
- **오너**: `/resources` 물리 토폴로지의 노드 뷰 상단 **개요 스트립**(데모 `ClusterOverview` 사양).
- **구성**: 1행 계정·버전·네임스페이스 수 / 2행 CPU `used/total cores`·MEM `used/total Gi`·NET·DISK / 3행 ARN(모노)·자동갱신 상태 / 우측 리소스 종류 링크 6종(클릭=해당 종류 표 전환, 스코프 유지).
- **계산**: 데모 `clusterStats()`와 동일한 파생 규칙을 제품 어댑터에 재현 — 카드(D1)와 스트립이 **같은 함수**에서 숫자를 얻는다. 다르면 버그.
- **제거**: `/clusters` 상세 다이얼로그에 사용률 차트를 넣으려는 시도(개요는 여기 한 곳).

### D3. 리소스 상세
- **오너**: `pages/resources/ResourceDetailSheet.tsx` (시트형).
- **흡수**: 데모 `DetailOverlay` 계약 전부 — (a) 시트는 상단바·좌측 내비를 **절대 덮지 않는다**(top=실측 헤더 높이, left=내비 폭), (b) 좌변 드래그 리사이즈, (c) AI 패널 열림 시 `forceFull` + `rightInset=aiW`로 전체화면 전환(수동 축소 버튼 비활성), (d) 탭 = `개요 / YAML / 이벤트 / 로그 / RBAC` — **'관련 리소스' 탭 금지**(관련 리소스는 개요 탭의 관계도+링크로만), (e) YAML 편집→diff 프리뷰→적용(제품은 기존 dry-run/approve 플로 유지), (f) 액션(재시작·스케일)은 이벤트 탭과 알림(D4)에 즉시 반영.
- **정리(F4)**: `/workload/:kind/:namespace/:name` 라우트는 **딥링크 진입점으로만 존속**하며, 렌더링은 동일 `ResourceDetailSheet`를 전체화면 모드로 여는 래퍼가 된다. `WorkloadDetailRoute` 고유 UI는 시트 탭으로 흡수. 상세 UI 정의는 시트 한 곳.

### D4. 알림 (F1 해소 — 발화 규칙은 6.2가 유일한 정의)
- **오너**: 헤더 **벨 = 알림 센터**(지속 기록, 데모 벨 사양: 블러 카드, 항목 클릭=해당 리소스 상세 시트 딥오픈) + **sonner 토스트**(일시 반영, 동일 이벤트의 그림자).
- **흡수**: `OperationStatusCenter`는 독립 표면을 잃고 알림 센터 상단의 **"진행 중" 섹션**이 된다(스토어·SSE 어댑터는 재사용, UI만 벨 안으로). `AlertEventsProvider`의 unread 배지는 벨 배지로 이동(사이드바 배지 제거).
- **제거**: 사이드바 알림 배지, 독립 OperationStatusCenter 패널.
- **금지**: 같은 사건이 토스트 2회 또는 벨 2항목이 되는 경로. 발화는 6.2 표의 단일 매핑으로만.

### D5. 표 (F2·F5 해소)
- **오너**: 신규 공용 `shared/ui/table/ResourceTable.tsx` — 데모 표 사양(2.3) + 컬럼 정의는 데이터로 주입.
- **수렴**: `ResourcesTable` → 즉시 교체(P2), `IssuesTable`·`ApplicationsTable`·`GitOpsSyncTableView` → 순차 교체(P5). 교체 전까지 신규 표 기능 추가 금지(드리프트 방지).
- **제거**: `@tanstack/react-table` 의존성(미사용 확정).
- **비고(F5)**: `ResourcesCatalog` 3변형은 공용 표 도입 시 `Core` 하나로 수렴하고 반응형은 CSS로만 분기.

### D6. 검색
- **오너**: 헤더 ⌘K 단일 검색(`ProductCommandPalette`, cmdk) — 데모 확정 사양: 리소스·서비스·저장소 통합 인덱스, 결과 선택=상세 시트 or 스코프 전환.
- **제거**: 표 상단 개별 검색 인풋(데모에서 이미 확정된 "검색 이원화 제거" 결정). 표의 행 하이라이트·필터링은 전역 검색어와 현재 스코프(클러스터·ns·렌즈)에서 **파생**될 뿐, 표가 자체 검색 상태를 갖지 않는다.
- **금지**: 검색 결과 드롭다운에 갈 곳 없는 "전체 결과 보기" 류의 항목.

### D7. 연결(클러스터·Git)
- **오너**: 클러스터=`pages/clusters/ClusterConnectDialog.tsx`(기존). Git=**신규** `pages/gitops/RepoConnectDialog.tsx`(dev에 저장소 등록 다이얼로그가 현재 부재함을 코드로 확인 — 데모 `ConnectWizard`의 repo 뷰 사양으로 신설). 두 다이얼로그의 진행 스테이지 UI는 P2의 공용 부품(`shared/ui/connect/ConnectStages.tsx`)을 공유한다(두 번째 스테이지 구현 금지).
- **사양**: 데모 `ConnectWizard` 모달 계약 — 문맥 진입 2곳(클러스터 목록 `+ 연결` 카드 / GitOps의 `+ 저장소 연결`), **모달 팝업이며 서피스 전환 금지**, `initialView: "repo"|"cluster"` 딥오픈, 진행 스테이지(에이전트 설치→핸드셰이크→동기화), 완료 시 D4 발화 + 모달 자동 닫힘 + 목록 반영.
- **세 번째 진입점**: `/settings`의 "연결" 섹션에 두 버튼(클러스터 연결=`initialView:"cluster"`, 저장소 연결=`initialView:"repo"`) — 동일 다이얼로그 호출, 별도 UI 금지.
- **제거**: 데모 셸의 `connect` Surface(내비 항목 "연결 설정") — 제품 내비에 연결 항목을 만들지 않는다.

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
| 트래픽 흐름 | `/traffic` | "호출이 어떻게 흐르나" (데모 topology 사양: 흐름 대시, 화살촉 금지, 클릭=Service 상세 시트) | 서비스 클릭=상세 시트 |
| GitOps 워크플로 | `/gitops` | "배포가 어떤 단계를 거치나" | 단계 클릭=해당 리소스/실행 |

- **금지**: 한 그래프에 다른 그래프의 질문을 겸하게 하는 확장(예: 트래픽 그래프에 노드 배치 표시).

### D11. 문서
- **오너**: 본 문서. `DESIGN-RULES.md`는 4장에서 위임한 시각 세부만 담는다(기능·IA·이벤트 서술 금지). `DEMO-MERGE-PLAN.md`는 헤더에 폐기 선언만 남긴다.

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

### 4.2 타이포
- 데모 `TYPE`(caption 11 · label 12 · body 13 · bodyStrong 14 · title3 15.5 · title2 17 · title1 21) → Tailwind v4 `@theme` 폰트 스케일로 등록(`text-caption`~`text-title1`). 웨이트 400/600/700/800, **500 금지**. 숫자는 `font-mono + tabular-nums`.
- 제품 폰트는 Geist Variable 유지(데모의 SF Pro 폴백 체인은 데모 전용).

### 4.3 모션
- 데모 SOFT/SPRING/PAGE/EASE_DRAW → `src/motion/tokens.css` + motion 헬퍼로 등록. 용도 구속은 `DESIGN-RULES.md` 3장 그대로: SOFT=등장·탭 인디케이터·토스트, SPRING=카드 레이아웃, PAGE=뷰 전환, EASE_DRAW=차트 드로잉. 임의 duration 금지. 리스트 스태거 `i*0.04~0.05`, 8개 캡. `usePrefersReducedMotion` 존중(데모에 없던 요구 — 제품에서는 필수).

### 4.4 라운드·엘리베이션
- RADIUS(tile 3→sheet 18)·ELEV(hover/pop/overlay) → 토큰 등록. 기본 카드=헤어라인, 그림자는 떠 있는 표면만.

### 4.5 데모 전용 특례 (제품 반입 금지 — F10)
- `PRESENT_SCALE`(zoom 1.25)과 그 좌표계 보정(`offsetHeight`/`clientWidth/SCALE`/`calc(100vh/SCALE)`)은 **발표용 데모에만** 존재한다. 제품은 zoom을 쓰지 않으므로 이 코드를 이식하지 않는다. 단, "오버레이는 상단바·사이드바를 덮지 않는다 / top·left는 실측값" 원칙 자체는 제품 상세 시트에 그대로 적용(D3-a).

---

## 5. 화면별 상세 사양 (이식 후 최종 모습)

모든 화면 공통: 로딩=스켈레톤(스피너 금지), 오류 화면=`ProductStateScreen` 재시도, 빈 상태=원인 설명+해소 액션 1개(설명용 안내 문구 금지), 카피=i18n 키(ko 기본), 숫자=단일 소스 파생.

### 5.1 홈 `/home`
- 플릿 개요: **D1 `ClusterCard variant="summary"` 그리드** + 라이브 밴드·인시던트 레일(둘 다 **기존 홈 컴포넌트 유지** — 본 머지의 재설계 범위 밖, 4장 토큰 수렴만 적용). 클러스터 카드 클릭=`/resources` 물리 토폴로지 해당 클러스터 드릴(스코프 전달). 홈의 모든 카운트는 `/clusters`·`/resources`와 동일 어댑터에서 파생.

### 5.2 클러스터 `/clusters`
- D1 카드 그리드(2열 max, `minmax(0,560px)`) + `+ 클러스터 연결` 점선 카드(D7 모달). 카드 클릭=드릴 이동. 연결 해제=기존 `ClusterDisconnectDialog` 유지.

### 5.3 리소스 `/resources` (기함 서피스)
- 좌: 물리 토폴로지(클러스터→노드→파드 드릴, 상태 요약 줄, 렌즈). 노드 뷰 상단=D2 개요 스트립.
- 우: 탐색 패널(리소스 종류 카탈로그·서비스·설정·배포 탭) — 종류 카운트는 표 행수와 동일 소스. 종류 선택↔맵 렌즈 동기화(파드 뷰=실필터, 노드 뷰=활성/비활성).
- 하: D5 공용 표(스코프 연동 — 맵에서 노드 선택 시 행 필터). 행 클릭=D3 상세 시트.
- 스코프 칩(헤더): 현재 클러스터/네임스페이스 실반영, 해제 가능.

### 5.4 상세 시트 (전역, D3)
- 개요 탭: 팩트 패널 + 관계 토폴로지(D10) + 핵심 메트릭 차트(DESIGN-RULES 6장 문법). 액션: 재시작·스케일(복제 수 ±)·매니페스트 편집 — 이벤트 탭·알림은 6.2 매트릭스대로(진행=벨, 토스트=결과 시점 1회).
- YAML 탭: 하이라이트 뷰 → 편집 모드 → diff(추가=ok 틴트/삭제=crit 틴트) → dry-run→적용.
- 이벤트/로그/RBAC 탭: 스트림 기반, 시간 역순.

### 5.5 알림 (전역, D4)
- 벨 배지=미확인 수. 드롭다운: 진행 중(구 OperationStatusCenter) → 오늘 → 이전. 항목=아이콘+제목+본문+상대시각, 클릭=대상 상세 시트/화면 딥오픈. 모두 지우기 제공. 토스트는 우상단(헤더 아래 10px), 동일 사건 1회.

### 5.6 AI (전역, D9)
- FAB → 우측 도킹 패널(드래그 폭). 컨텍스트 줄(현재 화면·스코프) 표시. 스트리밍 파트: steps(진행)→result(임계/주의 요약 칩)→evidence(근거 카드)→links(딥링크)→action(알림 규칙 제안→생성=D4 발화). 인시던트 화면에서는 RCA 세션(`diagnose`)과 연결.

### 5.7 연결 모달 (전역, D7) / 5.8 트래픽 `/traffic` (D10) / 5.9 나머지 서피스
- 트래픽: 데모 topology 이식(흐름 대시, 엣지 호버=rps·p99·5xx 칩, 클릭=상세 시트). 나머지(인시던트·타임라인·Helm·GitOps·점검·비용·알림 규칙·설정)는 기존 기능 유지 + 4장 토큰·D5 표·D3 시트로 **시각만** 수렴(기능 재설계 금지 — 범위 밖).

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

**P2 — 공용 부품**: D5 공용 `ResourceTable` 구현+`ResourcesTable` 교체 / D8 브랜드 아이콘 `shared/ui/brand/` / 상태 필·틴트 칩 공용 컴포넌트 `shared/ui/status/StatusPill.tsx`·`TintChip.tsx`(전 화면이 이것만 사용 — 개별 구현 금지) / D7 진행 스테이지 공용 부품 `shared/ui/connect/ConnectStages.tsx`.

**P3 — 클러스터 축**: D1 카드 v6(`ClusterCard` 재작성, 홈 variant 포함) / D2 개요 스트립 + `clusterStats` 어댑터(단일 계산 함수, 카드와 공유) / D7 연결 모달 사양 흡수(`initialView`, 진행 스테이지, 완료 발화).

**P4 — 상세·알림 축**: D3 시트 계약(인셋 기하·드래그·forceFull·탭 5종·related 탭 제거) + `/workload/*` 래퍼화 / D4 알림 센터(벨 통합, OperationStatusCenter 흡수, 사이드바 배지 제거) + 6.2 매트릭스 구현.

**P5 — 서피스 마감**: D9 AI(FAB·도킹·forceFull 연동·action 카드) / D10 트래픽 이식 / 나머지 표 3종 D5 교체 / 5.9 시각 수렴.

**P6 — 데모 은퇴**: 제품이 데모 시나리오를 전부 재현하면 `devpreview-*`를 빌드에서 제외(파일은 브랜치에 보존), 데모 문서 링크를 제품 URL로 교체.

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
6. **모션**: reduced-motion에서 기능 손실 없음, 60fps(드릴·시트 개폐) 프로파일.

### 8.3 최종 완료 정의
제품(dev)만으로 데모 발표 시나리오(홈→클러스터 드릴→임계 파드 상세→YAML 수정→AI RCA→알림 규칙 생성→연결 위저드)를 **데모 없이** 시연 가능하고, 8.2 스윕 전 항목 통과, 결정표의 모든 "제거" 완료. 그 시점에 P6 실행.

---

## 부록 A. 데모 계약 레퍼런스 (재구현 시 확인용 원본 위치)
`devpreview-unified.tsx`(셸·표·상세·벨·z계층) / `devpreview-opsia.tsx`(드릴 맵·카드 v6·개요 스트립·`clusterStats`·인벤토리 export) / `devpreview-ai.tsx`(파트 스트리밍·action 카드) / `devpreview-connect.tsx`(모달 위저드·`initialView`) / `devpreview-topology.tsx`(트래픽 사양) / `devpreview/theme.ts`(토큰 원본) / `devpreview/bus.ts`(발화 의미) / `devpreview/brandIcons.tsx`(브랜드 패스).

## 부록 B. 레퍼런스 근거 자료
Rancher UI Walkthrough(extensions.rancher.io) 실캡처 4장, OpenShift 클러스터 헬스 랩(ibm.github.io) 실캡처 5장 — outputs 폴더 전달본. 텍스트 근거: oneuptime Rancher 멀티클러스터(상태 색 규칙), GKE 콘솔 문서(목록 컬럼·사용률 탭), Rancher built-in dashboards(사용률은 Grafana 상세로).
