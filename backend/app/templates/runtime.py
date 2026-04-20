from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.templates.models import TemplateField


def get_value_by_path(payload: Mapping[str, Any], path: str) -> Any | None:
    cursor: Any = payload
    for segment in path.split("."):
        if not isinstance(cursor, Mapping) or segment not in cursor:
            return None
        cursor = cursor[segment]
    return cursor


def is_field_active(field: TemplateField, schema_state: Mapping[str, Any]) -> bool:
    conditions = field.conditions or {}
    depends_on = conditions.get("depends_on")
    if not depends_on:
        return True

    actual_value = get_value_by_path(schema_state, depends_on)
    if "equals" in conditions:
        return actual_value == conditions["equals"]
    if "not_equals" in conditions:
        return actual_value != conditions["not_equals"]
    return bool(actual_value)
