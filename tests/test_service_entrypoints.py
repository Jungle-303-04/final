from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

SERVICE_ENTRYPOINTS = {
    "management-api-gateway": "services/management-api-gateway/runner.py",
    "gitops-sync-worker": "services/gitops-sync-worker/runner.py",
    "command-worker": "services/command-worker/runner.py",
    "rca-worker": "services/rca-worker/runner.py",
    "dashboard-projection-service": "services/dashboard-projection-service/runner.py",
    "audit-timeline-service": "services/audit-timeline-service/runner.py",
    "target-cluster-agent": "services/target-cluster-agent/runner.py",
    "node-collector": "services/node-collector/runner.py",
    "fake-prometheus": "services/target-cluster-agent/fake_prometheus.py",
    "fake-loki": "services/target-cluster-agent/fake_loki.py",
    "fake-otel": "services/target-cluster-agent/fake_otel.py",
}


def read_project_file(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_services_have_direct_process_entrypoints() -> None:
    for service_name, relative_path in SERVICE_ENTRYPOINTS.items():
        entrypoint = ROOT_DIR / relative_path

        assert entrypoint.exists(), f"{service_name} entrypoint does not exist"
        source = entrypoint.read_text(encoding="utf-8")
        assert 'if __name__ == "__main__":' in source
        assert "run_service(" in source


def test_central_role_dispatcher_is_removed() -> None:
    assert not (ROOT_DIR / "services" / "main.py").exists()
    assert not (ROOT_DIR / "services" / "registry.py").exists()
    assert not (ROOT_DIR / "packages" / "shared" / "roles.py").exists()


def test_kubernetes_workloads_run_service_entrypoints_directly() -> None:
    manifests = "\n".join(
        [
            read_project_file("deploy/management/services.yaml"),
            read_project_file("deploy/target/target.yaml"),
        ]
    )

    for relative_path in SERVICE_ENTRYPOINTS.values():
        assert f'command: ["python", "{relative_path}"]' in manifests

    legacy_role_args = [
        'args: ["gateway"]',
        'args: ["gitops-sync-worker"]',
        'args: ["command-worker"]',
        'args: ["rca-worker"]',
        'args: ["dashboard-projection-service"]',
        'args: ["audit-timeline-service"]',
        'args: ["target-agent"]',
        'args: ["node-collector"]',
        'args: ["fake-prometheus"]',
        'args: ["fake-loki"]',
        'args: ["fake-otel"]',
    ]
    for legacy_arg in legacy_role_args:
        assert legacy_arg not in manifests
