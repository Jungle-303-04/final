from pathlib import Path

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


def test_loki_object_store_declares_every_required_bucket() -> None:
    loki_values = (ROOT / "deploy" / "target" / "loki.yaml").read_text(encoding="utf-8")
    minio_manifest = (ROOT / "deploy" / "target" / "minio.yaml").read_text(encoding="utf-8")

    for bucket in ("loki-chunks", "loki-ruler", "loki-admin"):
        assert bucket in loki_values
        assert f"local/{bucket}" in minio_manifest

    assert "minio/mc:RELEASE.2025-05-21T01-59-54Z" in minio_manifest
