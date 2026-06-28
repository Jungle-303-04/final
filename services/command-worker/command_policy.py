from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from command_config import PolicyRuleConfig


class Lookup(Protocol):
    """이름으로 값을 읽는다. 룰은 dict 가 아니라 이 인터페이스에 의존한다."""

    def value(self, field: str, default: Any = None) -> Any: ...


@dataclass(frozen=True)
class Payload:
    """dict 기반 Lookup 구현 (command 이벤트 payload)."""

    raw: dict[str, Any]

    def value(self, field: str, default: Any = None) -> Any:
        return self.raw.get(field, default)


@dataclass(frozen=True)
class ModelLookup:
    """속성(model) 기반 Lookup 구현 (Pydantic/dataclass payload)."""

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
            raise ValueError("정책 거부에는 reason 이 필요하다")
        return self.reason


class Policy:
    def __init__(self, rules: Sequence[Rule]) -> None:
        self.rules: tuple[Rule, ...] = tuple(rules)

    @classmethod
    def build(cls, configs: tuple[PolicyRuleConfig, ...]) -> Policy:
        rules: list[Rule] = [EqualsRule.build(config) for config in configs]
        return cls(rules)

    def evaluate(self, target: Lookup) -> Result:
        for rule in self.rules:
            if not rule.allows(target):
                return Result.reject(rule.reason)
        return Result.allow()
