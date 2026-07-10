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

    assert "base_url: https://k8s.woonyong.org/api/" in collection
    assert "auto_login: false" in collection
    assert "auth_email: replace-with-auth-email" in collection
    assert "auth_password: replace-with-auth-password" in collection
    assert "\n  cluster_id: api-verification-target\n" in collection

    assert environment_files == ["aws-test.bru"]
    assert "base_url: https://k8s.woonyong.org/api/" in aws
    assert "management_base_url: https://k8s.woonyong.org/api/" in aws
    assert "auto_login: false" in aws
    assert "auth_email: replace-with-auth-email" in aws
    assert "auth_password: replace-with-auth-password" in aws
    assert "\n  cluster_id: api-verification-target\n" in aws

    assert "base_url:" in aws
    assert "auto_login:" in aws
    assert "dev_security_bypass: true" in aws
    assert "dev_cluster_id:" in aws
    assert "auth_email:" in aws
    assert "agent_token:" in aws
    assert "cluster_id:" in aws
    assert "alert_channel_id:" in aws
    assert "alertmanager_token:" in aws
    assert "github_webhook_signature:" in aws


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
        "/applications/{{application_id}}/runs",
        routes.REPOSITORY_DISCOVERY_PROBE_PATH,
        f"{routes.REPOSITORY_DISCOVERY_BRANCHES_PATH}?repo_ref=",
        f"{routes.REPOSITORY_DISCOVERY_MANIFESTS_PATH}?repo_ref=",
        routes.REPOSITORY_DISCOVERY_VALIDATE_PATH,
        routes.REPOS_VALIDATE_PATH,
        f"{routes.REPOS_BRANCHES_PATH}?repo=",
        f"{routes.REPOS_MANIFESTS_PATH}?repo=",
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
        routes.RCA_RULES_VALIDATE_PATH,
        routes.METRICS_VALIDATE_PATH,
        routes.DASHBOARD_RCA_TIMELINE_PATH,
        "/dashboard/rca/incidents/{{incident_id}}",
        routes.FLEET_SUMMARY_PATH,
        "/clusters/{{cluster_id}}/summary",
        "/clusters/{{cluster_id}}/nodes/summary",
        "/clusters/{{cluster_id}}/nodes/{{node_name}}/pods/summary",
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


def test_bruno_test_profile_removes_session_and_agent_tokens() -> None:
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")

    assert 'readVar("dev_security_bypass", "false")' in collection
    assert 'req.deleteHeader("authorization")' in collection
    assert 'req.deleteHeader("x-session-token")' in collection
    assert 'req.deleteHeader("x-agent-token")' in collection
    assert 'req.setHeader("x-dev-cluster-id", devClusterId)' in collection
    assert "securityBypass ||" in collection


def test_bruno_cli_runner_uses_isolated_profile_and_cleans_up_last() -> None:
    runner = (ROOT_DIR / "scripts" / "run-bruno-aws.sh").read_text(encoding="utf-8")

    assert "environments/aws-test.bru" in runner
    assert "BRUNO_ENV_FILE" not in runner
    assert "--env-file" in runner
    assert "@usebruno/cli@3.5.1" in runner
    assert "--dns-result-order=ipv4first" in runner
    assert "--cache-ssl-session" in runner
    assert '--env-var "cluster_id=${RUN_ID}"' in runner
    assert '--env-var "signup_email=${RUN_ID}@example.com"' in runner
    assert runner.index("02-target-admin/01-register-target-dry-run.bru") < runner.index(
        "03-agent-runtime"
    )
    assert runner.count("11-clusters/12-unregister-cluster.bru") == 1
    assert "trap cleanup EXIT" in runner
    assert runner.rstrip().endswith("cleanup")


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
        "https://k8s.woonyong.org/api/",
        "auto_login",
        "replace-with-auth-email",
        "BRUNO_CLUSTER_ID",
    ]

    missing = [section for section in expected_sections if section not in readme]

    assert missing == []


def test_github_webhook_signature_fixture_matches_bruno_body() -> None:
    body_fixture = (API_DIR / "06-gitops-approval" / "github-webhook-body.json").read_text(
        encoding="utf-8"
    )
    request = (API_DIR / "06-gitops-approval" / "01-github-webhook.bru").read_text(encoding="utf-8")

    assert '"workspace_id": "default"' in body_fixture
    assert '"workspace_id": "default"' in request
    assert '"cluster_id": "{{cluster_id}}"' in body_fixture
    assert '"cluster_id": "{{cluster_id}}"' in request


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
