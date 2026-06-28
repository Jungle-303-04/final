"""git-pull-worker — 깃 변경 감지(풀링) → git.changed. 파이프라인 입구.

지금은 webhook 입력을 그대로 git.changed 로 넘기는 fake. 실제로는 깃
풀링/소스 가져오기 후 git.changed 생성.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from packages.contracts.event_bus.payloads import (
    EventPayload,
    GitChangedPayload,
    GitWebhookReceived,
)
from packages.runtime.app import App, EventContext

app = App("git-pull-worker")


@app.sub(GitWebhookReceived)
async def on_git_webhook(
    evt: GitWebhookReceived, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    commit_sha = evt.commit_sha or str(uuid.uuid4())[:8]
    yield GitChangedPayload(
        commit_sha=commit_sha, image=evt.image, replicas=evt.replicas
    )


if __name__ == "__main__":
    app.run()
