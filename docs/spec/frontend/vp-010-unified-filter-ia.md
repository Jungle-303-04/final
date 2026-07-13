---
title: VP-010 — 통합 필터 IA · Resources 재편 · 점진적 위자드 (기획 정본)
status: spec-approved
date: 2026-07-13
owner: 프론트 Codex (구현) / 우녕 (기획 확정)
governing: reference-contract-map.md(판정 규율), verified-pipeline-insertion-map.md(VP 행)
---

# VP-010 — 통합 필터 IA

## 0. 제품 원칙 (이 문서 전체를 지배)

**"필터 → 결과 → 표현"이라는 단 하나의 패러다임으로 앱 전체를 통일한다.**
사용자가 배울 조작은 하나다: 필터를 걸고, 보고 싶은 형태를 고른다.

세 가지 불변식:
1. **필터는 목록의 성질이지 항목의 성질이 아니다.** 목록 = 검색 공간(필터 적용) /
   상세 = 하나의 진실(필터 미적용).
2. **표현 모드는 목록의 렌더링 방식이다.** 같은 필터 결과를 표/그래프로 다르게 그리는 것.
   상세 진입은 표현 모드가 아니다.
3. **없는 것은 없는 것으로 둔다.** 백엔드 계약에 없는 kind·필드·상태는 0으로도,
   disabled로도 렌더하지 않는다 (BE-Gap 규율).

## 1. 스코프와 메뉴 구조

### 1.1 스코프 = 팀(프로젝트)뿐

상단에 selector 하나: `[🔷 Checkout팀 ▾]` — 백엔드 `workspace`가 정본.
팀 전환 = 데이터 전면 교체(격리 경계). 클러스터는 **스코프가 아니라 필터**다.

이 절은 `verified-pipeline-insertion-map.md`의 VP-007 중 **단일 Cluster selector가 전 화면
스코프의 URL 권위**라는 의미를 대체한다. VP-007에서 검증된 cluster collection,
`provider` metadata, `ClusterProviderIcon`, 연결 상태 자산은 폐기하지 않고 filter facet
catalog와 chip 표시에 재사용한다. 필터가 0개일 때 첫 Cluster를 자동 선택하지 않는다.

현재 인증 session은 `workspaceId` 하나만 제공하며 workspace 목록·전환 receipt 계약은 없다.
따라서 해당 계약이 착륙하기 전에는 workspace selector를 가짜 목록이나 disabled control로
렌더하지 않는다. 현재 workspace는 request isolation context로만 유지한다(§9 GAP-001).

### 1.2 메뉴

```
Home        위젯 대시보드 (별도 트랙 VP-011)
Resources   필터 + 표/그래프 (Topology 흡수)   ← 이번 작업의 중심
Issues      인시던트 (같은 필터 문법)
Applications 배포 단위 (desired↔live 대조)
GitOps      변경·승인·diff
Checks      점검 결과
Live Traffic 보류 — 이번 작업에서 제거하지 않는다 (현행 유지)
Settings
```

- **Topology 메뉴는 제거**한다. Resources의 그래프 모드가 대체한다.
- **Live Traffic은 유지**한다. 흡수 여부는 후속 결정(계약 부재로 현행 유지).
- **Cost 메뉴는 렌더하지 않는다** (백엔드 계약 없음 — BE-Gap).

## 2. 공용 필터 엔진 (모든 화면 공유, 단일 컴포넌트)

### 2.1 배치 — 모든 화면에서 동일한 위치

```
┌────────────────────────────────────────────────────────┐
│  🔍 Filter...          [Labels (2)] [표] [그래프]      │  ← 검색 + 우측 Label/표현
│  prod-eks ✕  checkout-api ✕  team=checkout ✕          │  ← 같은 줄의 선택 칩
│  Showing 18 of 92                         Clear filters │  ← 서버가 증명한 count
├────────────────────────────────────────────────────────┤
│  (결과)                                                 │
└────────────────────────────────────────────────────────┘
```

### 2.2 필터 축

**공통 3축 — 모든 화면에서 유지·전파된다:**
- 클러스터 (provider 아이콘 포함)
- 네임스페이스
- 애플리케이션

이 세 구조적 축은 값이 유한하고 facet catalog에서 미리 알려지므로 tree/dropdown에 나열한다.
Label은 데이터에서 계속 발견될 수 있는 비유한 축이므로 같은 목록에 섞지 않는다.

**발견형 공통 축 — 구조적 축과 함께 화면 간 유지·전파된다:**
- 라벨(Kubernetes labels). 구조적 축처럼 유한 목록을 미리 나열하지 않고 별도
  `[Labels (N)]` 버튼과 검색 popover로만 연다.

Label popover 계약:
- `[Labels (N)]`의 `N`은 **현재 선택된 label 수**다. 검색 결과 수나 전체 facet 수를
  뜻하지 않는다. 선택이 0개면 `Labels`만 표시한다.
- 상단에 "선택한 라벨은 AND로 결합됩니다"를 고지한다.
- `key=value` 부분 일치 검색과 각 label을 가진 항목 수를 함께 표시한다.
- 목록의 각 count는 현재 workspace·권한·구조적 공통 축·해당 화면 축·이미 선택된 다른
  label을 모두 적용한 뒤, 그 후보 label까지 AND로 추가했을 때의 결과 항목 수다. 검색어는
  facet 목록을 좁힐 뿐 결과 count의 조건으로 합산하지 않는다.
- 선택 항목은 강조하고 `[Clear]`로 label만 모두 해제한다.
- 선택된 label은 다른 filter chip과 같은 줄에 표시하고 개별 제거할 수 있다.
- filter bar에는 `Showing N of M`과 `[Clear filters]`를 둔다. N과 M의 완전성을 서버가
  증명하지 못하면 숫자를 만들지 않고 partial/unavailable 상태를 표시한다. 여기서 `N`은
  모든 filter 적용 후 항목 수, `M`은 같은 workspace·권한·surface에서 filter 적용 전 전체
  항목 수다. 둘은 같은 snapshot/revision에서 계산해야 한다.
- `[Clear]`는 label 축만 비우고 `[Clear filters]`는 공통·화면별 filter를 모두 비운다.
  detail identity와 workspace scope는 어느 동작으로도 지우지 않는다.

**화면별 추가 축:**
| 화면 | 추가 축 |
|---|---|
| Resources | 리소스 종류(resource type), 상태(health), 삭제 항목 포함 여부 |
| Issues | 심각도, 상태(open/resolved), 환경 |
| Applications | 환경, 상태, 승격 대기 여부 |
| GitOps | 환경, 승인 상태, 변경 유형 |
| Checks | 심각도, 카테고리 |

### 2.3 문법

- 같은 축의 칩 여러 개 = **OR** (prod-eks OR staging-gke)
- 다른 축의 칩 = **AND** (클러스터 AND resource type)
- **label끼리는 예외적으로 AND**다 (`team=checkout` AND `tier=critical`). label과 다른
  모든 축 사이도 AND다. 이 차이를 Label popover 안에서 항상 고지한다.
- 같은 key의 다른 value도 AND다. 예를 들어 `environment=prod`와
  `environment=staging`을 함께 선택하면 0건이며 OR나 마지막 값 우선으로 보정하지 않는다.
- 칩 0개 = 팀 전체 (필터 없음이 기본, 빈 결과 아님)
- 화면의 자유 텍스트 검색은 결과 집합을 변경하는 surface search다. Label popover 검색은
  `key=value` facet 후보만 좁히며 결과 집합·count 조건에는 포함하지 않는다.

### 2.4 URL 동기화와 화면 간 유지

URL key는 아래가 정본이다. common 값은 URL에 남아 모든 화면에 적용되고, 화면별 key는
URL에 남아 복원되지만 해당 화면 adapter만 읽는다. 상세 identity key와 filter key는
서로 다른 namespace를 사용한다.

| 구분 | canonical key | 값 |
|---|---|---|
| 공통 | `clusters` | comma로 구분한 stable cluster ID |
| 공통 | `namespaces` | comma로 구분한 `<cluster-id>/<namespace>` exact pair |
| 공통 | `applications` | comma로 구분한 stable application ID |
| 공통 발견형 | `labels` | comma로 구분한 Kubernetes `key=value`; 예: `labels=team%3Dcheckout,tier%3Dcritical` |
| Resources | `resources.types`, `resources.health`, `resources.includeDeleted`, `resources.q`, `resources.view` | 목록 filter와 `table|graph` 표현 |
| Issues | `issues.severity`, `issues.status`, `issues.environment`, `issues.q` | Issues에서만 적용 |
| Applications | `applications.environment`, `applications.status`, `applications.pendingPromotion`, `applications.q` | Applications에서만 적용 |
| GitOps | `gitops.environment`, `gitops.approval`, `gitops.changeType`, `gitops.q` | GitOps에서만 적용 |
| Checks | `checks.severity`, `checks.category`, `checks.q` | Checks에서만 적용 |
| 상세 identity | `resource`, `resourceKind`, `tab`, `full` | filter가 아니며 화면 이동 시 전파하지 않음 |

정규화 규칙:
- canonical serializer는 multi-value 구분자 comma를 literal로 남기고 각 값만 percent-encode한다.
  따라서 Label 예시는 정확히 `labels=team%3Dcheckout,tier%3Dcritical`이다.
- boolean `true`만 `key=true`로 직렬화하고 `false`는 key를 생략한다. `resources.view=table`도
  기본값이므로 생략하며 `graph`만 직렬화한다. 정의되지 않은 boolean·view 값은 기본값처럼
  조용히 수용하지 않고 해당 값만 invalid 진단으로 격리한 뒤 canonical write에서 제거한다.
- multi value는 stable ID의 Unicode code-point 오름차순으로 정렬하고 중복·빈 값을 제거한다.
  ID와 Kubernetes label key/value는 comma를 허용하지 않는 canonical 계약이어야 한다.
- `namespaces`는 단순 이름이 아니라 exact cluster/namespace pair다. application chip은 표시명이
  아니라 stable application ID다. label은 첫 `=` 앞을 key, 뒤를 value로 해석하고 Kubernetes
  label 문법을 통과한 equality selector만 query로 보낸다. existence·inequality·set selector는
  이 버전에 포함하지 않는다. 빈 label value는 Kubernetes 문법상 유효하므로 `key=`로 보존한다.
- catalog에 아직 없거나 권한 때문에 해석되지 않는 syntactically valid ID는 첫 항목으로
  바꾸거나 삭제하지 않고 unresolved chip으로 보존한다. 서버가 forbidden을 확정하면 이유를
  표시한다.
- legacy `cluster`는 `clusters`가 없을 때만 단일 cluster filter로 읽고, 첫 canonical write에서
  `clusters`로 교체한다. legacy `cluster`와 canonical `clusters`가 함께 있으면 canonical 값만
  권위다. 첫 Cluster 자동 선택은 금지한다.
- legacy Resources detail `resource + kind`는 `resourceKind`가 없을 때만 detail identity로 읽고
  첫 canonical write에서 `resourceKind`로 교체한다. legacy `full=1|0`은 각각 boolean
  `true|false`로 읽고 첫 canonical write에서 `full=true` 또는 key 생략으로 바꾼다. 이후
  `kind`와 숫자형 `full`은 사용하지 않는다.
- chip 추가·삭제·Label만 전체 해제·모든 filter 전체 해제는 browser history에 새 항목을
  만들고, typing 중 검색과 URL
  정규화·legacy migration은 replace한다. back/forward로 돌아온 URL이 언제나 권위다.
- 화면 이동은 common과 모든 화면별 filter key를 보존하지만 `resource`, `resourceKind`, `tab`,
  `full`, Home의 `node` 같은 detail/drill-in key는 버린다.

- **공통 3축은 화면을 바꿔도 유지된다** — 이것이 "한 화면에서 보는 듯한" 경험의 핵심.
  Resources에서 `prod-eks + checkout-api`를 걸고 Issues로 가면 그대로 유지된다.
- label 축도 공통 3축과 함께 유지된다.
- 화면별 추가 축은 해당 화면을 떠나면 보존하되 다른 화면에 적용하지 않는다
  (돌아오면 복원).
- URL 공유 = 필터 상태 공유. 새로고침에도 복원.

Provider 규칙:
- `UnifiedFilterProvider`는 `location.search`를 매 render 파싱하며 별도 filter state를 복제하지
  않는다. mount effect, 첫 Cluster 자동 선택, 자동 canonical write, API 호출이 없어야 한다.
- canonical write는 사용자가 filter를 바꾸거나 명시적으로 migration을 요청할 때만 수행한다.
  같은 의미의 상태는 history를 쓰지 않으며 한 사용자 이벤트는 updater 한 번으로 원자적으로
  제출한다. 같은 이벤트에서 updater를 연속 호출해 중간 URL을 합성하지 않는다.
- 동일 화면의 filter 변경은 pathname·hash와 detail identity를 보존한다. 화면 이동 helper만
  모든 common/surface filter를 보존하고 detail/drill-in key를 제거한다.
- legacy `ClusterScopeProvider`·Resources query·셸 navigation이 canonical key로 함께 전환되기
  전에는 이 Provider를 production composition root에 mount하지 않는다. 부분 mount는 첫 Cluster
  자동 선택이나 legacy helper가 새 filter query를 지우는 오류를 만든다.

### 2.5 필터와 상세의 경계 (모순 해소 규칙 — 반드시 준수)

1. **상세 화면 안에는 필터를 적용하지 않는다.** 인시던트 인과 체인, 리소스 상세,
   앱 상세는 완전한 진실을 보여준다. 필터로 체인의 노드를 빼면 인과가 왜곡된다.
2. **상세 진입 시 칩은 사라지지 않고 흐리게(dimmed) 표시**하고
   "목록에 적용 중" 툴팁을 준다. 뒤로 가면 그대로 복원.
3. **상세 내부 항해(노드 클릭 등)는 필터를 변경하지 않는다.** 다만 이동한 항목이
   현재 필터 밖이면 상단에 한 줄 고지: "이 항목은 현재 필터에 포함되지 않습니다
   — [필터 해제]". 정직하게 알리고 선택권을 준다.

### 2.6 Filter identity와 적용 권위

- Cluster는 `ClusterSummary.id`, application은 canonical `applicationId`를 chip identity로 쓴다.
- Namespace는 `NamespaceRef(clusterId, namespace)` exact pair다. 같은 이름의 namespace를
  여러 Cluster에서 하나로 합치지 않는다.
- Resources의 종류 chip은 현재 live inventory가 제공하는 `resource_type` ID다. UI 표시명은
  Kubernetes kind처럼 보일 수 있어도 상세 identity의 `kind`와 혼용하지 않는다.
- filter engine은 조건을 표현·직렬화할 뿐, 잘린 page를 client에서 post-filter해 전체 결과처럼
  보이지 않는다. 각 surface adapter가 서버 filter query로 변환하고 response completeness를
  그대로 표시한다.
- Home은 VP-011 범위다. VP-010 filter state는 Home을 통과해 보존할 수 있지만, Home data에
  적용하거나 기존 단일-cluster projection을 바꾸는 일은 VP-011 계약 전에는 하지 않는다.

### 2.7 Surface별 Label 대상

Label filter는 top-level 결과 행의 stable ID를 distinct count한다. 집계 행은 연결된 **동일한
canonical Kubernetes 객체 하나**가 선택된 모든 Label을 동시에 가질 때만 일치한다. 서로 다른
객체의 Label을 합쳐 AND를 만족시키지 않는다.

| surface | Label source snapshot |
|---|---|
| Resources | 조회 snapshot의 live resource `metadata.labels` |
| Issues | incident를 생성·마지막 평가한 event-time evidence resource snapshot |
| Applications | application binding에 속한 live resource snapshot |
| GitOps | desired revision의 manifest resource snapshot |
| Checks | check가 평가한 evaluation-time target resource snapshot |

서버는 이 source 의미를 surface 계약에 고정하고 response의 snapshot/revision을 반환한다.
해당 source가 없거나 권한상 제한되면 다른 source로 fallback하거나 현재 page에서 추론하지 않는다.
Label capability가 없는 surface에서는 URL 값을 보존하되 버튼·목록·count를 렌더하지 않는다.

## 3. Resources 재편

### 3.1 좌측 리소스 트리 — CLUSTERS가 최상단

```
∨ CLUSTERS                          3   [+]   ← [+] = 연결 위자드
     🟠 prod-cluster    (cloud)                ← 클릭 = 클러스터 칩 토글
     🔵 staging-cluster (cloud)
     ⚫ dev-kind        (local)
∨ WORKLOADS
     Deployment                    24          ← 선택된 클러스터들의 합산
     Pod                           86
∨ ...
```

- **클러스터 클릭 = 필터 칩 토글** (다중 선택 = 태그 검색). 화면 이동이 아니다.
- **[+] = 클러스터 연결 위자드** (§4). 위자드는 다른 리소스를 다루듯 같은 자리에서.
- **클러스터 이름 우측 메뉴 또는 상세 진입** → 연결 정보·연결 단계·**연결 해제(삭제)**.
- 아래 카운트는 **선택된 클러스터 기준으로 즉시 갱신**된다. 칩 0개면 팀 전체 합산.

### 3.2 Resource type 목록 — 실제 계약 기준으로만

현재 화면은 외부 기준(레퍼런스)의 K8s 분류를 그대로 나열해 대부분 0이고,
EndpointSlice·PodDisruptionBudget·API Registration·cloud CNI 같은 우리 제품 의미가
없는 항목만 숫자가 있다. 이는 BE-Gap 규율 위반이다.

**작업:**
1. 백엔드 inventory 계약(resource_type 열거 / counts[])을 **실측**해 "노출 대상 resource type
   목록"을 확정하고 근거를 이 문서 §7에 기록한다.
2. 계약에 없는 resource type은 **0으로도 렌더하지 않는다.**
3. 계약이 부족하면(열거 API 부재 등) 그 부분만 BE-Gap으로 주차하고
   night-log에 필요한 계약을 명시해 백엔드에 요청한다. **추측으로 채우지 않는다.**
4. "Show N empty"는 backend가 supported/zero/unobserved를 구분한 뒤에만 기본 숨김으로
   제공한다. 현재 counts에 없다는 이유만으로 zero를 만들지 않는다.

### 3.3 결과 목록

- 여러 클러스터가 섞이면 각 행에 **provider 아이콘 + 클러스터명 뱃지**.
- 행 클릭 → 리소스 상세 (필터 미적용, §2.5).

### 3.4 표현 모드

| 모드 | 내용 |
|---|---|
| **표** | 현재의 리스트 (기본) |
| **그래프** | 같은 필터 결과를 관계도로 — 기존 `TopologyCanvas` 자산 재사용. Topology 메뉴 대체 |
| **실시간** | 슬롯만 예약. 백엔드 계약(서비스 간 트래픽) 부재 → **버튼 자체를 렌더하지 않는다** |

그래프 모드 규칙: 클러스터를 넘나드는 그래프는 그리지 않는다. 클러스터 칩이 2개
이상이면 "그래프는 클러스터 하나를 선택해야 합니다" 안내 + 선택 유도.

## 4. 클러스터 연결 위자드 (점진적 · 동적)

### 4.1 원칙 — 점진 공개

- 처음엔 **최소 입력 하나만** 보인다. 입력값을 시스템이 **인식하면 다음 필드/단계가
  자연스럽게 열린다** (등장 애니메이션, 상단 스텝 인디케이터가 다음 단계로 진행).
- 사용자가 "다음"을 계속 누르는 폼이 아니라, **대화하듯 진행되는 흐름**.
- 인식·검증 중에는 해당 필드에 인라인 진행 표시(§6), 결과는 성공/실패를 즉시 반영.

### 4.2 단계 (동적 진행)

1. **provider 선택** — 카탈로그(managed cluster/generic)에서. 선택 즉시 2단계 열림.
2. **사전 준비 안내** — provider별 명령 문구(예: `aws eks update-kubeconfig ...`).
   "확인했습니다" 체크 시 3단계 열림.
3. **원커맨드 발급** — `curl … | kubectl apply` (복사 버튼, 토큰 만료 카운트다운).
   복사 즉시 4단계(대기 상태)로 자동 진행.
4. **연결 감지 — 실시간 진행** (§5 비차단 규칙 적용):
   ```
   ✓ 토큰 발급됨
   ⟳ 설치 대기 중...          ← 현재 단계, 진행 애니메이션
   ○ agent 첫 접속
   ○ 스냅샷 수신
   ○ 연결 완료
   ```
   백엔드 `connection_stage`를 폴링해 단계별로 체크가 채워진다.
5. **완료** — 성공 순간 표시 후, 해당 클러스터가 트리에 등장하고 자동으로 칩 선택.

### 4.3 미지원 provider

generic("수동 kubeconfig 불필요 · 동일 원커맨드")으로 정직 표기. 추측 분기 금지.

## 5. 비차단 진행 상태 (전역 규칙)

**어떤 장기 작업도 UI를 막지 않는다.**

1. 위자드의 연결 감지, 저장소 등록, 배포 등 **장기 작업은 백그라운드로 계속된다.**
2. **모달/위자드를 닫아도 작업은 취소되지 않는다.**
3. 창을 닫은 뒤에도 **진행 중임이 목록·그래프에서 보여야 한다:**
   - 리소스 트리의 CLUSTERS에 해당 클러스터가 **"연결 중" 상태로 즉시 등장**
     (스피너 + 단계 텍스트)
   - 결과 목록/그래프의 해당 노드에도 진행 표시
   - 완료 시: 성공이면 정상 상태로 전환 + 순간 토스트, 실패면 오류 상태 + 재시도 진입
4. 진행 중 항목을 클릭하면 위자드가 **그 단계 그대로 다시 열린다** (상태 보존).

## 6. 통신 상태 시각화 (전역 규칙)

모든 서버 통신은 다음 3상태를 시각화한다. 사용자가 "대기 중인지 멈춘 건지" 헷갈리지
않게 하는 것이 목적이다.

| 상태 | 표현 |
|---|---|
| **대기/진행** | 해당 영역에 인라인 진행 표시(스켈레톤·스피너·프로그레스). 전역 차단 금지 |
| **완료** | 성공 표시를 **순간 노출 후 자연스럽게 사라짐** (체크 애니메이션 → fade) |
| **실패** | 명시적 오류 + 재시도 경로. 조용한 실패 금지 |

- 진행 표시는 **작업이 일어난 자리에** 둔다(전역 상단 바 남용 금지).
- 낙관적 완료 표시 금지 — 서버 확인 전에 성공으로 그리지 않는다.
- `prefers-reduced-motion` 존중: 애니메이션 대신 정적 상태 전환.

## 7. Git 저장소 등록 위자드 (같은 점진 원칙 적용)

위자드의 점진 공개는 클러스터 연결만이 아니라 **모든 선형 절차에 적용되는 패턴**이다.
저장소 등록이 그 두 번째 사례다.

1. **주소 입력 하나만** 보인다.
2. 입력값을 **인식**한다: `https://` 포함 여부, host/owner/repo 파싱, provider 판별.
   인식 성공 시 즉시 다음 단계 열림.
3. **접근 검증** — 진행 표시. 공개 저장소면 통과, 비공개면 **토큰 입력 필드가 열린다**
   (토큰 필요 사유를 한 줄로 설명).
4. **브랜치 자동 인식** — 접근 성공 시 브랜치 목록을 조회해 **드롭다운으로 제시**
   (기본값 = 기본 브랜치). 선택 시 다음 단계 열림.
5. **설정 파일 인식** — 저장소에서 매니페스트/`.remediation.yaml` 후보 경로를 탐색해
   **드롭다운 제시**. 없으면 수동 입력.
6. **완료** — 등록 결과 순간 표시 → 목록에 등장.

각 단계의 인식·조회는 §6 규칙(진행/완료/실패 시각화)을 따르고, §5 규칙(비차단)에 따라
창을 닫아도 진행 상태가 목록에 남는다.

**금지**: 백엔드 계약이 없는 자동 인식을 **추측으로 구현하지 않는다.** 브랜치 목록·
파일 탐색 계약이 없으면 그 단계만 수동 입력으로 정직하게 강등하고, 필요한 계약을
night-log에 요청한다.

## 8. 구현 순서 (프론트)

1. 공용 필터 엔진(칩 UI·URL 동기화·화면 간 유지·필터/상세 경계 규칙) — 단일 컴포넌트
2. Resources 재편: CLUSTERS 트리 + [+] 위자드 진입 + kind 목록 실계약 정리
3. 클러스터 위자드 점진 공개 + 비차단 진행 + 통신 시각화
4. 표/그래프 모드 전환 (그래프 = TopologyCanvas 재사용), Topology 메뉴 제거
5. Issues/Applications/GitOps/Checks에 동일 필터 엔진 적용(표 모드)
6. Git 저장소 등록 위자드에 점진 패턴 적용

Live Traffic은 이번 범위에서 **변경하지 않는다**(현행 유지).

### 8.1 구현 현황 (2026-07-13)

- 1단계의 URL codec, passive Provider, production composition mount, Cluster scope writer,
  shell navigation, shortcut, Home·Resources read/write 전환은 완료했다.
- URL이 유일한 filter 권위다. mount 또는 catalog 수신으로 query를 자동 변경하지 않으며,
  같은 task의 filter/detail write도 순서대로 합성한다.
- Resources detail은 기존 `resource` key 안에 `v1/{clusterId}/{resourceType}/{namespace|~}/{name}`
  identity를 저장한다. 따라서 list filter의 Cluster·kind가 바뀌어도 열린 detail target은
  재지정되지 않는다. legacy `namespace/name + resourceKind`는 읽은 뒤 명시적 detail migration
  write에서만 `v1`으로 바뀐다.
- 현재 단일-cluster backend list 계약으로 표현할 수 없는 다중 Cluster·다중 Namespace,
  Application, Label, health, server search, graph projection은 요청하지 않고 fail-closed한다.
  detail read는 이 list 차단과 독립적이며 해당 identity만 조회한다.
- GAP 착륙 우선순위는 Resources core `002 → 003 → 004`, graph `010`, 타 화면 `005 → 006`,
  wizard `007 → 008`, repository `009`, workspace `001`이다. 앵커 없는 데이터 표면은 계속
  미렌더한다.

## 9. 계약 갭 기록

이 문서 작업 중 발견되는 백엔드 계약 갭은 여기에 누적하고 night-log로 요청한다.
추측 구현 금지, 해당 표면만 미노출.

| ID | 필요한 계약 | 막힌 화면 | 상태 |
|---|---|---|---|
| GAP-001 | 현재 actor가 접근 가능한 workspace cursor catalog, current workspace, switch mutation receipt, session refresh, forbidden/deleted 상태 | 상단 workspace selector | backend 요청 필요 · 미렌더 |
| GAP-002 | workspace-scoped filter facet catalog: stable cluster/application IDs, exact namespace refs, restricted/unresolved 상태, revision, opaque cursor | 공용 filter option과 chip 해석 | backend 요청 필요 · engine codec만 선행 가능 |
| GAP-003 | Resources multi-cluster·multi-namespace·applicationIds·resourceTypes·health·server search query, stable sort, opaque cursor, total/completeness, row cluster identity와 application binding | Resources filter 결과·Showing N of M·다중 Cluster 표 | backend 요청 필요 · client fan-out 금지 |
| GAP-004 | workspace/권한/common·surface filter/snapshot을 받는 surface별 label facet search: `key=value` 부분 검색, 후보를 AND 추가했을 때의 count, selected label 재해석, opaque cursor, result total·unfiltered total·completeness, restricted/redacted 정책 | Labels popover·label chip·Showing N of M | backend 요청 필요 · collection 전수 수집 금지 |
| GAP-005 | Issues의 common axes + severity/status/environment server filter, application/cluster/namespace facet payload, stable detail ID, cursor/total/completeness | Issues filter·filter 밖 detail 판정 | backend 요청 필요 · 미렌더 |
| GAP-006 | provider-neutral Applications/GitOps/Checks canonical list DTO, common/surface axes, cursor/facet counts/completeness | 세 화면 filter와 목록 | backend 요청 필요 · 기존 검증된 read만 유지 |
| GAP-007 | registration preflight/register 동일 validation, 발급 전 command preview 또는 명시적 순서, resume/reissue, structured `connection_stage` reason/error code | Cluster 연결 위자드 완성형 | VP-008 blocker 유지 · 미렌더 |
| GAP-008 | capability/permission, confirmation, operation receipt와 terminal status를 포함한 Cluster 연결 해제 계약 | Cluster 행 메뉴·상세 | backend 요청 필요 · 삭제 UI 미렌더 |
| GAP-009 | repository URL recognition result, access check, credential challenge, branch cursor/default, manifest/remediation candidate path cursor, background operation receipt/status | Git 저장소 등록 위자드 | backend 요청 필요 · 수동값 추측 금지 |
| GAP-010 | Resources filter와 동일 scope/revision을 소비하는 single-cluster graph snapshot, partial/restricted/completeness와 drill-down identity | Resources graph mode·Topology 메뉴 제거 | backend 요청 필요 · Topology 메뉴 제거와 데이터 없는 전환 shell만 선행 가능 · graph data 미렌더 |

### 9.1 GAP-004 최소 소비 계약

예상 canonical DTO 이름은 `LabelSelector`, `LabelFacetQuery`, `LabelFacetItem`,
`LabelFacetPage`, `FilterResultCounts`, `FilterSnapshotMeta`, `SelectedLabelResolution`이다.
endpoint 경로와 저장 구조는 백엔드 소유지만 다음 의미는 필수다.

요청:
- workspace는 인증 session으로 결정하며 query의 임의 workspace ID를 신뢰하지 않는다.
- `surface`는 `resources | issues | applications | gitops | checks` 중 하나다.
- common filter, 해당 surface filter, 결과 검색어, 선택된 Label AND 집합을 모두 전달한다.
- facet 검색어는 결과 검색어와 별도 nullable 필드다.
- `cursor`는 opaque nullable string, `limit`은 양의 정수다. 다음 page는 첫 page와 같은
  snapshot revision에 고정한다.

응답:
- `items[]`는 required `key`, `value`, canonical `selector`, nullable `matchCount`,
  `countCompleteness: exact | partial | unavailable`을 가진다.
- `selectedResolutions[]`는 URL의 각 selector를 `resolved | zero | restricted | unavailable`로
  판정한다. `restricted`는 존재 여부나 count를 추가로 노출하지 않는다.
- `nextCursor: string | null`, `hasMore`, `filteredCount: number | null`,
  `unfilteredCount: number | null`, 각 count의 completeness를 반환한다. 완전하지 않은 0을
  exact 0으로 반환하지 않는다.
- `snapshotRevision`, `authorizationRevision`, `filterFingerprint`, RFC 3339 `observedAt`,
  `stale`, 구조화 `partialReasonCodes[]`를 반환한다.
- cursor는 workspace·authorization revision·surface·정규화 filter·facet 검색어·snapshot에
  결합한다. filter가 바뀌면 기존 cursor는 재사용할 수 없다.
- list와 facet의 snapshot이 다르면 프론트는 count를 섞지 않고 background refreshing으로
  전환한다. restricted source가 포함되면 exact count로 가장하지 않는다.
