from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.payloads import GitChangedPayload


def test_render_emits_manifest_rendered() -> None:
    render = load_service("gitops/manifest-render-worker")
    db = SpyDb()
    outs = run_handler(
        render.on_git_changed,
        GitChangedPayload(commit_sha="abc123", image="img:new", replicas=2),
        db=db,
    )
    assert subjects_of(outs) == ["manifest.rendered"]
    assert outs[0].rendered_manifest.spec.image == "img:new"
    assert outs[0].rendered_manifest.api_version == "apps/v1"
    assert db.called("save_repo_change")
