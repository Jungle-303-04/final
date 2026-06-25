from pydantic import BaseModel, Field


class DummyItem(BaseModel):
    id: int
    title: str
    status: str
    owner: str


class EchoRequest(BaseModel):
    message: str = Field(min_length=1, max_length=200)


class EchoResponse(BaseModel):
    message: str
    length: int
