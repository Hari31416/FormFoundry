from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord
from app.core.config import get_settings
from app.extraction.service import run_extraction_job
from app.intake.models import (
    EvidenceIntakeResponse,
    EvidencePayload,
    EvidenceRecord,
    EvidenceSourceType,
    TextEvidenceRequest,
)
from app.jobs.queue import enqueue_job, get_job_payload
from app.storage.minio import get_storage_service


def serialize_evidence(record: EvidenceRecord) -> EvidencePayload:
    return EvidencePayload(
        evidence_id=record.evidence_id,
        case_id=record.case_id,
        source_type=EvidenceSourceType(record.source_type),
        source_subtype=record.source_subtype,
        storage_uri=record.storage_uri,
        raw_text=record.raw_text,
        parsed_payload=record.parsed_payload,
        metadata=record.evidence_metadata,
        source_refs=record.source_refs,
        created_by=record.created_by,
        created_at=record.created_at,
    )


async def ensure_case_exists(session: AsyncSession, case_id: str) -> CaseFileRecord:
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    return case_record


async def create_chat_answer_evidence(
    session: AsyncSession,
    case_id: str,
    *,
    text: str,
    created_by: str,
    metadata: dict[str, Any] | None = None,
) -> EvidenceIntakeResponse:
    await ensure_case_exists(session, case_id)
    storage = get_storage_service()
    object_key = f"cases/{case_id}/conversation/{uuid4()}-{created_by}-answer.txt"
    stored = await storage.store_bytes(
        object_key=object_key,
        payload=text.encode("utf-8"),
        content_type="text/plain",
    )
    record = EvidenceRecord(
        case_id=case_id,
        source_type=EvidenceSourceType.CHAT_ANSWER,
        source_subtype="conversation_turn",
        storage_uri=stored.storage_uri,
        raw_text=text,
        parsed_payload={"length": len(text)},
        evidence_metadata={**(metadata or {}), "content_type": stored.content_type},
        source_refs=[],
        created_by=created_by,
    )
    session.add(record)
    await session.flush()
    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="extract_case_evidence",
        triggering_event="conversation.answer.created",
        metadata={"evidence_id": record.evidence_id},
    )
    if get_settings().auto_run_jobs:
        await run_extraction_job(
            session,
            case_id=case_id,
            job_id=job.job_id,
            evidence_ids=[record.evidence_id],
        )
    await session.commit()
    refreshed_job = await get_job_payload(session, job.job_id)
    return EvidenceIntakeResponse(
        evidence=serialize_evidence(record), job=refreshed_job or job
    )


async def create_text_evidence(
    session: AsyncSession, case_id: str, payload: TextEvidenceRequest
) -> EvidenceIntakeResponse:
    await ensure_case_exists(session, case_id)
    storage = get_storage_service()
    object_key = f"cases/{case_id}/evidence/{uuid4()}-{payload.created_by}-note.txt"
    stored = await storage.store_bytes(
        object_key=object_key,
        payload=payload.text.encode("utf-8"),
        content_type="text/plain",
    )
    record = EvidenceRecord(
        case_id=case_id,
        source_type=EvidenceSourceType.USER_TEXT,
        source_subtype="freeform_note",
        storage_uri=stored.storage_uri,
        raw_text=payload.text,
        parsed_payload={"length": len(payload.text)},
        evidence_metadata={**payload.metadata, "content_type": stored.content_type},
        source_refs=[],
        created_by=payload.created_by,
    )
    session.add(record)
    await session.flush()
    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="extract_case_evidence",
        triggering_event="evidence.text.created",
        metadata={"evidence_id": record.evidence_id},
    )
    if get_settings().auto_run_jobs:
        await run_extraction_job(
            session,
            case_id=case_id,
            job_id=job.job_id,
            evidence_ids=[record.evidence_id],
        )
    await session.commit()
    refreshed_job = await get_job_payload(session, job.job_id)
    return EvidenceIntakeResponse(
        evidence=serialize_evidence(record), job=refreshed_job or job
    )


async def create_upload_evidence(
    session: AsyncSession,
    case_id: str,
    upload: UploadFile,
    *,
    created_by: str,
    metadata: dict[str, Any] | None = None,
) -> EvidenceIntakeResponse:
    await ensure_case_exists(session, case_id)
    payload = await upload.read()
    content_type = upload.content_type or "application/octet-stream"
    suffix = Path(upload.filename or "upload.bin").suffix or ".bin"
    source_type = (
        EvidenceSourceType.PDF_UPLOAD
        if content_type == "application/pdf"
        else EvidenceSourceType.IMAGE_UPLOAD
    )
    storage = get_storage_service()
    object_key = (
        f"cases/{case_id}/uploads/"
        f"{uuid4()}-{source_type.value}-{Path(upload.filename or 'upload').stem}{suffix}"
    )
    stored = await storage.store_bytes(
        object_key=object_key,
        payload=payload,
        content_type=content_type,
    )
    record = EvidenceRecord(
        case_id=case_id,
        source_type=source_type,
        source_subtype=upload.filename or "upload",
        storage_uri=stored.storage_uri,
        raw_text=None,
        parsed_payload={"filename": upload.filename, "size_bytes": stored.size_bytes},
        evidence_metadata={**(metadata or {}), "content_type": stored.content_type},
        source_refs=[],
        created_by=created_by,
    )
    session.add(record)
    await session.flush()
    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="extract_case_evidence",
        triggering_event="evidence.upload.created",
        metadata={"evidence_id": record.evidence_id},
    )
    if get_settings().auto_run_jobs:
        await run_extraction_job(
            session,
            case_id=case_id,
            job_id=job.job_id,
            evidence_ids=[record.evidence_id],
        )
    await session.commit()
    refreshed_job = await get_job_payload(session, job.job_id)
    return EvidenceIntakeResponse(
        evidence=serialize_evidence(record), job=refreshed_job or job
    )


async def list_case_evidence(
    session: AsyncSession, case_id: str
) -> list[EvidencePayload]:
    await ensure_case_exists(session, case_id)
    records = (
        (
            await session.execute(
                select(EvidenceRecord)
                .where(EvidenceRecord.case_id == case_id)
                .order_by(EvidenceRecord.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [serialize_evidence(record) for record in records]
