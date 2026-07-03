"""sync DB 를 async 로 감싸 호출 방식을 통일.

일반 sync 메서드는 스레드풀(asyncio.to_thread)로 실행함. 다만 worker UoW 안에서는
ContextVar 의 active SQLAlchemy connection 을 재사용하므로 같은 스레드에서 실행함.
워커는 항상 `await ctx.db.x(...)` 한 가지로 호출함.
"""

from __future__ import annotations

import asyncio
import inspect
from typing import Any

from packages.storage.engine import has_active_connection


class AsyncDb:
    def __init__(self, db: Any) -> None:
        self._db = db

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._db, name)
        if not callable(attr) or inspect.iscoroutinefunction(attr):
            return attr

        async def call(*args: Any, **kwargs: Any) -> Any:
            if has_active_connection():
                return attr(*args, **kwargs)
            return await asyncio.to_thread(attr, *args, **kwargs)

        return call
