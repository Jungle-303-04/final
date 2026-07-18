from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass

from domains.gitops.yaml_delivery import (
    StoredWorkspaceDeliveryPolicyResolver,
    YamlDeliveryOrchestrator,
    YamlDeliveryPollingPolicy,
)
from packages.contracts.gitops import WorkflowMutation, WorkflowRunStatus
from packages.contracts.parity import OperationEvent, OperationEventKind
from packages.contracts.yaml_delivery import (
    CommitEvidence,
    GitOpsHealthStatus,
    GitOpsObservation,
    GitOpsSyncReceipt,
    GitOpsSyncStatus,
    MergeEvidence,
    PullRequestChecksStatus,
    PullRequestEvidence,
    PullRequestState,
    ValidationEvidence,
    WorkspaceDeliveryTier,
    YamlDeliveryFailureCode,
    YamlDeliveryOutcomeStatus,
    YamlDeliveryRequest,
    YamlDeliveryStage,
)

SOURCE_SHA = "1111111111111111111111111111111111111111"
COMMIT_SHA = "2222222222222222222222222222222222222222"
MERGE_SHA = "3333333333333333333333333333333333333333"


def request(*, environment: str = "demo") -> YamlDeliveryRequest:
    return YamlDeliveryRequest(
        operation_id="operation-yaml-1",
        workflow_run_id="workflow-yaml-1",
        workspace_id="workspace-1",
        application_id="application-1",
        binding_id="binding-1",
        environment=environment,
        cluster_id="cluster-1",
        repository_id="repository-1",
        repo_ref="organization/repository",
        base_branch="dev",
        manifest_path="deploy/app.yaml",
        change_ref="manifest-edit-1",
        source_revision=SOURCE_SHA,
        desired_sha256="sha256:" + ("a" * 64),
    )


class MemoryDeliveryLedger:
    def __init__(
        self,
        *,
        registration_environment: str = "demo",
        auto_merge: bool | None = None,
    ) -> None:
        settings: dict[str, object] = {}
        if auto_merge is not None:
            settings["yaml_delivery"] = {"auto_merge": auto_merge}
        self.registration: dict[str, object] = {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "environment": registration_environment,
            "settings": settings,
        }
        self.run: dict[str, object] | None = None
        self.steps: dict[str, dict[str, object]] = {}
        self.events: list[OperationEvent] = []

    async def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> Mapping[str, object] | None:
        if (
            workspace_id != self.registration["workspace_id"]
            or cluster_id != self.registration["cluster_id"]
        ):
            return None
        return self.registration

    async def get_workflow_run(self, workflow_run_id: str) -> Mapping[str, object] | None:
        if self.run is None or self.run.get("workflow_run_id") != workflow_run_id:
            return None
        return self.run

    async def get_workflow_step_details(
        self,
        workflow_run_id: str,
        name: str,
    ) -> Mapping[str, object] | None:
        if self.run is None or self.run.get("workflow_run_id") != workflow_run_id:
            return None
        step = self.steps.get(name)
        return step.get("details") if step is not None else None

    async def start_workflow_run(self, payload: dict[str, object]) -> WorkflowMutation:
        if self.run is not None:
            return WorkflowMutation(applied=False)
        self.run = dict(payload)
        return WorkflowMutation(applied=True)

    async def update_workflow_run(self, payload: dict[str, object]) -> WorkflowMutation:
        if self.run is None:
            return WorkflowMutation(applied=False)
        if str(self.run.get("status")) in {
            WorkflowRunStatus.SUCCEEDED.value,
            WorkflowRunStatus.FAILED.value,
        }:
            return WorkflowMutation(applied=False)
        if "status" in payload and self.run.get("status") == payload["status"]:
            return WorkflowMutation(applied=False)
        self.run.update(payload)
        return WorkflowMutation(applied=True)

    async def record_workflow_step(self, payload: dict[str, object]) -> WorkflowMutation:
        name = str(payload["name"])
        current = self.steps.get(name)
        if current is not None and current.get("status") == payload.get("status"):
            return WorkflowMutation(applied=False)
        self.steps[name] = dict(payload)
        return WorkflowMutation(applied=True)

    async def append_command_operation_event(
        self,
        workspace_id: str,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent | None:
        if workspace_id != "workspace-1" or command_id != "operation-yaml-1":
            return None
        if self.events and self.events[-1].kind in {"completed", "failed", "cancelled"}:
            return None
        event = OperationEvent(
            command_id=command_id,
            sequence=len(self.events) + 1,
            kind=kind,
            payload=payload,
        )
        self.events.append(event)
        return event

    async def list_command_operation_events(
        self,
        workspace_id: str,
        command_id: str,
        *,
        after_sequence: int = 0,
        limit: int = 500,
    ) -> list[OperationEvent]:
        return [
            event
            for event in self.events
            if event.command_id == command_id and event.sequence > after_sequence
        ][:limit]


class ScmSpy:
    def __init__(self, states: list[PullRequestState] | None = None) -> None:
        self.states = states or [
            PullRequestState(
                head_sha=COMMIT_SHA,
                checks=PullRequestChecksStatus.SUCCEEDED,
                mergeable=True,
            )
        ]
        self.merge_calls: list[str] = []

    async def validate_change(self, delivery: YamlDeliveryRequest) -> ValidationEvidence:
        return ValidationEvidence(
            validation_id="validation-1",
            source_revision=delivery.source_revision,
            desired_sha256=delivery.desired_sha256,
        )

    async def commit_change(
        self,
        delivery: YamlDeliveryRequest,
        validation: ValidationEvidence,
    ) -> CommitEvidence:
        return CommitEvidence(commit_sha=COMMIT_SHA, branch="opsia/yaml-operation-1")

    async def create_pull_request(
        self,
        delivery: YamlDeliveryRequest,
        commit: CommitEvidence,
    ) -> PullRequestEvidence:
        return PullRequestEvidence(
            number=17,
            url="https://github.example/org/repository/pull/17",
            head_sha=commit.commit_sha,
            base_sha=delivery.source_revision,
        )

    async def get_pull_request(
        self,
        delivery: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
    ) -> PullRequestState:
        if len(self.states) > 1:
            return self.states.pop(0)
        return self.states[0]

    async def merge_pull_request(
        self,
        delivery: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
        *,
        expected_head_sha: str,
    ) -> MergeEvidence:
        self.merge_calls.append(expected_head_sha)
        return MergeEvidence(
            merge_sha=MERGE_SHA,
            head_sha=expected_head_sha,
            merged_at="2026-07-18T00:00:00Z",
        )


class GitOpsSpy:
    def __init__(self, observations: list[GitOpsObservation] | None = None) -> None:
        self.observations = observations or [healthy_observation()]
        self.sync_calls: list[str] = []

    async def request_sync(
        self,
        delivery: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsSyncReceipt:
        self.sync_calls.append(revision)
        return GitOpsSyncReceipt(sync_id="sync-1", revision=revision)

    async def observe(
        self,
        delivery: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsObservation:
        if len(self.observations) > 1:
            return self.observations.pop(0)
        return self.observations[0]


@dataclass
class FakeClock:
    current: float = 0.0

    def monotonic(self) -> float:
        return self.current

    async def sleep(self, seconds: float) -> None:
        self.current += seconds


def healthy_observation(
    *,
    revision: str = MERGE_SHA,
    resource_version: str | None = "resource-version-9",
) -> GitOpsObservation:
    return GitOpsObservation(
        controller_online=True,
        observed_revision=revision,
        sync_revision=revision,
        sync_status=GitOpsSyncStatus.SYNCED,
        health_status=GitOpsHealthStatus.HEALTHY,
        resource_version=resource_version,
    )


def orchestrator(
    ledger: MemoryDeliveryLedger,
    scm: ScmSpy,
    gitops: GitOpsSpy,
    *,
    clock: FakeClock | None = None,
) -> YamlDeliveryOrchestrator:
    timer = clock or FakeClock()
    return YamlDeliveryOrchestrator(
        ledger=ledger,
        scm=scm,
        gitops=gitops,
        polling=YamlDeliveryPollingPolicy(interval_seconds=1, stage_timeout_seconds=3),
        sleep=timer.sleep,
        monotonic=timer.monotonic,
    )


def test_demo_delivery_records_real_evidence_before_completion() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy()
    gitops = GitOpsSpy(
        [
            GitOpsObservation(
                controller_online=True,
                observed_revision=SOURCE_SHA,
                sync_revision=SOURCE_SHA,
                sync_status=GitOpsSyncStatus.PENDING,
                health_status=GitOpsHealthStatus.PROGRESSING,
            ),
            healthy_observation(),
        ]
    )

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.status is YamlDeliveryOutcomeStatus.COMPLETED
    assert result.stage is YamlDeliveryStage.DONE
    assert result.evidence == {
        "commit_sha": COMMIT_SHA,
        "pr_url": "https://github.example/org/repository/pull/17",
        "pr_number": 17,
        "merge_sha": MERGE_SHA,
        "sync_id": "sync-1",
        "sync_revision": MERGE_SHA,
        "resource_version": "resource-version-9",
    }
    assert scm.merge_calls == [COMMIT_SHA]
    assert gitops.sync_calls == [MERGE_SHA]
    assert ledger.run is not None
    assert ledger.run["status"] == WorkflowRunStatus.SUCCEEDED.value
    assert ledger.events[-1].kind == "completed"
    assert [event.payload["stage"] for event in ledger.events if event.kind == "progress"] == [
        "validation",
        "validation",
        "commit",
        "commit",
        "pr",
        "pr",
        "merge",
        "merge",
        "sync",
        "sync",
        "sync",
        "rollout",
        "rollout",
    ]

    restored = asyncio.run(orchestrator(ledger, scm, gitops).get_result(request()))
    assert restored == result


def test_production_policy_requires_review_even_when_setting_requests_auto_merge() -> None:
    ledger = MemoryDeliveryLedger(registration_environment="production", auto_merge=True)
    scm = ScmSpy()
    gitops = GitOpsSpy()
    delivery = request(environment="production")

    policy = asyncio.run(StoredWorkspaceDeliveryPolicyResolver(ledger).resolve(delivery))
    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(delivery))

    assert policy.tier is WorkspaceDeliveryTier.PRODUCTION
    assert policy.auto_merge is False
    assert result.status is YamlDeliveryOutcomeStatus.REVIEW_REQUIRED
    assert result.stage is YamlDeliveryStage.MERGE
    assert scm.merge_calls == []
    assert gitops.sync_calls == []
    assert ledger.run is not None
    assert ledger.run["status"] == WorkflowRunStatus.WAITING_FOR_APPROVAL.value


def test_review_required_delivery_resumes_only_after_observed_manual_merge() -> None:
    ledger = MemoryDeliveryLedger(registration_environment="production")
    scm = ScmSpy()
    gitops = GitOpsSpy()
    delivery = request(environment="production")
    service = orchestrator(ledger, scm, gitops)

    first = asyncio.run(service.execute(delivery))
    scm.states = [
        PullRequestState(
            head_sha=COMMIT_SHA,
            checks=PullRequestChecksStatus.SUCCEEDED,
            mergeable=True,
            merged=True,
            merge_sha=MERGE_SHA,
            merged_at="2026-07-18T00:00:00Z",
        )
    ]
    second = asyncio.run(service.execute(delivery))

    assert first.status is YamlDeliveryOutcomeStatus.REVIEW_REQUIRED
    assert second.status is YamlDeliveryOutcomeStatus.COMPLETED
    assert scm.merge_calls == []
    assert gitops.sync_calls == [MERGE_SHA]


def test_ci_failure_never_merges_or_syncs() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy(
        [
            PullRequestState(
                head_sha=COMMIT_SHA,
                checks=PullRequestChecksStatus.FAILED,
                mergeable=True,
                reason="required check failed",
            )
        ]
    )
    gitops = GitOpsSpy()

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.CI_FAILED
    assert result.stage is YamlDeliveryStage.MERGE
    assert scm.merge_calls == []
    assert gitops.sync_calls == []


def test_head_change_is_reported_as_conflict_without_merge() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy(
        [
            PullRequestState(
                head_sha="4444444444444444444444444444444444444444",
                checks=PullRequestChecksStatus.SUCCEEDED,
                mergeable=True,
            )
        ]
    )
    gitops = GitOpsSpy()

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.CONFLICT
    assert scm.merge_calls == []
    assert gitops.sync_calls == []


def test_controller_offline_fails_with_explicit_reason() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy()
    gitops = GitOpsSpy(
        [
            GitOpsObservation(
                controller_online=False,
                observed_revision="",
                sync_revision="",
                sync_status=GitOpsSyncStatus.PENDING,
                health_status=GitOpsHealthStatus.UNKNOWN,
                message="agent has not observed the GitOps controller",
            )
        ]
    )

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.CONTROLLER_OFFLINE
    assert result.stage is YamlDeliveryStage.SYNC
    assert "controller" in str(result.message)


def test_degraded_rollout_fails_after_exact_sync_revision() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy()
    gitops = GitOpsSpy(
        [
            GitOpsObservation(
                controller_online=True,
                observed_revision=MERGE_SHA,
                sync_revision=MERGE_SHA,
                sync_status=GitOpsSyncStatus.SYNCED,
                health_status=GitOpsHealthStatus.DEGRADED,
                message="deployment rollout is degraded",
            )
        ]
    )

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.ROLLOUT_UNHEALTHY
    assert result.stage is YamlDeliveryStage.ROLLOUT


def test_pending_checks_timeout_without_force_merge() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy(
        [
            PullRequestState(
                head_sha=COMMIT_SHA,
                checks=PullRequestChecksStatus.PENDING,
                mergeable=None,
            )
        ]
    )
    gitops = GitOpsSpy()

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.TIMEOUT
    assert result.stage is YamlDeliveryStage.MERGE
    assert scm.merge_calls == []
    assert gitops.sync_calls == []


def test_healthy_without_resource_version_never_reports_fake_completion() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy()
    gitops = GitOpsSpy([healthy_observation(resource_version=None)])

    result = asyncio.run(orchestrator(ledger, scm, gitops).execute(request()))

    assert result.failure_code is YamlDeliveryFailureCode.TIMEOUT
    assert result.stage is YamlDeliveryStage.ROLLOUT
    assert result.status is YamlDeliveryOutcomeStatus.FAILED
    assert all(event.kind != "completed" for event in ledger.events)


def test_environment_mismatch_fails_closed_to_protected_review() -> None:
    ledger = MemoryDeliveryLedger(registration_environment="demo")
    delivery = request(environment="development")

    policy = asyncio.run(StoredWorkspaceDeliveryPolicyResolver(ledger).resolve(delivery))

    assert policy.tier is WorkspaceDeliveryTier.PROTECTED
    assert policy.auto_merge is False
    assert policy.authority.endswith("environment_mismatch")


def test_environment_aliases_share_the_same_delivery_policy() -> None:
    ledger = MemoryDeliveryLedger(registration_environment="dev")

    policy = asyncio.run(
        StoredWorkspaceDeliveryPolicyResolver(ledger).resolve(request(environment="development"))
    )

    assert policy.tier is WorkspaceDeliveryTier.DEVELOPMENT
    assert policy.auto_merge is True


def test_malformed_auto_merge_setting_fails_closed() -> None:
    ledger = MemoryDeliveryLedger(registration_environment="demo")
    ledger.registration["settings"] = {"yaml_delivery": {"auto_merge": "true"}}

    policy = asyncio.run(StoredWorkspaceDeliveryPolicyResolver(ledger).resolve(request()))

    assert policy.tier is WorkspaceDeliveryTier.DEMO
    assert policy.auto_merge is False


def test_delivery_contract_exposes_no_force_merge_parameter() -> None:
    import inspect

    parameters = inspect.signature(ScmSpy.merge_pull_request).parameters

    assert "force" not in parameters
    assert parameters["expected_head_sha"].kind is inspect.Parameter.KEYWORD_ONLY


def test_operation_identity_cannot_reuse_an_unrelated_workflow() -> None:
    ledger = MemoryDeliveryLedger()
    ledger.run = {
        "workflow_run_id": "workflow-yaml-1",
        "status": WorkflowRunStatus.STARTED.value,
        "metadata": {"yaml_delivery": {"operation_id": "another-operation"}},
    }

    try:
        asyncio.run(orchestrator(ledger, ScmSpy(), GitOpsSpy()).execute(request()))
    except RuntimeError as exc:
        assert "another delivery operation" in str(exc)
    else:
        raise AssertionError("unrelated workflow reuse must fail closed")


def test_concurrent_start_rejection_resumes_the_owned_durable_run() -> None:
    class RacingStartLedger(MemoryDeliveryLedger):
        async def get_workflow_run(
            self,
            workflow_run_id: str,
        ) -> Mapping[str, object] | None:
            if self.run is None and not hasattr(self, "initial_read_completed"):
                self.initial_read_completed = True
                return None
            return await super().get_workflow_run(workflow_run_id)

        async def start_workflow_run(self, payload: dict[str, object]) -> WorkflowMutation:
            self.run = dict(payload)
            return WorkflowMutation(applied=False)

    ledger = RacingStartLedger()

    result = asyncio.run(orchestrator(ledger, ScmSpy(), GitOpsSpy()).execute(request()))

    assert result.status is YamlDeliveryOutcomeStatus.COMPLETED


def test_failure_result_remains_queryable_from_persisted_ledgers() -> None:
    ledger = MemoryDeliveryLedger()
    scm = ScmSpy(
        [
            PullRequestState(
                head_sha=COMMIT_SHA,
                checks=PullRequestChecksStatus.FAILED,
                mergeable=True,
            )
        ]
    )
    service = orchestrator(ledger, scm, GitOpsSpy())

    failed = asyncio.run(service.execute(request()))
    restored = asyncio.run(service.get_result(request()))

    assert restored.status is YamlDeliveryOutcomeStatus.FAILED
    assert restored.failure_code is YamlDeliveryFailureCode.CI_FAILED
    assert restored.stage is failed.stage
    assert restored.evidence == failed.evidence
