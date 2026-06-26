from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final, Protocol

from settings import PolicyRuleConfig

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
        return self.value(Gateway.ACTION)

    def rejected_payload(self, reason: str) -> dict[str, Any]:
        return {
            Field.REASON: reason,
            Field.REQUESTED: self.raw,
        }


class Rule(Protocol):
    reason: str

    def allows(self, command: CommandPayload) -> bool: ...


@dataclass(frozen=True)
class EqualsRule:
    name: str
    field: str
    expected: Any
    reason: str
    default: Any = None

    def allows(self, command: CommandPayload) -> bool:
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

    @classmethod
    def from_config(cls, config: PolicyRuleConfig) -> EqualsRule:
        return cls.build(config)


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


class Evaluator(Protocol):
    def evaluate(self, command: CommandPayload) -> PolicyResult: ...


PolicyRule = Rule
FieldEqualsRule = EqualsRule
CommandPolicyPort = Evaluator


class CommandPolicy:
    def __init__(self, rules: Sequence[Rule]) -> None:
        self.rules: tuple[Rule, ...] = tuple(rules)

    @classmethod
    def build(cls, configs: tuple[PolicyRuleConfig, ...]) -> CommandPolicy:
        rules: list[Rule] = [EqualsRule.build(config) for config in configs]
        return cls(rules)

    @classmethod
    def from_config(cls, configs: tuple[PolicyRuleConfig, ...]) -> CommandPolicy:
        return cls.build(configs)

    def evaluate(self, command: CommandPayload) -> PolicyResult:
        for rule in self.rules:
            if not rule.allows(command):
                return PolicyResult.reject(rule.reason)
        return PolicyResult.allow()
