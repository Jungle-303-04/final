from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol, cast

from packages.config.errors import require

DEFAULT_COMMAND_LEASE_SECONDS = 60
DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS = 20
DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS = 3
DEFAULT_COMMAND_RETRY_DELAY_SECONDS = 5


@dataclass(frozen=True)
class PolicyRuleConfig:
    name: str
    field: str
    reason: str
    expected: Any | None = None
    allowed_values: tuple[Any, ...] = ()
    default: Any = None


@dataclass(frozen=True)
class CommandConfig:
    service_name: str
    agent_route_channel: str
    policy_steps: tuple[str, ...]
    default_namespace: str
    default_cluster_id: str
    default_command_action: str
    command_status_queued: str
    lease_seconds: int
    heartbeat_interval_seconds: int
    retry_max_attempts: int
    retry_delay_seconds: int
    required_agent_capability: str
    policy_rules: tuple[PolicyRuleConfig, ...]


class Lookup(Protocol):
    """이름으로 값 읽기. 룰은 dict 가 아니라 이 인터페이스에 의존."""

    def value(self, field: str, default: Any = None) -> Any: ...


@dataclass(frozen=True)
class ModelLookup:
    """속성(model) 기반 Lookup 구현 (Pydantic/dataclass body)."""

    model: Any

    def value(self, field: str, default: Any = None) -> Any:
        return getattr(self.model, field, default)


class Rule(Protocol):
    reason: str

    def allows(self, target: Lookup) -> bool: ...


@dataclass(frozen=True)
class EqualsRule:
    name: str
    field: str
    expected: Any
    reason: str
    default: Any = None

    def allows(self, target: Lookup) -> bool:
        return target.value(self.field, self.default) == self.expected

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
class AllowedValuesRule:
    name: str
    field: str
    allowed_values: tuple[Any, ...]
    reason: str
    default: Any = None

    def allows(self, target: Lookup) -> bool:
        return target.value(self.field, self.default) in self.allowed_values

    @classmethod
    def build(cls, config: PolicyRuleConfig) -> AllowedValuesRule:
        return cls(
            name=config.name,
            field=config.field,
            allowed_values=config.allowed_values,
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
        require(self.reason is not None, "정책 거부에 reason 필요")
        assert self.reason is not None  # require 가 보장(타입체커 내로잉)
        return self.reason


class Policy:
    def __init__(self, rules: Sequence[Rule]) -> None:
        self.rules: tuple[Rule, ...] = tuple(rules)

    @classmethod
    def build(cls, configs: tuple[PolicyRuleConfig, ...]) -> Policy:
        rules: list[Rule] = []
        for config in configs:
            if config.allowed_values:
                rules.append(cast(Rule, AllowedValuesRule.build(config)))
                continue
            rules.append(cast(Rule, EqualsRule.build(config)))
        return cls(rules)

    def evaluate(self, target: Lookup) -> Result:
        for rule in self.rules:
            if not rule.allows(target):
                return Result.reject(rule.reason)
        return Result.allow()
