# 파일 소유권 컨벤션

내 담당 파일은 빠르게 고치되, 공유 계약은 같이 맞춘다. 이 문서는 “내가 바로 고쳐도 되는 파일”과 “먼저 말해야 하는 파일”을 나누기 위한 기준이다.

## 공통으로 알아야 하는 파일

| 파일 | 이유 |
| --- | --- |
| `README.md` | 실행 기준과 서비스 목록 |
| `docs/README.md` | canonical 문서 시작점과 역할별 필독 목록 |
| `docs/api/README.md` | Bruno API 수동 테스트 순서 |
| `Makefile` | `make check`, `make manifest-check`, `make smoke` 진입점 |
| `src/packages/contracts/gateway/routes.py` | Gateway HTTP route 기준 |
| `src/packages/contracts/gateway/requests.py` | Gateway request DTO 기준 |
| `src/packages/contracts/gateway/responses.py` | Gateway response DTO 기준 |
| `src/packages/contracts/event_bus` | event subject, stream, subscription 계약 |
| `src/packages/runtime/app.py` | `@app.on`, `@app.on_any` worker 실행 방식 |
| `src/packages/storage/schema.py` | DB table 기준 |
| `docs/events.md` | event 흐름 문서 |
| `docs/aws-testing-runbook.md` | AWS 테스트 기준 |

## 민정

담당: Command + Target + Evidence

직접 관리:

- `src/domains/command`
- `src/domains/target`
- `src/services/command/command-worker`
- `src/services/target/cluster-agent`
- `src/services/target/node-collector`
- `deploy/target`
- `tests/test_command_*`
- `tests/test_target_*`
- `tests/test_node_collector.py`
- `docs/onboarding/minjeong-command-target-evidence.md`
- `docs/rca-production-onboarding/01-minjeong-command-target-evidence.md`
- `docs/team/member-guides/target-agent-command-evidence-flow.md`
- `docs/team/target-telemetry-tasks`

조율 필요:

- `cluster.evidence.received` payload 변경은 가인과 조율한다.
- dashboard에 표시할 response field 변경은 찬빈과 조율한다.
- agent token, cluster 권한, target registration 변경은 찬빈의 권한 문서도 같이 확인한다.

## 가인

담당: Evidence + RCA + Safe PR

직접 관리:

- `src/domains/rca`
- `src/domains/scm`
- `src/services/ai`
- `src/services/gitops/scm-worker`
- `src/services/projection/audit-worker`
- `tests/test_rca_evidence.py`
- `tests/test_repo_gateway_worker.py`
- `tests/test_ai_*`
- `docs/onboarding/gain-evidence-rca.md`
- `docs/rca-production-onboarding/02-gain-evidence-rca-safe-pr.md`
- `docs/team/member-guides/rca-safe-pr.md`
- `docs/team/rca-safe-pr-tasks`

조율 필요:

- evidence source나 field 변경은 민정과 조율한다.
- `safe_pr.requested`, `command.requested` 흐름 변경은 민정과 조율한다.
- dashboard timeline에 새 상태를 보여야 하면 찬빈과 조율한다.

## 찬빈

담당: Frontend + 권한 + Dashboard

직접 관리:

- `src/domains/identity`
- `src/domains/dashboard`
- `src/services/projection/dashboard-worker`
- `src/services/gateway/api-gateway`
- `src/packages/contracts/gateway/responses.py`
- `tests/test_identity_auth_routes.py`
- `tests/test_auth_security.py`
- `tests/test_dashboard_projection.py`
- `tests/test_dashboard_router.py`
- `tests/test_realtime_*`
- `docs/onboarding/chanbin-frontend.md`
- `docs/rca-production-onboarding/03-chanbin-frontend-projection.md`
- `docs/rca-production-onboarding/06-chanbin-permission-dashboard.md`

조율 필요:

- dashboard DTO에 command/evidence/RCA 필드를 추가하면 민정/가인과 조율한다.
- session/role/cluster 권한 정책을 바꾸면 모든 API 테스트와 Bruno profile을 확인한다.
- frontend에서 직접 숨기는 수준의 권한 처리는 금지다. backend 권한 필터가 먼저 있어야 한다.

## 공유 파일 변경 기준

| 파일 | 변경 전 확인 |
| --- | --- |
| `src/packages/contracts/**` | 영향받는 역할의 테스트와 문서 |
| `src/packages/storage/schema.py` | DB migration, repository test, dashboard/RCA 영향 |
| `deploy/**` | `make manifest-check`, AWS smoke 영향 |
| `.github/workflows/**` | CI/AWS CD 실행 영향 |
| `docs/api/**` | 실제 route와 Bruno test block 일치 여부 |
| `docs/**` | [문서 루트](../README.md) canonical 진입점과 역할별 필독 목록 |

## PR 체크

- 내 담당 파일과 공유 파일을 구분했다.
- 공유 계약을 바꿨으면 관련 역할 문서도 같이 고쳤다.
- 테스트 명령과 결과를 PR에 적었다.
- API 변경은 Bruno collection도 같이 고쳤다.
- 새 canonical 문서는 `docs/README.md` 또는 해당 영역 `README.md`에 링크했다.
