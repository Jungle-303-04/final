"""Initialize an empty database or upgrade an already versioned database.

This entrypoint never adopts a non-empty unversioned schema. Empty targets go
through the immutable baseline, while existing targets go through the
fail-closed Alembic migration runner.
"""

from __future__ import annotations

import os
from enum import StrEnum

from sqlalchemy import create_engine, inspect

from packages.config.settings import required_env
from packages.storage.baseline import BASELINE_TARGET_DATABASE_URL_ENV, run_bootstrap
from packages.storage.database import Database
from packages.storage.migration import DATABASE_URL_ENV, MigrationDecision, run_upgrade


class InitializationResult(StrEnum):
    BOOTSTRAPPED = "bootstrapped"
    CURRENT = "current"
    UPGRADED = "upgraded"


class InitializationPath(StrEnum):
    BASELINE = "baseline"
    MIGRATION = "migration"


def decide_initialization(table_names: list[str]) -> InitializationPath:
    """Choose baseline only for an actually empty public schema."""
    return InitializationPath.BASELINE if not table_names else InitializationPath.MIGRATION


def initialize_database() -> InitializationResult:
    """Bring one explicit database URL to the current versioned schema."""
    target_url = required_env(BASELINE_TARGET_DATABASE_URL_ENV)
    sqlalchemy_url = target_url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(sqlalchemy_url)
    with engine.connect() as connection:
        schema = connection.exec_driver_sql("SELECT current_schema()").scalar_one()
        if schema != "public":
            raise RuntimeError("database initialization target must use the public schema")
        table_names = sorted(inspect(connection).get_table_names(schema="public"))

    decision = decide_initialization(table_names)
    if decision is InitializationPath.BASELINE:
        run_bootstrap()
        result = InitializationResult.BOOTSTRAPPED
    else:
        os.environ[DATABASE_URL_ENV] = target_url
        migration = run_upgrade()
        result = (
            InitializationResult.CURRENT
            if migration is MigrationDecision.CURRENT
            else InitializationResult.UPGRADED
        )

    os.environ[DATABASE_URL_ENV] = target_url
    Database().verify_schema()
    return result


def main() -> int:
    result = initialize_database()
    print(f"database initialization result: {result.value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
