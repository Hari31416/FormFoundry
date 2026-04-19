from __future__ import annotations

from collections import defaultdict
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
    if isinstance(value, str):
        return value.strip().lower()
    return str(value).strip().lower()


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
    unresolved_required = False
    required_fields = {
        field["path"]: bool(field.get("required")) for field in template_record.schema
    }

    for field_state in field_states:
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
        chosen_candidates = field_candidates

        if len(grouped) == 1 and qualifying:
            chosen_candidates = max(
                grouped.values(), key=lambda items: items[0].confidence
            )
            winner = chosen_candidates[0]
            resolved_value = winner.candidate_value
            confidence = winner.confidence
            status = FieldStateStatus.PROPOSED
            decision = "selected"
            summary = "Selected the highest-confidence unambiguous candidate."
        elif len(grouped) > 1:
            status = FieldStateStatus.CONFLICTED
            decision = "conflicted"
            summary = "Multiple high-confidence candidates disagree materially."

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

        if required_fields.get(field_state.field_path) and status in {
            FieldStateStatus.MISSING,
            FieldStateStatus.CONFLICTED,
        }:
            unresolved_required = True

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

    case_record.current_schema_state = schema_state
    case_record.status = (
        CaseStatus.AWAITING_USER if unresolved_required else CaseStatus.READY_FOR_REVIEW
    )
    case_record.review_status = (
        ReviewStatus.NOT_READY if unresolved_required else ReviewStatus.NEEDS_REVIEW
    )
    await session.flush()
