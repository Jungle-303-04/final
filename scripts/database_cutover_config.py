from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit

KUBERNETES_NAME = re.compile(r"^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$")
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
RUN_NUMBER = re.compile(r"^[1-9][0-9]{0,19}$")
DATABASE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
CUTOVER_SECRET = "first-deploy-database-cutover"
RUNTIME_SECRET = "management-runtime-secret"
PGBOUNCER_SECRET = "pgbouncer-config"
SOURCE_URL_KEY = "BASELINE_SOURCE_DATABASE_URL"
TARGET_URL_KEY = "BASELINE_TARGET_DATABASE_URL"
SOURCE_PGBOUNCER_KEY = "SOURCE_PGBOUNCER_INI"


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _parsed_url(value: str) -> SplitResult:
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"postgresql", "postgres"}
        or not parsed.hostname
        or not parsed.username
        or not parsed.path.startswith("/")
        or parsed.path.count("/") != 1
        or parsed.fragment
    ):
        raise ValueError("database URL must identify one PostgreSQL database")
    if not DATABASE_NAME.fullmatch(parsed.path[1:]):
        raise ValueError("database URL contains an unsupported database name")
    return parsed


def database_name(value: str) -> str:
    return _parsed_url(value).path[1:]


def target_database_url(source_url: str, target_database: str) -> str:
    if not DATABASE_NAME.fullmatch(target_database):
        raise ValueError("target database name is invalid")
    parsed = _parsed_url(source_url)
    return urlunsplit(parsed._replace(path=f"/{target_database}"))


def target_database_name(source_sha: str, run_id: str, run_attempt: str) -> str:
    if not GIT_SHA.fullmatch(source_sha):
        raise ValueError("source SHA must be a full lowercase Git SHA")
    if not RUN_NUMBER.fullmatch(run_id) or not RUN_NUMBER.fullmatch(run_attempt):
        raise ValueError("run identity must use positive decimal numbers")
    target = f"opsia_{source_sha[:12]}_{run_id}_{run_attempt}"
    if not DATABASE_NAME.fullmatch(target):
        raise ValueError("derived target database name is invalid")
    return target


def switch_pgbouncer_database(
    config: str,
    *,
    source_database: str,
    target_database: str,
) -> str:
    if not DATABASE_NAME.fullmatch(source_database) or not DATABASE_NAME.fullmatch(target_database):
        raise ValueError("PgBouncer database name is invalid")
    pattern = re.compile(rf"(?<![A-Za-z0-9_])dbname={re.escape(source_database)}(?![A-Za-z0-9_])")
    if len(pattern.findall(config)) != 1:
        raise ValueError("PgBouncer source database mapping must occur exactly one time")
    switched = pattern.sub(f"dbname={target_database}", config)
    if switched == config:
        raise ValueError("PgBouncer database mapping was not changed")
    return switched


def _validate_context(context: str, namespace: str) -> None:
    if not context or any(character.isspace() for character in context):
        raise ValueError("context must be a non-empty name without whitespace")
    if not KUBERNETES_NAME.fullmatch(namespace):
        raise ValueError("namespace is not a Kubernetes name")
    result = subprocess.run(
        ("kubectl", "config", "get-contexts", context, "-o", "name"),
        check=True,
        capture_output=True,
        text=True,
    )
    if result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")


def _secret(context: str, namespace: str, name: str) -> dict[str, Any]:
    result = subprocess.run(
        ("kubectl", "--context", context, "-n", namespace, "get", "secret", name, "-o", "json"),
        check=True,
        capture_output=True,
        text=True,
    )
    document = require_mapping(json.loads(result.stdout), f"secret/{name}")
    data = require_mapping(document.get("data"), f"secret/{name}.data")
    return data


def _decode(data: dict[str, Any], key: str) -> str:
    encoded = data.get(key)
    if not isinstance(encoded, str) or not encoded:
        raise ValueError(f"secret key is missing: {key}")
    return base64.b64decode(encoded, validate=True).decode("utf-8")


def _encoded(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _secret_document(namespace: str, name: str, values: dict[str, str]) -> bytes:
    document = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": name, "namespace": namespace},
        "type": "Opaque",
        "data": {key: _encoded(value) for key, value in values.items()},
    }
    return json.dumps(document, separators=(",", ":")).encode("utf-8")


def _patch_secret(
    context: str,
    namespace: str,
    name: str,
    values: dict[str, str],
) -> None:
    patch = json.dumps(
        {"data": {key: _encoded(value) for key, value in values.items()}},
        separators=(",", ":"),
    ).encode("utf-8")
    subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "patch",
            "secret",
            name,
            "--type=merge",
            "--patch-file=/dev/stdin",
        ),
        check=True,
        input=patch,
    )


def prepare(
    *,
    context: str,
    namespace: str,
    source_sha: str,
    run_id: str,
    run_attempt: str,
) -> str:
    _validate_context(context, namespace)
    existing = subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "get",
            "secret",
            CUTOVER_SECRET,
        ),
        check=False,
        capture_output=True,
    )
    if existing.returncode == 0:
        raise RuntimeError("a first-deploy cutover secret already exists")

    runtime = _secret(context, namespace, RUNTIME_SECRET)
    pgbouncer = _secret(context, namespace, PGBOUNCER_SECRET)
    source_url = _decode(runtime, "COMMAND_NOTIFY_DATABASE_URL")
    source_database = database_name(source_url)
    target_database = target_database_name(source_sha, run_id, run_attempt)
    target_url = target_database_url(source_url, target_database)
    source_pgbouncer = _decode(pgbouncer, "pgbouncer.ini")
    switch_pgbouncer_database(
        source_pgbouncer,
        source_database=source_database,
        target_database=target_database,
    )

    subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "exec",
            "statefulset/postgresql",
            "--",
            "sh",
            "-ec",
            'exec createdb -U "$POSTGRES_USER" "$1"',
            "createdb",
            target_database,
        ),
        check=True,
    )
    subprocess.run(
        ("kubectl", "--context", context, "create", "--filename=-"),
        check=True,
        input=_secret_document(
            namespace,
            CUTOVER_SECRET,
            {
                SOURCE_URL_KEY: source_url,
                TARGET_URL_KEY: target_url,
                SOURCE_PGBOUNCER_KEY: source_pgbouncer,
            },
        ),
    )
    return target_database


def switch(*, context: str, namespace: str, direction: str) -> bool:
    _validate_context(context, namespace)
    cutover = _secret(context, namespace, CUTOVER_SECRET)
    source_url = _decode(cutover, SOURCE_URL_KEY)
    target_url = _decode(cutover, TARGET_URL_KEY)
    source_pgbouncer = _decode(cutover, SOURCE_PGBOUNCER_KEY)
    source_database = database_name(source_url)
    target_database = database_name(target_url)
    target_pgbouncer = switch_pgbouncer_database(
        source_pgbouncer,
        source_database=source_database,
        target_database=target_database,
    )
    if direction == "target":
        expected_url, desired_url = source_url, target_url
        expected_config, desired_config = source_pgbouncer, target_pgbouncer
    elif direction == "source":
        expected_url, desired_url = target_url, source_url
        expected_config, desired_config = target_pgbouncer, source_pgbouncer
    else:
        raise ValueError("direction must be target or source")

    runtime = _secret(context, namespace, RUNTIME_SECRET)
    pgbouncer = _secret(context, namespace, PGBOUNCER_SECRET)
    current_url = _decode(runtime, "COMMAND_NOTIFY_DATABASE_URL")
    current_config = _decode(pgbouncer, "pgbouncer.ini")
    if current_url == desired_url and current_config == desired_config:
        return False
    if current_url != expected_url or current_config != expected_config:
        raise RuntimeError("live database routing does not match the expected cutover state")

    _patch_secret(
        context,
        namespace,
        RUNTIME_SECRET,
        {"COMMAND_NOTIFY_DATABASE_URL": desired_url},
    )
    try:
        _patch_secret(
            context,
            namespace,
            PGBOUNCER_SECRET,
            {"pgbouncer.ini": desired_config},
        )
    except Exception:
        _patch_secret(
            context,
            namespace,
            RUNTIME_SECRET,
            {"COMMAND_NOTIFY_DATABASE_URL": expected_url},
        )
        raise
    return True


def cleanup(*, context: str, namespace: str) -> None:
    _validate_context(context, namespace)
    subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "delete",
            "secret",
            CUTOVER_SECRET,
            "--ignore-not-found",
            "--wait=true",
        ),
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare and switch an isolated database target")
    subparsers = parser.add_subparsers(dest="action", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--context", required=True)
    prepare_parser.add_argument("--namespace", required=True)
    prepare_parser.add_argument("--source-sha", required=True)
    prepare_parser.add_argument("--run-id", required=True)
    prepare_parser.add_argument("--run-attempt", required=True)
    switch_parser = subparsers.add_parser("switch")
    switch_parser.add_argument("--direction", choices=("target", "source"), required=True)
    switch_parser.add_argument("--context", required=True)
    switch_parser.add_argument("--namespace", required=True)
    cleanup_parser = subparsers.add_parser("cleanup")
    cleanup_parser.add_argument("--context", required=True)
    cleanup_parser.add_argument("--namespace", required=True)
    args = parser.parse_args()
    if args.action == "prepare":
        target = prepare(
            context=args.context,
            namespace=args.namespace,
            source_sha=args.source_sha,
            run_id=args.run_id,
            run_attempt=args.run_attempt,
        )
        print(f"prepared isolated database target: {target}")
    elif args.action == "switch":
        changed = switch(context=args.context, namespace=args.namespace, direction=args.direction)
        print(f"database routing {'changed' if changed else 'already current'}: {args.direction}")
    else:
        cleanup(context=args.context, namespace=args.namespace)
        print("removed temporary database cutover secret")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
