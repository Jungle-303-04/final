"""manifest 렌더 전략 계약."""

from __future__ import annotations

from typing import Any, Protocol


class ManifestRenderer(Protocol):
    """Manifest 값 객체를 렌더된 Kubernetes manifest 로 변환하는 전략.

    manifest 는 domains.gitops.events.Manifest, 반환은 RenderedManifest 임
    (레이어 규칙상 packages 는 domains 를 import 못 해 구조적 시그니처로 둠).
    """

    def render(self, manifest: Any) -> Any: ...
