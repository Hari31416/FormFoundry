from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFilePayload, FieldStatePayload
from app.cases.service import serialize_field_state
from app.db import get_db_session
from app.validation.models import (
    FieldConfirmRequest,
    FieldEditRequest,
    ReviewResponse,
    ValidationIssuePayload,
)
from app.validation.service import (
    approve_case,
    confirm_field,
    edit_field,
    get_review_payload,
    get_validation_issues,
)

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.get("/cases/{case_id}/validation", response_model=list[ValidationIssuePayload])
async def get_validation_route(
    case_id: str, session: DBSession
) -> list[ValidationIssuePayload]:
    return await get_validation_issues(session, case_id)


@router.get("/cases/{case_id}/review", response_model=ReviewResponse)
async def get_review_route(case_id: str, session: DBSession) -> ReviewResponse:
    return await get_review_payload(session, case_id)


@router.post(
    "/cases/{case_id}/fields/{field_path}/edit", response_model=FieldStatePayload
)
async def edit_field_route(
    case_id: str,
    field_path: str,
    payload: FieldEditRequest,
    session: DBSession,
) -> FieldStatePayload:
    field_state = await edit_field(session, case_id, field_path, payload)
    return serialize_field_state(field_state)


@router.post(
    "/cases/{case_id}/fields/{field_path}/confirm", response_model=FieldStatePayload
)
async def confirm_field_route(
    case_id: str,
    field_path: str,
    payload: FieldConfirmRequest,
    session: DBSession,
) -> FieldStatePayload:
    field_state = await confirm_field(session, case_id, field_path, payload)
    return serialize_field_state(field_state)


@router.post("/cases/{case_id}/approve", response_model=CaseFilePayload)
async def approve_case_route(case_id: str, session: DBSession) -> CaseFilePayload:
    return await approve_case(session, case_id)
