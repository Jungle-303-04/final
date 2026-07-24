from __future__ import annotations

from conftest import load_service, run_handler

from domains.command.events import CommandQueuedForAgentBody


class StandaloneCommandDb:
    async def get_workflow_run(self, workflow_run_id: str) -> None:
        assert workflow_run_id == "workflow-manifest-edit-standalone"
        return None

    async def upsert_application(self, payload: object) -> None:
        raise AssertionError("standalone commands must not synthesize GitOps applications")


def test_standalone_manifest_command_does_not_create_gitops_run() -> None:
    service = load_service("gitops/workflow-controller")
    event = CommandQueuedForAgentBody(
        command_id="command-a",
        cluster_id="cluster-a",
        workspace_id="workspace-a",
        application_id="application-a",
        workflow_run_id="workflow-manifest-edit-standalone",
        binding_id="binding-a",
        environment="production",
        direct_execution=True,
        direct_execution_confirmed=True,
    )

    assert run_handler(service.on_command_queued, event, StandaloneCommandDb()) == []
