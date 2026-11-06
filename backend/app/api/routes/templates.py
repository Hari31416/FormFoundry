from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import SchemaAccessRecord
from app.auth.service import CurrentUser
from app.db import get_db_session
from app.templates.models import (
    TemplateDefinition,
    TemplateDefinitionCreate,
    TemplateDefinitionRecord,
)
from app.templates.service import (
    create_template,
    get_template,
    get_template_definition,
    list_templates,
    save_template_config_to_file,
    serialize_template,
    upsert_template_record,
)

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.post("", response_model=TemplateDefinition, status_code=status.HTTP_201_CREATED)
async def create_template_route(
    payload: TemplateDefinitionCreate, session: DBSession
) -> TemplateDefinition:
    return await create_template(session, payload)


@router.get("", response_model=list[TemplateDefinition])
async def list_templates_route(
    session: DBSession, user: CurrentUser
) -> list[TemplateDefinition]:
    templates = await list_templates(session)
    if user.role == "admin":
        return templates
    allowed = set(
        (
            await session.scalars(
                select(SchemaAccessRecord.template_id).where(
                    SchemaAccessRecord.user_id == user.id
                )
            )
        ).all()
    )
    return [template for template in templates if template.template_id in allowed]


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


@router.put(
    "/{template_id}/versions/{template_version}", response_model=TemplateDefinition
)
async def update_template_route(
    template_id: str,
    template_version: int,
    payload: TemplateDefinitionCreate,
    session: DBSession,
) -> TemplateDefinition:
    if (
        payload.template_id != template_id
        or payload.template_version != template_version
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template ID and version in path must match request body.",
        )

    record = await get_template(session, template_id, template_version)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template version not found.",
        )

    updated_record = await upsert_template_record(session, payload)
    await session.commit()

    try:
        save_template_config_to_file(payload)
    except Exception as e:
        import logging

        logger = logging.getLogger("app.templates.api")
        logger.warning(f"Failed to update template config on disk: {e}")

    return serialize_template(updated_record)


@router.delete(
    "/{template_id}/versions/{template_version}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_template_route(
    template_id: str,
    template_version: int,
    session: DBSession,
) -> None:
    from sqlalchemy import func, select

    from app.cases.models import CaseFileRecord

    statement = (
        select(func.count())
        .select_from(CaseFileRecord)
        .where(
            CaseFileRecord.template_id == template_id,
            CaseFileRecord.template_version == template_version,
        )
    )
    case_count = (await session.execute(statement)).scalar() or 0
    if case_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete template because it is used by {case_count} cases.",
        )

    record = await get_template(session, template_id, template_version)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template version not found."
        )

    await session.delete(record)
    await session.flush()
    remaining = await session.scalar(
        select(TemplateDefinitionRecord.template_id)
        .where(TemplateDefinitionRecord.template_id == template_id)
        .limit(1)
    )
    if remaining is None:
        await session.execute(
            delete(SchemaAccessRecord).where(
                SchemaAccessRecord.template_id == template_id
            )
        )
    await session.commit()

    try:
        from app.core.config import get_settings

        template_dir = get_settings().resolved_template_config_dir
        for name in [f"{template_id}_v{template_version}.json", f"{template_id}.json"]:
            file_path = template_dir / name
            if file_path.exists():
                file_path.unlink()
    except Exception as e:
        import logging

        logger = logging.getLogger("app.templates.api")
        logger.warning(f"Failed to delete template config on disk: {e}")
