"""서비스 entrypoint 규약 검증 — 명부는 discovery(자동 발견)가 단일 출처.

수동 SERVICE_ENTRYPOINTS 목록을 유지하지 않는다. 서비스 추가/삭제는
src/services/**/app.py 생성/삭제로 끝나고, 이 테스트는 규약과
deploy manifest 정합(양방향 drift)만 검증한다.
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
    "deploy/management/github-poll-worker.yaml",
    "deploy/target/target.yaml",
)

# k8s manifest 가 직접 실행하지 않는 entrypoint(다른 워크로드가 동적 생성/관리).
GENERATED_WORKLOADS = {"src/services/target/node-collector/app.py"}

_COMMAND_PATTERN = re.compile(r'command: \["python", "(src/services/[^"]+)"\]')


def test_kubernetes_workloads_run_service_entrypoints_directly() -> None:
    """정방향 drift: 발견된 모든 서비스는 manifest 에 command 로 존재해야 한다."""
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
    """역방향 drift: manifest 의 모든 command 경로는 발견된 서비스여야 한다."""
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


def test_up_script_restarts_new_management_workers() -> None:
    up_script = read_project_file("scripts/up.sh")
    assert "workflow-controller alert-worker mail-worker command-worker" in up_script
    assert "evidence-worker incident-worker plan-worker analyze-worker" in up_script
    assert "safe-pr-worker ai-diff-worker rollout-worker approval-worker" in up_script
