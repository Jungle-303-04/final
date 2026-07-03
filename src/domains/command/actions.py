from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class CommandActionSpec:
    action: str
    recovery_aliases: tuple[str, ...] = ()

    def matches_recovery_action(self, value: str) -> bool:
        return value == self.action or value in self.recovery_aliases


COMMAND_ACTIONS: list[CommandActionSpec] = []


def command_action(
    action: str,
    *,
    recovery_aliases: tuple[str, ...] = (),
) -> Callable[[type], type]:
    def decorator(marker: type) -> type:
        COMMAND_ACTIONS.append(CommandActionSpec(action, recovery_aliases))
        return marker

    return decorator


def registered_command_actions() -> tuple[CommandActionSpec, ...]:
    import domains.command.builtin_actions  # noqa: F401

    return tuple(COMMAND_ACTIONS)


def allowed_command_actions() -> tuple[str, ...]:
    return tuple(spec.action for spec in registered_command_actions())


def command_action_for_recovery(value: str) -> str | None:
    for spec in registered_command_actions():
        if spec.matches_recovery_action(value):
            return spec.action
    return None
