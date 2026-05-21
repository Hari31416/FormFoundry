from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord
from app.core.config import get_settings
from app.extraction.parsers.pdf import PdfValidationError, validate_pdf_page_limit
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

logger = logging.getLogger(__name__)


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
    logger.info(
        "intake.chat_answer.started",
        extra={"case_id": case_id, "created_by": created_by, "text_chars": len(text)},
    )
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
    logger.info(
        "intake.chat_answer.completed",
        extra={
            "case_id": case_id,
            "evidence_id": record.evidence_id,
            "job_id": job.job_id,
            "auto_run": get_settings().auto_run_jobs,
        },
    )
    return EvidenceIntakeResponse(
        evidence=serialize_evidence(record), job=refreshed_job or job
    )


async def create_text_evidence(
    session: AsyncSession, case_id: str, payload: TextEvidenceRequest
) -> EvidenceIntakeResponse:
    logger.info(
        "intake.text.started",
        extra={
            "case_id": case_id,
            "created_by": payload.created_by,
            "text_chars": len(payload.text),
        },
    )
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
    from app.conversation.service import record_turn

    await record_turn(
        session,
        case_id=case_id,
        role="user",
        message=f"Added note: {payload.text}",
        related_field_path=None,
        metadata={
            "kind": "text_evidence",
            "evidence_id": record.evidence_id,
            "created_by": payload.created_by,
        },
        commit=False,
    )
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
        try:
            from app.conversation.service import record_active_question_turn

            await record_active_question_turn(session, case_id)
        except Exception as err:
            logger.error(
                "intake.text.assistant_turn_failed",
                extra={"case_id": case_id, "error": str(err)},
            )
    await session.commit()
    refreshed_job = await get_job_payload(session, job.job_id)
    if refreshed_job is not None and refreshed_job.status == "failed":
        logger.warning(
            "intake.text.failed",
            extra={
                "case_id": case_id,
                "evidence_id": record.evidence_id,
                "job_id": job.job_id,
                "error": refreshed_job.error_summary,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=refreshed_job.error_summary or "OCR and data extraction failed.",
        )
    logger.info(
        "intake.text.completed",
        extra={
            "case_id": case_id,
            "evidence_id": record.evidence_id,
            "job_id": job.job_id,
        },
    )
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
    logger.info(
        "intake.upload.started",
        extra={
            "case_id": case_id,
            "upload_filename": upload.filename,
            "content_type": upload.content_type,
            "created_by": created_by,
        },
    )
    await ensure_case_exists(session, case_id)
    payload = await upload.read()
    if not payload:
        logger.warning(
            "intake.upload.empty_file",
            extra={"case_id": case_id, "upload_filename": upload.filename},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    content_type = upload.content_type or "application/octet-stream"
    suffix = Path(upload.filename or "upload.bin").suffix or ".bin"
    settings = get_settings()
    is_pdf = content_type == "application/pdf" or suffix.lower() == ".pdf"
    is_image = content_type.startswith("image/")
    if not is_pdf and not is_image:
        logger.warning(
            "intake.upload.unsupported_format",
            extra={
                "case_id": case_id,
                "upload_filename": upload.filename,
                "content_type": content_type,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image and PDF uploads are supported.",
        )

    parsed_payload: dict[str, Any] = {
        "filename": upload.filename,
        "size_bytes": len(payload),
    }
    if is_pdf:
        try:
            page_count = validate_pdf_page_limit(
                payload, max_pages=settings.pdf_ocr_max_pages
            )
        except PdfValidationError as exc:
            logger.warning(
                "intake.upload.pdf_validation_failed",
                extra={
                    "case_id": case_id,
                    "upload_filename": upload.filename,
                    "error": str(exc),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        parsed_payload["page_count"] = page_count

    source_type = (
        EvidenceSourceType.PDF_UPLOAD if is_pdf else EvidenceSourceType.IMAGE_UPLOAD
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
        parsed_payload={**parsed_payload, "size_bytes": stored.size_bytes},
        evidence_metadata={**(metadata or {}), "content_type": stored.content_type},
        source_refs=[],
        created_by=created_by,
    )
    session.add(record)
    await session.flush()
    from app.conversation.service import record_turn

    filename = upload.filename or "upload"
    await record_turn(
        session,
        case_id=case_id,
        role="user",
        message=f"Uploaded file: {filename}",
        related_field_path=None,
        metadata={
            "kind": "upload",
            "evidence_id": record.evidence_id,
            "filename": filename,
            "created_by": created_by,
        },
        commit=False,
    )
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
        try:
            from app.conversation.service import record_active_question_turn

            await record_active_question_turn(session, case_id)
        except Exception as err:
            logger.error(
                "intake.upload.assistant_turn_failed",
                extra={"case_id": case_id, "error": str(err)},
            )
    await session.commit()
    refreshed_job = await get_job_payload(session, job.job_id)
    if refreshed_job is not None and refreshed_job.status == "failed":
        logger.warning(
            "intake.upload.failed",
            extra={
                "case_id": case_id,
                "evidence_id": record.evidence_id,
                "job_id": job.job_id,
                "error": refreshed_job.error_summary,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=refreshed_job.error_summary or "OCR and data extraction failed.",
        )
    logger.info(
        "intake.upload.completed",
        extra={
            "case_id": case_id,
            "evidence_id": record.evidence_id,
            "job_id": job.job_id,
            "upload_filename": upload.filename,
            "size_bytes": len(payload),
        },
    )
    return EvidenceIntakeResponse(
        evidence=serialize_evidence(record), job=refreshed_job or job
    )


async def list_case_evidence(
    session: AsyncSession, case_id: str
) -> list[EvidencePayload]:
    logger.info("intake.list.started", extra={"case_id": case_id})
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
    logger.info(
        "intake.list.completed", extra={"case_id": case_id, "count": len(records)}
    )
    return [serialize_evidence(record) for record in records]
