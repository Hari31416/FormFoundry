from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseCreateRequest, CaseDetail, SchemaStateResponse
from app.cases.service import create_case, get_case_detail, get_schema_state
from app.db import get_db_session

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


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
    case_id: str, session: DBSession
) -> SchemaStateResponse:
    return await get_schema_state(session, case_id)
