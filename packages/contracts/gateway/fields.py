from __future__ import annotations

from enum import StrEnum


class Gateway(StrEnum):
    """Gateway 요청/응답·payload의 필드 이름.

    StrEnum 이라 dict 인덱싱(d[Gateway.STATUS])과 json 직렬화에서
    문자열 값으로 자동 동작.
    """

    ACCEPTED = "accepted"
    ACCOUNT = "account"
    ACTION = "action"
    AGENT_ID = "agent_id"
    APPLIED = "applied"
    AUTHORIZATION_URL = "authorization_url"
    AUTHENTICATED = "authenticated"
    CAPABILITIES = "capabilities"
    CARDS = "cards"
    CLUSTER_ID = "cluster_id"
    COMMAND = "command"
    COMMAND_ID = "command_id"
    CORRELATION_ID = "correlation_id"
    DEAD_LETTER_ID = "dead_letter_id"
    DEAD_LETTERS = "dead_letters"
    ERROR = "error"
    EVENT = "event"
    EVENT_ID = "event_id"
    MESSAGE = "message"
    NAMESPACE = "namespace"
    PAYLOAD = "payload"
    PROVIDER = "provider"
    PROVIDER_USER = "provider_user"
    REPLAY_EVENT = "replay_event"
    REQUESTED_BY = "requested_by"
    RESULT = "result"
    ROLES = "roles"
    SCOPES = "scopes"
    SERVICE = "service"
    SESSION = "session"
    SESSION_TOKEN = "session_token"
    STATE = "state"
    STATUS = "status"
    STATUS_CONNECTED = "connected"
    STATUS_OK = "ok"
    STATUS_OPEN = "open"
    STATUS_READY = "ready"
    STATUS_REPLAYED = "replayed"
    TOKEN_REF = "token_ref"
    USER_ID = "user_id"
