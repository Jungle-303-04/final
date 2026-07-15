from __future__ import annotations

from domains.command.actions import command
from packages.config.constants import Command, Sandbox
from packages.contracts.target import TARGET_NAMESPACE


# rollout restart 는 spec 변경이 없는 비파괴 조치라 자동 실행을 허용한다.
# (sandbox namespace 한정은 allowed_namespaces 로 계속 강제됨.
#  apply_manifest / deployment_scale 같은 상태 변경 액션은 승인 체인을 유지한다.)
@command.action(
    Command.DEFAULT_ACTION,
    recovery_aliases=("rollout_restart",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=False,
)
class RolloutRestartCommand:
    pass


@command.action(
    Command.APPLY_MANIFEST_ACTION,
    recovery_aliases=("apply_manifest",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=True,
)
class ApplyManifestCommand:
    pass


@command.action(
    Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
    recovery_aliases=("deployment_scale",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
    requires_approval=True,
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
