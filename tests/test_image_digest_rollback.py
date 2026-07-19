from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import threading
from pathlib import Path
from types import ModuleType

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "revert_image_digests", ROOT / "scripts/revert_image_digests.py"
)
assert SPEC is not None and SPEC.loader is not None
revert_image_digests = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = revert_image_digests
SPEC.loader.exec_module(revert_image_digests)
assert isinstance(revert_image_digests, ModuleType)

CAPTURE_SPEC = importlib.util.spec_from_file_location(
    "capture_image_digests", ROOT / "scripts/capture_image_digests.py"
)
assert CAPTURE_SPEC is not None and CAPTURE_SPEC.loader is not None
capture_image_digests = importlib.util.module_from_spec(CAPTURE_SPEC)
sys.modules[CAPTURE_SPEC.name] = capture_image_digests
CAPTURE_SPEC.loader.exec_module(capture_image_digests)
assert isinstance(capture_image_digests, ModuleType)

ROLLOUT_SPEC = importlib.util.spec_from_file_location(
    "rollout_image_digest", ROOT / "scripts/rollout_image_digest.py"
)
assert ROLLOUT_SPEC is not None and ROLLOUT_SPEC.loader is not None
rollout_image_digest = importlib.util.module_from_spec(ROLLOUT_SPEC)
sys.modules[ROLLOUT_SPEC.name] = rollout_image_digest
ROLLOUT_SPEC.loader.exec_module(rollout_image_digest)
assert isinstance(rollout_image_digest, ModuleType)

DIGEST = "registry.example/opsia/service@sha256:" + "a" * 64
SHA = "b" * 40


def write_plan(tmp_path: Path, *, image: str = DIGEST) -> Path:
    path = tmp_path / "rollback.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "previous_release_sha": SHA,
                "targets": [
                    {
                        "namespace": "management",
                        "resource": "deployment/api-gateway",
                        "container": "api-gateway",
                        "image": image,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def write_two_target_plan(tmp_path: Path) -> Path:
    path = write_plan(tmp_path)
    document = json.loads(path.read_text())
    document["targets"].append(
        {
            "namespace": "management",
            "resource": "deployment/audit-worker",
            "container": "audit-worker",
            "image": DIGEST,
        }
    )
    path.write_text(json.dumps(document))
    return path


def write_grouped_target_plan(tmp_path: Path) -> Path:
    path = write_two_target_plan(tmp_path)
    document = json.loads(path.read_text())
    document["targets"].insert(
        1,
        {
            "namespace": "management",
            "resource": "deployment/api-gateway",
            "container": "sidecar",
            "image": DIGEST,
        },
    )
    path.write_text(json.dumps(document))
    return path


def write_bootstrap_plan(tmp_path: Path) -> Path:
    path = write_plan(tmp_path)
    document = json.loads(path.read_text())
    document["version"] = 2
    document["bootstrap_targets"] = [
        {
            "namespace": "management",
            "resource": "deployment/audit-worker",
            "container": "audit-worker",
            "state": "not_present_before_rollout",
        }
    ]
    path.write_text(json.dumps(document))
    return path


def exact_live_document(*, api_image: str = DIGEST, audit_image: str = DIGEST) -> str:
    return json.dumps(
        {
            "items": [
                {
                    "metadata": {"name": "api-gateway"},
                    "spec": {
                        "template": {
                            "spec": {
                                "containers": [
                                    {"name": "api-gateway", "image": api_image},
                                    {"name": "sidecar", "image": api_image},
                                ]
                            }
                        }
                    },
                },
                {
                    "metadata": {"name": "audit-worker"},
                    "spec": {
                        "template": {
                            "spec": {"containers": [{"name": "audit-worker", "image": audit_image}]}
                        }
                    },
                },
            ]
        }
    )


def test_rollback_plan_requires_immutable_digest(tmp_path: Path) -> None:
    path = write_plan(tmp_path, image="registry.example/opsia/service:latest")

    with pytest.raises(ValueError, match="immutable sha256 digest"):
        revert_image_digests.load_plan(path)


def test_rollback_plan_rejects_command_injection_fields(tmp_path: Path) -> None:
    path = write_plan(tmp_path)
    document = json.loads(path.read_text())
    document["targets"][0]["resource"] = "deployment/api-gateway;rm"
    path.write_text(json.dumps(document))

    with pytest.raises(ValueError, match="deployment/<name>"):
        revert_image_digests.load_plan(path)


def test_apply_uses_explicit_context_digest_and_rollout_status(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        if command[1:3] == ("config", "get-contexts"):
            stdout = "opsia-dev\n"
        elif command[-4:] == ("get", "deployments", "-o", "json"):
            stdout = exact_live_document()
        else:
            stdout = ""
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert calls == [
        ("kubectl", "config", "get-contexts", "opsia-dev", "-o", "name"),
        (
            "kubectl",
            "--context",
            "opsia-dev",
            "-n",
            "management",
            "set",
            "image",
            "deployment/api-gateway",
            f"api-gateway={DIGEST}",
        ),
        (
            "kubectl",
            "--context",
            "opsia-dev",
            "-n",
            "management",
            "rollout",
            "status",
            "deployment/api-gateway",
            "--timeout=300s",
        ),
        (
            "kubectl",
            "--context",
            "opsia-dev",
            "-n",
            "management",
            "get",
            "deployments",
            "-o",
            "json",
        ),
    ]
    assert all("undo" not in command for call in calls for command in call)
    assert all("alembic" not in command for call in calls for command in call)


def test_rollback_restores_existing_digest_and_removes_bootstrapped_deployment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_bootstrap_plan(tmp_path))
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        if command[-4:] == ("get", "deployments", "-o", "json"):
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps(
                    {
                        "items": [
                            {
                                "metadata": {"name": "api-gateway"},
                                "spec": {
                                    "template": {
                                        "spec": {
                                            "containers": [{"name": "api-gateway", "image": DIGEST}]
                                        }
                                    }
                                },
                            }
                        ]
                    }
                ),
            )
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert (
        "kubectl",
        "--context",
        "opsia-dev",
        "-n",
        "management",
        "delete",
        "deployment/audit-worker",
        "--ignore-not-found",
        "--wait=true",
    ) in calls


def test_apply_fails_closed_when_explicit_context_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    calls = 0

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        nonlocal calls
        calls += 1
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="context was not found"):
        revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert calls == 1


def test_rollback_groups_containers_and_sets_every_image_before_waiting(tmp_path: Path) -> None:
    plan = revert_image_digests.load_plan(write_grouped_target_plan(tmp_path))

    commands = revert_image_digests.kubectl_commands(
        plan,
        context="opsia-dev",
        timeout="300s",
    )

    assert [command[5:7] for command in commands[1:3]] == [
        ("set", "image"),
        ("set", "image"),
    ]
    assert commands[1][-2:] == (
        f"api-gateway={DIGEST}",
        f"sidecar={DIGEST}",
    )
    assert [command[5:7] for command in commands[3:]] == [
        ("rollout", "status"),
        ("rollout", "status"),
    ]
    assert [command[-2] for command in commands[3:]] == [
        "deployment/api-gateway",
        "deployment/audit-worker",
    ]


def test_apply_batches_mutations_parallel_waits_and_verifies_exact_digests(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    status_barrier = threading.Barrier(2)
    events: list[str] = []

    def fake_run(
        command: tuple[str, ...],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        if command[-4:] == ("get", "deployments", "-o", "json"):
            events.append("verify")
            return subprocess.CompletedProcess(command, 0, stdout=exact_live_document())
        if command[5:7] == ("set", "image"):
            events.append(f"set:{command[7]}")
            return subprocess.CompletedProcess(command, 0)
        if command[5:7] == ("rollout", "status"):
            assert events[:2] == [
                "set:deployment/api-gateway",
                "set:deployment/audit-worker",
            ]
            assert isinstance(kwargs.get("timeout"), float)
            events.append(f"wait:{command[-2]}")
            status_barrier.wait(timeout=2)
            return subprocess.CompletedProcess(command, 0)
        raise AssertionError(command)

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert set(events[2:4]) == {
        "wait:deployment/api-gateway",
        "wait:deployment/audit-worker",
    }
    assert events[4:] == ["verify"]


def test_parallel_wait_uses_one_deadline_for_queued_unavailable_targets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_grouped_target_plan(tmp_path))
    commands = revert_image_digests.kubectl_commands(
        plan,
        context="opsia-dev",
        timeout="1s",
    )[3:]
    now = [0.0]
    calls: list[tuple[str, ...]] = []

    def fake_monotonic() -> float:
        return now[0]

    def fake_run(
        command: tuple[str, ...],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        assert kwargs["timeout"] == 1.0
        now[0] = 1.1
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(revert_image_digests.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="audit-worker"):
        revert_image_digests.wait_for_rollout_statuses(
            commands,
            timeout="1s",
            max_workers=1,
        )

    assert len(calls) == 1


def test_apply_attempts_all_mutations_and_fails_on_final_digest_mismatch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    set_resources: list[str] = []

    def fake_run(
        command: tuple[str, ...],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        if command[-4:] == ("get", "deployments", "-o", "json"):
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=exact_live_document(api_image=next_digest),
            )
        if command[5:7] == ("set", "image"):
            set_resources.append(command[7])
            if command[7] == "deployment/api-gateway":
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0)
        if command[5:7] == ("rollout", "status"):
            return subprocess.CompletedProcess(command, 0)
        raise AssertionError(command)

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="digest mismatch"):
        revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert set_resources == [
        "deployment/api-gateway",
        "deployment/audit-worker",
    ]


def deployment_manifest(tmp_path: Path) -> Path:
    path = tmp_path / "services.yaml"
    path.write_text(
        """apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  template:
    spec:
      containers:
        - name: api-gateway
          image: service:latest
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: audit-worker
spec:
  template:
    spec:
      containers:
        - name: audit-worker
          image: service:latest
""",
        encoding="utf-8",
    )
    return path


def live_deployments(*, second_image: str = DIGEST) -> dict[str, object]:
    return {
        "items": [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "template": {"spec": {"containers": [{"name": "api-gateway", "image": DIGEST}]}}
                },
            },
            {
                "metadata": {"name": "audit-worker"},
                "spec": {
                    "template": {
                        "spec": {"containers": [{"name": "audit-worker", "image": second_image}]}
                    }
                },
            },
        ]
    }


def test_capture_builds_complete_plan_from_manifest_and_live_digests(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=live_deployments(),
        namespace="management",
        previous_release_sha=SHA,
    )

    assert [(target.resource, target.container, target.image) for target in plan.targets] == [
        ("deployment/api-gateway", "api-gateway", DIGEST),
        ("deployment/audit-worker", "audit-worker", DIGEST),
    ]
    assert [state.resource for state in plan.deployment_states] == [
        "deployment/api-gateway",
        "deployment/audit-worker",
    ]
    assert plan.deployment_states[0].template["spec"]["containers"][0]["image"] == DIGEST


def test_capture_rejects_tagged_or_missing_live_targets(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    with pytest.raises(ValueError, match="not digest-pinned"):
        capture_image_digests.build_plan(
            expected=expected,
            live_document=live_deployments(second_image="service:latest"),
            namespace="management",
            previous_release_sha=SHA,
        )


def test_capture_records_whole_missing_deployment_as_bootstrap_evidence(
    tmp_path: Path,
) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document={"items": live_deployments()["items"][:1]},
        namespace="management",
        previous_release_sha=SHA,
    )

    assert [(target.resource, target.container) for target in plan.targets] == [
        ("deployment/api-gateway", "api-gateway")
    ]
    assert [
        (target.resource, target.container, target.state) for target in plan.bootstrap_targets
    ] == [("deployment/audit-worker", "audit-worker", "not_present_before_rollout")]


def test_capture_rejects_missing_container_on_existing_deployment_as_manifest_typo(
    tmp_path: Path,
) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))
    live = live_deployments()
    items = live["items"]
    assert isinstance(items, list)
    audit = items[1]
    assert isinstance(audit, dict)
    audit["spec"]["template"]["spec"]["containers"] = [
        {"name": "misspelled-worker", "image": DIGEST}
    ]

    with pytest.raises(ValueError, match="existing live deployment container is missing"):
        capture_image_digests.build_plan(
            expected=expected,
            live_document=live,
            namespace="management",
            previous_release_sha=SHA,
        )


def test_capture_accepts_only_explicit_same_repository_tag_attestation(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))
    tagged = live_deployments(second_image="registry.example/opsia/service:release")

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=tagged,
        namespace="management",
        previous_release_sha=SHA,
        verified_live_images={"registry.example/opsia/service:release": DIGEST},
    )

    assert plan.targets[1].image == DIGEST
    with pytest.raises(ValueError, match="same repository"):
        capture_image_digests.parse_verified_live_images(
            ["registry.example/other/service:release=" + DIGEST]
        )


def test_capture_protects_same_repository_target_outside_manifest_scope(
    tmp_path: Path,
) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))
    live = live_deployments()
    items = live["items"]
    assert isinstance(items, list)
    items.append(
        {
            "metadata": {"name": "cluster-agent"},
            "spec": {
                "template": {"spec": {"containers": [{"name": "cluster-agent", "image": DIGEST}]}}
            },
        }
    )

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
        managed_repository="registry.example/opsia/service",
    )

    assert [
        (target.resource, target.container, target.image, target.state)
        for target in plan.protected_targets
    ] == [
        (
            "deployment/cluster-agent",
            "cluster-agent",
            DIGEST,
            "outside_manifest_scope_before_rollout",
        )
    ]


def test_capture_rejects_duplicate_or_mutable_live_image_attestations() -> None:
    mapping = f"registry.example/opsia/service:release={DIGEST}"

    with pytest.raises(ValueError, match="duplicate"):
        capture_image_digests.parse_verified_live_images([mapping, mapping])
    with pytest.raises(ValueError, match="immutable sha256 digest"):
        capture_image_digests.parse_verified_live_images(
            ["registry.example/opsia/service:release=registry.example/opsia/service:other"]
        )


def test_capture_checks_context_and_writes_private_plan(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest = deployment_manifest(tmp_path)
    output = tmp_path / "rollback.json"
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        stdout = (
            "opsia-dev\n"
            if command[1:3] == ("config", "get-contexts")
            else json.dumps(live_deployments())
        )
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(capture_image_digests.subprocess, "run", fake_run)

    capture_image_digests.capture(
        context="opsia-dev",
        namespace="management",
        manifest=manifest,
        managed_image="service:latest",
        previous_release_sha=SHA,
        output=output,
    )

    assert calls[0] == ("kubectl", "config", "get-contexts", "opsia-dev", "-o", "name")
    assert calls[1][1:5] == ("--context", "opsia-dev", "-n", "management")
    assert output.stat().st_mode & 0o777 == 0o600
    document = json.loads(output.read_text(encoding="utf-8"))
    assert document["version"] == 4
    plan = revert_image_digests.load_plan(output)
    assert plan.previous_release_sha == SHA
    assert len(plan.deployment_states) == 2


def test_rollout_reconciles_command_janitor_retention_env_and_preserves_refs() -> None:
    repository = "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service"
    current = f"{repository}@sha256:" + "a" * 64
    desired = f"{repository}@sha256:" + "c" * 64
    live = {
        "items": [
            {
                "metadata": {"name": "command-janitor"},
                "spec": {
                    "strategy": {"type": "Recreate"},
                    "template": {
                        "metadata": {"labels": {"app": "command-janitor"}},
                        "spec": {
                            "containers": [
                                {
                                    "name": "worker",
                                    "image": current,
                                    "envFrom": [
                                        {"configMapRef": {"name": "management-runtime-config"}},
                                        {"secretRef": {"name": "management-runtime-secret"}},
                                    ],
                                }
                            ]
                        },
                    },
                },
            }
        ]
    }
    plan = capture_image_digests.build_plan(
        expected=(("command-janitor", "worker"),),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )

    patches = rollout_image_digest.existing_deployment_spec_patches(
        plan,
        manifest=ROOT / "deploy/management/services.yaml",
        image=desired,
    )

    assert len(patches) == 1
    namespace, resource, patch = patches[0]
    assert (namespace, resource) == ("management", "deployment/command-janitor")
    template = next(
        operation["value"] for operation in patch if operation["path"] == "/spec/template"
    )
    container = template["spec"]["containers"][0]
    assert container["image"] == desired
    assert container["envFrom"] == [
        {"configMapRef": {"name": "management-runtime-config"}},
        {"secretRef": {"name": "management-runtime-secret"}},
    ]
    assert {item["name"]: item["value"] for item in container["env"]} == {
        "APP_ENV": "demo",
        "DEMO_DATA_RETENTION_ENABLED": "true",
        "DEMO_DATA_RETENTION_HOURS": "24",
        "DEMO_DATA_RETENTION_DELETE_LIMIT": "500",
        "DEMO_DATA_RETENTION_SCOPES": (
            "observations,events,incidents,rca,evidence,timeline,commands,projections"
        ),
        "DB_RETENTION_SWEEP_INTERVAL_SECONDS": "300",
    }


def test_existing_spec_patch_reconciles_service_account_volumes_and_env(
    tmp_path: Path,
) -> None:
    manifest = tmp_path / "services.yaml"
    manifest.write_text(
        """apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: management
spec:
  strategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      serviceAccountName: api-gateway
      volumes:
        - name: runtime
          configMap:
            name: management-runtime-config
      containers:
        - name: api-gateway
          image: registry.example/opsia/service:source
          env:
            - name: APP_ENV
              value: demo
          volumeMounts:
            - name: runtime
              mountPath: /runtime
""",
        encoding="utf-8",
    )
    live = {
        "items": [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "strategy": {"type": "RollingUpdate"},
                    "template": {
                        "metadata": {"labels": {"app": "api-gateway"}},
                        "spec": {"containers": [{"name": "api-gateway", "image": DIGEST}]},
                    },
                },
            }
        ]
    }
    plan = capture_image_digests.build_plan(
        expected=(("api-gateway", "api-gateway"),),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )
    desired = "registry.example/opsia/service@sha256:" + "c" * 64
    _, _, patch = rollout_image_digest.existing_deployment_spec_patches(
        plan,
        manifest=manifest,
        image=desired,
    )[0]
    template = next(
        operation["value"] for operation in patch if operation["path"] == "/spec/template"
    )

    assert template["spec"]["serviceAccountName"] == "api-gateway"
    assert template["spec"]["volumes"] == [
        {"name": "runtime", "configMap": {"name": "management-runtime-config"}}
    ]
    assert template["spec"]["containers"][0]["env"] == [{"name": "APP_ENV", "value": "demo"}]
    assert template["spec"]["containers"][0]["volumeMounts"] == [
        {"name": "runtime", "mountPath": "/runtime"}
    ]


def test_spec_diff_evidence_captures_v4_before_and_desired_specs_without_secret_values(
    tmp_path: Path,
) -> None:
    manifest = tmp_path / "services.yaml"
    manifest.write_text(
        """apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: management
spec:
  strategy:
    type: Recreate
  template:
    metadata:
      annotations:
        opsia.io/source-sha: "${SOURCE_SHA}"
        internal.opsia.io/debug-payload: desired-debug-secret
        vault.hashicorp.com/agent-inject-template-config: desired-vault-template-secret
    spec:
      containers:
        - name: api-gateway
          image: service:latest
          args: ["--webhook=https://desired-user:desired-pass@example.test"]
          env:
            - name: DATABASE_PASSWORD
              value: desired-secret-value
            - name: TOKEN_REF
              valueFrom:
                secretKeyRef:
                  name: management-runtime-secret
                  key: token
                  optional: false
                  value: impossible-secret-value
            - name: DATABASE_URL
              value: postgresql://desired-user:desired-pass@database
""",
        encoding="utf-8",
    )
    live = {
        "items": [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "strategy": {"type": "RollingUpdate"},
                    "template": {
                        "metadata": {
                            "annotations": {
                                "opsia.io/source-sha": SHA,
                                "internal.opsia.io/debug-payload": "live-debug-secret",
                                "vault.hashicorp.com/agent-inject-template-config": (
                                    "live-vault-template-secret"
                                ),
                            }
                        },
                        "spec": {
                            "containers": [
                                {
                                    "name": "api-gateway",
                                    "image": DIGEST,
                                    "args": ["--webhook=https://live-user:live-pass@example.test"],
                                    "env": [
                                        {
                                            "name": "DATABASE_PASSWORD",
                                            "value": "live-secret-value",
                                        },
                                        {
                                            "name": "DATABASE_URL",
                                            "value": "postgresql://live-user:live-pass@database",
                                        },
                                        {
                                            "name": "TOKEN_REF",
                                            "valueFrom": {
                                                "secretKeyRef": {
                                                    "name": "management-runtime-secret",
                                                    "key": "token",
                                                    "optional": False,
                                                    "value": "impossible-live-secret-value",
                                                }
                                            },
                                        },
                                    ],
                                }
                            ]
                        },
                    },
                },
            }
        ]
    }
    plan = capture_image_digests.build_plan(
        expected=(("api-gateway", "api-gateway"),),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )
    desired = "registry.example/opsia/service@sha256:" + "c" * 64
    patches = rollout_image_digest.existing_deployment_spec_patches(
        plan,
        manifest=manifest,
        image=desired,
    )
    output = tmp_path / "spec-diff.json"

    rollout_image_digest.write_spec_diff_evidence(
        plan,
        patches=patches,
        live_document=live,
        output=output,
    )

    assert output.stat().st_mode & 0o777 == 0o600
    source = output.read_text(encoding="utf-8")
    assert "live-secret-value" not in source
    assert "desired-secret-value" not in source
    assert "impossible-secret-value" not in source
    assert "impossible-live-secret-value" not in source
    assert "desired-user" not in source
    assert "live-user" not in source
    assert "desired-debug-secret" not in source
    assert "live-debug-secret" not in source
    assert "desired-vault-template-secret" not in source
    assert "live-vault-template-secret" not in source
    document = json.loads(source)
    deployment = document["deployments"][0]
    assert document["capture"] == ("fresh-live-before-mutation-verified-against-rollback-plan-v4")
    assert deployment["changed_paths"] == ["/spec/strategy", "/spec/template"]
    assert deployment["before"]["strategy"] == {"type": "RollingUpdate"}
    assert deployment["desired"]["strategy"] == {"type": "Recreate"}
    before_annotations = deployment["before"]["template"]["metadata"]["annotations"]
    desired_annotations = deployment["desired"]["template"]["metadata"]["annotations"]
    assert before_annotations == {
        "internal.opsia.io/debug-payload": "<redacted>",
        "opsia.io/source-sha": SHA,
        "vault.hashicorp.com/agent-inject-template-config": "<redacted>",
    }
    assert desired_annotations == {
        "internal.opsia.io/debug-payload": "<redacted>",
        "opsia.io/source-sha": "${SOURCE_SHA}",
        "vault.hashicorp.com/agent-inject-template-config": "<redacted>",
    }
    before_env = deployment["before"]["template"]["spec"]["containers"][0]["env"]
    desired_env = deployment["desired"]["template"]["spec"]["containers"][0]["env"]
    before_env_by_name = {entry["name"]: entry for entry in before_env}
    desired_env_by_name = {entry["name"]: entry for entry in desired_env}
    assert deployment["before"]["template"]["spec"]["containers"][0]["args"] == ["<redacted>"]
    assert deployment["desired"]["template"]["spec"]["containers"][0]["args"] == ["<redacted>"]
    assert before_env_by_name["DATABASE_PASSWORD"]["value"] == "<redacted>"
    assert desired_env_by_name["DATABASE_PASSWORD"]["value"] == "<redacted>"
    assert before_env_by_name["TOKEN_REF"]["valueFrom"]["secretKeyRef"] == {
        "key": "token",
        "name": "management-runtime-secret",
        "optional": False,
    }
    assert desired_env_by_name["TOKEN_REF"]["valueFrom"]["secretKeyRef"] == {
        "key": "token",
        "name": "management-runtime-secret",
        "optional": False,
    }
    assert before_env_by_name["DATABASE_URL"]["value"] == "<redacted>"
    assert desired_env_by_name["DATABASE_URL"]["value"] == "<redacted>"


def test_spec_diff_fails_closed_when_live_spec_drifted_after_v4_capture(tmp_path: Path) -> None:
    manifest = deployment_manifest(tmp_path)
    live = live_deployments()
    plan = capture_image_digests.build_plan(
        expected=capture_image_digests.expected_deployment_containers(manifest),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )
    desired = "registry.example/opsia/service@sha256:" + "c" * 64
    patches = rollout_image_digest.existing_deployment_spec_patches(
        plan,
        manifest=manifest,
        image=desired,
    )
    drifted = copy.deepcopy(live)
    drifted["items"][0]["spec"]["template"]["spec"]["containers"][0]["env"] = [
        {"name": "UNPLANNED", "value": "drift"}
    ]

    with pytest.raises(RuntimeError, match="drifted after rollback capture"):
        rollout_image_digest.spec_diff_document(
            plan,
            patches=patches,
            live_document=drifted,
        )


def test_rollout_reconciles_existing_spec_without_redundant_digest_set(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = deployment_manifest(tmp_path)
    live = live_deployments()
    plan = capture_image_digests.build_plan(
        expected=(
            ("api-gateway", "api-gateway"),
            ("audit-worker", "audit-worker"),
        ),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )
    desired = "registry.example/opsia/service@sha256:" + "c" * 64
    evidence = tmp_path / "spec-diff.json"
    events: list[str] = []
    live_calls = 0

    def fake_live_deployments(
        *, context: str, namespace: str, deadline: float | None = None
    ) -> dict[str, object]:
        assert deadline is not None
        nonlocal live_calls
        assert (context, namespace) == ("opsia-dev", "management")
        live_calls += 1
        events.append(f"live-{live_calls}")
        image = DIGEST if live_calls == 1 else desired
        document = live_deployments(second_image=image)
        document["items"][0]["spec"]["template"]["spec"]["containers"][0]["image"] = image
        return document

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        if command[5] == "patch":
            assert evidence.exists()
            events.append(f"patch:{command[6]}")
            payload = kwargs.get("input")
            assert isinstance(payload, str)
            assert desired in payload
        else:
            events.append(f"{command[5]}:{command[-2]}")
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(rollout_image_digest, "live_deployments", fake_live_deployments)
    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fake_run)
    monkeypatch.setattr(rollout_image_digest, "MAX_SPEC_PATCH_WORKERS", 1)

    rollout_image_digest.rollout(
        plan,
        context="opsia-dev",
        image=desired,
        timeout="300s",
        manifest=manifest,
        reconcile_existing_specs=True,
        spec_diff_out=evidence,
    )

    assert events == [
        "live-1",
        "patch:deployment/api-gateway",
        "rollout:deployment/api-gateway",
        "patch:deployment/audit-worker",
        "rollout:deployment/audit-worker",
        "live-2",
    ]


def test_existing_spec_reconciliation_attempts_patches_in_parallel_and_reports_deterministically(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manifest = deployment_manifest(tmp_path)
    manifest.write_text(
        manifest.read_text(encoding="utf-8")
        + """---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: timeline-worker
spec:
  template:
    spec:
      containers:
        - name: timeline-worker
          image: service:latest
""",
        encoding="utf-8",
    )
    live = live_deployments()
    items = live["items"]
    assert isinstance(items, list)
    items.append(
        {
            "metadata": {"name": "timeline-worker"},
            "spec": {
                "template": {"spec": {"containers": [{"name": "timeline-worker", "image": DIGEST}]}}
            },
        }
    )
    plan = capture_image_digests.build_plan(
        expected=(
            ("api-gateway", "api-gateway"),
            ("audit-worker", "audit-worker"),
            ("timeline-worker", "timeline-worker"),
        ),
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )
    desired = "registry.example/opsia/service@sha256:" + "c" * 64
    barrier = threading.Barrier(2)
    attempted: list[str] = []

    def fail_together(
        command: tuple[str, ...],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        resource = command[6]
        attempted.append(resource)
        barrier.wait(timeout=2)
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fail_together)

    with pytest.raises(RuntimeError) as captured:
        rollout_image_digest.apply_existing_deployment_specs(
            plan,
            context="opsia-dev",
            manifest=manifest,
            image=desired,
            max_workers=2,
        )

    assert set(attempted) == {"deployment/api-gateway", "deployment/audit-worker"}
    assert str(captured.value) == (
        "deployment spec reconciliation failed for "
        "['management/deployment/api-gateway', 'management/deployment/audit-worker']"
    )
    assert isinstance(captured.value.__cause__, subprocess.CalledProcessError)
    assert captured.value.__cause__.cmd[6] == "deployment/api-gateway"
    assert [
        state.template["spec"]["containers"][0]["image"] for state in plan.deployment_states
    ] == [DIGEST, DIGEST, DIGEST]


def test_rollback_restores_captured_deployment_template_before_digest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = capture_image_digests.build_plan(
        expected=(("api-gateway", "api-gateway"),),
        live_document={"items": [live_deployments()["items"][0]]},
        namespace="management",
        previous_release_sha=SHA,
    )
    calls: list[tuple[tuple[str, ...], object]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append((tuple(command), kwargs.get("input")))
        if command[1:3] == ("config", "get-contexts"):
            stdout = "opsia-dev\n"
        elif command[-4:] == ("get", "deployments", "-o", "json"):
            stdout = exact_live_document()
        else:
            stdout = ""
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    commands = [command for command, _payload in calls]
    patch_index = next(index for index, command in enumerate(commands) if "patch" in command)
    assert "--patch-file=/dev/stdin" in commands[patch_index]
    image_index = next(
        index for index, command in enumerate(commands) if command[5:7] == ("set", "image")
    )
    assert patch_index < image_index
    payload = calls[patch_index][1]
    assert isinstance(payload, str)
    operations = json.loads(payload)
    assert {operation["path"] for operation in operations} == {
        "/spec/strategy",
        "/spec/template",
    }


def test_restore_deployment_states_attempts_every_workload_after_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    states = (
        revert_image_digests.DeploymentRollbackState(
            namespace="management",
            resource="deployment/api-gateway",
            strategy={"type": "RollingUpdate"},
            template={"spec": {"containers": []}},
        ),
        revert_image_digests.DeploymentRollbackState(
            namespace="management",
            resource="deployment/audit-worker",
            strategy={"type": "RollingUpdate"},
            template={"spec": {"containers": []}},
        ),
    )
    plan = revert_image_digests.RollbackPlan(
        previous_release_sha=SHA,
        targets=(),
        deployment_states=states,
    )
    attempted: list[str] = []

    def fake_run(command: tuple[str, ...], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        assert "--patch-file=/dev/stdin" in command
        attempted.append(command[6])
        if command[6] == "deployment/api-gateway":
            raise subprocess.CalledProcessError(1, command)
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="deployment/api-gateway"):
        revert_image_digests.restore_deployment_states(plan, context="opsia-dev")

    assert attempted == ["deployment/api-gateway", "deployment/audit-worker"]


def test_capture_filters_out_unmanaged_deployment_images(tmp_path: Path) -> None:
    manifest = deployment_manifest(tmp_path)
    with manifest.open("a", encoding="utf-8") as handle:
        handle.write(
            """---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: console
spec:
  template:
    spec:
      containers:
        - name: console
          image: console:latest
"""
        )

    assert capture_image_digests.expected_deployment_containers(
        manifest, managed_image="service:latest"
    ) == (("api-gateway", "api-gateway"), ("audit-worker", "audit-worker"))


def test_capture_selects_every_live_container_by_exact_repository() -> None:
    live = live_deployments()
    items = live["items"]
    assert isinstance(items, list)
    items.append(
        {
            "metadata": {"name": "agent-api-proxy"},
            "spec": {
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "proxy",
                                "image": "nginxinc/nginx-unprivileged:1.29-alpine",
                            }
                        ]
                    }
                }
            },
        }
    )

    assert capture_image_digests.expected_repository_containers(
        live,
        managed_repository="registry.example/opsia/service",
    ) == (("api-gateway", "api-gateway"), ("audit-worker", "audit-worker"))


def test_manifest_targets_include_live_legacy_repository_for_safe_rollout(tmp_path: Path) -> None:
    manifest = deployment_manifest(tmp_path)
    legacy_digest = "registry.example/legacy/service@sha256:" + "d" * 64
    live = json.loads(exact_live_document(api_image=legacy_digest))
    expected = capture_image_digests.expected_deployment_containers(
        manifest,
        managed_repository="service",
    )
    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=live,
        namespace="management",
        previous_release_sha=SHA,
    )

    assert [target.resource for target in plan.targets] == [
        "deployment/api-gateway",
        "deployment/audit-worker",
    ]
    assert plan.targets[0].image == legacy_digest
    assert (
        rollout_image_digest.verify_repository_rollout(
            plan,
            image="service@sha256:" + "c" * 64,
            live_document=live,
            require_exact_digest=False,
        )
        == 2
    )


def test_rendered_management_manifest_captures_separately_declared_workers(
    tmp_path: Path,
) -> None:
    rendered = subprocess.run(
        ("kubectl", "kustomize", str(ROOT / "deploy" / "management")),
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    manifest = tmp_path / "management.yaml"
    manifest.write_text(rendered, encoding="utf-8")
    targets = set(
        capture_image_digests.expected_deployment_containers(
            manifest,
            managed_repository=(
                "183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service"
            ),
        )
    )

    assert ("auto-revert-worker", "worker") in targets
    assert ("change-correlation-worker", "worker") in targets


def test_rollout_repository_verification_fails_closed_on_stale_or_extra_target(
    tmp_path: Path,
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    stale = live_deployments(second_image=next_digest)

    with pytest.raises(RuntimeError, match="target set changed"):
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=stale,
            require_exact_digest=True,
        )

    items = stale["items"]
    assert isinstance(items, list)
    only_target = {"items": [items[0]]}
    with pytest.raises(RuntimeError, match="digest mismatch"):
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=only_target,
            require_exact_digest=True,
        )


def test_rollout_keeps_captured_outside_manifest_target_digest_unchanged(
    tmp_path: Path,
) -> None:
    plan = capture_image_digests.build_plan(
        expected=(("api-gateway", "api-gateway"),),
        live_document={
            "items": [
                live_deployments()["items"][0],
                {
                    "metadata": {"name": "cluster-agent"},
                    "spec": {
                        "template": {
                            "spec": {"containers": [{"name": "cluster-agent", "image": DIGEST}]}
                        }
                    },
                },
            ]
        },
        namespace="management",
        previous_release_sha=SHA,
        managed_repository="registry.example/opsia/service",
    )
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    live = {
        "items": [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "template": {
                        "spec": {"containers": [{"name": "api-gateway", "image": next_digest}]}
                    }
                },
            },
            {
                "metadata": {"name": "cluster-agent"},
                "spec": {
                    "template": {
                        "spec": {"containers": [{"name": "cluster-agent", "image": DIGEST}]}
                    }
                },
            },
        ]
    }

    assert (
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=live,
            require_exact_digest=True,
        )
        == 1
    )
    live["items"][1]["spec"]["template"]["spec"]["containers"][0]["image"] = next_digest
    with pytest.raises(RuntimeError, match="protected repository target changed"):
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=live,
            require_exact_digest=True,
        )


def test_rollout_renders_only_recorded_bootstrap_deployment_at_new_digest(
    tmp_path: Path,
) -> None:
    plan = revert_image_digests.load_plan(write_bootstrap_plan(tmp_path))
    next_digest = "service@sha256:" + "c" * 64

    rendered = rollout_image_digest.render_bootstrap_manifest(
        plan,
        manifest=deployment_manifest(tmp_path),
        image=next_digest,
    )

    documents = list(yaml.safe_load_all(rendered))
    assert [document["metadata"]["name"] for document in documents] == ["audit-worker"]
    assert documents[0]["spec"]["template"]["spec"]["containers"] == [
        {"name": "audit-worker", "image": next_digest}
    ]


def test_rollout_rejects_bootstrap_manifest_container_typo_before_kubectl(
    tmp_path: Path,
) -> None:
    plan = revert_image_digests.load_plan(write_bootstrap_plan(tmp_path))
    manifest = deployment_manifest(tmp_path)
    source = manifest.read_text(encoding="utf-8").replace(
        "name: audit-worker\n          image:",
        "name: misspelled-worker\n          image:",
    )
    manifest.write_text(source, encoding="utf-8")

    with pytest.raises(ValueError, match="bootstrap manifest target mismatch"):
        rollout_image_digest.render_bootstrap_manifest(
            plan,
            manifest=manifest,
            image="service@sha256:" + "c" * 64,
        )


def test_rollout_updates_only_captured_targets_to_one_digest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        if command[1:3] == ("config", "get-contexts"):
            stdout = "opsia-dev\n"
        elif command[-4:] == ("get", "deployments", "-o", "json"):
            stdout = json.dumps(
                {
                    "items": [
                        {
                            "metadata": {"name": "api-gateway"},
                            "spec": {
                                "template": {
                                    "spec": {
                                        "containers": [
                                            {
                                                "name": "api-gateway",
                                                "image": next_digest,
                                            }
                                        ]
                                    }
                                }
                            },
                        }
                    ]
                }
            )
        else:
            stdout = ""
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fake_run)

    rollout_image_digest.rollout(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
    )

    assert calls[2][-1] == f"api-gateway={next_digest}"
    assert calls[3][-2:] == ("deployment/api-gateway", "--timeout=300s")
    assert calls[1][-4:] == ("get", "deployments", "-o", "json")
    assert calls[4][-4:] == ("get", "deployments", "-o", "json")


def test_rollout_creates_recorded_bootstrap_before_setting_all_images(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_bootstrap_plan(tmp_path))
    next_digest = "service@sha256:" + "c" * 64
    live_calls = 0
    events: list[str] = []

    def document(*, include_audit: bool, image: str) -> dict[str, object]:
        items = [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "template": {"spec": {"containers": [{"name": "api-gateway", "image": image}]}}
                },
            }
        ]
        if include_audit:
            items.append(
                {
                    "metadata": {"name": "audit-worker"},
                    "spec": {
                        "template": {
                            "spec": {"containers": [{"name": "audit-worker", "image": next_digest}]}
                        }
                    },
                }
            )
        return {"items": items}

    def fake_live_deployments(
        *, context: str, namespace: str, deadline: float | None = None
    ) -> dict[str, object]:
        assert deadline is not None
        nonlocal live_calls
        assert (context, namespace) == ("opsia-dev", "management")
        live_calls += 1
        events.append(f"live-{live_calls}")
        if live_calls == 1:
            return document(include_audit=False, image=DIGEST)
        if live_calls == 2:
            return document(include_audit=True, image=DIGEST)
        return document(include_audit=True, image=next_digest)

    def fake_run(
        command: tuple[str, ...],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        if command[5:7] == ("create", "--filename"):
            events.append("create")
            payload = kwargs.get("input")
            assert isinstance(payload, str)
            created = list(yaml.safe_load_all(payload))
            assert [item["metadata"]["name"] for item in created] == ["audit-worker"]
            return subprocess.CompletedProcess(command, 0)
        events.append(f"{command[5]}:{command[-2]}")
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(rollout_image_digest, "live_deployments", fake_live_deployments)
    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fake_run)

    rollout_image_digest.rollout(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
        manifest=deployment_manifest(tmp_path),
    )

    assert events[:3] == ["live-1", "create", "live-2"]
    assert events[3:5] == [
        "set:deployment/api-gateway",
        "set:deployment/audit-worker",
    ]
    assert set(events[5:7]) == {
        "rollout:deployment/api-gateway",
        "rollout:deployment/audit-worker",
    }
    assert events[7:] == ["live-3"]


def test_rollout_command_plan_sets_every_image_before_waiting(tmp_path: Path) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64

    commands = rollout_image_digest.rollout_commands(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
    )

    assert [command[5:7] for command in commands[1:3]] == [
        ("set", "image"),
        ("set", "image"),
    ]
    assert [command[5:7] for command in commands[3:]] == [
        ("rollout", "status"),
        ("rollout", "status"),
    ]


def test_parallel_rollout_status_collects_concurrent_failures(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    status_commands = rollout_image_digest.rollout_commands(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
    )[3:]
    status_commands = (
        *status_commands,
        (*status_commands[0][:-2], "deployment/timeline-worker", status_commands[0][-1]),
    )
    barrier = threading.Barrier(2)
    started: list[str] = []

    def fail_together(
        command: tuple[str, ...],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        started.append(command[-2])
        barrier.wait(timeout=2)
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fail_together)

    with pytest.raises(RuntimeError, match="api-gateway.*audit-worker|audit-worker.*api-gateway"):
        rollout_image_digest.wait_for_rollout_statuses(
            status_commands,
            timeout="300s",
            max_workers=2,
        )

    assert set(started) == {"deployment/api-gateway", "deployment/audit-worker"}


def test_rollout_status_queue_uses_one_shared_deadline(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    status_commands = rollout_image_digest.rollout_commands(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="1s",
    )[3:]
    now = [0.0]
    calls: list[tuple[str, ...]] = []

    def fake_monotonic() -> float:
        return now[0]

    def consume_deadline(
        command: tuple[str, ...],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        assert kwargs["timeout"] == 1.0
        now[0] = 1.1
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(rollout_image_digest.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(rollout_image_digest.subprocess, "run", consume_deadline)

    with pytest.raises(RuntimeError, match="audit-worker"):
        rollout_image_digest.wait_for_rollout_statuses(
            status_commands,
            timeout="1s",
            max_workers=1,
        )

    assert len(calls) == 1


def test_rollout_verifies_exact_digest_only_after_every_status_succeeds(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = revert_image_digests.load_plan(write_two_target_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    events: list[str] = []
    live_calls = 0

    def fake_live_deployments(
        *, context: str, namespace: str, deadline: float | None = None
    ) -> dict[str, object]:
        assert deadline is not None
        nonlocal live_calls
        assert context == "opsia-dev"
        assert namespace == "management"
        live_calls += 1
        events.append(f"verify-{live_calls}")
        image = DIGEST if live_calls == 1 else next_digest
        return live_deployments(second_image=image) | {
            "items": [
                {
                    "metadata": {"name": "api-gateway"},
                    "spec": {
                        "template": {
                            "spec": {
                                "containers": [
                                    {
                                        "name": "api-gateway",
                                        "image": image,
                                    }
                                ]
                            }
                        }
                    },
                },
                {
                    "metadata": {"name": "audit-worker"},
                    "spec": {
                        "template": {
                            "spec": {
                                "containers": [
                                    {
                                        "name": "audit-worker",
                                        "image": image,
                                    }
                                ]
                            }
                        }
                    },
                },
            ]
        }

    def fake_run(
        command: tuple[str, ...],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[1:3] == ("config", "get-contexts"):
            return subprocess.CompletedProcess(command, 0, stdout="opsia-dev\n")
        events.append(f"{command[5]}:{command[-2]}")
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(rollout_image_digest, "live_deployments", fake_live_deployments)
    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fake_run)

    rollout_image_digest.rollout(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
    )

    assert events[0] == "verify-1"
    assert events[1:3] == [
        "set:deployment/api-gateway",
        "set:deployment/audit-worker",
    ]
    assert set(events[3:5]) == {
        "rollout:deployment/api-gateway",
        "rollout:deployment/audit-worker",
    }
    assert events[5] == "verify-2"
    assert live_calls == 2


def test_rollout_rejects_mutable_image_before_kubectl(tmp_path: Path) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))

    with pytest.raises(ValueError, match="immutable sha256 digest"):
        rollout_image_digest.rollout_commands(
            plan,
            context="opsia-dev",
            image="registry.example/opsia/service:latest",
            timeout="300s",
        )
