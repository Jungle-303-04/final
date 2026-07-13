"""변경↔장애 상관 projection schema와 migration 계약."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.dashboard.models import RcaTimeline
from domains.rca_changes.models import WorkflowPrReference, WorkloadChange

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_0820"
DOWN_REVISION = "20260713_0750"
TIMELINE_INDEX_NAME = "ix_rca_timeline_workspace_incident"
WORKFLOW_IDENTITY = (
    "workspace_id",
    "repository_id",
    "binding_id",
    "workflow_run_id",
    "commit_sha",
    "manifest_path",
)
WORKLOAD_CHECKS = {
    "ck_workload_changes_workspace",
    "ck_workload_changes_cluster",
    "ck_workload_changes_namespace",
    "ck_workload_changes_resource_kind",
    "ck_workload_changes_resource_name",
    "ck_workload_changes_repository",
    "ck_workload_changes_binding",
    "ck_workload_changes_workflow",
    "ck_workload_changes_commit",
    "ck_workload_changes_manifest",
}
WORKFLOW_REFERENCE_CHECKS = {
    "ck_workflow_pr_refs_workspace",
    "ck_workflow_pr_refs_repository",
    "ck_workflow_pr_refs_binding",
    "ck_workflow_pr_refs_workflow",
    "ck_workflow_pr_refs_commit",
    "ck_workflow_pr_refs_manifest",
    "ck_workflow_pr_refs_source_event",
    "ck_workflow_pr_refs_pr_url",
}


def _config(monkeypatch) -> Config:
    database_url = "postgresql://user:pass@localhost/test"
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _render(config: Config, action: str, revision_range: str) -> str:
    output = StringIO()
    with redirect_stdout(output):
        getattr(command, action)(config, revision_range, sql=True)
    return " ".join(output.getvalue().lower().split())


def test_change_projection_model_shape() -> None:
    change = WorkloadChange.__table__
    reference = WorkflowPrReference.__table__

    assert tuple(column.name for column in change.primary_key.columns) == ("event_id",)
    assert {constraint.name for constraint in change.constraints} >= WORKLOAD_CHECKS
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in change.constraints
        if constraint.name == "uq_workload_changes_deployment_identity"
    } == {
        (
            "workspace_id",
            "repository_id",
            "binding_id",
            "workflow_run_id",
            "commit_sha",
            "manifest_path",
            "cluster_id",
            "namespace",
            "resource_kind",
            "resource_name",
        )
    }
    assert tuple(column.name for column in reference.primary_key.columns) == WORKFLOW_IDENTITY
    assert {constraint.name for constraint in reference.constraints} >= WORKFLOW_REFERENCE_CHECKS
    assert {
        tuple(column.name for column in constraint.columns)
        for constraint in reference.constraints
        if constraint.name == "uq_workflow_pr_refs_source_event"
    } == {("source_event_id",)}
    indexes = {index.name: index for index in change.indexes}
    assert tuple(column.name for column in indexes["ix_workload_changes_key_changed"].columns) == (
        "workspace_id",
        "cluster_id",
        "namespace",
        "resource_kind",
        "resource_name",
        "changed_at",
        "event_id",
    )
    assert tuple(column.name for column in indexes["ix_workload_changes_workflow"].columns) == (
        "workspace_id",
        "workflow_run_id",
        "repository_id",
        "binding_id",
    )
    assert reference.c.source_event_id.nullable is False
    assert reference.c.observed_at.nullable is False


def test_incident_lookup_index_model_shape() -> None:
    indexes = {index.name: index for index in RcaTimeline.__table__.indexes}
    index = indexes[TIMELINE_INDEX_NAME]

    assert tuple(column.name for column in index.columns) == ("workspace_id", "incident_id")
    predicate = str(index.dialect_options["postgresql"]["where"]).lower()
    assert predicate == "incident_id is not null"


def test_change_projection_upgrade_and_downgrade(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "alter table audit_log add column event_created_at timestamp with time zone" in upgrade
    assert "create table workload_changes" in upgrade
    assert "constraint pk_workload_changes primary key (event_id)" in upgrade
    for constraint_name in WORKLOAD_CHECKS:
        assert f"constraint {constraint_name} check" in upgrade
    assert "constraint uq_workload_changes_deployment_identity unique" in upgrade
    assert "create table workflow_pr_references" in upgrade
    assert "source_event_id text not null" in upgrade
    assert "observed_at timestamp with time zone not null" in upgrade
    assert (
        "constraint pk_workflow_pr_references primary key "
        "(workspace_id, repository_id, binding_id, workflow_run_id, commit_sha, manifest_path)"
    ) in upgrade
    for constraint_name in WORKFLOW_REFERENCE_CHECKS:
        assert f"constraint {constraint_name} check" in upgrade
    assert "constraint uq_workflow_pr_refs_source_event unique (source_event_id)" in upgrade
    assert "create index ix_workload_changes_key_changed" in upgrade
    assert "create index ix_workload_changes_workflow" in upgrade

    drop_timeline_index = f"drop index concurrently if exists {TIMELINE_INDEX_NAME};"
    create_timeline_index = (
        f"create index concurrently if not exists {TIMELINE_INDEX_NAME} "
        "on rca_timeline (workspace_id, incident_id) where incident_id is not null;"
    )
    assert "commit;" in upgrade
    assert drop_timeline_index in upgrade
    assert create_timeline_index in upgrade
    assert upgrade.index("commit;") < upgrade.index(drop_timeline_index)
    assert upgrade.index(drop_timeline_index) < upgrade.index(create_timeline_index)
    assert upgrade.index(create_timeline_index) < upgrade.index("create table workload_changes")

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert "commit;" in downgrade
    assert drop_timeline_index in downgrade
    assert downgrade.index("commit;") < downgrade.index(drop_timeline_index)
    assert "drop table workflow_pr_references;" in downgrade
    assert "drop table workload_changes;" in downgrade
    assert "alter table audit_log drop column event_created_at;" in downgrade
    assert downgrade.index("drop table workflow_pr_references;") < downgrade.index(
        "drop table workload_changes;"
    )
