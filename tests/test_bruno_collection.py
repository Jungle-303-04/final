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


def test_bruno_collection_has_expected_root_and_profiles() -> None:
    assert (API_DIR / "bruno.json").is_file()
    assert (API_DIR / "README.md").is_file()
    collection = (API_DIR / "collection.bru").read_text(encoding="utf-8")

    local = (API_DIR / "environments" / "local.bru").read_text(encoding="utf-8")
    aws = (API_DIR / "environments" / "aws-test.bru").read_text(encoding="utf-8")

    assert "base_url: https://k8s.woonyong.org/" in collection
    assert "auth_email: admin.local@example.com" in collection
    assert "auth_password: local-test-password-1234" in collection
    assert "cluster_id: cluster-1" in collection

    assert "base_url: http://localhost:18080/" in local
    assert "auth_email: admin.local@example.com" in local
    assert "auth_password: local-test-password-1234" in local
    assert "cluster_id: target" in local
    assert "base_url: https://k8s.woonyong.org/" in aws
    assert "management_base_url: https://k8s.woonyong.org/" in aws
    assert "auth_email: admin.local@example.com" in aws
    assert "auth_password: local-test-password-1234" in aws
    assert "cluster_id: cluster-1" in aws

    for env_text in (local, aws):
        assert "base_url:" in env_text
        assert "auth_email:" in env_text
        assert "agent_token:" in env_text
        assert "cluster_id:" in env_text
        assert "alert_channel_id:" in env_text
        assert "alertmanager_token:" in env_text
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
        routes.PROVIDERS_VALIDATE_PATH,
        routes.DASHBOARD_RCA_TIMELINE_PATH,
        "/dashboard/rca/incidents/{{incident_id}}",
        routes.FLEET_SUMMARY_PATH,
        "/clusters/{{cluster_id}}/summary",
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
        "09-management-console",
        "13-alert-channels",
        "정상 출력",
        "GitHub webhook signature",
        "https://k8s.woonyong.org/",
        "admin.local@example.com",
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
