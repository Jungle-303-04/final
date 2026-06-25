from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Protocol

Event = dict[str, Any]
EventHandler = Callable[[Event], Awaitable[None]]


class HandlesEvent(Protocol):
    async def handle(self, evt: Event) -> None: ...
