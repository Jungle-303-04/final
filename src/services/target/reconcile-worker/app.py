"""target reconcile worker app wiring."""

from __future__ import annotations

from events import (
    actual_components,
    component_from_row,
    on_desired_state_changed,
    on_reconcile_requested,
    record_reconcile,
)

from packages.contracts.event_bus.bodies import (
    ClusterDesiredStateChangedBody,
    ClusterReconcileRequestedBody,
)
from packages.runtime.app import App

__all__ = [
    "actual_components",
    "app",
    "component_from_row",
    "on_desired_state_changed",
    "on_reconcile_requested",
    "record_reconcile",
]

app = App("target-reconcile-worker")
app.on(ClusterDesiredStateChangedBody)(on_desired_state_changed)
app.on(ClusterReconcileRequestedBody)(on_reconcile_requested)


if __name__ == "__main__":
    app.run()
