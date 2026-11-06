"""Upload questions derived from active document bindings, before field questions."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseDetail
from app.conversation.models import NextQuestionPayload
from app.documents.models import DocumentKind
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.templates.models import TemplateField
from app.templates.runtime import is_field_active


async def choose_document_upload_question(
    session: AsyncSession, detail: CaseDetail
) -> NextQuestionPayload | None:
    required_sources: dict[tuple[str, str], list[TemplateField]] = {}
    for field in detail.template.template_schema:
        source = field.document_source
        if (
            source
            and field.required
            and is_field_active(field, detail.current_schema_state)
        ):
            required_sources.setdefault(
                (source.country, source.document_type), []
            ).append(field)
    if not required_sources:
        return None
    records = (
        (
            await session.execute(
                select(EvidenceRecord).where(
                    EvidenceRecord.case_id == detail.case_id,
                    EvidenceRecord.source_type.in_(
                        [EvidenceSourceType.PDF_UPLOAD, EvidenceSourceType.IMAGE_UPLOAD]
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    accepted: set[tuple[str, str]] = set()
    for record in records:
        analysis = (record.parsed_payload or {}).get("document_analysis") or {}
        detected = analysis.get("detected")
        if detected and analysis.get("status") in {
            "matched",
            "detected",
            "needs_review",
        }:
            accepted.add((detected["country"], detected["document_type"]))
    pending = [key for key in required_sources if key not in accepted]
    if not pending:
        return None
    labels = {"aadhaar": "Aadhaar", "pan": "PAN", "driving_licence": "driving licence"}
    names = [labels.get(kind, kind.replace("_", " ")) for _, kind in pending]
    fields = [field for key in pending for field in required_sources[key]]
    return NextQuestionPayload(
        kind="document_upload",
        documents=[
            DocumentKind(country=country, document_type=kind)
            for country, kind in pending
        ],
        field_path=fields[0].path,
        field_paths=[field.path for field in fields],
        field_labels=[field.label for field in fields],
        question=(
            f"Please upload your {' and '.join(names)} using the document upload controls below. "
            "Include all relevant sides or pages. I will extract the information, "
            "then ask for any missing details."
        ),
        reason="Upload source documents before asking for their individual fields.",
        priority=0,
    )
