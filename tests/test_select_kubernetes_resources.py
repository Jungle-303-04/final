from __future__ import annotations

import importlib.util
from collections.abc import Mapping
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "select_kubernetes_resources",
    ROOT / "scripts/select_kubernetes_resources.py",
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
select_resources = MODULE.select_resources


def service(name: str) -> Mapping[str, object]:
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "namespace": "management"},
        "spec": {"ports": [{"port": 80}]},
    }


def test_select_resources_returns_only_the_exact_requested_set() -> None:
    selected = select_resources(
        [
            service("console-dev"),
            {"apiVersion": "apps/v1", "kind": "Deployment", "metadata": {"name": "ignored"}},
            service("api-gateway"),
            service("unrelated"),
        ],
        kind="Service",
        names=frozenset({"api-gateway", "console-dev"}),
    )

    assert [document["metadata"]["name"] for document in selected] == [
        "api-gateway",
        "console-dev",
    ]


def test_select_resources_fails_closed_for_missing_or_duplicate_resources() -> None:
    with pytest.raises(ValueError, match="missing Service resource"):
        select_resources(
            [service("api-gateway")],
            kind="Service",
            names=frozenset({"api-gateway", "console-dev"}),
        )
    with pytest.raises(ValueError, match="duplicate Service/api-gateway"):
        select_resources(
            [service("api-gateway"), service("api-gateway")],
            kind="Service",
            names=frozenset({"api-gateway"}),
        )
