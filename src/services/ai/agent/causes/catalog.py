from __future__ import annotations

from services.ai.agent.playbooks.cause import cause_rules, evidence_rules
from services.ai.agent.playbooks.discovery import load_rule_modules

load_rule_modules(
    package_name="services.ai.agent.causes",
    excluded=("catalog", "engine"),
)

__all__ = ["cause_rules", "evidence_rules"]
