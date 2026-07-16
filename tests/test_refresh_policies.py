from __future__ import annotations

import json

import pytest

from packages.config.refresh_policies import (
    REFRESH_POLICIES_ENV,
    browser_refresh_policies,
    integral_refresh_after_seconds,
    post_mutation_refresh_after_seconds,
)


@pytest.fixture(autouse=True)
def clear_policy_cache() -> None:
    browser_refresh_policies.cache_clear()
    yield
    browser_refresh_policies.cache_clear()


def test_refresh_inventory_is_complete_and_domain_values_share_the_registry() -> None:
    response = browser_refresh_policies()

    assert len(response.policies) == 18
    assert response.policies["dashboard"].event_invalidation is True
    assert response.policies["gitops_rows"].retry_after_seconds == 2
    assert response.policies["gitops_rows"].retry_limit == 4
    assert integral_refresh_after_seconds("helm_list") == 30
    assert integral_refresh_after_seconds("helm_detail") == 10
    assert integral_refresh_after_seconds("cost_summary") == 60
    assert integral_refresh_after_seconds("cost_trend") == 120
    assert integral_refresh_after_seconds("cost_nodes") == 120
    assert post_mutation_refresh_after_seconds("helm_detail") == 1.2


def test_deployment_override_changes_policy_and_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline = browser_refresh_policies()
    browser_refresh_policies.cache_clear()
    monkeypatch.setenv(
        REFRESH_POLICIES_ENV,
        json.dumps({"helm_detail": {"refresh_after_seconds": 12}}),
    )

    overridden = browser_refresh_policies()

    assert overridden.policies["helm_detail"].refresh_after_seconds == 12
    assert overridden.policies["helm_list"].refresh_after_seconds == 30
    assert overridden.revision != baseline.revision


@pytest.mark.parametrize(
    "payload",
    [
        "[]",
        '{"unknown": {"refresh_after_seconds": 30}}',
        '{"helm_detail": 10}',
        '{"gitops_rows": {"retry_limit": null}}',
    ],
)
def test_invalid_deployment_override_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
    payload: str,
) -> None:
    monkeypatch.setenv(REFRESH_POLICIES_ENV, payload)

    with pytest.raises((RuntimeError, ValueError)):
        browser_refresh_policies()
