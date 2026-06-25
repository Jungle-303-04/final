from packages.shared.roles import ServiceRole
from services.registry import SERVICE_REGISTRY, load_runner, service_roles


def test_service_role_values_are_cli_friendly() -> None:
    assert "gateway" in ServiceRole.values()
    assert "rca-worker" in ServiceRole.values()
    assert "target-agent" in ServiceRole.values()


def test_service_registry_covers_every_role() -> None:
    assert set(SERVICE_REGISTRY) == set(ServiceRole)


def test_service_roles_are_cli_friendly() -> None:
    assert set(service_roles()) == {role.value for role in ServiceRole}


def test_service_runners_are_loadable() -> None:
    for role in ServiceRole:
        assert callable(load_runner(role))


def test_unknown_role_message_lists_available_roles() -> None:
    try:
        ServiceRole.from_raw("unknown")
    except ValueError as exc:
        assert "available roles" in str(exc)
        assert "gateway" in str(exc)
    else:
        raise AssertionError("unknown role should fail")
