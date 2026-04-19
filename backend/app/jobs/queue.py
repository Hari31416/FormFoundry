from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.models import JobPayload, JobRecord, JobStatus


def serialize_job(record: JobRecord) -> JobPayload:
    return JobPayload(
        job_id=record.job_id,
        case_id=record.case_id,
        job_type=record.job_type,
        status=JobStatus(record.status),
        triggering_event=record.triggering_event,
        error_summary=record.error_summary,
        metadata=record.job_metadata,
        started_at=record.started_at,
        finished_at=record.finished_at,
        created_at=record.created_at,
    )


async def enqueue_job(
    session: AsyncSession,
    *,
    case_id: str,
    job_type: str,
    triggering_event: str,
    metadata: dict[str, str] | None = None,
) -> JobPayload:
    record = JobRecord(
        case_id=case_id,
        job_type=job_type,
        status=JobStatus.QUEUED,
        triggering_event=triggering_event,
        job_metadata=metadata or {},
    )
    session.add(record)
    await session.flush()
    return serialize_job(record)


async def list_case_jobs(session: AsyncSession, case_id: str) -> list[JobPayload]:
    records = (
        (await session.execute(select(JobRecord).where(JobRecord.case_id == case_id)))
        .scalars()
        .all()
    )
    return [serialize_job(record) for record in records]


async def get_job_payload(session: AsyncSession, job_id: str) -> JobPayload | None:
    record = await session.get(JobRecord, job_id)
    if record is None:
        return None
    return serialize_job(record)
