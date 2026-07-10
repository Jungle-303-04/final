"""Verify GitHub Environment configuration for release-flow production workflows."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import quote, urlparse

DEFAULT_GITHUB_API_BASE = "https://api.github.com"
REQUIRED_SECRETS = {
    "RELEASE_FLOW_API_BASE_URL",
    "RELEASE_FLOW_AUTH_EMAIL",
    "RELEASE_FLOW_AUTH_PASSWORD",
}
REQUIRED_VALUE_KEYS = {
    "RELEASE_FLOW_SCM_REPO",
    "RELEASE_FLOW_LIVE_ENABLED",
    "RELEASE_FLOW_LIVE_WORKSPACES",
}
OPTIONAL_VALUE_KEYS = {
    "RELEASE_FLOW_SCM_BASE_BRANCH",
    "RELEASE_FLOW_GITHUB_API_BASE",
}
PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


@dataclass
class EnvironmentCheck:
    name: str
    ok: bool
    detail: str


class GitHubEnvironmentError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--github-repo", required=True, help="Repository in owner/repo form.")
    parser.add_argument("--environment", default="production")
    parser.add_argument("--github-token", default="")
    parser.add_argument("--github-token-env", default="GITHUB_TOKEN")
    parser.add_argument("--github-api-base", default=DEFAULT_GITHUB_API_BASE)
    parser.add_argument(
        "--allow-token-ref-only",
        action="store_true",
        help="Allow RELEASE_FLOW_GITHUB_TOKEN_REF without RELEASE_FLOW_GITHUB_TOKEN.",
    )
    parser.add_argument("--report-path", default="")
    return parser.parse_args(argv)


def github_headers(token: str) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "release-flow-github-environment-verifier",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def github_json(url: str, token: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=github_headers(token))
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GitHubEnvironmentError(
            f"GitHub API request failed: HTTP {exc.code} {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise GitHubEnvironmentError(f"GitHub API request failed: {exc.reason}") from exc
    return payload if isinstance(payload, dict) else {}


def github_api_url(api_base: str, repo: str, path: str) -> str:
    return f"{api_base.rstrip('/')}/repos/{repo.strip('/')}/{path.lstrip('/')}"


def load_environment_configuration(
    *,
    api_base: str,
    repo: str,
    environment: str,
    token: str,
) -> tuple[set[str], dict[str, str]]:
    env_name = quote(environment, safe="")
    secrets = github_json(github_api_url(api_base, repo, f"environments/{env_name}/secrets"), token)
    variables = github_json(
        github_api_url(api_base, repo, f"environments/{env_name}/variables"), token
    )
    secret_names = {
        str(item.get("name") or "")
        for item in secrets.get("secrets", [])
        if isinstance(item, dict) and item.get("name")
    }
    variable_values = {
        str(item.get("name") or ""): str(item.get("value") or "")
        for item in variables.get("variables", [])
        if isinstance(item, dict) and item.get("name")
    }
    return secret_names, variable_values


def configured_value(
    name: str, secret_names: set[str], variable_values: dict[str, str]
) -> tuple[bool, str | None]:
    if name in variable_values:
        return True, variable_values[name]
    if name in secret_names:
        return True, None
    return False, None


def validate_environment(
    *,
    secret_names: set[str],
    variable_values: dict[str, str],
    allow_token_ref_only: bool,
) -> list[EnvironmentCheck]:
    checks: list[EnvironmentCheck] = []
    for name in sorted(REQUIRED_SECRETS):
        checks.append(
            EnvironmentCheck(
                f"secret.{name}",
                name in secret_names,
                "configured as environment secret"
                if name in secret_names
                else "missing required environment secret",
            )
        )
    token_secret_present = "RELEASE_FLOW_GITHUB_TOKEN" in secret_names
    token_ref_present = "RELEASE_FLOW_GITHUB_TOKEN_REF" in secret_names
    token_ok = token_secret_present or (allow_token_ref_only and token_ref_present)
    if token_secret_present:
        token_detail = "RELEASE_FLOW_GITHUB_TOKEN configured for GitHub access preflight"
    elif token_ref_present and allow_token_ref_only:
        token_detail = (
            "RELEASE_FLOW_GITHUB_TOKEN_REF configured; token value resolution is operator-owned"
        )
    elif token_ref_present:
        token_detail = "RELEASE_FLOW_GITHUB_TOKEN is recommended for final GitHub access preflight"
    else:
        token_detail = "missing RELEASE_FLOW_GITHUB_TOKEN or RELEASE_FLOW_GITHUB_TOKEN_REF"
    checks.append(EnvironmentCheck("secret.github_token", token_ok, token_detail))

    for name in sorted(REQUIRED_VALUE_KEYS):
        configured, value = configured_value(name, secret_names, variable_values)
        ok, detail = validate_required_value(name, configured=configured, value=value)
        checks.append(EnvironmentCheck(f"value.{name}", ok, detail))
    for name in sorted(OPTIONAL_VALUE_KEYS):
        configured, value = configured_value(name, secret_names, variable_values)
        if not configured:
            checks.append(
                EnvironmentCheck(
                    f"value.{name}", True, "not configured; workflow default will be used"
                )
            )
            continue
        ok, detail = validate_optional_value(name, value=value)
        checks.append(EnvironmentCheck(f"value.{name}", ok, detail))
    return checks


def validate_required_value(name: str, *, configured: bool, value: str | None) -> tuple[bool, str]:
    if not configured:
        return False, "missing required environment variable or secret"
    if value is None:
        return True, "configured as environment secret; value cannot be inspected"
    stripped = value.strip()
    if name == "RELEASE_FLOW_SCM_REPO":
        return (
            bool(REPO_PATTERN.fullmatch(stripped)),
            "owner/repo value" if REPO_PATTERN.fullmatch(stripped) else "must be owner/repo",
        )
    if name == "RELEASE_FLOW_LIVE_ENABLED":
        return (
            stripped.lower() in {"1", "true", "yes", "on"},
            "live dispatch enabled"
            if stripped.lower() in {"1", "true", "yes", "on"}
            else "must enable live dispatch",
        )
    if name == "RELEASE_FLOW_LIVE_WORKSPACES":
        if not stripped:
            return False, "must list at least one workspace"
        if stripped == "*" or "*" in {item.strip() for item in stripped.split(",")}:
            return False, "must not use wildcard workspace allow-list for production"
        return True, "workspace allow-list configured"
    return True, "configured"


def validate_optional_value(name: str, *, value: str | None) -> tuple[bool, str]:
    if value is None:
        return True, "configured as environment secret; value cannot be inspected"
    stripped = value.strip()
    if not stripped:
        return False, "configured value must not be blank"
    if name == "RELEASE_FLOW_SCM_BASE_BRANCH":
        return True, "base branch configured"
    if name == "RELEASE_FLOW_GITHUB_API_BASE":
        return validate_https_url(stripped)
    return True, "configured"


def validate_https_url(value: str) -> tuple[bool, str]:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return False, "must use https"
    if not host:
        return False, "must include a hostname"
    if placeholder_host(host):
        return False, "must not use localhost or example hosts"
    return True, "concrete https URL"


def placeholder_host(host: str) -> bool:
    return (
        host in PLACEHOLDER_HOSTS
        or host.endswith(".localhost")
        or host.endswith(".example.com")
        or host.endswith(".example.test")
    )


def write_report(
    path: str, *, ok: bool, repo: str, environment: str, checks: list[EnvironmentCheck]
) -> None:
    if not path:
        return
    report_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    payload = {
        "ok": ok,
        "repo": repo,
        "environment": environment,
        "checks": [asdict(check) for check in checks],
    }
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    repo = str(args.github_repo or "").strip()
    if not REPO_PATTERN.fullmatch(repo):
        print("fail input.github_repo: --github-repo must be owner/repo")
        return 2
    token = str(args.github_token or os.getenv(str(args.github_token_env or "")) or "").strip()
    if not token:
        print(
            "fail input.github_token: --github-token or configured --github-token-env is required"
        )
        return 2
    try:
        secret_names, variable_values = load_environment_configuration(
            api_base=str(args.github_api_base or DEFAULT_GITHUB_API_BASE),
            repo=repo,
            environment=str(args.environment or "production"),
            token=token,
        )
        checks = validate_environment(
            secret_names=secret_names,
            variable_values=variable_values,
            allow_token_ref_only=bool(args.allow_token_ref_only),
        )
    except GitHubEnvironmentError as exc:
        checks = [EnvironmentCheck("github.environment_api", False, str(exc))]
    ok = all(check.ok for check in checks)
    for check in checks:
        print(f"{'ok' if check.ok else 'fail'} {check.name}: {check.detail}")
    write_report(
        str(args.report_path or ""),
        ok=ok,
        repo=repo,
        environment=str(args.environment or "production"),
        checks=checks,
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
