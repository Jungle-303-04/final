from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final, Protocol

from command_config import PolicyRuleConfig

from packages.contracts.gateway.fields import Gateway


class Field:
    REASON: Final[str] = "reason"
    REQUESTED: Final[str] = "requested"


@dataclass(frozen=True)
class Payload:
    raw: dict[str, Any]

    def value(self, field: str, default: Any = None) -> Any:
        return self.raw.get(field, default)

    @property
    def namespace(self) -> str | None:
        return self.value(Gateway.NAMESPACE)

    @property
    def cluster_id(self) -> str | None:
        return self.value(Gateway.CLUSTER_ID)

    @property
    def action(self) -> str | None:
        return self.value(Gateway.ACTION)

    def rejected_event_payload(self, reason: str) -> dict[str, Any]:
        return {
            Field.REASON: reason,
            Field.REQUESTED: self.raw,
        }


class Rule(Protocol):
    reason: str

    def allows(self, command: Payload) -> bool: ...


@dataclass(frozen=True)
class EqualsRule:
    name: str
    field: str
    expected: Any
    reason: str
    default: Any = None

    def allows(self, command: Payload) -> bool:
        return command.value(self.field, self.default) == self.expected

    @classmethod
    def build(cls, config: PolicyRuleConfig) -> EqualsRule:
        return cls(
            name=config.name,
            field=config.field,
            expected=config.expected,
            reason=config.reason,
            default=config.default,
        )


@dataclass(frozen=True)
class Result:
    allowed: bool
    reason: str | None = None

    @classmethod
    def allow(cls) -> Result:
        return cls(True)

    @classmethod
    def reject(cls, reason: str) -> Result:
        return cls(False, reason)

    def require_reason(self) -> str:
        if self.reason is None:
            raise ValueError("policy rejection requires reason")
        return self.reason


class PolicyPort(Protocol):
    def evaluate(self, command: Payload) -> Result: ...


class Policy:
    def __init__(self, rules: Sequence[Rule]) -> None:
        self.rules: tuple[Rule, ...] = tuple(rules)

    @classmethod
    def build(cls, configs: tuple[PolicyRuleConfig, ...]) -> Policy:
        rules: list[Rule] = [EqualsRule.build(config) for config in configs]
        return cls(rules)

    def evaluate(self, command: Payload) -> Result:
        for rule in self.rules:
            if not rule.allows(command):
                return Result.reject(rule.reason)
        return Result.allow()
