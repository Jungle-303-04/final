"""Helm read-model query protection budgets."""

from __future__ import annotations

from dataclasses import dataclass

from packages.config.settings import env

HELM_OWNED_RESOURCE_QUERY_LIMIT_ENV = "HELM_OWNED_RESOURCE_QUERY_LIMIT"


@dataclass(frozen=True)
class HelmReadLimitDefaults:
    """Deployment defaults; operators can tune the bounded ownership scan."""

    owned_resource_query_limit: int = 5_000


HELM_READ_LIMIT_DEFAULTS = HelmReadLimitDefaults()


def helm_owned_resource_query_limit() -> int:
    """Return a positive, bounded result budget for one Helm ownership read."""

    default = HELM_READ_LIMIT_DEFAULTS.owned_resource_query_limit
    try:
        configured = int(env(HELM_OWNED_RESOURCE_QUERY_LIMIT_ENV, str(default)))
    except ValueError:
        return default
    if configured <= 0:
        return default
    return min(configured, 50_000)
