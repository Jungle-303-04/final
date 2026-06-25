from eda_platform.main import build_role_runners
from eda_platform.roles import ServiceRole


def test_service_role_values_are_cli_friendly() -> None:
    assert "gateway" in ServiceRole.values()
    assert "rca-worker" in ServiceRole.values()
    assert "target-agent" in ServiceRole.values()


def test_role_runner_registry_covers_every_role() -> None:
    runners = build_role_runners()

    assert set(runners) == set(ServiceRole)


def test_unknown_role_message_lists_available_roles() -> None:
    try:
        ServiceRole.from_raw("unknown")
    except ValueError as exc:
        assert "available roles" in str(exc)
        assert "gateway" in str(exc)
    else:
        raise AssertionError("unknown role should fail")
