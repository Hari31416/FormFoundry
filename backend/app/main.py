from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_id import RequestIdMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.local_storage_path.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    configure_logging()
    application = FastAPI(title=settings.project_name, lifespan=lifespan)
    application.add_middleware(RequestIdMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"http://localhost:{settings.frontend_port}",
            f"http://127.0.0.1:{settings.frontend_port}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix=settings.api_prefix)
    return application


app = create_app()
