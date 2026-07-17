# Frontend branch merge plan

이 문서는 운영 `frontend/`를 정본으로 유지하면서 병렬 UI 브랜치의 최종 트리를
하나의 `app/pages/features/shared/desktop` 구조로 흡수하는 정본 계획이다. 브랜치
전체 merge나 독립 런타임 공존은 완료로 인정하지 않는다. 각 기능은 현재 Python
계약, API composition, workspace/cluster scope, 권한, 실시간 이벤트를 그대로
소비해야 한다.

## 고정 비교 기준

비교 기준은 `154d81c2325e0a8827f4242fc2ec7ddb24889243`이다. 아래 개수와 digest는
`frontend/` 최종 트리를 이 기준과 `git diff --name-status`로 비교한 결과다. 경로를
정렬한 전체 diff의 SHA-256을 함께 고정하므로 일부 파일만 보고 병합 완료를 선언할
수 없다.

| source | commit | tree | A/M/D/R | sorted diff SHA-256 | 판정 |
|---|---|---|---:|---|---|
| `origin/demo/motion-animations` | `e559ea25fdd3a3fe449b4ed4f41c38b3dadf8985` | `367bef44dad159d7437de5c4e748b4d3380166a7` | 21/364/250/0 | `9bd05c9af15653118392d44fbf92151b0febbacbe50dbc985cc0af926eecad22` | 부분 이식 |
| `origin/feat/minmings111/cluster-infra-map-ui` | `023d70c2e32173cfcf9f76f7a0efdf3ae5d641e8` | `ea0512063c7e7833219b84e5e3fed4b8f660e837` | 52/98/18/1 | `be8befdfa785d14c370c0759712b4876211d123c3d5a82d3e81de7a2770813ed` | 순수 모델 우선 이식 |
| `origin/woonyong/ui-layer-lab` | `57a9c14a6b153cd871ab81d5acdc19bfff2c2dca` | `ba236b603150c7a1c17421c476f821f4c3a07fc4` | 69/12/1265/0 | `71a9cfc99c240e935f60eedddaf1af4ae885800c5beff1e42e02b4e7a0a2562a` | UX 선택 이식 |
| `origin/archive/woonyong-ui-layer-lab-before-message-normalization-20260716` | `cbacd8ff9ea4b498adef1e800c15fc96f6dd7952` | `ba236b603150c7a1c17421c476f821f4c3a07fc4` | 69/12/1265/0 | `71a9cfc99c240e935f60eedddaf1af4ae885800c5beff1e42e02b4e7a0a2562a` | 활성 lab과 동일, 중복 제외 |
| `demo/v1` | `496eda7cf877ea28d8c85c797853a1a00c0f8c5e` | `be9429fd5e3520034b82c16bb1e3acc85e010d2c` | 0/0/1284/0 | `c272be43bb6045775f61f1ec967a432dc3c54eb06221bf5325a00fcffc956dc9` | UI 없음, 병합 제외 |

`D`는 해당 브랜치에 없는 현행 제품 파일이다. 삭제 후보가 아니라 모두
`current-retained`다. `M`은 현행 계약과 함께 의미 단위로 비교하며 브랜치 버전으로
덮어쓰지 않는다. `A`와 rename의 새 경로만 신규 소유권 후보가 된다.

## 기능별 판정

| source slice | 판정 | 정본 목적지 | 병합 조건 |
|---|---|---|---|
| motion `devpreview-*.html`, `src/devpreview-*.tsx` | 삭제 | 없음 | 제품 entry, route, build input에 포함 금지 |
| motion AI 대화 접힘·높이·순차 전환 | 부분 채택 | `features/ai-assistant`, `app/AiAssistantPanel`, `motion` | preview data 제거, 실제 대화 계약과 reduced-motion 테스트 연결 |
| motion 연결 위저드 전환 | 부분 채택 | `pages/clusters`, 공용 operation feedback | 실제 등록/연결 receipt와 OperationEvent 상태만 사용 |
| motion 라이브 맵·노드·파드 상태 표현 | 부분 채택 | Resources 인프라 맵과 공용 motion token | 상태 의미·60fps·reduced-motion을 유지하고 장식용 무한 애니메이션 금지 |
| motion `costCopy`, home refresh clock | 재작성 | typed i18n, `serverRefreshScheduler` | 화면별 copy/timer 중복을 만들지 않음 |
| infra map 순수 model/layout/grouping/sizing/zoom | 채택 | `pages/resources` 내부 순수 모듈 | agent snapshot/metric 입력 타입으로 치환 후 단위 테스트 유지 |
| infra map React view/card/hover/legend | 부분 채택 | Resources 공용 graph surface | 현행 token, i18n, focus, narrow viewport, dark mode 사용 |
| infra map `deployments` API | 재작성 | 기존 inventory/physical-topology port | 별도 브라우저 API나 서버 direct-cluster 경로 생성 금지 |
| infra map traffic subview | 부분 채택 | 기존 traffic contract 소비자 | 기존 workspace/cluster scope와 freshness를 유지 |
| lab 자체 router/providers/guards | 삭제 | 현행 `app` composition | 두 번째 router/provider tree 금지 |
| lab `shared/lib/api`, `live`, `query`, feature별 `api.ts` | 삭제·재작성 | 현행 `apiComposition`과 feature port | API 경로·poll·권한 하드코딩 금지 |
| lab 자체 theme/UI index/dev showcase | 삭제 | 현행 design token/shared UI | 두 번째 테마와 preview route 금지 |
| lab auth/cluster/home/metrics | 현행 유지 + UX 비교 | 현재 동일 feature/page | 누락된 상호작용만 최소 이식 |
| lab notifications/incident/ops | 부분 채택 | `pages/alerts`, issues/RCA extension | 현재 alert/RCA 계약과 실제 stream 사용 |
| lab organizations/members/groups/access | 부분 채택 | settings/workspace 권한 feature | 서버 CapabilitySet과 RBAC 계약 선행 |
| lab release/repository/workflow | 부분 채택 | applications/gitops/release feature | 기존 GitOps·workflow 계약과 command receipt 사용 |
| lab flow/chart/motion primitive | 선별 채택 | `shared/ui`, `motion` | 현행 primitive와 중복이 없고 접근성 테스트가 있을 때만 채택 |
| lab 문서·스크린샷·테스트 fixture | 증거 전용 | migration evidence/test 재작성 | 제품 bundle import 금지 |
| archive lab | 삭제 | 없음 | 활성 lab과 tree가 같으므로 별도 병합 금지 |
| demo/v1 | 제외 | 없음 | UI 후보가 없으므로 백엔드 논리 감사에서만 별도 취급 |

## 실제 병합 순서

1. 운영 장애 수정과 현재 `dev` 게이트를 먼저 통과시킨다.
2. 인프라 맵의 순수 model/layout을 복사하고 현재 agent snapshot 계약으로 adapter를
   연결한다. API 파일은 복사하지 않는다.
3. 인프라 맵 view를 현재 Resources의 별도 view mode로 연결하고 URL, focus,
   keyboard, responsive, i18n, reduced-motion을 검증한다.
4. 모션 데모에서 상태 전환만 공용 motion primitive로 추출해 AI, 연결, 명령,
   재연결 UI에 연결한다. preview entry는 삭제 상태를 유지한다.
5. lab의 알림, 조직, 릴리스, 저장소, 워크플로를 한 기능씩 현재 feature port에
   연결한다. 서버 계약이 없는 화면은 먼저 Python 계약과 권한 테스트를 만든다.
6. 동일 역할의 component, hook, adapter, copy, token을 inbound-reference 검사 후
   하나로 합치고 이전 wrapper를 제거한다.
7. 전체 route smoke, contract test, stream reconnect, Playwright 시각/키보드,
   typecheck/lint/build가 통과하면 독립 router/API/theme/mock과 preview 파일을
   삭제한다.

각 단계는 한 기능 커밋으로 끝내고 `dev` 배포가 정상인 것을 확인한 뒤 다음 단계로
간다. 브랜치 merge commit 수나 파일 수는 완료율이 아니다. 현재 제품 계약을 통해
실제 동작하고 테스트·배포된 기능 단위만 완료로 계산한다.
