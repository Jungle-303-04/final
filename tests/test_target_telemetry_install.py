import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from domains.target.router import (
    DEFAULT_OTEL_TRACES_URL,
    DEFAULT_PROMETHEUS_URL,
    install_command_for,
    install_telemetry_asset_by_token,
    install_telemetry_script_by_token,
    powershell_install_command_for,
)
from packages.contracts.gateway.requests import TargetRegisterRequest

ROOT = Path(__file__).resolve().parents[1]


def script(name: str) -> str:
    return (ROOT / "scripts" / name).read_text(encoding="utf-8")


def test_target_registration_installs_telemetry_before_registering_agent() -> None:
    register = script("register-target.sh")

    install = register.index('bash "${SCRIPT_DIR}/install-telemetry.sh"')
    registration = register.index('echo "==> registering target in operations tool"')

    assert 'INSTALL_TELEMETRY="${INSTALL_TELEMETRY:-true}"' in register
    assert install < registration
    assert "/integrations/prometheus" in register
    assert "clusterrole/cluster-agent-uninstall" in register
    assert "OTEL_TRACES_ENDPOINT" in register


def test_aws_target_registration_keeps_telemetry_required_by_default() -> None:
    aws_up = script("aws-up.sh")

    assert 'INSTALL_TELEMETRY="${INSTALL_TELEMETRY:-true}"' in aws_up
    assert 'INSTALL_TELEMETRY="${INSTALL_TELEMETRY}" \\' in aws_up


def test_telemetry_installer_pins_and_verifies_every_provider() -> None:
    installer = script("install-telemetry.sh")

    for version_name in (
        "PROMETHEUS_CHART_VERSION",
        "LOKI_CHART_VERSION",
        "TEMPO_CHART_VERSION",
        "OTEL_CHART_VERSION",
    ):
        assert f'--version "${{{version_name}}}"' in installer

    for release_name in (
        "PROMETHEUS_RELEASE",
        "LOKI_RELEASE",
        "TEMPO_RELEASE",
        "OTEL_RELEASE",
    ):
        assert f'require_release_workload "${{{release_name}}}"' in installer

    for service_name in (
        "prometheus",
        "loki-gateway",
        "tempo",
        "opentelemetry-collector",
    ):
        assert f"require_service_endpoints {service_name}" in installer

    otel_values = (ROOT / "deploy" / "target" / "opentelemetry.yaml").read_text(encoding="utf-8")
    assert "service:\n" in otel_values
    assert "  enabled: true" in otel_values


def test_ui_connect_command_installs_telemetry_before_agent_manifest() -> None:
    payload = TargetRegisterRequest(
        cluster_id="cluster-1",
        management_base_url="https://ops.example.test/api",
    )

    command = install_command_for(payload, "agent-token")

    telemetry = command.index("/install/agent-token/telemetry/bash")
    manifest = command.index("/install/agent-token | kubectl apply")
    assert telemetry < manifest
    assert "TELEMETRY_ASSET_BASE_URL=" in command
    assert "cluster-agent-uninstall" in command
    assert "kubectl config current-context" in command


def test_ui_powershell_connect_command_installs_telemetry_before_agent_manifest() -> None:
    payload = TargetRegisterRequest(
        cluster_id="cluster-1",
        management_base_url="https://ops.example.test/api",
    )

    command = powershell_install_command_for(payload, "agent-token")

    telemetry = command.index("/install/agent-token/telemetry/powershell")
    manifest = command.index("/install/agent-token'")
    assert telemetry < manifest
    assert "-AssetBaseUrl" in command
    assert "cluster-agent-uninstall" in command


def test_connect_defaults_route_all_four_telemetry_signals() -> None:
    assert DEFAULT_PROMETHEUS_URL == "http://prometheus.target.svc.cluster.local:9090"
    assert DEFAULT_OTEL_TRACES_URL == ("http://opentelemetry-collector.target.svc:4318/v1/traces")

    router_source = (ROOT / "src" / "domains" / "target" / "router.py").read_text(encoding="utf-8")
    assert "await update_prometheus_integration(" in router_source
    assert "otel_traces_endpoint=DEFAULT_OTEL_TRACES_URL" in router_source


def test_remote_install_artifacts_are_packaged_in_service_image() -> None:
    installer = script("install-telemetry.sh")
    powershell = script("install-telemetry.ps1")
    dockerfile = (ROOT / "src" / "services" / "Dockerfile").read_text(encoding="utf-8")

    assert "TELEMETRY_ASSET_BASE_URL" in installer
    assert "AssetBaseUrl" in powershell
    assert "scripts/install-telemetry.sh ./scripts/install-telemetry.sh" in dockerfile
    assert "scripts/install-telemetry.ps1 ./scripts/install-telemetry.ps1" in dockerfile
    assert "deploy/target ./deploy/target" in dockerfile


class InstallerArtifactDb:
    def authenticate_cluster_agent(self, _token_hash: str) -> dict[str, str]:
        return {"workspace_id": "workspace-1", "cluster_id": "cluster-1"}

    def get_cluster_registration_install_credentials(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, str]:
        assert workspace_id == "workspace-1"
        assert cluster_id == "cluster-1"
        return {"cluster_id": cluster_id}


def test_installer_token_serves_only_allowlisted_telemetry_artifacts() -> None:
    db = InstallerArtifactDb()

    shell = asyncio.run(install_telemetry_script_by_token("agent-token", "bash", db=db))
    asset = asyncio.run(install_telemetry_asset_by_token("agent-token", "prometheus.yaml", db=db))

    assert b"helm upgrade --install" in shell.body
    assert b"fullnameOverride: prometheus" in asset.body

    with pytest.raises(HTTPException) as exc:
        asyncio.run(install_telemetry_asset_by_token("agent-token", "../secrets", db=db))
    assert exc.value.status_code == 404


def test_loki_object_store_declares_every_required_bucket() -> None:
    loki_values = (ROOT / "deploy" / "target" / "loki.yaml").read_text(encoding="utf-8")
    minio_manifest = (ROOT / "deploy" / "target" / "minio.yaml").read_text(encoding="utf-8")

    for bucket in ("loki-chunks", "loki-ruler", "loki-admin"):
        assert bucket in loki_values
        assert f"local/{bucket}" in minio_manifest

    assert "minio/mc:RELEASE.2025-05-21T01-59-54Z" in minio_manifest
