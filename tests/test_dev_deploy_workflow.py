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
        "deployment_scope",
        "previous_release_sha",
    }
    assert triggers["workflow_dispatch"]["inputs"]["deployment_scope"] == {
        "description": "FULL deploys services and console; CONSOLE deploys only the console",
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
    assert "deployment_mode" not in condition
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
    assert deploy_job()["env"]["AGENT_API_BASE_URL"] == "${{ vars.AGENT_API_BASE_URL }}"
    validation = steps_by_name()["Validate non-secret deployment inputs"]["run"]
    assert 'test "$(git rev-parse HEAD)" = "${SOURCE_SHA}"' in validation
    assert '[[ "${ECR_REPOSITORY}" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ]]' in validation
    assert '[[ "${BASE_URL}" =~ ^https://[^[:space:]]+$ ]]' in validation
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]; then' in validation
    assert '[[ "${AGENT_API_BASE_URL}" =~ ^https://[^/?#[:space:]]+/api$ ]]' in validation
    assert steps_by_name()["Install deployment dependencies"]["run"] == "uv sync --frozen"


def test_automatic_deploy_uses_the_successful_gate_scope_proof() -> None:
    steps = steps_by_name()
    download = steps["Download automatic deployment scope"]
    resolve = steps["Resolve automatic deployment scope"]

    assert download["if"] == "github.event_name == 'workflow_run'"
    assert download["uses"] == "actions/download-artifact@v4"
    assert download["with"] == {
        "name": "dev-deploy-scope",
        "path": "${{ runner.temp }}/dev-deploy-scope",
        "github-token": "${{ github.token }}",
        "run-id": "${{ github.event.workflow_run.id }}",
    }
    assert resolve["if"] == "github.event_name == 'workflow_run'"
    assert 'case "${scope}" in' in resolve["run"]
    assert "FULL|CONSOLE" in resolve["run"]
    assert 'echo "DEPLOYMENT_SCOPE=${scope}" >>"${GITHUB_ENV}"' in resolve["run"]
    assert deploy_job()["env"]["DEPLOYMENT_SCOPE"].endswith("|| 'FULL' }}")


def test_manual_deploy_requires_exact_gate_and_previous_release_proofs() -> None:
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
    service_capture = steps["Capture current service digest rollback plan"]["run"]
    console_capture = steps["Capture current console digest rollback plan"]["run"]
    for capture in (service_capture, console_capture):
        assert 'previous_sha="${PREVIOUS_RELEASE_SHA}"' in capture
        assert 'if [[ "${GITHUB_EVENT_NAME}" == "workflow_dispatch" ]]' in capture
        assert capture.count("--managed-repository") == 1
        assert "--allow-missing-live" not in capture
    assert job["env"]["PREVIOUS_RELEASE_SHA"] == "${{ inputs.previous_release_sha }}"
    assert "DEPLOYMENT_MODE" not in job["env"]


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
        "Run fail-closed database migration"
    )
    assert names.index("Run fail-closed database migration") < names.index(
        "Bootstrap fixed dev administrator"
    )
    assert names.index("Bootstrap fixed dev administrator") < names.index(
        "Synchronize fixed dev runtime identity"
    )
    assert names.index("Synchronize fixed dev runtime identity") < names.index(
        "Pin target agent image in runtime config"
    )
    assert names.index("Pin target agent image in runtime config") < names.index(
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


def test_deploy_runs_authenticated_dynamic_browser_route_smoke_before_recording() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    install = steps["Install authenticated browser smoke dependencies"]
    smoke = steps["Run authenticated browser route smoke"]
    package = yaml.safe_load((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    script = (ROOT / "frontend/scripts/post-deploy-route-smoke.mjs").read_text(encoding="utf-8")

    assert install["run"] == (
        "npm ci --prefix frontend\n"
        "npm --prefix frontend exec -- playwright install --with-deps chromium\n"
    )
    assert smoke["run"] == "npm --prefix frontend run smoke:routes"
    assert smoke.get("env", {}) == {}
    assert package["scripts"]["smoke:routes"] == ("node scripts/post-deploy-route-smoke.mjs")
    assert package["scripts"]["lint"] == "eslint src scripts/*.mjs --max-warnings 0"
    assert "SIDEBAR_SELECTOR = 'aside[data-slot=\"sidebar\"]'" in script
    assert "NAVIGATION_LINK_SELECTOR = `${SIDEBAR_SELECTOR} nav a[href]`" in script
    assert "PRODUCT_ROUTE_CATALOG" not in script
    assert 'page.on("pageerror"' in script
    assert 'page.on("requestfailed"' in script
    assert "isChangeTimelineLimitResponse(response.status(), response.url())" in script
    assert 'requiredEnvironment("AUTH_PASSWORD", { trim: false })' in script
    assert 'new URL("/api/auth/login", baseUrl).href' in script
    assert "page.request.post" in script
    assert 'input[name="email"]' not in script
    assert 'input[name="password"]' not in script
    assert names.index("Run post-deploy smoke") < names.index(
        "Run authenticated browser route smoke"
    )
    assert names.index("Run post-deploy console smoke") < names.index(
        "Run authenticated browser route smoke"
    )
    assert names.index("Run authenticated browser route smoke") < names.index(
        "Record successful dev SHA in cluster"
    )
    assert names.index("Run authenticated browser route smoke") < names.index(
        "Record successful console SHA in cluster"
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
    assert "database_cutover_config.py" not in rollback["run"]
    assert "database_writer_freeze.py" not in rollback["run"]


def test_deploy_uses_immutable_digest_and_image_only_rollback_without_db_downgrade() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "imageDetails[0].imageDigest" in source
    assert "rollout_image_digest.py" in source
    assert "revert_image_digests.py" in source
    assert "steps.console_capture.outcome == 'success'" in source
    assert "kubectl rollout undo" not in source
    assert "alembic downgrade" not in source
    assert "database-cutover-job.yaml" not in source
    assert "packages.storage.data_cutover" not in source


def test_deploy_has_no_preservation_cutover_or_partial_capture_escape_hatches() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "FIRST_DEPLOY" not in source
    assert "database_writer_freeze.py" not in source
    assert "database_cutover_config.py" not in source
    assert "verify_first_deploy_backup.py" not in source
    assert "--allow-missing-live" not in source
    assert source.count("--managed-repository") == 2
    assert "kubectl apply --filename deploy/management" not in source
    assert "alembic stamp" not in source
    assert "alembic downgrade" not in source
    assert "DROP DATABASE" not in source


def test_full_deploy_keeps_migration_rollout_and_smoke() -> None:
    steps = steps_by_name()
    for name in (
        "Build and push immutable service image",
        "Capture current service digest rollback plan",
        "Enforce live auth bypass zero",
        "Run fail-closed database migration",
        "Bootstrap fixed dev administrator",
        "Synchronize fixed dev runtime identity",
        "Pin target agent image in runtime config",
        "Roll out immutable service digest",
        "Run post-deploy smoke",
        "Record successful dev SHA in cluster",
    ):
        assert steps[name]["if"] == "env.DEPLOYMENT_SCOPE == 'FULL'"
    assert deploy_job()["env"]["DEPLOYMENT_SCOPE"] == (
        "${{ github.event_name == 'workflow_dispatch' && inputs.deployment_scope || 'FULL' }}"
    )


def test_full_deploy_bootstraps_fixed_admin_without_persisting_plaintext_credentials() -> None:
    job = deploy_job()
    step = steps_by_name()["Bootstrap fixed dev administrator"]
    manifest = (ROOT / "deploy/management/admin-bootstrap-job.yaml").read_text(encoding="utf-8")

    assert job["env"]["AUTH_EMAIL"] == "admin"
    assert job["env"]["AUTH_PASSWORD"] == "${{ secrets.AWS_DEV_AUTH_PASSWORD }}"
    assert "AWS_DEV_AUTH_EMAIL" not in WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "create secret generic management-admin-bootstrap" in step["run"]
    assert '--from-literal="AUTH_PASSWORD=${AUTH_PASSWORD}"' in step["run"]
    assert "trap cleanup EXIT" in step["run"]
    assert "delete secret management-admin-bootstrap" in step["run"]
    assert "controller.bootstrap_admin" in manifest
    assert "key: AUTH_PASSWORD" in manifest


def test_full_deploy_keeps_proxy_identity_and_cursor_contract_aligned() -> None:
    job = deploy_job()
    step = steps_by_name()["Synchronize fixed dev runtime identity"]
    source = step["run"]

    assert step["if"] == "env.DEPLOYMENT_SCOPE == 'FULL'"
    assert job["env"]["PROJECT_SLUG"] == "kubernetes-ops"
    assert "uuid.uuid5" in source
    assert "TRUSTED_PROXY_AUTH_USER_ID" in source
    assert "FILTER_CURSOR_SIGNING_KEY" in source
    assert "openssl rand -hex 32" in source
    assert "patch configmap management-runtime-config" in source
    assert "patch secret management-runtime-secret" in source
    assert "echo ${cursor_value}" not in source


def test_full_deploy_pins_agent_runtime_config_before_consumers_restart() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    pin = steps["Pin target agent image in runtime config"]
    source = pin["run"]
    services = [
        document
        for document in yaml.safe_load_all(
            (ROOT / "deploy/management/services.yaml").read_text(encoding="utf-8")
        )
        if document
    ]
    gateway = next(
        document
        for document in services
        if document.get("kind") == "Deployment"
        and document.get("metadata", {}).get("name") == "api-gateway"
    )
    gateway_env_from = gateway["spec"]["template"]["spec"]["containers"][0]["envFrom"]

    assert pin["if"] == "env.DEPLOYMENT_SCOPE == 'FULL'"
    assert pin["env"]["TARGET_AGENT_IMAGE"] == "${{ steps.image.outputs.image }}"
    assert "@sha256:[0-9a-f]{64}" in source
    assert '[[ "${AGENT_API_BASE_URL}" =~ ^https://[^/?#[:space:]]+/api$ ]]' in source
    assert source.count("patch configmap management-runtime-config") == 1
    assert '--patch "{\\"data\\":{\\"PUBLIC_MANAGEMENT_BASE_URL\\":' in source
    assert '\\"TARGET_AGENT_IMAGE\\":' in source
    assert "GITOPS_WEBHOOK_IMAGE" not in source.split("--patch", 1)[1].splitlines()[0]
    assert "gitops_image_before" in source
    assert "gitops_image_after" in source
    assert 'test "${gitops_image_after}" = "${gitops_image_before}"' in source
    assert 'test "${installed_management_base_url}" = "${AGENT_API_BASE_URL}"' in source
    assert 'test "${installed_target_image}" = "${TARGET_AGENT_IMAGE}"' in source
    assert names.index("Pin target agent image in runtime config") < names.index(
        "Roll out immutable service digest"
    )
    assert "rollout_image_digest.py" in steps["Roll out immutable service digest"]["run"]
    assert {"configMapRef": {"name": "management-runtime-config"}} in gateway_env_from


def test_console_rollouts_record_the_source_sha_for_full_and_console_scopes() -> None:
    steps = steps_by_name()
    validation = steps["Validate non-secret deployment inputs"]["run"]
    smoke = steps["Run post-deploy console smoke"]
    rollback = steps["Restore previous release after failure"]["run"]

    assert "FULL|CONSOLE" in validation
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]; then' in validation
    assert steps["Run post-deploy console smoke"]["if"] == "env.DEPLOYMENT_SCOPE == 'CONSOLE'"
    assert smoke["run"] == "bash scripts/post-deploy-console-smoke.sh"
    assert "steps.console_image.outputs.image" in smoke["env"]["EXPECTED_CONSOLE_IMAGE"]
    assert steps["Record successful console SHA in cluster"]["if"] == (
        "env.DEPLOYMENT_SCOPE == 'FULL' || env.DEPLOYMENT_SCOPE == 'CONSOLE'"
    )
    assert "opsia-console-deploy-status" in steps["Record successful console SHA in cluster"]["run"]
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]' in rollback

    console_smoke = (ROOT / "scripts/post-deploy-console-smoke.sh").read_text(encoding="utf-8")
    assert 'test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"' in console_smoke
    assert 'grep --fixed-strings --quiet "${SOURCE_SHA}"' in console_smoke
    assert "EXPECTED_CONSOLE_IMAGE" in console_smoke
    assert '"${BASE_URL}/?source_sha=${SOURCE_SHA}"' in console_smoke
    assert "post-deploy public edge reachability (non-blocking)" in console_smoke
    assert "in-cluster console smoke remains authoritative" in console_smoke
    assert 'test "${public_edge_ready}" = "1"' not in console_smoke
    assert "alembic" not in console_smoke.lower()


def test_failure_recovery_always_attempts_image_restore() -> None:
    steps = steps_by_name()
    rollback = steps["Restore previous release after failure"]["run"]
    names = [step["name"] for step in deploy_job()["steps"]]

    assert "set -uo pipefail" in rollback
    assert "set -euo pipefail" not in rollback
    assert rollback.count("|| rollback_failed=1") == 2
    assert "routing_restored" not in rollback
    assert "database_writer_freeze.py" not in rollback
    assert 'exit "${rollback_failed}"' in rollback
    assert names[-1] == "Restore previous release after failure"
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


def test_console_proxy_uses_runtime_dns_and_does_not_buffer_api_streams() -> None:
    image_config = (ROOT / "frontend/nginx.conf").read_text(encoding="utf-8")
    live_config = (ROOT / "deploy/management/console-dev.yaml").read_text(encoding="utf-8")

    for source in (image_config, live_config):
        assert "resolver kube-dns.kube-system.svc.cluster.local valid=10s" in source
        assert "set $api_upstream http://api-gateway.management.svc.cluster.local:8000" in source
        assert "proxy_pass $api_upstream/" in source
        rest_location = source.split("location /api/ {", 1)[1].split("\n\n", 1)[0]
        assert "proxy_buffering off" in rest_location
        assert "proxy_cache off" in rest_location
        assert "proxy_read_timeout 3600s" in rest_location
        assert "proxy_send_timeout 3600s" in rest_location
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
