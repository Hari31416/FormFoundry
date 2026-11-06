from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import partial
from time import perf_counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseFileRecord, FieldStateRecord
from app.conversation.context import load_conversation_context
from app.core.config import get_settings
from app.documents.models import (
    DocumentAnalysis,
    DocumentCheck,
    DocumentKind,
    StageResult,
)
from app.documents.pipeline import DocumentContext
from app.documents.service import analyze_document
from app.extraction.contracts import FieldCandidate
from app.extraction.models import FieldCandidateRecord
from app.extraction.ocr.adapter import extract_text_from_image_bytes
from app.extraction.parsers.pdf import render_pdf_pages_to_png
from app.extraction.provenance import quote_is_supported
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.jobs.models import JobRecord, JobStatus
from app.llm import generate_json
from app.prompts import render_prompt
from app.resolution.service import resolve_case_fields
from app.storage.s3 import get_storage_service
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

    # Match standard DD-MM-YYYY or DD/MM/YYYY (with 1-2 digits for day/month)
    match = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", raw)
    if match:
        day, month, year = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    # Match YYYY/MM/DD
    match_ymd = re.fullmatch(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", raw)
    if match_ymd:
        year, month, day = match_ymd.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    # Match textual dates like "7 November 2014" or "Nov 7, 2014" or "November 7, 2014"
    months = {
        "jan": 1,
        "january": 1,
        "feb": 2,
        "february": 2,
        "mar": 3,
        "march": 3,
        "apr": 4,
        "april": 4,
        "may": 5,
        "jun": 6,
        "june": 6,
        "jul": 7,
        "july": 7,
        "aug": 8,
        "august": 8,
        "sep": 9,
        "september": 9,
        "oct": 10,
        "october": 10,
        "nov": 11,
        "november": 11,
        "dec": 12,
        "december": 12,
    }

    # Try parsing patterns like: 7 November 2014 or 7th Nov 2014
    text_match1 = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})", raw)
    if text_match1:
        day, mon, year = text_match1.groups()
        mon_lower = mon.lower()
        if mon_lower in months:
            return f"{year}-{months[mon_lower]:02d}-{int(day):02d}"

    # Try parsing patterns like: November 7, 2014 or Nov 7th, 2014
    text_match2 = re.search(
        r"([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})", raw
    )
    if text_match2:
        mon, day, year = text_match2.groups()
        mon_lower = mon.lower()
        if mon_lower in months:
            return f"{year}-{months[mon_lower]:02d}-{int(day):02d}"

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
    if value == "NA":
        return "NA"

    if field.repeated:
        items = []
        if isinstance(value, list):
            items = value
        elif isinstance(value, str):
            val_str = value.strip()
            if val_str.startswith("[") and val_str.endswith("]"):
                try:
                    import json

                    parsed = json.loads(val_str)
                    if isinstance(parsed, list):
                        items = parsed
                    else:
                        items = [parsed]
                except Exception:
                    items = [val_str]
            else:
                items = [item.strip() for item in val_str.split(",") if item.strip()]
        else:
            items = [value]

        coerced_items = []
        for item in items:
            single_field = field.model_copy(update={"repeated": False})
            coerced = coerce_candidate_value(single_field, item)
            if coerced is not None:
                coerced_items.append(coerced)
        return coerced_items if coerced_items else None

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
    if field.type == "document":
        if not isinstance(value, dict) or not isinstance(value.get("_file"), dict):
            return None
        result = coerce_candidate_value(
            field.model_copy(update={"type": "object", "document": None}), value
        )
        return result
    if field.type == "object":
        dict_val = None
        if isinstance(value, dict):
            dict_val = value
        elif isinstance(value, str):
            val_str = value.strip()
            try:
                import json

                parsed = json.loads(val_str)
                if isinstance(parsed, dict):
                    dict_val = parsed
            except Exception:
                pass

        if not isinstance(dict_val, dict):
            return None

        result = {}
        nested_schema = field.nested_schema or []
        for sub_field in nested_schema:
            sub_key = sub_field.path
            leaf_key = sub_key.split(".")[-1]

            sub_val = None
            found_key = None
            for k in [sub_key, leaf_key]:
                if k in dict_val:
                    sub_val = dict_val[k]
                    found_key = k
                    break

            coerced_sub = coerce_candidate_value(sub_field, sub_val)
            result_key = found_key if found_key is not None else leaf_key
            result[result_key] = coerced_sub

        # Preserve other keys
        defined_keys = {sub_field.path for sub_field in nested_schema} | {
            sub_field.path.split(".")[-1] for sub_field in nested_schema
        }
        for k, v in dict_val.items():
            if k not in defined_keys:
                result[k] = v
        return result

    if field.type == "list_of_objects":
        list_val = None
        if isinstance(value, list):
            list_val = value
        elif isinstance(value, str):
            val_str = value.strip()
            try:
                import json

                parsed = json.loads(val_str)
                if isinstance(parsed, list):
                    list_val = parsed
            except Exception:
                pass

        if not isinstance(list_val, list):
            return None

        coerced_list = []
        object_helper_field = field.model_copy(
            update={"type": "object", "repeated": False}
        )
        for item in list_val:
            coerced_item = coerce_candidate_value(object_helper_field, item)
            if coerced_item is not None:
                coerced_list.append(coerced_item)
        return coerced_list

    return value


def format_field_catalog_item(field: TemplateField, indent: int = 0) -> str:
    indent_str = "  " * indent
    required = "required" if field.required else "optional"
    repeated = " (repeated list)" if field.repeated else ""
    enum_options = (
        f" Allowed values: {', '.join(field.enum_options)}."
        if field.enum_options
        else ""
    )
    help_text = f" Help: {field.help_text}." if field.help_text else ""

    desc = f"{field.label} ({field.type}{repeated}, {required})"
    line = f"{indent_str}- {field.path}: {desc}.{enum_options}{help_text}"

    nested_schema = field.nested_schema or []
    if field.type in ("object", "list_of_objects") and nested_schema:
        sub_lines = [line]
        sub_lines.append(f"{indent_str}  Properties structure for {field.path}:")
        for sub_field in nested_schema:
            sub_lines.append(format_field_catalog_item(sub_field, indent + 2))
        return "\n".join(sub_lines)

    if field.document_source:
        source = field.document_source
        line += (
            f" Document source: {source.country}/{source.document_type}/{source.field}."
        )
    return line


def format_field_catalog(template: TemplateDefinition) -> str:
    lines: list[str] = []
    for field in template.template_schema:
        lines.append(format_field_catalog_item(field))
    return "\n".join(lines)


async def extract_candidates_with_llm(
    template: TemplateDefinition,
    text: str,
    conversation_context: str = "[]",
    *,
    evidence_text: str | None = None,
) -> list[CandidateProposal]:
    template = template.model_copy(
        update={
            "template_schema": [
                field for field in template.template_schema if field.type != "document"
            ]
        }
    )
    if not template.template_schema:
        return []
    started_at = perf_counter()
    field_lookup = {field.path: field for field in template.template_schema}
    log_context = {
        "template_id": template.template_id,
        "template_version": template.template_version,
        "field_count": len(template.template_schema),
        "source_text_chars": len(text),
    }
    logger.info("extraction.llm_candidates.started", extra=log_context)
    system_prompt = render_prompt("extraction_system.jinja2")
    user_prompt = render_prompt(
        "extraction_user.jinja2",
        template_name=template.name,
        field_catalog=format_field_catalog(template),
        source_text=text,
        conversation_context=conversation_context,
    )
    response = await generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
    if response is not None and not isinstance(response.get("candidates"), list):
        logger.warning("extraction.llm_candidates.retry_schema", extra=log_context)
        response = await generate_json(
            system_prompt=system_prompt
            + "\n"
            + render_prompt("extraction_retry.jinja2"),
            user_prompt=user_prompt,
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
    skipped_unsupported_quote = 0

    # Group candidate entries by their corresponding top-level template field path
    grouped_candidates: dict[str, list[dict]] = (
        {}
    )  # top_level_path -> list of candidate entries

    for item in raw_candidates:
        if not isinstance(item, dict):
            skipped_non_object += 1
            continue
        if evidence_text is not None and not quote_is_supported(
            item.get("source_quote"), evidence_text
        ):
            skipped_unsupported_quote += 1
            continue
        field_path = str(item.get("field_path", "")).strip()
        # Normalize bracket notation (e.g., path[idx].sub -> path.idx.sub)
        field_path = field_path.replace("[", ".").replace("]", "")

        # Check if direct match
        if field_path in field_lookup:
            grouped_candidates.setdefault(field_path, []).append(
                {"type": "direct", "item": item}
            )
            continue

        # Check if nested prefix match
        # Try to find the longest matching prefix in field_lookup
        #  that is of type object/list_of_objects
        parts = field_path.split(".")
        matched = False
        for i in range(len(parts) - 1, 0, -1):
            prefix = ".".join(parts[:i])
            if prefix in field_lookup:
                parent_field = field_lookup[prefix]
                if parent_field.type in ("object", "list_of_objects"):
                    sub_path = ".".join(parts[i:])
                    grouped_candidates.setdefault(prefix, []).append(
                        {"type": "nested", "sub_path": sub_path, "item": item}
                    )
                    matched = True
                    break
        if not matched:
            skipped_unknown_field += 1

    # Process grouped candidate entries for each top-level template field
    for top_path, entries in grouped_candidates.items():
        field = field_lookup[top_path]

        # Determine merged candidate value
        merged_value = None
        if field.type == "object":
            merged_dict = {}
            direct_items = [e for e in entries if e["type"] == "direct"]
            for g in direct_items:
                val = g["item"].get("candidate_value")
                if isinstance(val, dict):
                    merged_dict.update(val)
                elif isinstance(val, str):
                    try:
                        import json

                        parsed = json.loads(val)
                        if isinstance(parsed, dict):
                            merged_dict.update(parsed)
                    except Exception:
                        pass
            nested_items = [e for e in entries if e["type"] == "nested"]
            for g in nested_items:
                sub_path = g["sub_path"]
                val = g["item"].get("candidate_value")
                sub_parts = sub_path.split(".")
                curr = merged_dict
                for part in sub_parts[:-1]:
                    curr = curr.setdefault(part, {})
                curr[sub_parts[-1]] = val
            if merged_dict:
                merged_value = merged_dict

        elif field.type == "list_of_objects":
            merged_list = []
            direct_items = [e for e in entries if e["type"] == "direct"]
            for g in direct_items:
                val = g["item"].get("candidate_value")
                if isinstance(val, list):
                    merged_list.extend(val)
                elif isinstance(val, str):
                    try:
                        import json

                        parsed = json.loads(val)
                        if isinstance(parsed, list):
                            merged_list.extend(parsed)
                    except Exception:
                        pass
            nested_items = [e for e in entries if e["type"] == "nested"]
            list_objects_by_index = {}
            indexless_objects = []
            for g in nested_items:
                sub_path = g["sub_path"]
                val = g["item"].get("candidate_value")
                match = re.match(r"^\[?(\d+)\]?\.?(.*)$", sub_path)
                if match:
                    idx_str, remaining_path = match.groups()
                    idx = int(idx_str)
                    if not remaining_path:
                        if isinstance(val, dict):
                            list_objects_by_index.setdefault(idx, {}).update(val)
                    else:
                        sub_parts = remaining_path.split(".")
                        curr = list_objects_by_index.setdefault(idx, {})
                        for part in sub_parts[:-1]:
                            curr = curr.setdefault(part, {})
                        curr[sub_parts[-1]] = val
                else:
                    sub_parts = sub_path.split(".")
                    if not indexless_objects:
                        indexless_objects.append({})
                    curr = indexless_objects[0]
                    for part in sub_parts[:-1]:
                        curr = curr.setdefault(part, {})
                    curr[sub_parts[-1]] = val
            sorted_indices = sorted(list_objects_by_index.keys())
            indexed_list = [list_objects_by_index[idx] for idx in sorted_indices]
            merged_list.extend(indexed_list)
            merged_list.extend(indexless_objects)
            if merged_list:
                merged_value = merged_list

        else:
            # Simple field
            direct_items = [e for e in entries if e["type"] == "direct"]
            if direct_items:
                merged_value = direct_items[0]["item"].get("candidate_value")

        if merged_value is None:
            continue

        coerced = coerce_candidate_value(field, merged_value)
        if coerced is None:
            skipped_uncoercible_value += 1
            continue

        # Combine rationales, quotes, and confidences from contributing items
        rationales = []
        quotes = []
        confidences = []
        for e in entries:
            item = e["item"]
            rat = item.get("rationale")
            if rat:
                rationales.append(str(rat))
            q = item.get("source_quote")
            if q:
                quotes.append(str(q))
            conf = item.get("confidence")
            if conf is not None:
                confidences.append(clamp_confidence(conf, default=0.72))

        rationale = (
            " | ".join(dict.fromkeys(rationales))
            if rationales
            else "Extracted by litellm."
        )
        source_quote = " | ".join(dict.fromkeys(quotes)) if quotes else None
        confidence = sum(confidences) / len(confidences) if confidences else 0.72

        proposals.append(
            CandidateProposal(
                field_path=top_path,
                candidate_value=coerced,
                confidence=confidence,
                rationale=rationale,
                extractor_type="litellm",
                source_quote=source_quote,
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
            "skipped_unsupported_quote": skipped_unsupported_quote,
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
                    "source_type": str(record.source_type),
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
                "source_type": str(record.source_type),
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
                    "source_type": str(record.source_type),
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
                    "source_type": str(record.source_type),
                    "storage_uri": record.storage_uri,
                },
            )
            return ""
    logger.warning(
        "extraction.evidence.unsupported_source",
        extra={
            "case_id": record.case_id,
            "evidence_id": record.evidence_id,
            "source_type": str(record.source_type),
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

    conversation_context = await load_conversation_context(session, case_id)
    candidates: list[FieldCandidateRecord] = []
    try:
        for record in evidence_records:
            evidence_started_at = perf_counter()
            try:
                text = await extract_evidence_text(record)
            except Exception:
                if record.source_type in {
                    EvidenceSourceType.PDF_UPLOAD,
                    EvidenceSourceType.IMAGE_UPLOAD,
                }:
                    declared_payload = (record.evidence_metadata or {}).get(
                        "declared_document"
                    )
                    failed_analysis = DocumentAnalysis(
                        declared=(
                            DocumentKind.model_validate(declared_payload)
                            if declared_payload
                            else None
                        ),
                        status="error",
                        stages=[
                            StageResult(
                                stage="ocr_text",
                                version="1",
                                status="error",
                                error_code="ocr_failed",
                            )
                        ],
                        checks=[
                            DocumentCheck(
                                code="authenticity_not_checked",
                                scope="authenticity",
                                outcome="skipped",
                            )
                        ],
                    )
                    record.parsed_payload = {
                        **(record.parsed_payload or {}),
                        "document_analysis": failed_analysis.model_dump(mode="json"),
                    }
                raise
            document_analysis = None
            if record.source_type in {
                EvidenceSourceType.PDF_UPLOAD,
                EvidenceSourceType.IMAGE_UPLOAD,
            }:
                metadata = record.evidence_metadata or {}
                declared_payload = metadata.get("declared_document")
                storage = get_storage_service()

                document_analysis = await analyze_document(
                    DocumentContext(
                        evidence_id=record.evidence_id,
                        text=text,
                        declared=(
                            DocumentKind.model_validate(declared_payload)
                            if declared_payload
                            else None
                        ),
                        content_type=str(
                            metadata.get("content_type", "application/octet-stream")
                        ),
                        load_bytes=partial(storage.read_bytes, record.storage_uri),
                        max_pages=get_settings().pdf_ocr_max_pages,
                    )
                )
                record.parsed_payload = {
                    **(record.parsed_payload or {}),
                    "document_analysis": document_analysis.model_dump(mode="json"),
                }
            # A chat answer is one unit; history must not multiply extraction calls.
            chunks = (
                [text]
                if record.source_type == EvidenceSourceType.CHAT_ANSWER
                else chunk_text(text)
            )
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
                    "source_type": str(record.source_type),
                    "extracted_chars": len(text),
                    "chunk_count": len(chunks),
                    "duration_ms": round(
                        (perf_counter() - evidence_started_at) * 1000, 2
                    ),
                },
            )
            if (
                document_analysis
                and document_analysis.detected
                and document_analysis.status in {"matched", "detected", "needs_review"}
            ):
                for field in template.template_schema:
                    configuration = field.document
                    if field.type != "document" or configuration is None:
                        continue
                    kind = document_analysis.detected
                    if (
                        configuration.country != kind.country
                        or configuration.document_type != kind.document_type
                    ):
                        continue
                    document_value: dict[str, Any] = {
                        "_file": {
                            "evidence_id": record.evidence_id,
                            "filename": (record.parsed_payload or {}).get(
                                "filename", record.source_subtype
                            ),
                        }
                    }
                    refs: list[dict[str, Any]] = [
                        {
                            "analysis_id": document_analysis.analysis_id,
                            "evidence_id": record.evidence_id,
                        }
                    ]
                    for mapping in configuration.extractions:
                        extracted = document_analysis.fields.get(mapping.field)
                        invalid = any(
                            check.field == mapping.field
                            and check.outcome in {"fail", "error"}
                            for check in document_analysis.checks
                        )
                        if extracted and not invalid:
                            target = next(
                                item
                                for item in field.nested_schema or []
                                if item.path == mapping.key
                            )
                            document_value[mapping.key] = coerce_candidate_value(
                                target, extracted.value
                            )
                            refs.append(
                                {
                                    "source_quote": extracted.source_quote,
                                    "document_field": mapping.field,
                                    "dictionary_key": mapping.key,
                                }
                            )
                        else:
                            document_value[mapping.key] = None
                    await session.execute(
                        delete(FieldCandidateRecord).where(
                            FieldCandidateRecord.case_id == case_id,
                            FieldCandidateRecord.field_path == field.path,
                            FieldCandidateRecord.extractor_type == "document_upload",
                        )
                    )
                    state = await session.scalar(
                        select(FieldStateRecord).where(
                            FieldStateRecord.case_id == case_id,
                            FieldStateRecord.field_path == field.path,
                        )
                    )
                    if (
                        state
                        and isinstance(state.resolved_value, dict)
                        and (state.resolved_value.get("_file") or {}).get("evidence_id")
                        != record.evidence_id
                    ):
                        state.status = "missing"
                        state.resolved_value = None
                        state.source_evidence_ids = []
                    candidates.append(
                        FieldCandidateRecord(
                            case_id=case_id,
                            field_path=field.path,
                            candidate_value=document_value,
                            confidence=document_analysis.classification_confidence
                            or 0.8,
                            source_evidence_ids=[record.evidence_id],
                            source_refs=refs,
                            extractor_type="document_upload",
                            rationale="Uploaded document with configured extraction dictionary.",
                        )
                    )
            # Declared document mismatches and incomplete analyses remain reviewable,
            # but must not silently populate the case as the claimed document.
            if (
                document_analysis
                and document_analysis.declared
                and document_analysis.status != "matched"
            ):
                continue
            extraction_template = template
            if document_analysis:
                # Bind only grounded fields from the detected document. Exclude all
                # bound paths from free-form upload extraction, including other types.
                if document_analysis.status in {"matched", "detected"}:
                    for field in template.template_schema:
                        source = field.document_source
                        detected = document_analysis.detected
                        if (
                            source is None
                            or detected is None
                            or source.country != detected.country
                            or source.document_type != detected.document_type
                        ):
                            continue
                        extracted_field = document_analysis.fields.get(source.field)
                        if extracted_field is None:
                            continue
                        raw_value = extracted_field.value
                        if (
                            source.document_type == "pan"
                            and source.field == "document_number"
                        ):
                            raw_value = re.sub(r"[\s-]", "", raw_value).upper()
                        value = coerce_candidate_value(field, raw_value)
                        if value is None:
                            continue
                        candidates.append(
                            FieldCandidateRecord(
                                case_id=case_id,
                                field_path=field.path,
                                candidate_value=value,
                                confidence=extracted_field.confidence,
                                source_evidence_ids=[record.evidence_id],
                                source_refs=[
                                    {
                                        "source_quote": extracted_field.source_quote,
                                        "document_source": source.model_dump(),
                                        "analysis_id": document_analysis.analysis_id,
                                    }
                                ],
                                extractor_type="document_field",
                                rationale="Mapped a grounded field from its document type.",
                            )
                        )
                extraction_template = template.model_copy(
                    update={
                        "template_schema": [
                            field
                            for field in template.template_schema
                            if field.document_source is None
                            and field.type != "document"
                            and field.allow_document_extraction
                        ]
                    }
                )
                if not extraction_template.template_schema:
                    continue
            for chunk_index, chunk in enumerate(chunks):
                chunk_started_at = perf_counter()
                proposals = await extract_candidates_with_llm(
                    extraction_template,
                    chunk,
                    conversation_context,
                    evidence_text=(
                        record.raw_text or ""
                        if record.source_type == EvidenceSourceType.CHAT_ANSWER
                        else None
                    ),
                )
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
        if candidates:
            session.add_all(candidates)
            await session.flush()
            await resolve_case_fields(session, case_id)
        job_record.status = JobStatus.FAILED
        job_record.error_summary = str(exc)
        await session.commit()
        return []
    except Exception as exc:
        logger.exception(
            "extraction.job.failed_unexpected",
            extra={"case_id": case_id, "job_id": job_id},
        )
        if candidates:
            session.add_all(candidates)
            await session.flush()
            await resolve_case_fields(session, case_id)
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
