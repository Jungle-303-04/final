"""sync DB 를 async 로 감싸 이벤트 루프 비차단.

sync 메서드는 스레드풀(asyncio.to_thread)로, 이미 async 인 메서드는 그대로 await.
워커는 항상 `await ctx.db.x(...)` 한 가지로 호출.
"""

from __future__ import annotations

import asyncio
import inspect
from typing import Any


class AsyncDb:
    def __init__(self, db: Any) -> None:
        self._db = db

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._db, name)
        if not callable(attr) or inspect.iscoroutinefunction(attr):
            return attr

        async def call(*args: Any, **kwargs: Any) -> Any:
            return await asyncio.to_thread(attr, *args, **kwargs)

        return call
