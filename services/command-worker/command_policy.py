from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

from settings import Settings

from packages.config.constants import Sandbox, Target
from packages.contracts.gateway.fields import Gateway


class Field:
    REASON: Final[str] = "reason"
    REQUESTED: Final[str] = "requested"


@dataclass(frozen=True)
class CommandPayload:
    raw: dict[str, Any]

    def value(self, field: str, default: Any = None) -> Any:
        return self.raw.get(field, default)

    @property
    def namespace(self) -> str:
        return self.value(Gateway.NAMESPACE, Sandbox.NAMESPACE)

    @property
    def cluster_id(self) -> str:
        return self.value(Gateway.CLUSTER_ID, Target.DEFAULT_CLUSTER_ID)

    @property
    def action(self) -> str:
        return self.value(Gateway.ACTION, Settings.DEFAULT_COMMAND_ACTION)

    def rejected_payload(self, reason: str) -> dict[str, Any]:
        return {
            Field.REASON: reason,
            Field.REQUESTED: self.raw,
        }


@dataclass(frozen=True)
class PolicyRule:
    name: str
    field: str
    expected: Any
    reason: str
    default: Any = None

    def allows(self, command: CommandPayload) -> bool:
        return command.value(self.field, self.default) == self.expected


@dataclass(frozen=True)
class PolicyResult:
    allowed: bool
    reason: str | None = None

    @classmethod
    def allow(cls) -> PolicyResult:
        return cls(True)

    @classmethod
    def reject(cls, reason: str) -> PolicyResult:
        return cls(False, reason)


class CommandPolicy:
    def __init__(self, rules: tuple[PolicyRule, ...] | None = None) -> None:
        self.rules = rules or (
            PolicyRule(
                name=Settings.SANDBOX_NAMESPACE_POLICY_NAME,
                field=Gateway.NAMESPACE,
                expected=Sandbox.NAMESPACE,
                default=Sandbox.NAMESPACE,
                reason=Settings.SANDBOX_WRITE_REJECT_REASON,
            ),
        )

    def evaluate(self, command: CommandPayload) -> PolicyResult:
        for rule in self.rules:
            if not rule.allows(command):
                return PolicyResult.reject(rule.reason)
        return PolicyResult.allow()
