from __future__ import annotations

from sqlalchemy.dialects import postgresql

from domains.identity.repository import WorkspaceAccessRepository
from packages.contracts.identity import WorkspaceRole


def test_member_upsert_preserves_existing_owner_role() -> None:
    statement = WorkspaceAccessRepository._member_upsert(
        "default",
        "user-1",
        WorkspaceRole.MEMBER.value,
    )
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "CASE WHEN" in sql
    assert "excluded.role" in sql
    assert "workspace_members.role" in sql
    assert WorkspaceRole.OWNER.value in compiled.params.values()
