from __future__ import annotations

import asyncio
from typing import Any

from conftest import SpyDb, load_service

from packages.contracts.event_bus.bodies import GitWebhookReceivedBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
from packages.events.envelope import event
from packages.runtime.dispatch import make_event_handler
from packages.runtime.gateway import ApiEventGateway


class MemoryPublisher:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        evt = event(subject, source, payload, correlation_id, causation_id)
        self.events.append(evt)
        return evt


class MemoryRecorder:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.events.append(evt)


async def run_worker(module: Any, incoming: EventEnvelope, db: Any) -> list[EventEnvelope]:
    # make_event_handler 는 이제 발행 대신 수집해서 반환(EventProcessor 가 outbox 적재).
    handler = make_event_handler(module.app.subscriptions[0], db, module.app.name)
    return await handler(incoming)


def test_api_to_outbound_gateway_golden_path(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", "https://github.test.local/project/repo/pull")

    async def run() -> None:
        db = SpyDb()
        gateway_events = ApiEventGateway(MemoryPublisher(), MemoryRecorder(), "api-gateway")
        accepted = await gateway_events.accept_body(
            GitWebhookReceivedBody(
                commit_sha="abc1234", image="ghcr.io/project/checkout-api:new", replicas=2
            )
        )

        git_pull = load_service("gitops/git-pull-worker")
        manifest = load_service("gitops/manifest-render-worker")
        diff = load_service("gitops/diff-worker")
        analyze = load_service("gitops/diff-analyze-worker")
        alert = load_service("alert/worker")
        command = load_service("command/worker")
        repo = load_service("gitops/scm-worker")

        git_changed = (await run_worker(git_pull, accepted.event, db))[0]
        rendered = (await run_worker(manifest, git_changed, db))[0]
        desired_diff = (await run_worker(diff, rendered, db))[0]
        analyzed_events = await run_worker(analyze, desired_diff, db)
        safe_pr_requested = analyzed_events[1]
        alert_requested = analyzed_events[2]
        safe_pr_created = (await run_worker(repo, safe_pr_requested, db))[0]
        alert_events = await run_worker(alert, alert_requested, db)
        command_requested = alert_events[1]
        command_events = await run_worker(command, command_requested, db)

        events = [
            accepted.event,
            git_changed,
            rendered,
            desired_diff,
            *analyzed_events,
            safe_pr_created,
            *alert_events,
            *command_events,
        ]
        assert [evt.subject for evt in events] == [
            EventSubject.GIT_WEBHOOK_RECEIVED,
            EventSubject.GIT_CHANGED,
            EventSubject.MANIFEST_RENDERED,
            EventSubject.DESIRED_DIFF_DETECTED,
            EventSubject.DIFF_ANALYZED,
            EventSubject.SAFE_PR_REQUESTED,
            EventSubject.ALERT_REQUESTED,
            EventSubject.SAFE_PR_CREATED,
            EventSubject.ALERT_DISPATCHED,
            EventSubject.COMMAND_REQUESTED,
            EventSubject.COMMAND_DISPATCH_READY,
            EventSubject.COMMAND_DISPATCHED,
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
        ]
        assert {evt.correlation_id for evt in events} == {accepted.event.correlation_id}
        assert git_changed.causation_id == accepted.event.event_id
        assert rendered.causation_id == git_changed.event_id
        assert desired_diff.causation_id == rendered.event_id
        assert analyzed_events[0].causation_id == desired_diff.event_id
        assert safe_pr_requested.causation_id == desired_diff.event_id
        assert alert_requested.causation_id == desired_diff.event_id
        assert safe_pr_created.causation_id == safe_pr_requested.event_id
        assert alert_events[0].causation_id == alert_requested.event_id
        assert command_requested.causation_id == alert_requested.event_id
        assert command_events[0].causation_id == command_requested.event_id
        assert db.called("save_repo_change")
        assert db.called("save_pull_request")
        assert db.called("queue_agent_command")

    asyncio.run(run())
