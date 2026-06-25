from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.session import get_session
from app.models.dummy_item import DummyDbItem
from app.schemas.common import ApiResponse
from app.schemas.dummy import DummyItem, EchoRequest, EchoResponse

router = APIRouter(prefix="/api/v1/dummy", tags=["dummy"])
_DUMMY_FILE = Path(__file__).resolve().parents[2] / "data" / "dummy_items.json"
SessionDep = Annotated[Session, Depends(get_session)]


def load_dummy_items() -> list[DummyItem]:
    raw_items = json.loads(_DUMMY_FILE.read_text(encoding="utf-8"))
    return [DummyItem.model_validate(item) for item in raw_items]


@router.get("/items", response_model=ApiResponse[list[DummyItem]])
def list_dummy_items() -> ApiResponse[list[DummyItem]]:
    return ApiResponse(data=load_dummy_items())


@router.get("/items/{item_id}", response_model=ApiResponse[DummyItem])
def get_dummy_item(item_id: int) -> ApiResponse[DummyItem]:
    for item in load_dummy_items():
        if item.id == item_id:
            return ApiResponse(data=item)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"dummy item not found: {item_id}",
    )


@router.get("/db-items", response_model=ApiResponse[list[DummyItem]])
def list_db_dummy_items(session: SessionDep) -> ApiResponse[list[DummyItem]]:
    rows = session.exec(select(DummyDbItem).order_by(DummyDbItem.id)).all()
    items = [
        DummyItem(id=row.id or 0, title=row.title, status=row.status, owner=row.owner)
        for row in rows
    ]
    return ApiResponse(data=items)


@router.post("/echo", response_model=ApiResponse[EchoResponse])
def echo(payload: EchoRequest) -> ApiResponse[EchoResponse]:
    return ApiResponse(data=EchoResponse(message=payload.message, length=len(payload.message)))
