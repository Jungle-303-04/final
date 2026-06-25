from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client() -> Generator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_list_dummy_items(client: TestClient) -> None:
    response = client.get("/api/v1/dummy/items")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) >= 3
    assert body["data"][0]["title"] == "첫 번째 더미 작업"


def test_list_db_dummy_items(client: TestClient) -> None:
    response = client.get("/api/v1/dummy/db-items")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) >= 3
    assert body["data"][0]["owner"] == "woonyong"


def test_get_dummy_item(client: TestClient) -> None:
    response = client.get("/api/v1/dummy/items/1")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == 1


def test_missing_dummy_item_uses_error_shape(client: TestClient) -> None:
    response = client.get("/api/v1/dummy/items/999")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "http_error"
    assert "request_id" in body["error"]


def test_echo_dummy_payload(client: TestClient) -> None:
    response = client.post("/api/v1/dummy/echo", json={"message": "hello"})

    assert response.status_code == 200
    assert response.json()["data"] == {"message": "hello", "length": 5}
