from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "verify_first_deploy_backup", ROOT / "scripts/verify_first_deploy_backup.py"
)
assert SPEC is not None and SPEC.loader is not None
verify_first_deploy_backup = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verify_first_deploy_backup
SPEC.loader.exec_module(verify_first_deploy_backup)
assert isinstance(verify_first_deploy_backup, ModuleType)

LiveVolume = verify_first_deploy_backup.LiveVolume
live_volume_from_documents = verify_first_deploy_backup.live_volume_from_documents
verify_snapshot_document = verify_first_deploy_backup.verify_snapshot_document

SOURCE_SHA = "a" * 40
SNAPSHOT_ID = "snap-0123456789abcdef0"
VOLUME_ID = "vol-0123456789abcdef0"
PVC_NAME = "data-postgresql-0"


def pod_document() -> dict[str, Any]:
    return {
        "spec": {
            "volumes": [
                {
                    "name": "data",
                    "persistentVolumeClaim": {"claimName": PVC_NAME},
                }
            ]
        }
    }


def pvc_document() -> dict[str, Any]:
    return {"spec": {"volumeName": "pvc-volume"}}


def pv_document() -> dict[str, Any]:
    return {
        "spec": {
            "csi": {
                "driver": "ebs.csi.aws.com",
                "volumeHandle": VOLUME_ID,
            }
        }
    }


def snapshot_document(**overrides: Any) -> dict[str, Any]:
    snapshot = {
        "SnapshotId": SNAPSHOT_ID,
        "VolumeId": VOLUME_ID,
        "State": "completed",
        "Encrypted": True,
        "Tags": [
            {"Key": "opsia:source-sha", "Value": SOURCE_SHA},
            {"Key": "opsia:postgres-pvc", "Value": PVC_NAME},
            {"Key": "opsia:restore-rehearsal", "Value": "passed"},
            {"Key": "opsia:backup-kind", "Value": "pre-first-deploy"},
        ],
    }
    snapshot.update(overrides)
    return {"Snapshots": [snapshot]}


def test_live_volume_must_be_the_postgresql_ebs_claim() -> None:
    assert live_volume_from_documents(
        pod_document(),
        pvc_document(),
        pv_document(),
        volume_name="data",
    ) == LiveVolume(pvc_name=PVC_NAME, pv_name="pvc-volume", volume_id=VOLUME_ID)


def test_completed_encrypted_snapshot_with_restore_rehearsal_is_accepted() -> None:
    evidence = verify_snapshot_document(
        snapshot_document(),
        snapshot_id=SNAPSHOT_ID,
        live_volume=LiveVolume(PVC_NAME, "pvc-volume", VOLUME_ID),
        source_sha=SOURCE_SHA,
    )

    assert evidence.snapshot_id == SNAPSHOT_ID
    assert evidence.volume_id == VOLUME_ID
    assert evidence.source_sha == SOURCE_SHA


@pytest.mark.parametrize(
    "snapshot",
    [
        snapshot_document(State="pending"),
        snapshot_document(Encrypted=False),
        snapshot_document(VolumeId="vol-fffffffffffffffff"),
        snapshot_document(Tags=[]),
        {"Snapshots": []},
    ],
)
def test_unproven_or_mismatched_snapshot_is_rejected(snapshot: dict[str, Any]) -> None:
    with pytest.raises(RuntimeError):
        verify_snapshot_document(
            snapshot,
            snapshot_id=SNAPSHOT_ID,
            live_volume=LiveVolume(PVC_NAME, "pvc-volume", VOLUME_ID),
            source_sha=SOURCE_SHA,
        )


def test_non_ebs_or_unbound_postgresql_volume_is_rejected() -> None:
    wrong_driver = pv_document()
    wrong_driver["spec"]["csi"]["driver"] = "hostpath.csi.k8s.io"

    with pytest.raises(RuntimeError, match="EBS CSI"):
        live_volume_from_documents(
            pod_document(),
            pvc_document(),
            wrong_driver,
            volume_name="data",
        )
