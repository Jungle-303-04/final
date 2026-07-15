from __future__ import annotations

from domains.command.actions import command
from domains.command.policy import (
    DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
)
from packages.config.constants import Command, Sandbox
from packages.contracts.target import TARGET_NAMESPACE


# rollout restart 는 sandbox 에서만 자동 실행한다. 실제 서비스 namespace에서는
# CONTROL_ALLOWED_NAMESPACES 허용과 함께 기록된 운영자 승인이 모두 있어야 한다.
@command.action(
    Command.DEFAULT_ACTION,
    recovery_aliases=("rollout_restart",),
    allowed_namespaces=(Sandbox.NAMESPACE, "color-turf"),
    requires_approval=False,
    requires_approval_outside_sandbox=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class RolloutRestartCommand:
    pass


@command.action(
    Command.APPLY_MANIFEST_ACTION,
    recovery_aliases=("apply_manifest",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class ApplyManifestCommand:
    pass


@command.action(
    Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
    recovery_aliases=("deployment_scale",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class ScaleDeploymentCommand:
    pass


@command.action(
    Command.RCA_TEST_SCENARIO_INJECT_ACTION,
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=False,
)
class RcaTestScenarioInjectCommand:
    """test-only API가 만든 allowlisted 장애 시나리오 주입 명령."""


@command.action(
    Command.RCA_TEST_SCENARIO_CLEANUP_ACTION,
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=False,
)
class RcaTestScenarioCleanupCommand:
    """현재 run label이 일치하는 RCA 테스트 fixture 정리 명령."""


@command.action(
    Command.CLUSTER_AGENT_UNINSTALL_ACTION,
    allowed_namespaces=(TARGET_NAMESPACE,),
    requires_approval=False,
)
class ClusterAgentUninstallCommand:
    """관리자 연결 해제 요청에만 쓰이는 target agent 자가 정리 명령."""
