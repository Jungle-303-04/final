from __future__ import annotations

from pathlib import Path

from packages.contracts.gateway import routes

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "docs" / "api"


def bruno_text() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(API_DIR.rglob("*.bru"))
        if "environments" not in path.parts
    )


def request_files() -> list[Path]:
    return [
        path
        for path in sorted(API_DIR.rglob("*.bru"))
        if path.name not in {"folder.bru", "collection.bru"} and "environments" not in path.parts
    ]


def test_bruno_collection_has_only_aws_test_profile() -> None:
    assert (API_DIR / "bruno.json").is_file()
    assert (API_DIR / "README.md").is_file()
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")

    environment_files = sorted(
        path.name for path in (API_DIR / "environments").iterdir() if path.is_file()
    )
    aws = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")

    assert "base_url: https://dev-k8s.woonyong.org/api/" in collection
    assert "auto_login: false" in collection
    assert "auth_email: replace-with-auth-email" in collection
    assert "auth_password: replace-with-auth-password" in collection
    assert "\n  cluster_id: api-verification-target\n" in collection

    assert environment_files == ["aws-test.bru"]
    assert "base_url: https://dev-k8s.woonyong.org/api/" in aws
    assert "management_base_url: https://dev-k8s.woonyong.org/api/" in aws
    assert "auto_login: false" in aws
    assert "auth_email: replace-with-auth-email" in aws
    assert "auth_password: replace-with-auth-password" in aws
    assert "\n  cluster_id: api-verification-target\n" in aws

    assert "base_url:" in aws
    assert "auto_login:" in aws
    assert "dev_security_bypass:" not in aws
    assert "dev_cluster_id:" not in aws
    assert "auth_email:" in aws
    assert "agent_token:" in aws
    assert "cluster_id:" in aws
    assert "alert_channel_id:" in aws
    assert "alertmanager_token:" in aws
    assert "github_webhook_signature:" in aws
    assert "rca_test_token:" not in aws
    assert "vars:secret [\n  rca_test_token\n]" in aws
    assert "rca_test_token:" not in collection


def test_rca_test_token_is_local_bruno_secret_without_tracked_placeholder() -> None:
    environment = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")
    workflow = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((API_DIR / "16-rca-debug").glob("*.bru"))
    )

    assert "vars:secret [\n  rca_test_token\n]" in environment
    assert "replace-with-RCA_TEST_RUNS_TOKEN" not in environment
    assert "replace-with-RCA_TEST_RUNS_TOKEN" not in collection
    assert "x-rca-test-token: {{rca_test_token}}" in workflow
    assert "x-rca-test-verification: {{rca_test_verification}}" in workflow
    assert "rca_test_verification: false" in environment


def test_aws_session_request_fails_closed_without_mtls_development_identity() -> None:
    request = (API_DIR / "00-health-auth" / "07-session.bru").read_text(encoding="utf-8")

    assert 'baseUrl.includes("dev-k8s.woonyong.org")' in request
    assert "expect(res.status).to.equal(200)" in request
    assert 'expect(body).to.have.property("workspace_id", "default")' in request
    assert 'expect(body.roles).to.include("service_admin")' in request


def test_every_gateway_route_has_a_bruno_request() -> None:
    collection = bruno_text().replace("{{base_url}}", "{{base_url}}/")
    expected_paths = [
        routes.HEALTHZ_PATH,
        routes.READYZ_PATH,
        "/openapi.json",
        routes.AUTH_SESSION_PATH,
        routes.AUTH_SIGNUP_PATH,
        routes.AUTH_LOGIN_PATH,
        routes.AUTH_LOGOUT_PATH,
        routes.AUTH_CHECK_EMAIL_PATH,
        f"{routes.AUTH_VERIFY_EMAIL_PATH}?token=",
        "/auth/users/{{user_id}}/approve",
        routes.AUTH_RESEND_VERIFICATION_PATH,
        routes.GITHUB_WEBHOOK_PATH,
        f"{routes.ALERTMANAGER_WEBHOOK_PATH}?cluster_id=",
        routes.AGENT_CONNECT_PATH,
        routes.AGENT_EVIDENCE_PATH,
        routes.TARGETS_PATH,
        "/install/{{agent_token}}",
        routes.COMMANDS_PATH,
        "/commands/{{command_id}}",
        "/approvals/{{approval_id}}/grant",
        "/approvals/{{approval_id}}/reject",
        routes.DEAD_LETTERS_PATH,
        "/dead-letters/{{dead_letter_id}}/replay",
        routes.AI_CONVERSATIONS_PATH,
        "/ai/conversations/{{conversation_id}}",
        "/ai/conversations/{{conversation_id}}/messages",
        routes.AI_CHAT_PATH,
        f"{routes.AI_SUGGESTIONS_PATH}?context=",
        "/ai/resources/pods?cluster_id=",
        "/ai/resources/deployments/{{namespace}}/{{deployment_name}}?cluster_id=",
        routes.ORGS_PATH,
        "/orgs/{{created_org_id}}",
        routes.GROUPS_PATH,
        "/groups/{{group_id}}/members",
        "/groups/{{group_id}}/members/{{user_id}}",
        routes.USERS_PATH,
        routes.ACCESS_PATH,
        "/access/{{access_id}}",
        routes.ALERT_CHANNELS_PATH,
        "/alert-channels/{{alert_channel_id}}",
        routes.ALERT_CHANNEL_TEST_PATH,
        routes.APPLICATIONS_PATH,
        routes.APPLICATION_CONNECT_PATH,
        "/applications/{{application_id}}",
        "/applications/{{application_id}}/deployments",
        "/applications/{{application_id}}/drift",
        "/applications/{{application_id}}/runs",
        routes.REPOSITORY_DISCOVERY_PROBE_PATH,
        f"{routes.REPOSITORY_DISCOVERY_BRANCHES_PATH}?repo_ref=",
        routes.REPOSITORY_DISCOVERY_MANIFESTS_PATH,
        routes.REPOSITORY_DISCOVERY_VALIDATE_PATH,
        routes.AGENT_COMMAND_POLL_PATH,
        "/agent/commands/{{command_id}}/start",
        "/agent/commands/{{command_id}}/heartbeat",
        "/agent/commands/{{command_id}}/result",
        routes.AGENT_EVIDENCE_JOB_SCHEDULE_PATH,
        routes.AGENT_EVIDENCE_JOB_POLL_PATH,
        "/agent/evidence/jobs/{{evidence_job_id}}/result",
        routes.AGENT_POLICY_PATH,
        routes.AGENT_POLICY_STATUS_PATH,
        routes.AGENT_RECONCILE_STATUS_PATH,
        routes.AGENT_DEBUG_QUERY_PATH,
        "/clusters/{{agent_cluster_id}}/policy",
        "/clusters/{{cluster_id}}/usage",
        routes.PROVIDERS_CATALOG_PATH,
        routes.PROVIDERS_CLUSTER_DISCOVERY_PATH,
        routes.PROVIDERS_VALIDATE_PATH,
        routes.RCA_RULES_PATH,
        routes.RCA_RULES_VALIDATE_PATH,
        routes.RCA_TEST_SCENARIOS_PATH,
        routes.RCA_TEST_RUNS_PATH,
        "/rca/test-runs/{{rca_test_run_id}}",
        routes.METRICS_VALIDATE_PATH,
        routes.DASHBOARD_RCA_TIMELINE_PATH,
        f"{routes.AUDIT_TIMELINE_PATH}?correlation_id=",
        "/rca/incidents/{{incident_id}}/recent-changes",
        "/dashboard/rca/incidents/{{incident_id}}",
        routes.FLEET_SUMMARY_PATH,
        routes.RESOURCES_FILTER_FACETS_PATH,
        routes.FILTERED_RESOURCES_PATH,
        routes.RESOURCE_LABEL_FACETS_PATH,
        routes.RESOURCES_GRAPH_PATH,
        routes.TOPOLOGY_PATH,
        routes.RESOURCE_CAPABILITIES_PATH,
        routes.ISSUES_FILTER_RESULTS_PATH,
        routes.ISSUES_FILTER_FACETS_PATH,
        routes.ISSUES_LABEL_FACETS_PATH,
        routes.APPLICATION_FILTER_RESULTS_PATH,
        routes.APPLICATION_FILTER_FACETS_PATH,
        routes.APPLICATION_LABEL_FACETS_PATH,
        "/clusters/{{cluster_id}}/summary",
        "/clusters/{{cluster_id}}/nodes/summary",
        "/clusters/{{cluster_id}}/nodes/{{node_name}}/pods/summary",
        "/pods/{{namespace}}/{{pod_name}}/logs/stream?cluster_id=",
        "/workloads/deployments/{{namespace}}/{{deployment_name}}/logs/stream?cluster_id=",
        "/metrics",
    ]

    missing = [path for path in expected_paths if path not in collection]

    assert missing == []


def test_every_bruno_request_has_expected_output_assertions() -> None:
    without_tests = [
        path.relative_to(ROOT_DIR).as_posix()
        for path in request_files()
        if "tests {" not in path.read_text(encoding="utf-8")
    ]

    assert without_tests == []


def test_catalog_install_bruno_uses_idempotent_real_command_contract() -> None:
    request = (API_DIR / "12-catalog" / "03-install-item.bru").read_text(encoding="utf-8")

    assert "Idempotency-Key:" in request
    assert '"auth.database": "demo"' in request
    assert "res.status === 202 && body && body.command_id" in request
    assert 'bru.setVar("command_id", body.command_id)' in request
    assert "[202, 400, 401, 403, 404, 409, 422]" in request
    assert "501" not in request


def test_bruno_files_use_importable_v3_syntax() -> None:
    offenders: list[str] = []

    for path in request_files():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT_DIR).as_posix()
        if "\ntest {\n" in text:
            offenders.append(f"{rel}: use tests block")
        if "\nbody {\n" in text:
            offenders.append(f"{rel}: use typed body block")
        if "bru.setEnvVar(" in text:
            offenders.append(f"{rel}: use runtime variable setter")
        if "{{base_url}}/" in text:
            offenders.append(f"{rel}: base_url already includes trailing slash")

    assert offenders == []


def test_bruno_collection_auto_login_is_request_scoped() -> None:
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")

    assert "script:pre-request" in collection
    assert "url: `${baseUrl}/auth/login`" in collection
    assert "bru.sendRequest" in collection
    assert 'sessionCookieName = "service_session"' in collection
    assert "bru.cookies.delete(sessionCookieName)" in collection
    assert 'req.deleteHeader("cookie")' in collection
    assert "new URL(req.getUrl()).pathname" in collection
    assert 'rawPath.replace(/^\\/api(?=\\/)/, "")' in collection
    assert 'req.getHeader("x-agent-token")' in collection
    assert '"/github/webhook"' in collection
    assert '"/webhooks/alertmanager"' in collection
    assert '"/metrics"' in collection
    assert '"/auth/logout"' in collection


def test_bruno_default_runner_skips_explicit_auth_and_rca_mutations() -> None:
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")
    environment = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")
    rca_folder = (API_DIR / "16-rca-debug" / "folder.bru").read_text(encoding="utf-8")
    rca_selection = (API_DIR / "16-rca-debug" / "07-select-recovery-action.bru").read_text(
        encoding="utf-8"
    )

    assert "auth_flow_verification: false" in collection
    assert "auth_flow_verification: false" in environment
    assert 'bru.getEnvVar("rca_test_verification")' in rca_folder
    assert "bru.runner.skipRequest()" in rca_folder
    assert 'bru.getEnvVar("rca_test_verification")' in rca_selection
    assert "if (!enabled)" in rca_selection
    for request_name in (
        "04-signup.bru",
        "05-resend-verification.bru",
        "06-login.bru",
        "08-approve-user.bru",
        "09-verify-email.bru",
        "10-logout.bru",
    ):
        request = (API_DIR / "00-health-auth" / request_name).read_text(encoding="utf-8")
        assert 'bru.getEnvVar("auth_flow_verification")' in request
        assert "bru.runner.skipRequest()" in request


def test_bruno_default_runner_handles_optional_operational_inputs() -> None:
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")
    environment = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")
    email_check = (API_DIR / "15-wizard-validation" / "01-check-email.bru").read_text(
        encoding="utf-8"
    )
    replay = (API_DIR / "08-ops-dlq" / "02-replay-dead-letter.bru").read_text(encoding="utf-8")
    metrics = (API_DIR / "08-ops-dlq" / "03-metrics.bru").read_text(encoding="utf-8")

    assert "check_email: bruno-validation@example.invalid" in collection
    assert "check_email: bruno-validation@example.invalid" in environment
    assert '"email": "{{check_email}}"' in email_check
    assert "!/^\\d+$/.test(deadLetterId)" in replay
    assert "bru.runner.skipRequest()" in replay
    assert "[200, 401, 503]" in metrics


def test_bruno_client_certificate_uses_ignored_portable_paths() -> None:
    config = (API_DIR / "bruno.json").read_text(encoding="utf-8")
    gitignore = (ROOT_DIR / ".gitignore").read_text(encoding="utf-8")

    assert '"certFilePath": ".certs/dev-console.pem"' in config
    assert '"keyFilePath": ".certs/dev-console.key"' in config
    assert "docs/api/.certs/" in gitignore


def test_github_webhook_signature_uses_bruno_safe_crypto_bundle() -> None:
    request = (API_DIR / "06-gitops-approval" / "01-github-webhook.bru").read_text(encoding="utf-8")

    assert 'require("crypto")' not in request
    assert 'require("crypto-js")' in request
    assert "CryptoJS.HmacSHA256(body, secret)" in request


def test_bruno_collection_never_strips_authentication_credentials() -> None:
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")

    assert "dev_security_bypass" not in collection
    assert "x-dev-cluster-id" not in collection
    assert 'req.deleteHeader("authorization")' not in collection
    assert 'req.deleteHeader("x-session-token")' not in collection
    assert 'req.deleteHeader("x-agent-token")' not in collection
    assert "agentRequest;" in collection


def test_bruno_cli_runner_uses_isolated_profile_and_cleans_up_last() -> None:
    runner = (ROOT_DIR / "scripts" / "run-bruno-aws.sh").read_text(encoding="utf-8")
    register_request = (API_DIR / "02-target-admin" / "01-register-target-dry-run.bru").read_text(
        encoding="utf-8"
    )
    cleanup_request = (API_DIR / "11-clusters" / "12-unregister-cluster.bru").read_text(
        encoding="utf-8"
    )

    assert "environments/aws-test.bru" in runner
    assert "BRUNO_ENV_FILE" not in runner
    assert "--env-file" in runner
    assert 'CLIENT_CERT_CONFIG="${BRUNO_CLIENT_CERT_CONFIG:-' in runner
    assert "--client-cert-config" in runner
    assert "@usebruno/cli@3.5.1" in runner
    assert "--dns-result-order=ipv4first" in runner
    assert "--cache-ssl-session" in runner
    assert '--env-var "cluster_id=${RUN_ID}"' in runner
    assert '--env-var "cluster_purge=true"' in runner
    assert '--env-var "signup_email=${RUN_ID}@example.com"' in runner
    assert runner.index("02-target-admin/01-register-target-dry-run.bru") < runner.index(
        "03-agent-runtime"
    )
    assert runner.count("11-clusters/12-unregister-cluster.bru") == 1
    assert "trap cleanup EXIT" in runner
    assert runner.rstrip().endswith("cleanup")
    assert "16-rca-debug" not in runner
    assert '"environment": "test"' in register_request
    assert "purge={{cluster_purge}}" in cleanup_request


def test_bruno_cli_runner_includes_operational_rca_reads_and_readme_handoff() -> None:
    runner = (ROOT_DIR / "scripts" / "run-bruno-aws.sh").read_text(encoding="utf-8")
    readme = (API_DIR / "README.md").read_text(encoding="utf-8")
    requests = (
        "05-rca-dashboard/13-remediation-bundle.bru",
        "05-rca-dashboard/14-audit-timeline.bru",
        "05-rca-dashboard/15-recent-changes.bru",
    )

    positions = [runner.index(request) for request in requests]

    assert positions == sorted(positions)
    assert "`13-remediation-bundle`" in readme
    assert "`14-audit-timeline`" in readme
    assert "`15-recent-changes`" in readme
    assert "실제 200" in readme


def test_rca_e2e_workflow_is_thin_separate_and_explicitly_selected() -> None:
    workflow_dir = API_DIR / "16-rca-debug"
    requests = sorted(workflow_dir.glob("*.bru"))
    names = [path.name for path in requests if path.name != "folder.bru"]
    assert names == [
        "01-list-scenarios.bru",
        "02-start-test-run.bru",
        "03-check-test-run.bru",
        "04-check-built-evidence.bru",
        "05-check-rca-report.bru",
        "06-check-recovery-plan.bru",
        "07-select-recovery-action.bru",
        "08-check-selected-plan.bru",
        "09-cleanup-test-run.bru",
        "10-check-cleanup.bru",
    ]

    start = (workflow_dir / "02-start-test-run.bru").read_text(encoding="utf-8")
    assert '"cluster_id": "{{dev_cluster_id}}"' in start
    assert '"scenario_id": "{{rca_scenario_id}}"' in start
    assert '"kubernetes"' not in start
    assert '"evidence"' not in start
    assert '"manifest"' not in start

    selection = (workflow_dir / "07-select-recovery-action.bru").read_text(encoding="utf-8")
    assert 'SELECT:${bru.getVar("rca_correlation_id")}' in selection
    assert '"expected_plan_id": "{{rca_plan_id}}"' in selection
    assert '"action_id": "{{rca_action_id}}"' in selection
    assert (workflow_dir / "README.md").is_file()


def test_bruno_readme_explains_each_work_type() -> None:
    readme = (API_DIR / "README.md").read_text(encoding="utf-8")
    expected_sections = [
        "API 의미 사전",
        "00-health-auth",
        "01-providers",
        "02-target-admin",
        "03-agent-runtime",
        "04-command",
        "05-rca-dashboard",
        "06-gitops-approval",
        "07-ai",
        "08-ops-dlq",
        "09-management-console",
        "13-alert-channels",
        "15-wizard-validation",
        "정상 출력",
        "GitHub webhook signature",
        "https://dev-k8s.woonyong.org/api/",
        "auto_login",
        "replace-with-auth-email",
        "BRUNO_CLUSTER_ID",
    ]

    missing = [section for section in expected_sections if section not in readme]

    assert missing == []


def test_bruno_display_names_are_korean() -> None:
    collection = bruno_text()
    expected_names = [
        "name: 00 상태와 인증",
        "name: 01 Provider 선택",
        "name: 02 Target 등록과 정책",
        "name: 03 Agent Runtime",
        "name: 04 Command 실행",
        "name: 05 RCA Dashboard",
        "name: 06 GitOps와 승인",
        "name: 07 AI 대화",
        "name: 08 운영과 DLQ",
        "name: 09 관리 콘솔",
        "name: 13 알림 채널",
        "name: 01 상태 확인 healthz",
        "name: 02 준비 상태 readyz",
        "name: 03 OpenAPI 계약 확인",
        "name: 04 사용자 가입 요청",
        "name: 05 이메일 검증 재전송",
        "name: 06 로그인",
        "name: 07 세션 확인",
        "name: 08 사용자 승인",
        "name: 09 이메일 검증",
        "name: 10 로그아웃",
        "name: 01 Provider 목록 조회",
        "name: 02 Provider 선택 검증",
        "name: 01 Target 등록과 Manifest 발급",
        "name: 02 Cluster 정책 수정",
        "name: 03 Agent 설치 Manifest 링크 조회",
        "name: 01 Agent 연결 보고",
        "name: 02 Agent 정책 조회",
        "name: 03 정책 적용 상태 보고",
        "name: 04 Reconcile 상태 보고",
        "name: 05 Evidence Job 예약",
        "name: 06 Evidence Job 가져가기",
        "name: 07 Evidence Job 결과 제출",
        "name: 08 Evidence 직접 제출",
        "name: 01 수동 Command 요청",
        "name: 02 Agent Debug Query 요청",
        "name: 03 Agent Command 가져가기",
        "name: 04 Command 시작 보고",
        "name: 05 Command Heartbeat",
        "name: 06 Command 결과 제출",
        "name: 01 RCA Timeline 조회",
        "name: 02 RCA Incident 상세 조회",
        "name: 04 Alertmanager Webhook 수신",
        "name: 01 GitHub Webhook 수신",
        "name: 02 Approval 승인",
        "name: 03 Approval 거절",
        "name: 01 AI 대화 생성",
        "name: 02 AI 대화 상세 조회",
        "name: 03 AI 메시지 추가",
        "name: 04 AI 대화 목록 조회",
        "name: 05 AI 대화 삭제",
        "name: 06 근거 기반 AI 채팅",
        "name: 07 맥락 기반 AI 제안",
        "name: 08 AI 리소스 목록",
        "name: 09 AI 리소스 상세",
        "name: 01 Dead Letter 목록 조회",
        "name: 02 Dead Letter 재처리",
        "name: 03 Gateway Metrics 조회",
        "name: 01 조직 목록 조회",
        "name: 02 조직 생성",
        "name: 03 조직 삭제",
        "name: 04 사용자 목록 조회",
        "name: 05 그룹 목록 조회",
        "name: 06 그룹 생성",
        "name: 07 그룹 멤버 목록 조회",
        "name: 08 그룹 멤버 추가",
        "name: 09 그룹 멤버 제거",
        "name: 10 권한 목록 조회",
        "name: 11 권한 부여",
        "name: 12 권한 회수",
        "name: 01 알림 채널 목록 조회",
        "name: 02 알림 채널 생성 또는 수정",
        "name: 03 알림 채널 삭제",
        "name: 11 클러스터 Usage 시계열 조회",
    ]
    missing = [name for name in expected_names if name not in collection]

    assert missing == []
    assert "name: 02 Validate Provider Selection" not in collection
