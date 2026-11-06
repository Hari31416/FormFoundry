from fastapi import APIRouter, Depends

from app.api.routes.artifacts import router as artifacts_router
from app.api.routes.cases import router as cases_router
from app.api.routes.conversation import router as conversation_router
from app.api.routes.documents import router as documents_router
from app.api.routes.extraction import router as extraction_router
from app.api.routes.health import router as health_router
from app.api.routes.intake import router as intake_router
from app.api.routes.languages import router as languages_router
from app.api.routes.templates import router as templates_router
from app.api.routes.validation import router as validation_router
from app.auth.routes import router as auth_router
from app.auth.service import authorize_resource

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
protected_router = APIRouter(dependencies=[Depends(authorize_resource)])
api_router.include_router(auth_router)
protected_router.include_router(
    templates_router, prefix="/templates", tags=["templates"]
)
protected_router.include_router(cases_router, prefix="/cases", tags=["cases"])
protected_router.include_router(intake_router, tags=["intake"])
protected_router.include_router(documents_router, tags=["documents"])
protected_router.include_router(extraction_router, tags=["extraction"])
protected_router.include_router(conversation_router, tags=["conversation"])
protected_router.include_router(validation_router, tags=["validation"])
protected_router.include_router(artifacts_router, tags=["artifacts"])
protected_router.include_router(languages_router, tags=["languages"])

api_router.include_router(protected_router)
