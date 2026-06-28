"""outbound 게이트웨이 정형.

외부(GitHub/HTTP/...)로 나가는 워커의 공통 모양:
    *.requested  →  외부 호출  →  *.delivered(성공) / *.failed(실패)

deliver() 가 try/except 를 한 곳에 모아, 게이트웨이 핸들러는 "무엇을 호출하고
성공/실패를 어떤 이벤트로 낼지"만 선언하면 된다.
"""

from __future__ import annotations

import asyncio
import json
import urllib.request
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Protocol

from packages.config.settings import env


async def deliver(call: Callable[[], Awaitable[Any]], ok: Callable[[Any], Any], fail: Callable[[Exception], Any]) -> AsyncIterator[Any]:
    """외부 호출 1회 → 성공이면 ok(결과), 실패면 fail(예외) body 발행."""
    try:
        result = await call()
    except Exception as exc:  # noqa: BLE001 - 외부 호출은 무엇이든 실패 가능
        yield fail(exc)
        return
    yield ok(result)


class Outbound(Protocol):
    """외부 호출 어댑터. 테스트는 가짜로 교체."""

    async def post(self, path: str, body: dict[str, Any]) -> int: ...


class HttpOutbound:
    """기본 어댑터 — base_url + path 로 JSON POST(stdlib)."""

    BASE_URL_ENV = "DEMO_CALLBACK_BASE_URL"
    DEFAULT_BASE_URL = "http://api-gateway:8000"
    TIMEOUT_SECONDS = 5

    def __init__(self, base_url: str | None = None) -> None:
        default = env(self.BASE_URL_ENV, self.DEFAULT_BASE_URL)
        self.base_url = base_url or default

    async def post(self, path: str, body: dict[str, Any]) -> int:
        url = f"{self.base_url}{path}"

        def _post() -> int:
            request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(  # noqa: S310 - 내부 콜백 URL
                request, timeout=self.TIMEOUT_SECONDS
            ) as response:
                return int(response.status)

        return await asyncio.to_thread(_post)
