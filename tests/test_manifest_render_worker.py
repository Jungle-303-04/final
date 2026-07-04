from __future__ import annotations

import subprocess
from urllib import error

import pytest
from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import GitChangedBody


def test_render_emits_manifest_invalid_when_no_source_is_available() -> None:
    # manifest 소스가 없으면 Deployment 를 합성하지 않고 정직하게 실패해야 함.
    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="abc123", image="img:new", replicas=2),
        db=db,
    )
    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].reason == "manifest source unavailable"
    assert outs[0].workspace_id == "default"
    assert outs[0].binding_id == "binding-default"
    assert db.called("record_manifest_artifact")
    assert not db.called("save_repo_change")
    assert not db.called("mark_watch_observed")


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


def test_render_reads_manifest_from_github_commit(monkeypatch) -> None:
    render = load_service("gitops/manifest-render-worker")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.setenv("GITHUB_API_BASE", "https://api.github.test")
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    calls: list[tuple[str, str | None, float]] = []

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def read(self) -> bytes:
            return b"\n".join(
                [
                    b"apiVersion: apps/v1",
                    b"kind: Deployment",
                    b"metadata:",
                    b"  name: checkout-api",
                    b"  namespace: sandbox",
                    b"spec:",
                    b"  replicas: 4",
                    b"  template:",
                    b"    spec:",
                    b"      containers:",
                    b"        - name: checkout-api",
                    b"          image: ghcr.io/project/checkout-api:demo",
                ]
            )

    def fake_urlopen(req: object, timeout: float) -> Response:
        calls.append(
            (
                req.full_url,  # type: ignore[attr-defined]
                req.get_header("Authorization"),  # type: ignore[attr-defined]
                timeout,
            )
        )
        return Response()

    monkeypatch.setattr(render.request, "urlopen", fake_urlopen)

    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="ignored",
            replicas=1,
            repo_ref="owner/demo",
            manifest_path="k8s/deploy.yaml",
        ),
        db=SpyDb(),
    )

    manifest = outs[0].rendered_manifest
    assert calls == [
        (
            "https://api.github.test/repos/owner/demo/contents/k8s/deploy.yaml?ref=abc123",
            "Bearer token-1",
            5.0,
        )
    ]
    assert manifest.metadata.name == "checkout-api"
    assert manifest.spec.replicas == 4
    assert manifest.spec.image == "ghcr.io/project/checkout-api:demo"


def test_render_treats_remote_manifest_fetch_failure_as_invalid_by_default(monkeypatch) -> None:
    render = load_service("gitops/manifest-render-worker")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.delenv("GIT_REMOTE_MANIFEST_REQUIRED", raising=False)

    def fail_urlopen(_req: object, timeout: float) -> object:
        raise error.URLError("temporary unavailable")

    monkeypatch.setattr(render.request, "urlopen", fail_urlopen)

    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="ignored",
            replicas=1,
            repo_ref="owner/demo",
            manifest_path="k8s/deploy.yaml",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert "failed to load GitHub manifest" in outs[0].reason
    assert not db.called("save_repo_change")
    assert not db.called("mark_watch_observed")


def test_render_emits_each_kubernetes_object_from_multi_document_yaml(
    monkeypatch, tmp_path
) -> None:
    source = tmp_path / "bundle.yaml"
    source.write_text(
        "\n---\n".join(
            [
                "\n".join(
                    [
                        "apiVersion: apps/v1",
                        "kind: Deployment",
                        "metadata:",
                        "  name: checkout-api",
                        "spec:",
                        "  replicas: 5",
                        "  template:",
                        "    spec:",
                        "      containers:",
                        "        - name: checkout-api",
                        "          image: ghcr.io/project/checkout-api:v2",
                    ]
                ),
                "\n".join(
                    [
                        "apiVersion: v1",
                        "kind: Service",
                        "metadata:",
                        "  name: checkout-api",
                        "spec:",
                        "  selector:",
                        "    app: checkout-api",
                        "  ports:",
                        "    - port: 80",
                        "      targetPort: 8000",
                    ]
                ),
                "\n".join(
                    [
                        "apiVersion: v1",
                        "kind: ConfigMap",
                        "metadata:",
                        "  name: checkout-api-config",
                        "data:",
                        "  LOG_LEVEL: info",
                    ]
                ),
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(source))

    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="ignored",
            replicas=1,
            manifest_path=str(source),
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.rendered", "manifest.rendered", "manifest.rendered"]
    assert [out.rendered_manifest.kind for out in outs] == [
        "Deployment",
        "Service",
        "ConfigMap",
    ]
    assert outs[0].rendered_manifest.metadata.namespace == "sandbox"
    assert outs[0].rendered_manifest.spec.replicas == 5
    assert outs[0].rendered_manifest.spec.image == "ghcr.io/project/checkout-api:v2"
    assert outs[0].rendered_manifest.declared_fields == [
        "spec.replicas",
        "spec.template.spec.containers[name=checkout-api].image",
    ]
    assert outs[1].rendered_manifest.manifest["spec"]["ports"][0]["port"] == 80
    assert outs[2].rendered_manifest.manifest["data"]["LOG_LEVEL"] == "info"
    assert sum(1 for call in db.calls if call[0] == "save_repo_change") == 3
    assert sum(1 for call in db.calls if call[0] == "mark_watch_observed") == 1
    artifact_paths = [
        call[1][0]["manifest_path"] for call in db.calls if call[0] == "record_manifest_artifact"
    ]
    assert artifact_paths == [
        f"{source}#deployment/checkout-api",
        f"{source}#service/checkout-api",
        f"{source}#configmap/checkout-api-config",
    ]


def test_render_uses_kubernetes_default_replicas_when_deployment_omits_it(
    monkeypatch, tmp_path
) -> None:
    manifest = tmp_path / "deploy.yaml"
    manifest.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout-api",
                "spec:",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: checkout-api",
                "          image: ghcr.io/project/checkout-api:v2",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(manifest))

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="abc123", image="ignored", replicas=2),
        db=SpyDb(),
    )

    assert outs[0].rendered_manifest.spec.replicas == 1
    assert "replicas" not in outs[0].rendered_manifest.manifest["spec"]


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


@pytest.mark.parametrize(
    ("manifest_lines", "reason"),
    [
        (
            [
                "apiVersion: rbac.authorization.k8s.io/v1",
                "kind: ClusterRole",
                "metadata:",
                "  name: forbidden-role",
                "rules: []",
            ],
            "unsupported manifest kind: rbac.authorization.k8s.io/v1/ClusterRole",
        ),
        (
            [
                "apiVersion: extensions/v1beta1",
                "kind: Deployment",
                "metadata:",
                "  name: legacy-api",
                "spec:",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: legacy-api",
                "          image: ghcr.io/project/legacy-api:v1",
            ],
            "unsupported manifest kind: extensions/v1beta1/Deployment",
        ),
    ],
)
def test_render_rejects_unsupported_kubernetes_resource_contract(
    monkeypatch, tmp_path, manifest_lines: list[str], reason: str
) -> None:
    manifest = tmp_path / "unsupported.yaml"
    manifest.write_text("\n".join(manifest_lines), encoding="utf-8")
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(manifest))

    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="bad123", image="ignored", replicas=1),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].reason == reason
    assert db.called("record_manifest_artifact")
    assert not db.called("save_repo_change")


def test_render_rejects_boolean_deployment_replicas(monkeypatch, tmp_path) -> None:
    broken = tmp_path / "broken-replicas.yaml"
    broken.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout-api",
                "spec:",
                "  replicas: true",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: checkout-api",
                "          image: ghcr.io/project/checkout-api:v2",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(broken))

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="bad123", image="ignored", replicas=1),
        db=SpyDb(),
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].reason == "deployment spec.replicas must be an integer"


@pytest.mark.parametrize(
    ("replicas", "reason"),
    [
        ("1.5", "deployment spec.replicas must be an integer"),
        ("'3'", "deployment spec.replicas must be an integer"),
        ("-1", "deployment spec.replicas must be a non-negative integer"),
    ],
)
def test_render_rejects_invalid_deployment_replicas_values(
    monkeypatch, tmp_path, replicas: str, reason: str
) -> None:
    broken = tmp_path / "broken-replicas.yaml"
    broken.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout-api",
                "spec:",
                f"  replicas: {replicas}",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: checkout-api",
                "          image: ghcr.io/project/checkout-api:v2",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(broken))

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="bad123", image="ignored", replicas=1),
        db=SpyDb(),
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].reason == reason
