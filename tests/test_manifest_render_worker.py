from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path
from urllib import error

import pytest
from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import GitChangedBody, RenderedManifest, RenderedMetadata, RenderedSpec


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
    assert outs[0].binding_id == ""
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
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha=sha, image="ignored", replicas=1),
        db=db,
    )

    manifest = outs[0].rendered_manifest
    assert manifest.metadata.name == "pulled-api"
    assert manifest.metadata.namespace == "sandbox"
    assert manifest.spec.replicas == 3
    assert manifest.spec.image == "ghcr.io/project/pulled-api:1"
    assert manifest.artifact_digest.startswith("sha256:")
    assert len(manifest.artifact_digest) == len("sha256:") + 64
    artifact = next(call[1][0] for call in db.calls if call[0] == "record_manifest_artifact")
    assert artifact["source_summary"]["source_type"] == "raw-yaml"
    assert artifact["source_summary"]["source_is_file"] is True
    assert artifact["source_summary"]["source_document_count"] == 1
    assert artifact["source_summary"]["source_manifest_sha256"].startswith("sha256:")


def test_render_reads_manifest_from_checkout_cache(monkeypatch, tmp_path) -> None:
    repo = tmp_path / "source-repo"
    cache = tmp_path / "cache"
    repo.mkdir()
    (repo / "deploy.yaml").write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: cached-api",
                "  namespace: sandbox",
                "spec:",
                "  replicas: 2",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: cached-api",
                "          image: ghcr.io/project/cached-api:1",
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
    monkeypatch.setenv("GIT_CHECKOUT_CACHE_ENABLED", "1")
    monkeypatch.setenv("GIT_CHECKOUT_CACHE_REQUIRED", "1")
    monkeypatch.setenv("GIT_CACHE_REMOTE_URL", str(repo))
    monkeypatch.setenv("GIT_CACHE_DIR", str(cache))

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha=sha,
            image="ignored",
            replicas=1,
            repo_ref="owner/cached",
            manifest_path="deploy.yaml",
        ),
        db=SpyDb(),
    )

    manifest = outs[0].rendered_manifest
    assert manifest.metadata.name == "cached-api"
    assert manifest.spec.replicas == 2
    assert manifest.spec.image == "ghcr.io/project/cached-api:1"
    assert any(cache.glob("*.git"))


def test_repo_remote_url_uses_configured_github_web_base(monkeypatch) -> None:
    render = load_service("gitops/manifest-render-worker")
    monkeypatch.setenv("GITHUB_WEB_BASE", "https://github.enterprise.local")

    assert (
        render.repo_remote_url("platform/service")
        == "https://github.enterprise.local/platform/service.git"
    )


def test_render_reads_manifest_from_github_commit(monkeypatch) -> None:
    render = load_service("gitops/manifest-render-worker")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.setenv("GITHUB_API_BASE", "https://api.github.test")
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("GITHUB_TOKEN_REF", "env:GITHUB_TOKEN")
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

    def stub_urlopen(req: object, timeout: float) -> Response:
        calls.append(
            (
                req.full_url,  # type: ignore[attr-defined]
                req.get_header("Authorization"),  # type: ignore[attr-defined]
                timeout,
            )
        )
        return Response()

    monkeypatch.setattr(render.request, "urlopen", stub_urlopen)

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


def test_render_prefers_remote_manifest_when_remote_is_enabled(monkeypatch, tmp_path) -> None:
    render = load_service("gitops/manifest-render-worker")
    local = tmp_path / "deploy.yaml"
    local.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: local-api",
                "spec:",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: local-api",
                "          image: local",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(local))
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_REQUIRED", "1")

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
                    b"  name: remote-api",
                    b"spec:",
                    b"  template:",
                    b"    spec:",
                    b"      containers:",
                    b"        - name: remote-api",
                    b"          image: remote",
                ]
            )

    monkeypatch.setattr(render.request, "urlopen", lambda *_args, **_kwargs: Response())

    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="ignored",
            replicas=1,
            repo_ref="example/repo",
        ),
        db=SpyDb(),
    )

    assert outs[0].rendered_manifest.metadata.name == "remote-api"
    assert outs[0].rendered_manifest.spec.image == "remote"


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


def test_render_does_not_fall_back_to_local_when_remote_is_required(monkeypatch, tmp_path) -> None:
    render = load_service("gitops/manifest-render-worker")
    local = tmp_path / "deploy.yaml"
    local.write_text(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: local-api",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(local))
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_REQUIRED", "1")

    def fail_urlopen(_req: object, timeout: float) -> object:
        raise error.URLError("temporary unavailable")

    monkeypatch.setattr(render.request, "urlopen", fail_urlopen)

    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="ignored",
            replicas=1,
            repo_ref="example/repo",
        ),
        db=SpyDb(),
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert "failed to load GitHub manifest" in outs[0].reason


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
    assert outs[0].rendered_manifest.artifact_digest.startswith("sha256:")
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
    artifact_digests = [
        call[1][0]["artifact_digest"] for call in db.calls if call[0] == "record_manifest_artifact"
    ]
    assert artifact_digests == [out.rendered_manifest.artifact_digest for out in outs]
    source_summaries = [
        call[1][0]["source_summary"] for call in db.calls if call[0] == "record_manifest_artifact"
    ]
    assert {summary["source_is_file"] for summary in source_summaries} == {True}
    assert {summary["source_document_count"] for summary in source_summaries} == {3}


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


def test_render_preserves_crd_and_custom_resource_manifests(monkeypatch, tmp_path) -> None:
    manifest = tmp_path / "custom-resources.yaml"
    manifest.write_text(
        "\n---\n".join(
            [
                "\n".join(
                    [
                        "apiVersion: apiextensions.k8s.io/v1",
                        "kind: CustomResourceDefinition",
                        "metadata:",
                        "  name: widgets.example.com",
                        "spec:",
                        "  group: example.com",
                        "  names:",
                        "    kind: Widget",
                        "    plural: widgets",
                        "  scope: Namespaced",
                    ]
                ),
                "\n".join(
                    [
                        "apiVersion: example.com/v1",
                        "kind: Widget",
                        "metadata:",
                        "  name: checkout-widget",
                        "  namespace: sandbox",
                        "spec:",
                        "  size: small",
                    ]
                ),
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(manifest))

    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="crd123", image="ignored", replicas=1),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.rendered", "manifest.rendered"]
    assert outs[0].rendered_manifest.kind == "CustomResourceDefinition"
    assert outs[0].rendered_manifest.metadata.namespace == ""
    assert outs[1].rendered_manifest.kind == "Widget"
    assert outs[1].rendered_manifest.metadata.namespace == "sandbox"
    assert outs[1].rendered_manifest.manifest["spec"]["size"] == "small"
    assert sum(1 for call in db.calls if call[0] == "record_manifest_artifact") == 2


def test_render_reads_raw_manifest_directory(monkeypatch, tmp_path) -> None:
    directory = tmp_path / "manifests"
    directory.mkdir()
    (directory / "config.json").write_text(
        '{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"from-json"},"data":{"A":"B"}}',
        encoding="utf-8",
    )
    (directory / "service.yaml").write_text(
        "\n".join(
            [
                "apiVersion: v1",
                "kind: Service",
                "metadata:",
                "  name: from-yaml",
                "spec:",
                "  ports:",
                "    - port: 80",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(directory))

    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="dir123", image="ignored", replicas=1),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.rendered", "manifest.rendered"]
    assert [out.rendered_manifest.kind for out in outs] == ["ConfigMap", "Service"]
    source_summaries = [
        call[1][0]["source_summary"] for call in db.calls if call[0] == "record_manifest_artifact"
    ]
    assert {summary["source_is_file"] for summary in source_summaries} == {False}
    assert {summary["source_document_count"] for summary in source_summaries} == {2}


def test_render_respects_event_raw_json_source_type(monkeypatch, tmp_path) -> None:
    manifest = tmp_path / "config.json"
    manifest.write_text(
        '{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"json-config"},"data":{"A":"B"}}',
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_MANIFEST_PATH", str(manifest))

    render = load_service("gitops/manifest-render-worker")
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(commit_sha="json123", image="ignored", replicas=1, source_type="raw-json"),
        db=SpyDb(),
    )

    assert subjects_of(outs) == ["manifest.rendered"]
    assert outs[0].rendered_manifest.kind == "ConfigMap"
    assert outs[0].rendered_manifest.metadata.name == "json-config"


def test_render_exports_kustomize_source_from_github_tree(monkeypatch) -> None:
    render = load_service("gitops/manifest-render-worker")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_ENABLED", "1")
    monkeypatch.setenv("GIT_REMOTE_MANIFEST_REQUIRED", "1")
    monkeypatch.setenv("GITHUB_API_BASE", "https://api.github.test")
    calls: list[str] = []

    class Response:
        def __init__(self, payload: bytes) -> None:
            self.payload = payload

        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def read(self) -> bytes:
            return self.payload

    def content_payload(source: str) -> bytes:
        raw = source.encode("utf-8")
        return json.dumps(
            {
                "type": "file",
                "encoding": "base64",
                "size": len(raw),
                "content": base64.b64encode(raw).decode("ascii"),
            }
        ).encode("utf-8")

    responses = {
        "https://api.github.test/repos/owner/demo/commits/kustomize123": json.dumps(
            {"commit": {"tree": {"sha": "tree123"}}}
        ).encode("utf-8"),
        "https://api.github.test/repos/owner/demo/git/trees/tree123?recursive=1": json.dumps(
            {
                "tree": [
                    {"type": "blob", "path": "deploy/k8s/kustomization.yaml"},
                    {"type": "blob", "path": "deploy/k8s/deployment.yaml"},
                    {"type": "blob", "path": "README.md"},
                ]
            }
        ).encode("utf-8"),
        "https://api.github.test/repos/owner/demo/contents/deploy/k8s/kustomization.yaml?ref=kustomize123": content_payload(
            "\n".join(
                [
                    "apiVersion: kustomize.config.k8s.io/v1beta1",
                    "kind: Kustomization",
                    "resources:",
                    "  - deployment.yaml",
                ]
            )
        ),
        "https://api.github.test/repos/owner/demo/contents/deploy/k8s/deployment.yaml?ref=kustomize123": content_payload(
            "\n".join(
                [
                    "apiVersion: apps/v1",
                    "kind: Deployment",
                    "metadata:",
                    "  name: checkout-api",
                    "  namespace: sandbox",
                    "spec:",
                    "  replicas: 2",
                    "  template:",
                    "    spec:",
                    "      containers:",
                    "        - name: checkout-api",
                    "          image: ghcr.io/project/checkout-api:kustomize",
                ]
            )
        ),
    }

    def stub_urlopen(req: object, timeout: float) -> Response:
        url = req.full_url  # type: ignore[attr-defined]
        calls.append(url)
        return Response(responses[url])

    rendered_paths: list[Path] = []

    def stub_run_render_command(command: list[str], error_prefix: str) -> str:
        assert error_prefix == "kustomize render failed"
        source_path = Path(command[-1])
        rendered_paths.append(source_path)
        assert (source_path / "kustomization.yaml").is_file()
        assert (source_path / "deployment.yaml").is_file()
        return "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout-api",
                "  namespace: sandbox",
                "spec:",
                "  replicas: 2",
                "  template:",
                "    spec:",
                "      containers:",
                "        - name: checkout-api",
                "          image: ghcr.io/project/checkout-api:kustomize",
            ]
        )

    monkeypatch.setattr(render.request, "urlopen", stub_urlopen)
    monkeypatch.setattr(render, "run_render_command", stub_run_render_command)

    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="kustomize123",
            image="ignored",
            replicas=1,
            repo_ref="owner/demo",
            manifest_path="deploy/k8s",
            source_type="kustomize",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.rendered"]
    assert outs[0].rendered_manifest.metadata.name == "checkout-api"
    assert outs[0].rendered_manifest.spec.image == "ghcr.io/project/checkout-api:kustomize"
    assert rendered_paths
    artifact = next(call[1][0] for call in db.calls if call[0] == "record_manifest_artifact")
    assert artifact["source_summary"]["source_type"] == "kustomize"
    assert artifact["source_summary"]["source_is_file"] is False
    assert artifact["source_summary"]["source_document_count"] == 1
    assert calls == [
        "https://api.github.test/repos/owner/demo/commits/kustomize123",
        "https://api.github.test/repos/owner/demo/git/trees/tree123?recursive=1",
        "https://api.github.test/repos/owner/demo/contents/deploy/k8s/deployment.yaml?ref=kustomize123",
        "https://api.github.test/repos/owner/demo/contents/deploy/k8s/kustomization.yaml?ref=kustomize123",
    ]


def test_render_reuses_cached_manifest_artifact_without_rerendering() -> None:
    render = load_service("gitops/manifest-render-worker")
    rendered = RenderedManifest(
        api_version="apps/v1",
        kind="Deployment",
        metadata=RenderedMetadata(name="cached-api", namespace="sandbox"),
        spec=RenderedSpec(replicas=2, image="cached:image"),
        manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "cached-api", "namespace": "sandbox"},
            "spec": {},
        },
        artifact_digest="sha256:" + "a" * 64,
    )
    db = SpyDb(
        find_rendered_manifest_artifacts=[
            {
                "artifact_id": "artifact-1",
                "manifest_path": "deploy.yaml#deployment/cached-api",
                "rendered_manifest": rendered.to_body(),
                "source_summary": {
                    "renderer_version": render.RENDERER_VERSION,
                    "source_type": "raw-yaml",
                    "source_origin": "github_contents",
                    "source_is_file": True,
                    "source_document_count": 1,
                    "source_manifest_sha256": rendered.artifact_digest,
                },
            }
        ]
    )

    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="cached123",
            image="ignored",
            replicas=1,
            binding_id="binding-1",
            manifest_path="deploy.yaml",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.rendered"]
    assert outs[0].rendered_manifest.metadata.name == "cached-api"
    assert db.called("find_rendered_manifest_artifacts")
    assert db.called("save_repo_change")
    assert db.called("mark_watch_observed")
    assert not db.called("record_manifest_artifact")


def test_render_rejects_legacy_cached_artifact_without_source_provenance() -> None:
    render = load_service("gitops/manifest-render-worker")
    rendered = RenderedManifest(
        api_version="apps/v1",
        kind="Deployment",
        metadata=RenderedMetadata(name="cached-api", namespace="sandbox"),
        spec=RenderedSpec(replicas=2, image="cached:image"),
        manifest={"apiVersion": "apps/v1", "kind": "Deployment"},
    )
    db = SpyDb(
        find_rendered_manifest_artifacts=[
            {
                "artifact_id": "artifact-legacy",
                "manifest_path": "deploy.yaml#deployment/cached-api",
                "rendered_manifest": rendered.to_body(),
                "source_summary": {"renderer_version": render.RENDERER_VERSION},
            }
        ]
    )

    outs = run_handler(
        render.on_git_changed,
        GitChangedBody(
            commit_sha="cached123",
            image="ignored",
            replicas=1,
            binding_id="binding-1",
            manifest_path="deploy.yaml",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["manifest.invalid"]
    assert outs[0].reason == "manifest source unavailable"
    assert db.called("find_rendered_manifest_artifacts")


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
