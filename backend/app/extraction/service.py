from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord
from app.core.config import get_settings
from app.extraction.contracts import FieldCandidate
from app.extraction.models import FieldCandidateRecord
from app.extraction.ocr.adapter import extract_text_from_image_bytes
from app.extraction.parsers.pdf import extract_text_from_pdf_bytes
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.jobs.models import JobRecord, JobStatus
from app.llm import generate_json
from app.resolution.service import resolve_case_fields
from app.templates.models import TemplateDefinition, TemplateField
from app.templates.service import get_template_definition


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
    field_lookup = {field.path: field for field in template.template_schema}
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
        raise RuntimeError("LLM extraction did not return a valid response.")

    raw_candidates = response.get("candidates")
    if not isinstance(raw_candidates, list):
        raise RuntimeError("LLM extraction response is missing the candidates list.")

    proposals: list[CandidateProposal] = []
    for item in raw_candidates:
        if not isinstance(item, dict):
            continue
        field_path = str(item.get("field_path", "")).strip()
        field = field_lookup.get(field_path)
        if field is None:
            continue

        coerced = coerce_candidate_value(field, item.get("candidate_value"))
        if coerced is None:
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
    return proposals


async def extract_evidence_text(record: EvidenceRecord) -> str:
    settings = get_settings()
    if record.raw_text:
        return record.raw_text
    if record.source_type == EvidenceSourceType.PDF_UPLOAD:
        file_path = record.storage_uri.replace("local://", "")
        target = settings.local_storage_path / file_path
        if target.exists():
            return extract_text_from_pdf_bytes(target.read_bytes())
        return ""
    if record.source_type == EvidenceSourceType.IMAGE_UPLOAD:
        file_path = record.storage_uri.replace("local://", "")
        target = settings.local_storage_path / file_path
        if target.exists():
            return extract_text_from_image_bytes(target.read_bytes())
        return ""
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
    job_record = await session.get(JobRecord, job_id)
    if job_record is None:
        return []
    job_record.status = JobStatus.RUNNING
    job_record.error_summary = None
    await session.flush()

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        job_record.status = JobStatus.FAILED
        job_record.error_summary = "Case not found."
        await session.commit()
        return []

    template = await get_template_definition(
        session, case_record.template_id, case_record.template_version
    )
    if template is None:
        job_record.status = JobStatus.FAILED
        job_record.error_summary = "Template definition is missing for this case."
        await session.commit()
        return []

    query = select(EvidenceRecord).where(EvidenceRecord.case_id == case_id)
    if evidence_ids:
        query = query.where(EvidenceRecord.evidence_id.in_(evidence_ids))
    evidence_records = (await session.execute(query)).scalars().all()

    candidates: list[FieldCandidateRecord] = []
    try:
        for record in evidence_records:
            text = await extract_evidence_text(record)
            chunks = chunk_text(text)
            record.parsed_payload = {
                **record.parsed_payload,
                "chunk_count": len(chunks),
                "extracted_text": text,
            }
            for chunk_index, chunk in enumerate(chunks):
                proposals = await extract_candidates_with_llm(template, chunk)
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
        job_record.status = JobStatus.FAILED
        job_record.error_summary = str(exc)
        await session.commit()
        return []

    session.add_all(candidates)
    await session.flush()
    await resolve_case_fields(session, case_id)
    job_record.status = JobStatus.COMPLETED
    await session.commit()
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
