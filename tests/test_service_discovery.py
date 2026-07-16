"""서비스 자동 발견(discovery) 검증 — 명부의 단일 출처가 올바르게 동작하는지."""

from __future__ import annotations

from pathlib import Path

import pytest

from packages.runtime.discovery import (
    DiscoveredService,
    describe_services,
    discover_services,
)
from packages.runtime.spec import ServiceSpec

ROOT_DIR = Path(__file__).resolve().parents[1]


def test_discovers_all_entrypoints() -> None:
    services = discover_services(ROOT_DIR)

    names = {svc.name for svc in services}
    # 대표 서비스 존재 확인(전수 나열은 하지 않는다 — 그게 이 모듈의 목적).
    assert {
        "api-gateway",
        "diff-worker",
        "ai-diff-worker",
        "cluster-agent",
        "realtime-gateway",
    } <= names
    assert len(services) >= 28


def test_kind_classification() -> None:
    by_name = {svc.name: svc for svc in discover_services(ROOT_DIR)}

    assert by_name["api-gateway"].kind == "http"
    assert by_name["realtime-gateway"].kind == "http"
    assert by_name["cluster-agent"].kind == "async"
    assert by_name["diff-worker"].kind == "worker"


def test_duplicate_directory_names_resolved_by_app_literal() -> None:
    """ai/diff-worker 와 gitops/diff-worker — App 리터럴 이름으로 구분됨."""
    by_name = {svc.name: svc for svc in discover_services(ROOT_DIR)}

    assert by_name["diff-worker"].group == "gitops"
    assert by_name["ai-diff-worker"].group == "ai"


def test_duplicate_names_fail_fast(tmp_path: Path) -> None:
    for group in ("a", "b"):
        service_dir = tmp_path / "src" / "services" / group / "worker"
        service_dir.mkdir(parents=True)
        (service_dir / "app.py").write_text('app = App("same-name")\n', encoding="utf-8")

    with pytest.raises(ValueError, match="중복"):
        discover_services(tmp_path)


def test_missing_runner_fails_fast(tmp_path: Path) -> None:
    service_dir = tmp_path / "src" / "services" / "g" / "svc"
    service_dir.mkdir(parents=True)
    (service_dir / "app.py").write_text("print('no runner')\n", encoding="utf-8")

    with pytest.raises(ValueError, match="선언을 찾지 못함"):
        discover_services(tmp_path)


def test_explicitly_ignored_entrypoint_is_not_discovered(tmp_path: Path) -> None:
    ignored_dir = tmp_path / "src" / "services" / "mcp" / "internal_control"
    ignored_dir.mkdir(parents=True)
    (ignored_dir / "app.py").write_text(
        "RUNTIME_DISCOVERY_IGNORE = True\nprint('stdio entrypoint')\n",
        encoding="utf-8",
    )
    service_dir = tmp_path / "src" / "services" / "gitops" / "x-worker"
    service_dir.mkdir(parents=True)
    (service_dir / "app.py").write_text('app = App("x-worker")\n', encoding="utf-8")

    (svc,) = discover_services(tmp_path)

    assert svc.name == "x-worker"


def test_service_spec_name_required() -> None:
    with pytest.raises(ValueError):
        ServiceSpec(name=" ")


def test_describe_lists_every_service() -> None:
    services = discover_services(ROOT_DIR)
    text = describe_services(services)

    for svc in services:
        assert svc.name in text


def test_service_spec_literal_is_discoverable(tmp_path: Path) -> None:
    service_dir = tmp_path / "src" / "services" / "gitops" / "x-worker"
    service_dir.mkdir(parents=True)
    (service_dir / "app.py").write_text(
        'app = App(ServiceSpec(name="x-worker", group="gitops"))\n',
        encoding="utf-8",
    )

    (svc,) = discover_services(tmp_path)
    assert svc == DiscoveredService(
        name="x-worker",
        group="gitops",
        dirname="x-worker",
        path=Path("src/services/gitops/x-worker/app.py"),
        kind="worker",
    )
