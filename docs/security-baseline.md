# 보안 기준

이 문서는 인증, 네트워크, 비밀값, 명령 실행의 현재 불변식을 정리한다. 시점별 감사
결과나 완료율은 여기에 고정하지 않는다. 구현 상태는 코드·테스트·배포 증거로 확인한다.

## 인증과 테넌트 경계

- 운영·개발 배포 모두 인증 우회를 기본값으로 사용하지 않는다.
- Gateway가 session, role, workspace, cluster 권한을 최종 판단한다.
- workspace와 cluster 식별자는 요청 본문 값을 신뢰하지 않고 인증된 session 범위와
  교차 검증한다.
- 목록, 상세, realtime, command가 같은 권한 필터를 사용한다.
- 로그인 brute-force 제한과 인증 후 일반 조회 rate limit은 별도 정책으로 운영한다.

관련 검증:

- `tests/test_auth_security.py`
- `tests/test_identity_auth_routes.py`
- `tests/test_event_workspace_tenancy.py`

## 네트워크와 agent 경계

- target cluster는 management로 outbound 연결한다.
- management가 target Kubernetes API나 Prometheus에 직접 inbound 연결하지 않는다.
- cluster command와 evidence job은 agent poll/heartbeat/result 계약을 통한다.
- 외부 URL은 허용된 scheme, host, credential policy를 통과한 뒤 provider adapter에서만
  사용한다.
- EKS API, Gateway, observability endpoint의 공개 범위는 배포 manifest와 AWS 보안
  그룹에서 함께 제한한다.

관련 문서:

- [운영 배포 기준](operations-deployment.md)
- [Agent port-forward 경계](architecture/agent-port-forward-boundary.md)
- [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)

## 비밀값과 민감 데이터

- token, password, kubeconfig, Secret 값은 event, URL, log, API response, 문서에 남기지 않는다.
- credential은 참조 ID로 전달하고 실제 값은 승인된 vault/provider 경계에서만 해석한다.
- Secret 상세는 key 이름과 권한 근거만 제공하며 값은 기본 비노출이다.
- provider·command 오류는 원문 credential이나 민감 payload를 제거한 뒤 저장한다.
- production image와 배포 manifest에는 실제 비밀값을 포함하지 않는다.

관련 검증:

- [Secrets](secrets.md)
- `tests/test_secret_vault.py`
- `tests/test_target_agent_runtime_boundary.py`
- `tests/test_repo_gateway_worker.py`

## 명령과 GitOps 실행

- read capability와 write capability를 분리한다.
- write 요청은 대상, diff, policy, RBAC, 감사 식별자를 검증한다.
- Git binding이 있으면 GitOps 정책을 따르고, 없을 때만 agent outbound command를 사용한다.
- target agent는 management 검증을 신뢰하는 데 그치지 않고 승인·만료·sandbox를 다시
  fail-closed로 확인한다.
- 실행 결과는 `CommandReceipt`와 audit/timeline 증거로 보존한다.
- partial failure는 리소스별 결과와 retry 가능 여부를 구분한다.

관련 검증:

- `tests/test_command_worker.py`
- `tests/test_target_agent_commands.py`
- `tests/test_repo_gateway_worker.py`
- `tests/test_yaml_delivery_orchestration.py`

## 운영 보안 게이트

배포 전 다음을 확인한다.

1. `make check`와 `make manifest-check` 통과
2. 인증 우회·평문 비밀값·mutable image tag 부재
3. Kubernetes ServiceAccount/RBAC 최소 권한
4. target inbound 연결 부재와 agent outbound heartbeat 확인
5. migration·backup·rollback 기준 확인
6. 인증된 route smoke와 감사·명령 receipt 확인

새 결함은 날짜가 붙은 별도 감사 문서에 누적하지 않는다. 재현 테스트와 이 문서의 불변식을
함께 갱신하고, 현재 위험은 issue 또는 보안 추적 시스템에서 소유자·기한과 함께 관리한다.
