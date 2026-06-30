from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
API_GATEWAY_DIR = ROOT_DIR / "src" / "services" / "api-gateway"


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


def test_gateway_redis_client_import_is_not_shadowed_by_config() -> None:
    auth = load_gateway_auth_module()

    assert hasattr(auth.AsyncRedis, "from_url")
    assert auth.RedisConfig.DEFAULT_URL.startswith("redis://")
    assert auth.RedisSessionStore().client is None
