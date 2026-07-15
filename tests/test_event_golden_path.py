from __future__ import annotations

import asyncio
from typing import Any

from conftest import SpyDb, github_scm_transport, load_service

from domains.gitops.events import GitWebhookReceivedBody
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


def test_api_to_outbound_gateway_golden_path(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")

    # manifest 소스는 실제 파일에서만 읽음(합성 폴백 없음) — 골든 패스 입력을 파일로 제공함.
    manifest_source = tmp_path / "deploy.yaml"
    manifest_source.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout-api",
                "  namespace: sandbox",
                "spec:",
                "  replicas: 2",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: checkout-api",
                "          image: ghcr.io/project/checkout-api:new",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(manifest_source))

    async def run() -> None:
        # 이 골든 경로는 운영 저장소의 정상 insert(True) 경로를 검증한다.
        # SpyDb의 공용 기본값(None)은 저장 실패를 뜻하므로 여기에서만 명시한다.
        db = SpyDb(queue_agent_command=True)
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
        safe_pr = load_service("gitops/safe-pr-worker")
        ai_diff = load_service("ai/diff-worker")
        alert = load_service("alert/alert-worker")
        command = load_service("command/command-worker")
        repo = load_service("gitops/scm-worker")
        monkeypatch.setattr(
            repo,
            "SCM_PROVIDER",
            repo.GithubScmProvider(transport=github_scm_transport()),
        )

        git_changed = (await run_worker(git_pull, accepted.event, db))[0]
        rendered = (await run_worker(manifest, git_changed, db))[0]
        desired_diff = (await run_worker(diff, rendered, db))[0]
        analyzed_events = await run_worker(analyze, desired_diff, db)
        safe_pr_requested = analyzed_events[1]
        safe_pr_prepare_events = await run_worker(safe_pr, safe_pr_requested, db)
        safe_pr_patch_prepared = safe_pr_prepare_events[0]
        ai_diff_events = await run_worker(ai_diff, safe_pr_patch_prepared, db)
        diff_explained = ai_diff_events[0]
        safe_pr_ready = ai_diff_events[1]
        repo_events = await run_worker(repo, safe_pr_ready, db)
        safe_pr_created = repo_events[0]
        alert_requested = repo_events[1]
        alert_events = await run_worker(alert, alert_requested, db)
        command_requested = alert_events[1]
        command_events = await run_worker(command, command_requested, db)

        events = [
            accepted.event,
            git_changed,
            rendered,
            desired_diff,
            *analyzed_events,
            safe_pr_patch_prepared,
            diff_explained,
            safe_pr_ready,
            safe_pr_created,
            alert_requested,
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
            EventSubject.SAFE_PR_PATCH_PREPARED,
            EventSubject.DIFF_EXPLAINED,
            EventSubject.SAFE_PR_READY_FOR_CREATION,
            EventSubject.SAFE_PR_CREATED,
            EventSubject.ALERT_REQUESTED,
            EventSubject.ALERT_DISPATCHED,
            EventSubject.COMMAND_REQUESTED,
            EventSubject.COMMAND_DISPATCHED,
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
        ]
        assert {evt.correlation_id for evt in events} == {accepted.event.correlation_id}
        assert git_changed.causation_id == accepted.event.event_id
        assert rendered.causation_id == git_changed.event_id
        assert desired_diff.causation_id == rendered.event_id
        assert analyzed_events[0].causation_id == desired_diff.event_id
        assert safe_pr_requested.causation_id == desired_diff.event_id
        assert safe_pr_patch_prepared.causation_id == safe_pr_requested.event_id
        assert diff_explained.causation_id == safe_pr_patch_prepared.event_id
        assert safe_pr_ready.causation_id == safe_pr_patch_prepared.event_id
        assert safe_pr_created.causation_id == safe_pr_ready.event_id
        assert alert_requested.causation_id == safe_pr_ready.event_id
        assert alert_events[0].causation_id == alert_requested.event_id
        assert command_requested.causation_id == alert_requested.event_id
        assert command_events[0].causation_id == command_requested.event_id
        assert db.called("save_repo_change")
        assert db.called("save_pull_request")
        assert db.called("queue_agent_command")

    asyncio.run(run())
