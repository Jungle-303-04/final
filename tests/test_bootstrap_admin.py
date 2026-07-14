from __future__ import annotations

from pathlib import Path

from controller import bootstrap_admin

ROOT = Path(__file__).resolve().parents[1]


def test_dev_admin_identifier_is_fixed_without_a_plaintext_password() -> None:
    source = (ROOT / "src/controller/bootstrap_admin.py").read_text(encoding="utf-8")

    assert bootstrap_admin.DEV_ADMIN_IDENTIFIER == "admin"
    assert 'required_env("AUTH_PASSWORD")' in source
    assert "temp24qw" not in source


def test_admin_bootstrap_is_migration_first_and_never_initializes_schema() -> None:
    source = (ROOT / "src/controller/bootstrap_admin.py").read_text(encoding="utf-8")

    assert "verify_versioned_head(database_url, expected_head)" in source
    assert "db.verify_schema()" in source
    assert "db.upsert_admin_account(" in source
    assert "db.init()" not in source
