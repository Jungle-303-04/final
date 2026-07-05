"""kubectl 기반 Server-Side Apply dry-run adapter.

로컬 테스트에서는 이 adapter 없이 동작 가능. target cluster 에서는
GITOPS_ENABLE_SSA_DRY_RUN=true 로 켜면 field-level diff 전에
API server 의 predicted object 를 조회함.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from domains.gitops.diffing import rendered_manifest_to_object
from packages.config.settings import env

JsonObject = dict[str, Any]

# dry-run kubectl 호출 타임아웃 초 — env 미설정 시 기존 기본값(10) 유지(배포 호환)
DRY_RUN_TIMEOUT_SECONDS_ENV = "GITOPS_DRY_RUN_TIMEOUT_SECONDS"
DRY_RUN_TIMEOUT_SECONDS = int(env(DRY_RUN_TIMEOUT_SECONDS_ENV, "10"))


@dataclass(frozen=True)
class DryRunObjects:
    predicted: JsonObject | None
    live: JsonObject | None
    error: str | None = None


def load_dry_run_objects(
    rendered: Any,
    *,
    kubectl: str = "kubectl",
    field_manager: str = "myjob-gitops",
    timeout_seconds: int = DRY_RUN_TIMEOUT_SECONDS,
) -> DryRunObjects:
    desired = rendered_manifest_to_object(rendered)
    with tempfile.TemporaryDirectory(prefix="myjob-gitops-dryrun-") as tmp:
        manifest_path = Path(tmp) / "desired.json"
        manifest_path.write_text(json.dumps(desired), encoding="utf-8")
        predicted = _run_json(
            [
                kubectl,
                "apply",
                "--server-side",
                "--dry-run=server",
                f"--field-manager={field_manager}",
                "-f",
                str(manifest_path),
                "-o",
                "json",
            ],
            timeout_seconds=timeout_seconds,
        )
        if isinstance(predicted, str):
            return DryRunObjects(predicted=None, live=None, error=predicted)

        metadata = desired["metadata"]
        live = _run_json(
            [
                kubectl,
                "get",
                str(desired["kind"]).lower(),
                str(metadata["name"]),
                "-n",
                str(metadata["namespace"]),
                "-o",
                "json",
            ],
            timeout_seconds=timeout_seconds,
        )
        if isinstance(live, str):
            return DryRunObjects(predicted=predicted, live=None, error=live)
        return DryRunObjects(predicted=predicted, live=live)


def _run_json(command: list[str], *, timeout_seconds: int) -> JsonObject | str:
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError:
        return "kubectl_not_found"
    except subprocess.TimeoutExpired:
        return "kubectl_timeout"
    except subprocess.CalledProcessError as exc:
        return (exc.stderr or exc.stdout or str(exc)).strip()

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        return f"kubectl_invalid_json: {exc}"
