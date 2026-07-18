# YAML Git 전달 오케스트레이션

YAML 편집 전달은 `YamlDeliveryOrchestrator`가 기존 워크플로 원장과 명령 작업 이벤트
원장을 함께 사용해 진행한다. HTTP 라우터나 UI가 SCM·클러스터에 직접 연결하지 않는다.

## 호출 경계

- 입력: `packages.contracts.yaml_delivery.YamlDeliveryRequest`
- 실행·재개: `domains.gitops.yaml_delivery.YamlDeliveryOrchestrator.execute()`
- 상태 조회: `domains.gitops.yaml_delivery.YamlDeliveryOrchestrator.get_result()`
- SCM 어댑터: 기존 `safe-pr-worker`와 `scm-worker/GithubScmProvider`의 승인 검증,
  실제 커밋·PR 및 GitHub 상태·병합 API를 재사용한다.
- GitOps 어댑터: 기존 에이전트 outbound 명령/관측 경계로만 sync를 요청하고 관측한다.
  웹 서버에서 대상 클러스터로 직접 연결하는 구현은 허용하지 않는다.

SCM과 GitOps 어댑터는 `operation_id`를 멱등 키로 사용해야 한다. SCM 병합은
`expected_head_sha`가 일치할 때만 가능하며 force 옵션을 계약에 노출하지 않는다.

## 단계와 완료 조건

단계는 `validation → commit → pr → merge → sync → rollout → done` 순서로만
진행한다. 각 단계의 공급자 증거는 불변 작업 이벤트에 기록하고 워크플로 단계는
단조 상태 전이만 허용한다.

`done`은 다음 증거가 모두 실제로 관측될 때만 기록한다.

- 커밋 SHA, PR 번호·URL, 병합 SHA와 병합 시각
- sync 영수증과 병합 SHA와 동일한 sync/observed revision
- healthy rollout과 비어 있지 않은 Kubernetes `resourceVersion`

CI 실패, PR head 변경·충돌, 컨트롤러 오프라인, sync 실패, degraded rollout,
타임아웃은 원인 코드와 마지막 단계 증거를 남기고 완료 이벤트를 만들지 않는다.

## 자동 병합 정책

클러스터 등록 원장의 workspace/cluster/environment가 요청과 일치해야 한다.
`development`(`dev`)와 `demo`만 자동 병합할 수 있다. `staging`, 알 수 없는 환경,
등록 누락·불일치, `production`(`prod`)은 항상 `review_required`로 멈춘다. 잘못된
`auto_merge` 설정 타입도 fail-closed 처리한다.
