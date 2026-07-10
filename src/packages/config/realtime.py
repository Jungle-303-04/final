"""realtime gateway 주소 규칙."""

from __future__ import annotations

from urllib.parse import urlsplit

DEFAULT_REALTIME_GATEWAY_NODEPORT = 30090
MANAGEMENT_REALTIME_GATEWAY_URL = "ws://realtime-gateway.management.svc.cluster.local:8000"


def derive_realtime_gateway_url(
    management_base_url: str,
    *,
    management_cluster: bool = False,
) -> str:
    """관리 API 주소에서 agent 전용 WebSocket 주소를 계산한다."""
    if management_cluster:
        return MANAGEMENT_REALTIME_GATEWAY_URL

    parts = urlsplit(management_base_url)
    if not parts.hostname:
        return ""

    host = f"[{parts.hostname}]" if ":" in parts.hostname else parts.hostname
    if parts.scheme == "https":
        port = parts.port
        suffix = f":{port}" if port not in {None, 443} else ""
        return f"wss://{host}{suffix}"
    return f"ws://{host}:{DEFAULT_REALTIME_GATEWAY_NODEPORT}"
