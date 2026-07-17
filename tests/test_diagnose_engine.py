"""Evidence engine guards exact identity and terminal lifecycle state."""

from __future__ import annotations

import asyncio
from typing import Any

import domains.diagnose.engine as diagnose_engine
from packages.contracts.diagnose import (
    DiagnoseAgentSelection,
    DiagnoseEvent,
    DiagnoseEventDraft,
    DiagnoseRun,
    DiagnoseRunCreateRequest,
    DiagnoseRunTransition,
    DiagnoseTarget,
)
from packages.contracts.gateway.responses import AiChatResponse
from packages.contracts.parity import ClusterScope, ResourceRef


def run(status: str = "running") -> DiagnoseRun:
    return DiagnoseRun.from_create_request(
        run_id="run-1",
        request=DiagnoseRunCreateRequest(
            target=DiagnoseTarget(
                scope=ClusterScope(
                    workspace_id="workspace-a",
                    cluster_id="cluster-a",
                    namespaces=("shop",),
                ),
                resource=ResourceRef(
                    api_group="apps",
                    version="v1",
                    kind="Deployment",
                    namespace="shop",
                    name="checkout",
                    uid="uid-checkout",
                ),
            ),
            agent=DiagnoseAgentSelection(
                agent_id=diagnose_engine.DIAGNOSE_AGENT_ID,
                isolated=True,
            ),
        ),
        requested_by="operator-a",
        status=status,
    )


class Db:
    def get_inventory_resource_by_api_version(self, **_identity: Any) -> dict[str, str]:
        return {"uid": "uid-checkout"}


class Repository:
    def __init__(self, current: DiagnoseRun) -> None:
        self.current = current
        self.appended: list[DiagnoseEventDraft] = []

    async def get_run(self, **_identity: Any) -> DiagnoseRun:
        return self.current

    async def append_event(
        self,
        current: DiagnoseRun,
        event: DiagnoseEventDraft,
    ) -> DiagnoseEvent:
        self.appended.append(event)
        return DiagnoseEvent(
            run_id=current.run_id,
            sequence=len(self.appended),
            kind=event.kind,
            payload=event.payload,
            occurred_at=event.occurred_at,
        )

    async def transition(
        self,
        current: DiagnoseRun,
        *,
        next_status: str,
        event: DiagnoseEventDraft,
        **_kwargs: Any,
    ) -> DiagnoseRunTransition:
        changed = current.model_copy(update={"status": next_status})
        persisted = await self.append_event(changed, event)
        self.current = changed
        return DiagnoseRunTransition(run=changed, changed=True, event=persisted)


class Stream:
    def __init__(self) -> None:
        self.events: list[DiagnoseEvent] = []

    async def publish(self, event: DiagnoseEvent, **_scope: Any) -> None:
        self.events.append(event)


def test_engine_does_not_append_a_verdict_after_user_stop(monkeypatch: Any) -> None:
    async def answer(*_args: Any, **_kwargs: Any) -> AiChatResponse:
        return AiChatResponse(
            answer="late verdict",
            evidence=[],
            answer_kind="capability",
        )

    async def scenario() -> None:
        current = run("stopped")
        repository = Repository(current)
        stream = Stream()
        monkeypatch.setattr(diagnose_engine, "answer_from_context", answer)
        engine = diagnose_engine.ContextDiagnoseEngine(
            db=Db(),
            current=object(),
            repository=repository,
            stream=stream,
            llm=None,
        )

        await engine._execute(run(), "question", initial=False)

        assert repository.appended == []
        assert stream.events == []

    asyncio.run(scenario())


def test_engine_marks_unsupported_resource_kinds_unavailable() -> None:
    async def scenario() -> None:
        candidate = run().model_copy(
            update={
                "target": DiagnoseTarget(
                    scope=run().target.scope,
                    resource=run().target.resource.model_copy(update={"kind": "Widget"}),
                )
            }
        )
        engine = diagnose_engine.ContextDiagnoseEngine(
            db=Db(),
            current=object(),
            repository=Repository(candidate),
            stream=Stream(),
            llm=None,
        )
        availability = await engine.availability(
            target=candidate.target,
            agent=candidate.agent,
        )
        assert availability.available is False
        assert "not supported" in str(availability.reason)

    asyncio.run(scenario())
