from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class StatusResponse(HealthResponse):
    service_name: str


class ErrorReponse(BaseModel):
    error: str
    detail: str
