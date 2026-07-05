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
