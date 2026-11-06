from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import (
    CaseCreateRequest,
    CaseDetail,
    CaseFilePayload,
    CaseFileRecord,
    CaseTitleUpdate,
    SchemaStateResponse,
)
from app.cases.service import (
    create_case,
    get_case_detail,
    get_filtered_schema_state,
    list_cases,
)
from app.conversation.context import case_lock
from app.conversation.service import record_active_question_turn
from app.db import get_db_session

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]
StatusFilter = Annotated[list[str] | None, Query(alias="status")]


@router.get("", response_model=list[CaseFilePayload])
async def list_cases_route(
    session: DBSession,
    template_id: str | None = Query(None, alias="template_id"),
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[CaseFilePayload]:
    return await list_cases(
        session, template_id=template_id, limit=limit, offset=offset
    )


@router.post("", response_model=CaseDetail, status_code=status.HTTP_201_CREATED)
async def create_case_route(
    payload: CaseCreateRequest, session: DBSession
) -> CaseDetail:
    case_detail = await create_case(session, payload)
    await record_active_question_turn(session, case_detail.case_id)
    return case_detail


@router.get("/{case_id}", response_model=CaseDetail)
async def get_case_route(case_id: str, session: DBSession) -> CaseDetail:
    return await get_case_detail(session, case_id)


@router.put("/{case_id}/title", response_model=CaseDetail)
async def update_case_title_route(
    case_id: str, payload: CaseTitleUpdate, session: DBSession
) -> CaseDetail:
    async with case_lock(case_id):
        record = await session.get(CaseFileRecord, case_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Case not found")
        record.case_metadata = {
            **(record.case_metadata or {}),
            "title": payload.title,
            "title_source": "manual",
        }
        await session.commit()
        return await get_case_detail(session, case_id)


@router.get("/{case_id}/schema-state", response_model=SchemaStateResponse)
async def get_schema_state_route(
    case_id: str,
    session: DBSession,
    status_filter: StatusFilter = None,
) -> SchemaStateResponse:
    return await get_filtered_schema_state(session, case_id, status_filter)


class UpdateLanguagePayload(BaseModel):
    language: str


@router.put("/{case_id}/language", response_model=CaseDetail)
async def update_case_language_route(
    case_id: str,
    payload: UpdateLanguagePayload,
    session: DBSession,
) -> CaseDetail:
    from fastapi import HTTPException

    from app.cases.models import CaseFileRecord

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(status_code=404, detail="Case not found")

    metadata = dict(case_record.case_metadata or {})
    metadata["preferred_language"] = payload.language
    case_record.case_metadata = metadata
    await session.commit()
    await record_active_question_turn(session, case_id)
    return await get_case_detail(session, case_id)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case_route(
    case_id: str,
    session: DBSession,
) -> None:
    from fastapi import HTTPException

    from app.cases.models import CaseFileRecord

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(status_code=404, detail="Case not found")

    await session.delete(case_record)
    await session.commit()
