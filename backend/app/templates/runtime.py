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


def evaluate_condition(
    rule: Mapping[str, Any], schema_state: Mapping[str, Any]
) -> bool:
    if not isinstance(rule, Mapping):
        return bool(rule)

    if "operator" in rule:
        op = rule["operator"].lower()
        sub_rules = rule.get("rules", [])
        if op == "and":
            return all(evaluate_condition(r, schema_state) for r in sub_rules)
        if op == "or":
            return any(evaluate_condition(r, schema_state) for r in sub_rules)
        if op == "not":
            if sub_rules:
                return not evaluate_condition(sub_rules[0], schema_state)
            rule_data = rule.get("rule")
            if rule_data:
                return not evaluate_condition(rule_data, schema_state)
            return True

    depends_on = rule.get("depends_on")
    if not depends_on:
        return True

    actual_value = get_value_by_path(schema_state, depends_on)

    if "equals" in rule:
        return actual_value == rule["equals"]
    if "not_equals" in rule:
        return actual_value != rule["not_equals"]

    if "op" in rule or "operator" in rule:
        op_val = (rule.get("op") or rule.get("operator", "")).lower()
        val = rule.get("value")
        if op_val in ("equals", "eq"):
            return actual_value == val
        if op_val in ("not_equals", "neq"):
            return actual_value != val
        if op_val in ("in", "contains"):
            return isinstance(val, list) and actual_value in val
        if op_val in ("not_in", "not_contains"):
            return isinstance(val, list) and actual_value not in val

        if val is None:
            return False
        if actual_value is not None:
            try:
                act_num = float(actual_value)
                val_num = float(val)
                if op_val in ("gt", "greater_than"):
                    return act_num > val_num
                if op_val in ("gte", "greater_than_or_equals"):
                    return act_num >= val_num
                if op_val in ("lt", "less_than"):
                    return act_num < val_num
                if op_val in ("lte", "less_than_or_equals"):
                    return act_num <= val_num
            except (ValueError, TypeError):
                return False

    return bool(actual_value)


def is_field_active(field: TemplateField, schema_state: Mapping[str, Any]) -> bool:
    conditions = field.conditions or {}
    if not conditions:
        return True
    return evaluate_condition(conditions, schema_state)
