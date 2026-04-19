from fastapi import APIRouter

from app.api.routes.cases import router as cases_router
from app.api.routes.health import router as health_router
from app.api.routes.intake import router as intake_router
from app.api.routes.templates import router as templates_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(templates_router, prefix="/templates", tags=["templates"])
api_router.include_router(cases_router, prefix="/cases", tags=["cases"])
api_router.include_router(intake_router, tags=["intake"])
