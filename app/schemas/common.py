from pydantic import BaseModel


class ApiResponse[DataT](BaseModel):
    data: DataT


class ApiError(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ApiError
