from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_ci_manifest_checks_do_not_require_docker() -> None:
    workflow = read(".github/workflows/ci.yml")
    script = read("scripts/manifest-check.sh")

    assert "bash scripts/manifest-check.sh" in workflow
    assert "docker run" not in workflow
    assert "docker build" not in workflow
    assert "kubeconform" not in workflow
    assert "service:ci" not in workflow
    assert "kubectl create" not in script
    assert "kubectl kustomize" in script


def test_integration_smoke_dispatches_aws_cd_smoke() -> None:
    workflow = read(".github/workflows/integration-smoke.yml")

    assert "gh workflow run aws-cd.yml" in workflow
    assert "-f run_smoke=true" in workflow
    assert "gh run watch" in workflow
    assert "kind" not in workflow.lower()
    assert "make up" not in workflow
    assert "make smoke" not in workflow


def test_dev_promotion_uses_repository_checks_and_aws_smoke() -> None:
    workflow = read(".github/workflows/promote-dev.yml")

    assert "bash scripts/test.sh" in workflow
    assert "bash scripts/build-image.sh" not in workflow
    assert "-f run_smoke=true" in workflow


def test_make_check_and_docs_point_to_aws_smoke() -> None:
    makefile = read("Makefile")
    docs = read("docs/aws-cicd.md")

    assert "check: test manifest-check" in makefile
    assert "aws-smoke:" in makefile
    assert "MGMT_CLUSTER ?=" in makefile
    assert "TARGET_CLUSTER ?=" in makefile
    assert "AWS CD" in docs
    assert "run_smoke=true" in docs
    assert "CLOUDFLARE_PROXIED" in docs


def test_local_test_profile_wires_bootstrap_smoke_and_bruno() -> None:
    makefile = read("Makefile")
    local_env = read("config/env/local-test.env.example")
    local_docs = read("docs/local-testing.md")
    bruno_local = read("docs/api/environments/local.bru")

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
    assert "auth_email: admin.local@example.com" in bruno_local
    assert "auth_password: local-test-password-1234" in bruno_local
    assert "cluster_id: target" in bruno_local


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
    workflow = read(".github/workflows/aws-cd.yml")
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert "CLOUDFLARE_PROXIED: ${{ vars.CLOUDFLARE_PROXIED || '1' }}" in workflow
    assert 'CLOUDFLARE_PROXIED="${CLOUDFLARE_PROXIED:-1}"' in script
    assert '"proxied": ${proxied}' in script
    assert 'scheme="https"' in script
    assert "`CLOUDFLARE_PROXIED`" in runbook


def test_aws_smoke_uses_first_target_cluster_id_by_default() -> None:
    workflow = read(".github/workflows/aws-cd.yml")
    script = read("scripts/aws-up.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert "TARGET_CLUSTER_ID_1:" in workflow
    assert "TARGET_CLUSTER_ID_2:" in workflow
    assert "SMOKE_CLUSTER_ID:" in workflow
    assert 'SMOKE_CLUSTER_ID="${SMOKE_CLUSTER_ID:-${TARGET_CLUSTER_ID_1}}"' in script
    assert "`SMOKE_CLUSTER_ID`" in runbook


def test_smoke_retries_gateway_health_before_api_flow() -> None:
    script = read("scripts/smoke.sh")
    runbook = read("docs/aws-testing-runbook.md")

    assert 'SMOKE_GATEWAY_ATTEMPTS="${SMOKE_GATEWAY_ATTEMPTS:-60}"' in script
    assert 'SMOKE_GATEWAY_INTERVAL_SECONDS="${SMOKE_GATEWAY_INTERVAL_SECONDS:-5}"' in script
    assert "wait_for_gateway" in script
    assert 'curl -fsS "${BASE_URL}/healthz"' in script
    assert "`SMOKE_GATEWAY_ATTEMPTS`" in runbook
    assert '"force": True' in script


def test_aws_image_and_workflow_support_remote_git_manifest_reads() -> None:
    dockerfile = read("src/services/Dockerfile")
    workflow = read(".github/workflows/aws-cd.yml")
    runbook = read("docs/aws-testing-runbook.md")

    assert "apt-get install -y --no-install-recommends git ca-certificates" in dockerfile
    assert "GITHUB_TOKEN: ${{ secrets.GH_APP_TOKEN || github.token }}" in workflow
    assert "`GH_APP_TOKEN`" in runbook
