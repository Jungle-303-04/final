from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def _load_values(path: str) -> dict[str, object]:
    content = (ROOT / path).read_text(encoding="utf-8")
    values = yaml.safe_load(content)
    assert isinstance(values, dict)
    return values


def test_loki_target_values_declare_resource_requests_for_running_components() -> None:
    values = _load_values("deploy/target/loki.yaml")
    minio_manifest = (ROOT / "deploy/target/minio.yaml").read_text(encoding="utf-8")

    assert values["loki"]["storage"]["bucketNames"] == {
        "chunks": "loki-chunks",
        "ruler": "loki-ruler",
        "admin": "loki-admin",
    }
    for bucket_name in values["loki"]["storage"]["bucketNames"].values():
        assert f"mc mb --ignore-existing local/{bucket_name}" in minio_manifest
    assert values["singleBinary"]["resources"] == {
        "requests": {"cpu": "200m", "memory": "512Mi"},
        "limits": {"cpu": "1", "memory": "1Gi"},
    }
    assert values["gateway"]["resources"] == {
        "requests": {"cpu": "25m", "memory": "64Mi"},
        "limits": {"cpu": "250m", "memory": "256Mi"},
    }
    assert values["lokiCanary"]["resources"] == {
        "requests": {"cpu": "10m", "memory": "32Mi"},
        "limits": {"cpu": "100m", "memory": "128Mi"},
    }


def test_prometheus_target_values_declare_resource_requests_for_running_components() -> None:
    values = _load_values("deploy/target/prometheus.yaml")

    assert values["server"]["resources"] == {
        "requests": {"cpu": "200m", "memory": "512Mi"},
        "limits": {"cpu": "1", "memory": "1Gi"},
    }
    assert values["alertmanager"]["resources"] == {
        "requests": {"cpu": "50m", "memory": "128Mi"},
        "limits": {"cpu": "250m", "memory": "256Mi"},
    }
    for component in (
        "kube-state-metrics",
        "prometheus-node-exporter",
        "prometheus-pushgateway",
    ):
        assert values[component]["resources"] == {
            "requests": {"cpu": "25m", "memory": "64Mi"},
            "limits": {"cpu": "250m", "memory": "256Mi"},
        }
