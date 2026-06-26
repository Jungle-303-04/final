from __future__ import annotations

from typing import Final

from command_config import CommandConfig, PolicyRuleConfig
from packages.config.constants import Sandbox, Target
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import WorkerSubscription
from packages.contracts.gateway.fields import Gateway


class Settings:
    SERVICE_NAME: Final[str] = "command-worker"
    SUBSCRIPTION = WorkerSubscription(
        service_name=SERVICE_NAME,
        subject=EventSubject.COMMAND_REQUESTED,
    )

    AGENT_ROUTE_CHANNEL: Final[str] = "agent-poll"
    POLICY_STEPS: Final[tuple[str, ...]] = (
        "validate policy",
        "route target cluster",
        "queue for agent",
    )
    DEFAULT_COMMAND_ACTION: Final[str] = "rollout_restart"
    SANDBOX_NAMESPACE_POLICY_NAME: Final[str] = "sandbox_namespace"
    SANDBOX_WRITE_REJECT_REASON: Final[str] = "only sandbox namespace writes are allowed"
    DEFAULT_POLICY_REJECT_REASON: Final[str] = "command policy rejected"
    COMMAND_STATUS_QUEUED: Final[str] = "queued"
    CONFIG = CommandConfig(
        service_name=SERVICE_NAME,
        agent_route_channel=AGENT_ROUTE_CHANNEL,
        policy_steps=POLICY_STEPS,
        default_namespace=Sandbox.NAMESPACE,
        default_cluster_id=Target.DEFAULT_CLUSTER_ID,
        default_command_action=DEFAULT_COMMAND_ACTION,
        default_policy_reject_reason=DEFAULT_POLICY_REJECT_REASON,
        command_status_queued=COMMAND_STATUS_QUEUED,
        policy_rules=(
            PolicyRuleConfig(
                name=SANDBOX_NAMESPACE_POLICY_NAME,
                field=Gateway.NAMESPACE,
                expected=Sandbox.NAMESPACE,
                default=Sandbox.NAMESPACE,
                reason=SANDBOX_WRITE_REJECT_REASON,
            ),
        ),
    )
