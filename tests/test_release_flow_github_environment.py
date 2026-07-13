import json
import urllib.error

from scripts import verify_release_flow_github_environment as environment


def complete_secret_names() -> set[str]:
    return {
        "RELEASE_FLOW_API_BASE_URL",
        "RELEASE_FLOW_AUTH_EMAIL",
        "RELEASE_FLOW_AUTH_PASSWORD",
        "RELEASE_FLOW_GITHUB_TOKEN",
    }


def complete_variables() -> dict[str, str]:
    return {
        "RELEASE_FLOW_SCM_REPO": "org/checkout",
        "RELEASE_FLOW_LIVE_ENABLED": "1",
        "RELEASE_FLOW_LIVE_WORKSPACES": "workspace-production",
        "RELEASE_FLOW_SCM_BASE_BRANCH": "main",
        "RELEASE_FLOW_GITHUB_API_BASE": "https://github.company.internal/api/v3",
    }


def test_validate_github_environment_accepts_complete_configuration() -> None:
    checks = environment.validate_environment(
        secret_names=complete_secret_names(),
        variable_values=complete_variables(),
        allow_token_ref_only=False,
    )

    assert all(check.ok for check in checks)


def test_validate_github_environment_rejects_missing_secret_and_wildcard_workspace() -> None:
    secrets = complete_secret_names() - {"RELEASE_FLOW_AUTH_PASSWORD", "RELEASE_FLOW_GITHUB_TOKEN"}
    variables = complete_variables()
    variables["RELEASE_FLOW_LIVE_WORKSPACES"] = "*"

    checks = environment.validate_environment(
        secret_names=secrets,
        variable_values=variables,
        allow_token_ref_only=False,
    )

    failed = {check.name: check.detail for check in checks if not check.ok}
    assert "secret.RELEASE_FLOW_AUTH_PASSWORD" in failed
    assert "secret.github_token" in failed
    assert "value.RELEASE_FLOW_LIVE_WORKSPACES" in failed
    assert "wildcard" in failed["value.RELEASE_FLOW_LIVE_WORKSPACES"]


def test_validate_github_environment_allows_token_ref_when_requested() -> None:
    secrets = (complete_secret_names() - {"RELEASE_FLOW_GITHUB_TOKEN"}) | {
        "RELEASE_FLOW_GITHUB_TOKEN_REF"
    }

    checks = environment.validate_environment(
        secret_names=secrets,
        variable_values=complete_variables(),
        allow_token_ref_only=True,
    )

    assert all(check.ok for check in checks)


def test_validate_github_environment_rejects_placeholder_optional_api_base() -> None:
    variables = complete_variables()
    variables["RELEASE_FLOW_GITHUB_API_BASE"] = "https://api.example.com"

    checks = environment.validate_environment(
        secret_names=complete_secret_names(),
        variable_values=variables,
        allow_token_ref_only=False,
    )

    github_api = next(
        check for check in checks if check.name == "value.RELEASE_FLOW_GITHUB_API_BASE"
    )
    assert github_api.ok is False
    assert "example hosts" in github_api.detail


def test_verify_github_environment_fetches_environment_configuration(monkeypatch, capsys) -> None:
    class Response:
        def __init__(self, payload: dict) -> None:
            self.payload = payload

        def __enter__(self) -> "Response":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return json.dumps(self.payload).encode("utf-8")

    def fake_urlopen(request: object, *, timeout: int) -> Response:
        assert timeout == 30
        assert request.headers["Authorization"] == "Bearer token-a"  # type: ignore[attr-defined,index]
        url = request.full_url  # type: ignore[attr-defined]
        if url.endswith("/environments/production/secrets"):
            return Response(
                {"secrets": [{"name": name} for name in sorted(complete_secret_names())]}
            )
        if url.endswith("/environments/production/variables"):
            return Response(
                {
                    "variables": [
                        {"name": name, "value": value}
                        for name, value in sorted(complete_variables().items())
                    ]
                }
            )
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(environment.urllib.request, "urlopen", fake_urlopen)

    assert environment.main(["--github-repo", "org/repo", "--github-token", "token-a"]) == 0
    captured = capsys.readouterr()
    assert "ok secret.RELEASE_FLOW_API_BASE_URL" in captured.out


def test_verify_github_environment_writes_nested_report_path(monkeypatch, tmp_path) -> None:
    class Response:
        def __init__(self, payload: dict) -> None:
            self.payload = payload

        def __enter__(self) -> "Response":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return json.dumps(self.payload).encode("utf-8")

    def fake_urlopen(request: object, *, timeout: int) -> Response:
        url = request.full_url  # type: ignore[attr-defined]
        if url.endswith("/environments/production/secrets"):
            return Response(
                {"secrets": [{"name": name} for name in sorted(complete_secret_names())]}
            )
        if url.endswith("/environments/production/variables"):
            return Response(
                {
                    "variables": [
                        {"name": name, "value": value}
                        for name, value in sorted(complete_variables().items())
                    ]
                }
            )
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(environment.urllib.request, "urlopen", fake_urlopen)
    report_path = tmp_path / "artifacts" / "release-flow-github-environment.json"

    assert (
        environment.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--report-path",
                str(report_path),
            ]
        )
        == 0
    )
    assert report_path.is_file()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["ok"] is True


def test_verify_github_environment_reports_http_failure(monkeypatch, capsys) -> None:
    def fake_urlopen(request: object, *, timeout: int) -> object:
        raise urllib.error.HTTPError(request.full_url, 404, "not found", hdrs=None, fp=None)  # type: ignore[attr-defined]

    monkeypatch.setattr(environment.urllib.request, "urlopen", fake_urlopen)

    assert environment.main(["--github-repo", "org/repo", "--github-token", "token-a"]) == 1
    captured = capsys.readouterr()
    assert "fail github.environment_api" in captured.out
    assert "HTTP 404" in captured.out
