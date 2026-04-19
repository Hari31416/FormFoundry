from __future__ import annotations

from contextvars import ContextVar
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_CONTEXT: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return REQUEST_ID_CONTEXT.get()


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))
        token = REQUEST_ID_CONTEXT.set(request_id)
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = request_id
            return response
        finally:
            REQUEST_ID_CONTEXT.reset(token)
