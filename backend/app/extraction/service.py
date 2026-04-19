from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.extraction.contracts import FieldCandidate
from app.extraction.models import FieldCandidateRecord
from app.extraction.ocr.adapter import extract_text_from_image_bytes
from app.extraction.parsers.pdf import extract_text_from_pdf_bytes
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.jobs.models import JobRecord, JobStatus
from app.resolution.service import resolve_case_fields


@dataclass(slots=True)
class CandidateProposal:
    field_path: str
    candidate_value: Any
    confidence: float
    rationale: str
    extractor_type: str = "heuristic_llm"


def chunk_text(text: str, *, max_chars: int = 400) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []
    return [
        normalized[index : index + max_chars]
        for index in range(0, len(normalized), max_chars)
    ]


def build_candidates_from_text(text: str) -> list[CandidateProposal]:
    lowered = text.lower()
    proposals: list[CandidateProposal] = []

    name_match = re.search(
        r"(?:applicant name is|name is)\s+([a-zA-Z]+ [a-zA-Z]+)", text, re.I
    )
    if name_match:
        proposals.append(
            CandidateProposal(
                field_path="applicant.full_name",
                candidate_value=name_match.group(1).strip(),
                confidence=0.92,
                rationale="Matched an explicit applicant name phrase.",
            )
        )

    dob_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if dob_match:
        proposals.append(
            CandidateProposal(
                field_path="applicant.date_of_birth",
                candidate_value=dob_match.group(1),
                confidence=0.89,
                rationale="Detected an ISO-formatted date.",
            )
        )

    phone_match = re.search(r"(\+?[0-9][0-9()\- ]{7,})", text)
    if phone_match:
        proposals.append(
            CandidateProposal(
                field_path="applicant.phone",
                candidate_value=phone_match.group(1).strip(),
                confidence=0.84,
                rationale="Detected a phone-like number sequence.",
            )
        )

    email_match = re.search(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", text, re.I)
    if email_match:
        proposals.append(
            CandidateProposal(
                field_path="applicant.email",
                candidate_value=email_match.group(1),
                confidence=0.91,
                rationale="Detected an email address.",
            )
        )

    address_match = re.search(
        r"address is\s+(.+?),\s*([A-Za-z ]+),\s*([A-Z]{2})\s+(\d{5})", text, re.I
    )
    if address_match:
        proposals.extend(
            [
                CandidateProposal(
                    field_path="applicant.address.street",
                    candidate_value=address_match.group(1).strip(),
                    confidence=0.82,
                    rationale="Parsed street component from address phrase.",
                ),
                CandidateProposal(
                    field_path="applicant.address.city",
                    candidate_value=address_match.group(2).strip(),
                    confidence=0.8,
                    rationale="Parsed city component from address phrase.",
                ),
                CandidateProposal(
                    field_path="applicant.address.state",
                    candidate_value=address_match.group(3).strip().upper(),
                    confidence=0.87,
                    rationale="Parsed state abbreviation from address phrase.",
                ),
                CandidateProposal(
                    field_path="applicant.address.postal_code",
                    candidate_value=address_match.group(4),
                    confidence=0.9,
                    rationale="Parsed postal code from address phrase.",
                ),
            ]
        )

    dependents_match = re.search(r"(\d+)\s+dependents?", lowered)
    if dependents_match:
        count = int(dependents_match.group(1))
        proposals.extend(
            [
                CandidateProposal(
                    field_path="applicant.dependents_count",
                    candidate_value=count,
                    confidence=0.88,
                    rationale="Detected a dependents count reference.",
                ),
                CandidateProposal(
                    field_path="applicant.has_dependents",
                    candidate_value=count > 0,
                    confidence=0.86,
                    rationale="Inferred dependents presence from dependents count.",
                ),
            ]
        )

    if "currently employed" in lowered or "is employed" in lowered:
        proposals.append(
            CandidateProposal(
                field_path="employment.currently_employed",
                candidate_value=True,
                confidence=0.8,
                rationale="Detected an employed phrase.",
            )
        )
    if "not employed" in lowered or "unemployed" in lowered:
        proposals.append(
            CandidateProposal(
                field_path="employment.currently_employed",
                candidate_value=False,
                confidence=0.8,
                rationale="Detected an unemployed phrase.",
            )
        )

    employer_match = re.search(r"employer is\s+([A-Za-z0-9 &.-]+)", text, re.I)
    if employer_match:
        proposals.append(
            CandidateProposal(
                field_path="employment.employer_name",
                candidate_value=employer_match.group(1).strip(),
                confidence=0.78,
                rationale="Matched an explicit employer phrase.",
            )
        )

    income_match = re.search(
        r"(?:monthly income is|\$)\s*([0-9]+(?:\.[0-9]{2})?)", lowered
    )
    if income_match:
        proposals.append(
            CandidateProposal(
                field_path="employment.monthly_income",
                candidate_value=float(income_match.group(1)),
                confidence=0.86,
                rationale="Detected a monthly income amount.",
            )
        )

    for program in ["housing assistance", "food support", "utility relief"]:
        if program in lowered:
            proposals.append(
                CandidateProposal(
                    field_path="benefits.requested_program",
                    candidate_value=program.replace(" ", "_"),
                    confidence=0.93,
                    rationale="Matched a supported benefits program phrase.",
                )
            )
            break

    if "prior application" in lowered:
        proposals.append(
            CandidateProposal(
                field_path="benefits.has_prior_application",
                candidate_value=True,
                confidence=0.77,
                rationale="Detected a prior application mention.",
            )
        )

    prior_id_match = re.search(r"application id\s+([A-Z0-9-]+)", text, re.I)
    if prior_id_match:
        proposals.extend(
            [
                CandidateProposal(
                    field_path="benefits.prior_application_id",
                    candidate_value=prior_id_match.group(1),
                    confidence=0.88,
                    rationale="Matched a prior application identifier.",
                ),
                CandidateProposal(
                    field_path="benefits.has_prior_application",
                    candidate_value=True,
                    confidence=0.83,
                    rationale="Inferred prior application presence from application ID.",
                ),
            ]
        )

    ssn_match = re.search(r"ssn(?: last four)?(?: is)?\s*(\d{4})", lowered)
    if ssn_match:
        proposals.append(
            CandidateProposal(
                field_path="identity.ssn_last4",
                candidate_value=ssn_match.group(1),
                confidence=0.94,
                rationale="Detected an SSN last-four pattern.",
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
    await session.flush()

    query = select(EvidenceRecord).where(EvidenceRecord.case_id == case_id)
    if evidence_ids:
        query = query.where(EvidenceRecord.evidence_id.in_(evidence_ids))
    evidence_records = (await session.execute(query)).scalars().all()

    candidates: list[FieldCandidateRecord] = []
    for record in evidence_records:
        text = await extract_evidence_text(record)
        chunks = chunk_text(text)
        record.parsed_payload = {
            **record.parsed_payload,
            "chunk_count": len(chunks),
            "extracted_text": text,
        }
        for chunk_index, chunk in enumerate(chunks):
            for proposal in build_candidates_from_text(chunk):
                candidates.append(
                    FieldCandidateRecord(
                        case_id=case_id,
                        field_path=proposal.field_path,
                        candidate_value=proposal.candidate_value,
                        confidence=proposal.confidence,
                        source_evidence_ids=[record.evidence_id],
                        source_refs=[{"chunk_index": chunk_index}],
                        extractor_type=proposal.extractor_type,
                        rationale=proposal.rationale,
                    )
                )

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
