from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any

from domains.command.actions import command_action_for_recovery
from domains.command.events import CommandRequestedBody
from domains.gitops.events import Diff
from domains.gitops.source_patch import (
    ManifestScalarPatchPlan,
    ManifestSourcePatchError,
    ScalarFieldReplacement,
    memory_quantity_bytes,
    scalar_patch_content,
)
from domains.rca.events import (
    RcaActionRequiredBody,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
)
from domains.scm.events import (
    SAFE_PR_KIND_PATCH,
    SAFE_PR_KIND_REVIEW_DOC,
    SafePrFilePatch,
    SafePrRequestedBody,
)
from packages.config.constants import Command, GitHub, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from packages.contracts.gitops_authority import (
    GitOpsAuthorityContext,
    GitOpsAuthorityQuery,
    GitOpsAuthorityReadPort,
)
from services.ai.agent.defaults import ActionRoutes

UNKNOWN_ROUTE_REASON = "선택된 복구 후보의 route를 처리할 수 없습니다."
UNSUPPORTED_AUTO_ACTION_REASON = "자동 실행 대상 command action으로 변환할 수 없습니다."
MISSING_SAFE_PR_PATCH_REASON = "Safe PR에 적용할 구체적인 파일 패치가 없습니다."
SAFE_PR_FALLBACK_PATCH_DIR = ".gitops/recovery"
SAFE_PR_STRUCTURED_PATCH_DIR = ".gitops/safe-pr/patches"
GITOPS_REVIEW_ACTION = "gitops_recovery_review"
RESOURCE_REQUEST_TUNING_ACTION = "resource_request_tuning"
CONFIG_FIX_ACTION = "config_fix"
SCHEDULING_CONSTRAINT_FIX_ACTION = "scheduling_constraint_fix"
REVIEW_DOC_ACTIONS = frozenset(
    {
        GITOPS_REVIEW_ACTION,
        RESOURCE_REQUEST_TUNING_ACTION,
        CONFIG_FIX_ACTION,
        SCHEDULING_CONSTRAINT_FIX_ACTION,
    }
)
RESOURCE_REQUEST_MIN_CPU = "100m"
RESOURCE_REQUEST_MIN_MEMORY = "256Mi"
AUTHORITY_PATCH_ACTIONS = frozenset(
    {
        "oom_memory",
        "image_rollback",
        "image_tag_fix",
        "replica_scale",
        "probe_fix",
        "selector_fix",
    }
)
APPROVAL_REQUIRED_CONTEXTS: dict[str, JsonObject] = {
    "image_pull_secret_fix": {
        "reason_code": "security_boundary",
        "label": "보안 경계 확인",
        "reason": "registry 인증 정보나 Secret 참조 변경은 자동으로 결정하지 않고 운영자 확인이 필요합니다.",
        "next_action": "verify_image_pull_secret",
    },
    "registry_recovery": {
        "reason_code": "external_dependency",
        "label": "외부 의존성 확인",
        "reason": "외부 registry 장애 또는 mirror 전환은 플랫폼 밖 상태와 운영 정책 확인이 필요합니다.",
        "next_action": "verify_registry_status",
    },
    "container_port_review": {
        "reason_code": "configuration_boundary",
        "label": "포트 설정 확인",
        "reason": "컨테이너 포트 충돌은 manifest, service, probe 설정을 함께 확인한 뒤 수정해야 합니다.",
        "next_action": "verify_container_port_config",
    },
    "startup_security_context_review": {
        "reason_code": "security_boundary",
        "label": "보안 컨텍스트 확인",
        "reason": "권한 오류 복구는 securityContext, volume 권한, 실행 사용자 정책 확인이 필요합니다.",
        "next_action": "verify_startup_security_context",
    },
    "config_key_review": {
        "reason_code": "configuration_boundary",
        "label": "설정 key 확인",
        "reason": "누락된 ConfigMap key는 기대 값과 배포 정책을 운영자가 확인해야 합니다.",
        "next_action": "verify_config_key_reference",
    },
    "secret_reference_fix": {
        "reason_code": "security_boundary",
        "label": "Secret 참조 확인",
        "reason": "Secret 참조 보정은 민감 정보 경계와 namespace 권한 확인이 필요합니다.",
        "next_action": "verify_secret_reference",
    },
    "service_reference_review": {
        "reason_code": "traffic_routing",
        "label": "Service 참조 확인",
        "reason": "Service 이름이나 namespace 보정은 트래픽 라우팅 대상 변경이므로 운영자 확인이 필요합니다.",
        "next_action": "verify_service_reference",
    },
    "network_policy_review": {
        "reason_code": "traffic_routing",
        "label": "NetworkPolicy 확인",
        "reason": "NetworkPolicy 변경은 namespace 간 통신 허용 범위를 바꿀 수 있어 운영자 판단이 필요합니다.",
        "next_action": "verify_network_policy",
    },
    "autoscaling_metrics_recovery": {
        "reason_code": "platform_dependency",
        "label": "Autoscaling metrics 확인",
        "reason": "metrics-server 또는 custom metrics adapter 상태는 플랫폼 의존성 확인이 필요합니다.",
        "next_action": "verify_autoscaling_metrics",
    },
    "dependency_connection_review": {
        "reason_code": "external_dependency",
        "label": "외부 의존성 연결 확인",
        "reason": "DB 연결 복구는 애플리케이션 밖의 endpoint, 네트워크, pool 상태 확인이 필요합니다.",
        "next_action": "verify_dependency_connectivity",
    },
    "dependency_config_review": {
        "reason_code": "external_dependency",
        "label": "외부 의존성 설정 확인",
        "reason": "DB 인증/설정 복구는 Secret/ConfigMap 참조와 외부 서비스 설정 확인이 필요합니다.",
        "next_action": "verify_dependency_config",
    },
    "pvc_binding_fix": {
        "reason_code": "data_safety",
        "label": "데이터 안전성 확인",
        "reason": "PVC와 StorageClass 변경은 데이터 보존과 바인딩 정책에 영향을 줄 수 있어 운영자 판단이 필요합니다.",
        "next_action": "verify_storage_binding",
    },
    "manual_analysis": {
        "reason_code": "manual_only",
        "label": "수동 분석 필요",
        "reason": "자동 복구 후보가 충분하지 않아 운영자 RCA 검토가 필요합니다.",
        "next_action": "review_rca_findings",
    },
}
DEFAULT_APPROVAL_REQUIRED_CONTEXT: JsonObject = {
    "reason_code": "manual_review_required",
    "label": "운영자 승인 필요",
    "reason": "선택된 복구 조치는 자동 실행 조건을 충족하지 않아 운영자 확인이 필요합니다.",
    "next_action": "review_recovery_action",
}


@dataclass(frozen=True)
class RecoveryDispatcher:
    routes: ActionRoutes = field(default_factory=ActionRoutes)

    async def dispatch_body(
        self,
        evt: RecoveryActionSelectedBody,
        *,
        authority: GitOpsAuthorityReadPort | None = None,
        correlation_id: str = "",
    ) -> EventBody:
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
            return await dispatch_safe_pr_body(evt, authority, correlation_id)
        if selected.route == self.routes.approval_required:
            return approval_required_body(evt)
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


def approval_required_body(evt: RecoveryActionSelectedBody) -> RcaActionRequiredBody:
    selected = evt.selected
    context = APPROVAL_REQUIRED_CONTEXTS.get(
        selected.draft.action_type,
        DEFAULT_APPROVAL_REQUIRED_CONTEXT,
    )
    reason_code = str(context["reason_code"])
    label = str(context["label"])
    reason = str(context["reason"])
    next_action = str(context["next_action"])
    return RcaActionRequiredBody(
        reason=f"승인 필요({label}): {selected.title}. {reason}",
        evidence_ref=evt.plan.evidence_ref,
        workspace_id=evt.workspace_id,
        reason_code=reason_code,
        next_actions=[
            {
                "action_type": next_action,
                "reason": reason,
                "target": evt.plan.target,
            }
        ],
        diagnostics={
            "plan_id": evt.plan.plan_id,
            "incident_id": evt.plan.incident_id,
            "action_id": selected.action_id,
            "action_type": selected.draft.action_type,
            "route": selected.route,
            "risk_level": selected.risk_level,
            "blast_radius": selected.blast_radius,
            "approval_reason": reason_code,
            "approval_label": label,
        },
    )


def build_safe_pr_request_body(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    workspace_id: str,
    patches: list[SafePrFilePatch],
    authority: GitOpsAuthorityContext | None = None,
) -> SafePrRequestedBody | RcaActionRequiredBody:
    draft = selected.draft
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
        # 원설계 보존: 운영자 승인까지 끝난 복구는 직접 커밋으로 즉시 반영하고,
        # high risk 변경만 PR 리뷰 게이트를 유지한다.
        delivery="pull_request" if selected.risk_level == "high" else "direct_commit",
        pr_kind=safe_pr_kind(selected),
        workspace_id=workspace_id,
        repository_id=(
            authority.repository_id
            if authority is not None
            else target_value(plan, draft.params, "repository_id")
        ),
        binding_id=(
            authority.binding_id
            if authority is not None
            else target_value(plan, draft.params, "binding_id")
        ),
        application_id=(
            authority.application_id
            if authority is not None
            else target_value(plan, draft.params, "application_id")
        ),
        workflow_run_id=(
            authority.workflow_run_id
            if authority is not None
            else target_value(plan, draft.params, "workflow_run_id")
        ),
        environment=(
            authority.environment
            if authority is not None
            else target_value(plan, draft.params, "environment", Sandbox.NAMESPACE)
        ),
        manifest_path=(
            authority.manifest_path
            if authority is not None
            else target_value(plan, draft.params, "manifest_path", "deploy/k8s")
        ),
        repo_ref=authority.repo_ref if authority is not None else "",
        base_branch=authority.base_branch if authority is not None else "",
        commit_sha=authority.commit_sha if authority is not None else "",
        approval_ref=as_optional_str(draft.params.get("approval_ref")),
        policy_decision_ref=as_optional_str(draft.params.get("policy_decision_ref")),
    )


def safe_pr_kind(selected: RecoveryActionCandidate) -> str:
    if selected.draft.action_type in REVIEW_DOC_ACTIONS:
        return SAFE_PR_KIND_REVIEW_DOC
    return SAFE_PR_KIND_PATCH


async def dispatch_safe_pr_body(
    evt: RecoveryActionSelectedBody,
    authority_port: GitOpsAuthorityReadPort | None,
    correlation_id: str,
) -> EventBody:
    selected = evt.selected
    if selected.draft.action_type in REVIEW_DOC_ACTIONS:
        return build_safe_pr_request_body(
            evt.plan,
            selected,
            evt.workspace_id,
            [fallback_recovery_patch(selected)],
        )
    if selected.draft.action_type not in AUTHORITY_PATCH_ACTIONS:
        return authority_required_body(
            evt,
            "safe_pr_patch_unsupported",
            f"지원하지 않는 recovery patch action입니다: {selected.draft.action_type}",
            ["supported_patch_action"],
        )
    if authority_port is None or not correlation_id:
        return authority_required_body(
            evt,
            "gitops_authority_unavailable",
            "patch 생성 시점의 GitOps 권위 context를 조회할 수 없습니다.",
            ["gitops_authority_context"],
        )
    query = authority_query(evt, correlation_id)
    authority = await authority_port.load_authority(query)
    if authority is None:
        return authority_required_body(
            evt,
            "gitops_authority_unavailable",
            "승인 snapshot·binding·repository 권위 context를 확보하지 못했습니다.",
            ["gitops_authority_context"],
        )
    if not authority_matches_query(authority, query):
        return authority_required_body(
            evt,
            "gitops_authority_mismatch",
            "조회된 GitOps 권위 context가 선택된 recovery target과 일치하지 않습니다.",
            ["matching_gitops_authority_context"],
        )
    try:
        patches = authority_safe_pr_patches(selected, authority)
    except ManifestSourcePatchError:
        patches = []
    if not patches:
        return authority_required_body(
            evt,
            "safe_pr_patch_unsupported",
            "권위 snapshot에서 정책 범위 안의 실제 manifest patch를 만들 수 없습니다.",
            ["patchable_authority_snapshot"],
        )
    return build_safe_pr_request_body(
        evt.plan,
        selected,
        evt.workspace_id,
        patches,
        authority,
    )


def authority_query(
    evt: RecoveryActionSelectedBody,
    correlation_id: str,
) -> GitOpsAuthorityQuery:
    target = evt.plan.target
    draft = evt.selected.draft
    return GitOpsAuthorityQuery(
        correlation_id=correlation_id,
        workspace_id=evt.workspace_id,
        incident_id=evt.plan.incident_id,
        cluster_id=str(target.get("cluster_id") or ""),
        namespace=str(target.get("namespace") or draft.namespace),
        resource_kind=str(target.get("resource_kind") or draft.resource_kind),
        resource_name=str(target.get("resource_name") or draft.resource_name),
    )


def authority_matches_query(
    authority: GitOpsAuthorityContext,
    query: GitOpsAuthorityQuery,
) -> bool:
    resource_kind, _, resource_name = authority.resource.partition("/")
    return bool(
        authority.workspace_id == query.workspace_id
        and authority.cluster_id == query.cluster_id
        and resource_kind.casefold() == query.resource_kind.casefold()
        and resource_name == query.resource_name
        and all(
            (
                authority.repository_id,
                authority.binding_id,
                authority.application_id,
                authority.workflow_run_id,
                authority.manifest_path,
                authority.repo_ref,
                authority.base_branch,
                authority.commit_sha,
                authority.source_manifest_sha256,
            )
        )
    )


def authority_required_body(
    evt: RecoveryActionSelectedBody,
    reason_code: str,
    reason: str,
    missing: list[str],
) -> RcaActionRequiredBody:
    return RcaActionRequiredBody(
        reason=reason,
        evidence_ref=evt.plan.evidence_ref,
        workspace_id=evt.workspace_id,
        reason_code=reason_code,
        missing_evidence=missing,
        next_actions=[
            {
                "action_type": "collect_gitops_authority",
                "reason": reason,
                "target": evt.plan.target,
            }
        ],
        diagnostics={
            "plan_id": evt.plan.plan_id,
            "action_id": evt.selected.action_id,
            "action_type": evt.selected.draft.action_type,
        },
    )


def target_value(
    plan: RecoveryPlan,
    params: JsonObject,
    key: str,
    default: str = "",
) -> str:
    value = params.get(key) or plan.target.get(key) or default
    return str(value or "")


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
    command_target = command_target_name(draft.resource_kind, draft.resource_name, draft.params)
    return CommandRequestedBody(
        cluster_id=str(plan.target.get("cluster_id") or Target.DEFAULT_CLUSTER_ID),
        action=action,
        namespace=namespace,
        reason=selected.description,
        diff=Diff(
            resource=command_diff_resource(
                action, command_target, draft.resource_kind, draft.resource_name
            ),
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
        payload=command_payload_for(action, command_target, namespace, draft.params),
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


def command_diff_resource(
    action: str,
    command_target: str,
    source_kind: str,
    source_name: str,
) -> str:
    if action in {Command.DEFAULT_ACTION, Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION}:
        return f"deployment/{command_target}"
    return f"{source_kind}/{source_name}"


def command_target_name(kind: str, name: str, params: JsonObject) -> str:
    explicit = first_str(
        params.get("deployment"),
        params.get("deployment_name"),
        params.get("workload_name"),
        params.get("target_deployment"),
    )
    if explicit:
        return explicit
    normalized_kind = kind.strip().lower()
    normalized_name = name.strip()
    if normalized_kind in {"deployment", "deployments"}:
        return normalized_name
    if normalized_kind in {"replicaset", "replicasets"}:
        return deployment_from_replicaset_name(normalized_name) or normalized_name
    if normalized_kind in {"pod", "pods"}:
        return deployment_from_pod_name(normalized_name) or normalized_name
    return normalized_name


def first_str(*values: object) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def deployment_from_pod_name(name: str) -> str:
    match = re.match(r"^(.+)-[a-f0-9]{8,10}-[a-z0-9]{5}$", name)
    return match.group(1) if match else ""


def deployment_from_replicaset_name(name: str) -> str:
    match = re.match(r"^(.+)-[a-f0-9]{8,10}$", name)
    return match.group(1) if match else ""


def authority_safe_pr_patches(
    selected: RecoveryActionCandidate,
    authority: GitOpsAuthorityContext,
) -> list[SafePrFilePatch]:
    action_type = selected.draft.action_type
    replacements = scalar_replacements_for(action_type, selected, authority)
    if not replacements:
        return []
    rollback = tuple(
        ScalarFieldReplacement(
            field_path=item.field_path,
            current_value=item.desired_value,
            desired_value=item.current_value,
        )
        for item in replacements
    )
    plan = ManifestScalarPatchPlan(
        action_type=action_type,
        source_type=authority.source_type,
        source_manifest_sha256=authority.source_manifest_sha256,
        expected_base_sha=authority.commit_sha,
        manifest_path=authority.manifest_path,
        replacements=tuple(replacements),
        rollback_replacements=rollback,
    )
    token = hashlib.sha256(f"{selected.action_id}:{authority.commit_sha}".encode()).hexdigest()[:24]
    return [
        SafePrFilePatch(
            path=f"{SAFE_PR_STRUCTURED_PATCH_DIR}/{token}.yaml",
            content=scalar_patch_content(plan),
            description=f"{selected.title} (exact-base patch + inverse rollback)",
        )
    ]


def scalar_replacements_for(
    action_type: str,
    selected: RecoveryActionCandidate,
    authority: GitOpsAuthorityContext,
) -> list[ScalarFieldReplacement]:
    manifest = authority.desired_manifest
    container = target_container(manifest, selected.draft.resource_name)
    if action_type in {"image_rollback", "image_tag_fix"}:
        return image_replacements(authority, container)
    if action_type == "replica_scale":
        replicas = nested_value(manifest, "spec", "replicas")
        if type(replicas) is not int or not 1 <= replicas < 10:
            return []
        return [ScalarFieldReplacement("spec.replicas", replicas, replicas + 1)]
    if action_type == "oom_memory":
        return oom_memory_replacements(authority, container)
    if action_type == "probe_fix":
        return probe_replacements(container, authority)
    if action_type == "selector_fix":
        return selector_replacements(manifest)
    return []


def target_container(manifest: JsonObject, resource_name: str) -> dict[str, Any] | None:
    containers = nested_value(manifest, "spec", "template", "spec", "containers")
    if not isinstance(containers, list):
        return None
    values = [dict(item) for item in containers if isinstance(item, dict)]
    if len(values) == 1:
        return values[0]
    deployment = command_target_name("Deployment", resource_name, {})
    matches = [item for item in values if item.get("name") == deployment]
    return matches[0] if len(matches) == 1 else None


def image_replacements(
    authority: GitOpsAuthorityContext,
    container: dict[str, Any] | None,
) -> list[ScalarFieldReplacement]:
    if container is None:
        return []
    container_name = first_str(container.get("name"))
    current_image = first_str(container.get("image"))
    suffix = f"containers[name={container_name}].image"
    matches = [
        change
        for change in authority.changes
        if str(change.get("field_path") or "").endswith(suffix)
        and first_str(change.get("new_desired"), change.get("after")) == current_image
        and first_str(change.get("old_desired"))
        and first_str(change.get("old_desired")) != current_image
    ]
    if len(matches) != 1:
        return []
    previous = first_str(matches[0].get("old_desired"))
    return [
        ScalarFieldReplacement(
            f"spec.template.spec.containers[name={container_name}].image",
            current_image,
            previous,
        )
    ]


def oom_memory_replacements(
    authority: GitOpsAuthorityContext,
    container: dict[str, Any] | None,
) -> list[ScalarFieldReplacement]:
    if container is None:
        return []
    container_name = first_str(container.get("name"))
    request = nested_value(container, "resources", "requests", "memory")
    limit = nested_value(container, "resources", "limits", "memory")
    request_bytes = memory_quantity_bytes(request)
    limit_bytes = memory_quantity_bytes(limit)
    usage_bytes = numeric_evidence_value(authority.evidence, "container_memory_working_set_bytes")
    if (
        not container_name
        or request_bytes is None
        or limit_bytes is None
        or usage_bytes is None
        or usage_bytes <= 0
    ):
        return []
    mib = 1024**2
    desired_limit_mib = max(
        math.ceil(limit_bytes * 1.25 / mib),
        math.ceil(usage_bytes * 1.25 / mib),
    )
    desired_request_mib = max(
        math.ceil(request_bytes * 1.25 / mib),
        math.ceil(usage_bytes * 0.8 / mib),
    )
    if desired_limit_mib > 4096:
        return []
    desired_request_mib = min(desired_request_mib, desired_limit_mib)
    values: list[ScalarFieldReplacement] = []
    prefix = f"spec.template.spec.containers[name={container_name}].resources"
    desired_request = f"{desired_request_mib}Mi"
    desired_limit = f"{desired_limit_mib}Mi"
    if memory_quantity_bytes(desired_request) > request_bytes:
        values.append(ScalarFieldReplacement(f"{prefix}.requests.memory", request, desired_request))
    if memory_quantity_bytes(desired_limit) > limit_bytes:
        values.append(ScalarFieldReplacement(f"{prefix}.limits.memory", limit, desired_limit))
    return values


def probe_replacements(
    container: dict[str, Any] | None,
    authority: GitOpsAuthorityContext,
) -> list[ScalarFieldReplacement]:
    if container is None:
        return []
    container_name = first_str(container.get("name"))
    prefix = f"spec.template.spec.containers[name={container_name}]"
    approved_candidates: list[ScalarFieldReplacement] = []
    for probe_name in ("readinessProbe", "livenessProbe"):
        probe = container.get(probe_name)
        if not isinstance(probe, dict):
            continue
        for suffix, current in (
            (f"{probe_name}.httpGet.path", nested_value(probe, "httpGet", "path")),
            (f"{probe_name}.httpGet.port", nested_value(probe, "httpGet", "port")),
            (f"{probe_name}.timeoutSeconds", probe.get("timeoutSeconds")),
        ):
            field_path = f"{prefix}.{suffix}"
            matches = [
                change
                for change in authority.changes
                if change.get("field_path") == field_path
                and type(change.get("new_desired", change.get("after"))) is type(current)
                and change.get("new_desired", change.get("after")) == current
                and type(change.get("old_desired")) is type(current)
                and change.get("old_desired") != current
            ]
            if len(matches) == 1:
                approved_candidates.append(
                    ScalarFieldReplacement(field_path, current, matches[0]["old_desired"])
                )
    if len(approved_candidates) == 1:
        return approved_candidates
    for probe_name in ("readinessProbe", "livenessProbe"):
        probe = container.get(probe_name)
        if not isinstance(probe, dict):
            continue
        timeout = probe.get("timeoutSeconds")
        if type(timeout) is int and 1 <= timeout < 30:
            return [
                ScalarFieldReplacement(
                    (
                        f"spec.template.spec.containers[name={container_name}]."
                        f"{probe_name}.timeoutSeconds"
                    ),
                    timeout,
                    min(timeout + 2, 30),
                )
            ]
    return []


def selector_replacements(manifest: JsonObject) -> list[ScalarFieldReplacement]:
    selector = nested_value(manifest, "spec", "selector", "matchLabels")
    labels = nested_value(manifest, "spec", "template", "metadata", "labels")
    if not isinstance(selector, dict) or not isinstance(labels, dict):
        return []
    matches = [
        (key, current, labels.get(key))
        for key, current in selector.items()
        if re.fullmatch(r"[A-Za-z0-9_-]+", str(key))
        and isinstance(current, str)
        and isinstance(labels.get(key), str)
        and current != labels.get(key)
    ]
    if len(matches) != 1:
        return []
    key, current, desired = matches[0]
    return [ScalarFieldReplacement(f"spec.selector.matchLabels.{key}", current, desired)]


def nested_value(value: object, *keys: str) -> object:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def numeric_evidence_value(value: object, key: str) -> float | None:
    if isinstance(value, dict):
        candidate = value.get(key)
        if type(candidate) in {int, float} and math.isfinite(float(candidate)):
            return float(candidate)
        for item in value.values():
            found = numeric_evidence_value(item, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = numeric_evidence_value(item, key)
            if found is not None:
                return found
    return None


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
    if draft.action_type == RESOURCE_REQUEST_TUNING_ACTION:
        content = (
            f"{content}\n\n"
            "## 참고 제안값\n\n"
            f"- CPU request: `{RESOURCE_REQUEST_MIN_CPU}`\n"
            f"- Memory request: `{RESOURCE_REQUEST_MIN_MEMORY}`\n\n"
            "이 값은 Opsia Safe PR v1의 최소 참고값이며 자동 적용값이 아닙니다. "
            "운영자는 실제 workload 부하, namespace quota, node capacity를 확인한 뒤 "
            "manifest에 적절한 값을 직접 반영해야 합니다.\n"
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
