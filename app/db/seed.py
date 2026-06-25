from sqlmodel import Session, select

from app.api.routes.dummy import load_dummy_items
from app.db.session import engine
from app.models.dummy_item import DummyDbItem


def seed_dummy_items() -> None:
    with Session(engine) as session:
        existing = session.exec(select(DummyDbItem)).first()
        if existing:
            return

        for item in load_dummy_items():
            session.add(
                DummyDbItem(
                    id=item.id,
                    title=item.title,
                    status=item.status,
                    owner=item.owner,
                )
            )
        session.commit()
