"""Production adapters for source-pinned YAML delivery.

The API gateway owns orchestration only. Safe PR creation remains in the
existing event workers and every cluster operation continues through the
outbound agent command boundary.
"""

from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Mapping
from typing import Any

import httpx

from domains.gitops.detail_router import (
    _gitops_agent_available,
    create_gitops_resource_action,
    get_gitops_resource_insights,
    resource_action_command_id,
)
from domains.gitops.yaml_delivery import YamlDeliveryOrchestrator, YamlDeliveryPollingPolicy
from packages.config.settings import env
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
    GITHUB_TOKEN_REF_ENV,
)
from packages.contracts.gitops.detail import GitOpsResourceActionRequest, GitOpsSyncOptions
from packages.contracts.parity import OperationEvent, OperationEventKind, ResourceRef
from packages.contracts.security import SecretRef, TokenVaultPort
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
    YamlDeliveryFailureCode,
    YamlDeliveryPortError,
    YamlDeliveryRequest,
)
from packages.runtime.async_db import AsyncDb
from packages.security import SecretNotFound, build_token_vault

_PR_NUMBER_PATTERN = re.compile(r"/pull/(\d+)(?:/|$)")
_FAILED_CHECK_CONCLUSIONS = frozenset(
    {"action_required", "cancelled", "failure", "stale", "timed_out"}
)
_SUCCESS_CHECK_CONCLUSIONS = frozenset({"neutral", "skipped", "success"})
_CLEAN_MERGEABLE_STATES = frozenset({"clean", "has_hooks", "unstable"})


class FanoutYamlDeliveryLedger:
    """Async database facade that also wakes live SSE subscribers."""

    def __init__(self, db: Any, operation_events: Any) -> None:
        self.db = AsyncDb(db)
        self.operation_events = operation_events

    def __getattr__(self, name: str) -> Any:
        return getattr(self.db, name)

    async def append_command_operation_event(
        self,
        workspace_id: str,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent | None:
        event = await self.db.append_command_operation_event(
            workspace_id,
            command_id,
            kind,
            payload,
        )
        announce = getattr(self.operation_events, "announce", None)
        if event is not None and callable(announce):
            await announce(event, workspace_id=workspace_id)
        return event


class ExistingSafePrScmPort:
    """Observe and control the PR created by the existing safe-pr workers."""

    def __init__(
        self,
        db: AsyncDb,
        *,
        polling: YamlDeliveryPollingPolicy,
        token_vault: TokenVaultPort | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.db = db
        self.polling = polling
        self.token_vault = token_vault or build_token_vault()
        self.transport = transport

    async def validate_change(self, request: YamlDeliveryRequest) -> ValidationEvidence:
        approval = await self.db.get_workflow_approval(request.change_ref, request.workspace_id)
        details = approval.get("details") if isinstance(approval, Mapping) else None
        expected_details = {
            "repository_id": request.repository_id,
            "manifest_path": request.manifest_path,
            "base_sha": request.source_revision,
            "desired_sha256": request.desired_sha256,
        }
        expected_approval = {
            "binding_id": request.binding_id,
            "application_id": request.application_id,
        }
        if (
            not isinstance(approval, Mapping)
            or str(approval.get("status") or "") != "granted"
            or str(approval.get("workflow_run_id") or "") != request.workflow_run_id
            or not isinstance(details, Mapping)
            or any(
                str(approval.get(key) or "") != value for key, value in expected_approval.items()
            )
            or any(str(details.get(key) or "") != value for key, value in expected_details.items())
        ):
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.VALIDATION_FAILED,
                "Safe PR approval no longer matches the source-pinned YAML change",
            )
        return ValidationEvidence(
            validation_id=request.change_ref,
            source_revision=request.source_revision,
            desired_sha256=request.desired_sha256,
        )

    async def commit_change(
        self,
        request: YamlDeliveryRequest,
        validation: ValidationEvidence,
    ) -> CommitEvidence:
        pull = await self._pull_request(request)
        return CommitEvidence(
            commit_sha=_nested_text(pull, "head", "sha"),
            branch=_nested_text(pull, "head", "ref"),
        )

    async def create_pull_request(
        self,
        request: YamlDeliveryRequest,
        commit: CommitEvidence,
    ) -> PullRequestEvidence:
        pull = await self._pull_request(request)
        return PullRequestEvidence(
            number=_positive_int(pull.get("number"), "pull request number"),
            url=_required_text(pull.get("html_url"), "pull request URL"),
            head_sha=_nested_text(pull, "head", "sha"),
            base_sha=_nested_text(pull, "base", "sha"),
        )

    async def get_pull_request(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
    ) -> PullRequestState:
        pull = await self._github_pull(request, pull_request.number)
        head_sha = _nested_text(pull, "head", "sha")
        checks = await self._checks_status(request, head_sha, pull)
        return PullRequestState(
            head_sha=head_sha,
            checks=checks,
            mergeable=_optional_bool(pull.get("mergeable")),
            merged=bool(pull.get("merged")),
            merge_sha=_optional_text(pull.get("merge_commit_sha")),
            merged_at=_optional_text(pull.get("merged_at")),
            reason=_optional_text(pull.get("mergeable_state")),
        )

    async def merge_pull_request(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
        *,
        expected_head_sha: str,
    ) -> MergeEvidence:
        async with self._client() as client:
            response = await client.put(
                f"/repos/{request.repo_ref}/pulls/{pull_request.number}/merge",
                json={"sha": expected_head_sha},
            )
            if response.status_code in {409, 422}:
                raise YamlDeliveryPortError(
                    YamlDeliveryFailureCode.CONFLICT,
                    "Pull request changed or became unmergeable after validation",
                )
            _raise_provider_response(response, "merge pull request")
            payload = _response_mapping(response, "merge pull request")
        if payload.get("merged") is not True:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONFLICT,
                _optional_text(payload.get("message")) or "Pull request merge was rejected",
            )
        observed = await self._github_pull(request, pull_request.number)
        merge_sha = _required_text(
            payload.get("sha") or observed.get("merge_commit_sha"),
            "merge SHA",
        )
        return MergeEvidence(
            merge_sha=merge_sha,
            head_sha=expected_head_sha,
            merged_at=_required_text(observed.get("merged_at"), "merge timestamp"),
        )

    async def _pull_request(self, request: YamlDeliveryRequest) -> dict[str, object]:
        deadline = time.monotonic() + self.polling.stage_timeout_seconds
        while True:
            details = await self.db.get_workflow_step_details(request.workflow_run_id, "safe_pr")
            pr_url = _optional_text(details.get("pr_url")) if isinstance(details, Mapping) else None
            if pr_url:
                match = _PR_NUMBER_PATTERN.search(pr_url)
                if match is None:
                    raise YamlDeliveryPortError(
                        YamlDeliveryFailureCode.EVIDENCE_INVALID,
                        "Safe PR worker returned an invalid pull request URL",
                    )
                pull = await self._github_pull(request, int(match.group(1)))
                if _required_text(pull.get("html_url"), "pull request URL") != pr_url:
                    raise YamlDeliveryPortError(
                        YamlDeliveryFailureCode.EVIDENCE_INVALID,
                        "Safe PR URL does not match GitHub observation",
                    )
                return pull
            run = await self.db.get_workflow_run(request.workflow_run_id)
            if isinstance(run, Mapping) and str(run.get("status") or "") == "failed":
                raise YamlDeliveryPortError(
                    YamlDeliveryFailureCode.PROVIDER_ERROR,
                    _optional_text(run.get("summary")) or "Safe PR worker failed",
                )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise YamlDeliveryPortError(
                    YamlDeliveryFailureCode.TIMEOUT,
                    "Safe PR worker did not produce a pull request before timeout",
                )
            await asyncio.sleep(min(self.polling.interval_seconds, remaining))

    async def _github_pull(self, request: YamlDeliveryRequest, number: int) -> dict[str, object]:
        async with self._client() as client:
            response = await client.get(f"/repos/{request.repo_ref}/pulls/{number}")
            _raise_provider_response(response, "read pull request")
            return _response_mapping(response, "read pull request")

    async def _checks_status(
        self,
        request: YamlDeliveryRequest,
        head_sha: str,
        pull: Mapping[str, object],
    ) -> PullRequestChecksStatus:
        async with self._client() as client:
            checks_response, status_response = await asyncio.gather(
                client.get(f"/repos/{request.repo_ref}/commits/{head_sha}/check-runs"),
                client.get(f"/repos/{request.repo_ref}/commits/{head_sha}/status"),
            )
        _raise_provider_response(checks_response, "read pull request checks")
        _raise_provider_response(status_response, "read commit status")
        checks_payload = _response_mapping(checks_response, "read pull request checks")
        status_payload = _response_mapping(status_response, "read commit status")
        runs = checks_payload.get("check_runs")
        check_runs = (
            [item for item in runs if isinstance(item, Mapping)] if isinstance(runs, list) else []
        )
        conclusions = {_optional_text(item.get("conclusion")) for item in check_runs}
        if conclusions.intersection(_FAILED_CHECK_CONCLUSIONS) or status_payload.get("state") in {
            "error",
            "failure",
        }:
            return PullRequestChecksStatus.FAILED
        if any(str(item.get("status") or "") != "completed" for item in check_runs):
            return PullRequestChecksStatus.PENDING
        if check_runs and not conclusions.issubset(_SUCCESS_CHECK_CONCLUSIONS | {None}):
            return PullRequestChecksStatus.PENDING
        combined = str(status_payload.get("state") or "").casefold()
        mergeable_state = str(pull.get("mergeable_state") or "").casefold()
        if combined == "pending":
            return PullRequestChecksStatus.PENDING
        if combined == "success" or mergeable_state in _CLEAN_MERGEABLE_STATES:
            return PullRequestChecksStatus.SUCCEEDED
        return PullRequestChecksStatus.PENDING

    def _client(self) -> httpx.AsyncClient:
        token_ref = env(GITHUB_TOKEN_REF_ENV, GITHUB_TOKEN_ENV).strip() or GITHUB_TOKEN_ENV
        try:
            token = self.token_vault.read_token(SecretRef(token_ref))
        except SecretNotFound as error:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.PROVIDER_ERROR,
                "GitHub credential is unavailable",
            ) from error
        return httpx.AsyncClient(
            base_url=env(GITHUB_API_BASE_ENV, DEFAULT_GITHUB_API_BASE).rstrip("/"),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=20.0,
            transport=self.transport,
        )


class OutboundAgentGitOpsPort:
    """Reuse the canonical GitOps action route and inventory observation."""

    def __init__(
        self,
        db: Any,
        current: Any,
        events: Any,
        operation_events: Any,
    ) -> None:
        self.db = db
        self.async_db = AsyncDb(db)
        self.current = current
        self.events = events
        self.operation_events = operation_events

    async def request_sync(
        self,
        request: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsSyncReceipt:
        resource = await self._application_resource(request)
        namespace = _required_text(resource.get("namespace"), "GitOps application namespace")
        name = _required_text(resource.get("name"), "GitOps application name")
        api_version = _required_text(resource.get("api_version"), "GitOps application API version")
        insights_response = await get_gitops_resource_insights(
            "Application",
            namespace,
            name,
            request.cluster_id,
            api_version,
            self.current,
            self.db,
        )
        capabilities = insights_response.insights.capabilities
        if "sync" not in capabilities.actions:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONTROLLER_OFFLINE,
                "Agent-observed GitOps sync capability is unavailable",
            )
        resource_ref = _resource_ref(resource)
        receipt = await create_gitops_resource_action(
            "Application",
            namespace,
            name,
            GitOpsResourceActionRequest(
                cluster_id=request.cluster_id,
                resource=resource_ref,
                resource_version=_required_text(
                    resource.get("resource_version"),
                    "GitOps application resourceVersion",
                ),
                capability_revision=capabilities.revision,
                action="sync",
                confirmation=True,
                reason=f"Deliver YAML workflow {request.workflow_run_id}",
                options=GitOpsSyncOptions(revision=revision),
            ),
            _gitops_idempotency_key(request),
            self.current,
            self.db,
            self.events,
            self.operation_events,
        )
        return GitOpsSyncReceipt(sync_id=receipt.command_id, revision=revision)

    async def observe(
        self,
        request: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsObservation:
        try:
            resource = await self._application_resource(request)
        except YamlDeliveryPortError as error:
            return GitOpsObservation(
                controller_online=False,
                observed_revision="",
                sync_revision="",
                sync_status=GitOpsSyncStatus.PENDING,
                health_status=GitOpsHealthStatus.UNKNOWN,
                message=str(error),
            )
        connected = await asyncio.to_thread(
            _gitops_agent_available,
            self.db,
            request.workspace_id,
            request.cluster_id,
        )
        command_id = resource_action_command_id(
            request.workspace_id,
            str(self.current.user_id),
            _gitops_idempotency_key(request),
        )
        command = await self.async_db.get_agent_command(command_id, request.workspace_id)
        command_status = str(command.get("status") or "") if isinstance(command, Mapping) else ""
        command_result = command.get("result") if isinstance(command, Mapping) else None
        result_map = command_result if isinstance(command_result, Mapping) else {}
        if command_status in {"cancelled", "failed"}:
            return GitOpsObservation(
                controller_online=connected,
                observed_revision="",
                sync_revision="",
                sync_status=GitOpsSyncStatus.FAILED,
                health_status=GitOpsHealthStatus.UNKNOWN,
                message=_optional_text(result_map.get("message"))
                or f"Agent GitOps command {command_status}",
            )
        raw = resource.get("raw")
        status = raw.get("status") if isinstance(raw, Mapping) else None
        status_map = status if isinstance(status, Mapping) else {}
        sync = status_map.get("sync")
        sync_map = sync if isinstance(sync, Mapping) else {}
        operation_state = status_map.get("operationState")
        operation_map = operation_state if isinstance(operation_state, Mapping) else {}
        sync_result = operation_map.get("syncResult")
        result_map = sync_result if isinstance(sync_result, Mapping) else {}
        observed_revision = _optional_text(result_map.get("revision")) or ""
        sync_revision = _optional_text(sync_map.get("revision")) or ""
        sync_status = _gitops_sync_status(sync_map, operation_map, revision)
        health_status = _gitops_health_status(status_map.get("health"))
        message = _optional_text(operation_map.get("message"))
        return GitOpsObservation(
            controller_online=connected,
            observed_revision=observed_revision,
            sync_revision=sync_revision,
            sync_status=sync_status,
            health_status=health_status,
            resource_version=_optional_text(resource.get("resource_version")),
            message=message,
        )

    async def _application_resource(self, request: YamlDeliveryRequest) -> dict[str, object]:
        application, binding = await asyncio.gather(
            self.async_db.get_application(request.workspace_id, request.application_id),
            self.async_db.get_deployment_binding(request.workspace_id, request.binding_id),
        )
        if not isinstance(application, Mapping) or not isinstance(binding, Mapping):
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONTROLLER_OFFLINE,
                "GitOps application binding is unavailable",
            )
        metadata = application.get("metadata")
        metadata_map = metadata if isinstance(metadata, Mapping) else {}
        deploy_policy = binding.get("deploy_policy")
        policy_map = deploy_policy if isinstance(deploy_policy, Mapping) else {}
        controller_name = str(
            policy_map.get("controller_application_name")
            or metadata_map.get("controller_application_name")
            or application.get("name")
            or ""
        )
        controller_namespace = str(
            policy_map.get("controller_application_namespace")
            or metadata_map.get("controller_application_namespace")
            or binding.get("namespace")
            or ""
        )
        resources = await self.async_db.list_inventory_resources(
            workspace_id=request.workspace_id,
            cluster_id=request.cluster_id,
            resource_type="custom_resource",
            namespace=controller_namespace or None,
            include_deleted=False,
            limit=1000,
        )
        matches = [
            dict(item)
            for item in resources
            if isinstance(item, Mapping)
            and str(item.get("kind") or "").casefold() == "application"
            and str(item.get("api_version") or "").casefold() == "argoproj.io/v1alpha1"
            and str(item.get("name") or "") == controller_name
            and str(item.get("namespace") or "") == controller_namespace
        ]
        if len(matches) != 1:
            raise YamlDeliveryPortError(
                YamlDeliveryFailureCode.CONTROLLER_OFFLINE,
                "Exactly one agent-observed Argo Application is required",
            )
        return matches[0]


def build_yaml_delivery_orchestrator(
    *,
    db: Any,
    current: Any,
    events: Any,
    operation_events: Any,
) -> YamlDeliveryOrchestrator:
    polling = YamlDeliveryPollingPolicy.from_env()
    ledger = FanoutYamlDeliveryLedger(db, operation_events)
    return YamlDeliveryOrchestrator(
        ledger=ledger,
        scm=ExistingSafePrScmPort(ledger.db, polling=polling),
        gitops=OutboundAgentGitOpsPort(db, current, events, operation_events),
        polling=polling,
    )


def _gitops_idempotency_key(request: YamlDeliveryRequest) -> str:
    return f"yaml-delivery:{request.operation_id}"


def _resource_ref(resource: Mapping[str, object]) -> ResourceRef:
    api_version = _required_text(resource.get("api_version"), "resource API version")
    group, _, version = api_version.rpartition("/")
    return ResourceRef(
        api_group=group,
        version=version or api_version,
        kind=_required_text(resource.get("kind"), "resource kind"),
        namespace=_optional_text(resource.get("namespace")),
        name=_required_text(resource.get("name"), "resource name"),
        uid=_required_text(resource.get("uid"), "resource UID"),
    )


def _gitops_sync_status(
    sync: Mapping[str, object],
    operation: Mapping[str, object],
    revision: str,
) -> GitOpsSyncStatus:
    phase = str(operation.get("phase") or "").casefold()
    if phase in {"error", "failed"}:
        return GitOpsSyncStatus.FAILED
    if (
        str(sync.get("status") or "").casefold() == "synced"
        and str(sync.get("revision") or "") == revision
    ):
        return GitOpsSyncStatus.SYNCED
    return GitOpsSyncStatus.PENDING


def _gitops_health_status(value: object) -> GitOpsHealthStatus:
    raw = value.get("status") if isinstance(value, Mapping) else None
    normalized = str(raw or "").casefold()
    if normalized == "healthy":
        return GitOpsHealthStatus.HEALTHY
    if normalized == "degraded":
        return GitOpsHealthStatus.DEGRADED
    if normalized in {"progressing", "suspended", "missing"}:
        return GitOpsHealthStatus.PROGRESSING
    return GitOpsHealthStatus.UNKNOWN


def _raise_provider_response(response: httpx.Response, operation: str) -> None:
    if response.status_code in {409, 422}:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.CONFLICT,
            f"GitHub rejected {operation} because the revision changed",
        )
    if response.is_error:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.PROVIDER_ERROR,
            f"GitHub {operation} failed with HTTP {response.status_code}",
        )


def _response_mapping(response: httpx.Response, operation: str) -> dict[str, object]:
    try:
        payload = response.json()
    except ValueError as error:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"GitHub {operation} response was not JSON",
        ) from error
    if not isinstance(payload, Mapping):
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"GitHub {operation} response was not an object",
        )
    return dict(payload)


def _nested_text(value: Mapping[str, object], key: str, nested: str) -> str:
    item = value.get(key)
    if not isinstance(item, Mapping):
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"GitHub pull request is missing {key}.{nested}",
        )
    return _required_text(item.get(nested), f"GitHub pull request {key}.{nested}")


def _required_text(value: object, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"{label} is unavailable",
        )
    return text


def _optional_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _optional_bool(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def _positive_int(value: object, label: str) -> int:
    if isinstance(value, bool):
        value = None
    try:
        result = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as error:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"{label} is unavailable",
        ) from error
    if result <= 0:
        raise YamlDeliveryPortError(
            YamlDeliveryFailureCode.EVIDENCE_INVALID,
            f"{label} is invalid",
        )
    return result
