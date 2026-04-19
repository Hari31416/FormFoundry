from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.intake.models import (
    EvidenceIntakeResponse,
    EvidencePayload,
    TextEvidenceRequest,
)
from app.intake.service import (
    create_text_evidence,
    create_upload_evidence,
    list_case_evidence,
)

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]
UploadFileParam = Annotated[UploadFile, File(...)]
CreatedByForm = Annotated[str, Form()]


@router.post(
    "/cases/{case_id}/evidence/text",
    response_model=EvidenceIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_text_evidence_route(
    case_id: str,
    payload: TextEvidenceRequest,
    session: DBSession,
) -> EvidenceIntakeResponse:
    return await create_text_evidence(session, case_id, payload)


@router.post(
    "/cases/{case_id}/evidence/upload",
    response_model=EvidenceIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload_evidence_route(
    case_id: str,
    session: DBSession,
    file: UploadFileParam,
    created_by: CreatedByForm = "local-user",
) -> EvidenceIntakeResponse:
    return await create_upload_evidence(session, case_id, file, created_by=created_by)


@router.get("/cases/{case_id}/evidence", response_model=list[EvidencePayload])
async def list_case_evidence_route(
    case_id: str, session: DBSession
) -> list[EvidencePayload]:
    return await list_case_evidence(session, case_id)
