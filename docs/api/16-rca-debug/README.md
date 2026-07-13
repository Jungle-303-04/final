# RCA 실제 E2E Bruno 워크플로우

이 폴더는 일반 API 회귀 테스트와 분리된 실제 장애 주입 워크플로우다.
`scripts/run-bruno-aws.sh`는 이 폴더를 실행하지 않는다.

실행 전 management와 target-agent가 같은 최신 `dev` 이미지여야 한다. Target은
`environment=test` 또는 `environment=aws-test`로 등록한 뒤 최신 설치 manifest를
다시 적용해야 한다. `RCA_TEST_RUNS_ENABLED=1`은 독립 capability이며, API는 전용 token과
등록 environment(`test`/`aws-test`)를 추가로 확인한다. Agent token 검증은 항상 유지된다.

Bruno에서 `aws-test` 환경을 선택하고 01부터 순서대로 보낸다. 최초 한 번은 오른쪽 위
Environment에서 `aws-test` 편집을 열고 `rca_test_token`의 Secret 칸에 팀에서 전달받은
로컬 값을 붙여넣어 저장한다. `vars:secret`으로 선언된 값은 OS 보안 저장소에 암호화되고
환경 파일에는 기록되지 않는다. 실제 토큰을 collection·환경 파일·실행 로그에 쓰지 않는다.

1. 현재 catalog의 시나리오와 `ready / verification_pending / fixture_required / detector_gap`을 조회한다. 개수는 YAML catalog에서 동적으로 결정된다.
2. `cluster_id + scenario_id`만 보내 sandbox에 실제 장애를 만든다.
   같은 cluster의 동일 fixture(kind/namespace/name)에 활성 run이 있으면 서버가 원자 예약으로 `409`를
   반환한다. 기존 run을 cleanup하거나 TTL 만료를 기다린 뒤 다시 실행한다.
3. 같은 `run_id`로 장애 주입부터 cleanup까지 통합 상태를 반복 조회한다.
4. 실제 target-agent가 수집해 저장한 evidence를 확인한다.
5. RCA symptom/root cause가 시나리오의 기대값과 맞는지 확인한다.
6. recovery plan과 추천 action을 확인한다.
7. 실제 PR/실행을 원할 때만 `rca_select_confirmation`을
   `SELECT:<rca_correlation_id>`로 바꾸고 사용자 선택 요청을 보낸다.
8. 선택이 저장되고 기존 PR/command dispatch 경로로 전달됐는지 확인한다. 이 응답은
   실제 GitHub PR 생성 완료 자체를 보장하지 않으며, repo/application binding이 있어야
   downstream Safe PR이 생성된다.
9. cleanup을 보내 현재 run 소유 Deployment와 Service를 UID/resourceVersion CAS로 삭제한다.
10. Agent가 해당 run의 Pod와 EndpointSlice까지 사라진 것을 확인한 뒤 cleanup을 완료했는지 본다.

01~06과 09~10은 개발 확인용이다. 07~08은 실제 승인·PR/command 부작용을 열 수 있어
자동 runner에 포함하지 않는다. 03~06은 비동기 파이프라인이 아직 진행 중이면 같은
요청을 잠시 뒤 다시 보낸다. 새 run을 만들 필요가 없다.

`ready`는 adapter 등록만 뜻하지 않는다. 실제 target에서 장애 주입, 관측, evidence 수집,
expected root cause 선택, recovery plan, cleanup 잔여 0까지 완주한 시나리오만 `ready`다.
현재 live 완주가 확인된 시나리오는 다음 하나다.

- `image.wrong-tag`

`verification_pending`은 실행 adapter와 원인 계약은 완성됐지만 live 완주 전인 상태다.
이 상태는 `x-rca-test-verification: true`, 전용 test token, service admin 세 조건이 모두
있어야 실행할 수 있다. 나머지는 01 응답의 `availability_reason`,
`verification_work_needed`, `fixture_requirements`, `detector_work_needed`를 기준으로 이어서 개발한다. 시나리오를 추가하거나 수정해도
Bruno 요청 body는 바꾸지 않는다. API에는 raw manifest, shell, namespace, synthetic
evidence 입력을 추가하지 않는다.

담당자는 `scripts/rca_scenario.py scaffold`로 `verification_pending` 골격을 만든 뒤 YAML과 fixture
test를 완성하고 `uv run python scripts/rca_scenario.py validate`를 실행한다. validate는
schema/중복/canonical coverage, adapter capability, symptom별 expected root candidate,
candidate expected evidence 포함 관계, recovery coverage를 함께 검사한다. 관련 테스트와
관리자 전용 검증 헤더로 실제 target live 완주를 확인한 후에만 `ready`로 승격한다. DB/GitOps 등 외부 실행 fixture가
없으면 `fixture_required`를 유지한다. management cluster와 `sandbox` 밖 실행은 금지된다.
