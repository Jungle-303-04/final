"""Observed YAML Git delivery orchestration.

The service never connects to a target cluster.  Its GitOps port must use the
existing outbound-agent boundary.  A stage advances only after its provider
returns concrete evidence, and completion additionally requires the observed
merge revision and Kubernetes ``resourceVersion``.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import asdict, dataclass

from packages.config.environments import normalize_environment
from packages.config.settings import env
from packages.contracts.gitops import (
    WorkflowMutation,
    WorkflowRunStatus,
    WorkflowStepStatus,
)
from packages.contracts.parity import OperationEventKind
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
    WorkspaceDeliveryPolicy,
    WorkspaceDeliveryPolicyPort,
    WorkspaceDeliveryTier,
    YamlDeliveryFailureCode,
    YamlDeliveryGitOpsPort,
    YamlDeliveryLedger,
    YamlDeliveryOutcomeStatus,
    YamlDeliveryPortError,
    YamlDeliveryRequest,
    YamlDeliveryResult,
    YamlDeliveryScmPort,
    YamlDeliveryStage,
    require_commit_evidence,
    require_merge_evidence,
    require_pull_request_evidence,
    require_sync_receipt,
)

YAML_DELIVERY_POLL_INTERVAL_SECONDS_ENV = "YAML_DELIVERY_POLL_INTERVAL_SECONDS"
YAML_DELIVERY_STAGE_TIMEOUT_SECONDS_ENV = "YAML_DELIVERY_STAGE_TIMEOUT_SECONDS"
DEFAULT_YAML_DELIVERY_POLL_INTERVAL_SECONDS = 2.0
DEFAULT_YAML_DELIVERY_STAGE_TIMEOUT_SECONDS = 300.0
_PRODUCTION_ENVIRONMENTS = frozenset({"prod", "production"})

Sleep = Callable[[float], Awaitable[None]]
Monotonic = Callable[[], float]


@dataclass(frozen=True)
class YamlDeliveryPollingPolicy:
    interval_seconds: float
    stage_timeout_seconds: float

    def __post_init__(self) -> None:
        if self.interval_seconds <= 0:
            raise ValueError("YAML delivery poll interval must be positive")
        if self.stage_timeout_seconds < self.interval_seconds:
            raise ValueError("YAML delivery timeout must include at least one poll interval")

    @classmethod
    def from_env(cls) -> YamlDeliveryPollingPolicy:
        return cls(
            interval_seconds=float(
                env(
                    YAML_DELIVERY_POLL_INTERVAL_SECONDS_ENV,
                    str(DEFAULT_YAML_DELIVERY_POLL_INTERVAL_SECONDS),
                )
            ),
            stage_timeout_seconds=float(
                env(
                    YAML_DELIVERY_STAGE_TIMEOUT_SECONDS_ENV,
                    str(DEFAULT_YAML_DELIVERY_STAGE_TIMEOUT_SECONDS),
                )
            ),
        )


@dataclass(frozen=True)
class _StageCheckpoint:
    status: str
    evidence: dict[str, object]


class StoredWorkspaceDeliveryPolicyResolver:
    """Resolve auto-merge only from the stored cluster/workspace policy authority."""

    def __init__(self, ledger: YamlDeliveryLedger) -> None:
        self.ledger = ledger

    async def resolve(self, request: YamlDeliveryRequest) -> WorkspaceDeliveryPolicy:
        registration = await self.ledger.get_cluster_registration(
            request.workspace_id,
            request.cluster_id,
        )
        if not isinstance(registration, Mapping):
            return WorkspaceDeliveryPolicy(
                tier=WorkspaceDeliveryTier.PROTECTED,
                auto_merge=False,
                authority="cluster_registration:missing",
            )
        stored_environment = _policy_environment(registration.get("environment"))
        requested_environment = _policy_environment(request.environment)
        authority = (
            f"cluster_registration:{request.workspace_id}:{request.cluster_id}:"
            f"{stored_environment or 'unknown'}"
        )
        if stored_environment != requested_environment:
            return WorkspaceDeliveryPolicy(
                tier=WorkspaceDeliveryTier.PROTECTED,
                auto_merge=False,
                authority=f"{authority}:environment_mismatch",
            )
        tier = _delivery_tier(stored_environment)
        settings = registration.get("settings")
        yaml_policy = settings.get("yaml_delivery") if isinstance(settings, Mapping) else None
        explicit_auto_merge = (
            yaml_policy.get("auto_merge") if isinstance(yaml_policy, Mapping) else None
        )
        configured_auto_merge = (
            explicit_auto_merge
            if isinstance(explicit_auto_merge, bool)
            else explicit_auto_merge is None
        )
        auto_merge = (
            tier
            in {
                WorkspaceDeliveryTier.DEVELOPMENT,
                WorkspaceDeliveryTier.DEMO,
            }
            and configured_auto_merge
        )
        return WorkspaceDeliveryPolicy(
            tier=tier,
            auto_merge=auto_merge,
            authority=authority,
        )


class YamlDeliveryOrchestrator:
    def __init__(
        self,
        *,
        ledger: YamlDeliveryLedger,
        scm: YamlDeliveryScmPort,
        gitops: YamlDeliveryGitOpsPort,
        policy: WorkspaceDeliveryPolicyPort | None = None,
        polling: YamlDeliveryPollingPolicy | None = None,
        sleep: Sleep = asyncio.sleep,
        monotonic: Monotonic = time.monotonic,
    ) -> None:
        self.ledger = ledger
        self.scm = scm
        self.gitops = gitops
        self.policy = policy or StoredWorkspaceDeliveryPolicyResolver(ledger)
        self.polling = polling or YamlDeliveryPollingPolicy.from_env()
        self.sleep = sleep
        self.monotonic = monotonic

    async def execute(self, request: YamlDeliveryRequest) -> YamlDeliveryResult:
        existing = await self.ledger.get_workflow_run(request.workflow_run_id)
        if existing is None:
            started = await self._start(request)
            if not started:
                existing = await self.ledger.get_workflow_run(request.workflow_run_id)
                if existing is None:
                    raise YamlDeliveryPortError(
                        YamlDeliveryFailureCode.LEDGER_CONFLICT,
                        "workflow start was rejected without a durable run",
                    )
        if existing is not None:
            self._require_owned_run(existing, request)
            terminal = await self._terminal_result(existing, request)
            if terminal is not None:
                return terminal

        stage = YamlDeliveryStage.VALIDATION
        try:
            delivery_policy = await self.policy.resolve(request)
            validation = await self._validation(request)
            stage = YamlDeliveryStage.COMMIT
            commit = await self._commit(request, validation)
            stage = YamlDeliveryStage.PR
            pull_request = await self._pull_request(request, commit)
            stage = YamlDeliveryStage.MERGE
            merge = await self._merge(request, commit, pull_request, delivery_policy)
            if merge is None:
                return YamlDeliveryResult(
                    operation_id=request.operation_id,
                    workflow_run_id=request.workflow_run_id,
                    status=YamlDeliveryOutcomeStatus.REVIEW_REQUIRED,
                    stage=YamlDeliveryStage.MERGE,
                    evidence={
                        "pr_url": pull_request.url,
                        "pr_number": pull_request.number,
                        "policy_authority": delivery_policy.authority,
                    },
                )
            stage = YamlDeliveryStage.SYNC
            receipt, synced = await self._sync(request, merge)
            stage = YamlDeliveryStage.ROLLOUT
            observed = await self._rollout(request, merge, synced)
            stage = YamlDeliveryStage.DONE
            return await self._complete(
                request,
                commit=commit,
                pull_request=pull_request,
                merge=merge,
                receipt=receipt,
                observed=observed,
            )
        except YamlDeliveryPortError as exc:
            return await self._fail(request, stage, exc.code, str(exc))
        except ValueError:
            return await self._fail(
                request,
                stage,
                YamlDeliveryFailureCode.EVIDENCE_INVALID,
                "provider evidence did not match the verified delivery contract",
            )
        except Exception:
            return await self._fail(
                request,
                stage,
                YamlDeliveryFailureCode.PROVIDER_ERROR,
                "delivery provider operation failed",
            )

    async def get_result(self, request: YamlDeliveryRequest) -> YamlDeliveryResult:
        run = await self.ledger.get_workflow_run(request.workflow_run_id)
        if run is None:
            raise LookupError("YAML delivery workflow was not found")
        self._require_owned_run(run, request)
        terminal = await self._terminal_result(run, request)
        if terminal is not None:
            return terminal
        checkpoints = await self._checkpoints(request)
        stage = _latest_stage(checkpoints) or YamlDeliveryStage.VALIDATION
        status = (
            YamlDeliveryOutcomeStatus.REVIEW_REQUIRED
            if checkpoints.get(YamlDeliveryStage.MERGE, _StageCheckpoint("", {})).status
            == YamlDeliveryOutcomeStatus.REVIEW_REQUIRED.value
            else YamlDeliveryOutcomeStatus.IN_PROGRESS
        )
        return YamlDeliveryResult(
            operation_id=request.operation_id,
            workflow_run_id=request.workflow_run_id,
            status=status,
            stage=stage,
            evidence=checkpoints.get(stage, _StageCheckpoint("", {})).evidence,
        )

    async def _start(self, request: YamlDeliveryRequest) -> bool:
        mutation = await self.ledger.start_workflow_run(
            {
                **_identity(request),
                "commit_sha": request.source_revision,
                "status": WorkflowRunStatus.STARTED.value,
                "current_step": YamlDeliveryStage.VALIDATION.value,
                "summary": "validating approved YAML change",
                "metadata": _run_metadata(request),
            }
        )
        return isinstance(mutation, WorkflowMutation) and mutation.applied

    async def _validation(self, request: YamlDeliveryRequest) -> ValidationEvidence:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.VALIDATION)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            return ValidationEvidence(**checkpoint.evidence)
        await self._mark_running(request, YamlDeliveryStage.VALIDATION)
        evidence = await self.scm.validate_change(request)
        if (
            evidence.source_revision != request.source_revision
            or evidence.desired_sha256 != request.desired_sha256
            or not evidence.validation_id.strip()
        ):
            raise ValueError("validation evidence mismatch")
        await self._record_success(request, YamlDeliveryStage.VALIDATION, asdict(evidence))
        return evidence

    async def _commit(
        self,
        request: YamlDeliveryRequest,
        validation: ValidationEvidence,
    ) -> CommitEvidence:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.COMMIT)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            evidence = CommitEvidence(**checkpoint.evidence)
            require_commit_evidence(evidence)
            return evidence
        await self._mark_running(request, YamlDeliveryStage.COMMIT)
        evidence = await self.scm.commit_change(request, validation)
        require_commit_evidence(evidence)
        await self._record_success(request, YamlDeliveryStage.COMMIT, asdict(evidence))
        return evidence

    async def _pull_request(
        self,
        request: YamlDeliveryRequest,
        commit: CommitEvidence,
    ) -> PullRequestEvidence:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.PR)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            evidence = PullRequestEvidence(**checkpoint.evidence)
            require_pull_request_evidence(evidence)
            return evidence
        await self._mark_running(request, YamlDeliveryStage.PR)
        evidence = await self.scm.create_pull_request(request, commit)
        require_pull_request_evidence(evidence)
        if evidence.head_sha != commit.commit_sha or evidence.base_sha != request.source_revision:
            raise ValueError("pull request revision mismatch")
        await self._record_success(request, YamlDeliveryStage.PR, asdict(evidence))
        return evidence

    async def _merge(
        self,
        request: YamlDeliveryRequest,
        commit: CommitEvidence,
        pull_request: PullRequestEvidence,
        policy: WorkspaceDeliveryPolicy,
    ) -> MergeEvidence | None:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.MERGE)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            evidence = MergeEvidence(**checkpoint.evidence)
            require_merge_evidence(evidence)
            return evidence
        state = await self.scm.get_pull_request(request, pull_request)
        self._validate_pull_request_state(state, commit)
        if state.merged:
            evidence = _merge_from_observed_state(state)
            await self._record_success(request, YamlDeliveryStage.MERGE, asdict(evidence))
            return evidence
        if not policy.auto_merge:
            if checkpoint is None or checkpoint.status != YamlDeliveryOutcomeStatus.REVIEW_REQUIRED:
                await self._record_review_required(request, pull_request, policy)
            return None

        await self._mark_running(request, YamlDeliveryStage.MERGE)
        state = await self._wait_for_mergeable(request, pull_request, commit, state)
        if state.merged:
            evidence = _merge_from_observed_state(state)
        else:
            evidence = await self.scm.merge_pull_request(
                request,
                pull_request,
                expected_head_sha=commit.commit_sha,
            )
        require_merge_evidence(evidence)
        if evidence.head_sha != commit.commit_sha:
            raise ValueError("merge head revision mismatch")
        await self._record_success(request, YamlDeliveryStage.MERGE, asdict(evidence))
        return evidence

    async def _sync(
        self,
        request: YamlDeliveryRequest,
        merge: MergeEvidence,
    ) -> tuple[GitOpsSyncReceipt, GitOpsObservation]:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.SYNC)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            receipt = GitOpsSyncReceipt(**_mapping(checkpoint.evidence["receipt"]))
            observation = _observation_from_mapping(checkpoint.evidence["observation"])
            require_sync_receipt(receipt)
            return receipt, observation
        running_receipt = None
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.RUNNING.value:
            value = checkpoint.evidence.get("receipt")
            if isinstance(value, Mapping):
                running_receipt = GitOpsSyncReceipt(**dict(value))
        if running_receipt is None:
            await self._mark_running(request, YamlDeliveryStage.SYNC)
            running_receipt = await self.gitops.request_sync(
                request,
                revision=merge.merge_sha,
            )
            require_sync_receipt(running_receipt)
            if running_receipt.revision != merge.merge_sha:
                raise ValueError("GitOps sync receipt revision mismatch")
            await self._record_running_evidence(
                request,
                YamlDeliveryStage.SYNC,
                {"receipt": asdict(running_receipt)},
            )
        observation = await self._wait_for_sync(request, merge.merge_sha)
        evidence = {
            "receipt": asdict(running_receipt),
            "observation": asdict(observation),
        }
        await self._record_success(request, YamlDeliveryStage.SYNC, evidence)
        return running_receipt, observation

    async def _rollout(
        self,
        request: YamlDeliveryRequest,
        merge: MergeEvidence,
        initial: GitOpsObservation,
    ) -> GitOpsObservation:
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.ROLLOUT)
        if checkpoint is not None and checkpoint.status == WorkflowStepStatus.SUCCEEDED.value:
            return _observation_from_mapping(checkpoint.evidence)
        await self._mark_running(request, YamlDeliveryStage.ROLLOUT)
        observation = await self._wait_for_rollout(request, merge.merge_sha, initial)
        await self._record_success(request, YamlDeliveryStage.ROLLOUT, asdict(observation))
        return observation

    async def _complete(
        self,
        request: YamlDeliveryRequest,
        *,
        commit: CommitEvidence,
        pull_request: PullRequestEvidence,
        merge: MergeEvidence,
        receipt: GitOpsSyncReceipt,
        observed: GitOpsObservation,
    ) -> YamlDeliveryResult:
        evidence: dict[str, object] = {
            "commit_sha": commit.commit_sha,
            "pr_url": pull_request.url,
            "pr_number": pull_request.number,
            "merge_sha": merge.merge_sha,
            "sync_id": receipt.sync_id,
            "sync_revision": observed.sync_revision,
            "resource_version": observed.resource_version or "",
        }
        if (
            observed.sync_revision != merge.merge_sha
            or observed.observed_revision != merge.merge_sha
            or not observed.resource_version
        ):
            raise ValueError("completion observation mismatch")
        checkpoint = await self._checkpoint(request, YamlDeliveryStage.DONE)
        if checkpoint is None:
            await self._record_step(
                request,
                YamlDeliveryStage.DONE,
                WorkflowStepStatus.SUCCEEDED.value,
                evidence,
            )
            mutation = await self.ledger.update_workflow_run(
                {
                    **_identity(request),
                    "status": WorkflowRunStatus.SUCCEEDED.value,
                    "current_step": YamlDeliveryStage.DONE.value,
                    "summary": "YAML delivery observed at target resource",
                    "metadata": {**_run_metadata(request), "evidence": evidence},
                }
            )
            _require_mutation(mutation, "workflow completion")
            await self._publish(
                request,
                "completed",
                YamlDeliveryStage.DONE,
                WorkflowStepStatus.SUCCEEDED.value,
                evidence,
            )
        return YamlDeliveryResult(
            operation_id=request.operation_id,
            workflow_run_id=request.workflow_run_id,
            status=YamlDeliveryOutcomeStatus.COMPLETED,
            stage=YamlDeliveryStage.DONE,
            evidence=evidence,
        )

    async def _fail(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
        code: YamlDeliveryFailureCode,
        message: str,
    ) -> YamlDeliveryResult:
        evidence: dict[str, object] = {"failure_code": code.value, "message": message}
        checkpoint = await self._checkpoint(request, stage)
        if checkpoint is None or checkpoint.status not in {
            WorkflowStepStatus.SUCCEEDED.value,
            WorkflowStepStatus.FAILED.value,
        }:
            await self._record_step(
                request,
                stage,
                WorkflowStepStatus.FAILED.value,
                evidence,
            )
        mutation = await self.ledger.update_workflow_run(
            {
                **_identity(request),
                "status": WorkflowRunStatus.FAILED.value,
                "current_step": stage.value,
                "summary": message,
                "metadata": {**_run_metadata(request), "failure": evidence},
            }
        )
        if mutation.applied:
            await self._publish(
                request,
                "failed",
                stage,
                WorkflowStepStatus.FAILED.value,
                evidence,
            )
        return YamlDeliveryResult(
            operation_id=request.operation_id,
            workflow_run_id=request.workflow_run_id,
            status=YamlDeliveryOutcomeStatus.FAILED,
            stage=stage,
            evidence=evidence,
            failure_code=code,
            message=message,
        )

    async def _wait_for_mergeable(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
        commit: CommitEvidence,
        initial: PullRequestState,
    ) -> PullRequestState:
        deadline = self.monotonic() + self.polling.stage_timeout_seconds
        state = initial
        while True:
            self._validate_pull_request_state(state, commit)
            if state.merged or (
                state.checks is PullRequestChecksStatus.SUCCEEDED and state.mergeable is True
            ):
                return state
            await self._wait_or_timeout(deadline, YamlDeliveryStage.MERGE)
            state = await self.scm.get_pull_request(request, pull_request)

    async def _wait_for_sync(
        self,
        request: YamlDeliveryRequest,
        revision: str,
    ) -> GitOpsObservation:
        deadline = self.monotonic() + self.polling.stage_timeout_seconds
        while True:
            observed = await self.gitops.observe(request, revision=revision)
            _require_controller_available(observed)
            if observed.sync_status is GitOpsSyncStatus.FAILED:
                raise YamlDeliveryPortError(
                    YamlDeliveryFailureCode.SYNC_FAILED,
                    observed.message or "GitOps synchronization failed",
                )
            if (
                observed.observed_revision == revision
                and observed.sync_revision == revision
                and observed.sync_status is GitOpsSyncStatus.SYNCED
            ):
                return observed
            await self._wait_or_timeout(deadline, YamlDeliveryStage.SYNC)

    async def _wait_for_rollout(
        self,
        request: YamlDeliveryRequest,
        revision: str,
        initial: GitOpsObservation,
    ) -> GitOpsObservation:
        deadline = self.monotonic() + self.polling.stage_timeout_seconds
        observed = initial
        while True:
            _require_controller_available(observed)
            if observed.health_status is GitOpsHealthStatus.DEGRADED:
                raise YamlDeliveryPortError(
                    YamlDeliveryFailureCode.ROLLOUT_UNHEALTHY,
                    observed.message or "GitOps rollout is unhealthy",
                )
            if (
                observed.observed_revision == revision
                and observed.sync_revision == revision
                and observed.sync_status is GitOpsSyncStatus.SYNCED
                and observed.health_status is GitOpsHealthStatus.HEALTHY
                and bool(observed.resource_version)
            ):
                return observed
            await self._wait_or_timeout(deadline, YamlDeliveryStage.ROLLOUT)
            observed = await self.gitops.observe(request, revision=revision)

    async def _wait_or_timeout(
        self,
        deadline: float,
        stage: YamlDeliveryStage,
    ) -> None:
        remaining = deadline - self.monotonic()
        if remaining <= 0:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.TIMEOUT,
                f"YAML delivery {stage.value} timed out",
            )
        await self.sleep(min(self.polling.interval_seconds, remaining))

    def _validate_pull_request_state(
        self,
        state: PullRequestState,
        commit: CommitEvidence,
    ) -> None:
        if state.head_sha != commit.commit_sha:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONFLICT,
                "pull request head changed after validation",
            )
        if state.checks is PullRequestChecksStatus.FAILED:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CI_FAILED,
                state.reason or "pull request checks failed",
            )
        if state.mergeable is False and not state.merged:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONFLICT,
                state.reason or "pull request has a merge conflict",
            )
        if state.merged and state.checks is not PullRequestChecksStatus.SUCCEEDED:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CI_FAILED,
                "merged pull request lacks successful checks evidence",
            )

    async def _mark_running(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
    ) -> None:
        checkpoint = await self._checkpoint(request, stage)
        if checkpoint is not None:
            return
        await self._record_step(request, stage, WorkflowStepStatus.RUNNING.value, {})
        await self._transition_current(request, stage)
        await self._publish(request, "progress", stage, WorkflowStepStatus.RUNNING.value, {})

    async def _record_running_evidence(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
        evidence: dict[str, object],
    ) -> None:
        # A workflow step cannot transition RUNNING -> RUNNING in the guarded
        # relational ledger.  Keep the initial state there and append richer
        # evidence to the immutable operation ledger, which is also the resume
        # checkpoint read by ``_checkpoints``.
        await self._publish(request, "progress", stage, WorkflowStepStatus.RUNNING.value, evidence)

    async def _record_success(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
        evidence: dict[str, object],
    ) -> None:
        await self._record_step(request, stage, WorkflowStepStatus.SUCCEEDED.value, evidence)
        await self._transition_current(request, stage)
        await self._publish(
            request, "progress", stage, WorkflowStepStatus.SUCCEEDED.value, evidence
        )

    async def _record_review_required(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
        policy: WorkspaceDeliveryPolicy,
    ) -> None:
        evidence: dict[str, object] = {
            "pull_request": asdict(pull_request),
            "policy": asdict(policy),
        }
        await self._record_step(
            request,
            YamlDeliveryStage.MERGE,
            WorkflowStepStatus.PENDING.value,
            evidence,
            delivery_status=YamlDeliveryOutcomeStatus.REVIEW_REQUIRED.value,
        )
        mutation = await self.ledger.update_workflow_run(
            {
                **_identity(request),
                "status": WorkflowRunStatus.WAITING_FOR_APPROVAL.value,
                "current_step": YamlDeliveryStage.MERGE.value,
                "summary": "pull request review required",
                "metadata": {**_run_metadata(request), "review": evidence},
            }
        )
        _require_mutation(mutation, "review-required transition")
        await self._publish(
            request,
            "progress",
            YamlDeliveryStage.MERGE,
            YamlDeliveryOutcomeStatus.REVIEW_REQUIRED.value,
            evidence,
        )

    async def _record_step(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
        step_status: str,
        evidence: dict[str, object],
        *,
        delivery_status: str | None = None,
    ) -> None:
        mutation = await self.ledger.record_workflow_step(
            {
                **_identity(request),
                "name": stage.value,
                "status": step_status,
                "message": delivery_status or step_status,
                "details": {
                    "delivery_status": delivery_status or step_status,
                    "evidence": evidence,
                },
            }
        )
        _require_mutation(mutation, f"{stage.value} step")

    async def _transition_current(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
    ) -> None:
        status = None
        if stage is YamlDeliveryStage.MERGE:
            status = WorkflowRunStatus.APPLYING.value
        elif stage is YamlDeliveryStage.ROLLOUT:
            status = WorkflowRunStatus.ROLLOUT_WAITING.value
        payload: dict[str, object] = {
            **_identity(request),
            "current_step": stage.value,
            "summary": f"YAML delivery {stage.value}",
            "metadata": _run_metadata(request),
        }
        if status is not None:
            # The guarded repository deliberately rejects same-status writes.
            # Auto-merge and rollout success revisit the same stage after its
            # RUNNING transition, so update the stage projection without
            # resubmitting an already-applied workflow status.
            run = await self.ledger.get_workflow_run(request.workflow_run_id)
            if not isinstance(run, Mapping) or str(run.get("status") or "") != status:
                payload["status"] = status
        mutation = await self.ledger.update_workflow_run(payload)
        _require_mutation(mutation, f"{stage.value} workflow transition")

    async def _publish(
        self,
        request: YamlDeliveryRequest,
        kind: OperationEventKind,
        stage: YamlDeliveryStage,
        status: str,
        evidence: dict[str, object],
    ) -> None:
        event = await self.ledger.append_command_operation_event(
            request.workspace_id,
            request.operation_id,
            kind,
            {
                "cluster_id": request.cluster_id,
                "operation_id": request.operation_id,
                "workflow_run_id": request.workflow_run_id,
                "stage": stage.value,
                "status": status,
                "evidence": evidence,
            },
        )
        if event is None:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.LEDGER_CONFLICT,
                "operation ledger rejected a non-idempotent stage event",
            )

    async def _checkpoint(
        self,
        request: YamlDeliveryRequest,
        stage: YamlDeliveryStage,
    ) -> _StageCheckpoint | None:
        return (await self._checkpoints(request)).get(stage)

    async def _checkpoints(
        self,
        request: YamlDeliveryRequest,
    ) -> dict[YamlDeliveryStage, _StageCheckpoint]:
        checkpoints: dict[YamlDeliveryStage, _StageCheckpoint] = {}
        events = await self.ledger.list_command_operation_events(
            request.workspace_id,
            request.operation_id,
        )
        for event in events:
            payload = event.payload
            try:
                stage = YamlDeliveryStage(str(payload.get("stage") or ""))
            except ValueError:
                continue
            evidence = payload.get("evidence")
            checkpoints[stage] = _StageCheckpoint(
                status=str(payload.get("status") or ""),
                evidence=dict(evidence) if isinstance(evidence, Mapping) else {},
            )
        for stage in YamlDeliveryStage:
            if stage in checkpoints:
                continue
            details = await self.ledger.get_workflow_step_details(
                request.workflow_run_id,
                stage.value,
            )
            if not isinstance(details, Mapping):
                continue
            evidence = details.get("evidence")
            checkpoints[stage] = _StageCheckpoint(
                status=str(details.get("delivery_status") or ""),
                evidence=dict(evidence) if isinstance(evidence, Mapping) else {},
            )
        return checkpoints

    async def _terminal_result(
        self,
        run: Mapping[str, object],
        request: YamlDeliveryRequest,
    ) -> YamlDeliveryResult | None:
        status = str(run.get("status") or "")
        checkpoints = await self._checkpoints(request)
        if status == WorkflowRunStatus.SUCCEEDED.value:
            done = checkpoints.get(YamlDeliveryStage.DONE)
            if done is None or not done.evidence.get("resource_version"):
                raise RuntimeError("completed YAML delivery lacks observed resource evidence")
            return YamlDeliveryResult(
                operation_id=request.operation_id,
                workflow_run_id=request.workflow_run_id,
                status=YamlDeliveryOutcomeStatus.COMPLETED,
                stage=YamlDeliveryStage.DONE,
                evidence=done.evidence,
            )
        if status == WorkflowRunStatus.FAILED.value:
            stage = _latest_stage(checkpoints) or YamlDeliveryStage.VALIDATION
            evidence = checkpoints.get(stage, _StageCheckpoint("", {})).evidence
            raw_code = str(evidence.get("failure_code") or "provider_error")
            try:
                failure_code = YamlDeliveryFailureCode(raw_code)
            except ValueError:
                failure_code = YamlDeliveryFailureCode.PROVIDER_ERROR
            return YamlDeliveryResult(
                operation_id=request.operation_id,
                workflow_run_id=request.workflow_run_id,
                status=YamlDeliveryOutcomeStatus.FAILED,
                stage=stage,
                evidence=evidence,
                failure_code=failure_code,
                message=str(evidence.get("message") or "delivery failed"),
            )
        return None

    @staticmethod
    def _require_owned_run(
        run: Mapping[str, object],
        request: YamlDeliveryRequest,
    ) -> None:
        metadata = run.get("metadata")
        delivery = metadata.get("yaml_delivery") if isinstance(metadata, Mapping) else None
        expected = _run_metadata(request)["yaml_delivery"]
        if not isinstance(delivery, Mapping) or any(
            str(delivery.get(key) or "") != str(value) for key, value in expected.items()
        ):
            raise RuntimeError("workflow run belongs to another delivery operation")


def _delivery_tier(environment: str) -> WorkspaceDeliveryTier:
    if environment == "development":
        return WorkspaceDeliveryTier.DEVELOPMENT
    if environment == "demo":
        return WorkspaceDeliveryTier.DEMO
    if environment in _PRODUCTION_ENVIRONMENTS:
        return WorkspaceDeliveryTier.PRODUCTION
    return WorkspaceDeliveryTier.PROTECTED


def _policy_environment(environment: object) -> str:
    normalized = normalize_environment(environment)
    if normalized == "dev":
        return "development"
    if normalized == "prod":
        return "production"
    return normalized


def _identity(request: YamlDeliveryRequest) -> dict[str, object]:
    return {
        "workflow_run_id": request.workflow_run_id,
        "workspace_id": request.workspace_id,
        "application_id": request.application_id,
        "binding_id": request.binding_id,
        "environment": request.environment,
        "cluster_id": request.cluster_id,
    }


def _run_metadata(request: YamlDeliveryRequest) -> dict[str, object]:
    return {
        "yaml_delivery": {
            "operation_id": request.operation_id,
            "change_ref": request.change_ref,
            "repository_id": request.repository_id,
            "manifest_path": request.manifest_path,
            "desired_sha256": request.desired_sha256,
        }
    }


def _require_mutation(mutation: object, operation: str) -> None:
    if not isinstance(mutation, WorkflowMutation) or not mutation.applied:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.LEDGER_CONFLICT,
            f"workflow ledger rejected {operation}",
        )


def _require_controller_available(observation: GitOpsObservation) -> None:
    if not observation.controller_online:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.CONTROLLER_OFFLINE,
            observation.message or "GitOps controller is offline",
        )


def _merge_from_observed_state(state: PullRequestState) -> MergeEvidence:
    if not state.merge_sha or not state.merged_at:
        raise ValueError("merged pull request lacks merge evidence")
    evidence = MergeEvidence(
        merge_sha=state.merge_sha,
        head_sha=state.head_sha,
        merged_at=state.merged_at,
    )
    require_merge_evidence(evidence)
    return evidence


def _latest_stage(
    checkpoints: Mapping[YamlDeliveryStage, _StageCheckpoint],
) -> YamlDeliveryStage | None:
    return next(
        (stage for stage in reversed(tuple(YamlDeliveryStage)) if stage in checkpoints), None
    )


def _mapping(value: object) -> dict[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError("delivery evidence must be an object")
    return dict(value)


def _observation_from_mapping(value: object) -> GitOpsObservation:
    evidence = _mapping(value)
    return GitOpsObservation(
        controller_online=bool(evidence.get("controller_online")),
        observed_revision=str(evidence.get("observed_revision") or ""),
        sync_revision=str(evidence.get("sync_revision") or ""),
        sync_status=GitOpsSyncStatus(str(evidence.get("sync_status") or "")),
        health_status=GitOpsHealthStatus(str(evidence.get("health_status") or "")),
        resource_version=(
            str(evidence["resource_version"])
            if evidence.get("resource_version") is not None
            else None
        ),
        message=str(evidence["message"]) if evidence.get("message") is not None else None,
    )
