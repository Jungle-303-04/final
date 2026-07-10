# RCA 실제 E2E Bruno 워크플로우

이 폴더는 일반 API 회귀 테스트와 분리된 실제 장애 주입 워크플로우다.
`scripts/run-bruno-aws.sh`는 이 폴더를 실행하지 않는다.

실행 전 management와 target-agent가 같은 최신 `dev` 이미지여야 한다. Target은
`environment=test` 또는 `environment=aws-test`로 등록한 뒤 최신 설치 manifest를
다시 적용해야 한다. 그때만 target의 `APP_ENV=test`와
`RCA_TEST_RUNS_ENABLED=1`이 함께 켜진다. 다른 환경에서는 API와 Agent가 모두
fail-closed로 거절한다.

Bruno에서 `aws-test` 환경을 선택하고 01부터 순서대로 보낸다.
먼저 로컬 Bruno 환경의 `rca_test_token`을 배포 secret과 맞춘다. 값은 Git에
커밋하지 않고 다음처럼 로컬에서만 읽어 넣는다.

```bash
kubectl --context <management-context> -n management get secret management-runtime-secret \
  -o jsonpath='{.data.RCA_TEST_RUNS_TOKEN}' | base64 --decode
```

1. 등록된 25개 시나리오와 `ready / fixture_required / detector_gap`을 조회한다.
2. `cluster_id + scenario_id`만 보내 sandbox에 실제 장애를 만든다.
3. 같은 `run_id`로 장애 주입부터 cleanup까지 통합 상태를 반복 조회한다.
4. 실제 target-agent가 수집해 저장한 evidence를 확인한다.
5. RCA symptom/root cause가 시나리오의 기대값과 맞는지 확인한다.
6. recovery plan과 추천 action을 확인한다.
7. 실제 PR/실행을 원할 때만 `rca_select_confirmation`을
   `SELECT:<rca_correlation_id>`로 바꾸고 사용자 선택 요청을 보낸다.
8. 선택이 저장되고 기존 PR/command dispatch 경로로 전달됐는지 확인한다. 이 응답은
   실제 GitHub PR 생성 완료 자체를 보장하지 않으며, repo/application binding이 있어야
   downstream Safe PR이 생성된다.
9. cleanup을 보내 현재 run 소유 Deployment를 0 replicas로 되돌린다.
10. Agent가 cleanup 명령을 완료했는지 확인한다.

01~06과 09~10은 개발 확인용이다. 07~08은 실제 승인·PR/command 부작용을 열 수 있어
자동 runner에 포함하지 않는다. 03~06은 비동기 파이프라인이 아직 진행 중이면 같은
요청을 잠시 뒤 다시 보낸다. 새 run을 만들 필요가 없다.

현재 실제 실행 가능한 `ready` 시나리오는 다음 8개다. 나머지 17개도 목록에는
등록되어 있으며, 01 응답의 사유와 필요한 fixture/detector 작업을 보고 이어서 개발한다.

- `image.wrong-tag`, `image.registry-down`
- `crash.config-env`, `crash.app-startup`
- `ingress.readiness`
- `schedule.cpu`, `schedule.memory`, `schedule.affinity`

시나리오를 추가하거나 수정할 때 Bruno 요청 body는 바꾸지 않는다. 서버의
`src/domains/rca/test_scenario_catalog/*.yaml`을 수정하고 catalog contract test를
통과시키면 01 목록과 02 실행이 같은 schema를 사용한다.
