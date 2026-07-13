from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from packages.config.constants import Redis as RedisConfig
from packages.storage.sessions import RedisSessionStore, RedisSessionStoreConfig

ROOT_DIR = Path(__file__).resolve().parents[1]
API_GATEWAY_DIR = ROOT_DIR / "src" / "services" / "gateway" / "api-gateway"


def load_gateway_auth_module():
    sys.path.insert(0, str(API_GATEWAY_DIR))
    spec = importlib.util.spec_from_file_location(
        "test_api_gateway_auth", API_GATEWAY_DIR / "auth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load api-gateway auth module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_service_image_requirements_include_storage_dependencies() -> None:
    requirements = (ROOT_DIR / "src" / "services" / "requirements.txt").read_text(encoding="utf-8")

    assert "sqlalchemy==" in requirements


def test_controller_runtime_declares_greenlet_for_async_sqlalchemy() -> None:
    project = (ROOT_DIR / "pyproject.toml").read_text(encoding="utf-8")

    assert '"greenlet>=' in project


def test_gateway_redis_client_import_is_not_shadowed_by_config() -> None:
    load_gateway_auth_module()
    config = RedisSessionStoreConfig(
        url=RedisConfig.DEFAULT_URL,
        ttl_seconds=60,
        key_prefix="session",
        token_bytes=32,
        default_roles=("user",),
        default_workspace_id="default",
        rate_limit_key_prefix="rate",
        rate_limit=120,
        rate_limit_window_seconds=60,
        email_verification_key_prefix="email_verify",
        email_verification_ttl_seconds=3600,
        email_verification_token_bytes=32,
    )

    assert RedisConfig.DEFAULT_URL.startswith("redis://")
    assert RedisSessionStore(config).client is None
