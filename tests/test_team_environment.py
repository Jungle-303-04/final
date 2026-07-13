from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_local_secret_files_are_excluded_from_git_and_docker_context() -> None:
    gitignore = read(".gitignore")
    dockerignore = read(".dockerignore")

    assert ".env*" in gitignore
    assert "*.local.bru" in gitignore
    assert ".env*" in dockerignore
    assert "*.local.bru" in dockerignore


def test_team_env_bootstrap_uses_aws_secret_without_printing_values() -> None:
    script = read("scripts/bootstrap-team-env.sh")

    assert 'SECRET_ID="${TEAM_SECRET_ID:-kubeheal/test/team}"' in script
    assert "aws secretsmanager get-secret-value" in script
    assert "install -m 600" in script
    assert "jq -e 'type == \"object\"'" in script
    assert "AWS_ACCESS_KEY_ID" not in script
    assert "AWS_SECRET_ACCESS_KEY" not in script


def test_team_env_bootstrap_renders_allowlisted_secret_values(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_aws = fake_bin / "aws"
    fake_aws.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\n\' \'{"AUTH_EMAIL":"team@example.com",'
        '"AUTH_PASSWORD":"secret value","AWS_SECRET_ACCESS_KEY":"blocked"}\'\n',
        encoding="utf-8",
    )
    fake_aws.chmod(0o755)
    template = tmp_path / "template.env"
    template.write_text("PROJECT_SLUG=kubeheal\n", encoding="utf-8")
    output = tmp_path / ".env.local-test"
    environment = os.environ | {
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "TEAM_ENV_TEMPLATE": str(template),
        "TEAM_ENV_FILE": str(output),
    }

    subprocess.run(
        ["bash", str(ROOT / "scripts" / "bootstrap-team-env.sh")],
        check=True,
        env=environment,
        capture_output=True,
        text=True,
    )

    rendered = output.read_text(encoding="utf-8")
    assert "AUTH_EMAIL='team@example.com'" in rendered
    assert "AUTH_PASSWORD='secret value'" in rendered
    assert "AWS_SECRET_ACCESS_KEY" not in rendered
    assert stat.S_IMODE(output.stat().st_mode) == 0o600


def test_github_secret_sync_uses_stdin_and_explicit_allowlist() -> None:
    script = read("scripts/sync-github-actions-secrets.sh")

    assert 'REPOSITORY="${GITHUB_REPOSITORY:-Jungle-303-04/final}"' in script
    assert "RELEASE_FLOW_AUTH_EMAIL" in script
    assert "RELEASE_FLOW_AUTH_PASSWORD" in script
    assert "RELEASE_FLOW_API_BASE_URL" in script
    assert 'gh secret set "${secret_name}" --repo "${REPOSITORY}" --body -' in script
    assert "AWS_SECRET_ACCESS_KEY" not in script


def test_local_testing_docs_explain_secret_distribution_boundary() -> None:
    docs = read("docs/local-testing.md")

    assert "GitHub Actions Secret" in docs
    assert "다시 내려받을 수 없다" in docs
    assert "kubeheal/test/team" in docs
    assert "scripts/bootstrap-team-env.sh" in docs
