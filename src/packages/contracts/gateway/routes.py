from __future__ import annotations

HEALTHZ_PATH = "/healthz"
READYZ_PATH = "/readyz"
AUTH_SESSION_PATH = "/auth/session"
OAUTH_START_PATH = "/auth/oauth/{provider}/start"
OAUTH_CALLBACK_PATH = "/auth/oauth/{provider}/callback"
GITHUB_WEBHOOK_PATH = "/github/webhook"
AGENT_CONNECT_PATH = "/agent/connect"
AGENT_EVIDENCE_PATH = "/agent/evidence"
COMMANDS_PATH = "/commands"
DEAD_LETTERS_PATH = "/dead-letters"
DEAD_LETTER_REPLAY_PATH = "/dead-letters/{dead_letter_id}/replay"
AGENT_COMMAND_POLL_PATH = "/agent/commands/poll"
AGENT_COMMAND_START_PATH = "/agent/commands/{command_id}/start"
AGENT_COMMAND_RESULT_PATH = "/agent/commands/{command_id}/result"
DASHBOARD_QUERY_PATH = "/dashboard/query"
DASHBOARD_STREAM_PATH = "/dashboard/stream"
FAKE_TELEMETRY_CATCH_ALL_PATH = "/{path:path}"


def agent_command_result_path(command_id: str) -> str:
    return AGENT_COMMAND_RESULT_PATH.format(command_id=command_id)


def agent_command_start_path(command_id: str) -> str:
    return AGENT_COMMAND_START_PATH.format(command_id=command_id)
