"""realtime gateway 주소 규칙."""

from __future__ import annotations

from urllib.parse import urlsplit

DEFAULT_REALTIME_GATEWAY_NODEPORT = 30090  # legacy local-up manifest compatibility
MANAGEMENT_REALTIME_GATEWAY_URL = "ws://realtime-gateway.management.svc.cluster.local:8000"


def derive_realtime_gateway_url(
    management_base_url: str,
    *,
    management_cluster: bool = False,
) -> str:
    """관리 API 주소에서 agent 전용 WebSocket 주소를 계산한다."""
    if management_cluster and not management_base_url.strip():
        return MANAGEMENT_REALTIME_GATEWAY_URL

    parts = urlsplit(management_base_url)
    if not parts.hostname:
        return ""

    if parts.scheme not in {"http", "https"}:
        return ""
    host = f"[{parts.hostname}]" if ":" in parts.hostname else parts.hostname
    default_port = 443 if parts.scheme == "https" else 80
    suffix = f":{parts.port}" if parts.port not in {None, default_port} else ""
    path = parts.path.rstrip("/")
    scheme = "wss" if parts.scheme == "https" else "ws"
    return f"{scheme}://{host}{suffix}{path}"
