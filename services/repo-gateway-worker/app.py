"""repo-gateway-worker — diff.analyzed 를 받아 GitHub PR 을 만든다.

외부(GitHub)로 나가는 단일 outbound 게이트웨이. target-cluster-agent 가
클러스터 게이트웨이인 것과 대칭. 안전(safe)할 때만 PR 을 만들고
safe_pr.created 를 흘린다.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from packages.config.constants import GitHub
from packages.contracts.event_bus.payloads import (
    DiffAnalyzedPayload,
    EventPayload,
    SafePrCreatedPayload,
)
from packages.runtime.app import App, EventContext

app = App("repo-gateway-worker")

PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_TITLE = "Apply sandbox manifest"
PR_MODE = "fake_github_api_call"
PR_STATUS_CREATED = "created"
PR_NUMBER_MODULO = 100000
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"


@app.sub(DiffAnalyzedPayload)
async def on_diff_analyzed(
    evt: DiffAnalyzedPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    if not evt.safe:
        return  # 안전하지 않으면 PR 을 만들지 않는다.
    pr_url = f"{PR_URL_PREFIX}/{int(time.time()) % PR_NUMBER_MODULO}"
    token_ref = (
        ctx.db.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF
    )
    ctx.db.save_pull_request(
        ctx.correlation_id, pr_url, PR_TITLE, evt.reason, PR_STATUS_CREATED
    )
    yield SafePrCreatedPayload(
        pr_url=pr_url,
        provider=GitHub.PROVIDER,
        token_ref=token_ref,
        mode=PR_MODE,
    )


if __name__ == "__main__":
    app.run()
