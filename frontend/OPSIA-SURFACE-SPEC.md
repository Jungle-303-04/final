# Opsia 요소 단위 사양 — Surface Spec v1 (Master Spec 부속)

> 지위: `OPSIA-MASTER-SPEC.md`(프론트엔드 병합 결정)·`DESIGN-RULES.md`(시각 규칙)의 **부속 바인딩 문서**. 저장소 전체 문서 루트는 `docs/README.md`다.
> 여기서는 새 결정을 만들지 않는다 — 각 화면의 **요소 하나하나**를 [값 → API → 표현 → 모션 → 인터랙션]으로 바인딩한다.
> 예외: §14 레퍼런스 패턴 판정표는 Master Spec **D21이 위임**한 요소 단위 채택/각색/제외 판정을 담는다.
> 결정과 충돌하면 Master Spec 승리. D#·토큰명·컴포넌트 경로는 전부 그쪽 정의를 가리킨다.

표기 약속: 색은 토큰명만(`--primary`, `--status-*`, `TINT`=`color-mix` 유틸). 모션은 D17 스프링명만(SOFT/SPRING/PAGE/EASE_DRAW). API는 dev `src/api/` 모듈명. "폴링"=`serverRefreshScheduler` 주기, "SSE"=`apiStreamResponse`.

---

## 1. 전역 셸 (`app/ProductShell.tsx`)

| 요소 | 값·지표 | 데이터 소스 | 표현 | 모션 | 인터랙션 |
|---|---|---|---|---|---|
| 좌측 내비 레일 | 8 항목(0장 표) + 활성 표시 | `productRoutes.ts` 카탈로그 | 컴포넌트 sidebar, 아이콘=lucide(카탈로그 `routeIcons`), 라벨 `text-label` `--muted-foreground`, 활성=`--primary` 틴트 배경+`--foreground` | 활성 인디케이터=`layoutId` SOFT | 클릭=라우트, 접기 토글(<1100px 자동 접힘), `g *` 단축키 |
| 워크스페이스 (헤더 맨 왼쪽, D20) | 현재 워크스페이스명 | 기존 `SidebarWorkspaceSwitcher` 데이터(헤더로 이동) | 아이콘+`text-bodyStrong` | — | 드롭다운: 워크스페이스 전환 |
| 스코프 칩 | 클러스터명 · ns명 (활성 시만) | D14 스코프 저장소(`cluster-scope`/`namespace-scope`) | 칩: `--primary` TINT bg/bd, `text-label`, `×` 아이콘 | 등장/소멸 SOFT | 클릭=드롭다운(클러스터 목록=`cluster-summary`, ns 목록=`namespace` API), `×`=해제 |
| ⌘K 검색 | placeholder "리소스, 서비스, 저장소 검색" | cmdk 인덱스: `inventory` + `application-catalog` + gitops repos | `ProductCommandPalette`, 인풋 `text-body`, 결과 그룹 헤더 `text-caption` `--caption-foreground` | 팔레트 개폐=프리미티브 토큰 모션(D17) | 선택: 리소스=D3 시트, 서비스/앱=`/deploy` 상세, 저장소=`/deploy` 저장소 탭. "전체 결과" 항목 금지(D6) |
| 벨 + 배지 | 미확인 수 | `alert-events`(SSE)+`operation-events`(SSE), D4 읽음 규칙 | lucide Bell, 배지=`--status-critical` bg 원형 `text-caption` 흰 글자 | 새 항목 도착 시 배지 SOFT 스케일 펄스 1회 | 클릭=알림 센터(§9) |
| 로케일/테마 토글 | — | 기존 | 기존 유지, 토큰 수렴 | — | 기존 |
| 계정 메뉴 (헤더 맨 오른쪽, D20) | 아바타(이니셜) | 인증 세션(`AuthBarrier`) | 아바타 28px 원형 `--primary` TINT, 열면 카드: 이름 `text-bodyStrong`·이메일 `text-caption` MONO·워크스페이스 관리·로그아웃 | 드롭다운 SOFT | 로그아웃=세션 종료→로그인 화면, 사이드바 프로필 제거 |
| AI FAB | — | — | 우하단 fixed z75, 지름 48, `--primary` bg, 흰 스파크 아이콘, `ELEV.pop` | 등장 SOFT, aiOpen 시 소멸 SOFT | 클릭=AI 패널(§10) |
| 토스트 | 6.2 매트릭스 사건만 | sonner | 우상단(헤더+10px), `--card` bg+`ELEV.pop`, 제목 `text-bodyStrong`, 톤 아이콘=`--status-*` | 진입/퇴장 SOFT, 4초 자동 소멸 | 클릭=관련 표면 이동(있을 때만) |

전역 규칙: 헤더 z74·FAB 75·토스트 80(6.4). 모든 숫자는 `tabular-nums`.

---

## 2. 홈 `/home` (5.1·D21 — 위젯 보드)

### 2.1 고정 헤더

| 요소 | 값·지표 | 데이터 소스 | 표현 | 모션 | 인터랙션 |
|---|---|---|---|---|---|
| 상태 요약 줄 | 클러스터 N · 노드 R/N · 파드 P · OutOfSync k · 임계 c | `cluster-summary` + `inventory-summary` + `gitops-overview`(폴링) | 한 줄 세그먼트, 라벨 `text-label` `--caption-foreground`, 값 `text-bodyStrong` MONO, 임계 칩=`--status-critical` TINT | 값 변경 시 숫자 크로스페이드 SOFT | 임계 칩 클릭=`/resources` 목록 관점 `health=critical` 필터 |
| 주 액션 슬롯 | `+ 클러스터 연결` | — | `--primary` 버튼(페이지당 주 액션 1개 규칙) | — | 연결 모달 `initialView:"cluster"` |
| 기간 컨텍스트 | 오늘/7일/30일 | URL(6.3) | 셀렉터 1개 — 전 시계열 위젯 공통 | — | 위젯별 개별 토글 금지 |
| `Edit layout` | 편집 모드 | `preferences` 저장 | ghost 버튼, 편집 중=위젯 흔들림 없이 핸들 표시 | 배치 변경 SPRING(layout) | dnd-kit 드래그, 위젯 추가(카탈로그 시트)/제거 |

### 2.2 위젯 카탈로그 (W1~W8 — 이 목록 밖 위젯 금지, 전부 `WidgetFrame` 사용)

| ID | 위젯 | 값·지표 | 데이터 소스 | 본문 시각(D21 부품) | 딥링크(`>`) |
|---|---|---|---|---|---|
| W1 | 클러스터 카드 그리드 (제거 불가) | D1 카드 사양 전체 — 상태 필·이름·버전·카운트 줄·CPU/MEM `MiniBar` | `clusterStats` 어댑터(`cluster-summary`+`cluster-detail`) | `ClusterCard`×N + `+ 연결` 점선 카드. 카드 등장 스태거 SOFT, hover `ELEV.hover`, 클릭=지도 드릴 PAGE, `⋯`=연결 해제 | (자체가 표면) |
| W2 | 인시던트 레일 | 상위 3건: 심각도·제목·대상·경과 MONO | `issues`+`rca` (폴링) | `RankList`(색점=심각도 상태색), 행 스태거 SOFT, open 행=`--status-critical` TINT 배경(카드형 행 패턴 P-01) | `/issues` |
| W3 | 동기화 비율 | Synced/OutOfSync 비율 · 저장소 수 · 최근 동기화 시각 | `gitops-overview` | `RatioBar`(`--status-healthy`/`--status-warning`) + 범례(%+증감), 요약 1줄 | `/deploy` 저장소 탭 |
| W4 | 활동 추이 | 기간 내 배포 수·알림 수·임계 리소스 수 시계열 | `timeline` 집계 + `alert-events` (기간 컨텍스트 적용) | D13 멀티라인(범례 색점, hover=크로스헤어+어노테이션 카드), 드로잉 EASE_DRAW | `/timeline` |
| W5 | 네임스페이스 파드 분포 | ns별 파드 수 상위 5+기타 | `inventory-summary` | `Donut` + 값 범례(색점·ns·수·%) | `/resources` 목록(ns 필터) |
| W6 | 임계 상위 리소스 | 임계·주의 리소스 상위 5: kind 아이콘·이름·사유(OOMKilled 등) | `inventory`(health 필터) | `RankList`, 사유 `text-caption` MONO | 각 행=D3 시트, `>`=`/resources` 목록 crit 필터 |
| W7 | 비용 요약 | 기간 총액·증감(증가=`--status-warning` TINT)·월별 분포 | `cost-overview` | `KpiCard`(값 `text-title1` MONO+증감+요약 1줄) + `MiniBars`(현재 구간 강조) | `/cost` |
| W8 | 최근 변경 | 타임라인 최신 5건 | `timeline` | 타임라인 **미니 뷰 임베드**(§12 문법 — 신규 피드 구현 금지) | `/timeline` |

빈 상태(클러스터 0): 보드 대신 `+ 클러스터 연결` 카드+1문장(해소 액션 1개 규칙). 각 위젯의 소스 실패 시 위젯 단위 오류 상태(재시도 버튼) — 보드 전체를 죽이지 않는다.

---

## 3. 리소스 `/resources` — 지도 관점 (5.2, D12·D18)

| 요소 | 값·지표 | 데이터 소스 | 표현 | 모션 | 인터랙션 |
|---|---|---|---|---|---|
| 관점 세그먼트 | 지도/목록/흐름 | URL(6.3) | 세그먼트 컨트롤: 활성=`--card`+`ELEV.hover`, 비활성 `--muted-foreground` | 인디케이터 `layoutId` SOFT | 클릭=관점 전환(스코프 보존), URL 갱신 |
| 상태 요약 줄 | 홈 §2와 동일 요소 재사용 | 동일 | 동일(두 번째 구현 금지) | 동일 | 동일 |
| 클러스터 단계 | D1 카드(동일 컴포넌트) | 동일 | 2열 그리드 | 동일 | 클릭=노드 단계 드릴 PAGE |
| 개요 스트립 (D2) | 계정 · 버전 · ns n / CPU used/total cores · MEM used/total Gi · NET MB/s · DISK % / ARN / 자동갱신 | `clusterStats` 어댑터(카드와 동일 함수) + `cluster-detail` | 1행 라벨 `text-caption`·값 `text-bodyStrong` MONO, ARN=MONO `--caption-foreground` 말줄임, 종류 링크 6종=`--primary` `text-label` | 스트립 등장 SOFT(드릴 직후) | 종류 링크 클릭=목록 관점 전환+해당 kind 필터(스코프 유지) |
| 노드 타일 | 이름·인스턴스 타입·Ready 여부·파드 슬롯(스팟 cap/10 스팬) | `physical-topology`(폴링) | 4칸 그리드 `minmax(0,1fr)`, 타일=`--card`+RADIUS.card, NotReady=`--status-warning` TINT 테두리, 파드 점=상태색 원 | 타일 스태거 SOFT, 드릴 PAGE | 클릭=파드 단계, hover=액션 필(absolute, 겹침 금지) |
| 파드 단계 | 파드 칩: 이름·상태색 | `physical-topology`+`inventory` | 칩 그리드, 임계=`--status-critical` 채움+흰 글자, 렌즈 필터 시 `파드 N/전체 · 필터 적용됨` 캡션 | 렌즈 전환 SPRING(레이아웃) | 파드 클릭=D3 시트, 렌즈=우패널 hover/pin |
| 우측 패널 (D16) | 탭 4: 리소스 종류(카운트)/서비스/설정(ConfigMap·Secret)/배포(저장소) | `inventory-summary`·`application-catalog`·`gitops-overview` | 탭 인디케이터 SOFT, 행: 아이콘(서비스=고유색 글리프, Secret=`--caption-foreground`, OutOfSync=`--status-warning` 경고점)+`text-body`+`text-caption` 서브 | 행 스태거 SOFT | hover=렌즈, 클릭=pin, 종류 클릭=목록 관점, `+ 저장소 연결`=연결 모달 repo |

## 4. 리소스 — 목록 관점 (D5 표)

| 요소 | 값·지표 | 데이터 소스 | 표현 | 모션 | 인터랙션 |
|---|---|---|---|---|---|
| 종류 선택 | 30종 카운트 | `inventory-summary` | D16 패널 리소스 종류 탭이 곧 선택기 | — | 클릭=표 전환 |
| 표 헤더 | kind별 컬럼(이름·ns·상태·재시작·나이·노드 등) | 컬럼 정의 주입(kind 스펙) | sticky, `text-label` 대문자 +0.06em `--caption-foreground` | — | 클릭=정렬 토글(단일 컬럼) |
| 행 | 셀 값 | `inventory`(폴링, 스코프 파라미터) | `text-body`, 상태 셀=StatusPill, 수치 MONO, 전역 검색어 매치=`--primary` TINT 하이라이트(`Hi`) | 행 스태거 SOFT(8캡), 200행+ 가상화(모션 생략) | 행 클릭=D3 시트, 정렬 기본=상태→이름 |
| 빈 상태 | 필터 설명 문장+`필터 해제` 버튼 | — | `text-body` `--muted-foreground`, 버튼=ghost `--primary` | SOFT | 해제=스코프/검색 초기화 |

## 5. 리소스 — 흐름 관점 (구 `/traffic`, D10)

| 요소 | 값·지표 | 데이터 소스 | 표현 | 모션 | 인터랙션 |
|---|---|---|---|---|---|
| 서비스 노드 | 이름·kind 글리프·replicas·상태 | `relation-topology`/트래픽 어댑터(폴링) | xyflow 노드: `--card`+상태색 보더, 글리프=lucide/브랜드(redis·postgres) | 첫 배치 스태거 SOFT, 드래그=xyflow | 클릭=D3 시트(Service) |
| 호출 엣지 | rps · p99 · 5xx | 동일 | 흐름 대시 선(화살촉 금지), 정상=`--border` → 활성=`--primary`, 오류율>1%=`--status-critical` | 대시 오프셋 rAF 연속 흐름 | hover=값 칩(`text-caption` MONO), 클릭=엣지 고정+시트 |

---

## 6. 상세 시트 (전역, D3 — 탭별)

공통 크롬: 제목 `text-title2`+kind 아이콘+StatusPill, 우상단 전체화면 토글(⤢, forceFull 시 비활성)+닫기. 좌변 드래그 핸들 6px hover=`--primary`. 시트=`--card`+`ELEV.overlay`+RADIUS.sheet(좌측만). 개폐=PAGE(우→좌 슬라이드), forceFull 전환=SPRING.

| 탭 | 요소 | 데이터 소스 | 표현 | 모션 |
|---|---|---|---|---|
| 개요 | 팩트 패널(ns·노드·이미지·나이·재시작·라벨) | `inventory-resource-detail` | 2열 정의 목록: 라벨 `text-caption` `--caption-foreground` / 값 `text-body` MONO | 등장 SOFT |
| 개요 | 관계도 | `relation-topology`(해당 리소스 스코프) | 미니 그래프, 노드 클릭=해당 시트로 교체(스택 아님) | 선 드로잉 EASE_DRAW |
| 개요 | 메트릭 차트(CPU·MEM 2개) | `metrics` 배럴(폴링 15s) | D13 recharts: 점선 그리드 25/50/75(`--border-subtle`)+좌축 `text-caption` MONO+그라데이션 면(상태색 8%)+1.8px 선(임계 리소스=`--status-critical`, 정상=`--primary`)+현재점 펄스 | 최초 드로잉 EASE_DRAW, hover=크로스헤어+값 칩 |
| 개요 | 액션 바(재시작·복제 ±·편집) | `workloads` 배럴 mutation | 버튼: ghost, 파괴적=`--destructive` 텍스트 | 실행 중=버튼 스피너 대신 진행 라벨 |
| YAML | 하이라이트 코드 | `resource-manifests` | 에디터 크롬=신설 코드 토큰(P1, hex 금지), 구문색=shiki 테마 토큰화, `text-body` MONO | 편집 진입 SOFT |
| YAML | diff 프리뷰 | dry-run 응답 | D15 UnifiedDiff: 추가 행=`--status-healthy` TINT bg, 삭제=`--status-critical` TINT bg | 행 스태거 SOFT |
| 이벤트 | type·reason·메시지·나이 | `inventory` events(폴링) | 표 아님 — 타임라인 리스트, reason `text-bodyStrong`, Warning=`--status-warning` 점 | 신규 항목 진입 SOFT |
| 로그 | 스트림 | `log-stream`(SSE) | MONO `text-caption`, 자동 스크롤+일시정지 버튼 | — (스크롤 모션 금지) |
| RBAC | SA·Role·바인딩 | `inventory` rbac | 정의 목록+링크 | SOFT |

## 7. 배포 `/deploy` (5.7) — 요소 바인딩

| 탭 | 요소 | 데이터 소스 | 표현·모션 | 인터랙션 |
|---|---|---|---|---|
| 애플리케이션 | 앱 행: 이름·환경·Sync 상태·헬스·마지막 배포·저장소 | `application-catalog`+`gitops-overview`(폴링) | D5 표. Sync: Synced=`--status-healthy` StatusPill, OutOfSync=`--status-warning`, 배포 시각 상대시간 MONO | 행 클릭=앱 상세 시트(동기화 히스토리·리소스 트리·롤백 버튼=Explicit confirm) |
| 저장소·동기화 | 저장소 행: org/repo·툴(Argo/Flux)·리비전·Sync | `gitops-overview` | GitHub 아이콘(D8)+MONO 리비전, OutOfSync 경고점 | 행 클릭=저장소 상세(동기화 표), `+ 저장소 연결`=D7 모달 |
| 저장소·동기화 | 워크플로 그래프 | `useWorkflowData`+elk | 기존 유지, 엣지·노드 색 토큰 수렴, 배치 전환 SPRING | 단계 클릭=플랜/실행 |
| Helm 릴리스 | 릴리스 행: 이름·차트·버전·상태 | `helm` 배럴 | D5 표, 업그레이드 가능=`--primary` 배지 | 설치/업그레이드 다이얼로그(기존), diff=D15 |

## 8. 인시던트 `/issues` — 요소 바인딩

| 탭 | 요소 | 데이터 소스 | 표현·모션 | 인터랙션 |
|---|---|---|---|---|
| 인시던트 | 행: 심각도 StatusPill·제목·대상 리소스·시작·상태(open/ack/resolved) | issues 어댑터(폴링)+`rca` 배럴 | D5 표, open=`text-bodyStrong` | 행 클릭=RCA 워크스페이스 |
| RCA 워크스페이스 | 원인 구간 타임라인(§타임라인 임베드)·근거 리소스 카드·AI 세션 | `diagnose`(SSE)+`timeline` 구간 쿼리 | 근거 카드=`--card`+상태색 좌보더 4px, AI 스텝=§10 파트 표현 | 근거 클릭=D3 시트, "AI로 분석"=D9 패널 열림+세션 연결 |
| 알림 규칙 | 규칙 행: 이름·조건(MONO)·심각도·채널·enabled 토글 | `alert-rules` | 기존 `AlertRulesPanel`→D5 표 수렴, 토글=실 mutation(장식 금지) | 행 클릭=규칙 편집, AI 생성 규칙에 "AI" 배지(`--primary` TINT) |

## 9. 알림 센터 (벨, D4)

| 섹션 | 요소 | 데이터 소스 | 표현 | 모션 |
|---|---|---|---|---|
| 진행 중 | 작업명·진척 라벨 | `operation-events`(SSE, 기존 스토어) | 블러 카드(`backdrop-filter` — 일시 표면 예외), 진행점 애니메이션 | 진척 갱신 SOFT |
| 오늘/이전 | 아이콘·제목 `text-bodyStrong`·본문 `text-caption`·상대시각 MONO | `alert-events`+완료 작업 | 항목 hover=`--border-subtle` bg, 임계=좌측 `--status-critical` 점 | 목록 개폐 SOFT, 새 항목 진입 SOFT |
| 푸터 | 모두 지우기 | 로컬 | ghost `--muted-foreground` | — |

## 10. AI 패널 (D9)

| 요소 | 데이터 소스 | 표현 | 모션 |
|---|---|---|---|
| 컨텍스트 줄 | `aiAssistantContext`(현재 서피스·스코프) | `text-caption` `--caption-foreground`, 스코프 칩 재사용 | — |
| steps 파트 | `ai` 배럴 스트림 | 체크 진행 리스트, 진행 중=`--primary` 점 펄스 | 단계 완료 SOFT |
| result 파트 | 〃 | 요약 칩: `임계 n · 주의 m`=상태색 TINT | SOFT |
| evidence 파트 | 〃 | 근거 카드(§8과 동일 컴포넌트) | 스태거 SOFT |
| links 파트 | 〃 | `--primary` 링크 행 — 전부 실 라우트(6.3) | — |
| action 파트 | `alert-rules` mutation | `AiAlertRuleActionCard`: 조건 MONO, `만들기` 버튼=`--primary` | 생성 중=진행 라벨, 완료=created 상태+D4 발화 |
| 입력줄 | — | textarea 1행 자동 확장, 전송=`--primary` | — |

## 11. 연결 모달 (D7)

| 요소 | 데이터 소스 | 표현 | 모션 |
|---|---|---|---|
| 선택 화면 | — | 카드 2개(클러스터/저장소)+브랜드 아이콘, `initialView` 시 생략 | 모달 개폐=프리미티브 토큰, 내부 단계 전환 PAGE |
| 폼(클러스터) | `cluster-registration` | 이름·프로바이더 선택(브랜드 아이콘 라디오), 명령 복사 블록=코드 토큰+복사 버튼 | — |
| 폼(저장소) | gitops 등록 API | URL 인풋+브랜치+툴 선택 | — |
| 진행 스테이지 | `cluster-connection` 진행 이벤트(SSE) — 고정 타이머 금지 | `ConnectStages`: 3그룹, 완료=`--status-healthy` 체크, 진행=`--primary` 펄스, 대기=`--caption-foreground` | 체크 전환 SOFT |
| 완료 | — | 요약 1줄 후 자동 닫힘(D4 발화) | 닫힘 SOFT |

## 12. 타임라인 · 점검 · 비용 (5.9·5.10 — 차등 바인딩만)

- **타임라인**: 스트립 이벤트 점=유형별 아이콘+상태색, 시간축 `text-caption` MONO, 구간 브러시 선택=`--primary` TINT. 소스 `timeline`(SSE+폴링). 이벤트 클릭=상세 시트(D3 계약). 인시던트 마커 클릭=`/issues` 해당 건.
- **점검**: 결과 표=D5(정책·대상·결과 StatusPill·심각도), 소스 `checks` 배럴. 행 클릭=대상 리소스 D3 시트(개요 탭 위반 배지=`--status-warning` TINT).
- **비용**: 개요 카드 3(총액·전월比·최다 소비)=`text-title1` MONO+증감 화살표(증가=`--status-warning`, 감소=`--status-healthy`), 추이=D13 recharts 면 차트, 노드 비용 표=D5, 라이트사이징 제안 행 클릭=워크로드 D3 시트. 소스 `cost-*` 배럴.

---

## 13. 네거티브 검토 결과 반영 (이 문서 자체에 가한 수정)

1. ~~파드 칩 임계=빨강 채움+흰 글자~~ — AA 대비 검증 필요 → **유지하되 P2에서 `--status-critical` 위 흰 글자 대비 실측, 미달 시 TINT+진한 글자로 전환** (게이트 조건화).
2. 시트 개요 탭 관계도의 "노드 클릭=시트 교체(스택 아님)" — 뒤로가기와의 상호작용 모호 → **교체 시 history replace**(D3 히스토리 규칙과 정합) 명시.
3. 로그 탭 자동 스크롤 — 사용자가 위로 스크롤하면 자동 스크롤 해제+`↓ 최신` 버튼(놓친 줄 수 MONO). 무규정이던 것 보강.
4. 흐름 관점 rAF 대시 흐름 — reduced-motion 시 정지(정적 대시). D17 필수 조항의 구체 적용.
5. 비용 증감 색 — "증가=빨강"은 상태 어휘 오용 → **증가=`--status-warning` TINT(비용 증가는 임계가 아니라 주의)**로 확정, 표 12에 이미 반영.
6. 벨 블러 카드 — 다크 모드에서 `backdrop-filter` 대비 저하 → 다크는 불투명 `--card` + `ELEV.pop`으로 대체(블러는 라이트 전용).
7. AI links 파트 — "전부 실 라우트" 검증을 8.2 스윕 3(가짜 컨트롤 0)의 명시 대상에 포함.

---

## 14. 레퍼런스 패턴 카탈로그 — 전수 판정표 (2026-07, 이미지 9종 + Botrix)

출처: R1 다크 서비스 표 / R2 미니멀 서버 리스트 / R3 뮤직 플레이어 / R4 카테고리·세그먼트 카드 / R5 KPI 카드 스택 / R6 Tasks&Events 타임라인 / R7 CLOBMApp / R8 DUDU 의료 모니터링 / R9 Kargul CRM / R10 YogaPlanner / R11 Botrix AI Command Center.
**모든 요소는 아래 세 판정 중 하나를 받는다 — 판정 없는 요소는 없다.** 채택=그대로, 각색=우리 규칙으로 변형, 제외=사유와 함께 도입 금지.

| # | 요소 (출처) | 판정 | 매치 위치 / 공용 부품 | 근거·비고 |
|---|---|---|---|---|
| P-01 | 카드형 행 + 상태 틴트 배경 (R1) | 채택 | D5 표: 임계 행 `--status-critical` TINT bg, 인시던트 open 행. W2 | 스캔 중 위험 행이 먼저 읽힘 |
| P-02 | 세그먼트 틱 게이지 (R1 CPU, R4 바) | 채택 | `widgets/TickGauge` — 위젯 KPI 전용(역할 분담 D21) | 연속 바(MiniBar)와 사용처 분리 |
| P-03 | 상태 필 Active/Paused/Inactive (R1) | 흡수 | 기존 `StatusPill` — 라벨은 상태 어휘 | 두 번째 필 금지 |
| P-04 | 국기 아이콘 위치 표기 (R1·R11) | 각색 | 리전 코드 텍스트(`ap-northeast-2`) MONO — 개요 스트립·카드 캡션 | 국기=국가≠리전 오해, 이모지 렌더 편차 |
| P-05 | NO 순번 컬럼 (R1) | 제외 | — | 이름이 식별자, 정보량 0 |
| P-06 | 도트 매트릭스 점유 슬롯 (R2 VM) | 채택 | `widgets/SlotMatrix` — 노드 타일 파드 슬롯(데모 기존 사양 정식화) | 채움=사용·빈칸=여유 |
| P-07 | used/total 게이지+임계 빨강 (R2) | 흡수 | 기존 MiniBar·개요 스트립 표기 | — |
| P-08 | 스펙 캡션 줄 `3 CORES · 40 vCPU` (R2·R11) | 채택 | 노드 타일·클러스터 캡션: `text-caption` MONO ` · ` 구분 | — |
| P-09 | 배경 채움 진행 바 (R3) | 채택 | `widgets/ProgressFill` — 벨 진행 중 항목, 연결 스테이지 | 진행이 곧 배경 = 한눈 |
| P-10 | 컴팩트↔확장 토글 » (R3) | 각색 | WidgetFrame 접기 토글로만 | 임의 표면 접기 남발 금지 |
| P-11 | 다크/라이트 변형 (R3) | 흡수 | 4.1 다크 규칙 | — |
| P-12 | KPI 큰 값+증감 배지+기간 (R4·R5·R7·R9·R11) | 채택 | `widgets/KpiCard` — W7 등. 값 `text-title1` MONO, 증감=상태 어휘 틴트 | 증감 색 의미는 지표별 정의(비용 증가=주의) |
| P-13 | 캐러셀 페이저 ‹ › (R4, R10 주간 칩) | 각색 | 위젯 내 "상위 N 순환"만, 자동 회전 금지 | 자동 회전=정보 유실 |
| P-14 | 도넛+값 범례 (R4·R7·R8) | 채택 | `widgets/Donut`(D13 recharts) — W5, 비용 구성 | 3D·그라데이션 금지 |
| P-15 | ⓘ 설명 툴팁 (R4) | 채택 | WidgetFrame 제목 옆 — 일시 표면 예외 명문화 | 본문 안내 문구는 여전히 금지 |
| P-16 | Details 버튼 / › 체브론 (R4·R5) | 채택 | WidgetFrame `>` 딥링크 — 반드시 실 라우트 | 가짜 컨트롤 0 스윕 대상 |
| P-17 | 진행 바+자연어 요약 1줄 (R5a) | 채택 | KpiCard 요약 줄 규칙(수치 강조=틴트) | — |
| P-18 | 아바타 그룹 +10 (R5a·R9) | 제외 | — | 팀 협업 개체가 제품에 없음 |
| P-19 | 이중 비율 바+범례 (R5b) | 채택 | `widgets/RatioBar` — W3, 정상/임계 파드 비율 | — |
| P-20 | 미니 막대+현재 구간 강조 (R5c·R10) | 채택 | `widgets/MiniBars` — W7 월별, 시간대 분포 | — |
| P-21 | 세로 타임라인: 체크·취소선·현재 파랑·점선 (R6) | 채택 | §12 타임라인 이벤트 리스트·RCA 조각 문법 | 완료=체크, 현재=`--primary` |
| P-22 | 필터 칩(아이콘+활성 필) (R6·R11 피드) | 채택 | 타임라인 유형 필터·벨 섹션 — 규칙: 칩=필터, 탭=관점 | 혼용 금지 |
| P-23 | 리스트 인라인 액션 (R6 Open in) | 채택 | 리스트 항목 우측 ghost 액션("리소스 열기") | — |
| P-24 | 하단 음성 입력 바 (R6) | 제외 | — | 해당 도메인 없음 |
| P-25 | KPI 스트립 한 줄 (R7·R9 2줄) | 각색 | 상태 요약 줄(고정 헤더)이 오너 — 위젯화하지 않음 | 요약 줄과 KPI 위젯 이중화 금지 |
| P-26 | 상태를 텍스트 색만으로 (R7 In Process) | 제외 | — | StatusPill 규칙 우위(색맹 접근성) |
| P-27 | 대형 시계·날짜 (R8) | 제외 | — | 장식, 정보량 0 |
| P-28 | 아이콘 틴트 원 + KPI (R8·R9) | 채택 | KpiCard 아이콘 자리=TINT 원 | — |
| P-29 | 기간 토글+날짜 범위 (R8, R10 Days/Hours) | 각색 | 보드 우상단 기간 컨텍스트 1개(§2.1) | 위젯별 토글 금지 |
| P-30 | 순위 리스트(색점+값) (R8 부서·R7 범례) | 채택 | `widgets/RankList` — W2·W6, 비용 상위 | — |
| P-31 | 링 게이지 순간값+범위 (R8 체온·R11 CPU) | 각색 | `charts/RingGauge` — **상세 시트 개요 한정**(D21 역할 분담) | 카드·홈 금지=D1 유지 |
| P-32 | 상태 틴트 카드 그리드 목록 (R8-3) | 제외 | — | 표(D5)+맵(D12)이 오너 — 세 번째 목록 표현 금지 |
| P-33 | 사이드바 섹션 라벨 (R9) | 제외 | — | 8메뉴 규모에 과함 |
| P-34 | `Edit layout` 보드 편집 (R9) | 채택 | D21 핵심 — dnd-kit, preferences 저장 | — |
| P-35 | 퍼널 차트 (R9) | 제외 | — | 배포 단계=워크플로 그래프 오너, 이탈률 개념 없음 |
| P-36 | 멀티라인 추이+호버 어노테이션 카드 (R9·R11) | 채택 | W4 + D13 크로스헤어 문법에 어노테이션 카드 추가 | — |
| P-37 | 우선순위/SLA 칩 (R9) | 흡수 | 심각도 StatusPill | — |
| P-38 | 주간 캐러셀 기간 칩 (R10) | 흡수 | P-29 기간 컨텍스트 | — |
| P-39 | 합성 점수 반원 게이지 Load Score (R10) | 제외 | — | 산정 근거 없는 점수=가짜 정보(D21 금지 명문) |
| P-40 | 타임 블록 일정 그리드 (R10) | 제외 | — | 예약 도메인 없음, 타임라인 스트립이 오너 |
| P-41 | 상단 알약 내비 (R11) | 제외 | — | 사이드바 8메뉴 확정(D19) |
| P-42 | 수동 Refresh 버튼 (R11) | 제외 | — | 자동 갱신 일원화(개요 스트립 수동 갱신만 존속) |
| P-43 | 페이지 헤더 우측 주 액션 CTA (R11 Create Agent) | 채택 | 서피스당 주 액션 1개 슬롯(홈=`+ 클러스터 연결`) | 두 개 이상 금지 |
| P-44 | 서버 카드 직접 액션 버튼 Restart/SSH (R11) | 각색 | 카드 직접 액션 금지(D1 최소주의) — 액션은 `⋯` 메뉴·상세 시트 | 오클릭 위험 |
| P-45 | 통합 토글 목록(브랜드 아이콘+설명+ON/OFF) (R11) | 채택 | `/settings` 통합 섹션 문법(Prometheus 등) — 토글=실 mutation | — |
| P-46 | Live Activity Feed (R11) | 흡수 | 벨(이벤트)+W8(타임라인 미니) — 신규 피드 금지 | 세 번째 이벤트 표면 차단 |
| P-47 | 바코드형 장식 스파크 (R11 KPI 하단) | 제외 | — | 데이터 축 없는 장식 — 실 스파크라인만 허용 |
