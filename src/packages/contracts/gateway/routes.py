from __future__ import annotations

HEALTHZ_PATH = "/healthz"
READYZ_PATH = "/readyz"
AUTH_SESSION_PATH = "/auth/session"
AUTH_SIGNUP_PATH = "/auth/signup"
AUTH_LOGIN_PATH = "/auth/login"
AUTH_LOGOUT_PATH = "/auth/logout"
AUTH_VERIFY_EMAIL_PATH = "/auth/verify-email"
AUTH_RESEND_VERIFICATION_PATH = "/auth/resend-verification"
AUTH_APPROVE_USER_PATH = "/auth/users/{user_id}/approve"
GITHUB_WEBHOOK_PATH = "/github/webhook"
AGENT_CONNECT_PATH = "/agent/connect"
AGENT_EVIDENCE_PATH = "/agent/evidence"
TARGETS_PATH = "/targets"
COMMANDS_PATH = "/commands"
DEAD_LETTERS_PATH = "/dead-letters"
DEAD_LETTER_REPLAY_PATH = "/dead-letters/{dead_letter_id}/replay"
AGENT_COMMAND_POLL_PATH = "/agent/commands/poll"
AGENT_COMMAND_START_PATH = "/agent/commands/{command_id}/start"
AGENT_COMMAND_HEARTBEAT_PATH = "/agent/commands/{command_id}/heartbeat"
AGENT_COMMAND_RESULT_PATH = "/agent/commands/{command_id}/result"
AGENT_EVIDENCE_SOURCE_LEASE_PATH = "/agent/evidence-sources/{source_id}/lease"
DASHBOARD_QUERY_PATH = "/dashboard/query"
DASHBOARD_STREAM_PATH = "/dashboard/stream"
FAKE_TELEMETRY_CATCH_ALL_PATH = "/{path:path}"


def agent_command_result_path(command_id: str) -> str:
    return AGENT_COMMAND_RESULT_PATH.format(command_id=command_id)


def agent_command_start_path(command_id: str) -> str:
    return AGENT_COMMAND_START_PATH.format(command_id=command_id)


def agent_command_heartbeat_path(command_id: str) -> str:
    return AGENT_COMMAND_HEARTBEAT_PATH.format(command_id=command_id)


def agent_evidence_source_lease_path(source_id: str) -> str:
    return AGENT_EVIDENCE_SOURCE_LEASE_PATH.format(source_id=source_id)
