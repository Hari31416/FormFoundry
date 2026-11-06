from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.documents.models import DocumentAnalysis, DocumentDefinition
from app.documents.registry import DEFINITIONS
from app.intake.models import EvidenceRecord

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.get("/documents/types", response_model=list[DocumentDefinition])
async def list_document_types() -> list[DocumentDefinition]:
    return list(DEFINITIONS)


@router.get(
    "/cases/{case_id}/evidence/{evidence_id}/document-analysis",
    response_model=DocumentAnalysis | None,
)
async def get_document_analysis(
    case_id: str, evidence_id: str, session: DBSession
) -> DocumentAnalysis | None:
    record = await session.get(EvidenceRecord, evidence_id)
    if record is None or record.case_id != case_id:
        raise HTTPException(404, "Evidence not found")
    payload = (record.parsed_payload or {}).get("document_analysis")
    return DocumentAnalysis.model_validate(payload) if payload else None
