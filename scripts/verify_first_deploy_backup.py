from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

GIT_SHA = re.compile(r"[0-9a-f]{40}")
KUBERNETES_NAME = re.compile(r"[a-z0-9](?:[-a-z0-9]*[a-z0-9])?")
REGION = re.compile(r"[a-z]{2}(?:-gov)?-[a-z]+-[0-9]")
SNAPSHOT_ID = re.compile(r"snap-[0-9a-f]{17}")
VOLUME_ID = re.compile(r"vol-[0-9a-f]{17}")
REQUIRED_TAGS = {
    "opsia:restore-rehearsal": "passed",
    "opsia:backup-kind": "pre-first-deploy",
}


@dataclass(frozen=True)
class LiveVolume:
    pvc_name: str
    pv_name: str
    volume_id: str


@dataclass(frozen=True)
class BackupEvidence:
    snapshot_id: str
    volume_id: str
    source_sha: str


def require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise RuntimeError(f"{label} must be an object")
    return value


def require_name(value: Any, label: str) -> str:
    if not isinstance(value, str) or not KUBERNETES_NAME.fullmatch(value):
        raise RuntimeError(f"{label} must be a Kubernetes name")
    return value


def claim_name_from_pod(document: Mapping[str, Any], *, volume_name: str) -> str:
    spec = require_mapping(document.get("spec"), "pod.spec")
    volumes = spec.get("volumes")
    if not isinstance(volumes, list):
        raise RuntimeError("pod.spec.volumes must be a list")
    matches = [
        require_mapping(volume, "pod volume")
        for volume in volumes
        if isinstance(volume, Mapping) and volume.get("name") == volume_name
    ]
    if len(matches) != 1:
        raise RuntimeError(f"pod must have exactly one {volume_name} volume")
    claim = require_mapping(matches[0].get("persistentVolumeClaim"), "pod volume claim")
    return require_name(claim.get("claimName"), "pod volume claimName")


def live_volume_from_documents(
    pod: Mapping[str, Any],
    pvc: Mapping[str, Any],
    pv: Mapping[str, Any],
    *,
    volume_name: str,
) -> LiveVolume:
    pvc_name = claim_name_from_pod(pod, volume_name=volume_name)
    pvc_spec = require_mapping(pvc.get("spec"), "pvc.spec")
    pv_name = require_name(pvc_spec.get("volumeName"), "pvc.spec.volumeName")
    pv_spec = require_mapping(pv.get("spec"), "pv.spec")
    csi = require_mapping(pv_spec.get("csi"), "pv.spec.csi")
    if csi.get("driver") != "ebs.csi.aws.com":
        raise RuntimeError("backup source volume must use the EBS CSI driver")
    volume_id = csi.get("volumeHandle")
    if not isinstance(volume_id, str) or not VOLUME_ID.fullmatch(volume_id):
        raise RuntimeError("backup source EBS volume handle is invalid")
    return LiveVolume(pvc_name=pvc_name, pv_name=pv_name, volume_id=volume_id)


def snapshot_tags(value: Any) -> dict[str, str]:
    if not isinstance(value, list):
        raise RuntimeError("snapshot Tags must be a list")
    tags: dict[str, str] = {}
    for raw_tag in value:
        tag = require_mapping(raw_tag, "snapshot tag")
        key = tag.get("Key")
        item = tag.get("Value")
        if not isinstance(key, str) or not isinstance(item, str) or key in tags:
            raise RuntimeError("snapshot tags must contain unique string keys and values")
        tags[key] = item
    return tags


def verify_snapshot_document(
    document: Mapping[str, Any],
    *,
    snapshot_id: str,
    live_volume: LiveVolume,
    source_sha: str,
    now: datetime,
    max_age: timedelta,
) -> BackupEvidence:
    if not SNAPSHOT_ID.fullmatch(snapshot_id):
        raise ValueError("snapshot_id must be a full EBS snapshot ID")
    if not GIT_SHA.fullmatch(source_sha):
        raise ValueError("source_sha must be a full lowercase Git SHA")
    snapshots = document.get("Snapshots")
    if not isinstance(snapshots, list) or len(snapshots) != 1:
        raise RuntimeError("AWS must return exactly one owned snapshot")
    snapshot = require_mapping(snapshots[0], "snapshot")
    if snapshot.get("SnapshotId") != snapshot_id:
        raise RuntimeError("snapshot ID does not match the requested backup")
    if snapshot.get("State") != "completed":
        raise RuntimeError("snapshot is not completed")
    if snapshot.get("Encrypted") is not True:
        raise RuntimeError("snapshot must be encrypted")
    if snapshot.get("VolumeId") != live_volume.volume_id:
        raise RuntimeError("snapshot does not belong to the live source volume")

    raw_started_at = snapshot.get("StartTime")
    if not isinstance(raw_started_at, str):
        raise RuntimeError("snapshot StartTime must be an ISO-8601 timestamp")
    try:
        started_at = datetime.fromisoformat(raw_started_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeError("snapshot StartTime must be an ISO-8601 timestamp") from exc
    if started_at.tzinfo is None or now.tzinfo is None:
        raise RuntimeError("snapshot and verifier timestamps must include timezones")
    if max_age <= timedelta(0):
        raise ValueError("max_age must be positive")
    if started_at > now + timedelta(minutes=5):
        raise RuntimeError("snapshot StartTime is in the future")
    if started_at < now - max_age:
        raise RuntimeError("snapshot is older than the allowed deployment window")

    tags = snapshot_tags(snapshot.get("Tags"))
    expected_tags = {
        **REQUIRED_TAGS,
        "opsia:source-sha": source_sha,
        "opsia:source-pvc": live_volume.pvc_name,
    }
    for key, expected in expected_tags.items():
        if tags.get(key) != expected:
            raise RuntimeError(f"snapshot tag proof is missing or mismatched: {key}")
    return BackupEvidence(
        snapshot_id=snapshot_id, volume_id=live_volume.volume_id, source_sha=source_sha
    )


def run_json(command: Sequence[str]) -> Mapping[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    try:
        return require_mapping(json.loads(result.stdout), "command output")
    except json.JSONDecodeError as exc:
        raise RuntimeError("command returned invalid JSON") from exc


def resolve_live_volume(*, context: str, namespace: str, pvc_name: str) -> LiveVolume:
    context_result = subprocess.run(
        ("kubectl", "config", "get-contexts", context, "-o", "name"),
        check=True,
        capture_output=True,
        text=True,
    )
    if context_result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")
    pvc_name = require_name(pvc_name, "pvc_name")
    pvc = run_json(
        ("kubectl", "--context", context, "-n", namespace, "get", "pvc", pvc_name, "-o", "json")
    )
    pvc_spec = require_mapping(pvc.get("spec"), "pvc.spec")
    pv_name = require_name(pvc_spec.get("volumeName"), "pvc.spec.volumeName")
    pv = run_json(("kubectl", "--context", context, "get", "pv", pv_name, "-o", "json"))
    pv_spec = require_mapping(pv.get("spec"), "pv.spec")
    csi = require_mapping(pv_spec.get("csi"), "pv.spec.csi")
    if csi.get("driver") != "ebs.csi.aws.com":
        raise RuntimeError("backup source volume must use the EBS CSI driver")
    volume_id = csi.get("volumeHandle")
    if not isinstance(volume_id, str) or not VOLUME_ID.fullmatch(volume_id):
        raise RuntimeError("backup source EBS volume handle is invalid")
    return LiveVolume(pvc_name=pvc_name, pv_name=pv_name, volume_id=volume_id)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify first-deploy EBS backup evidence")
    parser.add_argument("--context", required=True)
    parser.add_argument("--namespace", default="management")
    parser.add_argument("--region", required=True)
    parser.add_argument("--pvc-name", required=True)
    parser.add_argument("--snapshot-id", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--max-age-hours", type=int, default=24)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.context or any(character.isspace() for character in args.context):
        raise ValueError("context must be a non-empty name without whitespace")
    namespace = require_name(args.namespace, "namespace")
    if not REGION.fullmatch(args.region):
        raise ValueError("region must be an AWS region name")
    if not 1 <= args.max_age_hours <= 168:
        raise ValueError("max_age_hours must be between 1 and 168")
    live_volume = resolve_live_volume(
        context=args.context, namespace=namespace, pvc_name=args.pvc_name
    )
    snapshot = run_json(
        (
            "aws",
            "ec2",
            "describe-snapshots",
            "--snapshot-ids",
            args.snapshot_id,
            "--owner-ids",
            "self",
            "--region",
            args.region,
            "--output",
            "json",
        )
    )
    evidence = verify_snapshot_document(
        snapshot,
        snapshot_id=args.snapshot_id,
        live_volume=live_volume,
        source_sha=args.source_sha,
        now=datetime.now(UTC),
        max_age=timedelta(hours=args.max_age_hours),
    )
    print(
        "first-deploy backup verified: "
        f"snapshot={evidence.snapshot_id} volume={evidence.volume_id} source_sha={evidence.source_sha}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
