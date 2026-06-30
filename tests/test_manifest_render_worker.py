from __future__ import annotations

import subprocess

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import GitChangedBody


def test_render_emits_manifest_rendered() -> None:
    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="abc123", image="img:new", replicas=2),
        db=db,
    )
    assert subjects_of(outs) == ["manifest.rendered"]
    assert outs[0].rendered_manifest.spec.image == "img:new"
    assert outs[0].rendered_manifest.api_version == "apps/v1"
    assert outs[0].workspace_id == "default"
    assert outs[0].binding_id == "binding-default"
    assert db.called("save_repo_change")
    assert db.called("record_manifest_artifact")


def test_render_reads_manifest_from_git_commit(monkeypatch, tmp_path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "deploy.yaml").write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: pulled-api",
                "  namespace: sandbox",
                "spec:",
                "  replicas: 3",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: pulled-api",
                "          image: ghcr.io/project/pulled-api:1",
            ]
        ),
        encoding="utf-8",
    )
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "add", "deploy.yaml"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True)
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo, check=True, capture_output=True, text=True
    ).stdout.strip()
    monkeypatch.setenv("GIT_REPO_PATH", str(repo))
    monkeypatch.setenv("GIT_MANIFEST_PATH", "deploy.yaml")

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha=sha, image="ignored", replicas=1),
        db=SpyDb(),
    )

    manifest = outs[0].rendered_manifest
    assert manifest.metadata.name == "pulled-api"
    assert manifest.metadata.namespace == "sandbox"
    assert manifest.spec.replicas == 3
    assert manifest.spec.image == "ghcr.io/project/pulled-api:1"


def test_render_records_invalid_manifest_without_retry(monkeypatch, tmp_path) -> None:
    broken = tmp_path / "broken.yaml"
    broken.write_text("not: a deployment\n", encoding="utf-8")
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(broken))

    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="bad123",
            image="ignored",
            replicas=1,
            repository_id="repo-1",
            binding_id="binding-1",
            manifest_path="deploy/broken.yaml",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].repository_id == "repo-1"
    assert outs[0].binding_id == "binding-1"
    assert "manifest must include" in outs[0].reason
    assert db.called("record_manifest_artifact")
    assert not db.called("save_repo_change")
