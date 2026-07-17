from __future__ import annotations

import ast
from pathlib import Path

from packages.contracts.event_bus.subjects import EventSubject

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


ENTRY_SUBJECTS = {
    EventSubject.GIT_WEBHOOK_RECEIVED,
    EventSubject.CLUSTER_EVIDENCE_RECEIVED,
    EventSubject.COMMAND_REQUESTED,
    EventSubject.EMAIL_VERIFICATION_REQUESTED,
    EventSubject.AI_MESSAGE_RECEIVED,
    EventSubject.APPROVAL_GRANTED,
    EventSubject.APPROVAL_REJECTED,
}

TERMINAL_SUBJECTS = {
    EventSubject.AGENT_CONNECTED,
    EventSubject.CLUSTER_INVENTORY_SNAPSHOT_RECORDED,
    EventSubject.COMMAND_DISPATCHED,
    # Cancel/retry are immutable control intents.  Their API acceptance UoW
    # atomically persists the control/audit row and operation event; no worker
    # is allowed to replay the intent as a second state transition.
    EventSubject.COMMAND_CANCEL_REQUESTED,
    EventSubject.COMMAND_RETRY_REQUESTED,
    EventSubject.CLUSTER_RECONCILE_STARTED,
    EventSubject.CLUSTER_DRIFT_DETECTED,
    EventSubject.CLUSTER_RECONCILE_COMPLETED,
    EventSubject.CLUSTER_RECONCILE_FAILED,
    EventSubject.INCIDENT_DETECTED,
    EventSubject.RCA_RULE_MISSING,
    EventSubject.RCA_FOLLOWUP_REQUIRED,
    EventSubject.RCA_ACTION_REQUIRED,
    EventSubject.DIFF_EXPLAINED,
    EventSubject.APPROVAL_RECOMMENDED,
    # alert 전송 결과는 projection(audit/dashboard) 전용 종단 이벤트 — self-subscription 제거로 이동
    EventSubject.ALERT_DISPATCHED,
    EventSubject.ALERT_REJECTED,
    EventSubject.EMAIL_VERIFICATION_SENT,
    EventSubject.EMAIL_VERIFICATION_FAILED,
    EventSubject.AI_MESSAGE_RESPONDED,
    EventSubject.AI_MESSAGE_FAILED,
    EventSubject.WORKFLOW_CREATED,
    EventSubject.WORKFLOW_RUN_STARTED,
    EventSubject.WORKFLOW_STEP_RECORDED,
    EventSubject.WORKFLOW_RUN_COMPLETED,
    EventSubject.WORKFLOW_RUN_FAILED,
    EventSubject.APPROVAL_REQUESTED,
    # User shell changes are durable audit facts. The browser applies their
    # committed state directly; workers must not replay them as another write.
    EventSubject.NAMESPACE_SCOPE_UPDATED,
    EventSubject.UI_PREFERENCES_UPDATED,
    # Source deletion is committed configuration/audit evidence. Replaying it
    # through a worker would attempt the same mutation a second time.
    EventSubject.HELM_CHART_SOURCE_DELETED,
    EventSubject.HELM_CHART_SOURCE_REFRESHED,
}


def source_trees() -> list[ast.AST]:
    trees: list[ast.AST] = []
    for path in sorted(SRC.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        trees.append(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
    return trees


def event_body_contracts(trees: list[ast.AST]) -> dict[str, EventSubject]:
    contracts: dict[str, EventSubject] = {}
    for tree in trees:
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            for decorator in node.decorator_list:
                subject = event_subject_arg(decorator)
                if subject is not None:
                    contracts[node.name] = subject
    return contracts


def event_subject_arg(node: ast.AST) -> EventSubject | None:
    if not isinstance(node, ast.Call) or not node.args:
        return None
    func_name = getattr(node.func, "id", None)
    if func_name != "event":
        return None
    arg = node.args[0]
    if not (
        isinstance(arg, ast.Attribute)
        and isinstance(arg.value, ast.Name)
        and arg.value.id == "EventSubject"
    ):
        return None
    return EventSubject[arg.attr]


def consumed_body_names(trees: list[ast.AST]) -> set[str]:
    consumed: set[str] = set()
    for tree in trees:
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "on":
                arg = node.args[0]
                if isinstance(arg, ast.Name):
                    consumed.add(arg.id)
            if isinstance(func, ast.Call):
                nested_func = func.func
                if isinstance(nested_func, ast.Attribute) and nested_func.attr == "on":
                    arg = func.args[0] if func.args else None
                    if isinstance(arg, ast.Name):
                        consumed.add(arg.id)
    return consumed


def produced_subjects(
    trees: list[ast.AST], contracts: dict[str, EventSubject]
) -> set[EventSubject]:
    produced: set[EventSubject] = set()
    for tree in trees:
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if isinstance(node.func, ast.Name) and node.func.id in contracts:
                produced.add(contracts[node.func.id])
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr == "from_body"
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id in contracts
            ):
                produced.add(contracts[node.func.value.id])
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr == "accept"
                and node.args
                and isinstance(node.args[0], ast.Attribute)
                and isinstance(node.args[0].value, ast.Name)
                and node.args[0].value.id == "EventSubject"
            ):
                produced.add(EventSubject[node.args[0].attr])
    return produced


def test_every_event_subject_has_typed_body_contract() -> None:
    contracts = event_body_contracts(source_trees())

    missing = sorted(set(EventSubject) - set(contracts.values()), key=str)

    assert missing == []


def test_event_subjects_are_wired_to_producers_and_consumers_or_explicit_terminal() -> None:
    trees = source_trees()
    contracts = event_body_contracts(trees)
    consumed_subjects = {
        contracts[name] for name in consumed_body_names(trees) if name in contracts
    }
    produced = produced_subjects(trees, contracts)

    missing_producer = sorted(set(EventSubject) - produced - ENTRY_SUBJECTS, key=str)
    missing_consumer = sorted(set(EventSubject) - consumed_subjects - TERMINAL_SUBJECTS, key=str)

    assert missing_producer == []
    assert missing_consumer == []
