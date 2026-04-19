from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.templates.models import TemplateDefinition, TemplateDefinitionCreate
from app.templates.service import (
    create_template,
    get_template_definition,
    list_templates,
)

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.post("", response_model=TemplateDefinition, status_code=status.HTTP_201_CREATED)
async def create_template_route(
    payload: TemplateDefinitionCreate, session: DBSession
) -> TemplateDefinition:
    return await create_template(session, payload)


@router.get("", response_model=list[TemplateDefinition])
async def list_templates_route(session: DBSession) -> list[TemplateDefinition]:
    return await list_templates(session)


@router.get("/{template_id}", response_model=TemplateDefinition)
async def get_template_route(
    template_id: str,
    session: DBSession,
    template_version: int | None = Query(default=None),
) -> TemplateDefinition:
    template = await get_template_definition(session, template_id, template_version)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    return template
