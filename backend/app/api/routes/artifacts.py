from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.artifacts.service import (
    generate_pdf_artifact,
    get_artifact_download_response,
    list_artifacts,
)
from app.cases.models import ArtifactPayload
from app.db import get_db_session

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.post(
    "/cases/{case_id}/artifacts",
    response_model=ArtifactPayload,
    status_code=status.HTTP_201_CREATED,
)
async def generate_artifact_route(case_id: str, session: DBSession) -> ArtifactPayload:
    return await generate_pdf_artifact(session, case_id)


@router.get("/cases/{case_id}/artifacts", response_model=list[ArtifactPayload])
async def list_artifacts_route(
    case_id: str, session: DBSession
) -> list[ArtifactPayload]:
    return await list_artifacts(session, case_id)


@router.get("/cases/{case_id}/artifacts/{artifact_id}/download")
async def download_artifact_route(
    case_id: str,
    artifact_id: str,
    session: DBSession,
) -> Response:
    return await get_artifact_download_response(session, case_id, artifact_id)
