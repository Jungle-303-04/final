from __future__ import annotations

from services.ai.agent.rulekit.discovery import load_rule_modules
from services.ai.agent.rulekit.recovery import registered_recovery_rules

load_rule_modules(
    package_name="services.ai.agent.recovery",
    excluded=("catalog", "engine", "select", "dispatch"),
)

__all__ = ["registered_recovery_rules"]
