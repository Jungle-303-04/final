"""git-pull-worker — 깃 변경 감지(풀링) → git.changed. 파이프라인 입구.

우현 원본 GitOpsSyncWorkflow.handle()의 commit_sha 결정과 GIT_CHANGED
발행 블록에 대응. 변경 감지 책임만 떼어 이후 렌더/비교/명령 단계가
독립적으로 재시도·테스트될 수 있게 분리.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import EventBody, GitChangedBody, GitWebhookReceivedBody
from packages.runtime.app import App, EventContext

app = App("git-pull-worker")


@app.on(GitWebhookReceivedBody)
async def on_git_webhook(
    evt: GitWebhookReceivedBody, ctx: EventContext
) -> AsyncIterator[EventBody]:
    # 우현 원본 보존(GitOpsSyncWorkflow.handle 중 commit_sha + git.changed):
    #
    # payload = evt["payload"]
    # commit_sha = payload.get("commit_sha") or str(uuid.uuid4())[:8]
    # await self.events.publish(
    #     EventSubject.GIT_CHANGED,
    #     SERVICE_NAME,
    #     {"commit_sha": commit_sha, "manifest": manifest},
    #     evt["correlation_id"],
    # )
    #
    # 현재 split 구조에서는 raw dict payload 대신 GitWebhookReceivedBody를 받고,
    # manifest 생성은 다음 단계인 manifest-render-worker가 맡는다.
    commit_sha = evt.commit_sha or str(uuid.uuid4())[:8]
    yield GitChangedBody(commit_sha=commit_sha, image=evt.image, replicas=evt.replicas)


if __name__ == "__main__":
    app.run()
