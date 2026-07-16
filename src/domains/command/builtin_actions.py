from __future__ import annotations

from domains.command.actions import command
from domains.command.policy import (
    DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
)
from packages.config.constants import Command, Sandbox
from packages.contracts.helm import (
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
)
from packages.contracts.service_access import (
    SERVICE_HTTP_REQUEST_ACTION,
    SERVICE_HTTP_REQUEST_AGENT_CAPABILITY,
)
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
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class ApplyManifestCommand:
    pass


@command.action(
    Command.CATALOG_HELM_INSTALL_ACTION,
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=False,
    supports_cancel=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    required_agent_capability=Command.CATALOG_HELM_INSTALL_CAPABILITY,
)
class CatalogHelmUpgradeCommand:
    """Digest-pinned catalog execution reused for an observed release upgrade."""


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
    Command.KUBERNETES_STATEFULSET_SCALE_ACTION,
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class ScaleStatefulSetCommand:
    pass


@command.action(
    Command.KUBERNETES_STATEFULSET_RESTART_ACTION,
    requires_approval_outside_sandbox=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class RestartStatefulSetCommand:
    pass


@command.action(
    Command.KUBERNETES_DAEMONSET_RESTART_ACTION,
    requires_approval_outside_sandbox=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
)
class RestartDaemonSetCommand:
    pass


@command.action(
    Command.KUBERNETES_NODE_CORDON_ACTION,
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    enforce_control_namespace=False,
    required_agent_capability=Command.KUBERNETES_NODE_CONTROL_CAPABILITY,
)
class CordonNodeCommand:
    pass


@command.action(
    Command.KUBERNETES_NODE_UNCORDON_ACTION,
    requires_approval=True,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    enforce_control_namespace=False,
    required_agent_capability=Command.KUBERNETES_NODE_CONTROL_CAPABILITY,
)
class UncordonNodeCommand:
    pass


@command.action(
    Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
    requires_approval=False,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    required_agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
)
class TriggerCronJobCommand:
    pass


@command.action(
    Command.KUBERNETES_CRONJOB_SUSPEND_ACTION,
    requires_approval=False,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    required_agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
)
class SuspendCronJobCommand:
    pass


@command.action(
    Command.KUBERNETES_CRONJOB_RESUME_ACTION,
    requires_approval=False,
    supports_manual_retry=True,
    max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    required_agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
)
class ResumeCronJobCommand:
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


@command.action(
    SERVICE_HTTP_REQUEST_ACTION,
    requires_approval=False,
    supports_cancel=True,
    supports_manual_retry=False,
    enforce_control_namespace=False,
    read_only=True,
    required_agent_capability=SERVICE_HTTP_REQUEST_AGENT_CAPABILITY,
)
class ServiceHttpRequestCommand:
    """One bounded, read-only HTTP GET resolved from an exact core/v1 Service."""


@command.action(
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    requires_approval=False,
    supports_cancel=True,
    supports_manual_retry=False,
    enforce_control_namespace=False,
    read_only=True,
    required_agent_capability=HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
)
class HelmReleaseArtifactReadCommand:
    """Read one revision-bound Helm artifact through the target agent."""
