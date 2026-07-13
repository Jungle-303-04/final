"""Fail-closed contracts for the opt-in dev deployment workflow."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github/workflows/dev-deploy.yml"


def workflow() -> dict:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def deploy_job() -> dict:
    return workflow()["jobs"]["deploy"]


def steps_by_name() -> dict[str, dict]:
    return {step["name"]: step for step in deploy_job()["steps"]}


def test_deploy_only_follows_a_successful_dev_push_gate_with_exact_opt_in() -> None:
    document = workflow()
    assert document["on"] == {"workflow_run": {"workflows": ["Dev Gate"], "types": ["completed"]}}
    condition = deploy_job()["if"]
    assert "workflow_run.conclusion == 'success'" in condition
    assert "workflow_run.event == 'push'" in condition
    assert "workflow_run.head_branch == 'dev'" in condition
    assert "vars.AWS_DEV_DEPLOY_ENABLED == '1'" in condition
    assert workflow()["concurrency"] == {
        "group": "dev-deploy",
        "cancel-in-progress": False,
    }


def test_deploy_checks_out_the_exact_tree_that_passed_the_gate() -> None:
    checkout = steps_by_name()["Check out gated dev SHA"]
    assert checkout["with"]["ref"] == "${{ github.event.workflow_run.head_sha }}"
    assert checkout["with"]["persist-credentials"] is False
    assert deploy_job()["env"]["SOURCE_SHA"] == "${{ github.event.workflow_run.head_sha }}"
    validation = steps_by_name()["Validate non-secret deployment inputs"]["run"]
    assert 'test "$(git rev-parse HEAD)" = "${SOURCE_SHA}"' in validation
    assert '[[ "${ECR_REPOSITORY}" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ]]' in validation
    assert '[[ "${BASE_URL}" =~ ^https://[^[:space:]]+$ ]]' in validation
    assert steps_by_name()["Install deployment dependencies"]["run"] == "uv sync --frozen"


def test_deploy_orders_auth_migration_rollout_smoke_and_status_recording() -> None:
    names = [step["name"] for step in deploy_job()["steps"]]
    assert names.index("Render and verify auth bypass policy") < names.index(
        "Capture current digest rollback plan"
    )
    assert names.index("Capture current digest rollback plan") < names.index(
        "Run fail-closed database migration"
    )
    assert names.index("Run fail-closed database migration") < names.index(
        "Roll out immutable service digest"
    )
    assert names.index("Roll out immutable service digest") < names.index(
        "Verify live auth bypass policy after rollout"
    )
    assert names.index("Verify live auth bypass policy after rollout") < names.index(
        "Run strict deployment smoke"
    )
    assert names.index("Run strict deployment smoke") < names.index(
        "Record successful dev SHA in cluster"
    )


def test_deploy_uses_immutable_digest_and_image_only_rollback_without_db_downgrade() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "imageDetails[0].imageDigest" in source
    assert "rollout_image_digest.py" in source
    assert "revert_image_digests.py" in source
    assert "steps.capture.outcome == 'success'" in source
    assert "kubectl rollout undo" not in source
    assert "alembic downgrade" not in source
    assert "packages.storage.baseline bootstrap" not in source


def test_deploy_keeps_credentials_out_of_source_and_requires_explicit_context() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "AWS_SECRET_ACCESS_KEY" not in source
    assert "AWS_ACCESS_KEY_ID" not in source
    assert '--alias "${MGMT_CONTEXT}"' in source
    assert 'test "$(kubectl config current-context)" = "${MGMT_CONTEXT}"' in source
    assert "persist-credentials: false" in source
