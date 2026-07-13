"""Fail-closed contracts for the opt-in dev deployment workflow."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github/workflows/dev-deploy.yml"
SERVICE_IMAGE_BASELINE = (
    "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/"
    "kubernetes-ops-service@sha256:"
    "132cbc945004812ae3367c21a3408da8f3c9ab1a01b5870ffdea1157c83f5d0a"
)
CONSOLE_IMAGE_BASELINE = (
    "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/"
    "kubernetes-ops-console@sha256:"
    "8c49f7bf8a10f5b9edb8de798cbe94d78ca29d03699bc2f3686c1636ec397978"
)


def workflow() -> dict:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def deploy_job() -> dict:
    return workflow()["jobs"]["deploy"]


def steps_by_name() -> dict[str, dict]:
    return {step["name"]: step for step in deploy_job()["steps"]}


def test_deploy_only_follows_a_successful_dev_push_gate_with_exact_opt_in() -> None:
    document = workflow()
    triggers = document["on"]
    assert triggers["workflow_run"] == {"workflows": ["Dev Gate"], "types": ["completed"]}
    assert set(triggers["workflow_dispatch"]["inputs"]) == {
        "source_sha",
        "postgres_snapshot_id",
        "nats_snapshot_id",
        "previous_release_sha",
        "confirmation",
    }
    assert deploy_job()["environment"] == "dev-deploy"
    condition = deploy_job()["if"]
    assert "workflow_run.conclusion == 'success'" in condition
    assert "workflow_run.event == 'push'" in condition
    assert "workflow_run.head_branch == 'dev'" in condition
    assert "vars.AWS_DEV_DEPLOY_ENABLED == '1'" in condition
    assert "github.event_name == 'workflow_dispatch'" in condition
    assert "github.ref == 'refs/heads/dev'" in condition
    assert "inputs.confirmation == 'FIRST_DEPLOY'" in condition
    assert workflow()["concurrency"] == {
        "group": "dev-deploy",
        "cancel-in-progress": False,
    }


def test_deploy_checks_out_the_exact_tree_that_passed_the_gate() -> None:
    checkout = steps_by_name()["Check out gated dev SHA"]
    source_sha = (
        "${{ github.event_name == 'workflow_dispatch' && inputs.source_sha || "
        "github.event.workflow_run.head_sha }}"
    )
    assert checkout["with"]["ref"] == source_sha
    assert checkout["with"]["persist-credentials"] is False
    assert deploy_job()["env"]["SOURCE_SHA"] == source_sha
    validation = steps_by_name()["Validate non-secret deployment inputs"]["run"]
    assert 'test "$(git rev-parse HEAD)" = "${SOURCE_SHA}"' in validation
    assert '[[ "${ECR_REPOSITORY}" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ]]' in validation
    assert '[[ "${BASE_URL}" =~ ^https://[^[:space:]]+$ ]]' in validation
    assert steps_by_name()["Install deployment dependencies"]["run"] == "uv sync --frozen"


def test_manual_first_deploy_requires_exact_gate_backup_and_previous_release_proofs() -> None:
    document = workflow()
    steps = steps_by_name()
    job = deploy_job()

    assert document["permissions"]["actions"] == "read"
    gate_proof = steps["Verify manual gated SHA"]["run"]
    assert 'gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/dev"' in gate_proof
    assert 'test "${remote_dev}" = "${SOURCE_SHA}"' in gate_proof
    assert "/actions/workflows/dev-gate.yml/runs" in gate_proof
    assert "select(.head_sha == env.SOURCE_SHA)" in gate_proof
    backup_proof = steps["Verify manual first-deploy backup"]["run"]
    assert "verify_first_deploy_backup.py" in backup_proof
    assert 'test -n "${FIRST_DEPLOY_POSTGRES_SNAPSHOT_ID}"' in backup_proof
    assert 'test -n "${FIRST_DEPLOY_NATS_SNAPSHOT_ID}"' in backup_proof
    assert '--pvc-name "data-postgresql-0"' in backup_proof
    assert '--pvc-name "data-nats-0"' in backup_proof
    assert backup_proof.count("--max-age-hours 24") == 2
    assert "get configmap opsia-deploy-status" in backup_proof
    capture = steps["Capture current digest rollback plan"]["run"]
    assert 'previous_sha="${FIRST_DEPLOY_PREVIOUS_SHA}"' in capture
    assert job["env"]["FIRST_DEPLOY_POSTGRES_SNAPSHOT_ID"] == ("${{ inputs.postgres_snapshot_id }}")
    assert job["env"]["FIRST_DEPLOY_NATS_SNAPSHOT_ID"] == "${{ inputs.nats_snapshot_id }}"
    assert job["env"]["FIRST_DEPLOY_PREVIOUS_SHA"] == "${{ inputs.previous_release_sha }}"


def test_deploy_orders_auth_migration_rollout_smoke_and_status_recording() -> None:
    names = [step["name"] for step in deploy_job()["steps"]]
    assert names.index("Render and verify auth bypass policy") < names.index("Run pre-deploy smoke")
    assert names.index("Run pre-deploy smoke") < names.index("Capture current digest rollback plan")
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
        "Run post-deploy smoke"
    )
    assert names.index("Run post-deploy smoke") < names.index(
        "Record successful dev SHA in cluster"
    )


def test_smoke_failure_restores_both_previous_image_sets() -> None:
    steps = steps_by_name()
    pre = steps["Run pre-deploy smoke"]
    post = steps["Run post-deploy smoke"]
    rollback = steps["Restore previous image digests after failure"]

    assert pre["id"] == "pre_smoke"
    assert "scripts/pre-deploy-smoke.sh" in pre["run"]
    assert "frontend_bundle" in pre["run"]
    assert "scripts/post-deploy-smoke.sh" in post["run"]
    assert "steps.pre_smoke.outputs.frontend_bundle" in post["env"]["PRE_DEPLOY_FRONTEND_BUNDLE"]
    assert rollback["if"] == "failure() && steps.capture.outcome == 'success'"
    assert rollback["run"].count("revert_image_digests.py") == 2


def test_deploy_uses_immutable_digest_and_image_only_rollback_without_db_downgrade() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "imageDetails[0].imageDigest" in source
    assert "rollout_image_digest.py" in source
    assert "revert_image_digests.py" in source
    assert "steps.capture.outcome == 'success'" in source
    assert "kubectl rollout undo" not in source
    assert "alembic downgrade" not in source
    assert "packages.storage.baseline bootstrap" not in source


def test_service_and_console_images_share_the_gated_source_sha_and_digest_release() -> None:
    job = deploy_job()
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    steps = steps_by_name()

    assert job["env"]["CONSOLE_ECR_REPOSITORY"] == "${{ vars.AWS_DEV_CONSOLE_ECR_REPOSITORY }}"
    assert (
        '[[ "${CONSOLE_ECR_REPOSITORY}" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ]]'
        in steps["Validate non-secret deployment inputs"]["run"]
    )
    assert (
        "docker build --file src/services/Dockerfile"
        in steps["Build and push immutable service image"]["run"]
    )
    assert (
        'tagged_image="${registry}/${ECR_REPOSITORY}:${SOURCE_SHA}"'
        in steps["Build and push immutable service image"]["run"]
    )
    assert (
        "docker build --file frontend/Dockerfile"
        in steps["Build and push immutable console image"]["run"]
    )
    assert (
        'tagged_image="${registry}/${CONSOLE_ECR_REPOSITORY}:${SOURCE_SHA}"'
        in steps["Build and push immutable console image"]["run"]
    )
    assert (
        f'--managed-image "{SERVICE_IMAGE_BASELINE}"'
        in steps["Capture current digest rollback plan"]["run"]
    )
    assert (
        f'--managed-image "{CONSOLE_IMAGE_BASELINE}"'
        in steps["Capture current digest rollback plan"]["run"]
    )
    assert (
        '--verified-live-image "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/'
        f'kubernetes-ops-service:c704729c1b={SERVICE_IMAGE_BASELINE}"'
        in steps["Capture current digest rollback plan"]["run"]
    )
    assert (
        '--verified-live-image "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/'
        f'kubernetes-ops-console:c704729c1b={CONSOLE_IMAGE_BASELINE}"'
        in steps["Capture current digest rollback plan"]["run"]
    )
    assert source.count("rollout_image_digest.py") == 2
    assert source.count("revert_image_digests.py") == 2


def test_console_manifests_pin_the_observed_ecr_digest_instead_of_latest() -> None:
    for relative_path in (
        "deploy/management/console.yaml",
        "deploy/management/console-dev.yaml",
    ):
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert CONSOLE_IMAGE_BASELINE in source
        assert ":latest" not in source


def test_management_manifests_do_not_reference_retired_ecr_names_or_mutable_images() -> None:
    for path in (ROOT / "deploy/management").glob("*.yaml"):
        source = path.read_text(encoding="utf-8")
        assert "kubeheal-service" not in source, path
        assert "kubeheal-console" not in source, path
        for line in source.splitlines():
            if line.lstrip().startswith("image:") and "kubernetes-ops-" in line:
                assert "@sha256:" in line, (path, line)


def test_deploy_keeps_credentials_out_of_source_and_requires_explicit_context() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "AWS_SECRET_ACCESS_KEY" not in source
    assert "AWS_ACCESS_KEY_ID" not in source
    assert '--alias "${MGMT_CONTEXT}"' in source
    assert 'test "$(kubectl config current-context)" = "${MGMT_CONTEXT}"' in source
    assert "persist-credentials: false" in source
