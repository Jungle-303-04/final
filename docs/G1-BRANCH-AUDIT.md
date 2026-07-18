# G1 원격 브랜치 감사

감사 시각: 2026-07-19 KST  
기준: `origin/dev` `1d98a7ab94ad53a2b0b2c86c705578cb8ee7f9fb`

## 판정 방법

- `git fetch origin --prune` 뒤 `git cherry`, `git diff`, 관련 PR 상태와 게이트를 함께 확인했다.
- 삭제 대상은 삭제 직전 HEAD를 정확히 `archive/<원격 브랜치명>` 원격 태그로 보존하고, 태그가 같은 commit으로 peel되는지 확인한다.
- 같은 기능은 `OPSIA-MASTER-SPEC.md` D1~D21의 단일 오너를 우선했다.
- `demo/motion-animations`는 G4 MUST 완료 전 읽기 전용이므로 이번 삭제 대상에서 제외했다.

## 브랜치별 판정

| 원격 브랜치 | HEAD | 관련 PR | 판정과 근거 |
|---|---|---:|---|
| `archive/dev-before-commit-message-normalization-20260716` | `6ac9a0605` | - | 삭제. `git cherry` 기준 고유 patch 0이고 현재 dev보다 오래된 이력 보존 브랜치다. |
| `archive/woonyong-ui-layer-lab-before-message-normalization-20260716` | `cbacd8ff9` | - | 삭제. 과거 UI 문서·게이트 이력이며 현재 Master Spec과 지시서가 결정을 대체했다. |
| `codex/anim` | `385741a74` | - | 미채택 후 삭제. `demoComposition` 합성 데이터, Pretendard 교체, 화면별 색·모션을 포함해 HANDOVER §1-1, D17, D19와 충돌한다. |
| `codex/aws-real-data-rebuild-20260718` | `16ff84521` | #607 open | 미채택 후 삭제. PR이 conflict이며 backend/full gate가 실패한다. 현재 지시서·목표 로그를 삭제하는 큰 tree diff를 포함하고, 채택 가능한 관리 클러스터 변경 제어는 PR #608로 dev에 분리 병합됐다. 실패한 769파일 묶음을 통합하지 않는다. |
| `codex/deploy-gate-simplify-20260719` | `82e7aa10d` | #623 merged | 삭제. PR #623 merge commit `fba57b25e`로 dev에 병합됐다. |
| `codex/frontAlarm` | `45de68145` | - | 미채택 후 삭제. 별도 `ActivityNotificationsProvider`, 알림 미리보기와 개발 테스트 이벤트는 D4의 벨+sonner 단일 표면 및 실 SSE 발화 계약과 충돌한다. |
| `codex/gitOpsNode` | `106a1859c` | - | 미채택 후 삭제. 별도 `DeploymentBlueprint*` 편집기와 preview entry를 추가한다. dev의 `WorkflowGraph`·`PlanEditor`·`PlanWizard`가 D10 오너이므로 두 번째 워크플로 구현을 채택하지 않는다. |
| 리소스 패리티 통합 브랜치 | `855ff3fd0` | - | 가치 통합 후 삭제. dev가 import하지만 누락한 서버 단일 리소스 분류는 `b3e61d534`→`ef4015c7f`, 추가 종류 정합은 `855ff3fd0`→`281bbcfae`로 선별 cherry-pick했다. 나머지 이전 패리티/UI 묶음은 후속 평면 서피스 PR #609~#614와 Master D1~D21이 대체한다. |
| `feat/minmings111/cluster-infra-map-ui` | `023d70c2e` | #606 open | 미채택 후 삭제. PR이 conflict이고 네 gate가 실패/취소 상태다. 신규 `ResourcesInfraMap*` 계보는 D12의 `ResourcesPhysicalTopologyScene` 단일 오너와 “병렬 맵 금지”에 정면 충돌한다. |
| `feat/minmings111/internal-site-mcp` | `7e97c6a5e` | #604 merged | 미채택 잔여 보존 후 삭제. PR #604의 검토 범위는 dev에 병합됐다. 병합 뒤 추가된 `42faee42c`는 별도 PR·게이트 없이 AI 런타임 1,481줄을 바꾸는 G1/프론트 목표 밖 묶음이므로 이번 본선화에는 넣지 않는다. |
| `ux/rca-incident-card` | `a1165761a` | #605 closed | 미채택 후 삭제. 닫힌 PR의 카드 중심 대안이며 dev의 `4f65140ac` 및 PR #614 인시던트/RCA 평면 구조가 후속 구현이다. D19의 단일 인시던트 표면을 우선한다. |
| `woonyong/ui-layer-lab` | `57a9c14a6` | - | 삭제. 정규화 전 UI 문서·실험 계보이고 현재 Master Spec과 지시서로 대체됐다. |
| `woonyong/vp-021-ai-assistant` | `a0be8b578` | - | 미채택 후 삭제. `devpreview-ai.tsx` 전용 미리보기 계보이며 정답 견본은 읽기 전용 demo 브랜치와 `demo-freeze-v2`다. D9에 따라 제품 코드 복사 없이 재구현한다. |
| `woonyong/wizard-ai-fixes` | `ce0faa801` | - | 미채택 후 삭제. Tempo를 기본 OTLP receiver로 고정하는 과거 계약은 현재의 명시 설정·미설정 `unavailable` 계약과 충돌한다. 등록 해제·접근성 변경도 이후 dev 계약으로 대체됐다. |

## 보류와 본선 이력

- `demo-freeze-v2`는 `d845e77ac4b09c2d54a7876953b456267ecbecab`을 가리킨다. `origin/demo/motion-animations` HEAD는 이후 정리 commit `a49b3cc31d78b84acc3cda84ec305f78357f5ef6`이다. 태그를 원격에 먼저 보존하되 G4 MUST 완료 전 브랜치는 삭제하지 않는다.
- `origin/main...origin/dev`은 `1438/3262`로 분기했고 merge-base는 `636e442c5`다. force push 없이 dev tree를 유지하는 명시적 ancestry merge가 필요하다. 현재 gate blocker가 해소되기 전 dev/main push와 main 승격은 금지한다.

## 실행 결과

- 위 14개 브랜치의 원격 archive tag가 삭제 직전 HEAD로 peel되는 것을 각각 확인한 뒤 브랜치를 삭제했다. annotated tag 14개는 tag object+peeled commit 28개 ref로 남았다.
- `demo-freeze-v2`를 원격에 보존했고 `d845e77ac4b09c2d54a7876953b456267ecbecab` 일치를 확인했다.
- PR #607과 #606은 미채택 근거를 남기고 닫았다.
- 원격 head는 `main` `59c837078e9738bc04f4d7147512a47b4228efbe`, `dev` `1d98a7ab94ad53a2b0b2c86c705578cb8ee7f9fb`, `demo/motion-animations` `a49b3cc31d78b84acc3cda84ec305f78357f5ef6` 세 개만 남았다.
- 선별 통합 검증: `uv run pytest tests/test_inventory_domain.py -q` 33 passed, frontend `createResourcesAdapter.mapping`·`resourcePresentation` 집중 테스트 27 passed.
- G1은 부분 완료다. G4 MUST와 통합 gate 완료 뒤 demo branch 삭제, main ancestry merge, dev/main 순차 push를 재개한다.
