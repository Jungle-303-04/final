# 실행 상태 자기 진단

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
| E QA | 독립 계약 감사, 라이브 발표 smoke, 배포 게이트 원인 분류 | G4의 repo reflection/traffic source P1을 찾아 C로 반송했고 현재 해결 커밋에 반영. 15-fail 묶음과 `29679991657`의 17 destination을 분류. G0 이후 2시간 주기 live smoke 기록은 아직 없음 |

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
