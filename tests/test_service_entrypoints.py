from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

SERVICE_ENTRYPOINTS = {
    "scm-worker": ("src/services/gitops/scm-worker/app.py", "App("),
    "diff-analyze-worker": ("src/services/gitops/diff-analyze-worker/app.py", "App("),
    "diff-worker": ("src/services/gitops/diff-worker/app.py", "App("),
    "manifest-render-worker": ("src/services/gitops/manifest-render-worker/app.py", "App("),
    "git-pull-worker": ("src/services/gitops/git-pull-worker/app.py", "App("),
    "workflow-controller": ("src/services/gitops/workflow-controller/app.py", "App("),
    "github-poll-worker": ("src/services/gitops/github-poll-worker/app.py", "AsyncService("),
    "api-gateway": ("src/services/gateway/api-gateway/app.py", "FastApiService("),
    "alert-worker": ("src/services/alert/alert-worker/app.py", "App("),
    "mail-worker": ("src/services/mail/mail-worker/app.py", "App("),
    "command-worker": ("src/services/command/command-worker/app.py", "App("),
    "rca-worker": ("src/services/ai/rca-worker/app.py", "App("),
    "audit-worker": ("src/services/projection/audit-worker/app.py", "App("),
    "cluster-agent": ("src/services/target/cluster-agent/app.py", "AsyncService("),
    "target-reconcile-worker": ("src/services/target/reconcile-worker/app.py", "App("),
    "node-collector": ("src/services/target/node-collector/app.py", "AsyncService("),
    "fake-prometheus": (
        "src/services/target/cluster-agent/fake_telemetry.py",
        "AsyncService(",
    ),
    "fake-loki": ("src/services/target/cluster-agent/fake_telemetry.py", "AsyncService("),
    "fake-otel": ("src/services/target/cluster-agent/fake_telemetry.py", "AsyncService("),
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


# App(한 파일) 서비스는 runner 파일 안에서 이름과 기본값 관리
APP_BASED_SERVICES = {
    "rca-worker",
    "command-worker",
    "alert-worker",
    "mail-worker",
    "git-pull-worker",
    "workflow-controller",
    "manifest-render-worker",
    "diff-worker",
    "diff-analyze-worker",
    "scm-worker",
    "audit-worker",
    "target-reconcile-worker",
}

LOCAL_SETTINGS_SERVICES = {"api-gateway", "github-poll-worker"}

INLINE_CONFIG_SERVICES = {
    "cluster-agent": "AgentConfig",
    "node-collector": "NodeCollectorConfig",
    "fake-prometheus": "AgentConfig",
    "fake-loki": "AgentConfig",
    "fake-otel": "AgentConfig",
}


def test_services_use_expected_config_location() -> None:
    for service, (relative_path, _) in SERVICE_ENTRYPOINTS.items():
        service_dir = Path(relative_path).parent
        settings_file = ROOT_DIR / service_dir / "settings.py"
        source = read_project_file(relative_path)

        if service in LOCAL_SETTINGS_SERVICES:
            assert settings_file.exists(), f"{service_dir} must own service settings"
            continue

        assert not settings_file.exists(), f"{service_dir} should not keep settings.py"
        if service in INLINE_CONFIG_SERVICES:
            assert INLINE_CONFIG_SERVICES[service] in source


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
            read_project_file("deploy/management/github-poll-worker.yaml"),
            read_project_file("deploy/target/target.yaml"),
        ]
    )

    generated_workloads = {"src/services/target/node-collector/app.py"}
    for relative_path, _expected_helper in SERVICE_ENTRYPOINTS.values():
        if relative_path in generated_workloads:
            continue
        assert f'command: ["python", "{relative_path}"]' in manifests

    legacy_role_args = [
        'args: ["gateway"]',
        'args: ["gitops-sync-worker"]',
        'args: ["command-worker"]',
        'args: ["rca-worker"]',
        'args: ["audit-worker"]',
        'args: ["target-agent"]',
        'args: ["node-collector"]',
    ]
    for legacy_arg in legacy_role_args:
        assert legacy_arg not in manifests

    assert "src/services/management-api-gateway/app.py" not in manifests


def test_target_install_is_driven_by_registration_script() -> None:
    up_script = read_project_file("scripts/up.sh")
    register_script = read_project_file("scripts/register-target.sh")

    assert "scripts/register-target.sh" in up_script
    assert "/targets" in register_script
    assert "delete deploy/target-cluster-agent" in register_script
    assert "kubectl --context" in register_script


def test_up_script_restarts_new_management_workers() -> None:
    up_script = read_project_file("scripts/up.sh")
    assert "workflow-controller alert-worker mail-worker command-worker" in up_script
    assert "get cronjob/github-poll-worker" in up_script
    assert "Jungle-303-04/final" in up_script
    assert "deploy/target/target.yaml" in up_script


def test_smoke_posts_webhook_and_command_without_dashboard_dependency() -> None:
    smoke_script = read_project_file("scripts/smoke.sh")
    assert "abc1234" not in smoke_script
    assert "latest_commit_sha" in smoke_script
    assert "repo_ref" in smoke_script
    assert "manifest_path" in smoke_script
    assert "webhook_correlation_id" in smoke_script
    assert "manual smoke command" in smoke_script
    assert "workflow.run.completed" not in smoke_script
    assert "/dashboard/query" not in smoke_script


def test_node_collector_is_agent_managed_not_static_manifest() -> None:
    target_manifest = read_project_file("deploy/target/target.yaml")
    manager_source = read_project_file(
        "src/services/target/cluster-agent/node_collector_manager.py"
    )

    assert "kind: DaemonSet" not in target_manifest
    assert "cluster-agent-target-manage" in target_manifest
    assert "src/services/target/node-collector/app.py" in manager_source


def test_otel_collector_pipelines_reference_defined_exporters() -> None:
    values = read_project_file("deploy/target/opentelemetry.yaml")

    assert "otlp/tempo:" in values
    assert "otlphttp/loki:" in values
    assert "- otlp/tempo" in values
    assert "- otlphttp/loki" in values
    assert "otlp_grpc/tempo" not in values
