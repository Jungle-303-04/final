from __future__ import annotations

from domains.command.actions import command
from packages.config.constants import Command, Sandbox


@command.action(
    Command.DEFAULT_ACTION,
    recovery_aliases=("rollout_restart",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
)
class RolloutRestartCommand:
    pass


@command.action(
    Command.APPLY_MANIFEST_ACTION,
    recovery_aliases=("apply_manifest",),
    allowed_namespaces=(Sandbox.NAMESPACE,),
)
class ApplyManifestCommand:
    pass
