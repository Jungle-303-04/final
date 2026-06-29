"""의존성 기동 대기 — nats·postgres 등이 뜰 때까지 재시도하는 공용 헬퍼."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from packages.config.errors import fail

DEPENDENCY_RETRY_LIMIT = 60
DEPENDENCY_RETRY_DELAY_SECONDS = 2


async def retry_dependency(
    attempt: Callable[[], Awaitable[None]],
    *,
    label: str,
    limit: int = DEPENDENCY_RETRY_LIMIT,
    delay: int = DEPENDENCY_RETRY_DELAY_SECONDS,
) -> None:
    """attempt 가 성공할 때까지 limit 회 재시도(간격 delay). 끝내 실패하면 fail 로 종료."""
    for i in range(limit):
        try:
            await attempt()
            return
        except Exception as exc:
            print(f"waiting for {label} ({i + 1}/{limit}): {exc}", flush=True)
            await asyncio.sleep(delay)
    fail(f"{label} 연결 실패")
