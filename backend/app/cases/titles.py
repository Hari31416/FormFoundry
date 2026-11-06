"""Persistent case titles independent of any particular intake schema."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord, FieldStateRecord, FieldStateStatus
from app.llm import generate_json
from app.prompts import render_prompt
from app.templates.models import TemplateDefinitionRecord, TemplateField
from app.templates.runtime import is_field_active

logger = logging.getLogger(__name__)
TITLE_LIMIT = 160
PLACEHOLDER = re.compile(r"\{([^{}]+)\}")


def clean_title(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return " ".join(value.split())[:TITLE_LIMIT] or None


async def refresh_case_title(
    session: AsyncSession,
    case: CaseFileRecord,
    template: TemplateDefinitionRecord,
    states: Sequence[FieldStateRecord],
) -> None:
    metadata = dict(case.case_metadata or {})
    if metadata.get("title_source") == "manual":
        return
    values = {
        state.field_path: state.resolved_value
        for state in states
        if state.status in (FieldStateStatus.PROPOSED, FieldStateStatus.CONFIRMED)
        and state.resolved_value is not None
        and state.resolved_value != ""
    }
    pattern = template.conversation_config.get("title_pattern", "").strip()
    if pattern:
        paths = PLACEHOLDER.findall(pattern)
        # Wait for every placeholder, rather than displaying partial punctuation.
        if not all(path in values for path in paths):
            metadata.pop("title", None)
            metadata.pop("title_source", None)
        else:
            metadata["title"] = clean_title(
                PLACEHOLDER.sub(lambda match: str(values[match[1]]), pattern)
            )
            metadata["title_source"] = "pattern"
        case.case_metadata = metadata
        return
    if clean_title(metadata.get("title")):
        return

    fields = [TemplateField.model_validate(item) for item in template.schema]
    eligible = [
        field
        for field in fields
        if field.sensitivity == "standard"
        and field.type not in ("object", "list_of_objects")
        and is_field_active(field, case.current_schema_state)
    ]
    captured = [
        {"label": field.label, "value": str(values[field.path])[:300]}
        for field in eligible
        if field.path in values
    ][:12]
    # A one-field schema can still produce a useful title.
    if not captured or len(captured) < min(2, len(eligible)):
        return
    try:
        response = await asyncio.wait_for(
            generate_json(
                system_prompt=render_prompt("case_title_system.jinja2"),
                user_prompt=render_prompt(
                    "case_title_user.jinja2",
                    template_name=template.name,
                    fields_json=json.dumps(captured, ensure_ascii=False),
                ),
            ),
            timeout=10,
        )
        title = clean_title(response.get("title")) if response else None
    except Exception:
        # A title is optional; extraction and answering must still succeed.
        logger.warning("cases.title_generation.failed", extra={"case_id": case.case_id})
        return
    if title:
        # Re-read metadata after the network call so a user rename takes precedence.
        await session.refresh(case, attribute_names=["case_metadata"])
        metadata = dict(case.case_metadata or {})
        if metadata.get("title_source") != "manual" and not clean_title(
            metadata.get("title")
        ):
            case.case_metadata = {**metadata, "title": title, "title_source": "ai"}
