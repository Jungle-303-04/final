# 벤치마크 최소선 기준 프로덕션 완성 설계

이 문서는 외부 기준 저장소의 기능 범위를 최소선으로 두고, 우리 프로젝트 구조에 맞게 다시 설계한 프로덕션 완성 기준이다.

중요한 기준은 하나다.

> 외부 기준을 그대로 복사하지 않는다. 우리 프로젝트의 `Gateway -> event -> worker -> target agent -> evidence -> RCA -> Safe PR -> dashboard` 구조로 바꿔서 구현한다.

여기 있는 항목은 팀원이 issue를 만들고 바로 코드로 들어갈 수 있을 정도로 쪼갠다. 어떤 기능이 왜 필요한지, 어디에 구현해야 하는지, 어떤 값을 넘겨야 하는지, 어떤 테스트와 Bruno 요청으로 확인해야 하는지를 함께 적는다.

## 확인 기준

확인한 기준은 요청받은 외부 기준 저장소다.

- 확인 commit: `f2a74344072a98f123e0830551a235ace3e4c45b`
- 확인 파일 수: 전체 1,712개
- 서버 코드: Elixir 915개
- API schema: GraphQL 32개
- frontend: TS/JS 446개
- 확인한 주요 경로: `schema/schema.graphql`, `apps/core/lib/core/schema`, `apps/core/lib/core/services`, `apps/graphql/lib/graphql/schema`, `apps/graphql/lib/graphql/resolvers`, `www/src/graph`, `www/src/components`

이 범위에서 확인한 핵심 제품 기능은 fleet-scale GitOps, fleet visibility, Kubernetes CRD-native IaC, 자동 PR 생성, AI insight, DNS, OIDC provider, self-hosted secure-by-default 운영이다. 우리는 이 기능을 GraphQL 구조로 복사하지 않고 REST Gateway, typed event, target agent, read model 구조로 옮긴다.

## 지금 코드에서 이미 확인한 실행 축

아래 흐름은 현재 코드와 테스트가 있다. 새 기능은 이 흐름을 깨지 않고 확장한다.

| 축 | 현재 코드 | 바로 확인할 테스트 |
| --- | --- | --- |
| typed event 등록 | `src/domains/*/events.py`, `src/packages/contracts/event_bus/subjects.py` | `tests/test_event_body_contracts.py`, `tests/test_event_golden_path.py` |
| worker event 소비 | `src/services/**/app.py`의 `@app.on(...)`, `@app.on_any` | `tests/test_event_runtime.py`, 각 worker test |
| command 요청/agent poll/result | `src/domains/command/router.py`, `src/domains/command/repository.py`, `src/services/target/cluster-agent/agent.py` | `tests/test_command_router.py`, `tests/test_command_worker.py`, `tests/test_target_agent_commands.py` |
| Agent debug query API | `POST /agent/debug/query`, `debug_query_plan()` | `tests/test_command_router.py::test_agent_debug_query_requires_cluster_read_access_and_queues_agent_command` |
| evidence job schedule/poll/result | `src/domains/target/router.py`, `src/domains/target/repository.py`, `src/services/target/cluster-agent/evidence/jobs.py` | `tests/test_target_evidence_jobs.py`, `tests/test_target_registration.py` |
| provider decorator | `src/services/target/cluster-agent/telemetry_registry.py`, `src/services/target/cluster-agent/providers/*` | `tests/test_telemetry_registry.py` |
| Prometheus range query | `PrometheusRangeQuery`, `PrometheusMetricsProvider.query_range()` | `tests/test_target_metric_evidence.py`, `tests/test_telemetry_registry.py` |
| Kubernetes snapshot provider | `KubernetesSnapshotProvider`, `KubernetesSnapshotQuery` | `tests/test_target_kubernetes_evidence.py` |
| metrics/logs/traces/evidence 결합 | `EvidenceCollector.collect()` | `tests/test_target_metric_evidence.py`, `tests/test_target_log_evidence.py`, `tests/test_target_trace_evidence.py` |
| RCA chain | `src/services/ai/agent/pipeline/*`, `src/services/**/rca*` | `tests/test_rca_evidence.py`, `tests/test_event_golden_path.py` |
| Safe PR | `src/services/gitops/scm-worker/github_provider.py`, `src/packages/contracts/scm/provider.py` | `tests/test_repo_gateway_worker.py` |
| dashboard 권한 필터 | `src/domains/dashboard/router.py`, `src/domains/identity/repository.py` | `tests/test_dashboard_router.py`, `tests/test_auth_security.py` |
| realtime gateway | `src/services/realtime/realtime-gateway/*` | `tests/test_realtime_gateway.py`, `tests/test_realtime_contracts.py` |

## 외부 기준 기능을 우리 구현 단위로 바꾼 표

이 표가 프로덕션 완성의 큰 체크리스트다. `작업 시작 파일`은 처음 열어야 하는 파일이고, `완료 확인`은 PR에서 반드시 돌릴 테스트다.

| 기능 도메인 | 왜 필요한가 | 우리 구현 단위 | 넘겨야 하는 값 | 담당 | 작업 시작 파일 | 완료 확인 |
| --- | --- | --- | --- | --- | --- | --- |
| Account/User/Auth | 모든 API와 dashboard 권한의 시작점이다. | signup/login/logout/session, email verification, service account, token audit | `workspace_id`, `user_id`, `roles`, `session_token` | 찬빈 | `src/domains/identity/router.py` | `tests/test_password_auth.py`, `tests/test_identity_auth_routes.py` |
| Group/Role/RBAC | 팀원, 서비스 계정, cluster별 접근을 분리한다. | workspace member, group, role, resource grant, cluster read/deploy action | `resource_type`, `resource_id`, `action`, `allowed_cluster_ids` | 찬빈 | `src/domains/identity/repository.py` | `tests/test_dashboard_router.py`, `tests/test_auth_security.py` |
| OIDC/OAuth/Auth Proxy | 외부 SSO와 내부 session을 연결해야 한다. | provider, trust relationship, external login, auth proxy header contract | `issuer`, `client_id`, `redirect_uri`, `subject`, `workspace_id` | 찬빈 | `src/domains/identity` | 신규 auth/OIDC route test, Bruno auth 폴더 |
| Audit/Login Metrics | 누가 무엇을 봤고 바꿨는지 추적한다. | audit event, access token audit, login metrics, IP/user-agent metadata | `actor_id`, `event_subject`, `resource_ref`, `request_id` | 찬빈 + 가인 | `src/domains/audit`, `src/services/projection/*` | `tests/test_projection.py`, 신규 audit route test |
| Fleet Cluster | 여러 target cluster를 등록/조회/삭제/상태 확인한다. | target registry, cluster information, usage history, dependency | `workspace_id`, `cluster_id`, `agent_id`, `environment`, `policy` | 민정 | `src/domains/target/router.py` | `tests/test_target_registration.py` |
| Console Instance / Cloud Cluster | 관리 plane 자체의 AWS 운영 상태를 추적한다. | EKS management cluster, target cluster bootstrap state, health probe | `provider`, `region`, `cluster_endpoint_ref`, `status` | 민정 | `infra/aws`, `docs/aws-testing-runbook.md` | `make aws-smoke`, AWS CD workflow |
| GitOps Repository | 배포 source와 manifest 기준을 저장한다. | repository, watch target, installation, source ref, artifact digest, lock | `repository_id`, `branch`, `commit_sha`, `path`, `artifact_digest` | 민정 | `src/domains/gitops/router.py` | `tests/test_gitops_router.py`, `tests/test_manifest_render_worker.py` |
| Helm/Kustomize/YAML Deploy | fleet-scale 배포의 실제 실행 단위다. | render, diff, approval, command, rollout status | `rendered_manifest`, `diff_summary`, `approval_id`, `command_id` | 민정 | `src/services/gitops/manifest-render-worker/app.py` | `tests/test_manifest_render_worker.py`, `make manifest-check` |
| Terraform/IaC | Kubernetes 밖의 infra 자원도 같은 감사 흐름에 넣는다. | module, install, provider scaffold, plan/apply status projection | `module_ref`, `variables`, `plan_summary`, `state_ref` | 민정 | 신규 `src/domains/iac` | 신규 IaC schema/worker/Bruno test |
| Recipe/Stack/Scaffold | 반복 설치를 사람이 쉽게 시작하게 한다. | recipe, stack, scaffold template, install bundle | `template_id`, `input_values`, `rendered_steps`, `owner` | 민정 + 찬빈 | 신규 `src/domains/catalog` | 신규 catalog route/projection test |
| Upgrade Queue / Deferred Update | 안전한 순차 배포와 버전 승격이 필요하다. | upgrade queue, deferred update, promote, dependency gate | `upgrade_id`, `version`, `wave`, `blocked_reason` | 민정 | 신규 `src/domains/rollout` | 신규 rollout queue worker test |
| Rollout | 배포 진행/실패를 dashboard와 RCA가 같이 본다. | rollout event, rollout read model, failure reason, retry | `rollout_id`, `status`, `started_at`, `finished_at`, `failure_reason` | 민정 + 찬빈 | `src/domains/dashboard/repository.py` | `tests/test_dashboard_projection.py` |
| Test / Test Logs | 배포 후 자동 검증과 로그가 있어야 한다. | smoke test entity, step log publish, realtime test delta | `test_id`, `step_id`, `stdout_ref`, `status`, `duration_ms` | 민정 + 찬빈 | 신규 `src/domains/tests` | 신규 test-log event/realtime test |
| Dependency / Scan / Vulnerability | PR과 배포가 안전한지 판단한다. | image/package dependency, vulnerability, scan violation/error | `artifact_digest`, `package`, `severity`, `cve`, `fix_version` | 가인 | 신규 `src/domains/security_scan` | 신규 scan evidence/RCA test |
| Incident / Message / Postmortem | 장애 대응의 협업 단위다. | incident, history, message, reaction, follower, postmortem | `incident_id`, `message_id`, `author_id`, `summary`, `status` | 가인 + 찬빈 | `src/domains/rca/events.py` | 신규 incident projection/router test |
| AI Insight / Chat / Help | 장애 설명과 복구 제안을 사람이 이해하게 한다. | RCA AI fallback, chat/help API, tool schema, budget, auth | `conversation_id`, `tool_name`, `evidence_refs`, `budget` | 가인 | `src/domains/ai`, `src/packages/ai` | `tests/test_ai_conversation.py`, `tests/test_ai_platform_tools.py` |
| Automated PR Generation | 수정 제안을 감사 가능한 코드 변경으로 만든다. | Safe PR request, GithubScmProvider, branch/commit/PR, rollback patch | `branch`, `commit_sha`, `pr_url`, `rollback_patch`, `evidence_basis` | 가인 | `src/services/gitops/scm-worker/github_provider.py` | `tests/test_repo_gateway_worker.py` |
| Notification / Email / Digest | incident, approval, rollout 실패를 놓치지 않게 한다. | notification, email worker, digest, read state, realtime push | `notification_id`, `channel`, `recipient`, `read_at`, `subject_ref` | 가인 + 찬빈 | `src/services/alert`, `src/domains/identity/router.py` | 신규 notification/email/realtime test |
| DNS | cluster/service endpoint를 운영한다. | DNS domain/record/access policy/binding | `domain`, `record_name`, `record_type`, `target`, `policy_id` | 민정 + 찬빈 | 신규 `src/domains/dns` | 신규 DNS route/command/audit test |
| Shell / Demo Project | 운영자가 cluster/context에서 제한된 작업을 해야 한다. | bounded shell/session, demo project lifecycle, shell audit | `session_id`, `command`, `namespace`, `expires_at`, `audit_ref` | 민정 + 찬빈 | 신규 `src/domains/shell` | 신규 shell auth/audit test |
| Billing/License/Plan | 서비스 운영과 라이선스 제한을 관리한다. | plan, subscription, invoice, license key, quota gate | `plan_id`, `license_key_ref`, `quota`, `usage`, `invoice_id` | 찬빈 | 신규 `src/domains/billing` | 신규 billing route/permission test |
| Marketplace/Publisher | 앱/패키지 catalog와 설치 경험을 제공한다. | publisher, repository catalog, artifact, chart, terraform, docker repository | `publisher_id`, `package_id`, `version`, `install_target` | 찬빈 + 민정 | 신규 `src/domains/catalog` | 신규 catalog/dashboard/Bruno test |
| Realtime Subscription | UI가 incident/notification/rollout/test를 즉시 본다. | websocket subject, browser auth, bounded payload, snapshot recovery | `workspace_id`, `subject`, `seq`, `payload`, `snapshot` | 찬빈 | `src/services/realtime/realtime-gateway` | `tests/test_realtime_gateway.py` |

## 원시 기능 표면을 빠짐없이 옮기는 방법

외부 기준 저장소는 서버 schema, service, API resolver, frontend graph/component가 나뉘어 있다. 우리는 같은 이름으로 복사하지 않고 아래처럼 묶는다.

### 서버 schema 107개 대응

| 원시 schema 묶음 | 우리 도메인 | 담당 |
| --- | --- | --- |
| `account`, `user`, `group`, `group_member`, `role`, `role_binding`, `invite`, `invite_group`, `login_token`, `passwordless_login`, `reset_token`, `email` | identity/auth/RBAC | 찬빈 |
| `access_token_audit`, `persisted_token`, `public_key`, `key_backup`, `eab_credential`, `impersonation_policy`, `impersonation_policy_binding` | credential/audit/security | 찬빈 |
| `oidc_provider`, `oidc_provider_binding`, `oidc_login`, `oidc_trust_relationship`, `oauth_integration` | SSO/auth proxy | 찬빈 |
| `cluster`, `cluster_information`, `cluster_usage_history`, `cluster_dependency`, `cloud_cluster`, `console_instance` | target/fleet/cloud cluster | 민정 |
| `repository`, `installation`, `artifact`, `chart`, `chart_installation`, `terraform`, `terraform_installation`, `docker_repository`, `docker_image`, `version`, `version_tag`, `tag` | GitOps/catalog/package | 민정 + 찬빈 |
| `recipe`, `recipe_dependency`, `recipe_item`, `recipe_section`, `recipe_test`, `stack`, `stack_collection`, `stack_recipe`, `provider_scaffold`, `resource_definition`, `crd` | self-service template/IaC scaffold | 민정 + 찬빈 |
| `upgrade`, `upgrade_queue`, `deferred_update`, `rollout`, `test`, `test_bindings`, `test_step`, `lock`, `apply_lock`, `validations` | upgrade/rollout/test gate | 민정 |
| `incident`, `incident_history`, `incident_message`, `message_entity`, `reaction`, `follower`, `postmortem` | incident/RCA collaboration | 가인 + 찬빈 |
| `notification`, `webhook`, `webhook_log`, `integration`, `integration_webhook`, `audit`, `user_event` | notification/audit/integration | 가인 + 찬빈 |
| `package_scan`, `scan_error`, `scan_violation`, `vulnerability`, `dependencies`, `image_dependency` | dependency/security evidence | 가인 |
| `dns_domain`, `dns_record`, `dns_access_policy`, `dns_access_policy_binding`, `domain_mapping` | DNS/access policy | 민정 + 찬빈 |
| `plan`, `platform_plan`, `platform_subscription`, `subscription`, `license`, `license_token`, `address` | billing/license/subscription | 찬빈 |
| `cloud_shell`, `shell`, `demo_project`, `database`, `file`, `dashboard`, `publisher`, `contributor`, `misc` | shell/demo/catalog/read model/shared metadata | 담당 도메인별 분배 |

### 서비스 29개 대응

| 원시 service 묶음 | 우리 service/worker | 담당 |
| --- | --- | --- |
| `accounts`, `users`, `rbac`, `oauth`, `audits` | identity router, auth dependency, audit projector | 찬빈 |
| `clusters`, `cloud`, `repositories`, `charts`, `terraform`, `recipes`, `scaffolds`, `versions` | gitops/target/catalog/IaC workers | 민정 |
| `metrics`, `dependencies`, `scan`, `incidents`, `ai` | evidence provider, RCA pipeline, AI tools | 가인 |
| `rollouts`, `tests`, `upgrades`, `locks` | rollout/test/upgrade gate workers | 민정 |
| `dns`, `shell`, `storage`, `email`, `payments`, `base` | DNS/shell/object storage/mail/billing/common infra | 역할별 분리 |

### API operation 대응 규칙

기준 저장소는 GraphQL query/mutation/subscription 중심이다. 우리는 다음 규칙으로 나눈다.

1. 사람이 누르는 write는 Gateway REST route가 된다.
2. 오래 걸리는 작업은 event body가 된다.
3. target cluster에서 실행할 일은 agent command가 된다.
4. dashboard는 event 원문이 아니라 read model DTO만 읽는다.
5. 실시간 화면은 websocket subject와 bounded snapshot만 받는다.
6. 모든 API는 Bruno request와 expected response test block을 가진다.

## 데코레이터 사용 기준

팀원이 새 기능을 추가할 때 먼저 보는 기준이다.

| 데코레이터 | 어디에 쓰는가 | 입력 | 출력 | 실수하면 생기는 문제 |
| --- | --- | --- | --- | --- |
| `@event(EventSubject.X)` | `src/domains/*/events.py` | event subject, body dataclass | typed event registry | producer/consumer가 서로 다른 body를 보게 된다. |
| `@app.on(BodyType)` | `src/services/**/app.py` | event body type | handler 등록 | event가 발행돼도 worker가 처리하지 않는다. |
| `@app.on_any` | projection/audit worker | 모든 event envelope | read model/audit row | 화면/감사 로그가 비게 된다. |
| `@telemetry.source(...)` | target agent provider class | source, evidence_key, query type | provider registry | evidence policy가 provider를 찾지 못한다. |
| `@command.handler(...)` | target agent command handler | action, payload model | command dispatcher | agent가 command action을 실행하지 못한다. |
| `@command.k8s(...)` | Kubernetes write/read command | action, verb, resource, scope | policy guard + handler | scope/verb 제한 없이 실행될 수 있다. |
| `@rca.cause(...)` | RCA cause catalog | symptom, required source, confidence rule | root cause candidate | 같은 증상을 여러 사람이 다르게 해석한다. |
| `@rca.recovery(...)` | recovery action catalog | cause type, command/safe-pr action | recovery proposal | RCA가 끝나도 사람이 할 작업으로 이어지지 않는다. |

## 민정 작업 카드

민정은 Command + Target + Evidence + Fleet 실행 책임이다. 한 카드가 PR 하나가 되도록 쪼갠다.

| 카드 | 왜 필요한가 | 구현 파일 | event/API/command | 테스트 |
| --- | --- | --- | --- | --- |
| M1 cluster lifecycle schema | cluster를 프로덕션 resource로 관리해야 한다. | `src/domains/target/models.py`, `repository.py` | `POST /targets`, `cluster.registered` | `tests/test_target_registration.py` |
| M2 cluster information/usage history | dashboard와 RCA가 cluster 상태 변화를 본다. | `src/domains/target/models.py`, 신규 projection | `cluster.status.updated` | 신규 repository/projection test |
| M3 evidence provider policy | Kubernetes, metrics, logs, traces를 한 세트로 수집한다. | `src/domains/target/evidence_policy.py` | evidence job schedule/poll/result | `tests/test_target_evidence_jobs.py` |
| M4 Prometheus range query 유지 | 순간값이 아니라 변화량과 rate를 본다. | `queries/registry.py`, `providers/prometheus_providers.py` | `PrometheusRangeQuery` | `tests/test_target_metric_evidence.py` |
| M5 Kubernetes snapshot provider 유지 | pods/events/nodes/workloads/services를 같은 bucket에 넣는다. | `providers/kubernetes_providers.py` | `KubernetesSnapshotQuery` | `tests/test_target_kubernetes_evidence.py` |
| M6 GitOps repository/artifact | 배포 source와 산출물을 추적한다. | `src/domains/gitops/*` | git changed/rendered/diff events | `tests/test_manifest_render_worker.py` |
| M7 upgrade queue | 여러 cluster에 순차 배포한다. | 신규 `src/domains/rollout` | `upgrade.queued`, `upgrade.promoted` | 신규 upgrade worker test |
| M8 rollout observer | 배포 성공/실패를 read model로 남긴다. | target agent command result + projection | `rollout.updated` | `tests/test_dashboard_projection.py` 확장 |
| M9 DNS command | endpoint 변경을 권한/감사 흐름으로 처리한다. | 신규 `src/domains/dns`, command handler | `dns.record.requested` | 신규 DNS router/command test |
| M10 AWS smoke | Docker 없이 AWS에서 검증한다. | `.github/workflows/aws-cd.yml`, `scripts/aws-smoke.sh` | GitHub Actions dispatch | `make aws-smoke` |

## 가인 작업 카드

가인은 Evidence + RCA + Safe PR + Security evidence 책임이다.

| 카드 | 왜 필요한가 | 구현 파일 | event/API/command | 테스트 |
| --- | --- | --- | --- | --- |
| G1 evidence bundle normalization | provider별 payload를 RCA가 같은 방식으로 읽는다. | `src/services/ai/agent/pipeline/evidence_bundle.py` | `cluster.evidence.received` | `tests/test_rca_evidence.py` |
| G2 incident model | RCA 결과를 협업 단위로 저장한다. | `src/domains/rca/models.py`, `events.py` | `incident.created`, `incident.updated` | 신규 incident repository/projection test |
| G3 incident message/history | 사람이 조사 과정을 이어 볼 수 있다. | 신규 incident repository/API | message/history events | 신규 router/projection test |
| G4 scan/vulnerability evidence | PR/배포 판단에 보안 근거를 넣는다. | 신규 `src/domains/security_scan` | `scan.completed`, `vulnerability.detected` | 신규 scan-to-rca test |
| G5 AI tool budget/auth | AI가 권한 밖 data를 보지 않게 한다. | `src/domains/ai/tools.py`, `messages.py` | chat/help API | `tests/test_ai_platform_tools.py` |
| G6 deterministic RCA guard | evidence 부족 시 자동 조치하지 않는다. | RCA analyzer/recovery selector | `rca.action_required` | `tests/test_event_golden_path.py` 확장 |
| G7 Safe PR evidence basis | PR이 왜 필요한지 증거를 남긴다. | `src/domains/scm/events.py`, `scm-worker` | `safe_pr.requested/created/failed` | `tests/test_repo_gateway_worker.py` |
| G8 rollback patch | 잘못된 수정도 되돌릴 수 있어야 한다. | Safe PR proposal builder | `rollback_patch` field | 신규 proposal test |
| G9 notification trigger | incident/approval/PR 상태를 놓치지 않는다. | alert/notification worker | `notification.created` | 신규 notification test |
| G10 Bruno RCA flow | 사람이 API를 눌러 RCA chain을 검증한다. | `docs/api/05-rca-dashboard`, `docs/api/06-gitops-approval` | expected response test block | `tests/test_bruno_collection.py` |

## 찬빈 작업 카드

찬빈은 Frontend + 권한 + Dashboard + Realtime 책임이다.

| 카드 | 왜 필요한가 | 구현 파일 | event/API/command | 테스트 |
| --- | --- | --- | --- | --- |
| C1 session/auth UI | 사용자가 로그인 상태를 알 수 있어야 한다. | frontend auth client, `AUTH_*` routes | `/auth/session`, `/auth/login` | `tests/test_identity_auth_routes.py` |
| C2 RBAC filter UI | 권한 없는 cluster/data를 보이면 안 된다. | dashboard client + backend filter | `allowed_cluster_ids` | `tests/test_dashboard_router.py` |
| C3 resource grant admin | 누가 어떤 resource를 볼지 관리한다. | identity API/UI | grant payload | 신규 grant route test |
| C4 OIDC settings | 팀 SSO를 설정한다. | 신규 identity/OIDC UI/API | provider/trust DTO | 신규 OIDC route test |
| C5 RCA timeline | event 흐름을 사람이 한 화면에서 본다. | frontend RCA timeline | `/dashboard/rca/timeline` | `tests/test_dashboard_router.py` |
| C6 incident detail | message/history/postmortem을 연결한다. | frontend incident detail + API | `/dashboard/rca/incidents/{id}` | 신규 incident detail test |
| C7 catalog/marketplace UI | 설치 가능한 package를 탐색한다. | 신규 catalog UI/API | publisher/package/version DTO | 신규 catalog route test |
| C8 billing/license UI | quota와 plan을 운영자가 본다. | 신규 billing UI/API | plan/subscription/license DTO | 신규 billing permission test |
| C9 realtime UI | incident/notification/rollout/test log를 즉시 본다. | websocket client | snapshot/delta/ping | `tests/test_realtime_gateway.py` |
| C10 Bruno dashboard flow | 화면 API를 팀원이 직접 눌러 본다. | `docs/api/00-health-auth`, `docs/api/05-rca-dashboard` | expected response test block | `tests/test_bruno_collection.py` |

## 서로 넘겨야 하는 값

| 보내는 사람 | 받는 사람 | 값 | 왜 필요한가 | 누락되면 |
| --- | --- | --- | --- | --- |
| 민정 | 가인 | `cluster.evidence.received.evidence_key` | RCA가 evidence bundle을 다시 찾는다. | 원인 분석이 근거 없이 실행된다. |
| 민정 | 가인 | `workspace_id`, `cluster_id`, `source_id`, `window_start`, `window_end` | RCA 범위와 권한을 고정한다. | 다른 cluster data가 섞인다. |
| 민정 | 찬빈 | `command_id`, `status`, `action`, `agent_id`, `lease_id` | command 상태를 화면에 표시한다. | 사용자가 실행 여부를 모른다. |
| 가인 | 민정 | `command.requested` 또는 `safe_pr.requested` | 복구를 실행 경로로 넘긴다. | RCA가 결과만 남고 조치가 없다. |
| 가인 | 찬빈 | `incident_id`, `root_cause`, `confidence`, `recommended_action`, `supporting_evidence` | 화면에서 사람이 판단한다. | 결과 신뢰도를 알 수 없다. |
| 찬빈 | 민정/가인 | `user action payload`, `approval_id`, `selected_action` | 사람이 승인한 일만 실행한다. | 자동 조치와 수동 승인이 섞인다. |

## 작업자가 새 기능을 만들 때 순서

1. `docs/README.md`에서 내 역할 문서를 연다.
2. 이 문서의 기능 도메인 표에서 내 카드 번호를 고른다.
3. `src/packages/contracts/gateway/routes.py`에 route가 필요한지 본다.
4. request/response DTO가 필요하면 `src/packages/contracts/gateway/requests.py`, `responses.py`에 만든다.
5. event가 필요하면 `src/packages/contracts/event_bus/subjects.py`와 `src/domains/*/events.py`에 만든다.
6. worker가 필요하면 `src/services/**/app.py`에 `@app.on(...)`을 붙인다.
7. target agent 실행이면 command action catalog와 handler를 같이 만든다.
8. dashboard 표시가 필요하면 read model repository와 router를 만든다.
9. Bruno request를 `docs/api/`에 추가하고 expected response test block을 넣는다.
10. 단위 테스트, flow test, Bruno collection test, docs index test를 돌린다.

## 완료 판정

프로덕션 완료라고 말하려면 아래가 모두 맞아야 한다.

- 모든 기능 도메인이 담당자, schema, route 또는 event, worker, test, Bruno 요청을 가진다.
- 권한은 frontend에서 숨기는 것으로 끝내지 않고 backend query에서 필터링한다.
- target agent 토큰, provider token, kubeconfig, SCM token은 browser에 내려가지 않는다.
- event body는 typed contract로 테스트한다.
- read model은 event 원문을 그대로 노출하지 않고 화면용 DTO로 변환한다.
- Safe PR은 `scm-worker`와 `GithubScmProvider`를 통해서만 만든다.
- AWS smoke는 Docker 없이 GitHub Actions `AWS CD` workflow로 실행한다.
- `make check`, `make manifest-check`, `make aws-smoke`가 통과한다.
- Bruno collection에서 역할별 API를 사람이 직접 눌러 expected response를 확인할 수 있다.
