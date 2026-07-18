from __future__ import annotations

import asyncio
import json

import httpx

from domains.gitops.yaml_delivery import YamlDeliveryPollingPolicy
from domains.manifest_editor.yaml_delivery import ExistingSafePrScmPort
from packages.contracts.security import SecretRef
from packages.contracts.yaml_delivery import (
    PullRequestChecksStatus,
    YamlDeliveryRequest,
)


def request() -> YamlDeliveryRequest:
    return YamlDeliveryRequest(
        operation_id="event-yaml-1",
        workflow_run_id="workflow-yaml-1",
        workspace_id="workspace-1",
        application_id="application-1",
        binding_id="binding-1",
        environment="development",
        cluster_id="cluster-1",
        repository_id="repository-1",
        repo_ref="project/checkout",
        base_branch="main",
        manifest_path="deploy/app.yaml",
        change_ref="approval-yaml-1",
        source_revision="a" * 40,
        desired_sha256=f"sha256:{'d' * 64}",
    )


class ApprovalDb:
    async def get_workflow_approval(
        self,
        approval_id: str,
        workspace_id: str,
    ) -> dict[str, object]:
        delivery = request()
        assert approval_id == delivery.change_ref
        assert workspace_id == delivery.workspace_id
        return {
            "status": "granted",
            "workflow_run_id": delivery.workflow_run_id,
            "binding_id": delivery.binding_id,
            "application_id": delivery.application_id,
            "details": {
                "repository_id": delivery.repository_id,
                "manifest_path": delivery.manifest_path,
                "base_sha": delivery.source_revision,
                "desired_sha256": delivery.desired_sha256,
            },
        }

    async def get_workflow_step_details(
        self,
        workflow_run_id: str,
        name: str,
    ) -> dict[str, object]:
        assert workflow_run_id == request().workflow_run_id
        assert name == "safe_pr"
        return {"pr_url": "https://github.example/project/checkout/pull/7"}

    async def get_workflow_run(self, _workflow_run_id: str) -> None:
        return None


class StaticTokenVault:
    def read_token(self, ref: SecretRef) -> str:
        assert ref.value
        return "github-token"


def test_existing_safe_pr_adapter_pins_head_and_never_forces_merge() -> None:
    merged = False
    merge_body: dict[str, object] = {}

    def handler(provider_request: httpx.Request) -> httpx.Response:
        nonlocal merged, merge_body
        path = provider_request.url.path
        if path == "/repos/project/checkout/pulls/7" and provider_request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "number": 7,
                    "html_url": "https://github.example/project/checkout/pull/7",
                    "head": {"ref": "gitops/workflow-yaml-1", "sha": "b" * 40},
                    "base": {"ref": "main", "sha": "a" * 40},
                    "mergeable": True,
                    "mergeable_state": "clean",
                    "merged": merged,
                    "merge_commit_sha": "c" * 40 if merged else None,
                    "merged_at": "2026-07-18T10:00:00Z" if merged else None,
                },
            )
        if path.endswith(f"/commits/{'b' * 40}/check-runs"):
            return httpx.Response(
                200,
                json={
                    "check_runs": [
                        {"status": "completed", "conclusion": "success"},
                    ],
                },
            )
        if path.endswith(f"/commits/{'b' * 40}/status"):
            return httpx.Response(200, json={"state": "success"})
        if path == "/repos/project/checkout/pulls/7/merge":
            merge_body = json.loads(provider_request.content)
            merged = True
            return httpx.Response(200, json={"merged": True, "sha": "c" * 40})
        return httpx.Response(404)

    delivery = request()
    port = ExistingSafePrScmPort(
        ApprovalDb(),  # type: ignore[arg-type]
        polling=YamlDeliveryPollingPolicy(interval_seconds=0.01, stage_timeout_seconds=1),
        token_vault=StaticTokenVault(),
        transport=httpx.MockTransport(handler),
    )

    async def execute() -> tuple[object, object, object, object, object]:
        validation = await port.validate_change(delivery)
        commit = await port.commit_change(delivery, validation)
        pull_request = await port.create_pull_request(delivery, commit)
        state = await port.get_pull_request(delivery, pull_request)
        merge = await port.merge_pull_request(
            delivery,
            pull_request,
            expected_head_sha=commit.commit_sha,
        )
        return validation, commit, pull_request, state, merge

    validation, commit, pull_request, state, merge = asyncio.run(execute())

    assert validation.validation_id == delivery.change_ref
    assert commit.commit_sha == "b" * 40
    assert pull_request.base_sha == delivery.source_revision
    assert state.checks is PullRequestChecksStatus.SUCCEEDED
    assert merge.head_sha == commit.commit_sha
    assert merge.merge_sha == "c" * 40
    assert merge_body == {"sha": commit.commit_sha}
