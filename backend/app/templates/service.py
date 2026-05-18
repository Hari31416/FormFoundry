from __future__ import annotations

from pathlib import Path

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.templates.models import (
    TemplateDefinition,
    TemplateDefinitionCreate,
    TemplateDefinitionRecord,
    TemplateField,
    TemplateFieldGroup,
)


def serialize_template(record: TemplateDefinitionRecord) -> TemplateDefinition:
    return TemplateDefinition(
        template_id=record.template_id,
        template_version=record.template_version,
        name=record.name,
        domain=record.domain,
        description=record.description,
        template_schema=[TemplateField.model_validate(item) for item in record.schema],
        field_groups=[
            TemplateFieldGroup.model_validate(item) for item in record.field_groups
        ],
        validation_rules=record.validation_rules,
        conversation_config=record.conversation_config,
        supported_artifacts=record.supported_artifacts,
        renderer_config=record.renderer_config,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def save_template_config_to_file(payload: TemplateDefinitionCreate) -> None:
    template_dir = get_settings().resolved_template_config_dir
    template_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"{payload.template_id}_v{payload.template_version}.json"
    file_path = template_dir / file_name

    import json

    data = json.loads(payload.model_dump_json(by_alias=True))
    file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


async def create_template(
    session: AsyncSession, payload: TemplateDefinitionCreate
) -> TemplateDefinition:
    record = TemplateDefinitionRecord(
        template_id=payload.template_id,
        template_version=payload.template_version,
        name=payload.name,
        domain=payload.domain,
        description=payload.description,
        schema=[field.model_dump(mode="json") for field in payload.template_schema],
        field_groups=[group.model_dump(mode="json") for group in payload.field_groups],
        validation_rules=payload.validation_rules,
        conversation_config=payload.conversation_config,
        supported_artifacts=payload.supported_artifacts,
        renderer_config=payload.renderer_config,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    try:
        save_template_config_to_file(payload)
    except Exception as e:
        import logging

        logger = logging.getLogger("app.templates.service")
        logger.warning(f"Failed to save template to disk: {e}")

    return serialize_template(record)


async def list_templates(session: AsyncSession) -> list[TemplateDefinition]:
    statement: Select[tuple[TemplateDefinitionRecord]] = select(
        TemplateDefinitionRecord
    ).order_by(
        TemplateDefinitionRecord.template_id,
        desc(TemplateDefinitionRecord.template_version),
    )
    records = (await session.execute(statement)).scalars().all()
    return [serialize_template(record) for record in records]


async def get_template(
    session: AsyncSession, template_id: str, template_version: int | None = None
) -> TemplateDefinitionRecord | None:
    statement = select(TemplateDefinitionRecord).where(
        TemplateDefinitionRecord.template_id == template_id
    )
    if template_version is not None:
        statement = statement.where(
            TemplateDefinitionRecord.template_version == template_version
        )
    else:
        statement = statement.order_by(
            desc(TemplateDefinitionRecord.template_version)
        ).limit(1)
    return (await session.execute(statement)).scalar_one_or_none()


async def get_template_definition(
    session: AsyncSession, template_id: str, template_version: int | None = None
) -> TemplateDefinition | None:
    record = await get_template(session, template_id, template_version)
    if record is None:
        return None
    return serialize_template(record)


def load_template_config_files() -> list[Path]:
    template_dir = get_settings().resolved_template_config_dir
    if not template_dir.exists():
        return []
    return sorted(template_dir.glob("*.json"))


def load_template_configs() -> list[TemplateDefinitionCreate]:
    templates: list[TemplateDefinitionCreate] = []
    for path in load_template_config_files():
        templates.append(
            TemplateDefinitionCreate.model_validate_json(
                path.read_text(encoding="utf-8")
            )
        )
    return templates


async def upsert_template_record(
    session: AsyncSession, payload: TemplateDefinitionCreate
) -> TemplateDefinitionRecord:
    record = await get_template(session, payload.template_id, payload.template_version)
    if record is None:
        record = TemplateDefinitionRecord(
            template_id=payload.template_id,
            template_version=payload.template_version,
        )
        session.add(record)

    record.name = payload.name
    record.domain = payload.domain
    record.description = payload.description
    record.schema = [field.model_dump(mode="json") for field in payload.template_schema]
    record.field_groups = [
        group.model_dump(mode="json") for group in payload.field_groups
    ]
    record.validation_rules = payload.validation_rules
    record.conversation_config = payload.conversation_config
    record.supported_artifacts = payload.supported_artifacts
    record.renderer_config = payload.renderer_config
    await session.flush()
    return record


async def ensure_seed_templates(session: AsyncSession) -> None:
    configured_templates = load_template_configs()
    configured_keys = {
        (template.template_id, template.template_version)
        for template in configured_templates
    }
    existing_records = (
        (await session.execute(select(TemplateDefinitionRecord))).scalars().all()
    )

    for record in existing_records:
        if (record.template_id, record.template_version) not in configured_keys:
            await session.delete(record)

    for payload in configured_templates:
        await upsert_template_record(session, payload)

    await session.commit()
