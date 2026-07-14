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
        "deployment_mode",
        "deployment_scope",
        "postgres_snapshot_id",
        "nats_snapshot_id",
        "previous_release_sha",
    }
    assert triggers["workflow_dispatch"]["inputs"]["deployment_mode"] == {
        "description": "DEPLOY is the normal path; FIRST_DEPLOY is the retired one-time cutover path",
        "required": True,
        "default": "DEPLOY",
        "type": "choice",
        "options": ["DEPLOY", "FIRST_DEPLOY"],
    }
    assert triggers["workflow_dispatch"]["inputs"]["deployment_scope"] == {
        "description": (
            "FULL deploys services and console; CONSOLE leaves the unversioned legacy "
            "database and services untouched"
        ),
        "required": True,
        "default": "FULL",
        "type": "choice",
        "options": ["FULL", "CONSOLE"],
    }
    assert deploy_job()["environment"] == "dev-deploy"
    condition = deploy_job()["if"]
    assert "workflow_run.conclusion == 'success'" in condition
    assert "workflow_run.event == 'push'" in condition
    assert "workflow_run.head_branch == 'dev'" in condition
    assert "vars.AWS_DEV_DEPLOY_ENABLED == '1'" in condition
    assert "github.event_name == 'workflow_dispatch'" in condition
    assert "github.ref == 'refs/heads/dev'" in condition
    assert "inputs.deployment_mode == 'DEPLOY'" in condition
    assert "inputs.deployment_mode == 'FIRST_DEPLOY'" in condition
    assert workflow()["concurrency"] == {
        "group": "dev-deploy",
        "cancel-in-progress": False,
    }
    assert deploy_job()["timeout-minutes"] == 180


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
    assert "compare/${SOURCE_SHA}...${remote_dev}" in gate_proof
    assert '"ahead"|"identical"' in gate_proof
    assert "/actions/workflows/dev-gate.yml/runs" in gate_proof
    assert "select(.head_sha == env.SOURCE_SHA)" in gate_proof
    backup_proof = steps["Verify manual first-deploy backup"]["run"]
    assert steps["Verify manual first-deploy backup"]["if"] == (
        "github.event_name == 'workflow_dispatch' && inputs.deployment_mode == 'FIRST_DEPLOY'"
    )
    assert "verify_first_deploy_backup.py" in backup_proof
    assert 'test -n "${FIRST_DEPLOY_POSTGRES_SNAPSHOT_ID}"' in backup_proof
    assert 'test -n "${FIRST_DEPLOY_NATS_SNAPSHOT_ID}"' in backup_proof
    assert '--pvc-name "data-postgresql-0"' in backup_proof
    assert '--pvc-name "data-nats-0"' in backup_proof
    assert backup_proof.count("--max-age-hours 24") == 2
    assert "get configmap opsia-deploy-status" in backup_proof
    service_capture = steps["Capture current service digest rollback plan"]["run"]
    console_capture = steps["Capture current console digest rollback plan"]["run"]
    for capture in (service_capture, console_capture):
        assert 'previous_sha="${FIRST_DEPLOY_PREVIOUS_SHA}"' in capture
        assert 'if [[ "${GITHUB_EVENT_NAME}" == "workflow_dispatch" ]]' in capture
        assert capture.count("--managed-repository") == 1
        assert "--allow-missing-live" not in capture
    assert job["env"]["FIRST_DEPLOY_POSTGRES_SNAPSHOT_ID"] == ("${{ inputs.postgres_snapshot_id }}")
    assert job["env"]["FIRST_DEPLOY_NATS_SNAPSHOT_ID"] == "${{ inputs.nats_snapshot_id }}"
    assert job["env"]["FIRST_DEPLOY_PREVIOUS_SHA"] == "${{ inputs.previous_release_sha }}"


def test_deploy_orders_auth_migration_rollout_smoke_and_status_recording() -> None:
    names = [step["name"] for step in deploy_job()["steps"]]
    rendered_auth = steps_by_name()["Render and verify auth bypass policy"]["run"]
    assert "verify_dev_auth_bypass.py rendered" in rendered_auth
    assert "verify_dev_auth_bypass.py live" not in rendered_auth
    assert names.index("Render and verify auth bypass policy") < names.index("Run pre-deploy smoke")
    assert names.index("Run pre-deploy smoke") < names.index(
        "Capture current service digest rollback plan"
    )
    assert names.index("Capture current service digest rollback plan") < names.index(
        "Capture current console digest rollback plan"
    )
    assert names.index("Capture current console digest rollback plan") < names.index(
        "Enforce live auth bypass zero"
    )
    assert names.index("Enforce live auth bypass zero") < names.index(
        "Freeze first-deploy database writers"
    )
    assert names.index("Freeze first-deploy database writers") < names.index(
        "Bootstrap and copy first-deploy database"
    )
    assert names.index("Bootstrap and copy first-deploy database") < names.index(
        "Switch first-deploy database target"
    )
    assert names.index("Switch first-deploy database target") < names.index(
        "Run fail-closed database migration"
    )
    assert names.index("Run fail-closed database migration") < names.index(
        "Roll out immutable service digest"
    )
    assert names.index("Roll out immutable service digest") < names.index(
        "Roll out immutable console digest"
    )
    assert names.index("Roll out immutable console digest") < names.index(
        "Verify live auth bypass policy after rollout"
    )
    assert names.index("Verify live auth bypass policy after rollout") < names.index(
        "Run post-deploy smoke"
    )
    assert names.index("Run post-deploy smoke") < names.index(
        "Record successful dev SHA in cluster"
    )


def test_workflow_sets_and_verifies_live_auth_bypass_without_manual_mutation() -> None:
    step = steps_by_name()["Enforce live auth bypass zero"]["run"]

    assert "set env deployment/api-gateway DEV_AUTH_BYPASS=0" in step
    assert "CONSOLE_ORIGIN=http://console-dev.management.svc.cluster.local:80" in step
    assert "rollout status deployment/api-gateway" in step
    assert "verify_dev_auth_bypass.py live" in step
    assert "DEV_AUTH_BYPASS-" not in step


def test_smoke_failure_restores_both_previous_image_sets() -> None:
    steps = steps_by_name()
    pre = steps["Run pre-deploy smoke"]
    post = steps["Run post-deploy smoke"]
    rollback = steps["Restore previous release after failure"]

    assert pre["id"] == "pre_smoke"
    assert "scripts/pre-deploy-smoke.sh" in pre["run"]
    assert "frontend_bundle" in pre["run"]
    assert "scripts/post-deploy-smoke.sh" in post["run"]
    assert "steps.pre_smoke.outputs.frontend_bundle" in post["env"]["PRE_DEPLOY_FRONTEND_BUNDLE"]
    assert rollback["if"] == "failure() && steps.console_capture.outcome == 'success'"
    assert rollback["run"].count("revert_image_digests.py") == 2
    assert "database_cutover_config.py switch --direction source" in rollback["run"]
    assert "database_writer_freeze.py restore" in rollback["run"]


def test_deploy_uses_immutable_digest_and_image_only_rollback_without_db_downgrade() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    cutover_job = (ROOT / "deploy/management/database-cutover-job.yaml").read_text(encoding="utf-8")
    assert "imageDetails[0].imageDigest" in source
    assert "rollout_image_digest.py" in source
    assert "revert_image_digests.py" in source
    assert "steps.console_capture.outcome == 'success'" in source
    assert "kubectl rollout undo" not in source
    assert "alembic downgrade" not in source
    assert "database-cutover-job.yaml" in source
    assert "packages.storage.baseline bootstrap" in cutover_job
    assert "packages.storage.data_cutover copy" in cutover_job


def test_first_deploy_freezes_writers_before_copy_and_restores_exact_replicas() -> None:
    steps = steps_by_name()
    freeze = steps["Freeze first-deploy database writers"]
    cutover = steps["Bootstrap and copy first-deploy database"]
    switch = steps["Switch first-deploy database target"]
    restore = steps["Restore first-deploy database writers"]

    first_deploy_only = (
        "github.event_name == 'workflow_dispatch' && inputs.deployment_mode == 'FIRST_DEPLOY'"
    )
    assert freeze["if"] == first_deploy_only
    assert "database_writer_freeze.py capture" in freeze["run"]
    assert "database_writer_freeze.py freeze" in freeze["run"]
    assert "cluster-agent" in (ROOT / "scripts/database_writer_freeze.py").read_text()
    assert cutover["if"] == first_deploy_only
    assert "database-cutover-job.yaml" in cutover["run"]
    assert '--run-id "${GITHUB_RUN_ID}"' in cutover["run"]
    assert '--run-attempt "${GITHUB_RUN_ATTEMPT}"' in cutover["run"]
    assert "packages.storage.baseline" not in cutover["run"]
    assert switch["if"] == first_deploy_only
    assert "database_cutover_config.py switch --direction target" in switch["run"]
    assert restore["if"] == first_deploy_only
    assert "database_writer_freeze.py restore" in restore["run"]


def test_first_deploy_does_not_mutate_source_schema_or_create_missing_workloads() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "database_writer_freeze.py" in source
    assert source.count("--managed-repository") == 2
    assert "kubectl apply --filename deploy/management" not in source
    assert "alembic stamp" not in source
    assert "alembic downgrade" not in source
    assert "DROP DATABASE" not in source


def test_full_manual_deploy_skips_cutover_but_keeps_migration_rollout_and_smoke() -> None:
    steps = steps_by_name()
    first_deploy_steps = (
        "Verify manual first-deploy backup",
        "Freeze first-deploy database writers",
        "Bootstrap and copy first-deploy database",
        "Switch first-deploy database target",
        "Restore first-deploy database writers",
    )

    for name in first_deploy_steps:
        assert "inputs.deployment_mode == 'FIRST_DEPLOY'" in steps[name]["if"]
    for name in (
        "Build and push immutable service image",
        "Capture current service digest rollback plan",
        "Enforce live auth bypass zero",
        "Run fail-closed database migration",
        "Roll out immutable service digest",
        "Run post-deploy smoke",
        "Record successful dev SHA in cluster",
    ):
        assert steps[name]["if"] == "env.DEPLOYMENT_SCOPE == 'FULL'"
    assert deploy_job()["env"]["DEPLOYMENT_MODE"] == (
        "${{ github.event_name == 'workflow_dispatch' && inputs.deployment_mode || 'DEPLOY' }}"
    )
    assert deploy_job()["env"]["DEPLOYMENT_SCOPE"] == (
        "${{ github.event_name == 'workflow_dispatch' && inputs.deployment_scope || 'FULL' }}"
    )


def test_console_scope_preserves_services_and_versioning_but_keeps_digest_safety() -> None:
    steps = steps_by_name()
    validation = steps["Validate non-secret deployment inputs"]["run"]
    smoke = steps["Run post-deploy console smoke"]
    rollback = steps["Restore previous release after failure"]["run"]

    assert "FULL|CONSOLE" in validation
    assert 'test "${DEPLOYMENT_SCOPE}" = "FULL"' in validation
    assert steps["Run post-deploy console smoke"]["if"] == "env.DEPLOYMENT_SCOPE == 'CONSOLE'"
    assert smoke["run"] == "bash scripts/post-deploy-console-smoke.sh"
    assert "steps.console_image.outputs.image" in smoke["env"]["EXPECTED_CONSOLE_IMAGE"]
    assert steps["Record successful console SHA in cluster"]["if"] == (
        "env.DEPLOYMENT_SCOPE == 'CONSOLE'"
    )
    assert "opsia-console-deploy-status" in steps["Record successful console SHA in cluster"]["run"]
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]' in rollback

    console_smoke = (ROOT / "scripts/post-deploy-console-smoke.sh").read_text(encoding="utf-8")
    assert 'test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"' in console_smoke
    assert 'grep --fixed-strings --quiet "${SOURCE_SHA}"' in console_smoke
    assert "EXPECTED_CONSOLE_IMAGE" in console_smoke
    assert "alembic" not in console_smoke.lower()


def test_failure_recovery_always_attempts_image_and_replica_restore() -> None:
    steps = steps_by_name()
    rollback = steps["Restore previous release after failure"]["run"]
    names = [step["name"] for step in deploy_job()["steps"]]

    assert "set -uo pipefail" in rollback
    assert "set -euo pipefail" not in rollback
    assert rollback.count("|| rollback_failed=1") >= 4
    assert "routing_restored=0" in rollback
    assert "database_writer_freeze.py restore" in rollback
    assert 'exit "${rollback_failed}"' in rollback
    assert names.index("Restore previous release after failure") < names.index(
        "Remove first-deploy cutover secret"
    )
    cleanup = steps["Remove first-deploy cutover secret"]
    assert "always()" in cleanup["if"]
    assert "steps.status.outcome == 'success'" in cleanup["if"]
    assert steps["Record successful dev SHA in cluster"]["id"] == "status"


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
    assert "docker build" in steps["Build and push immutable console image"]["run"]
    assert "aws ecr get-login-password" in steps["Build and push immutable console image"]["run"]
    assert "docker login --username AWS" in steps["Build and push immutable console image"]["run"]
    assert "--file frontend/Dockerfile" in steps["Build and push immutable console image"]["run"]
    assert (
        '--build-arg "SOURCE_SHA=${SOURCE_SHA}"'
        in steps["Build and push immutable console image"]["run"]
    )
    assert (
        'tagged_image="${registry}/${CONSOLE_ECR_REPOSITORY}:${SOURCE_SHA}"'
        in steps["Build and push immutable console image"]["run"]
    )
    service_capture = steps["Capture current service digest rollback plan"]["run"]
    console_capture = steps["Capture current console digest rollback plan"]["run"]
    assert '--managed-repository "${SERVICE_DEPLOY_IMAGE%@*}"' in service_capture
    assert '--managed-repository "${CONSOLE_DEPLOY_IMAGE%@*}"' in console_capture
    assert "--verified-live-image" not in service_capture + console_capture
    assert source.count("rollout_image_digest.py") == 2
    assert source.count("revert_image_digests.py") == 2


def test_console_bundle_embeds_the_gated_source_sha() -> None:
    dockerfile = (ROOT / "frontend/Dockerfile").read_text(encoding="utf-8")
    main = (ROOT / "frontend/src/main.tsx").read_text(encoding="utf-8")

    assert "ARG SOURCE_SHA" in dockerfile
    assert "ENV VITE_SOURCE_SHA=${SOURCE_SHA}" in dockerfile
    assert "import.meta.env.VITE_SOURCE_SHA" in main
    assert "document.documentElement.dataset.sourceSha" in main


def test_console_manifests_pin_the_observed_ecr_digest_instead_of_latest() -> None:
    source = (ROOT / "deploy/management/console-dev.yaml").read_text(encoding="utf-8")
    kustomization = (ROOT / "deploy/management/kustomization.yaml").read_text(encoding="utf-8")

    assert CONSOLE_IMAGE_BASELINE in source
    assert ":latest" not in source
    assert "console-dev.yaml" in kustomization
    assert "console.yaml" not in kustomization
    assert not (ROOT / "deploy/management/console.yaml").exists()


def test_deploy_retires_legacy_console_before_repository_capture() -> None:
    names = [step["name"] for step in deploy_job()["steps"]]
    retire = steps_by_name()["Retire legacy console deployment"]["run"]

    assert names.index("Run pre-deploy smoke") < names.index("Retire legacy console deployment")
    assert names.index("Retire legacy console deployment") < names.index(
        "Capture current service digest rollback plan"
    )
    assert "delete deployment/console service/console --ignore-not-found --wait=true" in retire


def test_console_proxy_uses_runtime_dns_for_both_gateway_upstreams() -> None:
    image_config = (ROOT / "frontend/nginx.conf").read_text(encoding="utf-8")
    live_config = (ROOT / "deploy/management/console-dev.yaml").read_text(encoding="utf-8")

    for source in (image_config, live_config):
        assert "resolver kube-dns.kube-system.svc.cluster.local valid=10s" in source
        assert "set $api_upstream http://api-gateway.management.svc.cluster.local:8000" in source
        assert "proxy_pass $api_upstream/" in source
        assert (
            "set $realtime_upstream http://realtime-gateway.management.svc.cluster.local:8000"
            in source
        )
        assert "proxy_pass $realtime_upstream/live/" in source


def test_gateway_manifest_uses_canonical_console_origin() -> None:
    source = (ROOT / "deploy/management/services.yaml").read_text(encoding="utf-8")

    assert "name: CONSOLE_ORIGIN" in source
    assert 'value: "http://console-dev.management.svc.cluster.local:80"' in source


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
