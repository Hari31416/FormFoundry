from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import (
    CaseCreateRequest,
    CaseDetail,
    CaseFilePayload,
    SchemaStateResponse,
)
from app.cases.service import (
    create_case,
    get_case_detail,
    get_filtered_schema_state,
    list_cases,
)
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
    return await create_case(session, payload)


@router.get("/{case_id}", response_model=CaseDetail)
async def get_case_route(case_id: str, session: DBSession) -> CaseDetail:
    return await get_case_detail(session, case_id)


@router.get("/{case_id}/schema-state", response_model=SchemaStateResponse)
async def get_schema_state_route(
    case_id: str,
    session: DBSession,
    status_filter: StatusFilter = None,
) -> SchemaStateResponse:
    return await get_filtered_schema_state(session, case_id, status_filter)
