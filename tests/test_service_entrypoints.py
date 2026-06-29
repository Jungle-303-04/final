from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

SERVICE_ENTRYPOINTS = {
    "repo-gateway-worker": ("src/services/gitops/repo-gateway-worker/app.py", "App("),
    "diff-analyze-worker": ("src/services/gitops/diff-analyze-worker/app.py", "App("),
    "diff-worker": ("src/services/gitops/diff-worker/app.py", "App("),
    "manifest-render-worker": ("src/services/gitops/manifest-render-worker/app.py", "App("),
    "git-pull-worker": ("src/services/gitops/git-pull-worker/app.py", "App("),
    "github-poller": ("src/services/gitops/github-poller/app.py", "AsyncService("),
    "api-gateway": ("src/services/api-gateway/app.py", "FastApiService("),
    "command-worker": ("src/services/command-worker/app.py", "App("),
    "rca-worker": ("src/services/rca-worker/app.py", "App("),
    "dashboard-projection-service": (
        "src/services/projection/dashboard-projection-service/app.py",
        "App(",
    ),
    "audit-timeline-service": ("src/services/projection/audit-timeline-service/app.py", "App("),
    "target-cluster-agent": ("src/services/target/target-cluster-agent/app.py", "AsyncService("),
    "node-collector": ("src/services/target/node-collector/app.py", "AsyncService("),
    "fake-prometheus": ("src/services/target/target-cluster-agent/fake_prometheus.py", "AsyncService("),
    "fake-loki": ("src/services/target/target-cluster-agent/fake_loki.py", "AsyncService("),
    "fake-otel": ("src/services/target/target-cluster-agent/fake_otel.py", "AsyncService("),
}


def read_project_file(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_services_have_direct_process_entrypoints() -> None:
    for service_name, (relative_path, expected_helper) in SERVICE_ENTRYPOINTS.items():
        entrypoint = ROOT_DIR / relative_path

        assert entrypoint.exists(), f"{service_name} entrypoint does not exist"
        source = entrypoint.read_text(encoding="utf-8")
        assert 'if __name__ == "__main__":' in source
        assert expected_helper in source
        assert "SERVICE_NAME =" not in source


# App(한 파일) 으로 마이그레이션한 서비스는 settings.py 가 없다(러너에 인라인).
APP_BASED_SERVICES = {
    "rca-worker",
    "command-worker",
    "git-pull-worker",
    "manifest-render-worker",
    "diff-worker",
    "diff-analyze-worker",
    "repo-gateway-worker",
    "dashboard-projection-service",
    "audit-timeline-service",
}


def test_services_keep_local_settings_files() -> None:
    service_dirs = {
        Path(relative_path).parent
        for service, (relative_path, _) in SERVICE_ENTRYPOINTS.items()
        if service not in APP_BASED_SERVICES
    }

    for service_dir in service_dirs:
        settings_file = ROOT_DIR / service_dir / "settings.py"
        assert settings_file.exists(), f"{service_dir} must own service settings"


def test_contracts_are_grouped_by_boundary() -> None:
    assert (ROOT_DIR / "src" / "packages" / "contracts" / "gateway" / "requests.py").exists()
    assert (ROOT_DIR / "src" / "packages" / "contracts" / "event_bus" / "subjects.py").exists()
    assert (ROOT_DIR / "src" / "packages" / "contracts" / "event_bus" / "subscriptions.py").exists()
    assert not (ROOT_DIR / "src" / "packages" / "contracts" / "schemas.py").exists()

    constants = read_project_file("src/packages/config/constants.py")
    assert "class EventSubject" not in constants
    assert "class EventProcessingStatus" not in constants


def test_central_role_dispatcher_is_removed() -> None:
    assert not (ROOT_DIR / "src" / "services" / "main.py").exists()
    assert not (ROOT_DIR / "src" / "services" / "registry.py").exists()
    assert not (ROOT_DIR / "src" / "packages" / "shared").exists()
    assert not (ROOT_DIR / "src" / "packages" / "worker_runtime").exists()


def test_kubernetes_workloads_run_service_entrypoints_directly() -> None:
    manifests = "\n".join(
        [
            read_project_file("deploy/management/services.yaml"),
            read_project_file("deploy/management/github-poller.yaml"),
            read_project_file("deploy/target/target.yaml"),
        ]
    )

    for relative_path, _expected_helper in SERVICE_ENTRYPOINTS.values():
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

    assert "src/services/management-api-gateway/app.py" not in manifests
