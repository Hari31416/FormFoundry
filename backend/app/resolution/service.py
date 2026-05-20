from __future__ import annotations

import ast
import operator
import re
from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import (
    CaseFileRecord,
    CaseStatus,
    FieldStateRecord,
    FieldStateStatus,
    ReviewStatus,
)
from app.core.config import get_settings
from app.extraction.models import FieldCandidateRecord
from app.resolution.models import ResolutionAuditRecord
from app.templates.models import TemplateDefinitionRecord


def normalize_candidate_value(value: Any) -> str:
    if isinstance(value, list):
        import json

        normalized_items = sorted(str(item).strip().lower() for item in value)
        return json.dumps(normalized_items)
    if isinstance(value, str):
        return value.strip().lower()
    return str(value).strip().lower()


# Supported AST operators
operators = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}


def evaluate_calculation(expr: str, schema_state: Mapping[str, Any]) -> Any | None:
    vars_found = re.findall(r"\{([^}]+)\}", expr)
    context = {}
    replaced_expr = expr
    for idx, path in enumerate(vars_found):
        from app.templates.runtime import get_value_by_path

        val = get_value_by_path(schema_state, path)
        var_name = f"v_{idx}"
        context[var_name] = val
        replaced_expr = replaced_expr.replace(f"{{{path}}}", var_name)

    try:
        tree = ast.parse(replaced_expr, mode="eval")

        def eval_node(node):
            if isinstance(node, ast.Expression):
                return eval_node(node.body)
            if isinstance(node, ast.Num):
                return node.n
            if isinstance(node, ast.Str):
                return node.s
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.Name):
                if node.id in context:
                    return context[node.id]
                raise NameError(f"Undefined variable: {node.id}")
            if isinstance(node, ast.BinOp):
                left = eval_node(node.left)
                right = eval_node(node.right)
                if left is None or right is None:
                    return None
                return operators[type(node.op)](left, right)
            if isinstance(node, ast.UnaryOp):
                operand = eval_node(node.operand)
                if operand is None:
                    return None
                return operators[type(node.op)](operand)
            if isinstance(node, ast.Compare):
                left = eval_node(node.left)
                if left is None:
                    return None
                for op, comparator in zip(node.ops, node.comparators, strict=False):
                    right = eval_node(comparator)
                    if right is None:
                        return None
                    if not operators[type(op)](left, right):
                        return False
                    left = right
                return True
            raise TypeError(f"Unsupported syntax node: {type(node).__name__}")

        return eval_node(tree)
    except Exception as e:
        import logging

        logger = logging.getLogger("app.templates.calculation")
        logger.warning(f"Failed to evaluate expression '{expr}': {e}")
        return None


def assign_nested_value(target: dict[str, Any], path: str, value: Any) -> None:
    cursor = target
    segments = path.split(".")
    for segment in segments[:-1]:
        cursor = cursor.setdefault(segment, {})
    cursor[segments[-1]] = value


async def resolve_case_fields(session: AsyncSession, case_id: str) -> None:
    settings = get_settings()
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        return

    template_record = (
        await session.execute(
            select(TemplateDefinitionRecord).where(
                TemplateDefinitionRecord.template_id == case_record.template_id,
                TemplateDefinitionRecord.template_version
                == case_record.template_version,
            )
        )
    ).scalar_one()
    field_states = (
        (
            await session.execute(
                select(FieldStateRecord)
                .where(FieldStateRecord.case_id == case_id)
                .order_by(FieldStateRecord.field_path)
            )
        )
        .scalars()
        .all()
    )
    candidates = (
        (
            await session.execute(
                select(FieldCandidateRecord)
                .where(FieldCandidateRecord.case_id == case_id)
                .order_by(
                    FieldCandidateRecord.field_path,
                    FieldCandidateRecord.confidence.desc(),
                )
            )
        )
        .scalars()
        .all()
    )
    candidates_by_field: dict[str, list[FieldCandidateRecord]] = defaultdict(list)
    for candidate in candidates:
        candidates_by_field[candidate.field_path].append(candidate)

    await session.execute(
        delete(ResolutionAuditRecord).where(ResolutionAuditRecord.case_id == case_id)
    )

    schema_state: dict[str, Any] = {}
    required_fields = {
        field["path"]: bool(field.get("required")) for field in template_record.schema
    }
    calculations_by_path = {
        field["path"]: field.get("calculation")
        for field in template_record.schema
        if field.get("calculation") is not None
    }

    for field_state in field_states:
        if field_state.status == FieldStateStatus.CONFIRMED:
            assign_nested_value(
                schema_state, field_state.field_path, field_state.resolved_value
            )
            continue

        if calculations_by_path.get(field_state.field_path) is not None:
            field_state.resolved_value = None
            field_state.status = FieldStateStatus.MISSING
            field_state.confidence = 0.0
            assign_nested_value(schema_state, field_state.field_path, None)
            continue

        field_candidates = candidates_by_field.get(field_state.field_path, [])
        qualifying = [
            candidate
            for candidate in field_candidates
            if candidate.confidence >= settings.resolution_threshold
        ]
        grouped: dict[str, list[FieldCandidateRecord]] = defaultdict(list)
        for candidate in qualifying:
            grouped[normalize_candidate_value(candidate.candidate_value)].append(
                candidate
            )

        decision = "missing"
        summary = "No candidate met the resolver threshold."
        resolved_value: Any | None = None
        status = FieldStateStatus.MISSING
        confidence = max(
            (candidate.confidence for candidate in field_candidates), default=0.0
        )
        source_evidence_ids: list[str] = sorted(
            {
                evidence_id
                for candidate in field_candidates
                for evidence_id in candidate.source_evidence_ids
            }
        )

        if qualifying:
            # Group candidates by their normalized value and sort by max confidence, then frequency
            sorted_groups = sorted(
                grouped.items(),
                key=lambda x: (max(c.confidence for c in x[1]), len(x[1])),
                reverse=True,
            )

            top_value, top_candidates = sorted_groups[0]
            top_max_conf = max(c.confidence for c in top_candidates)

            is_clear_winner = False
            if len(sorted_groups) == 1:
                is_clear_winner = True
            else:
                _, second_candidates = sorted_groups[1]
                second_max_conf = max(c.confidence for c in second_candidates)

                # Winner if significantly higher confidence OR significantly more evidence
                confidence_gap = top_max_conf - second_max_conf
                frequency_lead = len(top_candidates) >= 2 * len(second_candidates)

                if confidence_gap >= 0.05 or frequency_lead:
                    is_clear_winner = True

            if is_clear_winner:
                # Pick the highest confidence item in the winning group
                winner = max(top_candidates, key=lambda c: c.confidence)
                resolved_value = winner.candidate_value
                confidence = winner.confidence
                status = FieldStateStatus.PROPOSED
                decision = "selected"
                summary = "Selected the best-supported candidate group."
            else:
                status = FieldStateStatus.CONFLICTED
                decision = "conflicted"
                summary = (
                    "Multiple competing high-confidence candidate groups disagree."
                )
        else:
            # Fallback for when no candidates meet threshold but we want to show best guess
            if field_candidates:
                summary = "Best guess selection (below threshold)."
            else:
                summary = "No candidates found at all."

        field_state.resolved_value = resolved_value
        field_state.status = status
        field_state.confidence = confidence
        field_state.candidate_ids = [
            candidate.candidate_id for candidate in field_candidates
        ]
        field_state.source_evidence_ids = source_evidence_ids
        field_state.last_updated_by = "resolver"
        field_state.last_updated_at = datetime.now(UTC)

        assign_nested_value(schema_state, field_state.field_path, resolved_value)

        session.add(
            ResolutionAuditRecord(
                case_id=case_id,
                field_path=field_state.field_path,
                decision=decision,
                resolved_value=resolved_value,
                candidate_ids=[
                    candidate.candidate_id for candidate in field_candidates
                ],
                source_evidence_ids=source_evidence_ids,
                summary=summary,
            )
        )

    # Iterative calculation passes for computed fields
    computed_fields = [
        fs for fs in field_states if calculations_by_path.get(fs.field_path) is not None
    ]
    for _ in range(5):
        any_changed = False
        for fs in computed_fields:
            expr = calculations_by_path[fs.field_path]
            computed = evaluate_calculation(expr, schema_state)
            if computed != fs.resolved_value:
                fs.resolved_value = computed
                if computed is not None:
                    fs.status = FieldStateStatus.PROPOSED
                    fs.confidence = 1.0
                    fs.last_updated_by = "calculation"
                    fs.last_updated_at = datetime.now(UTC)
                else:
                    fs.status = FieldStateStatus.MISSING
                    fs.confidence = 0.0
                assign_nested_value(schema_state, fs.field_path, computed)
                any_changed = True
        if not any_changed:
            break

    # Determine unresolved required status across all fields (including computed)
    unresolved_required = False
    for fs in field_states:
        if required_fields.get(fs.field_path) and fs.status in {
            FieldStateStatus.MISSING,
            FieldStateStatus.CONFLICTED,
        }:
            unresolved_required = True

    case_record.current_schema_state = schema_state
    case_record.status = (
        CaseStatus.AWAITING_USER if unresolved_required else CaseStatus.READY_FOR_REVIEW
    )
    case_record.review_status = (
        ReviewStatus.NOT_READY if unresolved_required else ReviewStatus.NEEDS_REVIEW
    )
    await session.flush()
