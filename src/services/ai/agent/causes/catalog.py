from __future__ import annotations

from services.ai.agent.rulekit.cause import cause_rules, evidence_rules
from services.ai.agent.rulekit.discovery import load_rule_modules

load_rule_modules(
    package_name="services.ai.agent.causes",
    excluded=("catalog", "engine"),
)

__all__ = ["cause_rules", "evidence_rules"]
