from collections.abc import Generator
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings
from app.models.dummy_item import DummyDbItem  # noqa: F401


def _create_engine():
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        sqlite_path = settings.database_url.removeprefix("sqlite:///")
        if sqlite_path and sqlite_path != ":memory:":
            Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(settings.database_url, connect_args={"check_same_thread": False})

    return create_engine(settings.database_url, pool_pre_ping=True)


engine = _create_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session]:
    with Session(engine) as session:
        yield session


def check_database() -> None:
    with Session(engine) as session:
        session.exec(text("select 1")).one()
