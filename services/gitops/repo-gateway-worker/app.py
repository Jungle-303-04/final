"""repo-gateway-worker — safe_pr.requested → GitHub PR → safe_pr.created.

외부(GitHub) 단일 outbound 게이트웨이. target-cluster-agent(클러스터
게이트웨이)와 대칭. 안전 판단은 요청자(gitops·rca), PR 생성만 여기서.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    EventBody,
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrRequestedBody,
)
from packages.runtime.app import App, EventContext

app = App("repo-gateway-worker")

PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_MODE = "fake_github_api_call"
PR_STATUS_CREATED = "created"
PR_NUMBER_MODULO = 100000
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"


@app.sub(SafePrRequestedBody)
async def on_safe_pr_requested(evt: SafePrRequestedBody, ctx: EventContext) -> AsyncIterator[EventBody]:
    try:
        pr_url = f"{PR_URL_PREFIX}/{int(time.time()) % PR_NUMBER_MODULO}"
        token_ref = ctx.db.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF
        ctx.db.save_pull_request(
            ctx.correlation_id,
            pr_url,
            evt.title,
            evt.body,
            PR_STATUS_CREATED,
        )
    except Exception as exc:
        yield SafePrFailedBody(
            provider=evt.provider,
            title=evt.title,
            reason=str(exc),
        )
        return

    yield SafePrCreatedBody(
        pr_url=pr_url,
        provider=evt.provider,
        token_ref=token_ref,
        mode=PR_MODE,
    )


if __name__ == "__main__":
    app.run()
