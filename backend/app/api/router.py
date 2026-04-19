from fastapi import APIRouter

from app.api.routes.artifacts import router as artifacts_router
from app.api.routes.cases import router as cases_router
from app.api.routes.conversation import router as conversation_router
from app.api.routes.extraction import router as extraction_router
from app.api.routes.health import router as health_router
from app.api.routes.intake import router as intake_router
from app.api.routes.templates import router as templates_router
from app.api.routes.validation import router as validation_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(templates_router, prefix="/templates", tags=["templates"])
api_router.include_router(cases_router, prefix="/cases", tags=["cases"])
api_router.include_router(intake_router, tags=["intake"])
api_router.include_router(extraction_router, tags=["extraction"])
api_router.include_router(conversation_router, tags=["conversation"])
api_router.include_router(validation_router, tags=["validation"])
api_router.include_router(artifacts_router, tags=["artifacts"])
