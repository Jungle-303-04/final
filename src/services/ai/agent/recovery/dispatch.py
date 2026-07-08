from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from domains.command.actions import command_action_for_recovery
from domains.command.events import CommandRequestedBody
from domains.gitops.events import Diff
from domains.rca.events import (
    RcaActionRequiredBody,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
)
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from packages.config.constants import Command, GitHub, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from services.ai.agent.defaults import ActionRoutes

UNKNOWN_ROUTE_REASON = "선택된 복구 후보의 route를 처리할 수 없습니다."
UNSUPPORTED_AUTO_ACTION_REASON = "자동 실행 대상 command action으로 변환할 수 없습니다."
MISSING_SAFE_PR_PATCH_REASON = "Safe PR에 적용할 구체적인 파일 패치가 없습니다."
SAFE_PR_FALLBACK_PATCH_DIR = ".gitops/recovery"


@dataclass(frozen=True)
class RecoveryDispatcher:
    routes: ActionRoutes = field(default_factory=ActionRoutes)

    def dispatch_body(self, evt: RecoveryActionSelectedBody) -> EventBody:
        selected = evt.selected
        if selected.route == self.routes.auto:
            command = build_command_request_body(
                evt.plan,
                selected,
                selected_by=evt.selected_by,
                auto_selected=evt.auto_selected,
            )
            if command is None:
                return RcaActionRequiredBody(
                    reason=f"{UNSUPPORTED_AUTO_ACTION_REASON}: {selected.draft.action_type}",
                    evidence_ref=evt.plan.evidence_ref,
                    workspace_id=evt.workspace_id,
                )
            return command
        if selected.route == self.routes.safe_pr:
            return build_safe_pr_request_body(evt.plan, selected, evt.workspace_id)
        if selected.route == self.routes.approval_required:
            return RcaActionRequiredBody(
                reason=f"승인 필요: {selected.title}",
                evidence_ref=evt.plan.evidence_ref,
                workspace_id=evt.workspace_id,
            )
        if selected.route == self.routes.forbidden:
            return RcaActionRequiredBody(
                reason=f"자동 조치 차단: {selected.title}",
                evidence_ref=evt.plan.evidence_ref,
                workspace_id=evt.workspace_id,
            )
        return RcaActionRequiredBody(
            reason=f"{UNKNOWN_ROUTE_REASON}: {selected.route}",
            evidence_ref=evt.plan.evidence_ref,
            workspace_id=evt.workspace_id,
        )


def build_safe_pr_request_body(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    workspace_id: str,
) -> SafePrRequestedBody | RcaActionRequiredBody:
    draft = selected.draft
    patches = safe_pr_patches(selected)
    if not patches:
        return RcaActionRequiredBody(
            reason=f"{MISSING_SAFE_PR_PATCH_REASON}: {selected.title}",
            evidence_ref=plan.evidence_ref,
            workspace_id=workspace_id,
            reason_code="safe_pr_patch_missing",
            missing_evidence=["manifest_patch"],
            next_actions=[
                {
                    "action_type": "collect_manifest_context",
                    "reason": "Recovery Safe PR requires concrete file patches before PR creation.",
                    "target": draft.params,
                }
            ],
            diagnostics={
                "plan_id": plan.plan_id,
                "action_id": selected.action_id,
                "route": selected.route,
            },
        )
    body = (
        f"{plan.summary}\n\n"
        f"선택 조치: {selected.title}\n"
        f"대상: {draft.namespace}/{draft.resource_kind}/{draft.resource_name}\n"
        f"위험도: {selected.risk_level}\n"
        f"영향 범위: {selected.blast_radius}\n\n"
        f"이유:\n{draft.reason}\n\n"
        "검증:\n"
        + "\n".join(f"- {check}" for check in selected.validation_checks)
        + "\n\n롤백:\n"
        + selected.rollback_plan
    )
    return SafePrRequestedBody(
        title=f"{selected.title}: {draft.resource_name}",
        body=body,
        provider=GitHub.PROVIDER,
        patches=patches,
        workspace_id=workspace_id,
        repository_id=str(draft.params.get("repository_id") or ""),
        binding_id=str(draft.params.get("binding_id") or ""),
        application_id=str(draft.params.get("application_id") or ""),
        workflow_run_id=str(draft.params.get("workflow_run_id") or ""),
        environment=str(draft.params.get("environment") or Sandbox.NAMESPACE),
        manifest_path=str(draft.params.get("manifest_path") or "deploy/k8s"),
        approval_ref=as_optional_str(draft.params.get("approval_ref")),
        policy_decision_ref=as_optional_str(draft.params.get("policy_decision_ref")),
    )


def build_command_request_body(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    *,
    selected_by: str,
    auto_selected: bool,
) -> CommandRequestedBody | None:
    draft = selected.draft
    action = command_action_for(selected)
    if action is None:
        return None
    workspace_id = str(plan.target.get("workspace_id") or draft.params.get("workspace_id"))
    namespace = draft.namespace or Sandbox.NAMESPACE
    return CommandRequestedBody(
        cluster_id=str(plan.target.get("cluster_id") or Target.DEFAULT_CLUSTER_ID),
        action=action,
        namespace=namespace,
        reason=selected.description,
        diff=Diff(
            resource=f"{draft.resource_kind}/{draft.resource_name}",
            namespace=namespace,
            desired_image="",
            actual_image="",
            risk=Sandbox.RISK_TAG,
            workspace_id=workspace_id,
            status="recovery_action",
            has_changes=True,
            basis={
                "source": "rca_recovery",
                "plan_id": plan.plan_id,
                "action_id": selected.action_id,
                "root_cause": draft.params.get("root_cause"),
            },
        ),
        workspace_id=workspace_id,
        application_id=str(draft.params.get("application_id") or ""),
        workflow_run_id=str(draft.params.get("workflow_run_id") or ""),
        binding_id=str(draft.params.get("binding_id") or ""),
        environment=str(draft.params.get("environment") or "sandbox"),
        requested_by=selected_by,
        approval_ref=as_optional_str(selected.draft.params.get("approval_ref")),
        policy_decision_ref=as_optional_str(selected.draft.params.get("policy_decision_ref")),
        actor={
            "plan_id": plan.plan_id,
            "action_id": selected.action_id,
            "auto_selected": auto_selected,
        },
        payload=command_payload_for(action, draft.resource_name, namespace, draft.params),
    )


def command_action_for(selected: RecoveryActionCandidate) -> str | None:
    requested = str(selected.draft.params.get("command") or selected.draft.action_type)
    return command_action_for_recovery(requested)


def command_payload_for(
    action: str,
    resource_name: str,
    namespace: str,
    params: JsonObject,
) -> JsonObject:
    if action != Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION:
        return {}
    replicas = params.get("replicas")
    if isinstance(replicas, bool):
        replicas = None
    try:
        replica_count = int(replicas)
    except (TypeError, ValueError):
        replica_count = 3
    return {
        "namespace": namespace,
        "name": resource_name,
        "replicas": replica_count,
    }


def safe_pr_patches(selected: RecoveryActionCandidate) -> list[SafePrFilePatch]:
    raw = selected.draft.params.get("patches")
    if not isinstance(raw, list):
        return [fallback_recovery_patch(selected)]
    patches: list[SafePrFilePatch] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        content = item.get("content")
        if not isinstance(path, str) or not isinstance(content, str):
            continue
        patches.append(
            SafePrFilePatch(
                path=path,
                content=content,
                description=str(item.get("description") or selected.title),
            )
        )
    return patches or [fallback_recovery_patch(selected)]


def fallback_recovery_patch(selected: RecoveryActionCandidate) -> SafePrFilePatch:
    draft = selected.draft
    token = hashlib.sha256(selected.action_id.encode()).hexdigest()[:16]
    action = safe_path_segment(draft.action_type or "recovery")
    path = f"{SAFE_PR_FALLBACK_PATCH_DIR}/{token}-{action}.md"
    target = f"{draft.namespace}/{draft.resource_kind}/{draft.resource_name}"
    checks = "\n".join(f"- {check}" for check in selected.validation_checks) or "- 상태 확인"
    content = (
        f"# {selected.title}\n\n"
        "## 대상\n\n"
        f"- 리소스: `{target}`\n"
        f"- 원인: `{draft.params.get('root_cause', '')}`\n"
        f"- 위험도: `{selected.risk_level}`\n"
        f"- 영향 범위: `{selected.blast_radius}`\n\n"
        "## 조치\n\n"
        f"{selected.description}\n\n"
        "## 검증\n\n"
        f"{checks}\n\n"
        "## 롤백\n\n"
        f"{selected.rollback_plan}\n"
    )
    return SafePrFilePatch(
        path=path,
        content=content,
        description=f"{selected.title} 복구 검토 기록",
    )


def safe_path_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-._")
    return cleaned or "recovery"


def as_optional_str(value: object) -> str | None:
    if value in (None, ""):
        return None
    return str(value)
