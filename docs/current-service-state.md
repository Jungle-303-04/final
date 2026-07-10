# 현재 서비스 상태

마지막 실측: 2026-07-11 02:10:56 KST

이 문서는 `dev` 최종 소스와 같은 이미지로 배포한 뒤 측정한 라이브 기준선이다. 비밀값 원문과
사용자 개인정보는 기록하지 않는다.

## 소스와 배포

- 권위 브랜치/worktree: `dev` / `SW_AI_W17-21-final-dev`
- 배포 소스 commit: `8ef141a53182e4d08266a70841ff548f583ee77a`
- backend image:
  `kubernetes-ops-service@sha256:5f02d9694e812c594b28aebb3b5c8989afecb94a7b48109b9a8c5e0088a472b8`
- management: Deployment 43개, replica 46/46 Ready, StatefulSet 3개, replica 3/3 Ready
- backend service image Deployment: 38개 전부 위 digest와 일치
- cluster-1 target Agent: 1/1 Ready, 같은 digest, restart 0
- console/agent API health: 모두 HTTP 200 `status=ok`
- 안정화 45초 로그: Agent/gateway warning·error 0

## 운영 데이터

- 등록: `kubernetes-ops`(management), `cluster-1`(target) 2개, 모두 online
- 사용자 계정 9개와 workspace/RBAC 보존
- repo 2개, application 4개, deployment binding 3개 보존
- 과거 command/RCA/evidence/event/audit/outbox와 고아 test registration 종속 행 삭제
- 초기화 45초 뒤 새 실데이터: Agent status 2, inventory resource 1,364, snapshot 3,
  usage sample 3, event 12
- dead letter 0, outbox 미발행 0, active command 0
- RCA report/timeline/recovery plan/open incident 0
- fleet:
  - `kubernetes-ops`: healthy, node 2/2, pod 49/49, CPU 12.0%, memory 12.7%
  - `cluster-1`: healthy, node 2/2, pod 20/20, CPU 5.1%, memory 21.1%

## Catalog 라이브 검증

- 명령: `cmd-catalog-8052f4aec8e4cf5e115e5b30`
- Redis chart: OCI chart digest 고정, standalone 1 replica
- 실제 container image:
  `registry-1.docker.io/bitnamilegacy/redis@sha256:25bf63f3caf75af4628c0dfcf39859ad1ac8abe135be85e99699f9637b16dc28`
- cluster-1 EBS CSI addon: `v1.62.0-eksbuild.1`, ACTIVE, 전용 IRSA 역할 사용
- `gp2` PVC 1Gi Bound, StatefulSet 1/1 Ready, command `completed`
- 검증 후 Helm release/PVC/PV 삭제, label 기준 잔여 리소스 0

## RCA 골든 run

- run id: `0be7fe5b-e87e-4855-a02e-cb46d08f0daf`
- scenario: `image.wrong-tag`, cluster: `cluster-1`
- 실제 Agent Kubernetes evidence: 1 bundle, 같은 correlation 유지
- 결과: `wrong_image_tag` / `ImagePullBackOff` / `plan_recovery`
- recovery: `selection_requested`, 후보 2개, 사용자 action 선택은 실행하지 않음
- 명시 cleanup: `completed`
- Deployment/StatefulSet/DaemonSet/ReplicaSet/Pod/Service/Endpoints/EndpointSlice/ConfigMap/
  Secret/PVC 잔여: 0
- 현재 `ready` 시나리오는 이 라이브 완주가 증명된 `image.wrong-tag` 한 개다.

## 최종 검증

- pytest: `1456 passed, 3 skipped`
- Ruff check/format: 통과
- import-linter: 2 contracts kept, 0 broken
- manifest: management 62 objects, target 20 objects
- RCA scenario catalog: 25개 schema/adapter/cause/evidence/recovery 계약 유효
- Bruno live: 67/67 requests, 120/120 tests PASS
- NATS consumer pending: 전 consumer 0

다음 변경은 이 기준선에서 같은 검증을 다시 수행하고, 결과가 나빠지면 배포를 완료로 취급하지
않는다.
