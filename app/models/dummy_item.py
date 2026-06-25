from sqlmodel import Field, SQLModel


class DummyDbItem(SQLModel, table=True):
    __tablename__ = "dummy_items"

    id: int | None = Field(default=None, primary_key=True)
    title: str
    status: str
    owner: str
