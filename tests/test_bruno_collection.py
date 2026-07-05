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
        if path.name != "folder.bru" and "environments" not in path.parts
    ]


def test_bruno_collection_has_expected_root_and_profiles() -> None:
    assert (API_DIR / "bruno.json").is_file()
    assert (API_DIR / "README.md").is_file()

    local = (API_DIR / "environments" / "local.bru").read_text(encoding="utf-8")
    aws = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")

    assert "base_url: http://localhost:18080/" in local
    assert "auth_email: admin.local@example.com" in local
    assert "auth_password: local-test-password-1234" in local
    assert "cluster_id: target" in local
    assert "base_url: replace-with-aws-gateway-base-url/" in aws
    assert "https://k8s.woonyong.org/" not in aws

    for env_text in (local, aws):
        assert "base_url:" in env_text
        assert "auth_email:" in env_text
        assert "agent_token:" in env_text
        assert "cluster_id:" in env_text
        assert "github_webhook_signature:" in env_text


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
        f"{routes.AUTH_VERIFY_EMAIL_PATH}?token=",
        "/auth/users/{{user_id}}/approve",
        routes.AUTH_RESEND_VERIFICATION_PATH,
        routes.GITHUB_WEBHOOK_PATH,
        routes.AGENT_CONNECT_PATH,
        routes.AGENT_EVIDENCE_PATH,
        routes.TARGETS_PATH,
        routes.COMMANDS_PATH,
        "/approvals/{{approval_id}}/grant",
        "/approvals/{{approval_id}}/reject",
        routes.DEAD_LETTERS_PATH,
        "/dead-letters/{{dead_letter_id}}/replay",
        routes.AI_CONVERSATIONS_PATH,
        "/ai/conversations/{{conversation_id}}",
        "/ai/conversations/{{conversation_id}}/messages",
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
        "/clusters/{{cluster_id}}/policy",
        routes.PROVIDERS_CATALOG_PATH,
        routes.PROVIDERS_VALIDATE_PATH,
        routes.DASHBOARD_RCA_TIMELINE_PATH,
        "/dashboard/rca/incidents/{{incident_id}}",
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
        "정상 출력",
        "GitHub webhook signature",
        "고정 도메인을 기본값으로 두지 않고",
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
