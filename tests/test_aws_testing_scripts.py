from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_manifest_checks_do_not_require_docker() -> None:
    script = read("scripts/manifest-check.sh")

    assert "kubectl create" not in script
    assert "kubectl kustomize" in script


def test_removed_legacy_github_actions_have_no_active_repository_entrypoints() -> None:
    makefile = read("Makefile")
    catalog = read("src/domains/providers/catalog.py")
    docs_index = read("docs/README.md")
    active_workflows = {path.name for path in (ROOT_DIR / ".github" / "workflows").glob("*.yml")}
    removed_workflows = {
        "aws-cd.yml",
        "ci.yml",
        "integration-smoke.yml",
        "promote-dev.yml",
    }

    assert active_workflows.isdisjoint(removed_workflows)
    assert "check: gate" in makefile
    assert "aws-smoke:" not in makefile
    assert "gh workflow run" not in makefile
    assert 'key="github-actions"' not in catalog
    assert "(aws-cicd.md)" not in docs_index
    assert "MGMT_CLUSTER ?=" in makefile
    assert "TARGET_CLUSTER ?=" in makefile
    assert "smoke: ## 현재 환경변수로 배포된 서비스 smoke 실행" in makefile


def test_management_deploy_removes_legacy_minio_deployment() -> None:
    aws_up = read("scripts/aws-up.sh")
    local_up = read("scripts/up.sh")

    assert "safe-pr-service rca-fallback-worker minio; do" in aws_up
    assert "safe-pr-service rca-fallback-worker minio; do" in local_up
    assert "rollout status statefulset/minio" in local_up
    assert "rollout status deploy/minio" not in local_up


def test_management_bootstrap_propagates_rca_test_and_api_prefix_config() -> None:
    aws_up = read("scripts/aws-up.sh")
    local_up = read("scripts/up.sh")

    for script in (aws_up, local_up):
        assert 'RCA_TEST_RUNS_ENABLED="${RCA_TEST_RUNS_ENABLED:-1}"' in script
        assert 'TEST_FIXTURE_PURGE_ENABLED="${TEST_FIXTURE_PURGE_ENABLED:-1}"' in script
        assert 'RCA_TEST_RUNS_TOKEN="${RCA_TEST_RUNS_TOKEN:-}"' in script
        assert 'API_ROOT_PATH="${API_ROOT_PATH:-/api}"' in script
        assert '--from-literal=RCA_TEST_RUNS_ENABLED="${RCA_TEST_RUNS_ENABLED}"' in script
        assert '--from-literal=TEST_FIXTURE_PURGE_ENABLED="${TEST_FIXTURE_PURGE_ENABLED}"' in script
        assert '--from-literal=RCA_TEST_RUNS_TOKEN="${RCA_TEST_RUNS_TOKEN}"' in script
        assert '--from-literal=API_ROOT_PATH="${API_ROOT_PATH}"' in script


def test_internal_gitops_workflow_remains_deployed() -> None:
    controller = read("src/services/gitops/workflow-controller/app.py")
    services = read("deploy/management/services.yaml")

    assert 'app = App("workflow-controller")' in controller
    assert "@app.on(" in controller
    assert "name: workflow-controller" in services
    assert "src/services/gitops/workflow-controller/app.py" in services
    assert "name: release-flow-worker" in services
    assert "name: NATS_DELIVER_POLICY" in services
    assert 'value: "new"' in services


def test_local_test_stack_uses_shared_aws_bruno_profile() -> None:
    makefile = read("Makefile")
    local_env = read("config/env/local-test.env.example")
    local_docs = read("docs/local-testing.md")
    bruno_aws = read("docs/api/environments/aws-test.bru")

    assert "local-test-env:" in makefile
    assert "local-up:" in makefile
    assert "local-smoke:" in makefile
    assert 'source "$(LOCAL_TEST_ENV)"' in makefile
    assert ".env.local-test" in read(".gitignore")
    assert "AUTH_EMAIL=admin.local@example.com" in local_env
    assert "AUTH_PASSWORD=local-test-password-1234" in local_env
    assert "SMOKE_CLUSTER_ID=target" in local_env
    assert "make local-up" in local_docs
    assert "make local-smoke" in local_docs
    assert "Environment를 `aws-test`로 고른다" in local_docs
    assert "base_url: https://dev-k8s.woonyong.org/api/" in bruno_aws
    assert "dev_security_bypass:" not in bruno_aws
    assert "auto_login: false" in bruno_aws


def test_operator_scripts_require_explicit_runtime_context() -> None:
    scripts = "\n".join(
        [
            read("scripts/status.sh"),
            read("scripts/scale.sh"),
            read("scripts/kill-pod.sh"),
            read("scripts/install-telemetry.sh"),
            read("scripts/register-target.sh"),
            read("scripts/smoke.sh"),
            read("scripts/crash_test.sh"),
        ]
    )

    assert "require_env" in scripts
    assert "kubernetes-ops" not in scripts
    assert "cluster-1" not in scripts
    assert "https://k8s.woonyong.org" not in scripts
    assert "kind-management" not in scripts
    assert "kind-target" not in scripts


def test_cloudflare_custom_domain_defaults_to_proxied_https() -> None:
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'CLOUDFLARE_PROXIED="${CLOUDFLARE_PROXIED:-1}"' in script
    assert '"proxied": ${proxied}' in script
    assert '"ttl": ${ttl}' in script
    assert "cloudflare_api_token_value" in script
    assert "cloudflare_authorization_value" in script
    assert "cloudflare_api_token\\s*[:=]\\s*" in script
    assert "authorization\\s*:\\s*" in script
    assert "bearer\\s+([^\\s\\\"']+)" in script
    assert "[A-Za-z0-9._~+/=-]{20,}" in script
    assert "cloudflare_validate_api_token" in script
    assert "raw_length=" in script
    assert "normalized_length=" in script
    assert "allowed_bearer_charset=" in script
    assert (
        "skipping Cloudflare DNS for ${CUSTOM_DOMAIN}; AWS LoadBalancer remains available" in script
    )
    assert "zone lookup failed" in script
    assert "DNS record lookup failed" in script
    assert 'value.lower().startswith("bearer")' in script
    assert "if not ch.isspace()" in script
    assert "printf 'Bearer %s\\n'" in script
    assert "cloudflare_ttl_json" in script
    assert "Cloudflare zone lookup failed with HTTP" in script
    assert "Cloudflare DNS record lookup failed with HTTP" in script
    assert "Cloudflare API ${method} failed with HTTP ${http_code}" in script
    assert 'scheme="https"' in script
    assert "`CLOUDFLARE_PROXIED`" in runbook


def test_agent_api_endpoint_uses_dns_only_tls_and_path_allowlist() -> None:
    script = read("scripts/configure-agent-api-endpoint.sh")
    manifest = read("deploy/management/agent-api-proxy.yaml")
    kustomization = read("deploy/management/kustomization.yaml")
    aws_up = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert "AGENT_API_DOMAIN is required" in script
    assert "AGENT_API_ACM_CERT_ARN is required" in script
    assert "CLOUDFLARE_API_TOKEN is required" in script
    assert "CLOUDFLARE_ZONE_ID is required" in script
    assert "aws-load-balancer-ssl-cert" in script
    assert "aws-load-balancer-ssl-ports: https" in script
    assert "aws-load-balancer-backend-protocol: tcp" in script
    assert "proxied:false" in script
    assert "PUBLIC_MANAGEMENT_BASE_URL" in script
    assert "rollout restart deployment/api-gateway" in script
    assert "cloudflare-dns.com/dns-query" in script
    assert '--resolve "${AGENT_API_DOMAIN}:443:${resolved_ip}"' in script
    assert "agent-api.woonyong.org" not in script
    assert "arn:aws:acm:ap-northeast-2" not in script
    assert "location ^~ /api/agent/" in manifest
    assert "location ^~ /api/install/" in manifest
    assert "location = /api/healthz" in manifest
    assert "location = /live/agent" in manifest
    assert "proxy_set_header Upgrade $http_upgrade" in manifest
    assert 'proxy_set_header Connection "upgrade"' in manifest
    assert "location = /live/browser" not in manifest
    assert "location /" in manifest
    assert "return 404" in manifest
    assert "location /api/auth" not in manifest
    assert "replicas: 2" in manifest
    assert "nginxinc/nginx-unprivileged:1.29-alpine@sha256:" in manifest
    assert "automountServiceAccountToken: false" in manifest
    assert "topologySpreadConstraints:" in manifest
    assert "whenUnsatisfiable: DoNotSchedule" in manifest
    assert "matchLabelKeys:" in manifest
    assert "pod-template-hash" in manifest
    assert "kind: PodDisruptionBudget" in manifest
    assert "minAvailable: 1" in manifest
    assert "agent-api-proxy.yaml" in kustomization
    assert (
        'PUBLIC_MANAGEMENT_BASE_URL="${PUBLIC_MANAGEMENT_BASE_URL:-${PUBLIC_API_BASE_URL}}"'
        in aws_up
    )
    assert '--from-literal=PUBLIC_MANAGEMENT_BASE_URL="${PUBLIC_MANAGEMENT_BASE_URL}"' in aws_up
    assert "configure-agent-api-endpoint.sh" in runbook


def test_aws_management_rollout_status_retries_transient_eks_api_errors() -> None:
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert "management_rollout_resources()" in script
    assert "management_rollout_status()" in script
    assert "management rollout resource list failed (attempt ${attempt}/3); retrying" in script
    assert (
        "management rollout status failed for ${resource} (attempt ${attempt}/3); retrying"
        in script
    )
    assert "management rollout status failed after 3 attempts: ${resource}" in script
    assert (
        'kubectl --context "${MGMT_CLUSTER}" -n management get "${resource}" -o wide || true'
        in script
    )
    assert (
        'kubectl --context "${MGMT_CLUSTER}" -n management describe "${resource}" || true' in script
    )
    assert 'management_rollout_status "${resource}"' in script
    assert "done < <(management_rollout_resources)" in script
    assert "TLS handshake timeout" in runbook
    assert "3번 재시도" in runbook


def test_aws_deploy_uses_first_target_cluster_id_by_default() -> None:
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'SMOKE_CLUSTER_ID="${SMOKE_CLUSTER_ID:-${TARGET_CLUSTER_ID_1}}"' in script
    assert "`SMOKE_CLUSTER_ID`" in runbook


def test_smoke_retries_gateway_health_before_api_flow() -> None:
    script = read("scripts/smoke.sh")
    auth_script = read("scripts/lib/auth.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'SMOKE_GATEWAY_ATTEMPTS="${SMOKE_GATEWAY_ATTEMPTS:-60}"' in script
    assert 'SMOKE_GATEWAY_INTERVAL_SECONDS="${SMOKE_GATEWAY_INTERVAL_SECONDS:-5}"' in script
    assert "wait_for_gateway" in script
    assert "api_base_candidates" in script
    assert 'curl -fsS "${candidate}/healthz"' in script
    assert 'printf \'%s/api\\n%s\\n\' "${base}" "${base}"' in script
    assert 'API_BASE_URL="${candidate}"' in script
    assert "`SMOKE_GATEWAY_ATTEMPTS`" in runbook
    assert 'AUTH_LOGIN_ATTEMPTS="${AUTH_LOGIN_ATTEMPTS:-12}"' in auth_script
    assert (
        'AUTH_LOGIN_RETRY_INTERVAL_SECONDS="${AUTH_LOGIN_RETRY_INTERVAL_SECONDS:-5}"' in auth_script
    )
    assert "login failed (attempt ${attempt}/${AUTH_LOGIN_ATTEMPTS}); retrying" in auth_script
    assert "`AUTH_LOGIN_ATTEMPTS`" in runbook
    assert '"force": True' in script


def test_aws_deploy_runs_smoke_by_default_and_normalizes_boolean_input() -> None:
    script = read("scripts/aws-up.sh")

    assert 'RUN_SMOKE="${RUN_SMOKE:-1}"' in script
    assert "1|true|TRUE|yes|YES|on|ON)" in script
    assert 'RUN_SMOKE="1"' in script
    assert "0|false|FALSE|no|NO|off|OFF)" in script
    assert 'RUN_SMOKE="0"' in script
    assert "RUN_SMOKE must be a boolean value" in script


def test_aws_image_supports_remote_git_manifest_reads() -> None:
    dockerfile = read("src/services/Dockerfile")

    assert "KUBECTL_VERSION=v1.36.2" in dockerfile
    assert "HELM_VERSION=v3.21.2" in dockerfile
    assert "COPY --from=tools /usr/local/bin/kubectl" in dockerfile
    assert "COPY --from=tools /usr/local/bin/helm" in dockerfile
    assert "kubectl version --client=true" in dockerfile
    assert "helm version --short" in dockerfile


def test_aws_deploy_builds_and_patches_console_frontend_image() -> None:
    script = read("scripts/aws-up.sh")
    down_script = read("scripts/aws-down.sh")
    console_manifest = read("deploy/management/console.yaml")
    frontend_dockerfile = read("frontend/Dockerfile")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'CONSOLE_ECR_REPO="${CONSOLE_ECR_REPO:-${PROJECT_SLUG}-console}"' in script
    assert 'CONSOLE_IMAGE_NAME="${CONSOLE_IMAGE_NAME:-}"' in script
    assert "ensure_ecr_images()" in script
    assert "${ROOT_DIR}/frontend/Dockerfile" in script
    assert "${ROOT_DIR}/frontend" in script
    assert "kubeheal-console" in script
    assert "newName: ${console_image_repo}" in script
    assert "newTag: ${console_image_tag}" in script
    assert (
        "image: kubeheal-console@sha256:"
        "0000000000000000000000000000000000000000000000000000000000000000" in console_manifest
    )
    assert "kubeheal-console:latest" not in console_manifest
    assert "FROM node:22-alpine AS build" in frontend_dockerfile
    assert "RUN npm run build" in frontend_dockerfile
    assert "COPY --from=build /app/dist/" in frontend_dockerfile
    assert 'CONSOLE_ECR_REPO="${CONSOLE_ECR_REPO:-${PROJECT_SLUG}-console}"' in down_script
    assert "`CONSOLE_ECR_REPO`" in runbook


def test_aws_admin_bootstrap_uses_current_identity_repository() -> None:
    script = read("scripts/aws-up.sh")

    assert "db.upsert_admin_account(" in script
    assert "role = 'admin'" not in script
    assert "workspace_members" not in script
    assert "--from-literal=PUBLIC_BASE_URL=" in script
    assert "--from-literal=PUBLIC_API_BASE_URL=" in script


def test_aws_smoke_uses_runnable_application_manifest() -> None:
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'MANIFEST_PATH="${MANIFEST_PATH:-}"' in script
    assert 'SMOKE_MANIFEST_PATH="${SMOKE_MANIFEST_PATH:-src/samples/smoke/deploy.yaml}"' in script
    assert "MANIFEST_PATH is required for AWS deployment" in script
    assert "`MANIFEST_PATH`" in runbook
    assert "deploy/target/target.yaml" not in script
