from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord
from app.core.config import get_settings
from app.extraction.contracts import FieldCandidate
from app.extraction.models import FieldCandidateRecord
from app.extraction.ocr.adapter import extract_text_from_image_bytes
from app.extraction.parsers.pdf import render_pdf_pages_to_png
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.jobs.models import JobRecord, JobStatus
from app.llm import generate_json
from app.resolution.service import resolve_case_fields
from app.storage.minio import get_storage_service
from app.templates.models import TemplateDefinition, TemplateField
from app.templates.service import get_template_definition

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CandidateProposal:
    field_path: str
    candidate_value: Any
    confidence: float
    rationale: str
    extractor_type: str
    source_quote: str | None = None


def chunk_text(text: str, *, max_chars: int = 1200) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []
    return [
        normalized[index : index + max_chars]
        for index in range(0, len(normalized), max_chars)
    ]


def clamp_confidence(value: Any, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(parsed, 1.0))


def parse_date(value: str) -> str | None:
    raw = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return raw
    match = re.fullmatch(r"(\d{2})[/-](\d{2})[/-](\d{4})", raw)
    if match:
        day, month, year = match.groups()
        return f"{year}-{month}-{day}"
    return None


def normalize_enum_value(raw: Any, allowed_values: list[str]) -> str | None:
    value = str(raw).strip().lower().replace(" ", "_")
    aliases: dict[str, str] = {}
    for option in allowed_values:
        aliases[option.lower()] = option
        aliases[option.replace("_", " ").lower()] = option
    return aliases.get(value) or aliases.get(value.replace("_", " "))


def coerce_candidate_value(field: TemplateField, value: Any) -> Any | None:
    if value is None:
        return None

    if field.type == "string":
        text = str(value).strip()
        return text or None
    if field.type == "date":
        return parse_date(str(value))
    if field.type == "boolean":
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"true", "yes", "y", "1", "known", "present"}:
            return True
        if normalized in {"false", "no", "n", "0", "unknown", "absent", "not known"}:
            return False
        return None
    if field.type == "integer":
        try:
            return int(str(value).replace(",", "").strip())
        except ValueError:
            return None
    if field.type == "number":
        sanitized = (
            str(value)
            .replace(",", "")
            .replace("INR", "")
            .replace("Rs.", "")
            .replace("Rs", "")
            .strip()
        )
        try:
            return float(sanitized)
        except ValueError:
            return None
    if field.type == "enum":
        return normalize_enum_value(value, field.enum_options)
    return value


def format_field_catalog(template: TemplateDefinition) -> str:
    lines: list[str] = []
    for field in template.template_schema:
        required = "required" if field.required else "optional"
        enum_options = (
            f" Allowed values: {', '.join(field.enum_options)}."
            if field.enum_options
            else ""
        )
        help_text = f" Help: {field.help_text}." if field.help_text else ""
        lines.append(
            f"- {field.path}: {field.label} ({field.type}, {required}).{enum_options}{help_text}"
        )
    return "\n".join(lines)


async def extract_candidates_with_llm(
    template: TemplateDefinition,
    text: str,
) -> list[CandidateProposal]:
    started_at = perf_counter()
    field_lookup = {field.path: field for field in template.template_schema}
    log_context = {
        "template_id": template.template_id,
        "template_version": template.template_version,
        "field_count": len(template.template_schema),
        "source_text_chars": len(text),
    }
    logger.info("extraction.llm_candidates.started", extra=log_context)
    response = await generate_json(
        system_prompt=(
            "You extract structured form field candidates from evidence text. "
            'Return JSON only with the shape {"candidates": [...]} where each candidate contains '
            "field_path, candidate_value, confidence, rationale, and optional source_quote. "
            "Only include candidates directly supported by the evidence text."
        ),
        user_prompt=(
            f"Template: {template.name}\n"
            f"Field catalog:\n{format_field_catalog(template)}\n\n"
            "Source text:\n"
            f"{text}"
        ),
    )
    if response is None:
        logger.error(
            "extraction.llm_candidates.failed",
            extra={
                **log_context,
                "reason": "llm_response_missing",
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            },
        )
        raise RuntimeError("LLM extraction did not return a valid response.")

    raw_candidates = response.get("candidates")
    if not isinstance(raw_candidates, list):
        logger.error(
            "extraction.llm_candidates.failed",
            extra={
                **log_context,
                "reason": "candidates_list_missing",
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "response_keys": sorted(response.keys()),
            },
        )
        raise RuntimeError("LLM extraction response is missing the candidates list.")

    proposals: list[CandidateProposal] = []
    skipped_non_object = 0
    skipped_unknown_field = 0
    skipped_uncoercible_value = 0
    for item in raw_candidates:
        if not isinstance(item, dict):
            skipped_non_object += 1
            continue
        field_path = str(item.get("field_path", "")).strip()
        field = field_lookup.get(field_path)
        if field is None:
            skipped_unknown_field += 1
            continue

        coerced = coerce_candidate_value(field, item.get("candidate_value"))
        if coerced is None:
            skipped_uncoercible_value += 1
            continue

        proposals.append(
            CandidateProposal(
                field_path=field_path,
                candidate_value=coerced,
                confidence=clamp_confidence(item.get("confidence"), default=0.72),
                rationale=str(item.get("rationale") or "Extracted by litellm."),
                extractor_type="litellm",
                source_quote=(
                    str(item.get("source_quote")).strip()
                    if item.get("source_quote")
                    else None
                ),
            )
        )

    logger.info(
        "extraction.llm_candidates.completed",
        extra={
            **log_context,
            "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            "raw_candidate_count": len(raw_candidates),
            "proposal_count": len(proposals),
            "skipped_non_object": skipped_non_object,
            "skipped_unknown_field": skipped_unknown_field,
            "skipped_uncoercible_value": skipped_uncoercible_value,
        },
    )
    return proposals


async def extract_evidence_text(record: EvidenceRecord) -> str:
    settings = get_settings()
    storage = get_storage_service()
    if record.raw_text:
        if record.source_type == EvidenceSourceType.CHAT_ANSWER:
            metadata = record.evidence_metadata or {}
            related_question = str(metadata.get("related_question") or "").strip()
            related_labels = [
                str(label).strip()
                for label in (metadata.get("related_field_labels") or [])
                if str(label).strip()
            ]
            context_lines: list[str] = []
            if related_question:
                context_lines.append(f"Question asked: {related_question}")
            if related_labels:
                context_lines.append(f"Relevant fields: {', '.join(related_labels)}")
            context_lines.append(f"User answer: {record.raw_text.strip()}")
            contextualized = "\n".join(context_lines).strip()
            logger.info(
                "extraction.evidence.chat_answer.contextualized",
                extra={
                    "case_id": record.case_id,
                    "evidence_id": record.evidence_id,
                    "source_type": record.source_type.value,
                    "raw_chars": len(record.raw_text),
                    "contextualized_chars": len(contextualized),
                },
            )
            return contextualized
        logger.info(
            "extraction.evidence.raw_text.used",
            extra={
                "case_id": record.case_id,
                "evidence_id": record.evidence_id,
                "source_type": record.source_type.value,
                "extracted_chars": len(record.raw_text),
            },
        )
        return record.raw_text
    if record.source_type == EvidenceSourceType.PDF_UPLOAD:
        try:
            payload = await storage.read_bytes(record.storage_uri)
            page_images = render_pdf_pages_to_png(
                payload, max_pages=settings.pdf_ocr_max_pages
            )
            page_fragments: list[str] = []
            for page_index, page_image in enumerate(page_images, start=1):
                page_text = await extract_text_from_image_bytes(
                    page_image,
                    content_type="image/png",
                    context_label=f"PDF page {page_index}",
                )
                if page_text:
                    page_fragments.append(f"[Page {page_index}]\n{page_text}")
            extracted = "\n\n".join(page_fragments)
            logger.info(
                "extraction.evidence.pdf.completed",
                extra={
                    "case_id": record.case_id,
                    "evidence_id": record.evidence_id,
                    "storage_uri": record.storage_uri,
                    "page_count": len(page_images),
                    "extracted_chars": len(extracted),
                },
            )
            return extracted
        except FileNotFoundError:
            logger.warning(
                "extraction.evidence.file_missing",
                extra={
                    "case_id": record.case_id,
                    "evidence_id": record.evidence_id,
                    "source_type": record.source_type.value,
                    "storage_uri": record.storage_uri,
                },
            )
            return ""
    if record.source_type == EvidenceSourceType.IMAGE_UPLOAD:
        try:
            extracted = await extract_text_from_image_bytes(
                await storage.read_bytes(record.storage_uri),
                content_type=(
                    str((record.evidence_metadata or {}).get("content_type"))
                    or "application/octet-stream"
                ),
            )
            logger.info(
                "extraction.evidence.image.completed",
                extra={
                    "case_id": record.case_id,
                    "evidence_id": record.evidence_id,
                    "storage_uri": record.storage_uri,
                    "extracted_chars": len(extracted),
                },
            )
            return extracted
        except FileNotFoundError:
            logger.warning(
                "extraction.evidence.file_missing",
                extra={
                    "case_id": record.case_id,
                    "evidence_id": record.evidence_id,
                    "source_type": record.source_type.value,
                    "storage_uri": record.storage_uri,
                },
            )
            return ""
    logger.warning(
        "extraction.evidence.unsupported_source",
        extra={
            "case_id": record.case_id,
            "evidence_id": record.evidence_id,
            "source_type": record.source_type.value,
        },
    )
    return ""


def serialize_candidate(record: FieldCandidateRecord) -> FieldCandidate:
    return FieldCandidate(
        candidate_id=record.candidate_id,
        case_id=record.case_id,
        field_path=record.field_path,
        candidate_value=record.candidate_value,
        confidence=record.confidence,
        source_evidence_ids=record.source_evidence_ids,
        source_refs=record.source_refs,
        extractor_type=record.extractor_type,
        rationale=record.rationale,
        created_at=record.created_at,
    )


async def run_extraction_job(
    session: AsyncSession,
    *,
    case_id: str,
    job_id: str,
    evidence_ids: list[str] | None = None,
) -> list[FieldCandidate]:
    job_started_at = perf_counter()
    logger.info(
        "extraction.job.started",
        extra={
            "case_id": case_id,
            "job_id": job_id,
            "evidence_filter_count": len(evidence_ids or []),
        },
    )
    job_record = await session.get(JobRecord, job_id)
    if job_record is None:
        logger.warning(
            "extraction.job.job_missing",
            extra={"case_id": case_id, "job_id": job_id},
        )
        return []
    job_record.status = JobStatus.RUNNING
    job_record.error_summary = None
    await session.flush()

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        logger.warning(
            "extraction.job.case_missing",
            extra={"case_id": case_id, "job_id": job_id},
        )
        job_record.status = JobStatus.FAILED
        job_record.error_summary = "Case not found."
        await session.commit()
        return []

    template = await get_template_definition(
        session, case_record.template_id, case_record.template_version
    )
    if template is None:
        logger.warning(
            "extraction.job.template_missing",
            extra={
                "case_id": case_id,
                "job_id": job_id,
                "template_id": case_record.template_id,
                "template_version": case_record.template_version,
            },
        )
        job_record.status = JobStatus.FAILED
        job_record.error_summary = "Template definition is missing for this case."
        await session.commit()
        return []

    query = select(EvidenceRecord).where(EvidenceRecord.case_id == case_id)
    if evidence_ids:
        query = query.where(EvidenceRecord.evidence_id.in_(evidence_ids))
    evidence_records = (await session.execute(query)).scalars().all()
    logger.info(
        "extraction.job.evidence_selected",
        extra={
            "case_id": case_id,
            "job_id": job_id,
            "evidence_count": len(evidence_records),
            "template_id": template.template_id,
            "template_version": template.template_version,
        },
    )

    candidates: list[FieldCandidateRecord] = []
    try:
        for record in evidence_records:
            evidence_started_at = perf_counter()
            text = await extract_evidence_text(record)
            chunks = chunk_text(text)
            record.parsed_payload = {
                **(record.parsed_payload or {}),
                "chunk_count": len(chunks),
                "extracted_text": text,
            }
            logger.info(
                "extraction.evidence.chunked",
                extra={
                    "case_id": case_id,
                    "job_id": job_id,
                    "evidence_id": record.evidence_id,
                    "source_type": record.source_type.value,
                    "extracted_chars": len(text),
                    "chunk_count": len(chunks),
                    "duration_ms": round(
                        (perf_counter() - evidence_started_at) * 1000, 2
                    ),
                },
            )
            for chunk_index, chunk in enumerate(chunks):
                chunk_started_at = perf_counter()
                proposals = await extract_candidates_with_llm(template, chunk)
                logger.info(
                    "extraction.chunk.completed",
                    extra={
                        "case_id": case_id,
                        "job_id": job_id,
                        "evidence_id": record.evidence_id,
                        "chunk_index": chunk_index,
                        "chunk_chars": len(chunk),
                        "proposal_count": len(proposals),
                        "duration_ms": round(
                            (perf_counter() - chunk_started_at) * 1000, 2
                        ),
                    },
                )
                for proposal in proposals:
                    source_ref: dict[str, Any] = {"chunk_index": chunk_index}
                    if proposal.source_quote:
                        source_ref["source_quote"] = proposal.source_quote
                    candidates.append(
                        FieldCandidateRecord(
                            case_id=case_id,
                            field_path=proposal.field_path,
                            candidate_value=proposal.candidate_value,
                            confidence=proposal.confidence,
                            source_evidence_ids=[record.evidence_id],
                            source_refs=[source_ref],
                            extractor_type=proposal.extractor_type,
                            rationale=proposal.rationale,
                        )
                    )
    except RuntimeError as exc:
        logger.exception(
            "extraction.job.failed_runtime",
            extra={"case_id": case_id, "job_id": job_id, "error_summary": str(exc)},
        )
        job_record.status = JobStatus.FAILED
        job_record.error_summary = str(exc)
        await session.commit()
        return []
    except Exception as exc:
        logger.exception(
            "extraction.job.failed_unexpected",
            extra={"case_id": case_id, "job_id": job_id},
        )
        job_record.status = JobStatus.FAILED
        job_record.error_summary = (
            f"Unexpected extraction error: {type(exc).__name__}: {exc}"
        )
        await session.commit()
        return []

    session.add_all(candidates)
    await session.flush()
    await resolve_case_fields(session, case_id)
    job_record.status = JobStatus.COMPLETED
    await session.commit()
    logger.info(
        "extraction.job.completed",
        extra={
            "case_id": case_id,
            "job_id": job_id,
            "candidate_count": len(candidates),
            "duration_ms": round((perf_counter() - job_started_at) * 1000, 2),
        },
    )
    return [serialize_candidate(record) for record in candidates]


async def list_case_candidates(
    session: AsyncSession, case_id: str
) -> list[FieldCandidate]:
    records = (
        (
            await session.execute(
                select(FieldCandidateRecord)
                .where(FieldCandidateRecord.case_id == case_id)
                .order_by(
                    FieldCandidateRecord.field_path, FieldCandidateRecord.created_at
                )
            )
        )
        .scalars()
        .all()
    )
    return [serialize_candidate(record) for record in records]
