from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import (
    CaseCreateRequest,
    CaseDetail,
    CaseFilePayload,
    CaseFileRecord,
    CaseStatus,
    FieldStatePayload,
    FieldStateRecord,
    FieldStateStatus,
    ReviewStatus,
    SchemaStateResponse,
)
from app.templates.service import get_template, serialize_template

logger = logging.getLogger(__name__)


def assign_nested_value(target: dict[str, Any], path: str, value: Any) -> None:
    cursor = target
    segments = path.split(".")
    for segment in segments[:-1]:
        cursor = cursor.setdefault(segment, {})
    cursor[segments[-1]] = value


def build_empty_schema_state(field_paths: list[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for path in field_paths:
        assign_nested_value(payload, path, None)
    return payload


def serialize_case(record: CaseFileRecord) -> CaseFilePayload:
    return CaseFilePayload(
        case_id=record.case_id,
        template_id=record.template_id,
        template_version=record.template_version,
        status=CaseStatus(record.status),
        created_by=record.created_by,
        current_schema_state=record.current_schema_state,
        review_status=ReviewStatus(record.review_status),
        approved_at=record.approved_at,
        metadata=record.case_metadata,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def serialize_field_state(record: FieldStateRecord) -> FieldStatePayload:
    return FieldStatePayload(
        field_path=record.field_path,
        resolved_value=record.resolved_value,
        status=FieldStateStatus(record.status),
        confidence=record.confidence,
        candidate_ids=record.candidate_ids,
        source_evidence_ids=record.source_evidence_ids,
        last_updated_by=record.last_updated_by,
        last_updated_at=record.last_updated_at,
    )


async def create_case(session: AsyncSession, payload: CaseCreateRequest) -> CaseDetail:
    logger.info(
        "cases.create.started",
        extra={
            "template_id": payload.template_id,
            "template_version": payload.template_version,
            "created_by": payload.created_by,
        },
    )
    template_record = await get_template(
        session, payload.template_id, payload.template_version
    )
    if template_record is None:
        logger.warning(
            "cases.create.failed_template_not_found",
            extra={
                "template_id": payload.template_id,
                "template_version": payload.template_version,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    field_paths = [field["path"] for field in template_record.schema]
    case_record = CaseFileRecord(
        template_id=template_record.template_id,
        template_version=template_record.template_version,
        status=CaseStatus.COLLECTING_INPUT,
        created_by=payload.created_by,
        current_schema_state=build_empty_schema_state(field_paths),
        review_status=ReviewStatus.NOT_READY,
        case_metadata=payload.metadata,
    )
    session.add(case_record)
    await session.flush()

    now = datetime.now(UTC)
    field_state_records = [
        FieldStateRecord(
            case_id=case_record.case_id,
            field_path=field_path,
            resolved_value=None,
            status=FieldStateStatus.MISSING,
            confidence=0.0,
            candidate_ids=[],
            source_evidence_ids=[],
            last_updated_by="system",
            last_updated_at=now,
        )
        for field_path in field_paths
    ]
    session.add_all(field_state_records)
    await session.commit()
    await session.refresh(case_record)

    logger.info(
        "cases.create.completed",
        extra={
            "case_id": case_record.case_id,
            "template_id": case_record.template_id,
            "template_version": case_record.template_version,
            "field_count": len(field_paths),
        },
    )

    return CaseDetail(
        **serialize_case(case_record).model_dump(),
        template=serialize_template(template_record),
        field_states=[serialize_field_state(record) for record in field_state_records],
    )


async def get_case_detail(session: AsyncSession, case_id: str) -> CaseDetail:
    logger.info("cases.get.started", extra={"case_id": case_id})
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        logger.warning("cases.get.not_found", extra={"case_id": case_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )

    template_record = await get_template(
        session, case_record.template_id, case_record.template_version
    )
    if template_record is None:
        logger.error(
            "cases.get.template_missing",
            extra={
                "case_id": case_id,
                "template_id": case_record.template_id,
                "template_version": case_record.template_version,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template missing"
        )

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

    logger.info(
        "cases.get.completed",
        extra={
            "case_id": case_record.case_id,
            "status": (
                case_record.status.value
                if hasattr(case_record.status, "value")
                else case_record.status
            ),
            "review_status": (
                case_record.review_status.value
                if hasattr(case_record.review_status, "value")
                else case_record.review_status
            ),
            "field_state_count": len(field_states),
        },
    )

    return CaseDetail(
        **serialize_case(case_record).model_dump(),
        template=serialize_template(template_record),
        field_states=[serialize_field_state(record) for record in field_states],
    )


async def list_cases(
    session: AsyncSession,
    template_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[CaseFilePayload]:
    logger.info(
        "cases.list.started",
        extra={"template_id": template_id, "limit": limit, "offset": offset},
    )
    stmt = select(CaseFileRecord).order_by(CaseFileRecord.created_at.desc())
    if template_id:
        stmt = stmt.where(CaseFileRecord.template_id == template_id)

    stmt = stmt.limit(limit).offset(offset)
    records = (await session.execute(stmt)).scalars().all()
    logger.info(
        "cases.list.completed",
        extra={
            "template_id": template_id,
            "limit": limit,
            "offset": offset,
            "returned_count": len(records),
        },
    )
    return [serialize_case(record) for record in records]


async def get_schema_state(session: AsyncSession, case_id: str) -> SchemaStateResponse:
    return await get_filtered_schema_state(session, case_id, statuses=None)


async def get_filtered_schema_state(
    session: AsyncSession, case_id: str, statuses: list[str] | None
) -> SchemaStateResponse:
    detail = await get_case_detail(session, case_id)
    field_states = detail.field_states
    if statuses:
        allowed = set(statuses)
        field_states = [
            field_state
            for field_state in detail.field_states
            if field_state.status in allowed
        ]
    return SchemaStateResponse(
        case_id=detail.case_id,
        template_id=detail.template_id,
        template_version=detail.template_version,
        current_schema_state=detail.current_schema_state,
        field_states=field_states,
        field_groups=detail.template.field_groups,
    )
