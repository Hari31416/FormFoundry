from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import CurrentUser
from app.conversation.service import get_next_question
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
    user: CurrentUser,
    session: DBSession,
) -> EvidenceIntakeResponse:
    question = await get_next_question(session, case_id)
    if question and question.kind == "document_upload":
        raise HTTPException(
            409,
            "This question requires a document upload. Text replies are not accepted.",
        )
    return await create_text_evidence(
        session, case_id, payload.model_copy(update={"created_by": user.id})
    )


@router.post(
    "/cases/{case_id}/evidence/upload",
    response_model=EvidenceIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload_evidence_route(
    case_id: str,
    session: DBSession,
    file: UploadFileParam,
    user: CurrentUser,
    created_by: CreatedByForm = "local-user",
    document_type: Annotated[str | None, Form()] = None,
    document_country: Annotated[str, Form()] = "IN",
) -> EvidenceIntakeResponse:
    return await create_upload_evidence(
        session,
        case_id,
        file,
        created_by=user.id,
        document_type=document_type,
        document_country=document_country,
    )


@router.get("/cases/{case_id}/evidence", response_model=list[EvidencePayload])
async def list_case_evidence_route(
    case_id: str, session: DBSession
) -> list[EvidencePayload]:
    return await list_case_evidence(session, case_id)
