"""승격 파이프라인·글로벌 서비스 — deploy_policy 룰로 표준 파이프라인 재진입 검증."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from conftest import ROOT, load_file

from domains.gitops.events import GitWebhookReceivedBody, WorkflowRunCompletedBody
from domains.target.events import ClusterDesiredStateChangedBody


def load_controller():
    return load_file(
        ROOT / "src" / "services" / "gitops" / "workflow-controller" / "app.py",
        "test_promotion_controller",
    )


class StubGitopsDb:
    """승격/글로벌 훅이 쓰는 저장소 표면만 구현한 대역."""

    def __init__(self) -> None:
        self.bindings: dict[str, dict] = {}
        self.runs: dict[str, dict] = {}
        self.step_details: dict[tuple[str, str], dict] = {}
        self.applications: dict[str, dict] = {}
        self.registered: list[dict] = []
        self.registrations: dict[str, dict] = {}

    async def get_cluster_registration(self, workspace_id: str, cluster_id: str):
        row = self.registrations.get(cluster_id)
        return dict(row) if row and row["workspace_id"] == workspace_id else None

    async def get_deployment_binding(self, workspace_id: str, binding_id: str):
        row = self.bindings.get(binding_id)
        return dict(row) if row and row["workspace_id"] == workspace_id else None

    async def list_repository_deployment_bindings(self, workspace_id: str, repository_id: str):
        return [
            dict(b)
            for b in self.bindings.values()
            if b["workspace_id"] == workspace_id and b["repository_id"] == repository_id
        ]

    async def list_workspace_deployment_bindings(self, workspace_id: str):
        return [dict(b) for b in self.bindings.values() if b["workspace_id"] == workspace_id]

    async def get_workflow_run(self, workflow_run_id: str):
        row = self.runs.get(workflow_run_id)
        return dict(row) if row else None

    async def get_workflow_step_details(self, workflow_run_id: str, name: str):
        return self.step_details.get((workflow_run_id, name))

    async def get_application(self, workspace_id: str, application_id: str):
        return self.applications.get(application_id)

    async def latest_succeeded_run_for_binding(self, workspace_id: str, binding_id: str):
        for run in self.runs.values():
            if run["binding_id"] == binding_id and run["status"] == "succeeded":
                return dict(run)
        return None

    async def register_deployment_binding(self, payload: dict):
        binding_id = f"bind-{payload['cluster_id']}"
        row = {
            "binding_id": binding_id,
            "workspace_id": payload["workspace_id"],
            "repository_id": payload["repository_id"],
            "watch_target_id": payload.get("watch_target_id") or "watch-1",
            "cluster_id": payload["cluster_id"],
            "namespace": payload["namespace"],
            "app_name": payload["app_name"],
            "manifest_path": payload["manifest_path"],
            "environment": payload["environment"],
            "deploy_policy": dict(payload.get("deploy_policy") or {}),
            "access_policy": {},
        }
        self.bindings[binding_id] = row
        self.registered.append(row)
        return dict(row)


def binding(
    binding_id: str,
    cluster_id: str,
    *,
    environment: str = "sandbox",
    deploy_policy: dict | None = None,
) -> dict:
    return {
        "binding_id": binding_id,
        "workspace_id": "ws-1",
        "repository_id": "repo-1",
        "watch_target_id": "watch-1",
        "cluster_id": cluster_id,
        "namespace": "sandbox",
        "app_name": "checkout-api",
        "manifest_path": "deploy.yaml",
        "environment": environment,
        "deploy_policy": deploy_policy or {},
        "access_policy": {},
    }


def collect(handler_iter):
    async def run():
        return [body async for body in handler_iter]

    return asyncio.run(run())


def test_run_completion_promotes_to_target_binding() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-staging"] = binding(
        "bind-staging", "cluster-staging", deploy_policy={"promotes_to_binding_id": "bind-prod"}
    )
    db.bindings["bind-prod"] = binding("bind-prod", "cluster-prod", environment="production")
    db.runs["run-1"] = {
        "workflow_run_id": "run-1",
        "binding_id": "bind-staging",
        "commit_sha": "abc123",
        "status": "succeeded",
    }
    db.step_details[("run-1", "diff")] = {
        "desired_image": "ghcr.io/acme/checkout:v2",
        "basis": {"replicas": 3},
    }
    db.applications["app-1"] = {"repo_ref": "acme/final", "default_branch": "main"}

    bodies = collect(
        module.on_run_completed_promote(
            WorkflowRunCompletedBody(
                workflow_run_id="run-1",
                application_id="app-1",
                workspace_id="ws-1",
                binding_id="bind-staging",
                environment="sandbox",
            ),
            SimpleNamespace(db=db, correlation_id="corr-1"),
        )
    )

    assert len(bodies) == 1
    webhook = bodies[0]
    assert isinstance(webhook, GitWebhookReceivedBody)
    assert webhook.binding_id == "bind-prod"
    assert webhook.cluster_id == "cluster-prod"
    assert webhook.environment == "production"
    assert webhook.commit_sha == "abc123"
    assert webhook.image == "ghcr.io/acme/checkout:v2"  # 실제 적용된 이미지 그대로
    assert webhook.replicas == 3


def test_promotion_skips_when_target_run_already_exists() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-staging"] = binding(
        "bind-staging", "cluster-staging", deploy_policy={"promotes_to_binding_id": "bind-prod"}
    )
    db.bindings["bind-prod"] = binding("bind-prod", "cluster-prod", environment="production")
    db.runs["run-1"] = {
        "workflow_run_id": "run-1",
        "binding_id": "bind-staging",
        "commit_sha": "abc123",
        "status": "succeeded",
    }
    # 대상 run 이 이미 존재(순환·재전달) — derive 규칙으로 어떤 run_id 든 존재 응답
    db.get_workflow_run = lambda run_id: _always_run(run_id)  # type: ignore[method-assign]

    async def _always_run(run_id: str):
        return {"workflow_run_id": run_id, "binding_id": "any", "commit_sha": "abc123"}

    bodies = collect(
        module.on_run_completed_promote(
            WorkflowRunCompletedBody(
                workflow_run_id="run-1",
                application_id="app-1",
                workspace_id="ws-1",
                binding_id="bind-staging",
                environment="sandbox",
            ),
            SimpleNamespace(db=db, correlation_id="corr-1"),
        )
    )
    assert bodies == []


def test_webhook_fans_out_to_global_bindings_once() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-main"] = binding("bind-main", "cluster-a")
    db.bindings["bind-g1"] = binding(
        "bind-g1", "cluster-b", deploy_policy={"global": True, "manifest_source": "helm"}
    )
    db.bindings["bind-g2"] = binding(
        "bind-g2", "cluster-c", deploy_policy={"global": True, "manifest_source": "helm"}
    )

    evt = GitWebhookReceivedBody(
        commit_sha="sha-1",
        image="ghcr.io/acme/agent:v1",
        replicas=2,
        workspace_id="ws-1",
        repository_id="repo-1",
        repo_ref="acme/final",
        branch="main",
        binding_id="bind-main",
        application_id="app-1",
        cluster_id="cluster-a",
        manifest_path="deploy.yaml",
    )
    bodies = collect(
        module.fanout_global_bindings(evt, SimpleNamespace(db=db, correlation_id="corr-1"))
    )

    assert {b.binding_id for b in bodies} == {"bind-g1", "bind-g2"}
    assert all(b.commit_sha == "sha-1" and b.image == "ghcr.io/acme/agent:v1" for b in bodies)
    assert {b.source_type for b in bodies} == {"helm"}

    # 자식(global 바인딩 대상) 웹훅은 재확장하지 않는다 — 증폭 1단 종결
    child = bodies[0]
    again = collect(
        module.fanout_global_bindings(child, SimpleNamespace(db=db, correlation_id="corr-2"))
    )
    assert again == []


def test_webhook_global_fanout_skips_existing_management_binding() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-main"] = binding("bind-main", "cluster-a")
    db.bindings["bind-target"] = binding("bind-target", "cluster-b", deploy_policy={"global": True})
    db.bindings["bind-management"] = binding(
        "bind-management", "kubernetes-ops", deploy_policy={"global": True}
    )
    db.registrations["cluster-b"] = {
        "workspace_id": "ws-1",
        "cluster_id": "cluster-b",
        "settings": {"cluster_role": "target"},
    }
    db.registrations["kubernetes-ops"] = {
        "workspace_id": "ws-1",
        "cluster_id": "kubernetes-ops",
        "settings": {"cluster_role": "management"},
    }
    evt = GitWebhookReceivedBody(
        commit_sha="sha-1",
        image="ghcr.io/acme/agent:v1",
        replicas=2,
        workspace_id="ws-1",
        repository_id="repo-1",
        repo_ref="acme/final",
        branch="main",
        binding_id="bind-main",
        application_id="app-1",
        cluster_id="cluster-a",
        manifest_path="deploy.yaml",
    )

    bodies = collect(
        module.fanout_global_bindings(evt, SimpleNamespace(db=db, correlation_id="corr-1"))
    )

    assert [body.binding_id for body in bodies] == ["bind-target"]


def test_new_cluster_attaches_global_bindings_and_triggers_initial_deploy() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-g1"] = binding("bind-g1", "cluster-a", deploy_policy={"global": True})
    db.runs["run-old"] = {
        "workflow_run_id": "run-old",
        "application_id": "app-1",
        "binding_id": "bind-g1",
        "commit_sha": "sha-9",
        "status": "succeeded",
    }
    db.step_details[("run-old", "diff")] = {"desired_image": "ghcr.io/acme/agent:v1", "basis": {}}
    db.applications["app-1"] = {"repo_ref": "acme/final", "default_branch": "main"}

    evt = ClusterDesiredStateChangedBody(
        cluster_id="cluster-new",
        desired_state_version="v1",
        components=[],
        reason="target registered",
        workspace_id="ws-1",
    )
    bodies = collect(
        module.on_cluster_registered_attach_globals(
            evt, SimpleNamespace(db=db, correlation_id="corr-1")
        )
    )

    # 새 클러스터용 바인딩이 생성되고(global 유지), 초기 배포 웹훅이 나간다
    assert any(r["cluster_id"] == "cluster-new" for r in db.registered)
    created = next(r for r in db.registered if r["cluster_id"] == "cluster-new")
    assert created["deploy_policy"] == {"global": True}
    assert len(bodies) == 1
    assert bodies[0].cluster_id == "cluster-new"
    assert bodies[0].commit_sha == "sha-9"
    assert bodies[0].image == "ghcr.io/acme/agent:v1"


def test_cluster_event_with_other_reason_is_ignored() -> None:
    module = load_controller()
    db = StubGitopsDb()
    evt = ClusterDesiredStateChangedBody(
        cluster_id="cluster-new",
        desired_state_version="v1",
        components=[],
        reason="policy updated",
        workspace_id="ws-1",
    )
    bodies = collect(
        module.on_cluster_registered_attach_globals(
            evt, SimpleNamespace(db=db, correlation_id="corr-1")
        )
    )
    assert bodies == []
    assert db.registered == []


def test_management_cluster_event_does_not_attach_global_bindings() -> None:
    module = load_controller()
    db = StubGitopsDb()
    db.bindings["bind-g1"] = binding("bind-g1", "cluster-a", deploy_policy={"global": True})
    db.registrations["kubernetes-ops"] = {
        "workspace_id": "ws-1",
        "cluster_id": "kubernetes-ops",
        "settings": {"cluster_role": "management"},
    }
    evt = ClusterDesiredStateChangedBody(
        cluster_id="kubernetes-ops",
        desired_state_version="v1",
        components=[],
        reason="target registered",
        workspace_id="ws-1",
    )

    bodies = collect(
        module.on_cluster_registered_attach_globals(
            evt, SimpleNamespace(db=db, correlation_id="corr-management")
        )
    )

    assert bodies == []
    assert db.registered == []
