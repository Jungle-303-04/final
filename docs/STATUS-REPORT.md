# 실행 상태 자기 진단

기준 시각은 2026-07-20 06:35 KST다. 원격 `dev`는 `5252a85ec49fbaaa1fca1da702dbba74d97f520f`, 라이브는 직전 성공 배포 `e84748b06ded3450ca3693efb5863ccbfc30eb68`로 서로 다르다. demo 기준은 `demo-freeze-v3`의 `adcf92130`이며, 코드·자동 게이트·API 계약·라이브 상태·브라우저 증거가 같은 digest를 가리키지 않는 항목은 완료로 판정하지 않는다.

## 이전 보고 대비 델타 — 10줄 요약

1. `5252a85ec` Dev Gate `29704105721`은 성공했지만 Dev Deploy `29704305166`은 빌드 전 reference UI delta의 unknown Opsia destination 11건으로 실패했다.
2. 실패는 제품 런타임이 아니라 후보에 포함되지 않은 최신 Home/GitOps 계보 분류의 포트 카탈로그 정합 문제이며 BLOCKERS에 run ID와 함께 기록했다.
3. 로컬 후보는 Home 범위·수치 정렬, 독립 알림·AI 대화, Deploy GitOps/워크플로우 복원, 이슈 RCA, 전역 셸·토큰·모션, 중복 GitOps 구세대 제거를 한 작업 트리에 포함한다.
4. 결정적 프론트 회귀 11건을 소거했고 셸·라우트·필터 표적 36/36, GitOps·워크플로우 32/32가 통과했다.
5. 전체 Vitest 443파일·2,271/2,271, `tsc -b`, ESLint, 디자인 가드 1,414파일, production build, `make gate-fast`가 worker 2·저부하 직렬 조건에서 모두 통과했다.
6. feature 원장은 240행, UI delta 원장은 276파일·pending 0이며 삭제 ApplicationCard와 Home/GitOps 이식 계보를 현행 소유자로 재분류했다.
7. 로컬 governance의 첫 재현은 미추적 신규 목적지가 index 기반 카탈로그에서 제외돼 21건으로 실패했으나, 후보 전체를 index에 포함한 재검증은 UI delta 276파일·pending 0·feature 240행·41/41·unknown 0으로 성공했다.
8. `dev=origin/dev` 단일 계보이고 merge/rebase/cherry-pick은 없으며 활성 Gate/Deploy도 0건이다. demo worktree는 read-only로 보존한다.
9. 새 외부 사람 필요 블로커는 0개다. G4는 라이브와 후보 SHA가 다르므로 Home 포함 **부분**, 나머지도 완료 선언 금지 상태다.
10. 다음 3수는 index 포함 governance 0 → 단일 후보 커밋·push와 Gate/Deploy 완주 → 같은 SHA demo/live 1280·1440·1920 증거와 GOAL-LOG 갱신이다.

## 현재 상세 근거

### 파이프라인과 배포

| SHA | Gate/Deploy | 결과 | 판정 |
| --- | --- | --- | --- |
| `fdd75a4f2` | Gate `29682394308`, Deploy `29682449227` | 둘 다 success, 신 IA 인증 8라우트 smoke 통과 | 이전 배포 완주 기준점 |
| `d48f3652a` | Gate `29686718943` | Backend 3,773 pass/3 skip/2 fail: G4 증거 경로 과심도 6파일과 미색인 Markdown 3파일. 후속 push로 전체 run cancelled | 제품 결함 아님, Deploy 없음 |
| `6d3c7bc76` | Gate `29686856764`, Deploy `29686902495` | Frontend가 기준 `d48f3652a` 객체 부재로 시작 전 실패, Deploy skipped | CI shallow checkout 결함 |
| `1d57d4b1b` | Gate `29686939839`, Deploy `29686974817` | Frontend가 기준 `6d3c7bc76` 객체 부재로 시작 전 실패, Deploy skipped | 같은 CI 결함 재현 |
| `8d43b5023` | Gate `29687770231`, Deploy `29687802090` | Frontend가 기준 `1d57d4b1b` 객체 부재로 실패, Deploy skipped | 같은 CI 결함 재현 |
| `1b45b699c` | Gate `29687838966`, Deploy `29687854429` | source-proof가 제목 끝의 모호한 `수정`을 거부, Deploy skipped | 코드 실행 전 커밋 계약 실패 |
| `8f017558a` | Gate `29688137124`, Deploy `29688334831` | Backend 3,772 pass/3 skip/3 fail, Frontend 2,291 pass/1 fail, Deploy skipped | Backend는 로컬 해소, Frontend 어휘 테스트 반송 |
| `f2774f10d` | Gate `29688414550`, Deploy `29688613147` | Backend 성공, Frontend `HomePage.test.tsx` 라벨 기대 1건 실패, Deploy skipped | D22 어휘 정합 결함 |
| `0916099f9` | Gate `29688722835`, Deploy `29688782222` | Gate 성공. Deploy 인증 browser smoke `/resources`에서 activity API 500, 이전 release 롤백 성공 | PostgreSQL epoch-ms int4 overflow |
| `9b022f2f1` | 로컬 검증 | activity 산술 3 bind bigint, 2026 빈/populated series, direct deploy read probe. 표적 33/33, Backend 3,776 pass/3 skip, gate-fast/governance 성공 | `333c65734` ancestry로 배포됨 |
| `333c65734` | Gate `29689900163`, Deploy `29690120559` | Gate success. 실제 DB activity read와 인증 8라우트 browser smoke success, rollback skipped | 직전 완전 Home 증거 기준점 |
| `80e3244ad` | Gate `29691097907`, Deploy `29691204415` | Backend success. Frontend ESLint가 `ClusterCard.test.tsx:80` 미사용 `container` 1건으로 실패, Deploy skipped | 원격 전용, 라이브 미반영 |
| `6c46950d09` | Gate `29691225543`, Deploy `29691288392` | Backend success. 같은 unused `container`로 Frontend/Full gate 실패, Deploy skipped | 같은 원인 연속 재발, 라이브 미반영 |
| `07527f0b89` | Gate `29691325987`, Deploy `29691403364` | proof/backend/frontend/full gate와 post-deploy/authenticated browser smoke success, rollback skipped | 이전 성공 기준점 |
| `fc94c6979` | Gate `29692135864`, Deploy `29692193340` | `HomeClusterGrid.test.tsx` 미사용 `userEvent`·`vi`로 Frontend lint 실패, Deploy skipped | 제품 실행 전 정적 게이트 실패 |
| `723ab27aa9` | Gate `29692859664`, Deploy `29692918077` | Gate success, Deploy success(5m50s), console/authenticated browser smoke success, rollback skipped | 직전 디자인 배치 기준점 |
| `fd58268d5` | Gate `29693357340`, Deploy `29693439823` | Gate/Deploy success, 홈 위젯 내부 1:1 콘텐츠 문법 반영 | 이전 기준점 |
| `e84748b06` | Gate `29694437337`, Deploy `29694651904` | Gate/Deploy success, Home foundation과 fleet 단일 원장 소비 1차 반영 | 현재 원격·라이브 기준점; exact 대조 결과 G4 부분 |
| `5252a85ec` | Gate `29704105721`, Deploy `29704305166` | Gate success, Deploy는 빌드 전 unknown destination 11건으로 실패 | 로컬 후보 index 정합 후 governance 41/41·unknown 0; 재push 대기 |
| 로컬 후보(커밋 전) | full Vitest·gate-fast·build·governance | full Vitest 443파일·2,271/2,271, gate-fast changed Vitest 210파일·1,190/1,190, typecheck/lint/design 1,414파일/build, governance 41/41 모두 success | 배포와 동일 SHA 증거 전; 완료 아님 |

현재 확인된 성공 기준점에서 원격 `dev`와 라이브는 `e84748b06`으로 일치한다. exact demo `adcf92130`과의 1440 대조에서 Home scope·숫자·편집·차트 델타가 남았으므로 G4 완료를 선언하지 않는다. 다음 push도 소배치 단일 SHA로 만들고 Gate→Deploy 종료까지 추가 push를 금지한다.

### G4 홈과 가시 변화

- 라이브 digest는 `e84748b06ded3450ca3693efb5863ccbfc30eb68`이며 Dev Gate `29694437337`와 Dev Deploy `29694651904`가 모두 성공했다.
- exact demo `adcf92130`과 제품을 1440 viewport로 대조했다. 대조 자체는 수행했지만 동일 후보 SHA의 최종 숫자·클릭·1280~1920 증거는 아직 없다.
- 대조 결과 selected cluster를 골라도 전체 fleet 카드가 남는 scope 모순, 헤더·카드 장애 숫자 불일치, W2~W8 편집 및 차트 문법 델타가 확인됐다.
- 현재 로컬 후보는 선택된 scope만 카드에 반영하고 헤더 장애 수를 같은 카드 원장에서 계산하며, exact 위젯 제목·`전체 보기`·편집 tray·차트 legend/labels를 재구현한다.
- latest accepted snapshot의 `노드 2/2·파드 6/9`는 현재 관측 범위의 값이지만 `resources_complete=false`다. 이를 전체값으로 승격해 기존 `2/3·41` critical 상태를 숨기는 후보는 자기감사에서 반려했고, count/health는 보수적 read model을 유지한 채 CPU/MEM 실측 fallback만 연결한다.
- namespace 전체 수는 snapshot의 `resources_complete=false` 때문에 정확한 총계로 주장하지 않는다. 사용 가능한 완전성 증거가 없으면 `—`를 표시한다.
- 따라서 Home G4는 **부분**이며, 다음 배포와 같은 SHA의 demo/live 1440·숫자 교차·편집 클릭 경로가 모두 일치할 때만 완료를 재판정한다.

직전 D-4 P0는 제품 코드 후보와 로컬 게이트만 준비됐고 배포·동일 SHA 증거가 없으므로 미해소로 유지한다. 후속 G4는 **Home → 알림 → AI 대화 → 배포/GitOps/워크플로우 → 리소스 3관점·트래픽 → 이슈 상세 → 타임라인 → 점검 → 비용 → 설정** 순서를 따른다.

### G4 전 서피스 직접 대조

`demo-freeze-v3`의 `devpreview-unified.html?polish=1`과 제품 `e84748b06`을 1440에서 직접 열어 구조·숫자·클릭을 비교했다. 상세 표는 `docs/evidence/g4/surface-parity-audit-2026-07-20.md`에 있다.

| 판정 | 서피스 | 핵심 잔여 |
| --- | --- | --- |
| 부분 | Home | 후보 배포와 동일 SHA CPU/MEM·W3/W6/W7·편집·3 viewport 증거 |
| 불일치 | 알림 | 독립 내비/서피스, 진행 중 카드, 이벤트 표, 벨·토스트 단일 원장 |
| 불일치 | AI 대화 | 독립 내비/내역, 저장·재개·새 대화; 기존 보조 패널과 원장 통일 |
| 불일치 | 배포 | GitOps 연결·동기화 정보, 워크플로우 편집, Helm의 실행 가능한 상태 |
| 불일치 | 리소스 | 인프라·쿠버네티스·트래픽 3관점, RPS/오류, sticky relation focus |
| 불일치 | 이슈 | compact 목록, 상세 RCA 근거, 복구 실행과 실패 재시도 |
| 불일치 | 타임라인·점검·비용·설정 | 정보 밀도·번역·실관측·연결/재시도, `준비 중` 가짜 컨트롤 0 |

### demo-freeze-v3 디자인 계보 감사

감사 기준은 read-only 견본 `demo-freeze-v3`의 `adcf92130`, 제품 기준은 라이브 SHA `e84748b06`이다. 토큰 정의 자체는 제품에 일부 들어왔지만 각 페이지와 공용 부품의 실제 소비 전환은 끝나지 않았다. 따라서 디자인 가이드가 문서·토큰 파일에 존재한다는 사실만으로 병합 완료로 판정하지 않는다.

| 우선순위 | 잔여 | 실측 | 완료 조건 |
| --- | --- | --- | --- |
| P0 | TINT·모션·카드 shape/elevation 소비 | TINT 21종 소비 불완전, motion consumer 리터럴 잔여, 카드 radius/elevation 혼재 | demo v3 토큰을 공용 consumer가 사용하고 페이지 로컬 대체 정의 0 |
| P0 | `ClusterCard` raw visual 값 | raw color/gradient 및 motion duration 소비 잔여 | 서비스 identity 예외를 중앙 정의로 옮기고 raw color·duration 0 |
| P1 | 서체 weight 문법 | `font-medium` 300회/125파일 | TYPE 토큰 기반 역할별 weight로 전환 후 비의도 잔여 0 |
| P1 | named palette | 79회/24파일 | 의미 토큰으로 전환 후 서비스 identity 외 잔여 0 |
| P1 | visual ownership | 페이지 로컬 후보 31개 | 카드·칩·표·게이지를 `shared/ui` 소유로 수렴하고 페이지는 조합만 담당 |

현재 G4 판정은 **부분**이다. 다음 배치는 Home의 selected scope·숫자·편집·차트 델타를 먼저 닫고 demo/live 동일 viewport·클릭 경로·숫자 대조를 붙인다. 반려 델타 해소 전 다음 서피스로 이동하지 않는다.

### 클로드가 쓸 수 있는 홈 API 계약

| 요구 | 현재 계약 | 상태 |
| --- | --- | --- |
| 클러스터 카드 | `GET /api/fleet/summary` | 라이브 소비 중. `2/2·6/9` 부분 snapshot을 전체값으로 승격하면 장애 노드를 숨길 수 있어 count 변경은 반려했다. 현재 후보는 보수적 count/health를 유지하고 실측 CPU/MEM fallback만 추가한다. |
| 활동 | `GET /api/activity/overview` | 즉시 사용 가능. 2026년 실제 DB 12 bucket HTTP 200이며 bigint overflow는 배포 해소됐다. |
| 인시던트 상위 N | `GET /api/issues?issues.status=open&limit=N` | 즉시 사용 가능: 권한 범위 최신순 |
| namespace Pod 분포 | `GET /api/clusters/{id}/inventory/summary` | 즉시 사용 가능: counts evidence 포함, 전체 fleet은 bounded fan-out 필요 |
| 비용 요약 | `GET /api/cost/overview?clusters=...&range=24h` | 즉시 사용 가능: micro-unit 비용과 availability/reason codes |
| 저장소 동기화 합계 | `GET /api/gitops/overview` | 부분: item status/coverage는 있으나 provider-normalized sync counts와 500행 초과 완전성 없음 |
| 최근 5 Timeline | `POST /api/timeline/snapshots` | 부분: canonical evidence는 있으나 JSON `limit=5`/`has_more` 계약 없음 |

현재 화면 P0 백엔드 우선순위는 fleet의 보수적 node/pod health를 훼손하지 않고 CPU/MEM 실측을 Home 카드에 공급하는 계약이다. exact node/pod 총계는 authoritative full-cluster sweep 계약 없이는 단정하지 않는다. GitOps·최근 Timeline·alert-events 확장은 Home 반려 델타 해소와 배포 증거가 끝난 뒤 해당 서피스 배치에서 처리한다.

### 아카이브 병합 감사

- `archive/codex/deploy-gate-simplify-20260719`의 `82e7aa10d`는 dev `fba57b25e`와 patch-id가 같아 완전 병합됐다.
- `archive/codex/frontAlarm`의 실 alert 원장/확인/승격은 현행이 더 강하다. 고정 `cluster-1`, CPU 92%를 원장에 넣는 `/alert-events/test`만 빠졌으며 fake 금지에 따라 의도적으로 제외한다.
- `archive/ux/rca-incident-card`의 recovery router와 nullable 설명 필드는 의미 이식됐다. 실제 builtin 31개 설명값이 null인 것은 아카이브 미병합이 아니라 source-backed 설명을 채울 별도 인시던트 과제다.

### 배포 rollout 병목 진단

- 최근 성공/실패 Deploy 표본에서 immutable service rollout은 1분44초~2분06초, console rollout은 21~22초였다. 20분 이상 동일 단계 대기는 현재 로그에서 재현되지 않았다.
- 라이브 management inventory는 노드 2/2 Ready이고 현재 console pod는 2개 모두 Ready·restart 0이다. 노드 0/0 표시는 Home 데이터 연결 결함이지 management node capacity 고갈 증거가 아니다.
- 최근 console 관련 이슈 32건은 모두 resolved이고 현재 pod 2개는 Ready 1/1·restart 0이다. 정상 rollout의 짧은 NotReady까지 이슈로 수집한 정황이며 리소스 고갈 근거는 없다.
- 로컬 후보는 readiness를 API/SPA fallback과 분리된 `/index.html`에서 3초 뒤 2초 주기·1초 timeout으로 확인하고 console spec reconcile을 맞춘다. 장기 연결을 강제로 끊는 5초 종료 후보는 근거 부족과 스트림 절단 위험으로 반려했다.
- 실제 단축 후보는 최대 8개 workload의 strict wave(`patch → 같은 wave rollout status → 다음 wave`), 첫 실패 후 다음 wave 금지, spec reconcile의 중복 image set 제거, 모든 kubectl 동작이 공유하는 단일 deadline이다.
- 첫 spec reconcile 전에 라이브 v4 rollback capture와 fresh live spec의 exact 동일성을 fail-closed로 확인하고, 비밀값·임의 annotation payload를 제거한 diff artifact를 mode 0600으로 먼저 쓴다. 다음 Deploy에서 service 102~130초와 console 17~22초를 각각 같은 로그 구간으로 비교한다.

### 현재 블로커와 다음 3수

activity bigint 배포 블로커는 `333c65734`와 Deploy `29690120559`로 해소됐다. IN-4는 발행자 결정에 따른 의도된 보류이며 canonical hostname의 trusted service-admin identity 주입 위험은 BLOCKERS에 유지한다. D-1~D-4도 같은 SHA의 완료 증거가 생기기 전까지 유지한다. 새로 확인된 **외부 사람 필요 블로커는 0개**다.

1. **단일 배포·rollout 계측**: 검증된 후보 하나만 push하고 Gate→Deploy 완주까지 추가 push를 금지하며 console/service 시간을 이전 17~22초/102~130초와 비교한다.
2. **동일 SHA 증거**: 라이브에서 exact demo `adcf92130`과 1440 나란히 캡처하고 W3/W6/W7 실데이터·편집 클릭·1280~1920 overflow를 확인한 뒤 Home을 재판정한다.
3. **알림 동등화**: 독립 주 내비·진행 중 카드·분류/페이지 목록·벨 배지를 기존 alert-events 원장에 연결하고 demo 문법으로 다음 소배치를 만든다.

## 이전 보고 상세 — 2026-07-19 17:35 KST

기준 시각은 2026-07-19 17:35 KST다. 기준 소스는 `21aa0f2a1c3f2b1ce41e00b1218d942c4301a9e0`이다. 이 보고서는 구현 완료를 주장하는 문서가 아니다. 코드, 로컬 게이트, GitHub Actions, 라이브 배포, 실브라우저 증거가 같은 digest를 가리키지 않는 항목은 완료로 판정하지 않는다.

## 1. G4 실체

강화된 완료 정의인 “demo 5174와 제품을 나란히 띄운 대조 스크린샷 + 숫자 교차 대조”를 적용하면 MUST 4항목은 모두 **부분**이다. 저장소와 임시 경로에서 이번 G4 대조 스크린샷 파일을 찾지 못했다. 기존 `docs/spec/frontend/theme-flash-*.png`는 테마 플래시 증거일 뿐 G4 서피스 대조 증거가 아니다.

| MUST 항목 | 판정 | 구현 근거 | demo 5174 나란히 대조 | 숫자 교차 대조 |
| --- | --- | --- | --- | --- |
| 홈 3층 | 부분 | 홈/클러스터 단일화 `92f32d176`, 활동 집계 스코프 `082b72540`, W4 비동기 안정화 `ec2e963e0` | 없음 | 없음 |
| 리소스 3관점 | 부분 | 상세 시트 `95ece8038`, 트래픽 소스 `40e028ca1`, 지도/목록/흐름 테스트가 포함된 Gate `29679811849` | 없음 | 없음 |
| 알림 단일화 | 부분 | 독립 `OperationStatusCenter` 제거 `4e76fee14`, 부분 실패 정합화 `6ba98f886` | 없음 | 없음 |
| 연결 모달 | 부분 | 클러스터 `39c43b448`, 저장소 `b7fe4a4c5`, 서버 소유 6단계 연결 계약 `661213de1`, POST 본문 정합화 `ccfa3bca2` | 없음 | 없음 |

`GOAL-LOG.md`에 G4 완료 줄이 없는 이유는 구현 미착수 때문이 아니다. 네 항목의 제품 코드가 존재하고 `21aa0f2a1` Dev Gate `29679811849`에서 Frontend 436 files/2,273 tests가 통과했다. 그러나 화면 대조, 숫자 교차 대조, 라이브 배포, 실브라우저 증거가 없다. 특히 Dev Deploy `29679991657`가 앱/AWS 배포 전에 실패했다. 따라서 현재 병목은 **검증 및 배포 미완료**이며, 구현만으로 완료를 선언하지 않은 것은 맞는 판정이다.

## 2. 테스트 실패의 분해

### 결정적 실패 15건

로컬 `a4eb1d638` gate-fast는 2,265 pass/15 fail과 worker timeout 2건으로 끝났다. 당시 전체 원 로그를 파일 artifact로 보존하지 않아 15개 개별 테스트 이름과 파일별 실패 개수를 사후에 정확히 복원할 수 없다. 이 보존 실패 자체가 진단 결함이다. 확인 가능한 수정 범위는 `a4eb1d638..fa07801ed`의 아래 6묶음이다.

| 실패 묶음 | 분류 | 원인 | 해소 근거 |
| --- | --- | --- | --- |
| `AlertEventsProvider.test.tsx` | 테스트 결함 | 비동기 위치 반영과 visibility 재조회 횟수를 동기식 고정값으로 단정했다. | `6ba98f886` |
| `apiComposition.test.ts` | 테스트 결함 | 병합·리다이렉트된 Traffic/GitOps/Helm을 계속 독립 release owner로 기대했다. | `f7038080c` |
| `apiBoundary.test.ts` | 테스트 하네스 결함 | 같은 소스를 중복 수집해 30초 경계를 넘겼다. | `f7038080c` |
| `ResourceFilesystemBrowser` 관련 | 제품 결함 | 포트가 `undefined`/비객체 결과를 반환할 때 `in` 및 `operation` 접근 전에 방어하지 않았다. | `6ba98f886` |
| `ResourcesPage.detailOverflow.test.tsx` | 테스트 결함 | D3에서 제거된 관계 탭을 클릭하는 낡은 절차를 유지했다. | `6ba98f886` |
| `ProductApp.test.tsx` | 테스트 픽스처 결함 | 구 URL(`cluster`, `/resources/pod`)과 StrictMode 중복 호출 전제를 정규 URL 계약 이후에도 유지했다. | `fa07801ed` |

15개 중 제품 결함과 테스트 결함의 정확한 **건수**는 원 로그가 없으므로 확인 불가다. 최소 한 제품 결함 묶음은 Filesystem이고, 나머지 다섯 묶음은 테스트 기대값·픽스처·하네스 결함이다. 원인별 수정 후 `21aa0f2a1` Gate `29679811849`는 Frontend 2,273/2,273, Backend 3,775 pass/3 skip으로 통과했다. 새 명령에 따라 비계약성 테스트는 고치기보다 3절 삭제 후보로 분리한다.

### 부하 실패 60건과 현재 병렬도

`8866399f5` gate-fast의 2,204 pass/60 fail+3 unhandled는 host load 180~215에서 발생했다. 그중 반복 재현된 Helm 1건과 operation handoff 3건 외 다수는 worker 시작·테스트 timeout이었다. 당시 여러 서브에이전트가 각자 Vitest를 돌려 머신을 포화시켰고, 오케스트레이션이 게이트를 스스로 불안정하게 만든 책임이 있다.

17:35 KST 관측 기준 에이전트는 3개가 실행 중이었다: root, 상태 보고, D 정리. E는 중단 상태였다. 로컬 `make gate`/Vitest/pytest/npm build 프로세스는 0개였다. 저장소 밖 MuMu·mediaanalysisd·Spotlight는 상존 환경이며 지연 사유가 아니다. 과거 load 180~215의 원인은 병렬 Vitest 포화로 재확인됐다.

신설 직렬화 규칙은 즉시 발효했다. `make gate-fast`, Vitest 또는 Dev Gate 중에는 다른 트랙의 build/test를 금지하고 게이트 1개만 실행한다. 로컬 Vitest worker도 `d45b1af76`에서 최대 2개로 제한했다. Dev Gate `29679811849` 실행 중 다른 에이전트는 읽기 전용 조사·문서화만 수행했다. `gate-fast`·`release-governance-web-patch`·배포 검증 시작 전 `uptime`의 1분 load average를 확인하며, 10코어 기준 30 초과일 때만 대기하고 30 이하면 즉시 실행한다.

## 3. 테스트 인플레이션

비교 기준은 이전 dev `1d98a7ab94ad53a2b0b2c86c705578cb8ee7f9fb`, 현재는 `21aa0f2a1`이다.

- 프런트 테스트 파일: 423개에서 434개로 11개 순증했다.
- 마지막 기준선 성공 Gate `29663702072`는 425 files/2,246 tests였다. 현재 Gate `29679811849`는 436 files/2,273 tests로 실행 테스트가 27개 순증했다. `1d98a7ab9` 자체는 frontend 실행 단계 전에 실패했으므로 그 SHA의 정확한 Vitest 실행 수는 확인 불가다.
- diff의 양의 테스트 정의는 rename 6건을 제외해 약 57개이며 `it.each` 확장 3건을 포함하면 약 60개다. 같은 기간 레거시 테스트 삭제가 상쇄해 실행 수는 27개만 순증했다.
- 새 snapshot/inline snapshot assertion은 0개이며 현재 frontend 전체도 0개다.
- 계약·회귀 방지가 아닌 형식/구현 세부 후보는 8/약 60, **약 13.3%**다. 나머지는 URL, 포트, 서버 집계, 알림 멱등성, 연결 순서, 목록 반영, 키보드·접근성 등 제품 계약 또는 실제 회귀 방지로 판정했다.

삭제 우선 검토 후보는 다음과 같다.

1. `frontend/src/shared/ui/brand/BrandIcon.test.tsx` 5건: SVG 태그, path 길이, hex 정규식, img 개수는 사용자 계약보다 구현 형식에 가깝다. 접근 가능한 브랜드 라벨 1건만 남기고 4건 삭제 후보로 본다.
2. `frontend/src/styles/tokens.test.ts` 최근 2건: 토큰 문자열 존재 전수 검사는 `check:design`과 CSS 빌드가 중복한다. 실제 light/dark 대비나 소비자 회귀가 아니라면 삭제한다.
3. `frontend/src/motion/__tests__/motion-contract.test.ts`의 D17 preset 문자열 존재 1건: design guard가 같은 리터럴/토큰 계약을 검사한다면 삭제한다. reduced-motion과 8개 stagger 상한의 동작 테스트는 유지한다.

`foundationCharts`, `StatusPill`, `WidgetFrame`, `ResourceTable`, `ConnectStages`는 0과 unavailable 구분, 실제 deep link, timer 금지, 200행 가상화, 서버 실패 표시를 검증하므로 현재는 삭제 후보가 아니다.

## 4. 계보 게이트

현재 연쇄는 다음과 같다.

1. `b4611acd2`에서 main 계보를 `-s ours`로 병합해 dev tree를 보존했다.
2. `870474c44` Dev Gate `29678856691`은 `origin/dev..HEAD` 범위에 main의 기존 비준수 커밋까지 들어가 commit-msg gate에서 실패했다. Dev Deploy `29678871947`은 skipped였다.
3. `512f967d1` 기준점 재검증 Dev Gate `29679510750`은 Frontend가 통과했지만 Backend 3,774 pass/1 fail이었다. 테스트 support 파일을 runtime source로 오인한 `test_target_agent_runtime_boundary.py` 1건이다. Dev Deploy `29679703660`은 skipped였다.
4. `165f7f5c3`에서 support 경계를 옮기고 `21aa0f2a1`에서 증거를 기록했다. Dev Gate `29679811849`는 Frontend 2,273 pass, Backend 3,775 pass/3 skip으로 성공했다.
5. 이어진 Dev Deploy `29679991657`는 `make release-governance-web-patch`의 reference UI delta ledger 검증에서 unknown `opsiaPort` destination 17건으로 실패했다. 앱 빌드와 AWS 배포 전 차단됐으므로 라이브 digest는 바뀌지 않았다.

다음 수는 17개 destination을 현행 Opsia port 카탈로그로 분류하거나 잘못된 destination을 수정하고, 동일 `release-governance-web-patch`를 로컬 저부하에서 재현한 뒤 새 SHA로 Gate→Deploy를 한 번만 실행하는 것이다.

병합 전에 tree gate는 실행했지만 push-range commit-msg gate를 원격의 이전 SHA 기준으로 시뮬레이션하지 않았다. `make gate-fast`가 `origin/dev..HEAD`의 ancestry 확대를 검사하지 않는 차이를 놓친 절차 결함이다. 이후 `512f967d1` 체크포인트로 push 범위를 유한화했지만, 배포 전용 `release-governance-web-patch`까지 Dev Gate가 포함하지 않는 두 번째 게이트 차이도 이번에 드러났다.

## 5. 배포 리듬

G0 기준은 `fba57b25ef837cc3fa329511ebdd7782b5e25425`다. Dev Gate `29663702072`와 Dev Deploy `29663864101`이 성공했고 service `sha256:7831bd68…`, console `sha256:bb939faa…` 및 브라우저 smoke가 일치했다. 이후 사슬은 다음과 같다.

| KST | SHA | Gate | 실패/결과 | Deploy |
| --- | --- | --- | --- | --- |
| 07:49 | `0a53ca1e` | `29664142316` failure | `ResourceDetailSheet` typecheck 1건 + `test_service_entrypoints.py`의 legacy brand token 경계 위반 | `29664157007` cancelled, `29664177831` skipped |
| 07:53 | `1d98a7ab` | `29664251098` failure | 같은 typecheck와 brand boundary 위반 | `29664292813` skipped |
| 16:53 | `870474c44` | `29678856691` failure | ancestry 병합으로 유입된 비준수 commit message | `29678871947` skipped |
| 17:15 | `512f967d1` | `29679510750` failure | Frontend 성공, Backend 3,774 pass/1 fail: test support/runtime 경계 오인 | `29679703660` skipped |
| 17:26 | `21aa0f2a1` | `29679811849` success | Frontend 2,273, Backend 3,775/3 skip | `29679991657` failure: reference UI delta unknown destination 17건, 앱/AWS 배포 전 차단 |

`0a53ca1e` 시점에는 G0 Deploy가 아직 실행 중인데 후속 push/deploy가 겹쳤고, 한 Deploy가 취소됐다. 이는 현재 금지된 리듬이며 재발시키지 않는다.

다음 배포 가능 조건은 (1) 활성 Dev Deploy 0, (2) unknown destination 17건 0, (3) 저부하 `release-governance-web-patch` 성공, (4) 단일 Dev Gate 성공, (5) 그 SHA 외 추가 push 금지다. 성공 뒤에는 service/console digest, 라이브 상태, 인증 실브라우저, G4 demo 대조가 같은 SHA를 가리켜야 한다.

## 6. G5/G6 미착수 사유와 트랙별 산출

G5는 미착수가 아니다. `4e76fee14`에서 레거시 13파일 1,793줄을 삭제했고, `cd178ffb1`은 Helm diff를 `UnifiedDiff`로, `a0b565cc9`/`03393d810`은 GitOps 검색을 전역 검색으로 수렴시켰으며, `2ab07097a`는 사이드바 프로필/워크스페이스를 헤더로 옮겼다. 다만 전체 제거 grep, 라이브 회귀, 배포 증거가 없어 완료 줄을 쓰지 않았다.

G6도 완전 미착수는 아니다. `b0bfa726c` 디자인 가드, `ec2e963e0` 홈 포털 타이밍, `c2e5e8171` 키보드 순환, `bf2351de9` release gate timeout 등 폴리싱이 들어갔다. 그러나 demo/제품 나란히 대조와 판매 품질 스윕이 끝나지 않아 부분이다. G4 검증이 병목이지만 D·E가 놀고 있었던 것은 아니다. 다만 E의 2시간 주기 라이브 smoke 결과를 G0 이후 `GOAL-LOG.md`에 남기지 못한 것은 운영 누락이다.

| 트랙 | 현재 할당 | 지난 약 4시간 산출 |
| --- | --- | --- |
| A 파이프라인 | Gate/Deploy 감시, push 직렬화, 계보 복구 | Vitest worker 2 제한 `d45b1af76`, main 계보 병합 `b4611acd2`, 기준점 `512f967d1`, Gate `29679811849` 성공과 Deploy `29679991657` 실패 확인 |
| B 파운데이션 | G2 완료 후 게이트 중 빌드 중지, 디자인 계약 보수 | 디자인/Helm 픽스처 `b0bfa726c`; G2 완료 기준 `74ff3c0f1`은 이미 `GOAL-LOG`에 기록 |
| C 서피스 | G4 MUST 구현과 결정적 회귀 제거 | 트래픽 소스 `40e028ca1`, 저장소 6단계 `661213de1`, POST 계약 `ccfa3bca2`, ProductApp/홈/키보드 안정화 `fa07801ed`·`ec2e963e0`·`c2e5e8171` |
| D 정리 | C와 충돌 없는 G5 잔재 제거 | 레거시 1,793줄 `4e76fee14`, D15 `cd178ffb1`, D6 `a0b565cc9`/`03393d810`, D20 `2ab07097a`; 현재 tanstack·미사용 파일·병합 route shell 잔여 감사 |
| E QA | 독립 계약 감사, 라이브 발표 smoke, 배포 게이트 원인 분류 | G4의 repo reflection/traffic source P1을 찾아 C로 반송했고 현재 해결 커밋에 반영. 15-fail 묶음과 `29679991657`의 17 destination을 분류. G0 이후 2시간 주기 live smoke 기록은 첫 회차 증거 수집 대기 |

## 7. 막힌 것 총목록

현재 확인된 **사람만 해결할 수 있는 절대 블로커는 0개**다. 다음 항목은 외부 요인이거나 권한 경계에 닿지만 현재 권한과 우회 없는 정상 절차로 스스로 처리 가능하다.

| 항목 | 현재 판단 | 사람 필요 여부 |
| --- | --- | --- |
| reference UI delta unknown destination 17건 | 저장소의 ledger/port 카탈로그 정합성 결함이다. 분류 수정과 release governance 재검증이 필요하다. | 불필요 |
| GitHub Actions/AWS 배포 | Actions 권한과 배포 자격은 G0 성공으로 확인됐다. 이번 Deploy는 AWS 호출 전에 차단됐다. | 불필요 |
| demo 5174와 live 인증 브라우저 | 로컬 demo 및 이전 live smoke 이력이 있다. 캡처·수치 대조를 아직 하지 못했을 뿐 접근 불가 근거는 없다. | 불필요 |
| 머신 자원 | MuMu·mediaanalysisd·Spotlight는 상존 환경이다. 외부 프로세스를 부하 사유로 작업 지연하지 않고, 1분 load가 10코어×3인 30을 초과할 때만 대기한다. | 불필요 |
| 원격 main/dev 정리 | force push 없이 검증 SHA fast-forward와 보존 태그로 처리할 계획이다. | 불필요 |

보고 이후 우선순위는 (1) destination 17건 해소, (2) 배포 전용 governance의 저부하 단일 재검증, (3) Gate→Deploy 한 배치 완주, (4) live 발표 smoke와 demo 나란히 캡처·숫자 대조, (5) G4/G5 로그 갱신, (6) G6 판매 품질 스윕이다. 사람 필요 항목이 새로 확인되면 `docs/BLOCKERS.md`에 즉시 옮긴다. 다음 상태 보고는 배포 1회 완주 직후 또는 3시간 후 중 빠른 시점에 작성한다.
