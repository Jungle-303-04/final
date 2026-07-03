from __future__ import annotations

from domains.command.actions import command_action
from packages.config.constants import Command


@command_action(Command.DEFAULT_ACTION, recovery_aliases=("rollout_restart",))
class RolloutRestartCommand:
    pass


@command_action(Command.APPLY_MANIFEST_ACTION, recovery_aliases=("apply_manifest",))
class ApplyManifestCommand:
    pass
