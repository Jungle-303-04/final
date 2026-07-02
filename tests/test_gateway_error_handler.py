from __future__ import annotations

from typing import Any

from conftest import ROOT, load_file
from fastapi.testclient import TestClient


def load_gateway_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "gateway.py",
        "test_api_gateway_error_handler_module",
    )


def test_gateway_unhandled_error_response_does_not_leak_exception_detail(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    app = gateway.create_app()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret database password leaked")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"error": "internal server error"}
    assert "secret" not in response.text
