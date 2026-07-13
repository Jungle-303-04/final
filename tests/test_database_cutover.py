"""Fail-closed data-only cutover contracts."""

from __future__ import annotations

from pathlib import Path

import pytest
from packages.storage.data_cutover import (
    ColumnShape,
    CutoverDecision,
    decide_copy,
    topological_tables,
    validate_table_contract,
)

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    (
        "source_version_exists",
        "target_revisions",
        "target_nonempty_tables",
        "expected",
    ),
    [
        (False, ["head"], [], CutoverDecision.READY),
        (True, ["head"], [], CutoverDecision.BLOCKED_SOURCE_VERSIONED),
        (False, [], [], CutoverDecision.BLOCKED_TARGET_NOT_CURRENT),
        (False, ["old"], [], CutoverDecision.BLOCKED_TARGET_NOT_CURRENT),
        (False, ["head", "other"], [], CutoverDecision.BLOCKED_TARGET_NOT_CURRENT),
        (False, ["head"], ["workspaces"], CutoverDecision.BLOCKED_TARGET_NOT_EMPTY),
    ],
)
def test_copy_only_accepts_unversioned_source_and_empty_current_target(
    source_version_exists: bool,
    target_revisions: list[str],
    target_nonempty_tables: list[str],
    expected: CutoverDecision,
) -> None:
    assert (
        decide_copy(
            source_version_exists=source_version_exists,
            target_revisions=target_revisions,
            expected_head="head",
            target_nonempty_tables=target_nonempty_tables,
        )
        is expected
    )


def test_table_contract_allows_only_compatible_additive_target_columns() -> None:
    source = {
        "id": ColumnShape("text", False, None, False),
        "payload": ColumnShape("jsonb", False, None, False),
    }
    target = {
        **source,
        "nullable_new": ColumnShape("text", True, None, False),
        "defaulted_new": ColumnShape("int4", False, "0", False),
        "identity_new": ColumnShape("int8", False, None, True),
    }

    assert validate_table_contract("events", source, target) == ("id", "payload")


@pytest.mark.parametrize(
    ("source", "target"),
    [
        (
            {"id": ColumnShape("text", False, None, False)},
            {},
        ),
        (
            {"id": ColumnShape("text", False, None, False)},
            {"id": ColumnShape("int8", False, None, False)},
        ),
        (
            {"id": ColumnShape("text", False, None, False)},
            {
                "id": ColumnShape("text", False, None, False),
                "required_new": ColumnShape("text", False, None, False),
            },
        ),
    ],
)
def test_table_contract_rejects_missing_changed_or_required_target_columns(
    source: dict[str, ColumnShape], target: dict[str, ColumnShape]
) -> None:
    with pytest.raises(RuntimeError):
        validate_table_contract("events", source, target)


def test_foreign_key_order_places_parents_before_children() -> None:
    order = topological_tables(
        {"workspaces", "events", "outbox"},
        {
            "events": {"workspaces"},
            "outbox": {"events"},
        },
    )

    assert order.index("workspaces") < order.index("events") < order.index("outbox")


def test_foreign_key_cycle_is_blocked() -> None:
    with pytest.raises(RuntimeError, match="cycle"):
        topological_tables(
            {"left", "right"},
            {"left": {"right"}, "right": {"left"}},
        )


def test_cutover_source_is_read_only_locked_and_never_stamped() -> None:
    source = (ROOT / "src/packages/storage/data_cutover.py").read_text(encoding="utf-8")

    assert "SET TRANSACTION READ ONLY" in source
    assert "IN SHARE MODE NOWAIT" in source
    assert "command.stamp" not in source
    assert "alembic stamp" not in source
