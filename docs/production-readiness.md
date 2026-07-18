# 프로덕션 완료 기준

이 문서는 “이 프로젝트를 production runnable 상태로 끝냈다”고 말하기 위한 완료 기준이다.

기준은 세 가지다.

1. 코드가 실제로 있다.
2. 테스트와 Bruno/API 확인 방법이 있다.
3. AWS EKS smoke에서 서비스 흐름이 확인된다.

추가로 프로덕션 완성 범위는 [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 따른다. 외부 기준에서 확인한 기능 도메인은 최소선이고, 우리 프로젝트는 그 기능을 `Gateway -> event -> worker -> target agent -> evidence -> RCA -> Safe PR -> dashboard` 구조로 옮겨서 완성한다.

문서에 적힌 항목이 구현되지 않았으면 완료가 아니다. 반대로 구현이 바뀌면 이 문서와 역할별 온보딩을 같이 바꾼다.

## 전체 완료 정의

| 영역 | 완료 조건 | 검증 |
| --- | --- | --- |
| 코드 정합성 | lint, format, import boundary, compile, 전체 pytest 통과 | `make check` |
| Manifest | management/target manifest가 렌더되고 object 목록이 나온다 | `make manifest-check` |
| API 수동 확인 | Bruno collection이 Gateway route를 모두 포함하고 예상 응답을 검사한다 | [Bruno API 테스트](api/README.md), `tests/test_bruno_collection.py` |
| AWS smoke | 배포된 management/target에서 직접 smoke가 통과한다 | `make smoke` |
| 문서 | `docs/README.md`의 canonical 진입점이 유효하고 문서가 3레벨 깊이를 넘지 않는다 | `tests/test_docs_index.py` |
| 벤치마크 최소선 | account/RBAC/OIDC, fleet, GitOps, IaC, rollout/test, incident/AI/Safe PR, notification, DNS, shell, catalog, billing, realtime이 역할/스키마/API/event/test로 설명된다 | [프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md), `tests/test_docs_index.py` |
| Secret | token/password/kubeconfig 원문이 event, log, response, 문서에 없다 | `docs/secrets.md`, 관련 보안 테스트 |
| 권한 | backend가 session, role, workspace, cluster 권한을 최종 판단한다 | `tests/test_auth_security.py`, `tests/test_dashboard_router.py` |
| 장애 복구 | retry, DLQ, outbox, idempotency가 깨지지 않는다 | `tests/test_event_runtime.py`, `tests/test_dlq_reliability.py`, `tests/test_outbox.py` |

## 민정 완료 기준

민정은 Command + Target + Evidence를 production 수준으로 닫는다.

| 항목 | 왜 필요한가 | 코드 기준 | 테스트/확인 |
| --- | --- | --- | --- |
| agent outbound 경계 | target cluster가 management DB/NATS를 몰라도 동작해야 한다 | `src/services/target/cluster-agent` | `tests/test_target_agent_client.py` |
| command poll/start/heartbeat/result | command가 유실 없이 실행 상태를 남겨야 한다 | `src/domains/command/router.py`, `src/services/target/cluster-agent/commands` | `tests/test_command_router.py`, `tests/test_target_agent_commands.py` |
| write command approval guard | 자동 변경이 권한/승인 없이 실행되면 안 된다 | `src/domains/command/handler.py`, agent command guard | `tests/test_command_worker.py`, `tests/test_target_agent_commands.py` |
| evidence job schedule/poll/result | provider별 수집을 같은 queue 수준으로 처리해야 한다 | `src/domains/target/router.py`, `evidence/jobs.py` | `tests/test_target_evidence_jobs.py` |
| Kubernetes snapshot provider | pod/event/node/workload/service 상태가 RCA 입력에 필요하다 | `providers/kubernetes_providers.py` | `tests/test_target_kubernetes_evidence.py` |
| Prometheus instant/range query | metric 순간값과 추세를 RCA가 같이 봐야 한다 | `providers/prometheus_providers.py`, `queries/payloads.py` | `tests/test_target_metric_evidence.py` |
| Loki/Tempo provider | logs/traces가 RCA 근거가 된다 | `providers/loki_providers.py`, `providers/tempo_providers.py` | `tests/test_target_telemetry_evidence.py` |
| provider registry | 새 provider가 scheduler/collector와 느슨하게 연결되어야 한다 | `telemetry_registry.py` | `tests/test_telemetry_registry.py` |
| RBAC 최소 권한 | target agent 권한이 불필요하게 넓으면 안 된다 | `deploy/target/target.yaml` | `make manifest-check`, AWS smoke |
| Bruno agent/API 확인 | 팀원이 직접 눌러 흐름을 확인해야 한다 | `docs/api/03-agent-runtime`, `docs/api/04-command` | Bruno `aws-test` profile |

민정 문서 경로:

- [민정 온보딩](onboarding/minjeong-command-target-evidence.md)
- [민정 프로덕션 구현 흐름](rca-production-onboarding/01-minjeong-command-target-evidence.md)
- [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)
- [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md)
- [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)

## 가인 완료 기준

가인은 Evidence + RCA + Safe PR을 production 수준으로 닫는다.

| 항목 | 왜 필요한가 | 코드 기준 | 테스트/확인 |
| --- | --- | --- | --- |
| evidence 정규화 | raw provider 결과를 RCA가 먹을 수 있는 구조로 줄인다 | `src/services/ai/evidence-worker` | `tests/test_rca_evidence.py` |
| incident 생성 | symptom과 evidence window를 incident 단위로 묶는다 | `incident-worker` | `tests/test_rca_evidence.py` |
| RCA 후보/평가 | 확정 원인과 근거 부족을 구분해야 한다 | `plan-worker`, `analyze-worker`, `rca-worker` | `tests/test_rca_evidence.py` |
| insufficient evidence path | 근거 부족을 확정 원인처럼 보여주면 안 된다 | `RcaActionRequiredBody` | `tests/test_rca_evidence.py` |
| recovery route 선택 | command와 Safe PR 경계를 분리해야 한다 | `recovery-worker`, `select-worker`, `dispatch-worker` | `tests/test_event_golden_path.py` |
| Safe PR request | RCA worker가 GitHub에 직접 쓰지 않고 safe-pr-worker, ai-diff-worker, scm-worker 경계에서 패치 초안, diff 게이트, PR 생성 결과를 분리해야 한다 | `safe_pr.requested`, `safe_pr.patch_prepared`, `safe_pr.ready_for_creation`, `safe_pr.created`, `safe-pr-worker`, `ai-diff-worker`, `scm-worker` | `tests/test_repo_gateway_worker.py`, `tests/test_event_golden_path.py` |
| GithubScmProvider non-leak | token 원문이 event/log/response에 남으면 안 된다 | `src/domains/scm`, `scm-worker` | `tests/test_repo_gateway_worker.py`, `docs/secrets.md` |
| dashboard/audit 연결 | RCA 결과를 사람이 추적할 수 있어야 한다 | `audit-worker`, `dashboard-worker` | `tests/test_projection.py`, `tests/test_dashboard_projection.py` |
| Bruno RCA/API 확인 | timeline과 Safe PR 흐름을 직접 확인해야 한다 | `docs/api/05-rca-dashboard`, `docs/api/06-gitops-approval` | Bruno `aws-test` profile |

가인 문서 경로:

- [가인 온보딩](onboarding/gain-evidence-rca.md)
- [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)
- [RCA / Safe PR 멤버 가이드](team/member-guides/rca-safe-pr.md)
- [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md)
- [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)
- [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)

## 찬빈 완료 기준

찬빈은 Frontend + 권한 + Dashboard를 production 수준으로 닫는다.

| 항목 | 왜 필요한가 | 코드 기준 | 테스트/확인 |
| --- | --- | --- | --- |
| session/httpOnly cookie | browser가 token 원문을 직접 들고 있지 않아야 한다 | `src/domains/identity/router.py` | `tests/test_identity_auth_routes.py`, `tests/test_auth_security.py` |
| role/workspace/cluster 권한 | 목록과 단건 조회 모두 backend에서 걸러야 한다 | `identity/dependencies.py`, `identity/repository.py` | `tests/test_dashboard_router.py` |
| dashboard read model | event payload 전체를 frontend가 직접 파싱하지 않게 한다 | `src/domains/dashboard/models.py` | `tests/test_dashboard_projection.py` |
| dashboard query API | session과 cluster read 권한으로 timeline을 필터링한다 | `src/domains/dashboard/router.py` | `tests/test_dashboard_router.py` |
| realtime 경계 | browser와 agent realtime 채널을 분리한다 | `src/services/realtime/realtime-gateway` | `tests/test_realtime_gateway.py` |
| 상태 표현 | requested/created/failed, queued/completed를 섞지 않는다 | `RcaTimelineItem` | `tests/test_dashboard_projection.py` |
| action 버튼 권한 | frontend 비활성화는 보조이고 backend 권한이 최종이다 | command/approval/dashboard router | `tests/test_gitops_approval_router.py`, `tests/test_dashboard_router.py` |
| Bruno auth/dashboard 확인 | 로그인, 권한, dashboard 결과를 직접 확인해야 한다 | `docs/api/00-health-auth`, `docs/api/05-rca-dashboard` | Bruno `aws-test` profile |

찬빈 문서 경로:

- [찬빈 온보딩](onboarding/chanbin-frontend.md)
- [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md)
- [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md)
- [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)
- [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)

## 마지막 release gate

production 완료 선언 전에는 아래 순서를 그대로 돈다.

1. `make check`
2. Bruno `aws-test` profile로 auth, target, agent runtime, command, RCA dashboard, GitOps approval, AI, DLQ/metrics 폴더 확인
3. [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)의 기능 도메인이 담당자/스키마/API/event/test/Bruno 요청으로 모두 쪼개졌는지 확인
4. 운영 환경변수를 지정하고 `make smoke`
5. management/target rollout과 smoke 결과를 운영 로그에서 확인
6. `docs/README.md`의 민정/가인/찬빈 필독 목록이 현재 코드와 맞는지 확인
7. [보안 기준](security-baseline.md)의 인증·네트워크·비밀값·명령 실행 경계를 확인

이 일곱 개가 모두 통과해야 production runnable 완료라고 말한다.
