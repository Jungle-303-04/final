"""safe-pr-worker — safe_pr.requested -> safe_pr.patch_prepared."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    EventBody,
    SafePrPatchPreparedBody,
    SafePrRequestedBody,
)
from packages.runtime.app import App

app = App("safe-pr-worker")


@app.on(SafePrRequestedBody)
async def on_safe_pr_requested(evt: SafePrRequestedBody) -> AsyncIterator[EventBody]:
    yield SafePrPatchPreparedBody(
        title=evt.title,
        body=evt.body,
        patch={"body": evt.body, "provider": evt.provider},
        provider=evt.provider,
        workspace_id=evt.workspace_id,
    )


if __name__ == "__main__":
    app.run()
