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


def scope_job() -> dict:
    return workflow()["jobs"]["scope"]


def steps_by_name() -> dict[str, dict]:
    return {step["name"]: step for step in deploy_job()["steps"]}


def scope_steps_by_name() -> dict[str, dict]:
    return {step["name"]: step for step in scope_job()["steps"]}


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
    assert triggers["workflow_dispatch"]["inputs"]["previous_release_sha"] == {
        "description": "Full service SHA of the current release; required only for FULL",
        "required": False,
        "type": "string",
    }
    assert deploy_job()["environment"] == "dev-deploy"
    condition = scope_job()["if"]
    assert "workflow_run.conclusion == 'success'" in condition
    assert "workflow_run.event == 'push'" in condition
    assert "workflow_run.head_branch == 'dev'" in condition
    assert "vars.AWS_DEV_DEPLOY_ENABLED == '1'" in condition
    assert "github.event_name == 'workflow_dispatch'" in condition
    assert "github.ref == 'refs/heads/dev'" in condition
    assert "deployment_mode" not in condition
    assert deploy_job()["needs"] == "scope"
    assert deploy_job()["if"] == (
        "${{ needs.scope.result == 'success' && needs.scope.outputs.deployment_scope != 'NONE' }}"
    )
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
    steps = scope_steps_by_name()
    download = steps["Download automatic deployment scope"]
    resolve = steps["Resolve deployment scope"]

    assert download["if"] == "github.event_name == 'workflow_run'"
    assert download["uses"] == "actions/download-artifact@v4"
    assert download["with"] == {
        "name": "dev-deploy-scope",
        "path": "${{ runner.temp }}/dev-deploy-scope",
        "github-token": "${{ github.token }}",
        "run-id": "${{ github.event.workflow_run.id }}",
    }
    assert 'case "${scope}" in' in resolve["run"]
    assert "FULL|CONSOLE|NONE" in resolve["run"]
    assert 'echo "scope=${scope}" >>"${GITHUB_OUTPUT}"' in resolve["run"]
    assert scope_job()["outputs"]["deployment_scope"] == "${{ steps.resolve.outputs.scope }}"
    assert deploy_job()["env"]["DEPLOYMENT_SCOPE"] == (
        "${{ needs.scope.outputs.deployment_scope }}"
    )


def test_none_scope_skips_the_entire_privileged_deploy_job() -> None:
    job = deploy_job()
    scope = scope_job()
    resolve = scope_steps_by_name()["Resolve deployment scope"]

    assert scope["permissions"] == {"actions": "read", "contents": "read"}
    assert (
        "NONE" not in workflow()["on"]["workflow_dispatch"]["inputs"]["deployment_scope"]["options"]
    )
    assert "FULL|CONSOLE|NONE" in resolve["run"]
    assert "FULL|CONSOLE) ;;" in resolve["run"]
    assert job["needs"] == "scope"
    assert "needs.scope.result == 'success'" in job["if"]
    assert "needs.scope.outputs.deployment_scope != 'NONE'" in job["if"]


def test_manual_deploy_requires_exact_gate_and_previous_release_proofs() -> None:
    document = workflow()
    steps = steps_by_name()
    job = deploy_job()
    resolve = scope_steps_by_name()["Resolve deployment scope"]

    assert document["permissions"]["actions"] == "read"
    assert resolve["env"] == {"MANUAL_SCOPE": "${{ inputs.deployment_scope }}"}
    assert 'scope="${MANUAL_SCOPE}"' in resolve["run"]
    assert 'echo "invalid manual deployment scope"' in resolve["run"]
    gate_proof = steps["Verify manual gated SHA"]["run"]
    assert 'gh_api_retry "repos/${GITHUB_REPOSITORY}/git/ref/heads/dev"' in gate_proof
    assert "grep -Eq '\\(HTTP (429|5[0-9]{2})\\)'" in gate_proof
    assert "while (( attempt <= 12 ))" in gate_proof
    assert "GitHub API retry budget exhausted" in gate_proof
    assert "compare/${SOURCE_SHA}...${remote_dev}" in gate_proof
    assert '"ahead"|"identical"' in gate_proof
    assert "/actions/workflows/dev-gate.yml/runs" in gate_proof
    assert "select(.head_sha == env.SOURCE_SHA)" in gate_proof
    validation = steps["Validate non-secret deployment inputs"]["run"]
    assert 'FULL) [[ "${PREVIOUS_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]' in validation
    assert "CONSOLE) ;;" in validation
    service_capture = steps["Capture current service digest rollback plan"]["run"]
    console_capture = steps["Capture current console digest rollback plan"]["run"]
    assert 'previous_sha="${PREVIOUS_RELEASE_SHA}"' in service_capture
    assert 'if [[ "${GITHUB_EVENT_NAME}" == "workflow_dispatch" ]]' in service_capture
    assert service_capture.count("--managed-repository") == 1
    assert "--allow-missing-live" not in service_capture
    assert "opsia-console-deploy-status" in console_capture
    assert ".data.console_sha" in console_capture
    assert "opsia-deploy-status" not in console_capture
    assert "PREVIOUS_RELEASE_SHA" not in console_capture
    assert "AWS_DEV_CONSOLE_BOOTSTRAP_ENABLED=1" in console_capture
    assert "console deploy status exists but console-dev is absent" in console_capture
    assert "console deploy status is absent while console-dev exists" in console_capture
    assert 'previous_sha="0000000000000000000000000000000000000000"' in console_capture
    assert "--manifest deploy/management/console-dev.yaml" in console_capture
    assert console_capture.count("--managed-repository") == 1
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
        "Reconcile canonical management services"
    )
    assert names.index("Reconcile canonical management services") < names.index(
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
        "Reconcile canonical console runtime config"
    )
    assert names.index("Reconcile canonical console runtime config") < names.index(
        "Roll out immutable console digest"
    )
    service_rollout = steps_by_name()["Roll out immutable service digest"]["run"]
    assert '--manifest "${RUNNER_TEMP}/management-rendered.yaml"' in service_rollout
    console_rollout = steps_by_name()["Roll out immutable console digest"]["run"]
    assert "--manifest deploy/management/console-dev.yaml" in console_rollout
    assert names.index("Roll out immutable console digest") < names.index(
        "Verify live auth bypass policy after rollout"
    )
    assert names.index("Verify live auth bypass policy after rollout") < names.index(
        "Run post-deploy smoke"
    )
    assert names.index("Run post-deploy smoke") < names.index(
        "Record successful dev SHA in cluster"
    )


def test_deploy_upgrades_existing_target_policy_after_smoke_and_before_release_record() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    upgrade = steps["Upgrade existing target agent policies"]
    source = upgrade["run"]

    assert upgrade["if"] == (
        "steps.release_lease.outputs.mode == 'deploy' && env.DEPLOYMENT_SCOPE == 'FULL'"
    )
    assert upgrade["env"]["DEPLOY_IMAGE"] == "${{ steps.image.outputs.image }}"
    assert "deploy/management/target-policy-upgrade-job.yaml" in source
    assert 'upgrade="${DEPLOY_IMAGE}"' in source
    assert "delete job target-policy-upgrade" in source
    assert "wait --for=condition=complete job/target-policy-upgrade" in source
    assert "logs job/target-policy-upgrade" in source
    assert names.index("Run authenticated browser route smoke") < names.index(
        "Upgrade existing target agent policies"
    )
    assert names.index("Upgrade existing target agent policies") < names.index(
        "Record successful dev SHA in cluster"
    )


def test_target_policy_upgrade_job_has_bounded_non_privileged_database_authority() -> None:
    manifest = yaml.safe_load(
        (ROOT / "deploy/management/target-policy-upgrade-job.yaml").read_text(encoding="utf-8")
    )
    pod_spec = manifest["spec"]["template"]["spec"]
    container = pod_spec["containers"][0]

    assert manifest["kind"] == "Job"
    assert manifest["metadata"]["name"] == "target-policy-upgrade"
    assert manifest["spec"]["backoffLimit"] == 0
    assert manifest["spec"]["activeDeadlineSeconds"] == 300
    assert pod_spec["automountServiceAccountToken"] is False
    assert pod_spec["restartPolicy"] == "Never"
    assert container["command"] == ["python", "-m", "domains.target.policy_upgrade"]
    assert container["args"] == ["--apply"]
    assert container["securityContext"]["allowPrivilegeEscalation"] is False
    assert container["securityContext"]["capabilities"]["drop"] == ["ALL"]
    env = {item["name"]: item["valueFrom"] for item in container["env"]}
    assert env["DATABASE_URL"]["secretKeyRef"] == {
        "name": "management-runtime-secret",
        "key": "COMMAND_NOTIFY_DATABASE_URL",
    }
    assert env["TARGET_AGENT_IMAGE"]["configMapKeyRef"] == {
        "name": "management-runtime-config",
        "key": "TARGET_AGENT_IMAGE",
    }


def test_full_deploy_has_no_demo_seed_or_demo_workspace_smoke_dependency() -> None:
    source = WORKFLOW_PATH.read_text(encoding="utf-8")
    names = [step["name"] for step in deploy_job()["steps"]]

    assert "Seed dedicated dev demo workspace" not in names
    assert "management-demo-workspace-seed" not in source
    assert "DEMO_WORKSPACE_ID" not in source
    assert "REQUIRE_DEMO_WORKSPACE_SMOKE" not in source


def test_deploy_runs_authenticated_dynamic_browser_route_smoke_before_recording() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    install = steps["Install authenticated browser smoke dependencies"]
    smoke = steps["Run authenticated browser route smoke"]
    post_smoke = steps["Run post-deploy smoke"]
    cleanup = steps["Remove browser authentication handoff"]
    package = yaml.safe_load((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    script = (ROOT / "frontend/scripts/post-deploy-route-smoke.mjs").read_text(encoding="utf-8")

    assert "npm ci --prefix frontend" in install["run"]
    assert "playwright install-deps chromium" in install["run"]
    assert "PLAYWRIGHT_CACHE_HIT" in install["run"]
    assert "playwright install chromium" in install["run"]
    assert steps["Restore authenticated browser cache"]["uses"] == "actions/cache@v4"
    handoff = "${{ runner.temp }}/browser-auth-cookie.jar"
    assert smoke["env"] == {"AUTH_COOKIE_JAR": handoff}
    assert "service/console-dev :80" in smoke["run"]
    assert "--address 127.0.0.1" in smoke["run"]
    assert 'BASE_URL="http://127.0.0.1:${console_port}"' in smoke["run"]
    assert " -> [0-9]+$" in smoke["run"]
    assert "console port-forward did not become ready after" in smoke["run"]
    assert "npm --prefix frontend run smoke:routes" in smoke["run"]
    assert post_smoke["env"]["AUTH_COOKIE_JAR_OUT"] == handoff
    assert cleanup["if"] == "always()"
    assert cleanup["run"] == 'rm -f -- "${RUNNER_TEMP}/browser-auth-cookie.jar"'
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
    assert 'headers: { "x-service-csrf": "same-origin" }' in script
    assert "AUTH_BOOTSTRAP_TIMEOUT_MS = 60_000" in script
    assert 'page.goto(directUrl.href, { waitUntil: "domcontentloaded" })' in script
    assert "data-product-state" in script
    assert "diagnostics.apiErrors" in script
    assert "parseNetscapeSessionCookie" in script
    assert "page.context().addCookies" in script
    assert "verifyCurrentWorkspaceEvidence" in script
    assert '"/api/auth/workspaces/switch"' not in script
    assert "DEMO_WORKSPACE_ID" not in script
    assert "assertRouteReleaseBudget" in script
    assert "ROUTE_SMOKE_MAX_PHASE_MS" not in script
    assert "ROUTE_SMOKE_MAX_ROUTE_MS" not in script
    assert "ROUTE_SMOKE_MIN_CRITICAL_API_REQUESTS" in script
    assert 'input[name="email"]' not in script
    assert 'input[name="password"]' not in script
    assert names.index("Run post-deploy smoke") < names.index(
        "Run authenticated browser route smoke"
    )
    assert names.index("Run post-deploy console smoke") < names.index(
        "Run authenticated browser route smoke"
    )
    assert names.index("Verify already released public SHA") < names.index(
        "Run authenticated browser route smoke"
    )
    assert names.index("Run authenticated browser route smoke") < names.index(
        "Remove browser authentication handoff"
    )
    assert names.index("Remove browser authentication handoff") < names.index(
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
    assert "failure()" in rollback["if"]
    assert "steps.release_lease.outputs.mode == 'deploy'" in rollback["if"]
    assert "steps.console_capture.outcome == 'success'" in rollback["if"]
    assert rollback["run"].count("revert_image_digests.py") == 2
    assert "database_cutover_config.py" not in rollback["run"]
    assert "database_writer_freeze.py" not in rollback["run"]


def test_browser_smoke_failure_captures_bounded_service_crash_evidence_before_rollback() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    browser_smoke = steps["Run authenticated browser route smoke"]
    diagnostics = steps["Capture service crash diagnostics"]
    rollback = steps["Restore previous release after failure"]
    source = diagnostics["run"]

    assert browser_smoke["id"] == "browser_smoke"
    assert diagnostics["if"] == (
        "failure() && steps.browser_smoke.outcome == 'failure' && env.DEPLOYMENT_SCOPE == 'FULL'"
    )
    assert "get pods --selector app=api-gateway --output json" in source
    assert "restartCount" in source
    assert "lastState" in source
    assert "reason" in source
    assert 'describe pod "${pod_name}"' in source
    assert 'logs pod/"${pod_name}" --all-containers=true --previous' in source
    assert 'logs pod/"${pod_name}" --all-containers=true --tail=500' in source
    assert "involvedObject.uid=${pod_uid}" in source
    assert "rollout status deployment/api-gateway" in source
    assert "scripts/redact_diagnostic_stream.py" in source
    assert "get secret" not in source
    assert "describe secret" not in source
    assert names.index("Run authenticated browser route smoke") < names.index(
        "Capture service crash diagnostics"
    )
    assert names.index("Capture service crash diagnostics") < names.index(
        "Restore previous release after failure"
    )
    assert rollback["run"].count("revert_image_digests.py") == 2


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
    service_capture = steps_by_name()["Capture current service digest rollback plan"]["run"]
    assert "kubectl kustomize deploy/management" in service_capture
    assert '--manifest "${RUNNER_TEMP}/management-rendered.yaml"' in service_capture
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
        assert steps[name]["if"] == (
            "steps.release_lease.outputs.mode == 'deploy' && env.DEPLOYMENT_SCOPE == 'FULL'"
        )
    assert deploy_job()["env"]["DEPLOYMENT_SCOPE"] == (
        "${{ needs.scope.outputs.deployment_scope }}"
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
    assert "entrypoints.bootstrap_admin" in manifest
    assert "key: AUTH_PASSWORD" in manifest


def test_full_deploy_keeps_proxy_identity_and_cursor_contract_aligned() -> None:
    job = deploy_job()
    steps = steps_by_name()
    names = [step["name"] for step in job["steps"]]
    identity_step = steps["Synchronize fixed dev runtime identity"]
    secret_step = steps["Ensure persistent management runtime secrets"]
    identity_source = identity_step["run"]
    secret_source = secret_step["run"]

    expected_full = "steps.release_lease.outputs.mode == 'deploy' && env.DEPLOYMENT_SCOPE == 'FULL'"
    assert identity_step["if"] == expected_full
    assert secret_step["if"] == expected_full
    assert job["env"]["PROJECT_SLUG"] == "kubernetes-ops"
    assert "uuid.uuid5" in identity_source
    assert "TRUSTED_PROXY_AUTH_USER_ID" in identity_source
    assert "FILTER_CURSOR_SIGNING_KEY" in secret_source
    assert "CREDENTIAL_ENCRYPTION_KEY" in secret_source
    assert "create secret generic management-runtime-secret" in secret_source
    assert "ensure_runtime_secret_value CREDENTIAL_ENCRYPTION_KEY 1" in secret_source
    assert "ensure_runtime_secret_value FILTER_CURSOR_SIGNING_KEY 32" in secret_source
    assert "openssl rand -hex 32" in secret_source
    assert "patch configmap management-runtime-config" in identity_source
    assert "patch secret management-runtime-secret" in secret_source
    assert "echo ${value}" not in secret_source
    assert "set -x" not in secret_source
    assert names.index("Ensure persistent management runtime secrets") < names.index(
        "Run fail-closed database migration"
    )


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

    assert pin["if"] == (
        "steps.release_lease.outputs.mode == 'deploy' && env.DEPLOYMENT_SCOPE == 'FULL'"
    )
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


def test_full_deploy_reconciles_canonical_workload_specs_with_rollback_evidence() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    capture = steps["Capture current service digest rollback plan"]["run"]
    service_rollout = steps["Roll out immutable service digest"]["run"]
    console_rollout = steps["Roll out immutable console digest"]["run"]

    assert "kubectl kustomize deploy/management" in capture
    assert '--manifest "${RUNNER_TEMP}/management-rendered.yaml"' in capture
    assert '--manifest "${RUNNER_TEMP}/management-rendered.yaml"' in service_rollout
    assert "--reconcile-existing-specs" in service_rollout
    assert "--manifest deploy/management/console-dev.yaml" in console_rollout
    assert "--reconcile-existing-specs" in console_rollout
    assert '--spec-diff-out "${RUNNER_TEMP}/console-spec-diff.json"' in console_rollout
    evidence = steps["Upload console spec reconciliation evidence"]
    assert evidence["uses"] == "actions/upload-artifact@v4"
    assert "steps.console_rollout.outcome != 'skipped'" in evidence["if"]
    assert evidence["with"]["path"] == "${{ runner.temp }}/console-spec-diff.json"
    assert evidence["with"]["if-no-files-found"] == "error"
    assert names.index("Capture current service digest rollback plan") < names.index(
        "Roll out immutable service digest"
    )
    assert names.index("Roll out immutable console digest") < names.index(
        "Upload console spec reconciliation evidence"
    )
    assert names.index("Upload console spec reconciliation evidence") < names.index(
        "Verify live auth bypass policy after rollout"
    )


def test_console_rollouts_record_the_source_sha_for_full_and_console_scopes() -> None:
    steps = steps_by_name()
    validation = steps["Validate non-secret deployment inputs"]["run"]
    smoke = steps["Run post-deploy console smoke"]
    rollback = steps["Restore previous release after failure"]["run"]

    assert 'FULL) [[ "${PREVIOUS_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]' in validation
    assert "CONSOLE) ;;" in validation
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]; then' in validation
    assert steps["Run post-deploy console smoke"]["if"] == (
        "steps.release_lease.outputs.mode == 'deploy' && env.DEPLOYMENT_SCOPE == 'CONSOLE'"
    )
    assert smoke["run"] == "bash scripts/post-deploy-console-smoke.sh"
    assert "steps.console_image.outputs.image" in smoke["env"]["EXPECTED_CONSOLE_IMAGE"]
    assert steps["Record successful console SHA in cluster"]["if"] == (
        "steps.release_lease.outputs.mode == 'deploy' && "
        "(env.DEPLOYMENT_SCOPE == 'FULL' || env.DEPLOYMENT_SCOPE == 'CONSOLE')"
    )
    assert "opsia-console-deploy-status" in steps["Record successful console SHA in cluster"]["run"]
    assert 'if [[ "${DEPLOYMENT_SCOPE}" == "FULL" ]]' in rollback

    console_smoke = (ROOT / "scripts/post-deploy-console-smoke.sh").read_text(encoding="utf-8")
    assert 'test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"' in console_smoke
    assert 'grep --fixed-strings --quiet "${SOURCE_SHA}"' in console_smoke
    assert "EXPECTED_CONSOLE_IMAGE" in console_smoke
    assert "wait_for_public_edge_release" in console_smoke
    assert "post-deploy public edge convergence" in console_smoke
    assert "non-blocking" not in console_smoke
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
    assert names[-3:] == [
        "Restore previous release after failure",
        "Finalize deployment lease",
        "Restore bounded cluster access",
    ]
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
    assert "docker buildx build" in steps["Build and push immutable service image"]["run"]
    assert (
        "--cache-from type=gha,scope=opsia-service"
        in steps["Build and push immutable service image"]["run"]
    )
    assert (
        "--cache-to type=gha,mode=max,scope=opsia-service"
        in steps["Build and push immutable service image"]["run"]
    )
    assert (
        'tagged_image="${registry}/${ECR_REPOSITORY}:${SOURCE_SHA}"'
        in steps["Build and push immutable service image"]["run"]
    )
    assert "docker buildx build" in steps["Build and push immutable console image"]["run"]
    assert (
        "--cache-from type=gha,scope=opsia-console"
        in steps["Build and push immutable console image"]["run"]
    )
    assert (
        "--cache-to type=gha,mode=max,scope=opsia-console"
        in steps["Build and push immutable console image"]["run"]
    )
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


def test_console_rollout_uses_static_readiness_with_a_bounded_failure_window() -> None:
    documents = [
        document
        for document in yaml.safe_load_all(
            (ROOT / "deploy/management/console-dev.yaml").read_text(encoding="utf-8")
        )
        if document
    ]
    deployment = next(
        document
        for document in documents
        if document.get("kind") == "Deployment"
        and document.get("metadata", {}).get("name") == "console-dev"
    )
    pod_spec = deployment["spec"]["template"]["spec"]
    probe = pod_spec["containers"][0]["readinessProbe"]

    assert probe["httpGet"]["path"] == "/index.html"
    assert probe["httpGet"]["port"] == "http"
    assert probe["initialDelaySeconds"] == 3
    assert probe["periodSeconds"] == 2
    assert probe["timeoutSeconds"] == 1
    assert probe["failureThreshold"] * max(probe["periodSeconds"], probe["timeoutSeconds"]) <= 30


def test_deploy_retires_legacy_console_only_after_release_evidence_is_recorded() -> None:
    names = [step["name"] for step in deploy_job()["steps"]]
    step = steps_by_name()["Retire legacy console deployment"]
    retire = step["run"]

    assert names.index("Capture current console digest rollback plan") < names.index(
        "Retire legacy console deployment"
    )
    assert names.index("Record successful console SHA in cluster") < names.index(
        "Retire legacy console deployment"
    )
    assert step["if"] == "success() && steps.release_lease.outputs.mode == 'deploy'"
    assert step["continue-on-error"] is True
    assert "delete deployment/console service/console --ignore-not-found --wait=true" in retire


def test_deploy_fails_fast_on_unbounded_or_missing_cluster_access() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    grant = steps["Grant ephemeral runner cluster access"]["run"]
    preflight = steps["Verify bounded cluster deployment access"]["run"]
    restore = steps["Restore bounded cluster access"]

    assert "https://checkip.amazonaws.com" in grant
    assert 'runner_cidr="${runner_ip}/32"' in grant
    assert "aws eks update-cluster-config" in grant
    assert "aws eks describe-update" in grant
    assert "previous_cidrs=" in grant
    assert 'echo "modified=true" >>"${GITHUB_OUTPUT}"' in grant
    assert "aws eks describe-cluster" in preflight
    assert '. != "0.0.0.0/0"' in preflight
    assert '. != "::/0"' in preflight
    assert "index($cidr) != null" in preflight
    assert "--request-timeout=10s get namespace" in preflight
    assert "auth can-i get deployments" in preflight
    assert "auth can-i patch deployments" in preflight
    assert restore["if"] == "always() && steps.cluster_access.outputs.modified == 'true'"
    assert "PREVIOUS_PUBLIC_ACCESS_CIDRS" in restore["run"]
    assert "aws eks update-cluster-config" in restore["run"]
    assert "aws eks describe-update" in restore["run"]
    assert '. != "0.0.0.0/0"' in restore["run"]
    assert '. != "::/0"' in restore["run"]
    assert names.index("Grant ephemeral runner cluster access") < names.index(
        "Verify bounded cluster deployment access"
    )
    assert names.index("Verify bounded cluster deployment access") < names.index(
        "Build and push immutable service image"
    )
    assert names.index("Finalize deployment lease") < names.index("Restore bounded cluster access")


def test_deploy_uses_release_status_and_atomic_expiring_lease_for_same_sha() -> None:
    steps = steps_by_name()
    lease = steps["Acquire idempotent deployment lease"]["run"]
    verify = steps["Verify already released public SHA"]
    finalize = steps["Finalize deployment lease"]

    assert "opsia-console-deploy-status" in lease
    assert "opsia-deploy-status" in lease
    assert '[[ "${console_sha}" == "${SOURCE_SHA}" ]]' in lease
    assert 'echo "mode=verify" >>"${GITHUB_OUTPUT}"' in lease
    assert 'holder="${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}"' in lease
    assert "opsia-deploy-lease" in lease
    assert "resourceVersion" in lease
    assert 'kubectl --context "${MGMT_CONTEXT}" replace --filename -' in lease
    assert "lease_age < DEPLOY_LEASE_TTL_SECONDS" in lease
    assert 'echo "mode=deploy" >>"${GITHUB_OUTPUT}"' in lease
    assert steps["Build and push immutable console image"]["if"] == (
        "steps.release_lease.outputs.mode == 'deploy'"
    )
    assert verify["if"] == "steps.release_lease.outputs.mode == 'verify'"
    assert 'wait_for_public_edge_release "${BASE_URL}" "" "${SOURCE_SHA}"' in verify["run"]
    assert "if" not in steps["Run authenticated browser route smoke"]
    assert finalize["if"] == "always() && steps.release_lease.outputs.mode == 'deploy'"
    assert "successful" in finalize["run"]
    assert "failed" in finalize["run"]
    assert "expired" in finalize["run"]
    assert '{op:"test",path:"/data/holder",value:$holder}' in finalize["run"]


def test_gateway_service_exposes_default_http_port_and_native_port() -> None:
    documents = [
        document
        for document in yaml.safe_load_all(
            (ROOT / "deploy/management/services.yaml").read_text(encoding="utf-8")
        )
        if document
    ]
    gateway = next(
        document
        for document in documents
        if document.get("kind") == "Service"
        and document.get("metadata", {}).get("name") == "api-gateway"
    )
    ports = {(port["name"], port["port"], port["targetPort"]) for port in gateway["spec"]["ports"]}

    assert ports == {
        ("http", 8000, "http"),
        ("http-default", 80, "http"),
    }


def test_deploy_reconciles_exact_canonical_services_after_rollback_capture() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    reconcile = steps["Reconcile canonical management services"]["run"]

    assert "scripts/select_kubernetes_resources.py" in reconcile
    assert "--name api-gateway" in reconcile
    assert "--name console-dev" in reconcile
    assert 'kubectl --context "${MGMT_CONTEXT}" diff' in reconcile
    assert "--server-side" not in reconcile
    assert "--field-manager=opsia-dev-deploy" in reconcile
    assert "management Service server-side diff failed" in reconcile
    assert 'kubectl --context "${MGMT_CONTEXT}" apply' in reconcile
    assert "get service api-gateway --output json" in reconcile
    assert '{"port": 80, "targetPort": "http"}' in reconcile
    assert '{"port": 8000, "targetPort": "http"}' in reconcile
    assert "get service console-dev --output json" in reconcile
    assert names.index("Capture current console digest rollback plan") < names.index(
        "Reconcile canonical management services"
    )
    assert names.index("Reconcile canonical management services") < names.index(
        "Run post-deploy smoke"
    )


def test_deploy_reconciles_console_configmap_before_console_rollout() -> None:
    steps = steps_by_name()
    names = [step["name"] for step in deploy_job()["steps"]]
    reconcile = steps["Reconcile canonical console runtime config"]
    source = reconcile["run"]

    assert reconcile["if"] == "steps.release_lease.outputs.mode == 'deploy'"
    assert "scripts/select_kubernetes_resources.py" in source
    assert "--input deploy/management/console-dev.yaml" in source
    assert "--kind ConfigMap" in source
    assert "--name console-dev-nginx" in source
    assert 'kubectl --context "${MGMT_CONTEXT}" diff' in source
    assert "console ConfigMap server-side diff failed" in source
    assert 'kubectl --context "${MGMT_CONTEXT}" apply' in source
    assert "get configmap console-dev-nginx" in source
    assert 'test "${live_template}" = "${desired_template}"' in source
    assert names.index("Capture current console digest rollback plan") < names.index(
        "Reconcile canonical console runtime config"
    )
    assert names.index("Reconcile canonical console runtime config") < names.index(
        "Roll out immutable console digest"
    )
    assert names.index("Reconcile canonical console runtime config") < names.index(
        "Run authenticated browser route smoke"
    )


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
