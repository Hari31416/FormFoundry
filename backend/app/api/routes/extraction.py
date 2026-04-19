from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db_session
from app.extraction.contracts import FieldCandidate
from app.extraction.service import list_case_candidates, run_extraction_job
from app.intake.service import ensure_case_exists
from app.jobs.models import JobPayload
from app.jobs.queue import enqueue_job, get_job_payload, list_case_jobs

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.post(
    "/cases/{case_id}/extract",
    response_model=JobPayload,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_case_extraction_route(case_id: str, session: DBSession) -> JobPayload:
    await ensure_case_exists(session, case_id)
    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="extract_case_evidence",
        triggering_event="manual.extract.requested",
    )
    await run_extraction_job(session, case_id=case_id, job_id=job.job_id)
    await session.commit()
    return (await get_job_payload(session, job.job_id)) or job


@router.get("/cases/{case_id}/jobs", response_model=list[JobPayload])
async def list_case_jobs_route(case_id: str, session: DBSession) -> list[JobPayload]:
    await ensure_case_exists(session, case_id)
    return await list_case_jobs(session, case_id)


@router.get("/cases/{case_id}/candidates", response_model=list[FieldCandidate])
async def list_case_candidates_route(
    case_id: str, session: DBSession
) -> list[FieldCandidate]:
    await ensure_case_exists(session, case_id)
    return await list_case_candidates(session, case_id)
