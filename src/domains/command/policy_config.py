from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PolicyRuleConfig:
    name: str
    field: str
    expected: Any
    reason: str
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
    policy_rules: tuple[PolicyRuleConfig, ...]
