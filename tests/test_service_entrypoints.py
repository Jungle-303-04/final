"""서비스 entrypoint 규약 검증 — 명부는 discovery(자동 발견)가 단일 출처.

수동 SERVICE_ENTRYPOINTS 목록을 유지하지 않음. 서비스 추가/삭제는
src/services/**/app.py 생성/삭제로 끝나고, 이 테스트는 규약과
deploy manifest 정합(양방향 drift)만 검증.
"""

from __future__ import annotations

import re
from pathlib import Path

from packages.runtime.discovery import discover_services

ROOT_DIR = Path(__file__).resolve().parents[1]
SERVICES = discover_services(ROOT_DIR)


def read_project_file(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_services_have_direct_process_entrypoints() -> None:
    for svc in SERVICES:
        source = read_project_file(svc.command)
        assert 'if __name__ == "__main__":' in source, svc.name
        assert "SERVICE_NAME =" not in source, svc.name


# 서비스별 설정 위치 정책(예외만 명시; 나머지는 settings.py 금지).
LOCAL_SETTINGS_SERVICES = {"api-gateway", "github-poll-worker"}
INLINE_CONFIG_SERVICES = {
    "cluster-agent": "AgentConfig",
    "node-collector": "NodeCollectorConfig",
}


def test_services_use_expected_config_location() -> None:
    for svc in SERVICES:
        settings_file = ROOT_DIR / svc.path.parent / "settings.py"

        if svc.name in LOCAL_SETTINGS_SERVICES:
            assert settings_file.exists(), f"{svc.name} must own service settings"
            continue

        assert not settings_file.exists(), f"{svc.path.parent} should not keep settings.py"
        if svc.name in INLINE_CONFIG_SERVICES:
            assert INLINE_CONFIG_SERVICES[svc.name] in read_project_file(svc.command)


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


MANIFEST_FILES = (
    "deploy/management/services.yaml",
    "deploy/management/ai-workers.yaml",
    "deploy/management/auto-revert-worker.yaml",
    "deploy/management/github-poll-worker.yaml",
    "deploy/target/target.yaml",
)

# k8s manifest 가 직접 실행하지 않는 entrypoint(다른 워크로드가 동적 생성/관리).
GENERATED_WORKLOADS = {"src/services/target/node-collector/app.py"}

_COMMAND_PATTERN = re.compile(r'command: \["python", "(src/services/[^"]+)"\]')


def test_kubernetes_workloads_run_service_entrypoints_directly() -> None:
    """정방향 drift: 발견된 모든 서비스는 manifest 에 command 로 존재해야 함."""
    manifests = "\n".join(read_project_file(path) for path in MANIFEST_FILES)

    for svc in SERVICES:
        if svc.command in GENERATED_WORKLOADS:
            continue
        assert f'command: ["python", "{svc.command}"]' in manifests, svc.name

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


def test_manifest_commands_point_to_existing_entrypoints() -> None:
    """역방향 drift: manifest 의 모든 command 경로는 발견된 서비스여야 함."""
    known = {svc.command for svc in SERVICES}

    for manifest in MANIFEST_FILES:
        for match in _COMMAND_PATTERN.finditer(read_project_file(manifest)):
            command_path = match.group(1)
            assert command_path in known, f"{manifest}: unknown entrypoint {command_path}"


def test_target_install_is_driven_by_registration_script() -> None:
    up_script = read_project_file("scripts/up.sh")
    register_script = read_project_file("scripts/register-target.sh")

    assert "scripts/register-target.sh" in up_script
    assert "/targets" in register_script
    assert "delete deploy/target-cluster-agent" in register_script
    assert "kubectl --context" in register_script
    assert "PROMETHEUS_BASE_URL" not in register_script
    assert "prometheus_base_url" not in register_script


def test_up_script_starts_management_workers_after_gateway() -> None:
    up_script = read_project_file("scripts/up.sh")
    assert "APP_WORKER_DEPLOYMENTS=(" in up_script
    assert "SMOKE_WORKER_DEPLOYMENTS=(" in up_script
    assert "RCA_WORKER_DEPLOYMENTS=(" in up_script
    assert 'UP_WORKER_SET="${UP_WORKER_SET:-smoke}"' in up_script
    assert "WORKER_DEPLOYMENTS_TO_START" in up_script
    assert "wait_management_pod_ready api-gateway" in up_script
    assert 'scale "deploy/${deploy}" --replicas=1' in up_script
    assert "--for=condition=ready pod" in up_script
    assert (
        'ENABLE_GITHUB_POLL_WORKER="${ENABLE_GITHUB_POLL_WORKER:-${ENABLE_GITHUB_POLL_CRON:-0}}"'
        in up_script
    )
    assert "scale deploy/github-poll-worker" in up_script
    assert "--replicas=0" in up_script
    assert "--replicas=1" in up_script
    assert "leaving github-poll-worker Deployment scaled to 0" in up_script
    for deploy in (
        "workflow-controller",
        "release-flow-worker",
        "alert-worker",
        "command-janitor",
        "outbox-relay",
        "rca-timeline-janitor",
        "evidence-worker",
        "ai-diff-worker",
        "dashboard-worker",
        "realtime-gateway",
    ):
        assert deploy in up_script


def test_local_up_seeds_complete_demo_and_connects_prometheus() -> None:
    up_script = read_project_file("scripts/up.sh")

    assert 'SEED_DEMO_WORKSPACE="${SEED_DEMO_WORKSPACE:-1}"' in up_script
    assert 'AUTO_CONNECT_PROMETHEUS="${AUTO_CONNECT_PROMETHEUS:-1}"' in up_script
    assert "seed_local_demo_workspace" in up_script
    assert "management-demo-workspace-seed" in up_script
    assert "configure_local_prometheus" in up_script
    assert '"${api_base}/integrations/prometheus"' in up_script
    assert '"prometheus_url": os.environ["LOCAL_PROMETHEUS_URL"]' in up_script
    assert 'if [ "${state}" = "connected" ]' in up_script


def test_gateway_pool_capacity_covers_agent_long_poll_fanout() -> None:
    services = read_project_file("deploy/management/services.yaml")

    # 게이트웨이는 세션 API + agent 롱폴 동시성 최대 지점 — pgbouncer(transaction
    # pooling)가 서버 커넥션을 다중화하므로 클라이언트 풀 16+16 으로 폴 팬아웃을 흡수한다.
    assert '- name: DB_POOL_SIZE\n              value: "16"' in services
    assert '- name: DB_MAX_OVERFLOW\n              value: "16"' in services
    assert '- name: DB_POOL_TIMEOUT_SECONDS\n              value: "20"' in services


def test_api_gateway_is_prometheus_scrape_annotated() -> None:
    services = read_project_file("deploy/management/services.yaml")

    assert 'prometheus.io/scrape: "true"' in services
    assert "prometheus.io/path: /metrics" in services
    assert 'prometheus.io/port: "8000"' in services


def test_local_up_and_smoke_use_runnable_sample_manifest_defaults() -> None:
    up_script = read_project_file("scripts/up.sh")
    smoke_script = read_project_file("scripts/smoke.sh")
    sample_manifest = read_project_file("src/samples/smoke/deploy.yaml")

    assert 'MANIFEST_PATH="${MANIFEST_PATH:-src/samples/smoke/deploy.yaml}"' in up_script
    assert 'GIT_LOCAL_MANIFEST_ENABLED="${GIT_LOCAL_MANIFEST_ENABLED:-1}"' in up_script
    assert 'GIT_REMOTE_MANIFEST_REQUIRED="${GIT_REMOTE_MANIFEST_REQUIRED:-0}"' in up_script
    assert 'EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS:-30}"' in up_script
    assert 'WORKER_IDLE_SLEEP_SECONDS="${WORKER_IDLE_SLEEP_SECONDS:-1.0}"' in up_script
    assert "load_management_config_value GITOPS_WEBHOOK_IMAGE" in smoke_script
    assert "load_management_config_value MANIFEST_PATH" in smoke_script
    assert "required_subjects_csv" in smoke_script
    assert "manifest.rendered" in smoke_script
    assert "desired.diff.detected" in smoke_script
    assert "kind: Deployment" in sample_manifest
    assert "namespace: sandbox" in sample_manifest
