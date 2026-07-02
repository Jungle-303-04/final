from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from packages.contracts.event_bus.interfaces import JsonObject

COMMAND_ACTION_ATTRIBUTE = "__target_agent_command_action__"

CommandHandler = Callable[[JsonObject], Awaitable[JsonObject]]


class AgentCommandRegistry:
    def __init__(self, default_handler: CommandHandler) -> None:
        self.default_handler = default_handler
        self.handlers: dict[str, CommandHandler] = {}

    @classmethod
    def from_instance(
        cls,
        instance: object,
        *,
        default_handler: CommandHandler,
    ) -> AgentCommandRegistry:
        registry = cls(default_handler)
        for attribute_name in dir(instance):
            handler = getattr(instance, attribute_name)
            action = command_action(handler)
            if action is not None:
                registry.register(action, handler)
        return registry

    def register(self, action: str, handler: CommandHandler) -> None:
        if action in self.handlers:
            raise ValueError(f"duplicate target-agent command handler: {action}")
        self.handlers[action] = handler

    async def execute(self, action: str, payload: JsonObject) -> JsonObject:
        handler = self.handlers.get(action, self.default_handler)
        return await handler(payload)


def command_handler(action: str) -> Callable[[CommandHandler], CommandHandler]:
    def decorate(handler: CommandHandler) -> CommandHandler:
        setattr(handler, COMMAND_ACTION_ATTRIBUTE, action)
        return handler

    return decorate


def command_action(handler: Any) -> str | None:
    action = getattr(handler, COMMAND_ACTION_ATTRIBUTE, None)
    if isinstance(action, str):
        return action
    wrapped = getattr(handler, "__func__", None)
    wrapped_action = getattr(wrapped, COMMAND_ACTION_ATTRIBUTE, None)
    return wrapped_action if isinstance(wrapped_action, str) else None
